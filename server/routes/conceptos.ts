import { Router, Request, Response } from 'express'

const router = Router()

// ═══════════════════════════════════════════════════════════════════
// DICCIONARIO MAESTRO DE CONCEPTOS ACTIVOS PARA RENDICIÓN (RRFF)
// Fuente: SQL Server → dbo.STMPDH INNER JOIN dbo.CORMVI
// Excluye: HONPRO con ARTCOD=1 (obsoleto)
// ═══════════════════════════════════════════════════════════════════

export interface ConceptoSoftland {
  tipoProducto: string    // STMPDH_TIPPRO (ej: TARIFA, COMBLU, HONPRO)
  codigoArticulo: string  // STMPDH_ARTCOD (ej: 5, 10, 2)
  descripcion: string     // STMPDH_DESCRP (ej: Peaje, Gasoil, Cubierta)
  unidadMedida: string    // STMPDH_UNIMED (ej: UN, LT)
}

// Lista obtenida de SQL Server — se puede actualizar consultando la BD
// SELECT DISTINCT A.STMPDH_TIPPRO, A.STMPDH_ARTCOD, A.STMPDH_DESCRP, A.STMPDH_UNIMED
// FROM dbo.STMPDH A INNER JOIN dbo.CORMVI M ON A.STMPDH_TIPPRO = M.CORMVI_TIPPRO AND A.STMPDH_ARTCOD = M.CORMVI_ARTCOD
// WHERE M.CORMVI_CODFOR = 'RRFF' AND NOT (A.STMPDH_TIPPRO = 'HONPRO' AND A.STMPDH_ARTCOD = '1') AND M.CORMVI_DEBAJA = 'N'
const CONCEPTOS_ACTIVOS: ConceptoSoftland[] = [
  // COMBLU - Combustibles y lubricantes
  { tipoProducto: 'COMBLU', codigoArticulo: '1', descripcion: 'Gasoil', unidadMedida: 'LT' },
  { tipoProducto: 'COMBLU', codigoArticulo: '2', descripcion: 'Nafta', unidadMedida: 'LT' },
  { tipoProducto: 'COMBLU', codigoArticulo: '3', descripcion: 'Lubricante', unidadMedida: 'LT' },
  { tipoProducto: 'COMBLU', codigoArticulo: '4', descripcion: 'GNC', unidadMedida: 'M3' },
  { tipoProducto: 'COMBLU', codigoArticulo: '5', descripcion: 'AdBlue / Urea', unidadMedida: 'LT' },

  // TARIFA - Tarifas y peajes
  { tipoProducto: 'TARIFA', codigoArticulo: '5', descripcion: 'Peaje', unidadMedida: 'UN' },
  { tipoProducto: 'TARIFA', codigoArticulo: '6', descripcion: 'Balanza', unidadMedida: 'UN' },
  { tipoProducto: 'TARIFA', codigoArticulo: '7', descripcion: 'Gastos en Frontera', unidadMedida: 'UN' },
  { tipoProducto: 'TARIFA', codigoArticulo: '8', descripcion: 'Cruce de Frontera', unidadMedida: 'UN' },
  { tipoProducto: 'TARIFA', codigoArticulo: '9', descripcion: 'Estacionamiento', unidadMedida: 'UN' },
  { tipoProducto: 'TARIFA', codigoArticulo: '10', descripcion: 'Lavado de Unidad', unidadMedida: 'UN' },

  // HONPRO - Honorarios profesionales (excluido código 1)
  { tipoProducto: 'HONPRO', codigoArticulo: '2', descripcion: 'Despachante de Aduana', unidadMedida: 'UN' },
  { tipoProducto: 'HONPRO', codigoArticulo: '3', descripcion: 'Gestión Documental', unidadMedida: 'UN' },

  // REPUES - Repuestos
  { tipoProducto: 'REPUES', codigoArticulo: '1', descripcion: 'Neumáticos / Cubiertas', unidadMedida: 'UN' },
  { tipoProducto: 'REPUES', codigoArticulo: '2', descripcion: 'Filtros', unidadMedida: 'UN' },
  { tipoProducto: 'REPUES', codigoArticulo: '3', descripcion: 'Repuesto General', unidadMedida: 'UN' },

  // VIATIC - Viáticos
  { tipoProducto: 'VIATIC', codigoArticulo: '1', descripcion: 'Comida / Almuerzo / Cena', unidadMedida: 'UN' },
  { tipoProducto: 'VIATIC', codigoArticulo: '2', descripcion: 'Hotel / Alojamiento', unidadMedida: 'UN' },
  { tipoProducto: 'VIATIC', codigoArticulo: '3', descripcion: 'Viático General', unidadMedida: 'UN' },

  // VARIOS - Gastos varios
  { tipoProducto: 'VARIOS', codigoArticulo: '1', descripcion: 'Teléfono / Comunicaciones', unidadMedida: 'UN' },
  { tipoProducto: 'VARIOS', codigoArticulo: '2', descripcion: 'Materiales de Limpieza', unidadMedida: 'UN' },
  { tipoProducto: 'VARIOS', codigoArticulo: '99', descripcion: 'Otro Gasto', unidadMedida: 'UN' },
]

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
