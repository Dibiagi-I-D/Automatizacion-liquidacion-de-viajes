import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FaTruck, FaSpinner, FaCalendarAlt, FaCheckCircle, FaClock, FaArrowLeft, FaPlus, FaUser, FaTrailer } from 'react-icons/fa'
import { BANDERAS, MONEDAS, Pais, totalesPorMoneda } from '../types'
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

  // El chofer no elimina gastos: esa acción vive en el panel de administración,
  // que es donde se controla y se aprueba la rendición.

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'En curso'
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const formatImporte = (importe: number) => {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(importe)
  }

  // Un total por moneda: ARS, CLP y UYU no se suman entre sí
  const totalesViaje = totalesPorMoneda(gastos)

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
        {/* En celular el titulo y los totales van uno debajo del otro; recien
            desde sm se ponen lado a lado, donde hay ancho de sobra. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
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
            <div className="sm:text-right sm:min-w-[150px] sm:flex-shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-white/[0.04]">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Total por moneda</p>
              <TotalesPorMoneda totales={totalesViaje} />
              <p className="text-[10px] text-gray-500 mt-1.5">{gastos.length} gasto{gastos.length !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>

        {/* Detalles del viaje — el nombre del chofer y el periodo son los textos
            mas largos, asi que ocupan el ancho completo en celular. */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 pt-4 border-t border-white/[0.04]">
          <div className="col-span-2 sm:col-span-1 min-w-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Chofer</p>
            <div className="flex items-start gap-1.5 text-sm text-white">
              <FaUser className="text-gray-600 text-[10px] mt-1 flex-shrink-0" />
              <span className="break-words min-w-0">{hojaDeRuta.Nombre_Chofer}</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Tractor</p>
            <div className="flex items-start gap-1.5 text-sm text-white">
              <FaTruck className="text-gray-600 text-[10px] mt-1 flex-shrink-0" />
              <span className="break-words min-w-0">{hojaDeRuta.Patente_Tractor}</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Semirremolque</p>
            <div className="flex items-start gap-1.5 text-sm text-white">
              <FaTrailer className="text-gray-600 text-[10px] mt-1 flex-shrink-0" />
              <span className="break-words min-w-0">{hojaDeRuta.Patente_Semirremolque || '—'}</span>
            </div>
          </div>
          <div className="col-span-2 min-w-0">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Período</p>
            <div className="flex items-start gap-1.5 text-sm text-white">
              <FaCalendarAlt className="text-gray-600 text-[10px] mt-1 flex-shrink-0" />
              <span className="break-words min-w-0">
                {formatFecha(hojaDeRuta.Fecha_Salida)} — {formatFecha(hojaDeRuta.Fecha_Llegada)}
              </span>
            </div>
          </div>
        </div>

        {hojaDeRuta.Observaciones && (
          <div className="mt-4 pt-3 border-t border-white/[0.04]">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Observaciones</p>
            <p className="text-white text-sm break-words">{hojaDeRuta.Observaciones}</p>
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
          {/*
            Dos filas en vez de una: en un celango angosto el importe quedaba
            apretado contra el texto y se cortaba. Ahora el concepto ocupa el
            ancho completo y el importe baja a su propia linea, alineado a la
            derecha. El texto largo se parte en vez de truncarse.
          */}
          {gastos.map((gasto) => (
            <div key={gasto.id} className="glass-card p-3.5">
              {/* Fila 1 — concepto */}
              <div className="flex items-start gap-2.5">
                <span className="text-lg leading-none mt-0.5 flex-shrink-0">
                  {BANDERAS[gasto.pais]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white break-words leading-snug">
                    {gasto.tipo}
                  </p>
                  {gasto.tipoProducto && gasto.codigoArticulo && (
                    <p className="text-[10px] text-gray-600 font-mono mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{gasto.tipoProducto}/{gasto.codigoArticulo}</span>
                      {gasto.formalidad && (
                        <span className={`px-1.5 py-0.5 rounded font-sans ${
                          gasto.formalidad === 'FORMAL'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {gasto.formalidad}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Fila 2 — fecha, proveedor e importe */}
              <div className="flex items-end justify-between gap-3 mt-2 pt-2 border-t border-white/[0.04]">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500 break-words">
                    {formatFecha(gasto.fecha)}
                    {gasto.proveedor && (
                      <span className="text-gray-600"> · {gasto.proveedor}</span>
                    )}
                  </p>
                  {gasto.descripcion && (
                    <p className="text-xs text-gray-600 mt-1 break-words">
                      {gasto.descripcion}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-semibold text-white tabular-nums leading-none">
                    $ {formatImporte(gasto.importe)}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">{MONEDAS[gasto.pais]}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
