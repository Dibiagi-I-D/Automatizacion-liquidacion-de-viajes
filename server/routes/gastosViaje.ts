import { Router, Request, Response } from 'express'
import adminDb, { sql } from '../services/adminDbService.js'

const router = Router()

// ═══════════════════════════════════════════════════════════
// PERSISTENCIA: dibiagi_admin_db (NO DIBIAG — ver adminDbService)
// Tablas: dbo.gastos_viaje · dbo.aprobaciones_viaje
// ═══════════════════════════════════════════════════════════

interface Gasto {
  id: string
  nroViaje: number           // HOJA DE VIAJE N
  fecha: string              // FECHA SALIDA del viaje
  pais: string
  tipo: string
  tipoProducto: string       // TIPO DE PRODUCTO ORIGINAL (TARIFA, COMBLU, SERVIC, etc.)
  codigoArticulo: string     // CODIGO PRODUCTO ORIGINAL (10, 21, etc.)
  formalidad: string         // INFORMAL: 'INFORMAL' → 'S', 'FORMAL' → 'N'
  codigoProveedor: string    // PROVEEDOR — código numérico Softland (ej: 999999, 142, 177)
  importe: number            // PRECIO — precio unitario del gasto
  cantidad: number           // CANTIDAD — cantidad del movimiento
  // CANTIDAD final CORMVI. En los 23.251 movimientos RRFF reales de Softland
  // este campo vale 1 (23.199 registros) o 0 (52). Ninguno es negativo: el -1
  // que se usaba antes por defecto pertenece a otros formularios, no a RRFF.
  cantidadCormvi: number
  coeficienteViaje: number | null  // COEFICIENTE DE VIAJE SEGUN FECHA DE SALIDA
  valorItemSeleccionado: number    // VALOR DE ITEM SELECCIONADO
  valorCajaCamion: number | null   // VALOR DE LA CAJA CAMION
  descripcion?: string
  chofer: string             // NOMBRE EMPLEADO
  legajoChofer: string       // LEGAJO
  empresaChofer: string      // EMPRESA LEGAJO (ej: DIBIAG)
  patenteTractor: string     // TRACTOR
  rendicion: string          // RENDICION
  createdAt: string
  updatedAt?: string | null
  tieneFoto: boolean         // hay imagen del ticket adjunta
  fotoMime?: string | null   // 'image/jpeg', 'image/png', …
  fotoSubidaAt?: string | null
}

interface Aprobacion {
  nroViaje: number
  aprobadoPor: string
  fechaAprobacion: string
  totalImporte: number
}

// ═══════════════════════════════════════════════════════════════
// INTERFAZ CORMVI — Movimientos de Softland (formato de exportación)
// ═══════════════════════════════════════════════════════════════
interface CormviRecord {
  CORMVI_NROCTA: string      // PROVEEDOR
  CORMVI_TIPORI: string      // TIPO DE PRODUCTO ORIGINAL
  CORMVI_ARTORI: string      // CODIGO PRODUCTO ORIGINAL
  CORMVI_TIPCPT: string      // TIPO DE CONCEPTO — siempre 'A'
  CORMVI_CODCPT: string      // CONCEPTO — siempre 'S000'
  CORMVI_COFLIS: string      // COEFICIENTE — siempre 'ARS'
  USR_CORMVI_NLIIVA: string  // INFORMAL — 'S' informal / 'N' formal
  USR_CORMVI_CANTID: number  // CANTIDAD
  USR_CORMVI_PRECIO: number  // PRECIO
  VIRT_TOTLIN: number        // (virtual) CANTIDAD × PRECIO
  USR_CORMVI_PERLIQ: string  // PERIODO A LIQUIDAR (YYYYMM)
  USR_CORMVI_EMPLEG: string  // EMPRESA LEGAJO
  USR_CORMVI_NROLEG: string  // LEGAJO
  USR_CORMVI_NROVIA: number  // HOJA DE VIAJE N
  USR_CORMVI_NROFOR: string  // RENDICION
  USR_CORMVI_PATTRA: string  // TRACTOR
  USR_CORMVI_FCHCAL: string | null  // FECHA SALIDA
  USR_CORMVI_COSAVI: number | null  // COEF. VIAJE SEGUN FECHA SALIDA
  USR_CORMVI_VAITSE: number  // VALOR DE ITEM SELECCIONADO
  USR_CORMVI_NOMLEG: string  // NOMBRE EMPLEADO
  USR_CORMVI_CAJCAM: number | null  // VALOR DE LA CAJA CAMION
  CORMVI_PRECIO: number      // PRECIO (estándar Softland)
  CORMVI_CANTID: number      // CANTIDAD — en RRFF real siempre 1 (o 0), nunca negativa
}

