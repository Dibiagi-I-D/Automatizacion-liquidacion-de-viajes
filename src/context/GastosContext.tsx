import { createContext, useContext, useState, ReactNode, useEffect } from 'react'
import { Gasto } from '../types'
import { useAuth } from './AuthContext'
import * as api from '../api/client'

interface GastosContextType {
  gastos: Gasto[]
  loading: boolean
  error: string | null
  fetchGastos: () => Promise<void>
  agregarGasto: (gasto: Omit<Gasto, 'id' | 'paso' | 'choferId' | 'createdAt'>) => Promise<void>
  limpiarGastos: () => Promise<void>
  totales: {
    paso1: number
    paso2: number
    total: number
  }
}

const GastosContext = createContext<GastosContextType | undefined>(undefined)

export function GastosProvider({ children }: { children: ReactNode }) {
  const { token, isAuthenticated } = useAuth()
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calcular totales
  const totales = gastos.reduce(
    (acc, gasto) => {
      if (gasto.paso === 1) {
        acc.paso1 += gasto.importe
      } else {
        acc.paso2 += gasto.importe
      }
      acc.total += gasto.importe
      return acc
    },
    { paso1: 0, paso2: 0, total: 0 }
  )

  // Cargar gastos cuando el usuario está autenticado
  // COMENTADO: No usamos autenticación real por ahora, solo token fake
  /*
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchGastos()
    }
  }, [isAuthenticated, token])
  */

  const fetchGastos = async () => {
    if (!token) return
    
    setLoading(true)
    setError(null)
    try {
      const data = await api.getGastos(token)
      setGastos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar gastos')
      console.error('Error fetching gastos:', err)
    } finally {
      setLoading(false)
    }
  }

  const agregarGasto = async (nuevoGasto: Omit<Gasto, 'id' | 'paso' | 'choferId' | 'createdAt'>) => {
    if (!token) return

    setLoading(true)
    setError(null)
    try {
      const gastoCreado = await api.createGasto(token, nuevoGasto)
      setGastos(prev => [...prev, gastoCreado])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al agregar gasto')
      throw err
    } finally {
      setLoading(false)
    }
  }

  const limpiarGastos = async () => {
    if (!token) return

    setLoading(true)
    setError(null)
    try {
      await api.deleteGastos(token)
      setGastos([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al limpiar gastos')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return (
    <GastosContext.Provider
      value={{
        gastos,
        loading,
        error,
        fetchGastos,
        agregarGasto,
        limpiarGastos,
        totales,
      }}
    >
      {children}
    </GastosContext.Provider>
  )
}

export function useGastos() {
  const context = useContext(GastosContext)
  if (context === undefined) {
    throw new Error('useGastos debe ser usado dentro de un GastosProvider')
  }
  return context
}
