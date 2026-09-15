import { useState, useRef, useEffect, ReactNode } from 'react'
import { FaMicrophone, FaStop, FaSpinner } from 'react-icons/fa'

const API_URL = import.meta.env.VITE_API_URL || '/api'

/**
 * Formatos que puede grabar un navegador y que además entiende Google
 * Speech-to-Text. Se prueba en orden: Opus es el que sale de Chrome en Android,
 * que es lo que usan los choferes.
 *
 * Safari en iPhone graba en MP4/AAC, que Google no soporta. En ese caso el
 * botón no aparece y queda el textarea, en vez de fallar recién al transcribir.
 */
const FORMATOS = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
]

/** Sync recognize de Google corta a los 60s; se frena antes para no perder la toma. */
const MAX_SEGUNDOS = 55

/** Silencio que hace falta para dar por terminado el dictado. */
const SILENCIO_MS = 2000

/**
 * Volumen mínimo para considerar que hay voz, en RMS normalizado (0 a 1).
 * Es el piso absoluto: por encima de esto se aplica además el umbral adaptativo,
 * que es el que realmente maneja el ruido de cabina.
 */
const UMBRAL_BASE = 0.02

function formatoSoportado(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return FORMATOS.find(f => MediaRecorder.isTypeSupported(f)) || null
}

interface Props {
  /** Recibe el texto transcripto para que lo use la pantalla */
  onTexto: (texto: string) => void
  disabled?: boolean
  /** El campo que se envuelve. El micrófono se monta arriba a la derecha. */
  children: ReactNode
}

export default function GrabadorVoz({ onTexto, disabled, children }: Props) {
  const [grabando, setGrabando] = useState(false)
  const [transcribiendo, setTranscribiendo] = useState(false)
  const [hablando, setHablando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [error, setError] = useState('')

  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const vigilante = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)

  const soportado = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && !!formatoSoportado()

  const limpiarMedicion = () => {
    if (vigilante.current) { clearInterval(vigilante.current); vigilante.current = null }
    if (audioCtx.current) { audioCtx.current.close().catch(() => {}); audioCtx.current = null }
  }

  // Si el chofer sale de la pantalla en plena grabación hay que soltar el micrófono
  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current)
      limpiarMedicion()
      recorder.current?.stream.getTracks().forEach(t => t.stop())
    }
  }, [])

  const detener = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  /**
   * Corta solo cuando el chofer deja de hablar.
   *
   * El umbral es ADAPTATIVO porque el dictado pasa en una cabina con el motor en
   * marcha: un valor fijo tomaría ese ruido constante como si fuera voz y la
   * grabación no se cortaría nunca. El piso de ruido baja rápido y sube lento,
   * así se acomoda al ambiente en un par de segundos.
   *
   * El conteo de silencio recién arranca DESPUÉS de haber detectado voz al menos
   * una vez: si no, cortaría mientras el chofer todavía está acomodándose para
   * hablar.
   */
  const vigilarSilencio = (stream: MediaStream) => {
    const Ctx: typeof AudioContext =
      window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return

    const ctx = new Ctx()
    audioCtx.current = ctx

    const analizador = ctx.createAnalyser()
    analizador.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analizador)

    const datos = new Uint8Array(analizador.fftSize)
    let piso = UMBRAL_BASE
    let huboVoz = false
    let calladoDesde: number | null = null

    vigilante.current = setInterval(() => {
      analizador.getByteTimeDomainData(datos)

      let suma = 0
      for (let i = 0; i < datos.length; i++) {
        const v = (datos[i] - 128) / 128
        suma += v * v
      }
      const rms = Math.sqrt(suma / datos.length)

      piso += (rms - piso) * (rms < piso ? 0.3 : 0.005)
      const umbral = Math.max(UMBRAL_BASE, piso * 2.5)

      if (rms > umbral) {
        huboVoz = true
        calladoDesde = null
        setHablando(true)
        return
      }

      setHablando(false)
      if (!huboVoz) return

      if (calladoDesde === null) {
        calladoDesde = Date.now()
      } else if (Date.now() - calladoDesde >= SILENCIO_MS) {
        detener()
      }
    }, 100)
  }

  const arrancar = async () => {
    setError('')
    const mimeType = formatoSoportado()
    if (!mimeType) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType })

      chunks.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }

      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (timer.current) clearInterval(timer.current)
        limpiarMedicion()
        setGrabando(false)
        setHablando(false)
        setSegundos(0)

        const blob = new Blob(chunks.current, { type: mimeType })
        if (blob.size === 0) {
          setError('No se grabó nada. Intentá de nuevo.')
          return
        }

        await transcribir(blob)
      }

      recorder.current = mr
      mr.start()
      setGrabando(true)
      setSegundos(0)
      vigilarSilencio(stream)

      timer.current = setInterval(() => {
        setSegundos(s => {
          if (s + 1 >= MAX_SEGUNDOS) detener()
          return s + 1
        })
      }, 1000)

    } catch (err: any) {
      // El navegador rechaza el micrófono si el usuario lo deniega o si la
      // página no está en HTTPS
      if (err?.name === 'NotAllowedError') {
        setError('Diste permiso al micrófono? Habilitalo en el navegador para dictar.')
      } else {
        setError('No se pudo acceder al micrófono.')
      }
    }
  }

  const transcribir = async (blob: Blob) => {
    setTranscribiendo(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      const res = await fetch(`${API_URL}/voz/transcribir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: dataUrl }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error || 'No se pudo transcribir el audio.')
        return
      }
      if (!data.texto) {
        setError(data.mensaje || 'No se entendió el audio.')
        return
      }

      onTexto(data.texto)
    } catch {
      setError('Error de conexión al transcribir. Revisá la señal.')
    } finally {
      setTranscribiendo(false)
    }
  }

  // Sin soporte de micrófono el campo va solo, sin botón
  if (!soportado) return <>{children}</>

  return (
    <div>
      <div className="relative">
        {children}

        <button
          type="button"
          onClick={grabando ? detener : arrancar}
          disabled={disabled || transcribiendo}
          title={grabando ? 'Detener y transcribir' : 'Dictar en vez de escribir'}
          className={`absolute right-2.5 top-2.5 w-10 h-10 rounded-lg border flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
            grabando
              ? 'bg-red-500/15 border-red-500/40 text-red-400'
              : 'bg-white/[0.06] border-white/[0.1] text-gray-400 hover:text-emerald-400 hover:border-emerald-500/30'
          }`}
        >
          {transcribiendo
            ? <FaSpinner className="animate-spin text-sm" />
            : grabando
              ? <FaStop className="text-sm" />
              : <FaMicrophone className="text-sm" />}
        </button>

        {/* Verde mientras entra voz, gris cuando hay silencio: el chofer ve si
            el teléfono lo está escuchando sin tener que mirar la pantalla fijo */}
        {grabando && (
          <span
            className={`absolute right-1.5 top-1.5 w-2.5 h-2.5 rounded-full pointer-events-none transition-colors ${
              hablando ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
            }`}
          />
        )}
      </div>

      {(grabando || transcribiendo || error) && (
        <p className={`text-[11px] mt-1.5 ${error ? 'text-amber-400' : 'text-gray-500'}`}>
          {error
            ? error
            : transcribiendo
              ? 'Transcribiendo…'
              : hablando
                ? `Te escucho — solté el botón, corta solo (${MAX_SEGUNDOS - segundos}s)`
                : 'Hablá cuando quieras. Corta solo a los 2 segundos de silencio.'}
        </p>
      )}
    </div>
  )
}