function gastoToCormvi(gasto: Gasto): CormviRecord {
  const fechaGasto = new Date(gasto.fecha)
  const periodoLiq = `${fechaGasto.getFullYear()}${String(fechaGasto.getMonth() + 1).padStart(2, '0')}`
  const fechaSalida = gasto.fecha ? `${fechaGasto.toISOString().replace('T', ' ').replace('Z', '')}` : null

  return {
    CORMVI_NROCTA:         gasto.codigoProveedor || '',
    CORMVI_TIPORI:         gasto.tipoProducto || '',
    CORMVI_ARTORI:         gasto.codigoArticulo || '',
    CORMVI_TIPCPT:         'A',
    CORMVI_CODCPT:         'S000',
    CORMVI_COFLIS:         'ARS',
    USR_CORMVI_NLIIVA:     gasto.formalidad === 'INFORMAL' ? 'S' : 'N',
    USR_CORMVI_CANTID:     gasto.cantidad ?? 1,
    USR_CORMVI_PRECIO:     gasto.importe,
    VIRT_TOTLIN:           (gasto.cantidad ?? 1) * gasto.importe,
    USR_CORMVI_PERLIQ:     periodoLiq,
    USR_CORMVI_EMPLEG:     gasto.empresaChofer || '',
    USR_CORMVI_NROLEG:     gasto.legajoChofer || '',
    USR_CORMVI_NROVIA:     gasto.nroViaje,
    USR_CORMVI_NROFOR:     gasto.rendicion || gasto.id,
    USR_CORMVI_PATTRA:     gasto.patenteTractor || '',
    USR_CORMVI_FCHCAL:     fechaSalida,
    USR_CORMVI_COSAVI:     gasto.coeficienteViaje ?? null,
    USR_CORMVI_VAITSE:     gasto.valorItemSeleccionado ?? 0,
    USR_CORMVI_NOMLEG:     gasto.chofer || '',
    USR_CORMVI_CAJCAM:     gasto.valorCajaCamion ?? null,
    CORMVI_PRECIO:         gasto.importe,
    CORMVI_CANTID:         gasto.cantidadCormvi ?? 1,
  }
}

// ─── Mapeo fila SQL → objeto Gasto (mismas claves que antes) ───
function rowToGasto(r: any): Gasto {
  return {
    id:                    r.id,
    nroViaje:              r.nro_viaje,
    fecha:                 r.fecha ? new Date(r.fecha).toISOString() : '',
    pais:                  r.pais || '',
    tipo:                  r.tipo || '',
    tipoProducto:          r.tipo_producto || '',
    codigoArticulo:        r.codigo_articulo || '',
    formalidad:            r.formalidad || 'INFORMAL',
    codigoProveedor:       r.codigo_proveedor || '',
    importe:               Number(r.importe),
    cantidad:              Number(r.cantidad),
    cantidadCormvi:        Number(r.cantidad_cormvi),
    coeficienteViaje:      r.coeficiente_viaje === null ? null : Number(r.coeficiente_viaje),
    valorItemSeleccionado: r.valor_item_seleccionado === null ? 0 : Number(r.valor_item_seleccionado),
    valorCajaCamion:       r.valor_caja_camion === null ? null : Number(r.valor_caja_camion),
    descripcion:           r.descripcion || undefined,
    chofer:                r.chofer || '',
    legajoChofer:          r.legajo_chofer || '',
    empresaChofer:         r.empresa_chofer || '',
    patenteTractor:        r.patente_tractor || '',
    rendicion:             r.rendicion || '',
    createdAt:             r.created_at ? new Date(r.created_at).toISOString() : '',
    updatedAt:             r.updated_at ? new Date(r.updated_at).toISOString() : null,
    tieneFoto:             Number(r.tiene_foto) === 1,
    fotoMime:              r.foto_mime || null,
    fotoSubidaAt:          r.foto_subida_at ? new Date(r.foto_subida_at).toISOString() : null,
  }
}

