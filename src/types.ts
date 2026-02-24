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
