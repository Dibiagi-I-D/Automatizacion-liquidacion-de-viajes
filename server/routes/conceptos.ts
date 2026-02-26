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
  descripcion: string     // STMPDH_DESCRP
  unidadMedida: string    // STMPDH_UNIMED (ej: UN, LT)
  frecuencia: number      // Cantidad de usos históricos en CORMVI
  conceptoEspecial: string // MODCPT-CODCPT (ej: VT-V001) o vacío
}

// ═══════════════════════════════════════════════════════════════════
// Datos reales de SQL Server — Consulta ejecutada sobre STMPDH + CORMVI
// WHERE CORMVI_CODFOR = 'RRFF' AND DEBAJA = 'N'
// Excluye: HONPRO ARTCOD=1 (obsoleto)
// Ordenado por frecuencia de uso descendente
// ═══════════════════════════════════════════════════════════════════
const CONCEPTOS_ACTIVOS: ConceptoSoftland[] = [
  // TARIFA — Tarifas y Servicios (93% de uso)
  { tipoProducto: 'TARIFA', codigoArticulo: '2',  descripcion: 'Entrada / Salida (Migraciones)', unidadMedida: 'UN', frecuencia: 5569, conceptoEspecial: '' },
  { tipoProducto: 'TARIFA', codigoArticulo: '5',  descripcion: 'Peaje Argentino',                unidadMedida: 'UN', frecuencia: 4662, conceptoEspecial: '' },
  { tipoProducto: 'TARIFA', codigoArticulo: '10', descripcion: 'Desinfección',                   unidadMedida: 'UN', frecuencia: 3434, conceptoEspecial: '' },
  { tipoProducto: 'TARIFA', codigoArticulo: '21', descripcion: 'Gastos en Frontera',             unidadMedida: 'UN', frecuencia: 2574, conceptoEspecial: 'VT-V001' },
  { tipoProducto: 'TARIFA', codigoArticulo: '1',  descripcion: 'Tunel Inter. Ruta Nac 7 Camión', unidadMedida: 'UN', frecuencia: 1843, conceptoEspecial: '' },
  { tipoProducto: 'TARIFA', codigoArticulo: '14', descripcion: 'Gastos extras (Caja Camión)',    unidadMedida: 'UN', frecuencia: 245,  conceptoEspecial: '' },
  { tipoProducto: 'TARIFA', codigoArticulo: '12', descripcion: 'Viaticos Chofer',                unidadMedida: 'UN', frecuencia: 120,  conceptoEspecial: '' },
  { tipoProducto: 'TARIFA', codigoArticulo: '3',  descripcion: 'Entrada / Salida (Aduana)',      unidadMedida: 'UN', frecuencia: 77,   conceptoEspecial: '' },
  { tipoProducto: 'TARIFA', codigoArticulo: '7',  descripcion: 'Iscamen - Control Sanitario',    unidadMedida: 'UN', frecuencia: 41,   conceptoEspecial: '' },
  { tipoProducto: 'TARIFA', codigoArticulo: '8',  descripcion: 'Sellados',                       unidadMedida: 'UN', frecuencia: 22,   conceptoEspecial: 'VT-V000' },
  { tipoProducto: 'TARIFA', codigoArticulo: '4',  descripcion: 'Peaje Chileno',                  unidadMedida: 'UN', frecuencia: 20,   conceptoEspecial: '' },
  { tipoProducto: 'TARIFA', codigoArticulo: '6',  descripcion: 'Peaje Uruguayo',                 unidadMedida: 'UN', frecuencia: 5,    conceptoEspecial: '' },
  { tipoProducto: 'TARIFA', codigoArticulo: '13', descripcion: 'Estacionamiento / Aparcadero',   unidadMedida: 'UN', frecuencia: 5,    conceptoEspecial: '' },
  { tipoProducto: 'TARIFA', codigoArticulo: '11', descripcion: 'Senasa',                         unidadMedida: 'UN', frecuencia: 2,    conceptoEspecial: '' },

  // HONPRO — Honorarios Profesionales (6% de uso)
  { tipoProducto: 'HONPRO', codigoArticulo: '6', descripcion: 'Honorarios Profesionales',         unidadMedida: 'UN', frecuencia: 478, conceptoEspecial: '' },
  { tipoProducto: 'HONPRO', codigoArticulo: '4', descripcion: 'ATA - Agente de Transporte Aduanero', unidadMedida: 'UN', frecuencia: 224, conceptoEspecial: '' },
  { tipoProducto: 'HONPRO', codigoArticulo: '2', descripcion: 'Gestiones Aduaneras',              unidadMedida: 'UN', frecuencia: 12,  conceptoEspecial: '' },
  { tipoProducto: 'HONPRO', codigoArticulo: '5', descripcion: 'Alquiler Predio Docwell',          unidadMedida: 'UN', frecuencia: 2,   conceptoEspecial: '' },
  { tipoProducto: 'HONPRO', codigoArticulo: '3', descripcion: 'Servicios Aduaneros',              unidadMedida: 'UN', frecuencia: 1,   conceptoEspecial: '' },

  // NEUMAT — Neumáticos (1% de uso)
  { tipoProducto: 'NEUMAT', codigoArticulo: '3', descripcion: 'Pinchadura y Rotación', unidadMedida: 'UN', frecuencia: 157, conceptoEspecial: '' },
  { tipoProducto: 'NEUMAT', codigoArticulo: '1', descripcion: 'Pinchadura',            unidadMedida: 'UN', frecuencia: 37,  conceptoEspecial: '' },
  { tipoProducto: 'NEUMAT', codigoArticulo: '2', descripcion: 'Rotación',              unidadMedida: 'UN', frecuencia: 30,  conceptoEspecial: '' },

  // COMBLU — Combustibles y Lubricantes (<1% de uso)
  { tipoProducto: 'COMBLU', codigoArticulo: '3', descripcion: 'Urea 32% Adblue',           unidadMedida: 'LT', frecuencia: 1, conceptoEspecial: '' },
  { tipoProducto: 'COMBLU', codigoArticulo: '9', descripcion: 'Aceite Hidraulico Dexron II', unidadMedida: 'LT', frecuencia: 1, conceptoEspecial: '' },

  // SERVIC — Servicios Generales (<1% de uso)
  { tipoProducto: 'SERVIC', codigoArticulo: '3', descripcion: 'Falso Flete', unidadMedida: 'UN', frecuencia: 2, conceptoEspecial: 'VT-V000' },
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
