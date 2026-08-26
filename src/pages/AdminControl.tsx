import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pais } from '../types'
import {
  FaTruck, FaSpinner, FaUser, FaCalendarAlt, FaCheck,
  FaSearch, FaClipboardCheck, FaExclamationTriangle,
  FaSignOutAlt, FaChevronRight
} from 'react-icons/fa'

import { totalesPorMoneda } from '../types'
import TotalesPorMoneda from '../components/TotalesPorMoneda'

const API_URL = import.meta.env.VITE_API_URL || '/api'

interface HojaDeRuta {
  Cod_Empresa: string
  Nro_Viaje: number
  Fecha_Salida: string
  Fecha_Llegada: string | null
  Nombre_Chofer: string
  Patente_Tractor: string
  Patente_Semirremolque: string
  Observaciones: string
  Estado_Viaje: string
}

interface Gasto {
  id: string
  nroViaje: number
  fecha: string
  pais: Pais
  tipo: string
  tipoProducto: string
  codigoArticulo: string
  formalidad: string
  proveedor: string
  importe: number
  descripcion?: string
  createdAt: string
}

interface Aprobacion {
  nroViaje: number
  aprobadoPor: string
  fechaAprobacion: string
  totalImporte: number
}

export default function AdminControl() {
  const navigate = useNavigate()
  const [hojasDeRuta, setHojasDeRuta] = useState<HojaDeRuta[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [aprobaciones, setAprobaciones] = useState<Record<number, Aprobacion>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'aprobado'>('todos')

  const adminData = JSON.parse(sessionStorage.getItem('admin_user') || '{}')

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token')
    sessionStorage.removeItem('admin_user')
    navigate('/admin/login')
  }

  useEffect(() => { cargarDatos() }, [])

  const cargarDatos = async () => {
    try {
      setLoading(true)
      setError('')
      const resHojas = await fetch(`${API_URL}/drivers/roadmaps-public`)
      if (!resHojas.ok) throw new Error('Error al cargar hojas de ruta')
      const dataHojas = await resHojas.json()
      if (dataHojas.success) setHojasDeRuta(dataHojas.data || [])

      const resGastos = await fetch(`${API_URL}/gastos-viaje`)
      if (resGastos.ok) {
        const dataGastos = await resGastos.json()
        setGastos(dataGastos.data || [])
      }

      const resAprob = await fetch(`${API_URL}/gastos-viaje/aprobaciones/todas`)
      if (resAprob.ok) {
        const dataAprob = await resAprob.json()
        setAprobaciones(dataAprob.data || {})
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setLoading(false)
    }
  }

  const gastosPorViaje: Record<number, Gasto[]> = {}
  gastos.forEach(g => {
    if (!gastosPorViaje[g.nroViaje]) gastosPorViaje[g.nroViaje] = []
    gastosPorViaje[g.nroViaje].push(g)
  })

  const hojasConGastos = hojasDeRuta.filter(h => gastosPorViaje[h.Nro_Viaje]?.length > 0)

  const hojasFiltradas = hojasConGastos
    .filter(hoja => {
      const matchBusqueda =
        searchQuery === '' ||
        hoja.Nro_Viaje.toString().includes(searchQuery) ||
        hoja.Nombre_Chofer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        hoja.Patente_Tractor.toLowerCase().includes(searchQuery.toLowerCase())
      const estado = aprobaciones[hoja.Nro_Viaje] ? 'aprobado' : 'pendiente'
      const matchEstado = filtroEstado === 'todos' || filtroEstado === estado
      return matchBusqueda && matchEstado
    })
    .sort((a, b) => b.Nro_Viaje - a.Nro_Viaje)

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'En curso'
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  /** Totales de un viaje, separados por moneda */
  const totalesViaje = (nroViaje: number) =>
    totalesPorMoneda(gastosPorViaje[nroViaje] || [])

  const totalPendientes = hojasConGastos.filter(h => !aprobaciones[h.Nro_Viaje]).length
  const totalAprobados  = hojasConGastos.filter(h =>  aprobaciones[h.Nro_Viaje]).length

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="text-center">
          <FaSpinner className="animate-spin text-3xl text-emerald-400 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando panel de control...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f1117]">
      <header className="sticky top-0 z-40 bg-[#0f1117]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600/15 flex items-center justify-center">
              <FaClipboardCheck className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white leading-tight">Control de Gastos</h1>
              <p className="text-xs text-gray-500">Panel Administrativo</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <FaUser className="text-[10px]" />
              <span>{adminData.nombre || 'Admin'}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-gray-500 hover:text-red-400 hover:bg-red-500/[0.06] border border-white/[0.06] transition-all"
            >
              <FaSignOutAlt className="text-[10px]" />
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-5 flex items-center gap-2 p-4 rounded-xl bg-red-500/[0.04] border border-red-500/20">
            <FaExclamationTriangle className="text-red-400 text-sm flex-shrink-0" />
            <p className="text-sm text-red-400 flex-1">{error}</p>
            <button onClick={cargarDatos} className="text-xs text-red-400 underline">Reintentar</button>
          </div>
        )}

        {/* Los importes agregados no van acá: cada rendición muestra su propio
            total por moneda en la tarjeta de abajo, y el detalle está adentro. */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Rendiciones</p>
            <p className="text-2xl font-bold text-white">{hojasConGastos.length}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{gastos.length} gastos totales</p>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Pendientes</p>
            <p className="text-2xl font-bold text-amber-400">{totalPendientes}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Requieren revision</p>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Aprobadas</p>
            <p className="text-2xl font-bold text-emerald-400">{totalAprobados}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">de {hojasConGastos.length}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm" />
            <input
              type="text"
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 pl-9 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/40 transition-colors"
              placeholder="Buscar por N viaje, chofer o patente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {(['todos', 'pendiente', 'aprobado'] as const).map((estado) => (
              <button
                key={estado}
                onClick={() => setFiltroEstado(estado)}
                className={`px-4 py-2.5 rounded-xl text-xs font-medium transition-all border ${
                  filtroEstado === estado
                    ? estado === 'pendiente'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : estado === 'aprobado'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    : 'bg-white/[0.02] border-white/[0.06] text-gray-500 hover:text-gray-300'
                }`}
              >
                {estado === 'todos' ? 'Todos' : estado === 'pendiente' ? 'Pendientes' : 'Aprobados'}
              </button>
            ))}
          </div>
        </div>

        {hojasFiltradas.length === 0 ? (
          <div className="text-center py-16 bg-white/[0.03] border border-white/[0.06] rounded-xl">
            <div className="w-14 h-14 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
              <FaClipboardCheck className="text-2xl text-gray-600" />
            </div>
            <p className="text-base font-medium text-white mb-1">
              {hojasConGastos.length === 0 ? 'Sin rendiciones' : 'Sin resultados'}
            </p>
            <p className="text-gray-500 text-sm">
              {hojasConGastos.length === 0
                ? 'Todavia no hay gastos cargados por los choferes'
                : 'Proba con otro criterio de busqueda'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {hojasFiltradas.map((hoja) => {
              const cantGastos   = gastosPorViaje[hoja.Nro_Viaje]?.length || 0
              const totales      = totalesViaje(hoja.Nro_Viaje)
              const estaAprobado = !!aprobaciones[hoja.Nro_Viaje]
              return (
                <button
                  key={`${hoja.Cod_Empresa}-${hoja.Nro_Viaje}`}
                  onClick={() => navigate(`/admin/viaje/${hoja.Nro_Viaje}`)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:bg-white/[0.05] active:scale-[0.99] transition-all text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      estaAprobado ? 'bg-emerald-600/15' : 'bg-amber-600/15'
                    }`}>
                      {estaAprobado
                        ? <FaCheck className="text-emerald-400" />
                        : <FaExclamationTriangle className="text-amber-400 text-sm" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-white">Viaje {hoja.Nro_Viaje}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                          estaAprobado ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {estaAprobado ? 'Aprobado' : 'Pendiente'}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                          hoja.Estado_Viaje === 'Abierto' ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-400'
                        }`}>
                          {hoja.Estado_Viaje}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <FaUser className="text-[10px]" />{hoja.Nombre_Chofer}
                        </span>
                        <span className="flex items-center gap-1">
                          <FaTruck className="text-[10px]" />{hoja.Patente_Tractor}
                        </span>
                        <span className="hidden sm:flex items-center gap-1">
                          <FaCalendarAlt className="text-[10px]" />{formatFecha(hoja.Fecha_Salida)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 min-w-[135px]">
                      <TotalesPorMoneda totales={totales} />
                      <p className="text-[10px] text-gray-500 mt-1">{cantGastos} gasto{cantGastos !== 1 ? 's' : ''}</p>
                    </div>
                    <FaChevronRight className="text-gray-600 group-hover:text-gray-400 text-xs flex-shrink-0 transition-colors" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}