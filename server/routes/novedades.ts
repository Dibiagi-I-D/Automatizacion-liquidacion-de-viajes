import { Router, Request, Response } from 'express'
import axios from 'axios'
import sqlServerService from '../services/sqlServerService.js'

const router = Router()

/**
 * ════════════════════════════════════════════════════════════════════
 * NOVEDADES — Órdenes de Trabajo (USR_ORTRAH, base DIBIAG)
 * ════════════════════════════════════════════════════════════════════
 *
 * ⚠️ DIBIAG es la base PRODUCTIVA de Softland. La única escritura autorizada en
 * este router es el alta de una OT (POST /), acotada a insertar UNA fila en
 * USR_ORTRAH y UNA en USR_ORTRAI, en la misma transacción. No hay UPDATE ni
 * DELETE, y no se toca ninguna otra tabla.
 *
 * POR QUÉ TAMBIÉN LA LÍNEA
 * En Softland una orden son dos cosas: la cabecera (USR_ORTRAH) y la tarea
 * (USR_ORTRAI). La tarea la genera sola la regla GRTQVE del contexto IDORTR,
 * pero esa regla corre en la PANTALLA del ERP, no en la base: insertando
 * directo, la orden quedaba sin tarea y el sector no la veía. Pasó con las
 * OT 26187 y 26188, que estuvieron un día así hasta que alguien las abrió en
 * Softland. Por eso acá se replica lo que hace la regla.
 *
 * Las OT que origina un chofer se reconocen por USR_ORTRAH_SECTOR = 26, que en
 * USR_ORTRSE es el sector "CHOFER". Para la app siempre es el mismo, así que no
 * se le pregunta al chofer.
 */
const SECTOR_SOLICITA_CHOFER = 26

/**
 * Sector y destino de la tarea. La regla GRTQVE los fija así cuando la orden
 * es sobre una unidad, que es siempre el caso de una novedad de chofer:
 * sector 17 de USR_ORTRSE, destino "INTERNO".
 */
const SECTOR_DESTINO_TAREA = 17
const DESTINO_TAREA = 'INTERNO'

/**
 * Observación de la tarea. Es el texto que administración le puso a mano a las
 * dos primeras órdenes de la app (26187 y 26188), y describe bien el caso: el
 * chofer reporta la novedad desde la ruta, no desde el taller.
 */
const OBSERVACION_TAREA = 'En Viaje'

/**
 * Interruptor de emergencia. Si algo saliera mal con la línea en producción,
 * se pone NOVEDADES_CREAR_TAREA=false y la app vuelve a crear solo la
 * cabecera, sin redeployar. La orden queda como antes: incompleta pero viva.
 */
const CREAR_TAREA = process.env.NOVEDADES_CREAR_TAREA !== 'false'

/** Usuario con el que la app figura en Softland, para distinguir estas altas. */
const USUARIO_APP = 'APPCHOF'

/**
 * USR_TRASEM_TIPVEH → palabra completa.
 *
 * Los textos salen de los valores reales de USR_ORTRAH_DESCUN (en mayúsculas,
 * y "OTROS" en plural), no de una traducción propia: así lo que muestra la app
 * coincide con lo que ya está cargado en Softland.
 */
const TIPOS_UNIDAD: Record<string, string> = {
  A: 'AUTO',
  C: 'CAMIONETA',
  E: 'AUTOELEVADOR',
  O: 'OTROS',
  S: 'SEMI',
  T: 'TRACTOR',
}

const txt = (v: any): string => (v === null || v === undefined ? '' : String(v).trim())

/** Respuesta uniforme ante caída de SQL Server, igual que el resto de la app. */
function errorSql(res: Response, error: any, accion: string) {
  console.error(`[Novedades] Error al ${accion}:`, error?.message || error)

  if (['ESOCKET', 'ETIMEOUT', 'ELOGIN', 'ECONNCLOSED'].includes(error?.code)) {
    return res.status(503).json({
      success: false,
      sqlError: true,
      error: `No hay conexión con la base de datos. No se pudo ${accion}.`,
    })
  }

  return res.status(500).json({ success: false, error: `Error al ${accion}`, message: error?.message })
}

/**
 * GET /api/novedades/sectores
 * Sectores involucrados para el desplegable, con su responsable ya resuelto.
 *
 * Se devuelven juntos a propósito: el responsable se deriva del sector y no lo
 * elige el chofer, así que una sola consulta evita un segundo viaje desde el
 * celular cada vez que toca el desplegable.
 */
