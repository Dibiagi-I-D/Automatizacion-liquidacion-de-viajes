import { useState, useRef, useEffect, useCallback } from 'react'
import { FaTimes, FaCamera, FaBolt, FaRedo, FaCheck, FaSpinner, FaLightbulb, FaSun, FaRulerCombined, FaHandPaper } from 'react-icons/fa'

interface TicketScannerProps {
  open: boolean
  onClose: () => void
  onCapture: (blob: Blob, previewUrl: string) => void
}

type ScanPhase = 'idle' | 'scanning' | 'done'

// Consejos que se muestran ANTES de sacar la foto
const TIPS = [
  { icon: FaSun, text: 'Buena iluminación, sin sombras' },
  { icon: FaRulerCombined, text: 'Ticket recto, de frente a la cámara' },
  { icon: FaHandPaper, text: 'Sostené firme, sin mover' },
  { icon: FaLightbulb, text: 'Que se lean bien los números' },
]

// Mensajes durante el escaneo post-captura
const SCAN_MESSAGES = [
  'Analizando imagen...',
  'Detectando texto...',
  'Buscando importes...',
  'Identificando país...',
  'Extrayendo datos...',
  '¡Listo!',
]

export default function TicketScanner({ open, onClose, onCapture }: TicketScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [flashOn, setFlashOn] = useState(false)
  const [flashSupported, setFlashSupported] = useState(false)

  // Estado post-captura
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [scanPhase, setScanPhase] = useState<ScanPhase>('idle')
  const [scanMessageIndex, setScanMessageIndex] = useState(0)
  const [scanProgress, setScanProgress] = useState(0)

  // Iniciar/detener cámara
  useEffect(() => {
    if (open) {
      iniciarCamara()
    } else {
      resetAll()
    }
    return () => { detenerCamara() }
  }, [open])

  // Animación de escaneo post-captura
  useEffect(() => {
    if (scanPhase !== 'scanning') return

    // Progreso gradual
    const progressInterval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval)
          return 100
        }
        return prev + 2
      })
    }, 50)

    // Mensajes secuenciales
    const messageInterval = setInterval(() => {
      setScanMessageIndex(prev => {
        if (prev >= SCAN_MESSAGES.length - 1) {
          clearInterval(messageInterval)
          return prev
        }
        return prev + 1
      })
    }, 500)

    // Al terminar animación → done
    const doneTimer = setTimeout(() => {
      setScanPhase('done')
    }, 3000)

    return () => {
      clearInterval(progressInterval)
      clearInterval(messageInterval)
      clearTimeout(doneTimer)
    }
  }, [scanPhase])

  const resetAll = () => {
    detenerCamara()
    setCapturedImage(null)
    setCapturedBlob(null)
    setCameraReady(false)
    setCameraError('')
    setFlashOn(false)
    setScanPhase('idle')
    setScanMessageIndex(0)
    setScanProgress(0)
  }

  const iniciarCamara = async () => {
    try {
      setCameraError('')
      setCameraReady(false)

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)

        const track = stream.getVideoTracks()[0]
        const capabilities = track.getCapabilities?.() as any
        if (capabilities?.torch) setFlashSupported(true)
      }
    } catch (err: any) {
      console.error('Error al iniciar cámara:', err)
      if (err.name === 'NotAllowedError') {
        setCameraError('Permiso de cámara denegado. Habilitalo en la configuración del navegador.')
      } else if (err.name === 'NotFoundError') {
        setCameraError('No se encontró cámara en el dispositivo.')
      } else {
        setCameraError('Error al acceder a la cámara: ' + err.message)
      }
    }
  }

  const detenerCamara = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setFlashSupported(false)
    setFlashOn(false)
  }

  const toggleFlash = async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    try {
      await track.applyConstraints({ advanced: [{ torch: !flashOn } as any] })
      setFlashOn(!flashOn)
    } catch (err) { console.error('Flash error:', err) }
  }

  const capturarFoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const previewUrl = canvas.toDataURL('image/jpeg', 0.92)
    setCapturedImage(previewUrl)

    canvas.toBlob((blob) => {
      if (blob) setCapturedBlob(blob)
    }, 'image/jpeg', 0.95)

    // Detener cámara y arrancar animación de escaneo
    detenerCamara()
    setScanPhase('scanning')
    setScanMessageIndex(0)
    setScanProgress(0)
  }, [])

  const retomarFoto = () => {
    setCapturedImage(null)
    setCapturedBlob(null)
    setScanPhase('idle')
    setScanMessageIndex(0)
    setScanProgress(0)
    iniciarCamara()
  }

  const confirmarCaptura = () => {
    if (capturedBlob && capturedImage) {
      onCapture(capturedBlob, capturedImage)
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <canvas ref={canvasRef} className="hidden" />

      {/* ═══════════ VISTA DE CÁMARA (antes de capturar) ═══════════ */}
      {!capturedImage ? (
        <div className="flex-1 relative">
          {/* Video limpio, sin overlays */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
            >
              <FaTimes className="text-sm" />
            </button>
            <p className="text-white text-sm font-semibold tracking-wide">Foto del Ticket</p>
            {flashSupported ? (
              <button
                onClick={toggleFlash}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  flashOn ? 'bg-yellow-400 text-black' : 'bg-white/10 backdrop-blur-sm text-white'
                }`}
              >
                <FaBolt className="text-sm" />
              </button>
            ) : (
              <div className="w-10" />
            )}
          </div>

          {/* Tips de guía para captura perfecta */}
          {cameraReady && (
            <div className="absolute bottom-32 left-0 right-0 z-10 px-6">
              <div className="bg-black/60 backdrop-blur-md rounded-2xl p-4 space-y-2.5">
                <p className="text-emerald-400 text-[11px] font-semibold uppercase tracking-wider text-center mb-2">
                  Tips para mejor lectura
                </p>
                {TIPS.map((tip, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                      <tip.icon className="text-emerald-400 text-[10px]" />
                    </div>
                    <p className="text-white/80 text-xs">{tip.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Iniciando cámara */}
          {!cameraReady && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <FaSpinner className="animate-spin text-2xl text-emerald-400 mx-auto mb-3" />
                <p className="text-white/70 text-sm">Iniciando cámara...</p>
              </div>
            </div>
          )}

          {/* Error */}
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center z-10 p-8">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <FaCamera className="text-xl text-red-400" />
                </div>
                <p className="text-white text-sm mb-2">No se pudo acceder a la cámara</p>
                <p className="text-gray-400 text-xs mb-4">{cameraError}</p>
                <button onClick={iniciarCamara} className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-xl">
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {/* Botón de captura limpio */}
          {cameraReady && (
            <div className="absolute bottom-0 left-0 right-0 z-20 pb-8 pt-4 flex justify-center">
              <button
                onClick={capturarFoto}
                className="rounded-full border-[4px] border-white active:scale-90 transition-transform flex items-center justify-center"
                style={{ width: '72px', height: '72px' }}
              >
                <div className="rounded-full bg-white flex items-center justify-center" style={{ width: '60px', height: '60px' }}>
                  <FaCamera className="text-gray-700 text-lg" />
                </div>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ═══════════ POST-CAPTURA: ESCANEO ANIMADO ═══════════ */
        <div className="flex-1 flex flex-col">
          {/* Imagen capturada con efecto de escaneo */}
          <div className="flex-1 relative overflow-hidden">
            <img
              src={capturedImage}
              alt="Ticket capturado"
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />

            {/* Overlay de escaneo (solo mientras escanea) */}
            {scanPhase === 'scanning' && (
              <div className="absolute inset-0 z-10 pointer-events-none">
                {/* Tint verde sutil */}
                <div className="absolute inset-0 bg-emerald-500/[0.03]" />

                {/* Línea de escaneo barriendo la imagen */}
                <div
                  className="absolute left-0 right-0 h-1 bg-emerald-400 shadow-[0_0_15px_4px_rgba(16,185,129,0.5)]"
                  style={{
                    top: `${scanProgress}%`,
                    opacity: scanProgress >= 98 ? 0 : 1,
                    transition: 'opacity 0.3s ease',
                  }}
                />

                {/* Grilla sutil */}
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage: `
                      linear-gradient(rgba(16,185,129,0.3) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(16,185,129,0.3) 1px, transparent 1px)
                    `,
                    backgroundSize: '30px 30px',
                  }}
                />
              </div>
            )}

            {/* Check de completado */}
            {scanPhase === 'done' && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="w-20 h-20 rounded-full bg-emerald-500/90 flex items-center justify-center shadow-2xl shadow-emerald-500/40 animate-pulse">
                  <FaCheck className="text-white text-3xl" />
                </div>
              </div>
            )}
          </div>

          {/* Panel inferior: progreso y acciones */}
          <div className="bg-[#0f1117] border-t border-white/[0.06] px-5 pt-5 pb-8">
            {/* ── Estado: escaneando ── */}
            {scanPhase === 'scanning' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <FaSpinner className="animate-spin text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-white text-sm font-medium">
                      {SCAN_MESSAGES[scanMessageIndex]}
                    </p>
                    <p className="text-gray-500 text-[10px] mt-0.5">
                      Analizando ticket para extraer datos
                    </p>
                  </div>
                </div>

                {/* Barra de progreso */}
                <div className="w-full bg-white/[0.06] rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-100 ease-linear"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>

                {/* Pasos del análisis */}
                <div className="flex justify-between text-[9px] text-gray-600 uppercase tracking-wider px-1">
                  <span className={scanProgress > 10 ? 'text-emerald-400' : ''}>Imagen</span>
                  <span className={scanProgress > 35 ? 'text-emerald-400' : ''}>Texto</span>
                  <span className={scanProgress > 60 ? 'text-emerald-400' : ''}>Importe</span>
                  <span className={scanProgress > 80 ? 'text-emerald-400' : ''}>País</span>
                  <span className={scanProgress > 95 ? 'text-emerald-400' : ''}>Listo</span>
                </div>
              </div>
            )}

            {/* ── Estado: terminado ── */}
            {scanPhase === 'done' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <FaCheck className="text-emerald-400 text-xs" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">Escaneo completado</p>
                    <p className="text-gray-500 text-[10px]">Confirmá para cargar los datos en el formulario</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={retomarFoto}
                    className="flex-1 py-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white text-sm font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <FaRedo className="text-xs" />
                    Repetir foto
                  </button>
                  <button
                    onClick={confirmarCaptura}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-emerald-600/20"
                  >
                    <FaCheck className="text-xs" />
                    Usar estos datos
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
