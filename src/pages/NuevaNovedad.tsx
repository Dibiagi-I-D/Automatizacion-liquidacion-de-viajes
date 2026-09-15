import { useState, useEffect, useRef, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import GrabadorVoz from '../components/GrabadorVoz'
import {
  FaArrowLeft, FaClipboardList, FaTruck, FaStethoscope,
  FaHashtag, FaSpinner, FaSearch, FaTimes, FaCheck, FaMagic
} from 'react-icons/fa'

const API_URL = import.meta.env.VITE_API_URL || '/api'

interface SectorInvolucrado {
  sector: string
  responsable: string
}

interface TipoUnidad {
  codigo: string
  descripcion: string
}

interface Unidad {
  nroInterno: string
  patente: string
  marca: string
  tipoUnidadCodigo: string
  tipoUnidad: string
}

/** El kilometraje solo aplica a tractores; un semi no lleva cuentakilómetros. */
const TIPO_TRACTOR = 'T'

/**
 * Carga de una NOVEDAD (Orden de Trabajo) por parte del chofer.
 *
 * Los campos replican la pantalla de OT del ERP, agrupados en bloques verticales
 * porque acá la pantalla es un celular.
 *
 * El chofer decide tres cosas: la UNIDAD, el SECTOR INVOLUCRADO y el
 * PREDIAGNÓSTICO. El resto se deriva — el responsable sale del sector, y la
 * marca y el kilometraje salen de la unidad elegida.
 *
 * Arranca con el tractor del login, que es el caso normal, pero el chofer puede
 * cambiar de tipo para reportar sobre el semi que está llevando.
 */
export default function NuevaNovedad() {
  const navigate = useNavigate()
  const { chofer } = useAuth()

  const patenteLogin = String(chofer?.interno || '').trim().toUpperCase()
  const nombreChofer = String((chofer as any)?.nombreCompleto || '').trim()
  const legajoChofer = String(chofer?.legajo || '').trim()
  const empresaChofer = String((chofer as any)?.empresaChofer || '').trim()

  const ahora = new Date()
  const fecha = ahora.toLocaleDateString('es-AR')
  const hora = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const [proximoNumero, setProximoNumero] = useState<number | null>(null)

  const [sectores, setSectores] = useState<SectorInvolucrado[]>([])
  const [sectorInvolucrado, setSectorInvolucrado] = useState('')
  const [cargandoSectores, setCargandoSectores] = useState(true)

  const [tipos, setTipos] = useState<TipoUnidad[]>([])
  const [tipoSel, setTipoSel] = useState(TIPO_TRACTOR)
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [cargandoUnidades, setCargandoUnidades] = useState(true)
  const [unidadSel, setUnidadSel] = useState<Unidad | null>(null)
  const [ultimoKm, setUltimoKm] = useState<number | null>(null)

  const [prediagnostico, setPrediagnostico] = useState('')

  // ── Sugerencia automática del sector a partir del prediagnóstico ──
  const [sugiriendo, setSugiriendo] = useState(false)
  const [sectorSugerido, setSectorSugerido] = useState('')
  /** Una vez que el chofer toca el desplegable, su elección no se pisa más. */
  const elegidoAMano = useRef(false)
  const ultimoConsultado = useRef('')

  const esSugerido = !!sectorSugerido
    && sectorInvolucrado === sectorSugerido
    && !elegidoAMano.current

  // Mientras se graba, un cartel tapa la pantalla: la OT va a Softland y un
  // doble toque generaría dos órdenes de trabajo reales.
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string; nroOrden?: number } | null>(null)
  const enviando = useRef(false)

  // Solo se autoselecciona el tractor del login la primera vez: si después el
  // chofer cambia de tipo y vuelve a Tractor, no le pisamos lo que eligió.
  const yaAutoselecciono = useRef(false)

  const responsable = sectores.find(s => s.sector === sectorInvolucrado)?.responsable || ''

  useEffect(() => {
    fetch(`${API_URL}/novedades/sectores`)
      .then(r => r.json())
      .then(d => { if (d.success) setSectores(d.data || []) })
      .catch(() => {})
      .finally(() => setCargandoSectores(false))

    fetch(`${API_URL}/novedades/tipos-unidad`)
      .then(r => r.json())
      .then(d => { if (d.success) setTipos(d.data || []) })
      .catch(() => {})

    fetch(`${API_URL}/novedades/proximo-numero`)
      .then(r => r.json())
      .then(d => { if (d.success) setProximoNumero(d.data.proximoNumero) })
      .catch(() => {})
  }, [])

  // Padrón de unidades del tipo elegido
  useEffect(() => {
    let cancelado = false
    setCargandoUnidades(true)

    fetch(`${API_URL}/novedades/unidades?tipo=${encodeURIComponent(tipoSel)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelado || !d.success) return
        const lista: Unidad[] = d.data || []
        setUnidades(lista)

        if (!yaAutoselecciono.current && tipoSel === TIPO_TRACTOR && patenteLogin) {
          const propia = lista.find(u => u.patente.toUpperCase() === patenteLogin)
          if (propia) elegirUnidad(propia)
          yaAutoselecciono.current = true
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelado) setCargandoUnidades(false) })

    return () => { cancelado = true }
  }, [tipoSel, patenteLogin])

  /**
   * Deduce el sector a partir del texto del prediagnóstico.
   *
   * `ultimoConsultado` evita repetir la consulta por el mismo texto, que es lo
   * que permite dispararla desde dos lados —el dictado y el tipeo— sin que se
   * pisen entre sí.
   */
  const clasificarSector = async (texto: string) => {
    const limpio = texto.trim()
    if (limpio.length < 12 || limpio === ultimoConsultado.current) return

    ultimoConsultado.current = limpio
    setSugiriendo(true)
    try {
      const res = await fetch(`${API_URL}/novedades/sugerir-sector`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prediagnostico: limpio }),
      })
      const data = await res.json()
      if (data.success && data.sector) {
        setSectorSugerido(data.sector)
        if (!elegidoAMano.current) setSectorInvolucrado(data.sector)
      }
    } catch {
      // La sugerencia es una comodidad, no un requisito
    } finally {
      setSugiriendo(false)
    }
  }

  /**
   * Cuando el chofer ESCRIBE, se espera a que pare de tipear. Cuando DICTA no
   * se espera nada — eso lo dispara `onTexto` apenas vuelve la transcripción.
   */
  useEffect(() => {
    const id = setTimeout(() => clasificarSector(prediagnostico), 600)
    return () => clearTimeout(id)
  }, [prediagnostico])

  const elegirUnidad = (u: Unidad) => {
    setUnidadSel(u)
    setUltimoKm(null)

    if (u.tipoUnidadCodigo !== TIPO_TRACTOR || !u.nroInterno) return

    fetch(`${API_URL}/novedades/unidad?nroInterno=${encodeURIComponent(u.nroInterno)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setUltimoKm(d.data.ultimoKm) })
      .catch(() => {})
  }

  const cambiarTipo = (codigo: string) => {
    setTipoSel(codigo)
    setUnidadSel(null)
    setUltimoKm(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    // El ref se lee y escribe en el acto: en un celular los dos toques pueden
    // llegar antes de que React redibuje el botón deshabilitado.
    if (enviando.current) return
    if (!unidadSel) return

    enviando.current = true
    setGuardando(true)

    try {
      const res = await fetch(`${API_URL}/novedades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patente: unidadSel.patente,
          sectorInvolucrado,
          prediagnostico: prediagnostico.trim(),
          legajoChofer,
          chofer: nombreChofer,
          empresaChofer,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || `Error ${res.status}`)

      setSectorInvolucrado('')
      setPrediagnostico('')
      setResultado({ ok: true, mensaje: 'Orden generada', nroOrden: data.data.nroOrden })
    } catch (err) {
      setResultado({
        ok: false,
        mensaje: err instanceof Error && err.message
          ? err.message
          : 'No se pudo generar la orden. Revisá la señal e intentá de nuevo.',
      })
    } finally {
      setGuardando(false)
      enviando.current = false
    }
  }

  return (
    <div className="section-container">
      <button
        onClick={() => navigate('/dashboard/novedades')}
        className="mb-4 text-gray-500 hover:text-white transition-colors flex items-center gap-2 text-sm"
      >
        <FaArrowLeft className="text-xs" />
        Volver
      </button>

      <h1 className="text-lg font-semibold text-white mb-1">Nueva Novedad</h1>
      <p className="text-xs text-gray-500 mb-5">Orden de trabajo sobre la unidad</p>

      {/*
        Cartel de guardado. Tapa toda la pantalla a propósito: la orden se graba
        en Softland y mientras viaja no tiene que haber forma de volver a tocar
        el botón.
      */}
      {(guardando || resultado) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl bg-[#161a22] border border-white/[0.08] p-6 text-center shadow-2xl">
            {guardando && (
              <>
                <FaSpinner className="animate-spin text-3xl text-emerald-400 mx-auto mb-4" />
                <p className="text-white font-semibold">Generando orden…</p>
                <p className="text-gray-500 text-xs mt-1.5">
                  No cierres la pantalla. Puede demorar unos segundos.
                </p>
              </>
            )}

            {!guardando && resultado && (
              <>
                <div className={`w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center ${
                  resultado.ok ? 'bg-emerald-500/15' : 'bg-red-500/15'
                }`}>
                  {resultado.ok
                    ? <FaCheck className="text-xl text-emerald-400" />
                    : <FaTimes className="text-xl text-red-400" />}
                </div>
                <p className={`font-semibold ${resultado.ok ? 'text-white' : 'text-red-300'}`}>
                  {resultado.ok ? `Orden ${resultado.nroOrden} generada` : 'No se pudo generar'}
                </p>
                <p className="text-gray-500 text-xs mt-1.5 break-words">
                  {resultado.ok
                    ? 'Ya quedó cargada en el sistema.'
                    : resultado.mensaje}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const fueOk = resultado.ok
                    setResultado(null)
                    if (fueOk) navigate('/dashboard/novedades')
                  }}
                  autoFocus
                  className={`w-full mt-5 min-h-[48px] rounded-xl font-semibold transition-all active:scale-95 ${
                    resultado.ok
                      ? 'bg-emerald-600/15 border border-emerald-500/30 text-emerald-400'
                      : 'bg-white/[0.05] border border-white/[0.1] text-gray-300'
                  }`}
                >
                  {resultado.ok ? 'OK' : 'Entendido'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ══ Cabecera — la completa el sistema ══ */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3.5">
            <FaClipboardList className="text-emerald-400 text-xs" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
              Orden de Trabajo
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Etiqueta>N° de orden</Etiqueta>
              <div className="min-h-[48px] w-full px-4 py-3 bg-white/[0.02] border border-dashed border-white/[0.08] rounded-xl flex items-center gap-2">
                <FaHashtag className="text-gray-700 text-[10px]" />
                {proximoNumero ? (
                  <span className="text-sm text-gray-300 font-mono">
                    {proximoNumero}
                    <span className="text-gray-600 font-sans ml-2">(provisorio)</span>
                  </span>
                ) : (
                  <span className="text-gray-600 text-sm">Lo asigna el sistema</span>
                )}
              </div>
            </div>

            <div>
              <Etiqueta>Fecha</Etiqueta>
              <input className="input-field text-sm" value={fecha} readOnly tabIndex={-1} />
            </div>
            <div>
              <Etiqueta>Hora</Etiqueta>
              <input className="input-field text-sm" value={hora} readOnly tabIndex={-1} />
            </div>

            <div className="col-span-2">
              <Etiqueta>Chofer</Etiqueta>
              <input className="input-field text-sm" value={nombreChofer} readOnly tabIndex={-1} />
            </div>
          </div>
        </div>

        {/*
          ══ Prediagnóstico ══
          Va ANTES del sector a propósito: de lo que escribe acá el chofer se
          deduce solo a qué sector corresponde, así que primero cuenta el
          problema y recién después ve la derivación ya resuelta.
        */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3.5">
            <FaStethoscope className="text-purple-400 text-xs" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
              Prediagnóstico
            </h2>
          </div>
          {/*
            El micrófono va dentro del campo, arriba a la derecha; por eso el
            pr-14, para que el texto no pase por abajo del botón.

            Cada dictado REEMPLAZA lo que había. Volver a grabar es la forma
            natural de corregirse cuando algo salió mal transcripto; si se
            fuera acumulando, el chofer terminaría con la versión equivocada
            pegada adelante de la buena. El corte en 255 es el largo de
            USR_ORTRAH_NOVEDA.
          */}
          <GrabadorVoz
            disabled={guardando}
            onTexto={(texto) => {
              const nuevo = texto.slice(0, 255)
              setPrediagnostico(nuevo)
              // Sin esperar el debounce: el chofer ya terminó de hablar
              clasificarSector(nuevo)
            }}
          >
            <textarea
              className="input-field resize-none text-sm pr-14"
              rows={4}
              maxLength={255}
              placeholder="Contá qué le pasa a la unidad..."
              value={prediagnostico}
              onChange={(e) => setPrediagnostico(e.target.value)}
              required
            />
          </GrabadorVoz>

          <p className="text-[10px] text-gray-600 mt-1.5 text-right">
            {prediagnostico.length} / 255
          </p>
        </div>

        {/* ══ Sector y responsable ══ */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3.5">
            <FaClipboardList className="text-blue-400 text-xs" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
              Sector y responsable
            </h2>
            {sugiriendo && (
              <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
                <FaSpinner className="animate-spin text-[9px]" />
                Analizando
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Etiqueta>Sector involucrado</Etiqueta>
                {esSugerido && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-purple-400 mb-1.5">
                    <FaMagic className="text-[9px]" />
                    Sugerido
                  </span>
                )}
              </div>
              <select
                className={`input-field text-sm ${esSugerido ? 'border-purple-500/30' : ''}`}
                value={sectorInvolucrado}
                onChange={(e) => {
                  // A partir de acá manda el chofer: la IA deja de pisarlo
                  elegidoAMano.current = true
                  setSectorInvolucrado(e.target.value)
                }}
                disabled={cargandoSectores}
                required
              >
                <option value="">
                  {cargandoSectores ? 'Cargando sectores...' : 'Elegí un sector'}
                </option>
                {sectores.map(s => (
                  <option key={s.sector} value={s.sector}>{s.sector}</option>
                ))}
              </select>
              {esSugerido && (
                <p className="text-[10px] text-gray-600 mt-1.5">
                  Salió del prediagnóstico. Cambialo si no corresponde.
                </p>
              )}
            </div>

            <div>
              <Etiqueta>Responsable</Etiqueta>
              <input
                className="input-field text-sm"
                value={responsable}
                placeholder={sectorInvolucrado ? 'Sin responsable asignado' : 'Se completa con el sector'}
                readOnly
                tabIndex={-1}
              />
            </div>
          </div>
        </div>

        {/* ══ Unidad ══ */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3.5">
            <FaTruck className="text-emerald-400 text-xs" />
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
              Unidad
            </h2>
            {cargandoUnidades && <FaSpinner className="animate-spin text-gray-600 text-[10px]" />}
          </div>

          <div className="space-y-3">
            <div>
              <Etiqueta>Tipo de unidad</Etiqueta>
              <select
                className="input-field text-sm"
                value={tipoSel}
                onChange={(e) => cambiarTipo(e.target.value)}
              >
                {tipos.map(t => (
                  <option key={t.codigo} value={t.codigo}>{t.descripcion}</option>
                ))}
              </select>
            </div>

            {/* Los dos buscadores recorren la misma lista: se complete el que se
                complete, al elegir queda resuelta también la otra columna. */}
            <BuscadorUnidad
              label="Interno"
              placeholder="Buscar por N° interno..."
              campo="nroInterno"
              unidades={unidades}
              seleccionada={unidadSel}
              onElegir={elegirUnidad}
            />

            <BuscadorUnidad
              label="Patente"
              placeholder="Buscar por patente..."
              campo="patente"
              unidades={unidades}
              seleccionada={unidadSel}
              onElegir={elegirUnidad}
            />

            <div className={tipoSel === TIPO_TRACTOR ? 'grid grid-cols-2 gap-3' : ''}>
              <div>
                <Etiqueta>Marca</Etiqueta>
                <input
                  className="input-field text-sm"
                  value={unidadSel?.marca || ''}
                  placeholder="Se completa con la unidad"
                  readOnly
                  tabIndex={-1}
                />
              </div>

              {/* Un semi no tiene cuentakilómetros: el campo solo aplica a tractores */}
              {tipoSel === TIPO_TRACTOR && (
                <div>
                  <Etiqueta>Último km cargado</Etiqueta>
                  <input
                    className="input-field text-sm"
                    value={ultimoKm !== null ? ultimoKm.toLocaleString('es-AR') : ''}
                    placeholder={unidadSel ? 'Cargando...' : 'Se completa con la unidad'}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!unidadSel || guardando}
        >
          {guardando ? (
            <>
              <FaSpinner className="animate-spin mr-2" />
              Generando…
            </>
          ) : (
            'Generar OT por tarea y sector'
          )}
        </button>

        {!unidadSel && !cargandoUnidades && (
          <p className="text-[11px] text-gray-600 text-center">
            Elegí una unidad para continuar
          </p>
        )}
      </form>
    </div>
  )
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
      {children}
    </label>
  )
}

/**
 * Buscador de unidad por una columna (interno o patente).
 *
 * Mientras no se escribe muestra lo que ya está elegido; al escribir abre la
 * lista filtrada por ESA columna, pero cada opción muestra patente, interno y
 * marca para que el chofer confirme que es la unidad correcta antes de tocar.
 */
function BuscadorUnidad({
  label, placeholder, campo, unidades, seleccionada, onElegir,
}: {
  label: string
  placeholder: string
  campo: 'nroInterno' | 'patente'
  unidades: Unidad[]
  seleccionada: Unidad | null
  onElegir: (u: Unidad) => void
}) {
  const [texto, setTexto] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fueraDelCampo = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) {
        setAbierto(false)
        setTexto(null)
      }
    }
    document.addEventListener('mousedown', fueraDelCampo)
    return () => document.removeEventListener('mousedown', fueraDelCampo)
  }, [])

  // texto === null significa "no está escribiendo": se muestra lo elegido
  const valor = texto !== null ? texto : (seleccionada?.[campo] || '')

  const coincidencias = texto && texto.trim()
    ? unidades.filter(u => u[campo].toUpperCase().includes(texto.trim().toUpperCase()))
    : []

  return (
    <div className="relative" ref={contenedor}>
      <Etiqueta>{label}</Etiqueta>
      <div className="relative">
        <input
          className="input-field text-sm pr-10"
          value={valor}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
        />
        {texto !== null ? (
          <button
            type="button"
            onClick={() => { setTexto(null); setAbierto(false) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
          >
            <FaTimes className="text-xs" />
          </button>
        ) : (
          <FaSearch className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 text-xs pointer-events-none" />
        )}
      </div>

      {abierto && coincidencias.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-[#1a1d27] border border-white/[0.08] rounded-xl shadow-2xl max-h-56 overflow-y-auto">
          {coincidencias.slice(0, 10).map(u => (
            <button
              key={u.patente}
              type="button"
              onClick={() => { onElegir(u); setTexto(null); setAbierto(false) }}
              className="w-full px-4 py-3 text-left hover:bg-white/[0.04] transition border-b border-white/[0.04] last:border-b-0"
            >
              <p className="text-white text-sm font-medium">{u.patente}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Interno {u.nroInterno || '—'}
                {u.marca ? ` · ${u.marca}` : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      {abierto && texto !== null && texto.trim() !== '' && coincidencias.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-[#1a1d27] border border-white/[0.08] rounded-xl shadow-2xl p-4 text-center text-gray-500 text-sm">
          Sin resultados para "{texto}"
        </div>
      )}
    </div>
  )
}