router.get('/sectores', async (_req: Request, res: Response) => {
  try {
    const filas = await sqlServerService.query(`
      SELECT DISTINCT
        LTRIM(RTRIM(o.USR_ORTRAH_SECINV)) AS Sector,
        LTRIM(RTRIM(ISNULL(s.USR_SECINV_RESPON, ''))) AS Responsable
      FROM USR_ORTRAH o
      LEFT JOIN USR_SECINV s
        ON LTRIM(RTRIM(s.USR_SECINV_SECTOR)) = LTRIM(RTRIM(o.USR_ORTRAH_SECINV))
      WHERE o.USR_ORTRAH_SECINV IS NOT NULL
        AND LTRIM(RTRIM(o.USR_ORTRAH_SECINV)) <> ''
      ORDER BY Sector
    `)

    const data = filas.map((f: any) => ({
      sector: txt(f.Sector),
      responsable: txt(f.Responsable),
    }))

    res.json({ success: true, data, total: data.length })
  } catch (error: any) {
    return errorSql(res, error, 'obtener los sectores')
  }
})

/**
 * GET /api/novedades/tipos-unidad
 * Los seis tipos de vehículo, para el filtro de unidad.
 */
router.get('/tipos-unidad', (_req: Request, res: Response) => {
  const data = Object.entries(TIPOS_UNIDAD).map(([codigo, descripcion]) => ({ codigo, descripcion }))
  res.json({ success: true, data })
})

/**
 * GET /api/novedades/unidades?tipo=S
 * Padrón de unidades de un tipo, para que el chofer busque por interno o patente.
 *
 * Se devuelve la lista completa del tipo (la más grande son 249 semis) y el
 * filtrado se hace en el navegador: así el chofer escribe y ve resultados al
 * instante, sin una consulta por cada tecla desde la ruta.
 *
 * La clave es la PATENTE, no el interno: en USR_TRASEM hay internos repetidos
 * (varias unidades comparten el '0'), y además la patente es lo que valida el
 * trigger de USR_ORTRAH.
 */
router.get('/unidades', async (req: Request, res: Response) => {
  const tipo = txt(req.query.tipo).toUpperCase()

  if (!tipo || !TIPOS_UNIDAD[tipo]) {
    return res.status(400).json({
      success: false,
      error: `Tipo de unidad inválido. Valores posibles: ${Object.keys(TIPOS_UNIDAD).join(', ')}`,
    })
  }

  try {
    const filas = await sqlServerService.query(`
      SELECT
        LTRIM(RTRIM(ISNULL(USR_TRASEM_NROINT, ''))) AS NroInterno,
        LTRIM(RTRIM(ISNULL(USR_TRASEM_PATENT, ''))) AS Patente,
        LTRIM(RTRIM(ISNULL(USR_TRASEM_CODMAR, ''))) AS Marca
      FROM USR_TRASEM
      WHERE LTRIM(RTRIM(USR_TRASEM_TIPVEH)) = @tipo
        AND USR_TRASEM_PATENT IS NOT NULL
        AND LTRIM(RTRIM(USR_TRASEM_PATENT)) <> ''
      ORDER BY Patente
    `, { tipo })

    const data = filas.map((f: any) => ({
      nroInterno: txt(f.NroInterno),
      patente: txt(f.Patente),
      marca: txt(f.Marca),
      tipoUnidadCodigo: tipo,
      tipoUnidad: TIPOS_UNIDAD[tipo],
    }))

    res.json({ success: true, data, total: data.length })
  } catch (error: any) {
    return errorSql(res, error, 'obtener las unidades')
  }
})

/**
 * GET /api/novedades/unidad?nroInterno=334
 * Datos de la unidad que se completan solos: tipo, marca y último km cargado.
 *
 * El tipo y la marca salen del padrón de unidades (USR_TRASEM); el kilometraje
 * sale de la última OT de esa misma unidad, que es el dato más reciente que
 * tiene el sistema.
 */
router.get('/unidad', async (req: Request, res: Response) => {
  const nroInterno = txt(req.query.nroInterno)

  if (!nroInterno) {
    return res.status(400).json({ success: false, error: 'El parámetro "nroInterno" es requerido' })
  }

  try {
    const unidad = await sqlServerService.query(`
      SELECT TOP 1
        LTRIM(RTRIM(USR_TRASEM_TIPVEH)) AS TipoVehiculo,
        LTRIM(RTRIM(ISNULL(USR_TRASEM_CODMAR, ''))) AS Marca
      FROM USR_TRASEM
      WHERE LTRIM(RTRIM(USR_TRASEM_NROINT)) = @nroInterno
    `, { nroInterno })

    const km = await sqlServerService.query(`
      SELECT ISNULL(MAX(USR_ORTRAH_KMSUGE), 0) AS UltimoKm
      FROM USR_ORTRAH
      WHERE LTRIM(RTRIM(USR_ORTRAH_NROINT)) = @nroInterno
    `, { nroInterno })

    const codigoTipo = txt(unidad[0]?.TipoVehiculo).toUpperCase()

    res.json({
      success: true,
      data: {
        nroInterno,
        encontrada: unidad.length > 0,
        tipoUnidadCodigo: codigoTipo,
        tipoUnidad: TIPOS_UNIDAD[codigoTipo] || '',
        marca: txt(unidad[0]?.Marca),
        ultimoKm: Number(km[0]?.UltimoKm) || 0,
      },
    })
  } catch (error: any) {
    return errorSql(res, error, 'obtener los datos de la unidad')
  }
})

