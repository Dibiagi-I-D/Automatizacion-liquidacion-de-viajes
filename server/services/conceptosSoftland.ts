/**
 * ════════════════════════════════════════════════════════════════════
 * DICCIONARIO MAESTRO DE CONCEPTOS — el par (TIPORI, ARTORI)
 * ════════════════════════════════════════════════════════════════════
 *
 * En Softland un gasto se clasifica con DOS columnas, no una:
 *   CORMVI_TIPORI  → la familia: TARIFA, HONPRO, NEUMAT, COMBLU, SERVIC
 *   CORMVI_ARTORI  → el ítem dentro de esa familia: 5, 2, 10, 21…
 *
 * Solo existen los pares de esta lista. "NEUMAT con código 14" no es un
 * concepto raro: no existe, porque el 14 es de TARIFA.
 *
 * Fuente: dbo.STMPDH INNER JOIN dbo.CORMVI sobre las líneas RRFF activas.
 * Excluye HONPRO/1, marcado obsoleto aunque tenga uso histórico.
 *
 * Es la ÚNICA fuente de verdad: la usan el OCR (para no poder inventar un
 * concepto), la validación del panel y la ruta /api/conceptos. Antes estaba
 * copiada en dos archivos, con una nota de "mantener sincronizado".
 */

export interface ConceptoSoftland {
  tipoProducto: string     // STMPDH_TIPPRO (ej: TARIFA, COMBLU, HONPRO)
  codigoArticulo: string   // STMPDH_ARTCOD (ej: 5, 10, 2)
  descripcion: string      // STMPDH_DESCRP
  unidadMedida: string     // STMPDH_UNIMED (ej: UN, LT)
  frecuencia: number       // Usos históricos en CORMVI
  conceptoEspecial: string // MODCPT-CODCPT (ej: VT-V001) o vacío
}

export const CONCEPTOS_ACTIVOS: ConceptoSoftland[] = [
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
  { tipoProducto: 'COMBLU', codigoArticulo: '3', descripcion: 'Urea 32% Adblue',             unidadMedida: 'LT', frecuencia: 1, conceptoEspecial: '' },
  { tipoProducto: 'COMBLU', codigoArticulo: '9', descripcion: 'Aceite Hidraulico Dexron II', unidadMedida: 'LT', frecuencia: 1, conceptoEspecial: '' },

  // SERVIC — Servicios Generales (<1% de uso)
  { tipoProducto: 'SERVIC', codigoArticulo: '3', descripcion: 'Falso Flete', unidadMedida: 'UN', frecuencia: 2, conceptoEspecial: 'VT-V000' },
]

/** Los pares válidos como 'TIPO/CODIGO'. El OCR los usa como enum cerrado. */
export const PARES_VALIDOS: string[] = CONCEPTOS_ACTIVOS.map(
  c => `${c.tipoProducto}/${c.codigoArticulo}`
)

/** Por defecto cuando no hay coincidencia clara: Gastos extras (Caja Camión). */
export const CONCEPTO_FALLBACK = 'TARIFA/14'

/**
 * Softland guarda el tipo en MAYÚSCULAS (100% de las líneas reales).
 * Se normaliza al guardar y al armar la fila, para que un 'honpro' escrito
 * en minúscula no llegue al ERP ni dispare una validación al pedo.
 */
export const normalizarTipo = (v: unknown) => String(v ?? '').trim().toUpperCase()
export const normalizarCodigo = (v: unknown) => String(v ?? '').trim()

/** El concepto, si el par existe. Tolera minúsculas y espacios. */
export function buscarConcepto(tipo: unknown, codigo: unknown): ConceptoSoftland | undefined {
  const t = normalizarTipo(tipo)
  const c = normalizarCodigo(codigo)
  return CONCEPTOS_ACTIVOS.find(x => x.tipoProducto === t && x.codigoArticulo === c)
}

/** Códigos que admite una familia, para poder decirlo en el mensaje de error. */
export function codigosDe(tipo: unknown): string[] {
  const t = normalizarTipo(tipo)
  return CONCEPTOS_ACTIVOS.filter(x => x.tipoProducto === t).map(x => x.codigoArticulo)
}

/** Las 5 familias válidas de CORMVI_TIPORI. */
export const TIPOS_VALIDOS: string[] = [...new Set(CONCEPTOS_ACTIVOS.map(c => c.tipoProducto))]
