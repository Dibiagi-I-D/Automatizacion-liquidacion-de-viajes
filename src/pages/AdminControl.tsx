import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BANDERAS, NOMBRES_PAIS, Pais } from '../types'
import { FaTruck, FaSpinner, FaUser, FaCalendarAlt, FaCheck, FaChevronDown, FaChevronUp, FaSearch, FaClipboardCheck, FaExclamationTriangle, FaTrailer, FaFileExport, FaSignOutAlt } from 'react-icons/fa'

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

interface RendicionAprobada {
  nroViaje: number
  aprobadoPor: string
  fechaAprobacion: string
  gastos: Gasto[]
  totalImporte: number
  chofer: string
  patenteTractor: string
}

type EstadoRendicion = 'pendiente' | 'aprobado'

export default function AdminControl() {
  const navigate = useNavigate()
  const [hojasDeRuta, setHojasDeRuta] = useState<HojaDeRuta[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [aprobaciones, setAprobaciones] = useState<Record<number, RendicionAprobada>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedViaje, setExpandedViaje] = useState<number | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'pendiente' | 'aprobado'>('todos')
  const [aprobando, setAprobando] = useState<number | null>(null)

  // Datos del admin logueado
  const adminData = JSON.parse(sessionStorage.getItem('admin_user') || '{}')

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token')
    sessionStorage.removeItem('admin_user')
    navigate('/admin/login')
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    try {
      setLoading(true)
      setError('')

      // Cargar hojas de ruta de la API
      const resHojas = await fetch(`${API_URL}/drivers/roadmaps-public`)
      if (!resHojas.ok) throw new Error('Error al cargar hojas de ruta')
      
      const dataHojas = await resHojas.json()
      if (dataHojas.success) {
        setHojasDeRuta(dataHojas.data || [])
      }

      // Cargar gastos del servidor
      const resGastos = await fetch(`${API_URL}/gastos-viaje`)
      if (resGastos.ok) {
        const dataGastos = await resGastos.json()
        setGastos(dataGastos.data || [])
      }

      // Cargar aprobaciones del servidor
      const resAprob = await fetch(`${API_URL}/gastos-viaje/aprobaciones/todas`)
      if (resAprob.ok) {
        const dataAprob = await resAprob.json()
        setAprobaciones(dataAprob.data || {})
      }

    } catch (err: any) {
      setError(err.message || 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  // Agrupar gastos por nroViaje
  const gastosPorViaje: Record<number, Gasto[]> = {}
  gastos.forEach(g => {
    if (!gastosPorViaje[g.nroViaje]) gastosPorViaje[g.nroViaje] = []
    gastosPorViaje[g.nroViaje].push(g)
  })

  // Obtener solo hojas que tienen gastos cargados
  const hojasConGastos = hojasDeRuta.filter(h => gastosPorViaje[h.Nro_Viaje]?.length > 0)

  // Filtrar por búsqueda y estado
  const hojasFiltradas = hojasConGastos.filter(hoja => {
    const matchBusqueda = searchQuery === '' || 
      hoja.Nro_Viaje.toString().includes(searchQuery) ||
      hoja.Nombre_Chofer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      hoja.Patente_Tractor.toLowerCase().includes(searchQuery.toLowerCase())
    
    const estado = aprobaciones[hoja.Nro_Viaje] ? 'aprobado' : 'pendiente'
    const matchEstado = filtroEstado === 'todos' || filtroEstado === estado

    return matchBusqueda && matchEstado
  }).sort((a, b) => b.Nro_Viaje - a.Nro_Viaje)

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'En curso'
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const formatImporte = (importe: number) => {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(importe)
  }

  const totalViaje = (nroViaje: number) => {
    return (gastosPorViaje[nroViaje] || []).reduce((sum, g) => sum + g.importe, 0)
  }

  const aprobarRendicion = async (hoja: HojaDeRuta) => {
    if (!confirm(`¿Aprobar la rendición del Viaje ${hoja.Nro_Viaje}?\n\nChofer: ${hoja.Nombre_Chofer}\nTotal: $ ${formatImporte(totalViaje(hoja.Nro_Viaje))}\n\nEsto enviará los datos a producción.`)) {
      return
    }

    setAprobando(hoja.Nro_Viaje)

    try {
      const gastosDelViaje = gastosPorViaje[hoja.Nro_Viaje] || []
      
      const res = await fetch(`${API_URL}/gastos-viaje/aprobaciones/${hoja.Nro_Viaje}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aprobadoPor: adminData.nombre || 'Administrador',
          gastos: gastosDelViaje,
          totalImporte: totalViaje(hoja.Nro_Viaje),
          chofer: hoja.Nombre_Chofer,
          patenteTractor: hoja.Patente_Tractor,
        })
      })

      if (res.ok) {
        const data = await res.json()
        setAprobaciones(prev => ({ ...prev, [hoja.Nro_Viaje]: data.data }))
      }
    } catch (err) {
      console.error('Error al aprobar rendición:', err)
    } finally {
      setAprobando(null)
    }
  }

  const revocarAprobacion = async (nroViaje: number) => {
    if (!confirm(`¿Revocar la aprobación del Viaje ${nroViaje}? Volverá a estado pendiente.`)) return

    try {
      const res = await fetch(`${API_URL}/gastos-viaje/aprobaciones/${nroViaje}`, { method: 'DELETE' })
      if (res.ok) {
        setAprobaciones(prev => {
          const nuevas = { ...prev }
          delete nuevas[nroViaje]
          return nuevas
        })
      }
    } catch (err) {
      console.error('Error al revocar aprobación:', err)
    }
  }

  // Estadísticas
  const totalPendientes = hojasConGastos.filter(h => !aprobaciones[h.Nro_Viaje]).length
  const totalAprobados = hojasConGastos.filter(h => aprobaciones[h.Nro_Viaje]).length
  const importeTotal = hojasConGastos.reduce((sum, h) => sum + totalViaje(h.Nro_Viaje), 0)
  const importeAprobado = hojasConGastos
    .filter(h => aprobaciones[h.Nro_Viaje])
    .reduce((sum, h) => sum + totalViaje(h.Nro_Viaje), 0)

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
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0f1117]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600/15 flex items-center justify-center">
                <FaClipboardCheck className="text-blue-400" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-white leading-tight">
                  Control de Gastos
                </h1>
                <p className="text-xs text-gray-500">
                  Panel Administrativo
                </p>
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
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Error */}
        {error && (
          <div className="mb-5 info-panel border-red-500/20 bg-red-500/[0.04]">
            <div className="flex items-center gap-2">
              <FaExclamationTriangle className="text-red-400 text-sm" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
            <button onClick={cargarDatos} className="mt-2 text-xs text-red-400 underline">Reintentar</button>
          </div>
        )}

        {/* Tarjetas de resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="glass-card p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Rendiciones</p>
            <p className="text-2xl font-bold text-white">{hojasConGastos.length}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{gastos.length} gastos totales</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Pendientes</p>
            <p className="text-2xl font-bold text-amber-400">{totalPendientes}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Requieren revisión</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Aprobadas</p>
            <p className="text-2xl font-bold text-emerald-400">{totalAprobados}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">$ {formatImporte(importeAprobado)}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Importe Total</p>
            <p className="text-2xl font-bold text-white">$ {formatImporte(importeTotal)}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Todas las rendiciones</p>
          </div>
        </div>

        {/* Filtros y búsqueda */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm" />
            <input
              type="text"
              className="input-field pl-9 text-sm"
              placeholder="Buscar por N° viaje, chofer o patente..."
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

        {/* Tabla / Lista de rendiciones */}
        {hojasFiltradas.length === 0 ? (
          <div className="text-center py-16 glass-card p-8">
            <div className="w-14 h-14 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
              <FaClipboardCheck className="text-2xl text-gray-600" />
            </div>
            <p className="text-base font-medium text-white mb-1">
              {hojasConGastos.length === 0 ? 'Sin rendiciones' : 'Sin resultados'}
            </p>
            <p className="text-gray-500 text-sm">
              {hojasConGastos.length === 0 
                ? 'Todavía no hay gastos cargados por los choferes' 
                : 'Probá con otro criterio de búsqueda'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {hojasFiltradas.map((hoja) => {
              const gastosDelViaje = gastosPorViaje[hoja.Nro_Viaje] || []
              const total = totalViaje(hoja.Nro_Viaje)
              const estaAprobado = !!aprobaciones[hoja.Nro_Viaje]
              const estaExpandido = expandedViaje === hoja.Nro_Viaje
              const estaAprobandoEste = aprobando === hoja.Nro_Viaje

              return (
                <div key={`${hoja.Cod_Empresa}-${hoja.Nro_Viaje}`} className="glass-card overflow-hidden">
                  {/* Fila principal */}
                  <div 
                    className="p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => setExpandedViaje(estaExpandido ? null : hoja.Nro_Viaje)}
                  >
                    <div className="flex items-center gap-4">
                      {/* Estado */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        estaAprobado 
                          ? 'bg-emerald-600/15' 
                          : 'bg-amber-600/15'
                      }`}>
                        {estaAprobado 
                          ? <FaCheck className="text-emerald-400" />
                          : <FaExclamationTriangle className="text-amber-400 text-sm" />
                        }
                      </div>

                      {/* Info principal */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-sm font-semibold text-white">
                            Viaje {hoja.Nro_Viaje}
                          </h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                            estaAprobado
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {estaAprobado ? 'Aprobado' : 'Pendiente'}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                            hoja.Estado_Viaje === 'Abierto' ? 'status-open' : 'status-closed'
                          }`}>
                            {hoja.Estado_Viaje}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <FaUser className="text-[10px]" />
                            {hoja.Nombre_Chofer}
                          </span>
                          <span className="flex items-center gap-1">
                            <FaTruck className="text-[10px]" />
                            {hoja.Patente_Tractor}
                          </span>
                          <span className="hidden sm:flex items-center gap-1">
                            <FaCalendarAlt className="text-[10px]" />
                            {formatFecha(hoja.Fecha_Salida)}
                          </span>
                        </div>
                      </div>

                      {/* Importe y cantidad */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-bold text-white">$ {formatImporte(total)}</p>
                        <p className="text-[10px] text-gray-500">{gastosDelViaje.length} gasto{gastosDelViaje.length !== 1 ? 's' : ''}</p>
                      </div>

                      {/* Chevron */}
                      <div className="flex-shrink-0 text-gray-600">
                        {estaExpandido ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
                      </div>
                    </div>
                  </div>

                  {/* Detalle expandido */}
                  {estaExpandido && (
                    <div className="border-t border-white/[0.04]">
                      {/* Info del viaje */}
                      <div className="px-4 py-3 bg-white/[0.01] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-gray-600">Empresa:</span>
                          <span className="text-gray-300 ml-1">{hoja.Cod_Empresa}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Semi:</span>
                          <span className="text-gray-300 ml-1">{hoja.Patente_Semirremolque}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Salida:</span>
                          <span className="text-gray-300 ml-1">{formatFecha(hoja.Fecha_Salida)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Llegada:</span>
                          <span className="text-gray-300 ml-1">{formatFecha(hoja.Fecha_Llegada)}</span>
                        </div>
                      </div>

                      {/* Aprobación info */}
                      {estaAprobado && aprobaciones[hoja.Nro_Viaje] && (
                        <div className="px-4 py-2.5 bg-emerald-500/[0.03] border-t border-white/[0.04] flex items-center justify-between">
                          <p className="text-xs text-emerald-400">
                            Aprobado por <strong>{aprobaciones[hoja.Nro_Viaje].aprobadoPor}</strong> el {formatFecha(aprobaciones[hoja.Nro_Viaje].fechaAprobacion)}
                          </p>
                          <button
                            onClick={(e) => { e.stopPropagation(); revocarAprobacion(hoja.Nro_Viaje) }}
                            className="text-[10px] text-gray-600 hover:text-red-400 transition-colors underline"
                          >
                            Revocar
                          </button>
                        </div>
                      )}

                      {/* Tabla de gastos */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-t border-white/[0.04] bg-white/[0.02]">
                              <th className="text-left py-2.5 px-4 text-gray-500 font-medium uppercase tracking-wider">Fecha</th>
                              <th className="text-left py-2.5 px-4 text-gray-500 font-medium uppercase tracking-wider">País</th>
                              <th className="text-left py-2.5 px-4 text-gray-500 font-medium uppercase tracking-wider">Concepto</th>
                              <th className="text-left py-2.5 px-4 text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Código</th>
                              <th className="text-left py-2.5 px-4 text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Formal.</th>
                              <th className="text-left py-2.5 px-4 text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Proveedor</th>
                              <th className="text-left py-2.5 px-4 text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Descripción</th>
                              <th className="text-right py-2.5 px-4 text-gray-500 font-medium uppercase tracking-wider">Importe</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gastosDelViaje.map((gasto) => (
                              <tr key={gasto.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                                <td className="py-2.5 px-4 text-gray-300">{formatFecha(gasto.fecha)}</td>
                                <td className="py-2.5 px-4">
                                  <span className="flex items-center gap-1.5">
                                    <span>{BANDERAS[gasto.pais]}</span>
                                    <span className="text-gray-400">{NOMBRES_PAIS[gasto.pais]}</span>
                                  </span>
                                </td>
                                <td className="py-2.5 px-4">
                                  <span className="text-gray-300">{gasto.tipo}</span>
                                  {gasto.tipoProducto && (
                                    <span className="block text-[10px] text-gray-600">{gasto.tipoProducto}</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 text-gray-400 hidden sm:table-cell font-mono text-[11px]">
                                  {gasto.tipoProducto && gasto.codigoArticulo 
                                    ? `${gasto.tipoProducto}/${gasto.codigoArticulo}` 
                                    : '—'}
                                </td>
                                <td className="py-2.5 px-4 hidden sm:table-cell">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    gasto.formalidad === 'FORMAL'
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : 'bg-amber-500/10 text-amber-400'
                                  }`}>
                                    {gasto.formalidad || 'N/D'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-gray-400 hidden sm:table-cell max-w-[150px] truncate text-[11px]">{gasto.proveedor || '—'}</td>
                                <td className="py-2.5 px-4 text-gray-500 hidden sm:table-cell max-w-[200px] truncate">{gasto.descripcion || '—'}</td>
                                <td className="py-2.5 px-4 text-right font-medium text-white">$ {formatImporte(gasto.importe)}</td>
                              </tr>
                            ))}
                            {/* Fila total */}
                            <tr className="border-t border-white/[0.06] bg-white/[0.02]">
                              <td colSpan={3} className="py-3 px-4 text-right font-semibold text-gray-400 sm:hidden">TOTAL</td>
                              <td colSpan={7} className="py-3 px-4 text-right font-semibold text-gray-400 hidden sm:table-cell">TOTAL</td>
                              <td className="py-3 px-4 text-right font-bold text-white text-sm">$ {formatImporte(total)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Botón Aprobar / Ya Aprobado */}
                      <div className="p-4 border-t border-white/[0.04] flex justify-end gap-3">
                        {!estaAprobado ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); aprobarRendicion(hoja) }}
                            disabled={estaAprobandoEste}
                            className="px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-2 disabled:opacity-60"
                          >
                            {estaAprobandoEste ? (
                              <>
                                <FaSpinner className="animate-spin text-xs" />
                                Aprobando...
                              </>
                            ) : (
                              <>
                                <FaCheck className="text-xs" />
                                Aprobar Rendición
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 text-emerald-400 text-sm">
                            <FaCheck className="text-xs" />
                            <span className="font-medium">Rendición Aprobada</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
