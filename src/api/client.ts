import {
  Gasto,
  LoginRequest,
  LoginResponse,
  CreateGastoRequest,
} from '../types'

const API_URL = import.meta.env.VITE_API_URL || '/api'

// Manejo de errores de fetch
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Error desconocido' }))
    throw new Error(error.message || `Error ${response.status}`)
  }
  return response.json()
}

// POST /api/auth/login
export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  return handleResponse<LoginResponse>(response)
}

// GET /api/gastos
export async function getGastos(token: string): Promise<Gasto[]> {
  const response = await fetch(`${API_URL}/gastos`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return handleResponse<Gasto[]>(response)
}

// POST /api/gastos
export async function createGasto(
  token: string,
  data: CreateGastoRequest
): Promise<Gasto> {
  const response = await fetch(`${API_URL}/gastos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })
  return handleResponse<Gasto>(response)
}

// DELETE /api/gastos
export async function deleteGastos(token: string): Promise<void> {
  const response = await fetch(`${API_URL}/gastos`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Error desconocido' }))
    throw new Error(error.message || `Error ${response.status}`)
  }
}

// GET /api/drivers/active - Obtener choferes activos
export async function getChoferesActivos(token: string, search?: string): Promise<any> {
  const url = search 
    ? `${API_URL}/drivers/active?search=${encodeURIComponent(search)}`
    : `${API_URL}/drivers/active`;
    
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return handleResponse<any>(response)
}

// GET /api/drivers/search/:query - Buscar chofer
export async function buscarChofer(token: string, query: string): Promise<any> {
  const response = await fetch(`${API_URL}/drivers/search/${encodeURIComponent(query)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return handleResponse<any>(response)
}

// POST /api/drivers/validate-login - Validar chofer para login
export async function validarChoferLogin(legajo: string): Promise<any> {
  const response = await fetch(`${API_URL}/drivers/validate-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ legajo }),
  })
  return handleResponse<any>(response)
}

// GET /api/drivers/test/connection - Probar conexión con API
export async function testDriversConnection(token: string): Promise<any> {
  const response = await fetch(`${API_URL}/drivers/test/connection`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return handleResponse<any>(response)
}

// POST /api/drivers/sync - Sincronizar choferes
export async function syncChoferes(token: string): Promise<any> {
  const response = await fetch(`${API_URL}/drivers/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  return handleResponse<any>(response)
}