/**
 * GET /api/novedades/proximo-numero
 * Número que le tocaría a la próxima OT (último + 1).
 *
 * Es informativo para la pantalla de carga. El número definitivo lo tiene que
 * resolver el alta en el momento de grabar: entre que el chofer abre la
 * pantalla y confirma, otro usuario de Softland puede haber tomado ese número.
 */
router.get('/proximo-numero', async (_req: Request, res: Response) => {
  try {
    const filas = await sqlServerService.query(`
      SELECT ISNULL(MAX(USR_ORTRAH_NROFOR), 0) + 1 AS ProximoNumero FROM USR_ORTRAH
    `)
    res.json({ success: true, data: { proximoNumero: Number(filas[0]?.ProximoNumero) || 0 } })
  } catch (error: any) {
    return errorSql(res, error, 'obtener el próximo número de orden')
  }
})

/**
 * GET /api/novedades?chofer=APELLIDO NOMBRE
 * Novedades PENDIENTES de un chofer (las que originó el sector 26).
 *
 * El filtro va por nombre porque es el dato con el que el chofer entra a la
 * app y el mismo que queda en USR_ORTRAH_CHOFER. Se compara sin espacios: en
 * Softland los nombres vienen padeados.
 *
 * Las finalizadas (ORDFIN = 'S') quedan afuera: son la enorme mayoría —25.649
 * contra 358— y taparían lo que todavía está pendiente de resolver.
 */
router.get('/', async (req: Request, res: Response) => {
  const chofer = txt(req.query.chofer)

  if (!chofer) {
    return res.status(400).json({ success: false, error: 'El parámetro "chofer" es requerido' })
  }

  try {
    const filas = await sqlServerService.query(`
      SELECT
        USR_ORTRAH_NROFOR AS NroOrden,
        USR_ORTRAH_FECORD AS Fecha,
        LTRIM(RTRIM(ISNULL(USR_ORTRAH_HORAOT, ''))) AS Hora,
        LTRIM(RTRIM(ISNULL(USR_ORTRAH_SECINV, ''))) AS SectorInvolucrado,
        LTRIM(RTRIM(ISNULL(USR_ORTRAH_RESPON, ''))) AS Responsable,
        LTRIM(RTRIM(ISNULL(USR_ORTRAH_CHOFER, ''))) AS Chofer,
        LTRIM(RTRIM(ISNULL(USR_ORTRAH_INTERN, ''))) AS Patente,
        LTRIM(RTRIM(ISNULL(USR_ORTRAH_NROINT, ''))) AS NroInterno,
        LTRIM(RTRIM(ISNULL(USR_ORTRAH_DESCUN, ''))) AS TipoUnidad,
        LTRIM(RTRIM(ISNULL(USR_ORTRAH_CODMAR, ''))) AS Marca,
        ISNULL(USR_ORTRAH_KMSUGE, 0) AS Km,
        LTRIM(RTRIM(ISNULL(USR_ORTRAH_NOVEDA, ''))) AS Novedad,
        ISNULL(USR_ORTRAH_PRIURG, 'N') AS Urgente,
        ISNULL(USR_ORTRAH_SERVICE, 'N') AS EsService,
        LTRIM(RTRIM(ISNULL(USR_ORTRAH_TIPSER, ''))) AS TipoServicio,
        ISNULL(USR_ORTRAH_KMPRSR, 0) AS KmProximoService
      FROM USR_ORTRAH
      WHERE USR_ORTRAH_SECTOR = @sector
        AND LTRIM(RTRIM(USR_ORTRAH_CHOFER)) = @chofer
        AND ISNULL(USR_ORTRAH_ORDFIN, 'N') <> 'S'
        AND ISNULL(USR_OR_DEBAJA, 'N') = 'N'
      ORDER BY USR_ORTRAH_NROFOR DESC
    `, { sector: SECTOR_SOLICITA_CHOFER, chofer })

    const data = filas.map((f: any) => ({
      nroOrden: Number(f.NroOrden),
      fecha: f.Fecha ? new Date(f.Fecha).toISOString() : '',
      hora: txt(f.Hora),
      sectorInvolucrado: txt(f.SectorInvolucrado),
      responsable: txt(f.Responsable),
      chofer: txt(f.Chofer),
      patente: txt(f.Patente),
      nroInterno: txt(f.NroInterno),
      tipoUnidad: txt(f.TipoUnidad),
      marca: txt(f.Marca),
      km: Number(f.Km) || 0,
      novedad: txt(f.Novedad),
      urgente: txt(f.Urgente) === 'S',
      esService: txt(f.EsService) === 'S',
      tipoServicio: txt(f.TipoServicio),
      kmProximoService: Number(f.KmProximoService) || 0,
    }))

    res.json({ success: true, data, total: data.length })
  } catch (error: any) {
    return errorSql(res, error, 'obtener las novedades')
  }
})

