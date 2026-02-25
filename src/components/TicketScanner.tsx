import { useState, useRef, useEffect, useCallback } from 'react'
import { FaTimes, FaCamera, FaBolt, FaRedo, FaCheck, FaSpinner } from 'react-icons/fa'

interface TicketScannerProps {
  open: boolean
  onClose: () => void
  onCapture: (blob: Blob, previewUrl: string) => void
}

/**
 * Componente de escáner tipo cámara en vivo con:
 * - Vista previa de cámara en tiempo real
 * - Marco guía para encuadrar el ticket
 * - Línea de escaneo animada
 * - Captura en alta resolución
 * - Linterna / flash
 * - Vista previa de la captura antes de confirmar
 */
export default function TicketScanner({ open, onClose, onCapture }: TicketScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [flashOn, setFlashOn] = useState(false)
  const [flashSupported, setFlashSupported] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)

  // Iniciar cámara cuando se abre
  useEffect(() => {
    if (open) {
      iniciarCamara()
    } else {
      detenerCamara()
      setCapturedImage(null)
      setCapturedBlob(null)
      setCameraReady(false)
      setCameraError('')
      setFlashOn(false)
    }

    return () => {
      detenerCamara()
    }
  }, [open])

  const iniciarCamara = async () => {
    try {
      setCameraError('')
      setCameraReady(false)

      // Pedir cámara trasera con la mayor resolución posible
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)

        // Verificar si soporta flash/linterna
        const track = stream.getVideoTracks()[0]
        const capabilities = track.getCapabilities?.() as any
        if (capabilities?.torch) {
          setFlashSupported(true)
        }
      }
    } catch (err: any) {
      console.error('Error al iniciar cámara:', err)
      if (err.name === 'NotAllowedError') {
        setCameraError('Permiso de cámara denegado. Habilitalo en la configuración del navegador.')
      } else if (err.name === 'NotFoundError') {
        setCameraError('No se encontró ninguna cámara en el dispositivo.')
      } else {
        setCameraError('Error al acceder a la cámara: ' + err.message)
      }
    }
  }

  const detenerCamara = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setFlashSupported(false)
    setFlashOn(false)
  }

  const toggleFlash = async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    try {
      await track.applyConstraints({
        // @ts-ignore
        advanced: [{ torch: !flashOn }]
      })
      setFlashOn(!flashOn)
    } catch (err) {
      console.error('Error al cambiar flash:', err)
    }
  }

  const capturarFoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!

    // Capturar a la resolución real del video (no del CSS)
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Dibujar frame del video en el canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Obtener como URL para preview
    const previewUrl = canvas.toDataURL('image/jpeg', 0.9)
    setCapturedImage(previewUrl)

    // Obtener como Blob en alta calidad
    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob)
      }
    }, 'image/jpeg', 0.95)
  }, [])

  const retomarFoto = () => {
    setCapturedImage(null)
    setCapturedBlob(null)
  }

  const confirmarCaptura = () => {
    if (capturedBlob && capturedImage) {
      onCapture(capturedBlob, capturedImage)
      onClose()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      {/* Canvas oculto para captura */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white"
        >
          <FaTimes className="text-sm" />
        </button>

        <p className="text-white text-sm font-medium">Escanear Ticket</p>

        {flashSupported && !capturedImage ? (
          <button
            onClick={toggleFlash}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              flashOn
                ? 'bg-yellow-400 text-black'
                : 'bg-white/10 backdrop-blur-sm text-white'
            }`}
          >
            <FaBolt className="text-sm" />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Cámara en vivo o preview de captura */}
      {!capturedImage ? (
        <>
          {/* Video de cámara */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Overlay oscuro con recorte central */}
          {cameraReady && (
            <div className="absolute inset-0 z-10 pointer-events-none">
              {/* Oscurecer bordes */}
              <div className="absolute inset-0 bg-black/50" />

              {/* Recorte transparente en el centro (zona del ticket) */}
              <div
                className="absolute left-[8%] right-[8%] top-[15%] bottom-[25%] bg-transparent"
                style={{
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                  borderRadius: '12px',
                }}
              />

              {/* Esquinas del marco guía */}
              <div className="absolute left-[8%] right-[8%] top-[15%] bottom-[25%]">
                {/* Esquina superior izquierda */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-emerald-400 rounded-tl-lg" />
                {/* Esquina superior derecha */}
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-emerald-400 rounded-tr-lg" />
                {/* Esquina inferior izquierda */}
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-emerald-400 rounded-bl-lg" />
                {/* Esquina inferior derecha */}
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-emerald-400 rounded-br-lg" />

                {/* Línea de escaneo animada */}
                <div className="absolute left-2 right-2 h-0.5 bg-emerald-400/70 animate-scan-line rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              </div>

              {/* Texto guía */}
              <div className="absolute left-0 right-0 bottom-[17%] text-center">
                <p className="text-white/80 text-xs font-medium">
                  Encuadrá el ticket dentro del marco
                </p>
                <p className="text-white/50 text-[10px] mt-1">
                  Mantené el ticket recto y bien iluminado
                </p>
              </div>
            </div>
          )}

          {/* Estado de cámara */}
          {!cameraReady && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                <FaSpinner className="animate-spin text-2xl text-emerald-400 mx-auto mb-3" />
                <p className="text-white/70 text-sm">Iniciando cámara...</p>
              </div>
            </div>
          )}

          {/* Error de cámara */}
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center z-10 p-8">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <FaCamera className="text-xl text-red-400" />
                </div>
                <p className="text-white text-sm mb-2">No se pudo acceder a la cámara</p>
                <p className="text-gray-400 text-xs mb-4">{cameraError}</p>
                <button
                  onClick={iniciarCamara}
                  className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-xl"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {/* Botón de captura */}
          {cameraReady && (
            <div className="absolute bottom-0 left-0 right-0 z-20 pb-10 pt-6 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center justify-center">
                <button
                  onClick={capturarFoto}
                  className="w-18 h-18 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform"
                  style={{ width: '72px', height: '72px' }}
                >
                  <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center" style={{ width: '58px', height: '58px' }}>
                    <FaCamera className="text-black/70 text-lg" />
                  </div>
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Preview de la foto capturada */}
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <img
              src={capturedImage}
              alt="Captura del ticket"
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Botones de confirmar / rehacer */}
          <div className="absolute bottom-0 left-0 right-0 z-20 pb-10 pt-6 bg-gradient-to-t from-black/90 to-transparent">
            <p className="text-white/70 text-xs text-center mb-4">
              ¿Se ve bien el ticket?
            </p>
            <div className="flex items-center justify-center gap-8">
              {/* Rehacer */}
              <button
                onClick={retomarFoto}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
                  <FaRedo className="text-white text-lg" />
                </div>
                <span className="text-white/60 text-[10px] font-medium">Repetir</span>
              </button>

              {/* Confirmar */}
              <button
                onClick={confirmarCaptura}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <FaCheck className="text-white text-lg" />
                </div>
                <span className="text-emerald-400 text-[10px] font-medium">Usar foto</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
