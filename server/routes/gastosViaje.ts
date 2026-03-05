import { Router, Request, Response } from 'express'

const router = Router()

// ═══════════════════════════════════════════════════════
// ALMACENAMIENTO EN MEMORIA (temporal, hasta conectar BD)
// ═══════════════════════════════════════════════════════
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
  cantidad: number           // CANTIDAD — cantidad del movimiento (ej: 1.0000, 0.0000)
  cantidadCormvi: number     // CANTIDAD final CORMVI: -1.0000 (débito) o 1.0000 (crédito)
  coeficienteViaje: number | null  // COEFICIENTE DE VIAJE SEGUN FECHA DE SALIDA
  valorItemSeleccionado: number    // VALOR DE ITEM SELECCIONADO
  valorCajaCamion: number | null   // VALOR DE LA CAJA CAMION (puede ser null)
  descripcion?: string
  chofer: string             // NOMBRE EMPLEADO — nombre completo del chofer
  legajoChofer: string       // LEGAJO — número de legajo del chofer
  empresaChofer: string      // EMPRESA LEGAJO — código empresa del chofer (ej: DIBIAG)
  patenteTractor: string     // TRACTOR — patente del tractor
  rendicion: string          // RENDICION — número de rendición
  createdAt: string
}

// ═══════════════════════════════════════════════════════════
// INTERFAZ CORMVI — Movimientos de Softland (tabla destino)
// Columnas en orden exacto del dataset de Softland:
// PROVEEDOR | TIPO PROD ORIG | COD PROD ORIG | TIPO CONCEPTO | CONCEPTO |
// COEFICIENTE | INFORMAL | CANTIDAD | PRECIO | PERIODO LIQ |
// EMPRESA LEGAJO | LEGAJO | HOJA VIAJE | RENDICION | TRACTOR |
// FECHA SALIDA | COEF VIAJE FECHA SALIDA | VALOR ITEM | NOMBRE EMPLEADO |
// VALOR CAJA CAMION | PRECIO | CANTIDAD
// ═══════════════════════════════════════════════════════════
interface CormviRecord {
  CORMVI_NROCTA: string      // PROVEEDOR — código numérico del proveedor (ej: 999999, 142, 177)
  CORMVI_TIPORI: string      // TIPO DE PRODUCTO ORIGINAL — TARIFA, COMBLU, SERVIC, etc.
  CORMVI_ARTORI: string      // CODIGO PRODUCTO ORIGINAL — número del artículo (ej: 10, 21)
  CORMVI_TIPCPT: string      // TIPO DE CONCEPTO — siempre 'A'
  CORMVI_CODCPT: string      // CONCEPTO — siempre 'S000'
  CORMVI_COFLIS: string      // COEFICIENTE — siempre 'ARS'
  USR_CORMVI_NLIIVA: string  // INFORMAL — 'S' = informal (no discrimina IVA), 'N' = formal (discrimina)
  USR_CORMVI_CANTID: number  // CANTIDAD — cantidad del movimiento (ej: 1.0000, 0.0000)
  USR_CORMVI_PRECIO: number  // PRECIO — precio unitario del gasto
  VIRT_TOTLIN: number        // (virtual) Total línea = CANTIDAD × PRECIO
  USR_CORMVI_PERLIQ: string  // PERIODO A LIQUIDAR — formato YYYYMM (ej: 202511)
  USR_CORMVI_EMPLEG: string  // EMPRESA LEGAJO — código empresa del chofer (ej: DIBIAG)
  USR_CORMVI_NROLEG: string  // LEGAJO — número de legajo del chofer (ej: 1253)
  USR_CORMVI_NROVIA: number  // HOJA DE VIAJE N — número de viaje/hoja de ruta
  USR_CORMVI_NROFOR: string  // RENDICION — número de rendición/formulario
  USR_CORMVI_PATTRA: string  // TRACTOR — patente del tractor (ej: MTZ 997)
  USR_CORMVI_FCHCAL: string | null  // FECHA SALIDA — fecha de salida del viaje (puede ser NULL)
  USR_CORMVI_COSAVI: number | null  // COEFICIENTE DE VIAJE SEGUN FECHA DE SALIDA (puede ser NULL)
  USR_CORMVI_VAITSE: number  // VALOR DE ITEM SELECCIONADO — valor calculado del ítem
  USR_CORMVI_NOMLEG: string  // NOMBRE EMPLEADO — nombre completo del chofer
  USR_CORMVI_CAJCAM: number | null  // VALOR DE LA CAJA CAMION (puede ser NULL)
  CORMVI_PRECIO: number      // PRECIO (estándar Softland) — precio del artículo base
  CORMVI_CANTID: number      // CANTIDAD (estándar Softland) — -1.0000 débito / 1.0000 crédito
}

