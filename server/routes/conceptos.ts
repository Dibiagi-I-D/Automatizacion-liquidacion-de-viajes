import { Router, Request, Response } from 'express'
import { CONCEPTOS_ACTIVOS } from '../services/conceptosSoftland.js'

/**
 * Conceptos activos para rendición (RRFF).
 * La lista vive en services/conceptosSoftland.ts: es la misma que usan el OCR
 * y la validación del panel, así no se pueden desincronizar.
 */
const router = Router()

export type { ConceptoSoftland } from '../services/conceptosSoftland.js'

// ─── GET /api/conceptos ── Lista de conceptos activos ───
router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: CONCEPTOS_ACTIVOS,
    total: CONCEPTOS_ACTIVOS.length
  })
})

// ─── GET /api/conceptos/tipos ── Tipos de producto únicos ───
router.get('/tipos', (req: Request, res: Response) => {
  const tipos = [...new Set(CONCEPTOS_ACTIVOS.map(c => c.tipoProducto))]
  res.json({ success: true, data: tipos })
})

// ─── GET /api/conceptos/:tipoProducto ── Artículos de un tipo ───
router.get('/:tipoProducto', (req: Request, res: Response) => {
  const { tipoProducto } = req.params
  const articulos = CONCEPTOS_ACTIVOS.filter(
    c => c.tipoProducto.toUpperCase() === tipoProducto.toUpperCase()
  )
  res.json({ success: true, data: articulos, total: articulos.length })
})

export default router
