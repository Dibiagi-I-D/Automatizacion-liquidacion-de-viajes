import sqlServerService from './sqlServerService.js'
import adminDb, { sql } from './adminDbService.js'
import { normalizarTipo, normalizarCodigo } from './conceptosSoftland.js'

/**
 * ════════════════════════════════════════════════════════════════════
 * REGISTROS CORMVI — cómo quedaría cada gasto en Softland
 * ════════════════════════════════════════════════════════════════════
 *
 * Única fuente de verdad de la fila CORMVI. El panel la muestra y, el día
 * que se inserte en Softland, se inserta esta misma: lo que se revisa es
 * exactamente lo que se va a grabar.
 *
 * Cada valor está verificado contra 5.482 líneas RRFF reales de DIBIAG del
 * último año. Donde Softland aplica una regla de GRTQVI, acá se replica la
 * misma (se indica el número de regla).
 *
 * De DIBIAG solo se LEE. Las correcciones manuales de la cabecera se guardan
 * en dibiagi_admin_db.cabecera_viaje.
 */

// ─── Cabecera del viaje (equivale a CORMVH) ─────────────────────────────

export type OrigenFecha = 'chofer' | 'hoja' | 'porteria' | 'calculado' | 'manual' | 'sin-dato'

export interface ValorCabecera<T> {
  valor: T | null
  origen: OrigenFecha
}

/** El chofer resuelto contra el padrón USR_GTCHOF (reglas 13, 15, 42). */
export interface ChoferCabecera {
  nombre: string
  legajo: string
  /** Empresa a la que pertenece el legajo. La regla 16 la compara con la de la rendición. */
  empresa: string
  enPadron: boolean
}

export interface Cabecera {
  nroViaje: number
  empresa: string
  patente: string
  chofer: ChoferCabecera
  /**
   * Las tres fuentes de la fecha de llegada, para poder contrastarlas.
   * Si el chofer dice una y la hoja de ruta otra, eso es información: el panel
   * lo avisa en vez de elegir en silencio.
   */
  llegadaCandidatas: { chofer: string | null; hoja: string | null; porteria: string | null }
  salida: ValorCabecera<string>            // YYYY-MM-DD
  llegada: ValorCabecera<string>           // YYYY-MM-DD
  periodoLiquidar: ValorCabecera<string>   // YYYYMM
  /** Mes en que se carga la rendición: en Softland coincide en el 98,4%. */
  periodo: number
  /** USR_CAJCAM vigente a la fecha de salida (regla 45). */
  cajaCamion: number | null
  actualizadoPor: string | null
  actualizadoAt: string | null
}