/**
 * Convierte un data URL ("data:image/jpeg;base64,…") en binario.
 * Devuelve null si no hay imagen; lanza si el formato es inválido o excede el tope.
 */
const MAX_FOTO_BYTES = 8 * 1024 * 1024   // 8 MB ya decodificados

function parseFoto(dataUrl: any): { buffer: Buffer; mime: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) {
    throw Object.assign(new Error('La foto debe ser un data URL de imagen en base64'), { statusCode: 400 })
  }

  const mime = match[1]
  const buffer = Buffer.from(match[2], 'base64')

  if (buffer.length === 0) {
    throw Object.assign(new Error('La foto llegó vacía'), { statusCode: 400 })
  }
  if (buffer.length > MAX_FOTO_BYTES) {
    throw Object.assign(
      new Error(`La foto pesa ${(buffer.length / 1024 / 1024).toFixed(1)} MB; el máximo es 8 MB`),
      { statusCode: 413 }
    )
  }

  return { buffer, mime }
}

// Columnas "livianas". La foto (VARBINARY(MAX)) NUNCA se incluye acá: se sirve
// aparte por GET /:id/foto para que un listado no arrastre megabytes por fila.
const COLS = [
  'id', 'nro_viaje', 'fecha', 'pais', 'tipo', 'tipo_producto', 'codigo_articulo',
  'formalidad', 'codigo_proveedor', 'importe', 'cantidad', 'cantidad_cormvi',
  'coeficiente_viaje', 'valor_item_seleccionado', 'valor_caja_camion', 'descripcion',
  'chofer', 'legajo_chofer', 'empresa_chofer', 'patente_tractor', 'rendicion',
  'created_at', 'updated_at', 'foto_mime', 'foto_subida_at',
]

/** Lista para SELECT: columnas livianas + flag de existencia de foto. */
const SELECT_LIST = `${COLS.join(', ')}, CASE WHEN foto IS NULL THEN 0 ELSE 1 END AS tiene_foto`

/** Lista para OUTPUT de INSERT/UPDATE (mismas columnas, prefijadas). */
const OUTPUT_LIST =
  `${COLS.map(c => `INSERTED.${c}`).join(', ')}, ` +
  `CASE WHEN INSERTED.foto IS NULL THEN 0 ELSE 1 END AS tiene_foto`

/**
 * Respuesta uniforme cuando la base no está disponible.
 * `esEscritura` cambia el mensaje: en un alta/edición es crítico que el usuario
 * sepa que el dato NO quedó guardado; en una lectura sólo hubo un fallo de consulta.
 */
function dbError(res: Response, error: any, accion: string, esEscritura = false) {
  console.error(`[GastosViaje] Error al ${accion}:`, error?.message || error)
  const sinConexion = ['ESOCKET', 'ETIMEOUT', 'ELOGIN', 'ECONNCLOSED'].includes(error?.code)

  let mensaje: string
  if (sinConexion && esEscritura) {
    mensaje = `No hay conexión con la base de datos. El cambio NO se guardó — reintentá en unos segundos.`
  } else if (sinConexion) {
    mensaje = `No hay conexión con la base de datos. No se pudo ${accion}.`
  } else {
    mensaje = `Error al ${accion}`
  }

  return res.status(sinConexion ? 503 : 500).json({
    success: false,
    error: mensaje,
    message: error?.message,
  })
}