// ═══════════════════════════════════════════════════════════════
// SUGERENCIA AUTOMÁTICA DE SECTOR
// ═══════════════════════════════════════════════════════════════

/**
 * Modelo "lite" a propósito: la sugerencia corre mientras el chofer todavía
 * está en la pantalla y tiene que sentirse instantánea. Medido sobre los mismos
 * 10 casos reales, gemini-3.6-flash tarda 4.846 ms de promedio y este 831 ms,
 * con idéntico acierto (10/10). Para elegir entre doce opciones de una lista
 * cerrada no hace falta el modelo grande.
 *
 * Nota: gemini-2.5-flash —el que usa el OCR— ya no se habilita en proyectos
 * nuevos; Google responde 404. El OCR sigue andando porque su API key es de un
 * proyecto anterior, pero si se rota esa key hay que tocar también ocr.ts.
 */
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'

/**
 * Sectores que el modelo puede elegir.
 *
 * Son los que los choferes usan de verdad, no los 20 del padrón: varios de esos
 * —ALMACENES, CHACARITA, PTM, SIN SECTOR ASIGNADO— son de uso interno del taller
 * y no corresponden a algo que reporte un chofer desde la ruta. Restringir el
 * enum a los reales evita clasificaciones absurdas.
 *
 * Se lee de la base una vez por proceso, así sigue a Softland si mañana los
 * choferes empiezan a usar otro sector.
 */
let sectoresIA: string[] | null = null

async function sectoresClasificables(): Promise<string[]> {
  if (sectoresIA) return sectoresIA

  const filas = await sqlServerService.query(`
    SELECT LTRIM(RTRIM(USR_ORTRAH_SECINV)) AS Sector, COUNT(*) AS Cant
    FROM USR_ORTRAH
    WHERE USR_ORTRAH_SECTOR = @sector
      AND USR_ORTRAH_SECINV IS NOT NULL
      AND LTRIM(RTRIM(USR_ORTRAH_SECINV)) <> ''
    GROUP BY LTRIM(RTRIM(USR_ORTRAH_SECINV))
    ORDER BY COUNT(*) DESC
  `, { sector: SECTOR_SOLICITA_CHOFER })

  sectoresIA = filas.map((f: any) => txt(f.Sector)).filter(Boolean)
  return sectoresIA
}

/**
 * Guía de clasificación construida sobre los casos reales de USR_ORTRAH.
 *
 * Es deliberadamente compacta: cada token de entrada suma latencia, y la
 * sugerencia corre con el chofer esperando. La versión larga acertaba lo mismo
 * y tardaba ~90 ms más por consulta.
 *
 * Las fronteras dudosas van adentro de la descripción de cada sector en lugar
 * de en una lista de reglas aparte. La que más importa es GOMERIA vs PLAYA: en
 * los datos históricos "cambiar goma del eje neumático" aparece en las dos, así
 * que sin la distinción explícita el modelo alterna sin criterio.
 */
const GUIA_SECTORES = `MECANICO: motor, caja, frenos, aire, embrague, turbo, mangueras, filtros, pérdidas, dirección.
ELECTRICIDAD DEL AUTOMOTOR: luces, giros, focos, bocina, tablero, batería, arranque. Toda electricidad del camión.
PLAYA: montar/cambiar/inflar goma o auxilio, sogas, precintos, revisión antes de salir.
GOMERIA: estado del neumático (reventado, pinchado, gastado, a reparar).
METALURGICO: soldar, chasis, parantes, faldones, ganchos, soportes, masas.
TALLER: service, cambio de aceite, engrase, mantenimiento, revisión sin sector claro.
CHAPERIA: guardabarros, puertas, burletes, paragolpes, espejos, cabina.
REPARACIÓN LONAS: lona, carpa, cortinas, correderas.
PINTURA: pintar, óxido. ARENADO: arenado. SUMINISTROS: proveer una pieza. ELECTRICIDAD: eléctrica edilicia (no camión).`

/**
 * POST /api/novedades/sugerir-sector
 * Propone el sector involucrado a partir del texto del prediagnóstico.
 *
 * Es una sugerencia, no una decisión: el chofer siempre puede cambiarla en el
 * desplegable. Por eso un fallo acá nunca es un error de pantalla — se devuelve
 * sector vacío y el chofer elige a mano.
 */
