import sqlServerService from './sqlServerService.js'
import type { Cabecera, FilaCormvi } from './cormviService.js'
import {
  buscarConcepto, codigosDe, normalizarTipo, normalizarCodigo, TIPOS_VALIDOS,
} from './conceptosSoftland.js'

/**
 * ════════════════════════════════════════════════════════════════════
 * LAS REGLAS DE SOFTLAND, CORRIENDO EN EL PANEL
 * ════════════════════════════════════════════════════════════════════
 *
 * Softland valida las rendiciones con el motor GRTQVH/GRTQVI: 51 reglas
 * en el contexto `CORMVH`, que se disparan MIENTRAS administración tipea
 * en la pantalla. No son triggers de base de datos: si algo escribe
 * directo en las tablas, ninguna corre.
 *
 * De esas 51, solo las que declaran el contexto `USR_CO_RRFF` (cargar una
 * rendición de gastos de viaje) aplican acá. Las otras son de otras
 * pantallas: consumo interno, entrega de ropa de trabajo, tesorería,
 * autorización de reposición.
 *
 * Cada función de este archivo replica UNA regla, con:
 *   - su número tal como está en GRTQVI (para poder ir a buscarla)
 *   - el mensaje de error TEXTUAL de Softland, sin reescribir
 *   - si bloquea o solo avisa (GRTQVI_ISWARN)
 *
 * Objetivo: que lo que el panel rechaza sea exactamente lo que Softland
 * rechazaría, y con las mismas palabras. Si una regla cambia en el ERP,
 * hay que cambiarla acá: son dos copias del mismo criterio.
 *
 * De DIBIAG solo se LEE.
 *
 * ── Dos cosas que se ven al leer las reglas en la base ──────────────
 *
 * Regla 43 (carga el coeficiente de viaje en USR_CORMVI_COSAVI) tiene la
 * consulta mal escrita en el ERP: `select (USR_COFALT_VALOR from USR_COFALT
 * where ...)`, sin SELECT adentro del paréntesis. Nunca puede ejecutarse.
 * Por eso COSAVI y VAITSE están en 0 en el 100% de las líneas RRFF reales,
 * y por eso acá también van en 0: replicar la regla "buena" daría un valor
 * que Softland no tiene.
 *
 * Regla 30 calcula el dinero entregado sumando CJRMVI con moneda 'ARS',
 * pero 45.685 de esos movimientos tienen la moneda vacía, así que en la
 * pantalla del ERP el importe suele figurar en blanco aunque haya dinero
 * entregado. El panel muestra el total real y lo aclara.
 */

export type NivelRegla = 'bloquea' | 'aviso'

export interface Hallazgo {
  /** Número de regla en GRTQVI, contexto CORMVH */
  regla: number
  nivel: NivelRegla
  /** El mensaje tal cual lo muestra Softland */
  mensaje: string
  /** Aclaración nuestra: qué hacer. No viene del ERP. */
  comoSeArregla?: string
  /** Si el problema es de una línea y no de la cabecera */
  gastoId?: string
}

const hoyISO = () => new Date().toISOString().slice(0, 10)

/**
 * Corre las reglas del contexto USR_CO_RRFF sobre una rendición armada.
 * Devuelve los hallazgos ordenados: primero lo que bloquea.
 */