/** Normaliza texto de entrada: recorta espacios (el legajo llega con padding desde la API externa). */
const txt = (v: any): string => (v === undefined || v === null ? '' : String(v).trim())
const numOr = (v: any, def: number): number => (v === undefined || v === null || v === '' ? def : parseFloat(v))
const numOrNull = (v: any): number | null => (v === undefined || v === null || v === '' ? null : parseFloat(v))

// ═══════════════════════════════════════════════
// GET /api/gastos-viaje — Todos los gastos
// ═══════════════════════════════════════════════
router.get('/', async (req: Request, res: Response) => {
  try {
    const rq = await adminDb.request()
    const result = await rq.query(`SELECT ${SELECT_LIST} FROM dbo.gastos_viaje ORDER BY created_at DESC`)
    const data = result.recordset.map(rowToGasto)
    res.json({ success: true, data, total: data.length })
  } catch (error: any) {
    return dbError(res, error, 'obtener los gastos')
  }
})

// ═══════════════════════════════════════════════
// POST /api/gastos-viaje — Crear un gasto
// ═══════════════════════════════════════════════
router.post('/', async (req: Request, res: Response) => {
  const {
    nroViaje, fecha, pais, tipo,
    tipoProducto, codigoArticulo, formalidad,
    codigoProveedor,
    importe, cantidad, cantidadCormvi,
    coeficienteViaje, valorItemSeleccionado, valorCajaCamion,
    descripcion,
    chofer, legajoChofer, empresaChofer,
    patenteTractor, rendicion,
    foto
  } = req.body

  if (!nroViaje || !fecha || !pais || importe === undefined) {
    return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' })
  }

  const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  const importeNum = parseFloat(importe)

  // La foto es opcional: si viene mal formada avisamos, pero nunca perdemos el gasto
  let fotoParsed: { buffer: Buffer; mime: string } | null = null
  try {
    fotoParsed = parseFoto(foto)
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ success: false, error: err.message })
  }

  try {
    const rq = await adminDb.request()
    rq.input('id',                     sql.NVarChar(64),   id)
    rq.input('nro_viaje',              sql.Int,            parseInt(nroViaje))
    rq.input('fecha',                  sql.DateTime2,      new Date(fecha))
    rq.input('pais',                   sql.NVarChar(8),    txt(pais))
    rq.input('tipo',                   sql.NVarChar(200),  txt(tipo) || 'COMBUSTIBLE')
    rq.input('tipo_producto',          sql.NVarChar(32),   txt(tipoProducto))
    rq.input('codigo_articulo',        sql.NVarChar(32),   txt(codigoArticulo))
    rq.input('formalidad',             sql.NVarChar(16),   txt(formalidad) || 'INFORMAL')
    rq.input('codigo_proveedor',       sql.NVarChar(64),   txt(codigoProveedor))
    rq.input('importe',                sql.Decimal(18, 4), importeNum)
    rq.input('cantidad',               sql.Decimal(18, 4), numOr(cantidad, 1))
    rq.input('cantidad_cormvi',        sql.Decimal(18, 4), numOr(cantidadCormvi, 1))
    rq.input('coeficiente_viaje',      sql.Decimal(18, 6), numOrNull(coeficienteViaje))
    rq.input('valor_item',             sql.Decimal(18, 4), numOr(valorItemSeleccionado, importeNum))
    rq.input('valor_caja_camion',      sql.Decimal(18, 4), numOrNull(valorCajaCamion))
    rq.input('descripcion',            sql.NVarChar(500),  txt(descripcion) || null)
    rq.input('chofer',                 sql.NVarChar(200),  txt(chofer))
    rq.input('legajo_chofer',          sql.NVarChar(64),   txt(legajoChofer))
    rq.input('empresa_chofer',         sql.NVarChar(64),   txt(empresaChofer))
    rq.input('patente_tractor',        sql.NVarChar(64),   txt(patenteTractor))
    rq.input('rendicion',              sql.NVarChar(64),   txt(rendicion))
    rq.input('foto',                   sql.VarBinary(sql.MAX), fotoParsed?.buffer ?? null)
    rq.input('foto_mime',              sql.NVarChar(64),       fotoParsed?.mime ?? null)

    const result = await rq.query(`
      INSERT INTO dbo.gastos_viaje (
        id, nro_viaje, fecha, pais, tipo, tipo_producto, codigo_articulo, formalidad,
        codigo_proveedor, importe, cantidad, cantidad_cormvi, coeficiente_viaje,
        valor_item_seleccionado, valor_caja_camion, descripcion, chofer, legajo_chofer,
        empresa_chofer, patente_tractor, rendicion, foto, foto_mime, foto_subida_at
      )
      OUTPUT ${OUTPUT_LIST}
      VALUES (
        @id, @nro_viaje, @fecha, @pais, @tipo, @tipo_producto, @codigo_articulo, @formalidad,
        @codigo_proveedor, @importe, @cantidad, @cantidad_cormvi, @coeficiente_viaje,
        @valor_item, @valor_caja_camion, @descripcion, @chofer, @legajo_chofer,
        @empresa_chofer, @patente_tractor, @rendicion,
        @foto, @foto_mime, CASE WHEN @foto IS NULL THEN NULL ELSE SYSUTCDATETIME() END
      )
    `)

    const creado = rowToGasto(result.recordset[0])
    console.log(
      `[Gastos] Guardado en BD: Viaje ${creado.nroViaje} | $${creado.importe} | ${creado.chofer}` +
      (fotoParsed ? ` | foto ${(fotoParsed.buffer.length / 1024).toFixed(0)} KB` : ' | sin foto')
    )
    res.status(201).json({ success: true, data: creado })
  } catch (error: any) {
    return dbError(res, error, 'guardar el gasto', true)
  }
})

