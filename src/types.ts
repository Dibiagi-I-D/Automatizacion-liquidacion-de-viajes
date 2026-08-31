// Tipos para el modelo de datos

export type Pais = 'ARG' | 'CHL' | 'URY'

export type TipoGasto = 'COMBUSTIBLE' | 'PEAJE' | 'NEUMATICO' | 'HONORARIO' | 'VIATICO' | 'OTRO'

export interface Chofer {
  id: string
  legajo: string
  interno: string
  createdAt: string
}

export interface Gasto {
  id: string
  fecha: string
  pais: Pais
  tipo: TipoGasto
  importe: number
  descripcion?: string
  paso: 1 | 2
  choferId: string
  createdAt: string
}

export interface LoginRequest {
  legajo: string
  interno: string
}

export interface LoginResponse {
  token: string
  chofer: Chofer
}

export interface CreateGastoRequest {
  fecha: string
  pais: Pais
  tipo: TipoGasto
  importe: number
  descripcion?: string
}

// Utilidad para calcular el paso en el frontend (solo para indicador visual)
// El cálculo real SIEMPRE se hace en el backend
export function calcularPasoVisual(pais: Pais, importe: number): 1 | 2 {
  if (pais === 'ARG' && importe < 100000) {
    return 1
  }
  return 2
}

// Banderas por país
export const BANDERAS: Record<Pais, string> = {
  ARG: '🇦🇷',
  CHL: '🇨🇱',
  URY: '🇺🇾'
}

// Nombres de países
export const NOMBRES_PAIS: Record<Pais, string> = {
  ARG: 'Argentina',
  CHL: 'Chile',
  URY: 'Uruguay'
}

// Nombres de tipos de gasto
export const NOMBRES_TIPO: Record<TipoGasto, string> = {
  COMBUSTIBLE: 'Combustible',
  PEAJE: 'Peaje/Tarifa',
  NEUMATICO: 'Neumáticos',
  HONORARIO: 'Honorarios/Aduana',
  VIATICO: 'Viático',
  OTRO: 'Otro'
}

// ═══════════════════════════════════════════════════════════════
// TOTALES POR MONEDA
//
// Cada país usa su propia moneda, así que los importes NO son sumables
// entre sí: 50.000 ARS + 30.000 CLP no son 80.000 de nada. Todo total que
// se muestre tiene que estar separado por país.
// ═══════════════════════════════════════════════════════════════

export const MONEDAS: Record<Pais, string> = {
  ARG: 'ARS',
  CHL: 'CLP',
  URY: 'UYU'
}

/**
 * Códigos de moneda tal como los guarda Softland en CORMVI_COFLIS.
 * No son los ISO: verificado sobre los 445.975 movimientos de la tabla real,
 * donde aparecen ARS, $CH, $UR, USD y EUR.
 */
export const MONEDAS_SOFTLAND: Record<Pais, string> = {
  ARG: 'ARS',
  CHL: '$CH',
  URY: '$UR'
}

/** Orden fijo para que los totales aparezcan siempre igual en toda la app */
export const ORDEN_PAISES: Pais[] = ['ARG', 'CHL', 'URY']

export interface TotalPorPais {
  pais: Pais
  moneda: string
  total: number
  cantidad: number
}

/** Normaliza el país de un gasto; lo que no se reconoce cae en ARG. */
export function normalizarPais(valor: unknown): Pais {
  const p = String(valor || '').trim().toUpperCase()
  return (p === 'CHL' || p === 'URY') ? p : 'ARG'
}

/**
 * Agrupa importes por país y devuelve un total por cada moneda presente.
 * Solo incluye los países que realmente tienen gastos, en ORDEN_PAISES.
 */
export function totalesPorMoneda(
  items: Array<{ pais?: unknown; importe?: number | null }>
): TotalPorPais[] {
  const acum = new Map<Pais, { total: number; cantidad: number }>()

  for (const item of items) {
    const pais = normalizarPais(item.pais)
    const importe = Number(item.importe) || 0
    const actual = acum.get(pais) || { total: 0, cantidad: 0 }
    acum.set(pais, { total: actual.total + importe, cantidad: actual.cantidad + 1 })
  }

  return ORDEN_PAISES
    .filter(p => acum.has(p))
    .map(p => ({ pais: p, moneda: MONEDAS[p], ...acum.get(p)! }))
}

/** Formatea un número con separadores es-AR y dos decimales. */
export function formatMonto(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n || 0)
}

/** "$ 12.000,00 ARS" — el importe siempre acompañado de su moneda. */
export function formatMontoConMoneda(n: number, pais: Pais): string {
  return `$ ${formatMonto(n)} ${MONEDAS[pais]}`
}
