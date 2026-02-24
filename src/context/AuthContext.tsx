import { createContext, useContext, useState, ReactNode } from 'react'
import { Chofer } from '../types'

interface AuthContextType {
  token: string | null
  chofer: Chofer | null
  login: (token: string, chofer: Chofer) => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  // Token en memoria, NO en localStorage por seguridad
  const [token, setToken] = useState<string | null>(null)
  const [chofer, setChofer] = useState<Chofer | null>(null)

  const login = (newToken: string, newChofer: Chofer) => {
    setToken(newToken)
    setChofer(newChofer)
  }

  const logout = () => {
    setToken(null)
    setChofer(null)
  }

  const isAuthenticated = token !== null && chofer !== null

  return (
    <AuthContext.Provider value={{ token, chofer, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider')
  }
  return context
}