// ═══════════════════════════════════════════════
// PUT /api/gastos-viaje/:id — Editar un gasto
// Actualiza sólo los campos presentes en el body.
// ═══════════════════════════════════════════════
const CAMPOS_EDITABLES: Record<string, { col: string; type: any; parse: (v: any) => any }> = {
  nroViaje:              { col: 'nro_viaje',               type: sql.Int,            parse: (v) => parseInt(v) },
  fecha:                 { col: 'fecha',                   type: sql.DateTime2,      parse: (v) => new Date(v) },
  pais:                  { col: 'pais',                    type: sql.NVarChar(8),    parse: txt },
  tipo:                  { col: 'tipo',                    type: sql.NVarChar(200),  parse: txt },
  tipoProducto:          { col: 'tipo_producto',           type: sql.NVarChar(32),   parse: txt },
  codigoArticulo:        { col: 'codigo_articulo',         type: sql.NVarChar(32),   parse: txt },
  formalidad:            { col: 'formalidad',              type: sql.NVarChar(16),   parse: txt },
  codigoProveedor:       { col: 'codigo_proveedor',        type: sql.NVarChar(64),   parse: txt },
  importe:               { col: 'importe',                 type: sql.Decimal(18, 4), parse: (v) => parseFloat(v) },
  cantidad:              { col: 'cantidad',                type: sql.Decimal(18, 4), parse: (v) => parseFloat(v) },
  cantidadCormvi:        { col: 'cantidad_cormvi',         type: sql.Decimal(18, 4), parse: (v) => parseFloat(v) },
  coeficienteViaje:      { col: 'coeficiente_viaje',       type: sql.Decimal(18, 6), parse: numOrNull },
  valorItemSeleccionado: { col: 'valor_item_seleccionado', type: sql.Decimal(18, 4), parse: (v) => parseFloat(v) },
  valorCajaCamion:       { col: 'valor_caja_camion',       type: sql.Decimal(18, 4), parse: numOrNull },
  descripcion:           { col: 'descripcion',             type: sql.NVarChar(500),  parse: (v) => txt(v) || null },
  chofer:                { col: 'chofer',                  type: sql.NVarChar(200),  parse: txt },
  legajoChofer:          { col: 'legajo_chofer',           type: sql.NVarChar(64),   parse: txt },
  empresaChofer:         { col: 'empresa_chofer',          type: sql.NVarChar(64),   parse: txt },
  patenteTractor:        { col: 'patente_tractor',         type: sql.NVarChar(64),   parse: txt },
  rendicion:             { col: 'rendicion',               type: sql.NVarChar(64),   parse: txt },
}

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const sets: string[] = []

  // La foto se maneja aparte: es binaria y admite reemplazo o borrado explícito
  let fotoParsed: { buffer: Buffer; mime: string } | null = null
  const borrarFoto = req.body.foto === null
  if (req.body.foto !== undefined && !borrarFoto) {
    try {
      fotoParsed = parseFoto(req.body.foto)
    } catch (err: any) {
      return res.status(err.statusCode || 400).json({ success: false, error: err.message })
    }
  }

  try {
    const rq = await adminDb.request()
    rq.input('id', sql.NVarChar(64), id)

    for (const [key, def] of Object.entries(CAMPOS_EDITABLES)) {
      if (req.body[key] !== undefined) {
        rq.input(def.col, def.type, def.parse(req.body[key]))
        sets.push(`${def.col} = @${def.col}`)
      }
    }

    if (fotoParsed) {
      rq.input('foto',      sql.VarBinary(sql.MAX), fotoParsed.buffer)
      rq.input('foto_mime', sql.NVarChar(64),       fotoParsed.mime)
      sets.push('foto = @foto', 'foto_mime = @foto_mime', 'foto_subida_at = SYSUTCDATETIME()')
    } else if (borrarFoto) {
      sets.push('foto = NULL', 'foto_mime = NULL', 'foto_subida_at = NULL')
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'No se envió ningún campo para actualizar' })
    }

    sets.push('updated_at = SYSUTCDATETIME()')

    const result = await rq.query(`
      UPDATE dbo.gastos_viaje
      SET ${sets.join(', ')}
      OUTPUT ${OUTPUT_LIST}
      WHERE id = @id
    `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Gasto no encontrado' })
    }

    const actualizado = rowToGasto(result.recordset[0])
    console.log(`[Gastos] Editado: ${id} | Viaje ${actualizado.nroViaje} | $${actualizado.importe}`)
    res.json({ success: true, data: actualizado })
  } catch (error: any) {
    return dbError(res, error, 'editar el gasto', true)
  }
})