// ═══════════════════════════════════════════════════════════
// DICCIONARIO DE CONCEPTO ESPECIAL — ya no aplica:
// TIPO DE CONCEPTO siempre es 'A' y CONCEPTO siempre es 'S000'
// según los datos reales de Softland
// ═══════════════════════════════════════════════════════════

/**
 * Convierte un Gasto a formato CORMVI para exportación a Softland
 * Columnas en el orden exacto del dataset:
 * PROVEEDOR | TIPO PROD | COD PROD | TIPO CONCEPTO | CONCEPTO | COEFICIENTE |
 * INFORMAL | CANTIDAD | PRECIO | PERIODO | EMPRESA | LEGAJO | HOJA VIAJE |
 * RENDICION | TRACTOR | FECHA SALIDA | COEF VIAJE | VALOR ITEM |
 * NOMBRE EMPLEADO | CAJA CAMION | PRECIO | CANTIDAD
 */
function gastoToCormvi(gasto: Gasto): CormviRecord {
  // Período de liquidación: YYYYMM de la fecha del gasto
  const fechaGasto = new Date(gasto.fecha)
  const periodoLiq = `${fechaGasto.getFullYear()}${String(fechaGasto.getMonth() + 1).padStart(2, '0')}`

  // Fecha de salida en formato YYYY-MM-DD HH:mm:ss.SSS o null
  const fechaSalida = gasto.fecha ? `${fechaGasto.toISOString().replace('T', ' ').replace('Z', '')}` : null

  return {
    CORMVI_NROCTA:         gasto.codigoProveedor || '',          // PROVEEDOR (ej: 999999, 142)
    CORMVI_TIPORI:         gasto.tipoProducto || '',             // TIPO PROD ORIG (ej: TARIFA)
    CORMVI_ARTORI:         gasto.codigoArticulo || '',           // COD PROD ORIG (ej: 10, 21)
    CORMVI_TIPCPT:         'A',                                  // TIPO CONCEPTO — siempre 'A'
    CORMVI_CODCPT:         'S000',                               // CONCEPTO — siempre 'S000'
    CORMVI_COFLIS:         'ARS',                                // COEFICIENTE — siempre 'ARS'
    USR_CORMVI_NLIIVA:     gasto.formalidad === 'INFORMAL' ? 'S' : 'N',  // INFORMAL S/N
    USR_CORMVI_CANTID:     gasto.cantidad ?? 1,                  // CANTIDAD
    USR_CORMVI_PRECIO:     gasto.importe,                        // PRECIO
    VIRT_TOTLIN:           (gasto.cantidad ?? 1) * gasto.importe, // (virtual) CANTIDAD × PRECIO
    USR_CORMVI_PERLIQ:     periodoLiq,                           // PERIODO A LIQUIDAR (YYYYMM)
    USR_CORMVI_EMPLEG:     gasto.empresaChofer || '',            // EMPRESA LEGAJO
    USR_CORMVI_NROLEG:     gasto.legajoChofer || '',             // LEGAJO
    USR_CORMVI_NROVIA:     gasto.nroViaje,                       // HOJA DE VIAJE N
    USR_CORMVI_NROFOR:     gasto.rendicion || gasto.id,          // RENDICION
    USR_CORMVI_PATTRA:     gasto.patenteTractor || '',           // TRACTOR
    USR_CORMVI_FCHCAL:     fechaSalida,                          // FECHA SALIDA (puede ser null)
    USR_CORMVI_COSAVI:     gasto.coeficienteViaje ?? null,       // COEF. VIAJE SEGUN FECHA SALIDA
    USR_CORMVI_VAITSE:     gasto.valorItemSeleccionado ?? 0,     // VALOR DE ITEM SELECCIONADO
    USR_CORMVI_NOMLEG:     gasto.chofer || '',                   // NOMBRE EMPLEADO
    USR_CORMVI_CAJCAM:     gasto.valorCajaCamion ?? null,        // VALOR DE LA CAJA CAMION
    CORMVI_PRECIO:         gasto.importe,                        // PRECIO (estándar Softland)
    CORMVI_CANTID:         gasto.cantidadCormvi ?? -1,           // CANTIDAD CORMVI (-1 débito / 1 crédito)
  }
}