/** Fecha a 'YYYY-MM-DD' sin pasar por zonas horarias. */
function aISO(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  const s = String(v).trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

function periodoActual(): number {
  const hoy = new Date()
  return hoy.getFullYear() * 100 + (hoy.getMonth() + 1)
}

/**
 * Período a liquidar según la misma función que usa Softland (regla 49):
 * llegada hasta el día 15 → ese mes; después del 15 → mes siguiente.
 * Se llama a la función de la base en vez de reescribirla: si administración
 * la cambia, el panel sigue la regla nueva sin tocar código.
 */
async function periodoDeLlegada(llegada: string): Promise<string | null> {
  const r = await sqlServerService.query<{ p: string }>(
    `SELECT dbo.usr_fn_devuelvePeriodo(@fecha) AS p`,
    { fecha: llegada }
  )
  return r[0]?.p ? String(r[0].p) : null
}

export async function obtenerCabecera(nroViaje: number, empresaPreferida = ''): Promise<Cabecera> {
  // ── Hoja de ruta: empresa, tractor y salida ──
  // Hay números de viaje repetidos entre empresas: se prefiere la del gasto.
  const hojas = await sqlServerService.query<any>(`
    SELECT TOP 1
      LTRIM(RTRIM(USR_GTVIAH_CODEMP)) AS empresa,
      LTRIM(RTRIM(USR_GTVIAH_PATTRA)) AS patente,
      LTRIM(RTRIM(USR_GTVIAH_CHOFER)) AS chofer,
      USR_GTVIAH_FSALID AS salida,
      -- OJO: FCHLLE es la llegada REAL. FLLEGA es la planificada, y coincide
      -- con lo que se rinde en el 2,2% de los casos: no sirve.
      USR_GTVIAH_FCHLLE AS llegada
    FROM USR_GTVIAH
    WHERE USR_GTVIAH_NROVIA = @nro
    ORDER BY CASE WHEN LTRIM(RTRIM(USR_GTVIAH_CODEMP)) = @emp THEN 0 ELSE 1 END
  `, { nro: nroViaje, emp: empresaPreferida })
  const hoja = hojas[0]

  // ── Correcciones manuales ──
  const rq = await adminDb.request()
  rq.input('nro', sql.Int, nroViaje)
  const override = (await rq.query(`
    SELECT fecha_salida, fecha_llegada, periodo_liquidar, actualizado_por, updated_at
    FROM dbo.cabecera_viaje WHERE nro_viaje = @nro
  `)).recordset[0]

  const salidaHoja = aISO(hoja?.salida)
  const salida: ValorCabecera<string> = override?.fecha_salida
    ? { valor: aISO(override.fecha_salida), origen: 'manual' }
    : salidaHoja ? { valor: salidaHoja, origen: 'hoja' } : { valor: null, origen: 'sin-dato' }

  // ── Fecha de llegada ──────────────────────────────────────────────
  //
  // El orden cambió cuando apareció la app. Antes la llegada se RECONSTRUÍA
  // después: portería registraba la entrada del tractor, o administración
  // cerraba la hoja de ruta. Ahora la declara el chofer el día que termina,
  // que es el único que lo sabe de primera mano y en el momento.
  //
  // Las otras dos quedan como respaldo para los viajes que el chofer no cierra
  // en la app, y como contraste: si difieren, el panel lo avisa.
  //
  // Medido sobre las últimas 1.000 rendiciones reales:
  //   hoja USR_GTVIAH_FCHLLE → acierta 95,2%  (97,9% cuando es posterior a la salida)
  //   portería (primera ENTRADA) → 85,9%
  //   hoja USR_GTVIAH_FLLEGA (planificada) → 2,2%, inservible

  // 1) Lo que declaró el chofer al finalizar la hoja en la app
  const rqFin = await adminDb.request()
  rqFin.input('nro', sql.Int, nroViaje)
  const finalizacion = (await rqFin.query(`
    SELECT TOP 1 fecha FROM dbo.gastos_viaje
    WHERE nro_viaje = @nro AND registro_tipo = 'FINALIZACION' AND fecha IS NOT NULL
    ORDER BY created_at DESC
  `)).recordset[0]
  const llegadaChofer = aISO(finalizacion?.fecha)

  // 2) La hoja de ruta, si la llegada es posterior a la salida. Cuando es
  //    IGUAL a la salida puede ser un viaje de un día o un valor sin corregir
  //    de un viaje que todavía no volvió: en el histórico, 7 de esos 76 casos
  //    estaban mal. Por eso se acepta solo si portería confirma.
  const llegadaHoja = aISO(hoja?.llegada)

  // 3) Portería: primera entrada del tractor posterior a la salida
  let llegadaPorteria: string | null = null
  if (hoja?.patente && salida.valor) {
    const e = await sqlServerService.query<any>(`
      SELECT TOP 1 TRY_CONVERT(date, USR_GTPOCU_FECHAC) AS entrada
      FROM USR_GTPOCU
      WHERE USR_GTPOCU_TRACTO = @pat
        AND LTRIM(RTRIM(USR_GTPOCU_INGSAL)) = 'ENTRA'
        AND TRY_CONVERT(date, USR_GTPOCU_FECHAC) > @sal
      ORDER BY TRY_CONVERT(date, USR_GTPOCU_FECHAC)
    `, { pat: hoja.patente, sal: salida.valor })
    llegadaPorteria = aISO(e[0]?.entrada)
  }

  const hojaConfiable =
    llegadaHoja && salida.valor
      ? (llegadaHoja > salida.valor || llegadaHoja === llegadaPorteria)
      : false

  let llegada: ValorCabecera<string>
  if (override?.fecha_llegada)      llegada = { valor: aISO(override.fecha_llegada), origen: 'manual' }
  else if (llegadaChofer)           llegada = { valor: llegadaChofer,   origen: 'chofer' }
  else if (hojaConfiable)           llegada = { valor: llegadaHoja,     origen: 'hoja' }
  else if (llegadaPorteria)         llegada = { valor: llegadaPorteria, origen: 'porteria' }
  else                              llegada = { valor: null,            origen: 'sin-dato' }

  // ── Período a liquidar ──
  let periodoLiquidar: ValorCabecera<string>
  if (override?.periodo_liquidar) {
    periodoLiquidar = { valor: String(override.periodo_liquidar), origen: 'manual' }
  } else if (llegada.valor) {
    periodoLiquidar = { valor: await periodoDeLlegada(llegada.valor), origen: 'calculado' }
  } else {
    periodoLiquidar = { valor: null, origen: 'sin-dato' }
  }

  // ── Caja camión vigente a la salida (regla 45) ──
  let cajaCamion: number | null = null
  if (salida.valor) {
    const c = await sqlServerService.query<any>(`
      SELECT TOP 1 USR_CAJCAM_MONTO AS monto FROM USR_CAJCAM
      WHERE USR_CAJCAM_FECMOV <= @sal ORDER BY USR_CAJCAM_FECMOV DESC
    `, { sal: salida.valor })
    cajaCamion = c[0]?.monto != null ? Number(c[0].monto) : null
  }

  const empresa = hoja?.empresa || empresaPreferida
  const patente = hoja?.patente || ''

  // ── Chofer contra el padrón (reglas 13, 15 y 42) ──
  // De acá salen el legajo y la empresa del legajo: Softland no los escribe,
  // los trae de USR_GTCHOF a partir del nombre que está en la hoja de ruta.
  const nombreChofer = String(hoja?.chofer || '').trim()
  let chofer: ChoferCabecera = { nombre: nombreChofer, legajo: '', empresa: '', enPadron: false }
  if (nombreChofer) {
    const c = await sqlServerService.query<any>(`
      SELECT TOP 1 LTRIM(RTRIM(USR_GTCHOF_NROLEG)) AS legajo,
                   LTRIM(RTRIM(USR_GTCHOF_CODEMP)) AS empresa
      FROM USR_GTCHOF WHERE LTRIM(RTRIM(USR_GTCHOF_NOMBRE)) = @nom
    `, { nom: nombreChofer })
    if (c[0]) chofer = { nombre: nombreChofer, legajo: c[0].legajo || '', empresa: c[0].empresa || '', enPadron: true }
  }

  return {
    nroViaje,
    empresa,
    patente,
    chofer,
    llegadaCandidatas: { chofer: llegadaChofer, hoja: llegadaHoja, porteria: llegadaPorteria },
    salida,
    llegada,
    periodoLiquidar,
    periodo: periodoActual(),
    cajaCamion,
    actualizadoPor: override?.actualizado_por || null,
    actualizadoAt: override?.updated_at ? new Date(override.updated_at).toISOString() : null,
  }
}



export interface CorreccionCabecera {
  /** undefined = no tocar · null = volver al valor calculado · valor = fijarlo */
  salida?: string | null
  llegada?: string | null
  periodoLiquidar?: string | null
}

export async function guardarCorreccionCabecera(nroViaje: number, c: CorreccionCabecera, usuario: string) {
  const rq = await adminDb.request()
  rq.input('nro', sql.Int, nroViaje)
  rq.input('usuario', sql.NVarChar(100), usuario)

  const sets: string[] = []
  const cols: string[] = []
  const vals: string[] = []

  // undefined = no se tocó · '' o null = volver al calculado (se guarda NULL)
  const campo = (col: string, tipo: any, valor: string | null | undefined) => {
    if (valor === undefined) return
    rq.input(col, tipo, valor || null)
    sets.push(`${col} = @${col}`)
    cols.push(col)
    vals.push(`@${col}`)
  }
  campo('fecha_salida', sql.Date, c.salida)
  campo('fecha_llegada', sql.Date, c.llegada)
  campo('periodo_liquidar', sql.NVarChar(6), c.periodoLiquidar)

  if (sets.length === 0) return

  await rq.query(`
    MERGE dbo.cabecera_viaje AS t
    USING (SELECT @nro AS nro_viaje) AS s ON t.nro_viaje = s.nro_viaje
    WHEN MATCHED THEN
      UPDATE SET ${sets.join(', ')}, actualizado_por = @usuario, updated_at = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (nro_viaje, ${cols.join(', ')}, actualizado_por)
      VALUES (@nro, ${vals.join(', ')}, @usuario);
  `)
}

// ─── Fila CORMVI (una por gasto) ─────────────────────────────────────────

/**
 * El orden de las claves es el orden de las columnas en la pantalla de carga
 * de Softland: el panel lo usa para la tabla, el copiado y el CSV.
 */
export interface CormviRecord {
  CORMVI_NROCTA: string
  CORMVI_TIPORI: string
  CORMVI_ARTORI: string
  CORMVI_TIPCPT: string
  CORMVI_CODCPT: string
  CORMVI_COFLIS: string
  USR_CORMVI_NLIIVA: string
  USR_CORMVI_CANTID: number
  USR_CORMVI_PRECIO: number
  VIRT_TOTLIN: number
  USR_CORMVI_PERLIQ: string
  CORMVI_TEXTOS: string
  USR_CORMVI_EMPLEG: string
  USR_CORMVI_NROLEG: string
  USR_CORMVI_NROVIA: number
  USR_CORMVI_NROFOR: string
  USR_CORMVI_PATTRA: string
  USR_CORMVI_DELETE: string
  USR_CORMVI_FCHCAL: string | null
  USR_CORMVI_COSAVI: number
  USR_CORMVI_VAITSE: number
  USR_CORMVI_NOMLEG: string
  USR_CORMVI_CAJCAM: number | null
  CORMVI_PRECIO: number
  CORMVI_CANTID: number
  USR_CORMVI_PERIOD: number
  USR_CORMVI_FCHLLE: string | null
}

/** Lo que el panel necesita además de la fila para mostrar y editar. */
export interface FilaCormvi extends CormviRecord {
  _gastoId: string
  _tieneFoto: boolean
  _pais: string
  /** Informativos: se ven en el panel pero NO van a Softland */
  _descripcion: string
  _fechaTicket: string
  _formalidad: string
}

export interface GastoParaCormvi {
  id: string
  nroViaje: number
  fecha: string
  pais: string
  tipoProducto: string
  codigoArticulo: string
  formalidad: string
  codigoProveedor: string
  importe: number
  descripcion?: string
  chofer: string
  legajoChofer: string
  empresaChofer: string
  patenteTractor: string
  rendicion: string
  tieneFoto: boolean
}

/** Moneda tal como la guarda Softland en CORMVI_COFLIS (no el código ISO). */
const MONEDA_SOFTLAND: Record<string, string> = { ARG: 'ARS', CHL: '$CH', URY: '$UR' }

export function gastoAFilaCormvi(g: GastoParaCormvi, cab: Cabecera): FilaCormvi {
  const importe = Number(g.importe) || 0
  const pais = String(g.pais || 'ARG').trim().toUpperCase()

  return {
    CORMVI_NROCTA:     g.codigoProveedor || '',
    // En MAYÚSCULAS, como las guarda Softland: un 'honpro' cargado antes de
    // que se normalizara al guardar igual sale bien de acá
    CORMVI_TIPORI:     normalizarTipo(g.tipoProducto),
    CORMVI_ARTORI:     normalizarCodigo(g.codigoArticulo),
    CORMVI_TIPCPT:     'A',
    CORMVI_CODCPT:     'S000',
    CORMVI_COFLIS:     MONEDA_SOFTLAND[pais] || 'ARS',
    USR_CORMVI_NLIIVA: g.formalidad === 'INFORMAL' ? 'S' : 'N',
    // Regla 7: un gasto de viaje se carga siempre con cantidad 1
    USR_CORMVI_CANTID: 1,
    USR_CORMVI_PRECIO: importe,
    VIRT_TOTLIN:       importe,
    USR_CORMVI_PERLIQ: cab.periodoLiquidar.valor || '',
    // Vacía en el 99,96% de las líneas reales: el detalle del ticket no viaja
    CORMVI_TEXTOS:     '',
    // Softland copia legajo, empresa y nombre de la CABECERA a cada línea
    // (reglas 3 y 24): el padrón manda, el dato del gasto es el respaldo.
    USR_CORMVI_EMPLEG: cab.chofer.empresa || g.empresaChofer || cab.empresa || '',
    USR_CORMVI_NROLEG: cab.chofer.legajo || g.legajoChofer || '',
    USR_CORMVI_NROVIA: Number(g.nroViaje) || 0,
    // El número de rendición lo asigna Softland al grabar: hasta entonces, vacío
    USR_CORMVI_NROFOR: g.rendicion || '',
    USR_CORMVI_PATTRA: g.patenteTractor || cab.patente || '',
    USR_CORMVI_DELETE: 'N',
    // Fecha de SALIDA DEL VIAJE, no la del ticket: coincide en el 98%
    USR_CORMVI_FCHCAL: cab.salida.valor,
    // En RRFF son 0 en el 100% de las líneas: se completan recién al autorizar
    USR_CORMVI_COSAVI: 0,
    USR_CORMVI_VAITSE: 0,
    // Softland lo toma de USR_GTCHOF, que está en mayúsculas (100% de los casos)
    USR_CORMVI_NOMLEG: (cab.chofer.nombre || g.chofer || '').toUpperCase(),
    USR_CORMVI_CAJCAM: cab.cajaCamion,
    CORMVI_PRECIO:     importe,
    CORMVI_CANTID:     1,
    USR_CORMVI_PERIOD: cab.periodo,
    USR_CORMVI_FCHLLE: cab.llegada.valor,

    _gastoId:     g.id,
    _tieneFoto:   g.tieneFoto,
    _pais:        pais,
    _descripcion: g.descripcion || '',
    _fechaTicket: g.fecha ? String(g.fecha).slice(0, 10) : '',
    _formalidad:  g.formalidad || 'INFORMAL',
  }
}