// ═══════════════════════════════════════════════
// GET /api/gastos-viaje/resumen/por-viaje
// ═══════════════════════════════════════════════
router.get('/resumen/por-viaje', async (req: Request, res: Response) => {
  try {
    const rq = await adminDb.request()
    const result = await rq.query(`SELECT ${SELECT_LIST} FROM dbo.gastos_viaje`)

    const resumen: Record<number, { gastos: Gasto[]; total: number; cantidad: number }> = {}
    result.recordset.map(rowToGasto).forEach(g => {
      if (!resumen[g.nroViaje]) resumen[g.nroViaje] = { gastos: [], total: 0, cantidad: 0 }
      resumen[g.nroViaje].gastos.push(g)
      resumen[g.nroViaje].total += g.importe
      resumen[g.nroViaje].cantidad++
    })

    res.json({ success: true, data: resumen })
  } catch (error: any) {
    return dbError(res, error, 'obtener el resumen')
  }
})

// ════════════════════════════════
// APROBACIONES
// ════════════════════════════════

router.get('/aprobaciones/todas', async (req: Request, res: Response) => {
  try {
    const rq = await adminDb.request()
    const result = await rq.query(`
      SELECT nro_viaje, aprobado_por, fecha_aprobacion, total_importe
      FROM dbo.aprobaciones_viaje
    `)

    const data: Record<number, Aprobacion> = {}
    result.recordset.forEach(r => {
      data[r.nro_viaje] = {
        nroViaje: r.nro_viaje,
        aprobadoPor: r.aprobado_por || 'Administrador',
        fechaAprobacion: new Date(r.fecha_aprobacion).toISOString(),
        totalImporte: Number(r.total_importe),
      }
    })

    res.json({ success: true, data })
  } catch (error: any) {
    return dbError(res, error, 'obtener las aprobaciones')
  }
})