interface Aprobacion {
  nroViaje: number
  aprobadoPor: string
  fechaAprobacion: string
  totalImporte: number
}

// Estos arrays viven en memoria del proceso Node
// Se pierden al reiniciar el servidor — suficiente para desarrollo/demo
let gastosEnMemoria: Gasto[] = []
let aprobacionesEnMemoria: Record<number, Aprobacion> = {}

// ─── GET /api/gastos-viaje ── Todos los gastos (para admin) ───
router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: gastosEnMemoria,
    total: gastosEnMemoria.length
  })
})

// ─── POST /api/gastos-viaje ── Crear un gasto ───
router.post('/', (req: Request, res: Response) => {
  const {
    nroViaje, fecha, pais, tipo,
    tipoProducto, codigoArticulo, formalidad,
    codigoProveedor,
    importe, cantidad, cantidadCormvi,
    coeficienteViaje, valorItemSeleccionado, valorCajaCamion,
    descripcion,
    chofer, legajoChofer, empresaChofer,
    patenteTractor, rendicion
  } = req.body

  if (!nroViaje || !fecha || !pais || importe === undefined) {
    return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' })
  }

  const nuevoGasto: Gasto = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    nroViaje:               parseInt(nroViaje),
    fecha,
    pais,
    tipo:                   tipo || 'COMBUSTIBLE',
    tipoProducto:           tipoProducto || '',
    codigoArticulo:         codigoArticulo || '',
    formalidad:             formalidad || 'INFORMAL',
    codigoProveedor:        codigoProveedor?.toString().trim() || '',   // PROVEEDOR (ej: 999999)
    importe:                parseFloat(importe),                         // PRECIO
    cantidad:               cantidad !== undefined ? parseFloat(cantidad) : 1,          // CANTIDAD
    cantidadCormvi:         cantidadCormvi !== undefined ? parseFloat(cantidadCormvi) : -1, // -1 débito
    coeficienteViaje:       coeficienteViaje !== undefined ? parseFloat(coeficienteViaje) : null,
    valorItemSeleccionado:  valorItemSeleccionado !== undefined ? parseFloat(valorItemSeleccionado) : parseFloat(importe),
    valorCajaCamion:        valorCajaCamion !== undefined ? parseFloat(valorCajaCamion) : null,
    descripcion:            descripcion?.trim() || undefined,
    chofer:                 chofer || '',
    legajoChofer:           legajoChofer || '',
    empresaChofer:          empresaChofer || '',
    patenteTractor:         patenteTractor || '',
    rendicion:              rendicion?.toString() || '',
    createdAt:              new Date().toISOString()
  }

  gastosEnMemoria.push(nuevoGasto)

  console.log(`[Gastos] Nuevo gasto: Viaje ${nroViaje} | $${importe} | ${chofer} | Total en memoria: ${gastosEnMemoria.length}`)

  res.status(201).json({
    success: true,
    data: nuevoGasto
  })
})

// ─── GET /api/gastos-viaje/resumen/por-viaje ── Resumen agrupado ───
router.get('/resumen/por-viaje', (req: Request, res: Response) => {
  const resumen: Record<number, { gastos: Gasto[]; total: number; cantidad: number }> = {}
  
  gastosEnMemoria.forEach(g => {
    if (!resumen[g.nroViaje]) {
      resumen[g.nroViaje] = { gastos: [], total: 0, cantidad: 0 }
    }
    resumen[g.nroViaje].gastos.push(g)
    resumen[g.nroViaje].total += g.importe
    resumen[g.nroViaje].cantidad++
  })

  res.json({ success: true, data: resumen })
})

// ════════════════════════════════
// APROBACIONES
// ════════════════════════════════

// ─── GET /api/gastos-viaje/aprobaciones/todas ── Todas las aprobaciones ───
router.get('/aprobaciones/todas', (req: Request, res: Response) => {
  res.json({ success: true, data: aprobacionesEnMemoria })
})