export async function validarRendicion(cab: Cabecera, registros: FilaCormvi[]): Promise<Hallazgo[]> {
  const h: Hallazgo[] = []

  // ── Regla 13 — el número de viaje no puede estar vacío ──
  if (!cab.nroViaje) {
    h.push({
      regla: 13,
      nivel: 'bloquea',
      mensaje: 'El numero de viaje no puede estar vacio',
    })
  }

  // ── Regla 16 — el chofer tiene que ser de la empresa de la rendición ──
  // Softland compara la empresa del legajo (USR_GTCHOF) contra la empresa
  // del comprobante. Si el chofer es de otra, no se puede rendir acá.
  if (cab.chofer.nombre && cab.chofer.enPadron && cab.empresa &&
      cab.chofer.empresa && cab.chofer.empresa !== cab.empresa) {
    h.push({
      regla: 16,
      nivel: 'bloquea',
      mensaje: 'El chofer que esta seleccionando NO PERTENECE A LA EMPRESA en la que esta realizando la rendicion',
      comoSeArregla: `${cab.chofer.nombre} figura en ${cab.chofer.empresa} y la hoja de ruta es de ${cab.empresa}.`,
    })
  }

  // El chofer tiene que estar en el padrón o no hay legajo que poner
  if (cab.chofer.nombre && !cab.chofer.enPadron) {
    h.push({
      regla: 13,
      nivel: 'bloquea',
      mensaje: 'El chofer no figura en el padrón de Softland (USR_GTCHOF)',
      comoSeArregla: `Sin el legajo de ${cab.chofer.nombre}, Softland no puede completar la rendición.`,
    })
  }

  // ── Regla 24 — cada línea necesita viaje, legajo y nombre ──
  for (const r of registros) {
    const falta: string[] = []
    if (!r.USR_CORMVI_NROVIA) falta.push('Nro de Viaje')
    if (!String(r.USR_CORMVI_NROLEG || '').trim()) falta.push('Nro de legajo')
    if (!String(r.USR_CORMVI_NOMLEG || '').trim()) falta.push('Nombre de empleado')
    if (falta.length) {
      h.push({
        regla: 24,
        nivel: 'bloquea',
        mensaje: 'Hay campos de datos necesarios (Nro de Viaje, Nro de lgajo o Nombre de empleado, SIN DATOS, revise y vuelva a intentar',
        comoSeArregla: `Falta: ${falta.join(', ')}.`,
        gastoId: r._gastoId,
      })
    }
  }

  // ── El par (TIPORI, ARTORI) tiene que existir en el maestro ──
  // No es una regla de GRTQVI: Softland no deja elegir un par inexistente
  // porque el concepto se toma de una lista, no se escribe. Como acá sí se
  // escribe (lo propone el OCR), hay que controlarlo antes.
  for (const r of registros) {
    const tipo = normalizarTipo(r.CORMVI_TIPORI)
    const codigo = normalizarCodigo(r.CORMVI_ARTORI)
    if (!tipo && !codigo) {
      h.push({
        regla: 0, nivel: 'bloquea', gastoId: r._gastoId,
        mensaje: 'El gasto no tiene concepto (tipo de producto y código)',
      })
      continue
    }
    if (buscarConcepto(tipo, codigo)) continue

    const codigos = codigosDe(tipo)
    h.push({
      regla: 0,
      nivel: 'bloquea',
      gastoId: r._gastoId,
      mensaje: `El concepto ${tipo || '(vacío)'} / ${codigo || '(vacío)'} no existe en el maestro de productos de Softland`,
      comoSeArregla: codigos.length
        ? `${tipo} admite los códigos ${codigos.slice().sort((a, b) => Number(a) - Number(b)).join(', ')}.`
        : `Los tipos válidos son ${TIPOS_VALIDOS.join(', ')}.`,
    })
  }

  // ── Reglas 30 y 34 — el viaje ya se rindió ──
  // 30 bloquea si ya hay una RRFF para esa hoja de ruta en la misma empresa.
  // 34 solo avisa si ya existe la CRFF.
  if (cab.nroViaje && cab.empresa) {
    const previas = await sqlServerService.query<any>(`
      SELECT LTRIM(RTRIM(CORMVH_CODFOR)) AS formulario,
             LTRIM(RTRIM(CORMVH_NROFOR)) AS numero
      FROM CORMVH
      WHERE USR_CORMVH_NROVIA = @nro
        AND LTRIM(RTRIM(CORMVH_CODEMP)) = @emp
        AND CORMVH_CODFOR IN ('RRFF', 'CRFF')
    `, { nro: cab.nroViaje, emp: cab.empresa })

    const rrff = previas.find(p => p.formulario === 'RRFF')
    const crff = previas.find(p => p.formulario === 'CRFF')

    if (rrff) {
      h.push({
        regla: 30,
        nivel: 'bloquea',
        mensaje: 'El numero de Hoja de Ruta seleccionado YA FUE UTILIZADO',
        comoSeArregla: `Ya existe la RRFF N° ${rrff.numero} para el viaje ${cab.nroViaje} en ${cab.empresa}.`,
      })
    }
    if (crff) {
      h.push({
        regla: 34,
        nivel: 'aviso',
        mensaje: 'ATENCION!!!! ESTE NUMERO DE VIAJE HA SIDO CARGADO PREVIAMENTE',
        comoSeArregla: `Ya existe la CRFF N° ${crff.numero}.`,
      })
    }
  }

  // ── Regla 41 — la salida no puede ser posterior a la llegada ──
  if (cab.salida.valor && cab.llegada.valor && cab.salida.valor > cab.llegada.valor) {
    h.push({
      regla: 41,
      nivel: 'bloquea',
      mensaje: 'Fecha de Salida  NO PUEDE SER MAYOR que la fecha de Llegada',
    })
  }

  // ── Regla 33 — la llegada no puede ser futura ──
  if (cab.llegada.valor && cab.llegada.valor > hoyISO()) {
    h.push({
      regla: 33,
      nivel: 'bloquea',
      mensaje: 'Fecha de llegada NO PUEDE SER MAYOR QUE LA FECHA ACTUAL',
    })
  }

  // ── Las fuentes de la llegada no coinciden ──
  // No es una regla del ERP: es información que antes no existía. Si el chofer
  // declaró un día y la hoja de ruta dice otro, conviene mirarlo antes de rendir.
  const { chofer: lleChofer, hoja: lleHoja } = cab.llegadaCandidatas
  if (lleChofer && lleHoja && lleChofer !== lleHoja) {
    const dd = (f: string) => f.split('-').reverse().join('/')
    h.push({
      regla: 0,
      nivel: 'aviso',
      mensaje: `El chofer declaró que llegó el ${dd(lleChofer)} y la hoja de ruta dice ${dd(lleHoja)}`,
      comoSeArregla: 'Se está usando la del chofer. Si la correcta es la otra, corregila en la cabecera.',
    })
  }

  // ── Regla 35 — si la llegada es hoy, Softland pide confirmarla ──
  if (cab.llegada.valor && cab.llegada.valor === hoyISO()) {
    h.push({
      regla: 35,
      nivel: 'aviso',
      mensaje: `¿Es correcta la fecha de llegada?: ${cab.llegada.valor.split('-').reverse().join('/')}`,
    })
  }

  // ── Sin fechas no hay rendición posible ──
  // No es una regla de GRTQVI: son campos obligatorios de la cabecera, que
  // en la pantalla de Softland no se pueden dejar vacíos.
  if (!cab.salida.valor) {
    h.push({ regla: 0, nivel: 'bloquea', mensaje: 'Falta la fecha de salida del viaje' })
  }
  if (!cab.llegada.valor) {
    h.push({ regla: 0, nivel: 'bloquea', mensaje: 'Falta la fecha de llegada del viaje' })
  }
  if (!cab.periodoLiquidar.valor) {
    h.push({ regla: 0, nivel: 'bloquea', mensaje: 'Falta el período a liquidar' })
  }

  return h.sort((a, b) => (a.nivel === b.nivel ? a.regla - b.regla : a.nivel === 'bloquea' ? -1 : 1))
}