router.post('/aprobaciones/:nroViaje', async (req: Request, res: Response) => {
  const nroViaje = parseInt(req.params.nroViaje)
  const { aprobadoPor } = req.body

  try {
    const rqTotal = await adminDb.request()
    rqTotal.input('nro_viaje', sql.Int, nroViaje)
    const totalRes = await rqTotal.query(`
      SELECT COUNT(*) AS cantidad, ISNULL(SUM(importe), 0) AS total
      FROM dbo.gastos_viaje WHERE nro_viaje = @nro_viaje
    `)

    if (Number(totalRes.recordset[0].cantidad) === 0) {
      return res.status(404).json({ success: false, error: 'No hay gastos para este viaje' })
    }
    const totalImporte = Number(totalRes.recordset[0].total)

    const rq = await adminDb.request()
    rq.input('nro_viaje',     sql.Int,            nroViaje)
    rq.input('aprobado_por',  sql.NVarChar(200),  txt(aprobadoPor) || 'Administrador')
    rq.input('total_importe', sql.Decimal(18, 4), totalImporte)

    await rq.query(`
      MERGE dbo.aprobaciones_viaje AS destino
      USING (SELECT @nro_viaje AS nro_viaje) AS origen
        ON destino.nro_viaje = origen.nro_viaje
      WHEN MATCHED THEN
        UPDATE SET aprobado_por = @aprobado_por,
                   fecha_aprobacion = SYSUTCDATETIME(),
                   total_importe = @total_importe
      WHEN NOT MATCHED THEN
        INSERT (nro_viaje, aprobado_por, total_importe)
        VALUES (@nro_viaje, @aprobado_por, @total_importe);
    `)

    const rqGet = await adminDb.request()
    rqGet.input('nro_viaje', sql.Int, nroViaje)
    const out = await rqGet.query(`
      SELECT nro_viaje, aprobado_por, fecha_aprobacion, total_importe
      FROM dbo.aprobaciones_viaje WHERE nro_viaje = @nro_viaje
    `)
    const r = out.recordset[0]

    console.log(`[Gastos] Aprobado Viaje ${nroViaje} | $${totalImporte} | por ${r.aprobado_por}`)
    res.json({
      success: true,
      data: {
        nroViaje: r.nro_viaje,
        aprobadoPor: r.aprobado_por,
        fechaAprobacion: new Date(r.fecha_aprobacion).toISOString(),
        totalImporte: Number(r.total_importe),
      }
    })
  } catch (error: any) {
    return dbError(res, error, 'aprobar la rendición', true)
  }
})

router.delete('/aprobaciones/:nroViaje', async (req: Request, res: Response) => {
  const nroViaje = parseInt(req.params.nroViaje)
  try {
    const rq = await adminDb.request()
    rq.input('nro_viaje', sql.Int, nroViaje)
    const result = await rq.query('DELETE FROM dbo.aprobaciones_viaje WHERE nro_viaje = @nro_viaje')

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false, error: 'No hay aprobación para este viaje' })
    }
    console.log(`[Gastos] Revocado Viaje ${nroViaje}`)
    res.json({ success: true })
  } catch (error: any) {
    return dbError(res, error, 'revocar la aprobación', true)
  }
})