// ─── POST /api/gastos-viaje/aprobaciones/:nroViaje ── Aprobar rendición ───
router.post('/aprobaciones/:nroViaje', (req: Request, res: Response) => {
  const nroViaje = parseInt(req.params.nroViaje)
  const { aprobadoPor } = req.body

  const gastosDelViaje = gastosEnMemoria.filter(g => g.nroViaje === nroViaje)
  if (gastosDelViaje.length === 0) {
    return res.status(404).json({ success: false, error: 'No hay gastos para este viaje' })
  }

  const totalImporte = gastosDelViaje.reduce((sum, g) => sum + g.importe, 0)

  aprobacionesEnMemoria[nroViaje] = {
    nroViaje,
    aprobadoPor: aprobadoPor || 'Administrador',
    fechaAprobacion: new Date().toISOString(),
    totalImporte
  }

  console.log(`[Gastos] ✅ Aprobado Viaje ${nroViaje} | $${totalImporte} | por ${aprobadoPor || 'Administrador'}`)

  res.json({ success: true, data: aprobacionesEnMemoria[nroViaje] })
})

// ─── DELETE /api/gastos-viaje/aprobaciones/:nroViaje ── Revocar aprobación ───
router.delete('/aprobaciones/:nroViaje', (req: Request, res: Response) => {
  const nroViaje = parseInt(req.params.nroViaje)
  
  if (!aprobacionesEnMemoria[nroViaje]) {
    return res.status(404).json({ success: false, error: 'No hay aprobación para este viaje' })
  }

  delete aprobacionesEnMemoria[nroViaje]
  console.log(`[Gastos] ❌ Revocado Viaje ${nroViaje}`)

  res.json({ success: true })
})

// ════════════════════════════════════════════════════════════
// EXPORTACIÓN CORMVI — Genera registros para Softland
// ════════════════════════════════════════════════════════════

// ─── GET /api/gastos-viaje/exportar-cormvi/:nroViaje ── Exportar gastos como CORMVI ───
router.get('/exportar-cormvi/:nroViaje', (req: Request, res: Response) => {
  const nroViaje = parseInt(req.params.nroViaje)

  // Verificar que el viaje esté aprobado
  if (!aprobacionesEnMemoria[nroViaje]) {
    return res.status(400).json({
      success: false,
      error: 'El viaje debe estar aprobado antes de exportar a CORMVI'
    })
  }

  const gastosDelViaje = gastosEnMemoria.filter(g => g.nroViaje === nroViaje)
  if (gastosDelViaje.length === 0) {
    return res.status(404).json({ success: false, error: 'No hay gastos para este viaje' })
  }

  // Convertir cada gasto a formato CORMVI
  const registrosCormvi = gastosDelViaje.map(g => gastoToCormvi(g))

  // Calcular totales
  const totalImporte = gastosDelViaje.reduce((sum, g) => sum + g.importe, 0)

  console.log(`[CORMVI] 📤 Exportando Viaje ${nroViaje} | ${registrosCormvi.length} registros | Total: $${totalImporte}`)

  res.json({
    success: true,
    data: {
      nroViaje,
      chofer: gastosDelViaje[0]?.chofer || '',
      legajoChofer: gastosDelViaje[0]?.legajoChofer || '',
      patenteTractor: gastosDelViaje[0]?.patenteTractor || '',
      totalRegistros: registrosCormvi.length,
      totalImporte,
      aprobacion: aprobacionesEnMemoria[nroViaje],
      registros: registrosCormvi,
      // Gastos originales para referencia
      gastosOriginales: gastosDelViaje
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// RUTAS PARAMÉTRICAS — DEBEN IR AL FINAL (catchall)
// ═══════════════════════════════════════════════════════════════

// ─── GET /api/gastos-viaje/:nroViaje ── Gastos de un viaje específico ───
router.get('/:nroViaje', (req: Request, res: Response) => {
  const nroViaje = parseInt(req.params.nroViaje)
  const gastosDelViaje = gastosEnMemoria.filter(g => g.nroViaje === nroViaje)
  
  res.json({
    success: true,
    data: gastosDelViaje,
    total: gastosDelViaje.length
  })
})

// ─── DELETE /api/gastos-viaje/:id ── Eliminar un gasto ───
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const index = gastosEnMemoria.findIndex(g => g.id === id)
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Gasto no encontrado' })
  }

  const eliminado = gastosEnMemoria.splice(index, 1)[0]
  console.log(`[Gastos] Eliminado: Viaje ${eliminado.nroViaje} | $${eliminado.importe} | Quedan: ${gastosEnMemoria.length}`)

  res.json({ success: true })
})

export default router
