import { Router, Request, Response } from 'express'

const router = Router()

// ═══════════════════════════════════════════════════════
// ALMACENAMIENTO EN MEMORIA (temporal, hasta conectar BD)
// ═══════════════════════════════════════════════════════
interface Gasto {
  id: string
  nroViaje: number
  fecha: string
  pais: string
  tipo: string
  importe: number
  descripcion?: string
  chofer: string
  patenteTractor: string
  createdAt: string
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

// ─── POST /api/gastos-viaje ── Crear un gasto ───
router.post('/', (req: Request, res: Response) => {
  const { nroViaje, fecha, pais, tipo, importe, descripcion, chofer, patenteTractor } = req.body

  if (!nroViaje || !fecha || !pais || importe === undefined) {
    return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' })
  }

  const nuevoGasto: Gasto = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    nroViaje: parseInt(nroViaje),
    fecha,
    pais,
    tipo: tipo || 'COMBUSTIBLE',
    importe: parseFloat(importe),
    descripcion: descripcion?.trim() || undefined,
    chofer: chofer || '',
    patenteTractor: patenteTractor || '',
    createdAt: new Date().toISOString()
  }

  gastosEnMemoria.push(nuevoGasto)

  console.log(`[Gastos] Nuevo gasto: Viaje ${nroViaje} | $${importe} | ${chofer} | Total en memoria: ${gastosEnMemoria.length}`)

  res.status(201).json({
    success: true,
    data: nuevoGasto
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

export default router