router.post('/sugerir-sector', async (req: Request, res: Response) => {
  const prediagnostico = txt(req.body.prediagnostico)

  if (prediagnostico.length < 10) {
    return res.json({ success: true, sector: '', motivo: 'Texto demasiado corto para clasificar' })
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_VISION_API_KEY
  if (!apiKey) {
    console.error('[Novedades] GEMINI_API_KEY no configurada')
    return res.json({ success: true, sector: '', motivo: 'Clasificación automática no disponible' })
  }

  try {
    const sectores = await sectoresClasificables()
    if (sectores.length === 0) {
      return res.json({ success: true, sector: '', motivo: 'Sin sectores para clasificar' })
    }

    const respuesta = await axios.post(
      `${GEMINI_API_URL}?key=${apiKey}`,
      {
        contents: [{
          parts: [{
            text:
              `Sos el encargado de taller de una empresa de transporte de camiones. ` +
              `Un chofer reporta una novedad y tenés que derivarla al sector correcto.\n` +
              `SECTORES:\n${GUIA_SECTORES}\n` +
              `NOVEDAD: "${prediagnostico}"`
          }]
        }],
        generationConfig: {
          temperature: 0,
          // 200 y no 60: los modelos 3.x razonan antes de escribir y con un
          // presupuesto chico la respuesta sale cortada, sin JSON válido.
          //
          // Sin thinkingConfig: este modelo rechaza ese campo con un 400
          // ("invalid argument"). No hace falta — ya responde en ~800 ms.
          maxOutputTokens: 200,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            required: ['sector'],
            // El enum sale de la base: el modelo no puede inventar un sector
            // que después el desplegable no tenga.
            properties: { sector: { type: 'STRING', enum: sectores } },
          },
        },
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
    )

    const partes = respuesta.data?.candidates?.[0]?.content?.parts || []
    const crudo = partes.find((p: any) => p.text !== undefined)?.text || ''

    let sector = ''
    try {
      sector = txt(JSON.parse(crudo).sector)
    } catch {
      console.error('[Novedades] Gemini devolvió algo que no es JSON:', crudo.slice(0, 200))
    }

    // Red de seguridad: solo se acepta si existe tal cual en la lista
    if (!sectores.includes(sector)) sector = ''

    console.log(`[Novedades] Sector sugerido: "${sector || '(ninguno)'}" para "${prediagnostico.slice(0, 60)}"`)
    return res.json({ success: true, sector })

  } catch (error: any) {
    // Que la sugerencia falle no puede trabar la carga de la novedad
    console.error('[Novedades] Error al sugerir sector:', error.response?.status, error.message)
    return res.json({ success: true, sector: '', motivo: 'No se pudo sugerir el sector' })
  }
})

/**
 * POST /api/novedades
 * Da de alta la orden de trabajo en USR_ORTRAH.
 *
 * ── Qué manda el cliente y qué resuelve el servidor ──────────────────
 * Del navegador solo llegan las decisiones del chofer: patente, sector y
 * prediagnóstico, más su identidad de la sesión. El responsable, el tipo de
 * unidad, la marca y el kilometraje se vuelven a leer acá contra Softland en
 * vez de confiar en lo que mande el formulario: si alguien altera el pedido, la
 * OT igual queda con los datos que corresponden a esa unidad.
 *
 * ── El número de orden ───────────────────────────────────────────────
 * USR_ORTRAH_NROFOR es la clave primaria y no es autoincremental: hay que
 * calcularlo. Se hace DENTRO de la misma transacción que el INSERT, tomando
 * UPDLOCK + HOLDLOCK sobre el MAX. Sin ese lock, dos altas simultáneas —la de
 * un chofer y la de alguien trabajando en Softland— leerían el mismo máximo y
 * la segunda fallaría por clave duplicada.
 *
 * SET XACT_ABORT ON garantiza que cualquier error (incluido el que levanta el
 * trigger de integridad) revierta la transacción completa en vez de dejar la
 * fila a medio grabar.
 */
router.post('/', async (req: Request, res: Response) => {
  const patente = txt(req.body.patente).toUpperCase()
  const sectorInvolucrado = txt(req.body.sectorInvolucrado)
  const prediagnostico = txt(req.body.prediagnostico)
  const legajoChofer = txt(req.body.legajoChofer)
  const nombreChofer = txt(req.body.chofer)
  const empresaChofer = txt(req.body.empresaChofer)

  if (!patente) {
    return res.status(400).json({ success: false, error: 'Elegí la unidad antes de generar la orden' })
  }
  if (!sectorInvolucrado) {
    return res.status(400).json({ success: false, error: 'Elegí el sector involucrado' })
  }
  if (!prediagnostico) {
    return res.status(400).json({ success: false, error: 'Escribí el prediagnóstico' })
  }
  if (!nombreChofer) {
    return res.status(400).json({ success: false, error: 'No hay un chofer en la sesión. Volvé a ingresar.' })
  }

  try {
    // ── La unidad manda: tipo, marca e interno salen del padrón ──
    const unidades = await sqlServerService.query(`
      SELECT TOP 1
        LTRIM(RTRIM(ISNULL(USR_TRASEM_NROINT, ''))) AS NroInterno,
        LTRIM(RTRIM(ISNULL(USR_TRASEM_TIPVEH, ''))) AS TipoCodigo,
        LTRIM(RTRIM(ISNULL(USR_TRASEM_CODMAR, ''))) AS Marca
      FROM USR_TRASEM
      WHERE LTRIM(RTRIM(USR_TRASEM_PATENT)) = @patente
    `, { patente })

    if (unidades.length === 0) {
      return res.status(400).json({
        success: false,
        error: `La patente ${patente} no figura en el padrón de unidades.`,
      })
    }

    const nroInterno = txt(unidades[0].NroInterno)
    const tipoCodigo = txt(unidades[0].TipoCodigo).toUpperCase()
    const marca = txt(unidades[0].Marca)
    const tipoDescripcion = TIPOS_UNIDAD[tipoCodigo] || ''

    // ── El responsable lo define el sector ──
    const responsables = await sqlServerService.query(`
      SELECT TOP 1 LTRIM(RTRIM(ISNULL(USR_SECINV_RESPON, ''))) AS Responsable
      FROM USR_SECINV
      WHERE LTRIM(RTRIM(USR_SECINV_SECTOR)) = @sector
    `, { sector: sectorInvolucrado })

    const responsable = txt(responsables[0]?.Responsable)
    // Las columnas NOM* de Softland están en mayúsculas; RESPON conserva el
    // formato del padrón de sectores.
    const responsableNom = responsable.toUpperCase()

    // ── Chequeo previo de las FK que valida el trigger ──
    // USR_ORTRAH_NOMEMP y USR_ORTRAH_CHOFER tienen que existir en USR_GTCHOF.
    // Si no, el trigger hace ROLLBACK y devuelve un código interno del ERP; se
    // verifica antes para poder decir qué falta y no perder lo que escribió el
    // chofer. Hay responsables de USR_SECINV que no están en USR_GTCHOF —
    // GOMERIA y PTM entre ellos— y sectores sin responsable cargado.
    const enPadron = async (nombre: string) => {
      if (!nombre) return false
      const r = await sqlServerService.query(`
        SELECT TOP 1 1 AS ok FROM USR_GTCHOF
        WHERE LTRIM(RTRIM(USR_GTCHOF_NOMBRE)) = @nombre
      `, { nombre })
      return r.length > 0
    }

    if (!(await enPadron(responsableNom))) {
      return res.status(400).json({
        success: false,
        error: responsable
          ? `El responsable de ${sectorInvolucrado} (${responsable}) no figura en el padrón de Softland. Avisá a sistemas.`
          : `El sector ${sectorInvolucrado} no tiene un responsable asignado en Softland. Elegí otro sector o avisá a sistemas.`,
      })
    }

    if (!(await enPadron(nombreChofer))) {
      return res.status(400).json({
        success: false,
        error: `El chofer ${nombreChofer} no figura en el padrón de Softland. Avisá a sistemas.`,
      })
    }

    // Solo los tractores llevan kilometraje
    let kmSugerido = 0
    if (tipoCodigo === 'T' && nroInterno) {
      const km = await sqlServerService.query(`
        SELECT ISNULL(MAX(USR_ORTRAH_KMSUGE), 0) AS UltimoKm
        FROM USR_ORTRAH WHERE LTRIM(RTRIM(USR_ORTRAH_NROINT)) = @nroInterno
      `, { nroInterno })
      kmSugerido = Number(km[0]?.UltimoKm) || 0
    }

    const filas = await sqlServerService.query(`
      SET NOCOUNT ON;
      SET XACT_ABORT ON;

      BEGIN TRANSACTION;

        DECLARE @nro int;
        SELECT @nro = ISNULL(MAX(USR_ORTRAH_NROFOR), 0) + 1
        FROM USR_ORTRAH WITH (UPDLOCK, HOLDLOCK);

        INSERT INTO USR_ORTRAH (
          USR_ORTRAH_FECORD,  USR_ORTRAH_NROFOR,  USR_ORTRAH_CODEMP,  USR_ORTRAH_OPERAD,
          USR_ORTRAH_KMUNID,
          USR_ORTRAH_SMETAL,  USR_ORTRAH_SCHAPE,  USR_ORTRAH_SCLARK,  USR_ORTRAH_SARENA,
          USR_ORTRAH_SPINTU,  USR_ORTRAH_SMECAN,  USR_ORTRAH_SPINTO,  USR_ORTRAH_SADMIN,
          USR_ORTRAH_SCHACA,  USR_ORTRAH_SELECT,  USR_ORTRAH_SPTM,    USR_ORTRAH_SELECA,
          USR_ORTRAH_GOMERI,
          USR_ORTRAH_NOVEDA,  USR_ORTRAH_SECTOR,  USR_ORTRAH_IDOTRA,  USR_ORTRAH_ORDFIN,
          USR_ORTRAH_INTERN,  USR_ORTRAH_NOMOPE,  USR_ORTRAH_NROINT,  USR_ORTRAH_NROFOA,
          USR_ORTRAH_OTTEMP,  USR_ORTRAH_MODIFI,  USR_ORTRAH_HORAOT,  USR_ORTRAH_OTOPEN,
          USR_ORTRAH_SECOTO,  USR_ORTRAH_TIPUNI,  USR_ORTRAH_DESCUN,  USR_ORTRAH_NRFOST,
          USR_ORTRAH_SECINV,  USR_ORTRAH_NOMENC,  USR_ORTRAH_HOCIOT,  USR_ORTRAH_FCCIOT,
          USR_ORTRAH_NOMEMP,  USR_ORTRAH_DETDES,  USR_ORTRAH_CODMAR,  USR_ORTRAH_REGIST,
          USR_ORTRAH_USRALT,  USR_ORTRAH_KMSUGE,  USR_ORTRAH_RESPON,  USR_ORTRAH_CHOFER,
          USR_ORTRAH_INTALT,  USR_ORTRAH_SERVICE, USR_ORTRAH_TIPSER,  USR_ORTRAH_PRIURG,
          USR_ORTRAH_KMPRSR,
          USR_OR_FECALT,      USR_OR_FECMOD,      USR_OR_USERID,      USR_OR_ULTOPR,
          USR_OR_DEBAJA,      USR_OR_OALIAS
        )
        VALUES (
          CAST(GETDATE() AS date), @nro, @codemp, @operad,
          0,
          'N','N','N','N',
          'N','N','N','N',
          'N','N','N','N',
          'N',
          @noveda, @sector, 1, 'N',
          @intern, @nombreResponsable, @nrointern, @nro,
          @nro, 'N', CONVERT(varchar(5), GETDATE(), 108), 'S',
          '', @tipuni, @descun, 0,
          @secinv, @nombreResponsable, '', CAST(GETDATE() AS date),
          @nombreResponsable, '', @codmar, @usuario,
          @usuario, @kmsuge, @respon, @chofer,
          @intern, 'N', NULL, 'N',
          0,
          GETDATE(), GETDATE(), @usuario, 'A',
          'N', 'USR_ORTRAH'
        );

        -- ── La tarea (USR_ORTRAI) ──────────────────────────────────
        -- Lo que en la pantalla de Softland arma sola la regla GRTQVE del
        -- contexto IDORTR (ítem 9). Los valores se leen de la cabecera recién
        -- insertada, así no hay forma de que difieran.
        --
        -- ⚠️ El trigger InsUSR_ORTRAI tiene una rama que genera movimientos de
        -- stock (STRMVH/STRMVI) y modifica existencias (STRMVK) cuando la
        -- línea entra con TARFIN='S' y CANTNE<>0. Una tarea recién creada no
        -- lleva materiales: TARFIN='N' y CANTNE=0 van explícitos justamente
        -- para que esa rama no se active nunca desde acá.
        ${CREAR_TAREA ? `
        INSERT INTO USR_ORTRAI (
          USR_ORTRAI_ORTRAH_NROFOR, USR_ORTRAI_IDINTI,
          USR_ORTRAI_CODEMP,  USR_ORTRAI_OPERAD,  USR_ORTRAI_TRAREA,
          USR_ORTRAI_OBSERV,
          USR_ORTRAI_FECORD,  USR_ORTRAI_FECINI,  USR_ORTRAI_FECFIN,
          USR_ORTRAI_HORAIN,  USR_ORTRAI_HORAFI,
          USR_ORTRAI_PATENT,  USR_ORTRAI_NROINT,  USR_ORTRAI_KMUNID,
          USR_ORTRAI_CODMAR,  USR_ORTRAI_SECINV,  USR_ORTRAI_RESPOT,
          USR_ORTRAI_OPETAR,  USR_ORTRAI_NOMEMP,  USR_ORTRAI_USRALT,
          USR_ORTRAI_REGIST,  USR_ORTRAI_PRIURG,
          USR_ORTRAI_SECDES,  USR_ORTRAI_DETDES,
          USR_ORTRAI_TARABI,  USR_ORTRAI_TARFIN,  USR_ORTRAI_PROCES,
          USR_ORTRAI_TARTER,  USR_ORTRAI_OTMODI,  USR_ORTRAI_OTCLOS,
          USR_ORTRAI_TARPOS,  USR_ORTRAI_FECPOS,  USR_ORTRAI_HORPOS,
          USR_ORTRAI_HOCIOT,  USR_ORTRAI_FCCIOT,
          USR_ORTRAI_SERVICE, USR_ORTRAI_TIPSER,
          USR_ORTRAI_CANMAT,  USR_ORTRAI_CANTNE,  USR_ORTRAI_PRECIO,
          USR_ORTRAI_CAMSEC,  USR_ORTRAI_STOCKS,  USR_ORTRAI_STOCKR,
          USR_ORTRAI_STOCKE,  USR_ORTRAI_NRFOST,  USR_ORTRAI_SECTOR,
          USR_ORTRAI_NROINC,  USR_ORTRAI_TIPPR2,  USR_ORTRAI_MATER2,
          USR_ORTRAI_UNIMED,  USR_ORTRAI_DEPOSI,  USR_ORTRAI_SECDEP,
          USR_OR_FECALT,      USR_OR_FECMOD,      USR_OR_USERID,
          USR_OR_ULTOPR,      USR_OR_DEBAJA,      USR_OR_OALIAS
        )
        SELECT
          h.USR_ORTRAH_NROFOR, 1,
          h.USR_ORTRAH_CODEMP, h.USR_ORTRAH_OPERAD, h.USR_ORTRAH_NOVEDA,
          @observ,
          -- FECORD/FECINI son del día de la orden; FECFIN, FCCIOT y FECPOS
          -- quedan en el día en que se crea la tarea, como en la 26188
          h.USR_ORTRAH_FECORD, h.USR_ORTRAH_FECORD, CAST(GETDATE() AS date),
          h.USR_ORTRAH_HORAOT, '',
          h.USR_ORTRAH_INTERN, h.USR_ORTRAH_NROINT, h.USR_ORTRAH_KMUNID,
          h.USR_ORTRAH_CODMAR, h.USR_ORTRAH_SECINV, h.USR_ORTRAH_NOMENC,
          h.USR_ORTRAH_NOMEMP, '', h.USR_ORTRAH_USRALT,
          h.USR_ORTRAH_USRALT, ISNULL(h.USR_ORTRAH_PRIURG, 'N'),
          @secdes, @detdes,
          'S', 'N', 'N',
          'N', 'S', 'N',
          'N', CAST(GETDATE() AS date), '',
          '', CAST(GETDATE() AS date),
          'N', '',
          -- Sin materiales. CANTNE es texto y va vacío, igual que en la 26188:
          -- es lo que deja apagada la rama de stock del trigger.
          0, '', 0,
          0, 0, 0,
          0, 0, 0,
          '', '      ', '',
          '', '01', '0',
          GETDATE(), GETDATE(), @usuario,
          'A', 'N', 'USR_ORTRAI'
        FROM USR_ORTRAH h
        WHERE h.USR_ORTRAH_NROFOR = @nro;
        ` : '-- creación de la tarea desactivada por NOVEDADES_CREAR_TAREA=false'}

      COMMIT TRANSACTION;

      SELECT @nro AS NroOrden;
    `, {
      secdes:             SECTOR_DESTINO_TAREA,
      detdes:             DESTINO_TAREA,
      observ:             OBSERVACION_TAREA,
      codemp:             (empresaChofer || 'DIBIAG').slice(0, 10),
      operad:             legajoChofer.slice(0, 13),
      noveda:             prediagnostico.slice(0, 255),
      sector:             SECTOR_SOLICITA_CHOFER,
      intern:             patente.slice(0, 10),
      nrointern:          nroInterno.slice(0, 20),
      tipuni:             tipoCodigo.slice(0, 2),
      descun:             tipoDescripcion.slice(0, 22),
      secinv:             sectorInvolucrado.slice(0, 32),
      nombreResponsable:  responsableNom.slice(0, 60),
      respon:             responsable.slice(0, 60),
      chofer:             nombreChofer.slice(0, 60),
      codmar:             marca.slice(0, 20),
      kmsuge:             kmSugerido,
      usuario:            USUARIO_APP,
    })

    const nroOrden = Number(filas[0]?.NroOrden)

    console.log(
      `[Novedades] OT ${nroOrden} creada | ${sectorInvolucrado} | ${patente} (int ${nroInterno}) | ${nombreChofer}` +
      (CREAR_TAREA ? ' | con tarea' : ' | SIN tarea (NOVEDADES_CREAR_TAREA=false)')
    )

    res.status(201).json({
      success: true,
      data: {
        nroOrden,
        sectorInvolucrado,
        responsable,
        patente,
        nroInterno,
        tipoUnidad: tipoDescripcion,
        marca,
        km: kmSugerido,
        novedad: prediagnostico,
      },
    })
  } catch (error: any) {
    // El trigger de Softland avisa una FK rota con este formato; traducirlo
    // evita mostrarle al chofer un mensaje interno del ERP.
    if (String(error?.message || '').includes('@?@')) {
      console.error('[Novedades] El trigger rechazó el alta:', error.message)
      return res.status(400).json({
        success: false,
        error: 'Softland rechazó la orden porque algún dato no existe en sus tablas. Avisá a sistemas.',
      })
    }

    return errorSql(res, error, 'generar la orden de trabajo')
  }
})

export default router
