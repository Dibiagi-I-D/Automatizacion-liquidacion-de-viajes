import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FaTruck, FaSpinner, FaCalendarAlt, FaCheckCircle, FaClock, FaEye, FaChevronRight } from 'react-icons/fa'
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
  importe: number
  descripcion?: string
  createdAt: string
}

export default function Rendicion() {
  const navigate = useNavigate()
  const { chofer } = useAuth()
  const [hojasDeRuta, setHojasDeRuta] = useState<HojaDeRuta[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [gastosCount, setGastosCount] = useState<Record<number, number>>({})
  const [totalesPorViaje, setTotalesPorViaje] = useState<Record<number, number>>({})

  useEffect(() => {
    cargarHojasDeRuta()
    cargarGastos()
  }, [])

  const cargarGastos = () => {
    fetch(`${API_URL}/gastos-viaje`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const gastosData: Gasto[] = data.data
          setGastos(gastosData)
          
          const counts: Record<number, number> = {}
          const totales: Record<number, number> = {}
          
          gastosData.forEach((gasto) => {
            counts[gasto.nroViaje] = (counts[gasto.nroViaje] || 0) + 1
            totales[gasto.nroViaje] = (totales[gasto.nroViaje] || 0) + gasto.importe
          })
          
          setGastosCount(counts)
          setTotalesPorViaje(totales)
        }
      })
      .catch(() => {})
  }

  const cargarHojasDeRuta = async () => {
    try {
      setLoading(true)
      setError('')
      
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/drivers/roadmaps-public`)
      
      if (response.status === 500) {
        setError('Error en la API de hojas de ruta.')
        setLoading(false)
        return
      }
      
      const data = await response.json()
      
      if (data.success) {
        const nombreChofer = (chofer as any)?.nombreCompleto || ''
        const patenteTractor = chofer?.interno || ''
        
        const hojasFiltradas = data.data.filter((hoja: HojaDeRuta) => {
          if (!hoja.Nombre_Chofer || !hoja.Patente_Tractor) return false
          
          const nombreMatch = hoja.Nombre_Chofer.trim().toUpperCase() === nombreChofer.trim().toUpperCase()
          const patenteMatch = hoja.Patente_Tractor.trim().toUpperCase().replace(/\s+/g, '') === patenteTractor.trim().toUpperCase().replace(/\s+/g, '')
          
          return nombreMatch && patenteMatch
        })
        
        const hojasOrdenadas = hojasFiltradas.sort((a: HojaDeRuta, b: HojaDeRuta) => b.Nro_Viaje - a.Nro_Viaje)
        
        let hojasRecientes: HojaDeRuta[] = []
        
        if (hojasOrdenadas.length > 0) {
          hojasRecientes.push(hojasOrdenadas[0])
          const fechaReciente = new Date(hojasOrdenadas[0].Fecha_Salida)
          
          for (let i = 1; i < hojasOrdenadas.length; i++) {
            const diferenciaDias = Math.abs((fechaReciente.getTime() - new Date(hojasOrdenadas[i].Fecha_Salida).getTime()) / (1000 * 60 * 60 * 24))
            if (diferenciaDias <= 10) hojasRecientes.push(hojasOrdenadas[i])
          }
        }
        
        setHojasDeRuta(hojasRecientes)
      }
    } catch (err) {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'En curso'
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const formatImporte = (importe: number) => {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(importe)
  }

  const verDetalleViaje = (nroViaje: number) => {
    navigate(`/dashboard/detalle-viaje?viaje=${nroViaje}`)
  }

  if (loading) {
    return (
      <div className="section-container flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <FaSpinner className="animate-spin text-2xl text-emerald-400 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando rendiciones...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="section-container">
        <div className="info-panel border-red-500/20 bg-red-500/[0.04]">
          <p className="font-medium text-red-400 text-sm mb-1">Error</p>
          <p className="text-xs text-gray-500">{error}</p>
          <button onClick={cargarHojasDeRuta} className="mt-3 btn-primary text-sm">Reintentar</button>
        </div>
      </div>
    )
  }

  const totalGeneral = Object.values(totalesPorViaje).reduce((sum, total) => sum + total, 0)
  const totalGastos = gastos.length

  return (
    <div className="section-container pb-24">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-white">
          Rendiciones
        </h1>
        <span className="text-xs text-gray-500 font-medium">
          {hojasDeRuta.length} viaje{hojasDeRuta.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Resumen */}
      {totalGastos > 0 && (
        <div className="info-panel mb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Total general</p>
              <p className="text-xl font-bold text-white mt-0.5">$ {formatImporte(totalGeneral)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{totalGastos} gastos registrados</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {(chofer as any)?.nombreCompleto || ''} · {chofer?.interno || ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {hojasDeRuta.length === 0 ? (
        <div className="text-center py-16 glass-card p-8">
          <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
            <FaTruck className="text-xl text-gray-600" />
          </div>
          <p className="text-base font-medium text-white mb-1">Sin viajes asignados</p>
          <p className="text-gray-500 text-sm">Contactá con tu supervisor</p>
        </div>
      ) : (
        <div className="space-y-3">
          {hojasDeRuta.map((hoja) => {
            const totalViaje = totalesPorViaje[hoja.Nro_Viaje] || 0
            const cantidadGastos = gastosCount[hoja.Nro_Viaje] || 0

            return (
              <div key={`${hoja.Cod_Empresa}-${hoja.Nro_Viaje}`} className="glass-card p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-base font-semibold text-white">Viaje {hoja.Nro_Viaje}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${hoja.Estado_Viaje === 'Abierto' ? 'status-open' : 'status-closed'}`}>
                        {hoja.Estado_Viaje === 'Abierto' ? 'Abierto' : 'Cerrado'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{hoja.Cod_Empresa}</p>
                  </div>
                  
                  <div className="text-right">
                    {cantidadGastos > 0 ? (
                      <>
                        <p className="text-lg font-bold text-white">$ {formatImporte(totalViaje)}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{cantidadGastos} gasto{cantidadGastos !== 1 ? 's' : ''}</p>
                      </>
                    ) : (
                      <span className="text-[10px] font-medium text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded-md">Sin gastos</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <FaTruck className="text-gray-600 text-[10px]" />
                    <span>{hoja.Patente_Tractor}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <FaCalendarAlt className="text-gray-600 text-[10px]" />
                    <span>{formatFecha(hoja.Fecha_Salida)} — {formatFecha(hoja.Fecha_Llegada)}</span>
                  </div>
                </div>

                {cantidadGastos > 0 && (
                  <div className="pt-3 border-t border-white/[0.04]">
                    <button 
                      className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-sm text-gray-300" 
                      onClick={() => verDetalleViaje(hoja.Nro_Viaje)}
                    >
                      <span className="flex items-center gap-2">
                        <FaEye className="text-gray-500 text-xs" />
                        Ver detalle
                      </span>
                      <FaChevronRight className="text-gray-600 text-[10px]" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
