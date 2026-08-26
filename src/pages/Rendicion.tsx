import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FaTruck, FaSpinner, FaCalendarAlt, FaEye, FaChevronRight } from 'react-icons/fa'
import { Pais, totalesPorMoneda } from '../types'
import TotalesPorMoneda from '../components/TotalesPorMoneda'
import { buscarViajeActivo, HojaDeRuta } from '../api/viajeActivo'

const API_URL = import.meta.env.VITE_API_URL || '/api'

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
  legajoChofer?: string
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

  useEffect(() => {
    cargarHojasDeRuta()
  }, [])

  /**
   * Los gastos se piden UNO POR VIAJE, no con GET /api/gastos-viaje.
   * Ese endpoint devuelve los gastos de todos los choferes de la empresa, y al
   * chofer no le sirve —ni le corresponde— ver lo que cargó otro. Pidiendo por
   * viaje, al navegador solo llega lo de sus propias hojas de ruta.
   */
  useEffect(() => {
    if (hojasDeRuta.length === 0) {
      setGastos([])
      setGastosCount({})
      return
    }

    let cancelado = false
    const legajo = (chofer?.legajo || '').trim()

    Promise.all(
      hojasDeRuta.map(h =>
        fetch(`${API_URL}/gastos-viaje/${h.Nro_Viaje}`)
          .then(r => r.json())
          .then(d => (d.success ? (d.data as Gasto[]) : []))
          .catch(() => [] as Gasto[])
      )
    ).then(listas => {
      if (cancelado) return

      // Red de seguridad: si dos choferes compartieron un viaje, mostrar solo
      // los gastos firmados con este legajo. Los que no lo tengan se conservan.
      const propios = listas.flat().filter(g => {
        const suyo = (g.legajoChofer || '').trim()
        return !legajo || !suyo || suyo === legajo
      })

      setGastos(propios)

      const counts: Record<number, number> = {}
      propios.forEach(g => {
        counts[g.nroViaje] = (counts[g.nroViaje] || 0) + 1
      })
      setGastosCount(counts)
    })

    return () => { cancelado = true }
  }, [hojasDeRuta, chofer])

  /** Totales separados por moneda para un viaje puntual */
  const totalesDelViaje = (nroViaje: number) =>
    totalesPorMoneda(gastos.filter(g => g.nroViaje === nroViaje))

  /**
   * Carga UNA sola hoja de ruta: la que el chofer está usando en este momento.
   *
   * Antes se mostraba la más reciente más todas las de ±10 días, y aparecían
   * viajes ya cerrados que al chofer no le aportan nada. Ahora usa la misma
   * detección que la pantalla de Viajes (patente + legajo contra USR_GTVIAH).
   */
  const cargarHojasDeRuta = async () => {
    setLoading(true)
    setError('')

    const resultado = await buscarViajeActivo(chofer as any)

    if (resultado.estado === 'encontrado') {
      setHojasDeRuta([resultado.hoja])
    } else {
      setHojasDeRuta([])
      if (resultado.estado === 'error') setError(resultado.mensaje)
    }

    setLoading(false)
  }

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'En curso'
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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

  return (
    <div className="section-container pb-24">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-white">
          Rendición
        </h1>
        <span className="text-xs text-gray-500 font-medium">
          {(chofer as any)?.nombreCompleto || ''} · {chofer?.interno || ''}
        </span>
      </div>

      {/*
        Sin tarjeta de totales generales: el chofer trabaja sobre una sola hoja
        de ruta y el detalle completo está en "Ver detalle" de esa hoja.
      */}

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
            const totalesViaje = totalesDelViaje(hoja.Nro_Viaje)
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
                  
                  <div className="text-right min-w-[130px]">
                    {cantidadGastos > 0 ? (
                      <>
                        <TotalesPorMoneda totales={totalesViaje} />
                        <p className="text-[10px] text-gray-500 mt-1">{cantidadGastos} gasto{cantidadGastos !== 1 ? 's' : ''}</p>
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
