import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FaTruck, FaSpinner, FaCalendarAlt, FaCheckCircle, FaClock, FaArrowLeft, FaTrash, FaPlus, FaUser, FaTrailer } from 'react-icons/fa'
import { BANDERAS, Pais } from '../types'

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

export default function DetalleViaje() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nroViaje = searchParams.get('viaje')
  
  const [hojaDeRuta, setHojaDeRuta] = useState<HojaDeRuta | null>(null)
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (nroViaje) {
      cargarDetalleViaje()
      cargarGastosDelViaje()
    }
  }, [nroViaje])

  const cargarDetalleViaje = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/drivers/roadmaps-public`)
      
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const viaje = data.data.find((h: HojaDeRuta) => h.Nro_Viaje.toString() === nroViaje)
          setHojaDeRuta(viaje || null)
        }
      }
    } catch (err) {
      setError('Error al cargar el viaje')
    } finally {
      setLoading(false)
    }
  }

  const cargarGastosDelViaje = async () => {
    try {
      const res = await fetch(`${API_URL}/gastos-viaje/${nroViaje}`)
      if (res.ok) {
        const data = await res.json()
        setGastos(data.data || [])
      }
    } catch (err) {
      console.error('Error al cargar gastos del viaje:', err)
    }
  }

  const eliminarGasto = async (gastoId: string) => {
    if (!confirm('¿Estás seguro de eliminar este gasto?')) return
    
    try {
      const res = await fetch(`${API_URL}/gastos-viaje/${gastoId}`, { method: 'DELETE' })
      if (res.ok) {
        cargarGastosDelViaje()
      }
    } catch (err) {
      console.error('Error al eliminar gasto:', err)
    }
  }

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'En curso'
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const formatImporte = (importe: number) => {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(importe)
  }

  const totalGastos = gastos.reduce((sum, g) => sum + g.importe, 0)

  if (loading) {
    return (
      <div className="section-container flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <FaSpinner className="animate-spin text-2xl text-emerald-400 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando detalle...</p>
        </div>
      </div>
    )
  }

  if (!hojaDeRuta) {
    return (
      <div className="section-container">
        <button onClick={() => navigate('/dashboard/rendicion')} className="mb-4 text-gray-500 hover:text-white transition-colors flex items-center gap-2 text-sm">
          <FaArrowLeft className="text-xs" />
          Volver
        </button>
        <div className="info-panel border-red-500/20 bg-red-500/[0.04]">
          <p className="font-medium text-red-400 text-sm mb-1">Viaje no encontrado</p>
          <p className="text-xs text-gray-500">No se pudo cargar la información del viaje {nroViaje}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="section-container pb-24">
      {/* Botón volver */}
      <button
        onClick={() => navigate('/dashboard/rendicion')}
        className="mb-4 text-gray-500 hover:text-white transition-colors flex items-center gap-2 text-sm"
      >
        <FaArrowLeft className="text-xs" />
        Volver
      </button>

      {/* Header del viaje */}
      <div className="glass-card p-5 mb-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-white">Viaje {hojaDeRuta.Nro_Viaje}</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                hojaDeRuta.Estado_Viaje === 'Abierto' ? 'status-open' : 'status-closed'
              }`}>
                {hojaDeRuta.Estado_Viaje === 'Abierto' ? 'Abierto' : 'Cerrado'}
              </span>
            </div>
            <p className="text-xs text-gray-500">{hojaDeRuta.Cod_Empresa}</p>
          </div>
          
          {gastos.length > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total</p>
              <p className="text-xl font-bold text-white">$ {formatImporte(totalGastos)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{gastos.length} gasto{gastos.length !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>

        {/* Detalles del viaje */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/[0.04]">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Chofer</p>
            <div className="flex items-center gap-1.5 text-sm text-white">
              <FaUser className="text-gray-600 text-[10px]" />
              {hojaDeRuta.Nombre_Chofer}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Tractor</p>
            <div className="flex items-center gap-1.5 text-sm text-white">
              <FaTruck className="text-gray-600 text-[10px]" />
              {hojaDeRuta.Patente_Tractor}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Semirremolque</p>
            <div className="flex items-center gap-1.5 text-sm text-white">
              <FaTrailer className="text-gray-600 text-[10px]" />
              {hojaDeRuta.Patente_Semirremolque}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Período</p>
            <div className="flex items-center gap-1.5 text-sm text-white">
              <FaCalendarAlt className="text-gray-600 text-[10px]" />
              {formatFecha(hojaDeRuta.Fecha_Salida)} — {formatFecha(hojaDeRuta.Fecha_Llegada)}
            </div>
          </div>
        </div>

        {hojaDeRuta.Observaciones && (
          <div className="mt-4 pt-3 border-t border-white/[0.04]">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Observaciones</p>
            <p className="text-white text-sm">{hojaDeRuta.Observaciones}</p>
          </div>
        )}

        {/* Botón agregar gasto */}
        <div className="mt-4 pt-3 border-t border-white/[0.04]">
          <button
            className="btn-primary w-full text-sm"
            onClick={() => navigate(`/dashboard/nuevo-gasto?viaje=${hojaDeRuta.Nro_Viaje}`)}
          >
            <FaPlus className="mr-2 text-xs" />
            Agregar Gasto
          </button>
        </div>
      </div>

      {/* Lista de gastos */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white">Gastos del viaje</h2>
        {gastos.length > 0 && (
          <span className="text-[10px] text-gray-500">{gastos.length} registro{gastos.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {gastos.length === 0 ? (
        <div className="text-center py-12 glass-card p-8">
          <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
            <FaCalendarAlt className="text-xl text-gray-600" />
          </div>
          <p className="text-base font-medium text-white mb-1">Sin gastos registrados</p>
          <p className="text-gray-500 text-sm mb-5">
            Todavía no se registraron gastos para este viaje
          </p>
          <button
            className="btn-primary text-sm"
            onClick={() => navigate(`/dashboard/nuevo-gasto?viaje=${hojaDeRuta.Nro_Viaje}`)}
          >
            <FaPlus className="mr-2 text-xs" />
            Agregar Gasto
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {gastos.map((gasto) => (
            <div
              key={gasto.id}
              className="glass-card p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-2xl leading-none mt-0.5">{BANDERAS[gasto.pais]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">
                      {gasto.tipo}
                    </p>
                    {gasto.tipoProducto && gasto.codigoArticulo && (
                      <p className="text-[10px] text-gray-600 font-mono">
                        {gasto.tipoProducto}/{gasto.codigoArticulo}
                        {gasto.formalidad && (
                          <span className={`ml-2 px-1.5 py-0.5 rounded font-sans ${
                            gasto.formalidad === 'FORMAL'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {gasto.formalidad}
                          </span>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatFecha(gasto.fecha)}
                      {gasto.proveedor && (
                        <span className="text-gray-600"> · {gasto.proveedor}</span>
                      )}
                    </p>
                    {gasto.descripcion && (
                      <p className="text-xs text-gray-600 mt-1.5 truncate">
                        {gasto.descripcion}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-3">
                  <p className="text-base font-semibold text-white whitespace-nowrap">
                    $ {formatImporte(gasto.importe)}
                  </p>
                  <button
                    onClick={() => eliminarGasto(gasto.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                    title="Eliminar"
                  >
                    <FaTrash className="text-xs" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
