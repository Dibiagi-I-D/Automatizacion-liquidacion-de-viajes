import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaClipboardCheck, FaSpinner, FaLock, FaUser } from 'react-icons/fa'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!usuario.trim() || !password.trim()) {
      setError('Completá usuario y contraseña')
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/auth/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario.trim(), password: password.trim() }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        // Guardar token y datos admin en sessionStorage
        sessionStorage.setItem('admin_token', data.token)
        sessionStorage.setItem('admin_user', JSON.stringify(data.admin))
        navigate('/admin')
      } else {
        setError(data.message || 'Credenciales incorrectas')
      }
    } catch (err) {
      setError('Error de conexión con el servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/15 flex items-center justify-center mx-auto mb-4">
            <FaClipboardCheck className="text-2xl text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-1">Panel Administrativo</h1>
          <p className="text-sm text-gray-500">Control de Gastos de Logística</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/[0.08] border border-red-500/20">
              <p className="text-sm text-red-400 text-center">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
              Usuario
            </label>
            <div className="relative">
              <FaUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 text-sm" />
              <input
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="input-field pl-10 text-sm"
                placeholder="Ingresá tu usuario"
                autoComplete="username"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
              Contraseña
            </label>
            <div className="relative">
              <FaLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 text-sm" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-10 text-sm"
                placeholder="Ingresá tu contraseña"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <FaSpinner className="animate-spin" />
                Ingresando...
              </>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>

        <p className="text-center text-[10px] text-gray-700 mt-6">
          Acceso restringido a personal autorizado
        </p>
      </div>
    </div>
  )
}