// ════════════════════════════════════════════════════════════
// EXPORTACIÓN CORMVI
// ════════════════════════════════════════════════════════════
router.get('/exportar-cormvi/:nroViaje', async (req: Request, res: Response) => {
  const nroViaje = parseInt(req.params.nroViaje)

  try {
    const rqAp = await adminDb.request()
    rqAp.input('nro_viaje', sql.Int, nroViaje)
    const ap = await rqAp.query(`
      SELECT nro_viaje, aprobado_por, fecha_aprobacion, total_importe
      FROM dbo.aprobaciones_viaje WHERE nro_viaje = @nro_viaje
    `)

    if (ap.recordset.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El viaje debe estar aprobado antes de exportar a CORMVI'
      })
    }

    const rq = await adminDb.request()
    rq.input('nro_viaje', sql.Int, nroViaje)
    const result = await rq.query(`
      SELECT ${SELECT_LIST} FROM dbo.gastos_viaje WHERE nro_viaje = @nro_viaje ORDER BY created_at
    `)

    const gastosDelViaje = result.recordset.map(rowToGasto)
    if (gastosDelViaje.length === 0) {
      return res.status(404).json({ success: false, error: 'No hay gastos para este viaje' })
    }

    const registrosCormvi = gastosDelViaje.map(g => gastoToCormvi(g))
    const totalImporte = gastosDelViaje.reduce((sum, g) => sum + g.importe, 0)
    const a = ap.recordset[0]

    console.log(`[CORMVI] Exportando Viaje ${nroViaje} | ${registrosCormvi.length} registros | Total: $${totalImporte}`)

    res.json({
      success: true,
      data: {
        nroViaje,
        chofer: gastosDelViaje[0]?.chofer || '',
        legajoChofer: gastosDelViaje[0]?.legajoChofer || '',
        patenteTractor: gastosDelViaje[0]?.patenteTractor || '',
        totalRegistros: registrosCormvi.length,
        totalImporte,
        aprobacion: {
          nroViaje: a.nro_viaje,
          aprobadoPor: a.aprobado_por,
          fechaAprobacion: new Date(a.fecha_aprobacion).toISOString(),
          totalImporte: Number(a.total_importe),
        },
        registros: registrosCormvi,
        gastosOriginales: gastosDelViaje
      }
    })
  } catch (error: any) {
    return dbError(res, error, 'exportar a CORMVI')
  }
})

// ═══════════════════════════════════════════════════════════════
// FOTO DEL TICKET
// Ruta de 2 segmentos → no la captura GET /:nroViaje (1 segmento)
// ═══════════════════════════════════════════════════════════════

// ─── GET /api/gastos-viaje/:id/foto ── Sirve la imagen del ticket ───
router.get('/:id/foto', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const rq = await adminDb.request()
    rq.input('id', sql.NVarChar(64), id)
    const result = await rq.query(`
      SELECT foto, foto_mime FROM dbo.gastos_viaje WHERE id = @id
    `)

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Gasto no encontrado' })
    }

    const { foto, foto_mime } = result.recordset[0]
    if (!foto) {
      return res.status(404).json({ success: false, error: 'Este gasto no tiene foto adjunta' })
    }

    res.setHeader('Content-Type', foto_mime || 'image/jpeg')
    res.setHeader('Content-Length', foto.length)
    // La imagen de un gasto no cambia salvo reemplazo explícito
    res.setHeader('Cache-Control', 'private, max-age=3600')
    return res.send(foto)
  } catch (error: any) {
    return dbError(res, error, 'obtener la foto')
  }
})

// ═══════════════════════════════════════════════════════════════
// RUTAS PARAMÉTRICAS — DEBEN IR AL FINAL (catchall)
// ═══════════════════════════════════════════════════════════════

router.get('/:nroViaje', async (req: Request, res: Response) => {
  const nroViaje = parseInt(req.params.nroViaje)
  if (isNaN(nroViaje)) {
    return res.status(400).json({ success: false, error: 'Número de viaje inválido' })
  }

  try {
    const rq = await adminDb.request()
    rq.input('nro_viaje', sql.Int, nroViaje)
    const result = await rq.query(`
      SELECT ${SELECT_LIST} FROM dbo.gastos_viaje WHERE nro_viaje = @nro_viaje ORDER BY created_at
    `)
    const data = result.recordset.map(rowToGasto)
    res.json({ success: true, data, total: data.length })
  } catch (error: any) {
    return dbError(res, error, 'obtener los gastos del viaje')
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const rq = await adminDb.request()
    rq.input('id', sql.NVarChar(64), id)
    const result = await rq.query('DELETE FROM dbo.gastos_viaje WHERE id = @id')

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ success: false, error: 'Gasto no encontrado' })
    }
    console.log(`[Gastos] Eliminado: ${id}`)
    res.json({ success: true })
  } catch (error: any) {
    return dbError(res, error, 'eliminar el gasto', true)
  }
})

export default router
