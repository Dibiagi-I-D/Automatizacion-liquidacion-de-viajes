import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaTruck, FaSpinner, FaMapMarkedAlt, FaCalendarAlt, FaCheckCircle, FaClock, FaPlus, FaUser, FaTrailer, FaSatelliteDish } from 'react-icons/fa'
import { useAuth } from '../context/AuthContext'

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

interface ViajeActivo {
  nroViaje: number
  codEmpresa: string
  patente: string
  numeroInterno: number
  tipoMovimiento: string // ENTRA o SALE
  fechaMovimiento: string
  horaMovimiento: string
  origenMovimiento: string
  destinoMovimiento: string
  chofer: string
  patenteSemi: string
  fechaSalida: string | null
  fechaLlegada: string | null
  origenHR: string
  destinoHR: string
  observaciones: string
  cerrado: string
  liquidado: string
}

export default function HojasDeRuta() {
  const navigate = useNavigate()
  const { chofer } = useAuth()
  const [hojasDeRuta, setHojasDeRuta] = useState<HojaDeRuta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [gastosCount, setGastosCount] = useState<Record<number, number>>({})
  const [viajeActivo, setViajeActivo] = useState<ViajeActivo | null>(null)
  const [modoDeteccion, setModoDeteccion] = useState<'tiempo-real' | 'historial'>('historial')

  // Cargar conteo de gastos desde el servidor
  useEffect(() => {
    fetch(`${API_URL}/gastos-viaje`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const counts: Record<number, number> = {}
          data.data.forEach((gasto: any) => {
            counts[gasto.nroViaje] = (counts[gasto.nroViaje] || 0) + 1
          })
          setGastosCount(counts)
        }
      })
      .catch(() => {})
  }, [hojasDeRuta])

  useEffect(() => {
    cargarHojasDeRuta()
  }, [])

  const cargarHojasDeRuta = async () => {
    try {
      setLoading(true)
      setError('')

      const patenteTractor = chofer?.interno || ''
      const legajoChofer = (chofer?.legajo || '').trim()

      // PASO 1: Buscar la hoja de ruta ABIERTA que corresponde al chofer + tractor
      // del login. El backend cruza USR_GTVIAH_PATTRA con USR_GTVIAH_NROLEG, así que
      // si el tractor no es el de este chofer, no devuelve nada (found: false).
      let sqlDisponible = true
      try {
        if (patenteTractor) {
          console.log('🛰️ Buscando hoja abierta para:', patenteTractor, '| legajo:', legajoChofer)
          const viajeResponse = await fetch(
            `${API_URL}/drivers/viaje-activo-public` +
            `?patente=${encodeURIComponent(patenteTractor)}` +
            `&legajo=${encodeURIComponent(legajoChofer)}`
          )
          const viajeData = await viajeResponse.json()

          // sqlError = SQL Server caído → recién ahí tiene sentido el fallback histórico
          if (viajeData.sqlError) {
            sqlDisponible = false
          } else if (viajeData.success && viajeData.found && viajeData.data?.nroViaje) {
            const viaje = viajeData.data as ViajeActivo
            setViajeActivo(viaje)
            setModoDeteccion('tiempo-real')
            console.log('✅ Hoja de ruta asignada:', viaje.nroViaje)

            // Construir la hoja de ruta directamente con datos de SQL Server (USR_GTVIAH)
            const hojaSQL: HojaDeRuta = {
              Cod_Empresa: viaje.codEmpresa || '',
              Nro_Viaje: viaje.nroViaje,
              Fecha_Salida: viaje.fechaSalida || '',
              Fecha_Llegada: viaje.fechaLlegada || null,
              Nombre_Chofer: viaje.chofer || '',
              Patente_Tractor: viaje.patente || patenteTractor,
              Patente_Semirremolque: viaje.patenteSemi || '',
              Observaciones: viaje.observaciones || '',
              Estado_Viaje: viaje.cerrado === 'N' ? 'Abierto' : 'Cerrado'
            }

            setHojasDeRuta([hojaSQL])
            setLoading(false)
            return // Listo, no necesitamos la API externa
          } else {
            // SQL respondió bien y este chofer NO tiene hoja abierta con este tractor.
            // No hay que caer al fallback: devolvería la hoja de otro chofer.
            console.log('⛔ Sin hoja abierta para este chofer + tractor')
            setHojasDeRuta([])
            setError(
              `No encontramos una hoja de ruta abierta para ${(chofer as any)?.nombreCompleto || 'este chofer'} ` +
              `con el tractor ${patenteTractor}. Verificá que hayas seleccionado tu tractor al ingresar.`
            )
            setLoading(false)
            return
          }
        }
      } catch (err) {
        sqlDisponible = false
        console.log('⚠️ SQL Server no disponible, se intentará con la API externa')
      }

      if (!sqlDisponible) {
        console.log('↩️ Fallback: buscando en el historial de la API externa')
      }

      // PASO 2: Fallback → Obtener hojas de ruta de la API externa
      setModoDeteccion('historial')
      const nombreChofer = (chofer as any)?.nombreCompleto || ''

      const response = await fetch(`${API_URL}/drivers/roadmaps-public`)
      
      if (response.status === 500) {
        setError('⚠️ Error en la API de hojas de ruta. El servidor externo está devolviendo un error 500. Por favor contacta al administrador del sistema.')
        setLoading(false)
        return
      }
      
      const data = await response.json()
      
      if (!data.success) {
        setError(data.message || 'Error al cargar hojas de ruta')
        return
      }

      // Filtrar hojas de ruta del chofer + tractor logueado
      const hojasFiltradas = data.data.filter((hoja: HojaDeRuta) => {
        if (!hoja.Nombre_Chofer || !hoja.Patente_Tractor) return false
        
        const nombreHojaNorm = (hoja.Nombre_Chofer || '').trim().toUpperCase()
        const nombreChoferNorm = (nombreChofer || '').trim().toUpperCase()
        const patenteHojaNorm = (hoja.Patente_Tractor || '').trim().toUpperCase().replace(/\s+/g, '')
        const patenteTractorNorm = (patenteTractor || '').trim().toUpperCase().replace(/\s+/g, '')
        
        return nombreHojaNorm === nombreChoferNorm && patenteHojaNorm === patenteTractorNorm
      })
      
      // Ordenar por número de viaje descendente (más reciente primero)
      const hojasOrdenadas = hojasFiltradas.sort((a: HojaDeRuta, b: HojaDeRuta) => b.Nro_Viaje - a.Nro_Viaje)

      console.log('📋 Hojas del chofer+tractor:', hojasOrdenadas.length, hojasOrdenadas.map((h: HojaDeRuta) => h.Nro_Viaje))

      // Mostrar solo la más reciente
      if (hojasOrdenadas.length > 0) {
        console.log('📌 Mostrando solo la hoja más reciente:', hojasOrdenadas[0].Nro_Viaje)
        setHojasDeRuta([hojasOrdenadas[0]])
      } else {
        setHojasDeRuta([])
      }
    } catch (err) {
      console.error('Error al cargar hojas de ruta:', err)
      setError('⚠️ La API de hojas de ruta está devolviendo un error. Por favor contacta al administrador del sistema o intenta más tarde.')
    } finally {
      setLoading(false)
    }
  }

  const filteredHojas = hojasDeRuta.filter(hoja => 
    hoja.Nro_Viaje.toString().includes(searchQuery) ||
    hoja.Nombre_Chofer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    hoja.Patente_Tractor.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'En curso'
    return new Date(fecha).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="section-container flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <FaSpinner className="animate-spin text-2xl text-emerald-400 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando hojas de ruta...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="section-container">
        <div className="info-panel border-red-500/20 bg-red-500/[0.04]">
          <p className="font-medium text-red-400 text-sm mb-1">Error de conexión</p>
          <p className="text-xs text-gray-500">{error}</p>
          <button
            onClick={cargarHojasDeRuta}
            className="mt-3 btn-primary text-sm"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="section-container">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-white">
          Hojas de Ruta
        </h1>
        <span className="text-xs text-gray-500 font-medium">
          {filteredHojas.length} viaje{filteredHojas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Info del chofer y tractor */}
      <div className="info-panel mb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">Sesión activa</p>
            <p className="text-sm text-white font-medium">
              {(chofer as any)?.nombreCompleto || 'Chofer'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {chofer?.interno || 'Tractor'}
            </p>
          </div>
          <div className="text-right">
            {modoDeteccion === 'tiempo-real' ? (
              <div className="flex items-center gap-1.5">
                <FaSatelliteDish className="text-emerald-400 text-xs animate-pulse" />
                <span className="text-[10px] font-medium text-emerald-400">EN TIEMPO REAL</span>
              </div>
            ) : (
              <span className="text-[10px] font-medium text-gray-500">Últimos 10 días</span>
            )}
          </div>
        </div>
      </div>

      {/* Info del viaje activo detectado */}
      {viajeActivo && modoDeteccion === 'tiempo-real' && (
        <div className="mb-4 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04]">
          <div className="flex items-center gap-2 mb-1.5">
            <FaSatelliteDish className="text-emerald-400 text-xs" />
            <span className="text-xs font-medium text-emerald-400">Viaje detectado automáticamente</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <p className="text-gray-400">
              <span className="text-gray-600">Movimiento:</span>{' '}
              <span className={viajeActivo.tipoMovimiento === 'SALE' ? 'text-blue-400' : 'text-amber-400'}>
                {viajeActivo.tipoMovimiento === 'SALE' ? '🚀 SALIDA' : '🏁 ENTRADA'}
              </span>
            </p>
            <p className="text-gray-400">
              <span className="text-gray-600">Fecha:</span> {viajeActivo.fechaMovimiento} {viajeActivo.horaMovimiento}
            </p>
            {viajeActivo.origenMovimiento && (
              <p className="text-gray-400">
                <span className="text-gray-600">Origen:</span> {viajeActivo.origenMovimiento}
              </p>
            )}
            {viajeActivo.destinoMovimiento && (
              <p className="text-gray-400">
                <span className="text-gray-600">Destino:</span> {viajeActivo.destinoMovimiento}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Buscador */}
      {hojasDeRuta.length > 0 && (
        <div className="mb-5">
          <input
            type="text"
            className="input-field text-sm"
            placeholder="Buscar por N° de viaje..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {/* Lista de hojas de ruta */}
      {filteredHojas.length === 0 ? (
        <div className="text-center py-16 glass-card p-8">
          <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
            <FaMapMarkedAlt className="text-xl text-gray-600" />
          </div>
          {searchQuery ? (
            <>
              <p className="text-base font-medium text-white mb-1">
                Sin resultados
              </p>
              <p className="text-gray-500 text-sm">
                No se encontraron viajes con ese criterio
              </p>
            </>
          ) : hojasDeRuta.length === 0 ? (
            <>
              <p className="text-base font-medium text-white mb-1">
                Sin hojas de ruta asignadas
              </p>
              <p className="text-gray-500 text-sm mb-5">
                Contactá con tu supervisor para que te asigne un viaje.
              </p>
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHojas.map((hoja) => (
            <div
              key={`${hoja.Cod_Empresa}-${hoja.Nro_Viaje}`}
              className="glass-card p-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-base font-semibold text-white">
                      Viaje {hoja.Nro_Viaje}
                    </h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                      hoja.Estado_Viaje === 'Abierto'
                        ? 'status-open'
                        : 'status-closed'
                    }`}>
                      {hoja.Estado_Viaje === 'Abierto' ? 'Abierto' : 'Cerrado'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{hoja.Cod_Empresa}</p>
                </div>
                
                {/* Contador de gastos */}
                {gastosCount[hoja.Nro_Viaje] && gastosCount[hoja.Nro_Viaje] > 0 && (
                  <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md">
                    {gastosCount[hoja.Nro_Viaje]} gasto{gastosCount[hoja.Nro_Viaje] !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Detalles */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <FaUser className="text-gray-600 text-[10px]" />
                  <span className="truncate">{hoja.Nombre_Chofer}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <FaTruck className="text-gray-600 text-[10px]" />
                  <span>{hoja.Patente_Tractor}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <FaTrailer className="text-gray-600 text-[10px]" />
                  <span>{hoja.Patente_Semirremolque}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <FaCalendarAlt className="text-gray-600 text-[10px]" />
                  <span>
                    {formatFecha(hoja.Fecha_Salida)} — {formatFecha(hoja.Fecha_Llegada)}
                  </span>
                </div>
              </div>

              {/* Observaciones */}
              {hoja.Observaciones && (
                <div className="mb-3 pt-3 border-t border-white/[0.04]">
                  <p className="text-xs text-gray-500">
                    {hoja.Observaciones}
                  </p>
                </div>
              )}

              {/* Botón para agregar gastos */}
              <div className="pt-3 border-t border-white/[0.04]">
                <button
                  className="btn-primary w-full text-sm"
                  onClick={() => {
                    navigate(`/dashboard/nuevo-gasto?viaje=${hoja.Nro_Viaje}`)
                  }}
                >
                  <FaPlus className="mr-2 text-xs" />
                  Agregar Gasto
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
