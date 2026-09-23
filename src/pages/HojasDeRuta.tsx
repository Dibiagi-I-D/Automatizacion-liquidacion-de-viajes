import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaTruck, FaSpinner, FaMapMarkedAlt, FaCalendarAlt, FaCheckCircle, FaClock, FaPlus, FaUser, FaTrailer, FaSatelliteDish } from 'react-icons/fa'
import { useAuth } from '../context/AuthContext'
// Fuente única compartida con la pantalla de Rendición: las dos tienen que
// mostrar el mismo conjunto de hojas o los gastos de una quedan invisibles en la otra.
import { buscarHojasChofer, HojaChofer } from '../api/viajeActivo'

const API_URL = import.meta.env.VITE_API_URL || '/api'

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
  const [hojasDeRuta, setHojasDeRuta] = useState<HojaChofer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [gastosCount, setGastosCount] = useState<Record<number, number>>({})
  const [viajeActivo, setViajeActivo] = useState<ViajeActivo | null>(null)
  const [modoDeteccion, setModoDeteccion] = useState<'tiempo-real' | 'historial'>('historial')
  const [finalizando, setFinalizando] = useState<number | null>(null)
  // Hoja que el chofer está por cerrar: abre el paso donde declara qué día llegó
  const [cerrando, setCerrando] = useState<HojaChofer | null>(null)

  /**
   * El chofer da por cerrada una hoja: ya cargó todo lo que tenía.
   * Solo afecta a SU pantalla — no cierra nada en Softland ni toca el panel
   * de administración, donde los gastos siguen visibles y exportables.
   *
   * Además declara QUÉ DÍA LLEGÓ. Ese dato antes se reconstruía después, con
   * la entrada del tractor por portería o con el cierre de la hoja de ruta.
   * El chofer es el único que lo sabe de primera mano y en el momento, así
   * que la rendición ya no tiene que esperar a que el camión aparezca acá.
   */
  const finalizarHoja = async (hoja: HojaChofer, fechaLlegada: string) => {
    try {
      setFinalizando(hoja.Nro_Viaje)
      const resp = await fetch(`${API_URL}/gastos-viaje/finalizar/${hoja.Nro_Viaje}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legajoChofer: (chofer?.legajo || '').trim(),
          chofer: (chofer as any)?.nombreCompleto || '',
          patenteTractor: chofer?.interno || '',
          fechaLlegada,
        }),
      })
      const data = await resp.json()

      if (!resp.ok || !data.success) {
        alert(data.error || 'No se pudo finalizar la hoja de ruta. Intentá de nuevo.')
        return
      }

      // Sale de la lista sin recargar toda la pantalla
      setHojasDeRuta(prev => prev.filter(h => h.Nro_Viaje !== hoja.Nro_Viaje))
      setCerrando(null)
    } catch (err) {
      console.error('Error al finalizar hoja:', err)
      alert('No hay conexión. La hoja no se finalizó — intentá de nuevo.')
    } finally {
      setFinalizando(null)
    }
  }

  /**
   * Conteo de gastos por viaje, pidiendo SOLO los viajes que se muestran.
   * GET /api/gastos-viaje (sin filtro) trae los gastos de todos los choferes de
   * la empresa; al chofer no le corresponde recibir los de otro.
   */
  useEffect(() => {
    if (hojasDeRuta.length === 0) {
      setGastosCount({})
      return
    }

    let cancelado = false
    const legajo = (chofer?.legajo || '').trim()

    Promise.all(
      hojasDeRuta.map(h =>
        fetch(`${API_URL}/gastos-viaje/${h.Nro_Viaje}`)
          .then(r => r.json())
          .then(d => ({ nro: h.Nro_Viaje, gastos: d.success ? (d.data as any[]) : [] }))
          .catch(() => ({ nro: h.Nro_Viaje, gastos: [] as any[] }))
      )
    ).then(resultados => {
      if (cancelado) return
      const counts: Record<number, number> = {}
      resultados.forEach(({ nro, gastos }) => {
        counts[nro] = gastos.filter(g => {
          const suyo = String(g.legajoChofer || '').trim()
          return !legajo || !suyo || suyo === legajo
        }).length
      })
      setGastosCount(counts)
    })

    return () => { cancelado = true }
  }, [hojasDeRuta, chofer])

  useEffect(() => {
    cargarHojasDeRuta()
  }, [])

  const cargarHojasDeRuta = async () => {
    try {
      setLoading(true)
      setError('')

      const patenteTractor = chofer?.interno || ''
      const legajoChofer = (chofer?.legajo || '').trim()

      // Hojas del chofer + tractor del login.
      //
      // Se usa el MISMO helper que la pantalla de Rendición para que las dos
      // muestren siempre el mismo conjunto: las que venía usando (con gastos
      // sin finalizar) más la más reciente abierta. Cuando cada pantalla tenía
      // su propia carga, los gastos de una hoja a medio cargar quedaban
      // invisibles en Rendición.
      const resultado = await buscarHojasChofer(chofer as any)

      if (resultado.estado === 'encontrado') {
        setModoDeteccion(resultado.modo)
        console.log('✅ Hojas asignadas:', resultado.hojas.map(h => h.Nro_Viaje))
        setHojasDeRuta(resultado.hojas)
      } else {
        setHojasDeRuta([])
        setError(resultado.mensaje)
      }

      setLoading(false)
      return

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
          {filteredHojas.map((hoja) => {
            // Con más de una hoja en pantalla, la más reciente es la NUEVA
            // y las otras son las que el chofer venía usando.
            const hayVarias = filteredHojas.length > 1
            const esNueva = hayVarias && hoja.esActual === true
            const pendiente = hayVarias && hoja.esActual !== true
            const cantidad = hoja.gastosCount ?? gastosCount[hoja.Nro_Viaje] ?? 0

            return (
            <div
              key={`${hoja.Cod_Empresa}-${hoja.Nro_Viaje}`}
              className={`glass-card p-4 ${
                esNueva ? 'border border-blue-500/30 bg-blue-500/[0.03]' : ''
              }${pendiente ? 'border border-amber-500/25 bg-amber-500/[0.03]' : ''}`}
            >
              {/* Franja de contexto cuando hay más de una hoja */}
              {esNueva && (
                <div className="flex items-center gap-1.5 mb-2.5 -mt-0.5">
                  <FaSatelliteDish className="text-blue-400 text-[10px]" />
                  <span className="text-[10px] font-semibold text-blue-400 tracking-wide">
                    HOJA DE RUTA NUEVA
                  </span>
                </div>
              )}
              {pendiente && (
                <div className="flex items-center gap-1.5 mb-2.5 -mt-0.5">
                  <FaClock className="text-amber-400 text-[10px]" />
                  <span className="text-[10px] font-semibold text-amber-400 tracking-wide">
                    LA QUE VENÍAS USANDO — TERMINÁ DE CARGAR ACÁ
                  </span>
                </div>
              )}

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
                {cantidad > 0 && (
                  <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md">
                    {cantidad} gasto{cantidad !== 1 ? 's' : ''}
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

              {/* Acciones */}
              <div className="pt-3 border-t border-white/[0.04] space-y-2">
                <button
                  className="btn-primary w-full text-sm"
                  onClick={() => {
                    navigate(`/dashboard/nuevo-gasto?viaje=${hoja.Nro_Viaje}`)
                  }}
                >
                  <FaPlus className="mr-2 text-xs" />
                  Agregar gasto al viaje {hoja.Nro_Viaje}
                </button>

                {/*
                  Terminar el viaje: el chofer avisa que ya no le queda nada
                  por cargar y declara qué día llegó. Está SIEMPRE, tenga una
                  hoja o varias: antes aparecía solo con más de una, y el que
                  hace un viaje por vez nunca podía cerrar ninguno.
                */}
                <button
                  className="w-full text-xs py-2.5 rounded-lg border border-red-500/30 bg-red-500/[0.06] text-red-400 font-medium hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-300 active:bg-red-500/20 transition disabled:opacity-50 disabled:hover:bg-red-500/[0.06]"
                  onClick={() => setCerrando(hoja)}
                  disabled={finalizando === hoja.Nro_Viaje}
                >
                  {finalizando === hoja.Nro_Viaje ? (
                    <>
                      <FaSpinner className="inline animate-spin mr-2 text-[10px]" />
                      Finalizando...
                    </>
                  ) : (
                    <>
                      <FaCheckCircle className="inline mr-2 text-[10px]" />
                      Terminé el viaje {hoja.Nro_Viaje}
                    </>
                  )}
                </button>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {cerrando && (
        <CerrarViaje
          hoja={cerrando}
          gastos={cerrando.gastosCount ?? gastosCount[cerrando.Nro_Viaje] ?? 0}
          guardando={finalizando === cerrando.Nro_Viaje}
          onCancelar={() => setCerrando(null)}
          onConfirmar={(fecha) => finalizarHoja(cerrando, fecha)}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   TERMINAR EL VIAJE — el chofer declara qué día llegó

   Es el dato que arranca la rendición: de acá sale la fecha de llegada
   y, con ella, el período a liquidar. Por eso se pregunta en vez de
   suponer el día del click: el chofer puede volver el viernes y cerrar
   la hoja el lunes, y esos tres días moverían el período de liquidación.
   ══════════════════════════════════════════════════════════════════ */

function CerrarViaje({
  hoja, gastos, guardando, onCancelar, onConfirmar,
}: {
  hoja: HojaChofer
  gastos: number
  guardando: boolean
  onCancelar: () => void
  onConfirmar: (fecha: string) => void
}) {
  const hoy = new Date().toISOString().slice(0, 10)
  const salida = (hoja.Fecha_Salida || '').slice(0, 10)
  const [fecha, setFecha] = useState(hoy)

  // Las mismas dos reglas que aplicaría Softland, acá en el celular
  const error =
    fecha > hoy ? 'No podés poner una fecha futura.'
    : salida && fecha < salida ? `El viaje salió el ${salida.split('-').reverse().join('/')}.`
    : ''

  const dias = salida ? Math.round((Date.parse(fecha) - Date.parse(salida)) / 86400000) : null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
         onClick={onCancelar}>
      <div className="bg-[#161821] border border-white/[0.08] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5"
           onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-white mb-1">
          Terminé el viaje {hoja.Nro_Viaje}
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Tenés {gastos} gasto{gastos === 1 ? '' : 's'} cargado{gastos === 1 ? '' : 's'}.
          Después de confirmar deja de aparecerte en la lista.
        </p>

        <label className="block text-xs text-gray-400 mb-1.5">¿Qué día llegaste?</label>
        <input
          type="date"
          value={fecha}
          max={hoy}
          min={salida || undefined}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2.5 text-base text-white focus:outline-none focus:border-blue-500/60"
        />

        {error
          ? <p className="text-[11px] text-red-400 mt-2">{error}</p>
          : dias !== null && (
              <p className="text-[11px] text-gray-600 mt-2">
                {dias === 0 ? 'Mismo día de la salida.' : `${dias} día${dias === 1 ? '' : 's'} de viaje.`}
              </p>
            )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancelar}
            disabled={guardando}
            className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 bg-white/[0.04] border border-white/[0.08] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirmar(fecha)}
            disabled={guardando || !!error}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-emerald-600 text-white disabled:opacity-50"
          >
            {guardando
              ? <><FaSpinner className="inline animate-spin mr-2 text-[10px]" /> Cerrando…</>
              : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
