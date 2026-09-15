import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  FaPlus, FaSearch, FaClipboardList, FaTruck, FaCalendarAlt,
  FaWrench, FaExclamationTriangle, FaSpinner, FaStethoscope, FaUserCog
} from 'react-icons/fa'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export interface Novedad {
  nroOrden: number
  fecha: string
  hora: string
  sectorInvolucrado: string
  responsable: string
  chofer: string
  patente: string
  nroInterno: string
  tipoUnidad: string
  marca: string
  km: number
  novedad: string
  urgente: boolean
  esService: boolean
  tipoServicio: string
  kmProximoService: number
}

/**
 * Novedades PENDIENTES del chofer logueado.
 *
 * Salen de USR_ORTRAH filtrando por el sector solicitante 26 —el de la app—,
 * por el nombre del chofer y descartando las finalizadas. Por eso acá no hay
 * estado "finalizada": todo lo que se lista sigue abierto.
 */
export default function Novedades() {
  const navigate = useNavigate()
  const { chofer } = useAuth()
  const [novedades, setNovedades] = useState<Novedad[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const nombreChofer = String((chofer as any)?.nombreCompleto || '').trim()

  useEffect(() => { cargarNovedades() }, [nombreChofer])

  const cargarNovedades = async () => {
    if (!nombreChofer) {
      setError('No hay un chofer asociado a esta sesión. Volvé a ingresar.')
      setCargando(false)
      return
    }

    setCargando(true)
    setError('')

    try {
      const res = await fetch(`${API_URL}/novedades?chofer=${encodeURIComponent(nombreChofer)}`)
      const data = await res.json()

      if (data.success) {
        setNovedades(data.data || [])
      } else {
        setError(data.error || 'No se pudieron cargar las novedades')
      }
    } catch {
      setError('Error de conexión al cargar las novedades')
    } finally {
      setCargando(false)
    }
  }

  const filtradas = novedades.filter(n =>
    searchQuery === '' ||
    n.nroOrden.toString().includes(searchQuery) ||
    n.sectorInvolucrado.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.nroInterno.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.novedad.toLowerCase().includes(searchQuery.toLowerCase())
  )

  /** La fecha llega sin hora desde Softland; se arma en UTC para que no se corra un día. */
  const formatFecha = (fecha: string) => {
    if (!fecha) return ''
    const d = new Date(fecha)
    if (isNaN(d.getTime())) return ''
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}/${d.getUTCFullYear()}`
  }

  if (cargando) {
    return (
      <div className="section-container flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <FaSpinner className="animate-spin text-2xl text-emerald-400 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando novedades...</p>
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
          <button onClick={cargarNovedades} className="mt-3 btn-primary text-sm">Reintentar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="section-container">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-white">Novedades</h1>
        <span className="text-xs text-gray-500 font-medium">
          {filtradas.length} pendiente{filtradas.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="info-panel mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 mb-1">Sesión activa</p>
            <p className="text-sm text-white font-medium truncate">{nombreChofer || 'Chofer'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{chofer?.interno || 'Tractor'}</p>
          </div>
          <button
            onClick={() => navigate('/dashboard/nueva-novedad')}
            className="btn-primary text-sm px-4 flex-shrink-0"
          >
            <FaPlus className="mr-2 text-xs" />
            Nueva
          </button>
        </div>
      </div>

      {novedades.length > 0 && (
        <div className="mb-5">
          <div className="relative">
            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 text-xs" />
            <input
              type="text"
              className="input-field text-sm pl-10"
              placeholder="Buscar por N° de orden, sector o interno..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {filtradas.length === 0 ? (
        <div className="text-center py-16 glass-card p-8">
          <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
            <FaClipboardList className="text-xl text-gray-600" />
          </div>
          <p className="text-base font-medium text-white mb-1">
            {searchQuery ? 'Sin resultados' : 'Sin novedades pendientes'}
          </p>
          <p className="text-gray-500 text-sm mb-5">
            {searchQuery
              ? 'Probá con otro criterio de búsqueda'
              : 'Cargá una novedad si detectaste algo en la unidad'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => navigate('/dashboard/nueva-novedad')}
              className="btn-primary text-sm"
            >
              <FaPlus className="mr-2 text-xs" />
              Nueva novedad
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((n) => (
            <div
              key={n.nroOrden}
              className={`glass-card p-4 ${
                n.urgente ? 'border border-red-500/25 bg-red-500/[0.03]' : ''
              }`}
            >
              {n.urgente && (
                <div className="flex items-center gap-1.5 mb-2.5 -mt-0.5">
                  <FaExclamationTriangle className="text-red-400 text-[10px]" />
                  <span className="text-[10px] font-semibold text-red-400 tracking-wide">
                    URGENTE
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <h3 className="text-base font-semibold text-white">OT {n.nroOrden}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-medium status-open">
                      Pendiente
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{n.sectorInvolucrado}</p>
                </div>

                {n.esService && (
                  <span className="text-[10px] font-medium bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-md flex items-center gap-1 flex-shrink-0">
                    <FaWrench className="text-[9px]" />
                    Service
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <Dato
                  icono={<FaTruck />}
                  texto={`${n.nroInterno}${n.tipoUnidad ? ` · ${n.tipoUnidad}` : ''}`}
                />
                <Dato icono={<FaCalendarAlt />} texto={`${formatFecha(n.fecha)} ${n.hora}`.trim()} />
                {n.responsable && <Dato icono={<FaUserCog />} texto={n.responsable} />}
                {n.km > 0 && (
                  <Dato icono={<FaWrench />} texto={`${n.km.toLocaleString('es-AR')} km`} />
                )}
              </div>

              {n.novedad && (
                <div className="pt-3 border-t border-white/[0.04]">
                  <div className="flex items-start gap-2">
                    <FaStethoscope className="text-gray-600 text-[10px] mt-1 flex-shrink-0" />
                    <p className="text-xs text-gray-400 break-words leading-relaxed">
                      {n.novedad}
                    </p>
                  </div>
                </div>
              )}

              {n.esService && n.kmProximoService > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                    Próximo service
                  </span>
                  <span className="text-xs text-cyan-400 font-medium tabular-nums">
                    {n.kmProximoService.toLocaleString('es-AR')} km
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Dato({ icono, texto }: { icono: React.ReactNode; texto: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 min-w-0">
      <span className="text-gray-600 text-[10px] flex-shrink-0">{icono}</span>
      <span className="truncate">{texto}</span>
    </div>
  )
}
