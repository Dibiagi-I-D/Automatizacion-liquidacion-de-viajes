import { useState, FormEvent, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGastos } from '../context/GastosContext'
import { useAuth } from '../context/AuthContext'
import { Pais, TipoGasto, BANDERAS, NOMBRES_PAIS, NOMBRES_TIPO, calcularPasoVisual } from '../types'
import { FaCheck, FaSpinner, FaArrowLeft, FaReceipt, FaCamera, FaTimes, FaImage } from 'react-icons/fa'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export default function NuevoGasto() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { chofer } = useAuth()
  const { loading } = useGastos()
  
  const nroViaje = searchParams.get('viaje')
  
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [pais, setPais] = useState<Pais>('ARG')
  const [tipo, setTipo] = useState<TipoGasto>('COMBUSTIBLE')
  const [importe, setImporte] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [gastosCount, setGastosCount] = useState(0)

  // Estados para OCR (Google Cloud Vision)
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('')
  const [ocrPreview, setOcrPreview] = useState<string | null>(null)
  const [ocrRawText, setOcrRawText] = useState<string | null>(null)
  const [showOcrResult, setShowOcrResult] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Contar gastos del viaje actual al cargar (desde el servidor)
  useEffect(() => {
    if (nroViaje) {
      fetch(`${API_URL}/gastos-viaje/${nroViaje}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) setGastosCount(data.total || 0)
        })
        .catch(() => {})
    }
  }, [nroViaje])

  /**
   * OCR con Gemini 1.5 Flash (servidor)
   * Envía la imagen al backend que usa Gemini AI para máxima precisión.
   */
  const procesarImagenOCR = async (source: File | Blob, previewUrl?: string) => {
    try {
      setOcrProcessing(true)
      setOcrStatus('Enviando imagen al servidor...')
      setOcrRawText(null)
      setShowOcrResult(false)

      // Crear preview y obtener base64
      const base64Promise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result as string
          if (!previewUrl) setOcrPreview(result)
          resolve(result)
        }
        reader.onerror = reject
        reader.readAsDataURL(source)
      })

      if (previewUrl) {
        setOcrPreview(previewUrl)
      }

      const base64DataUrl = await base64Promise

      // Enviar al backend
      setOcrStatus('Analizando ticket con IA...')
      const response = await fetch(`${API_URL}/ocr/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64DataUrl }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Error del servidor (${response.status})`)
      }

      const data = await response.json()
      console.log('[OCR Google Vision] Resultado:', data)

      setOcrRawText(data.rawText || null)

      // Cargar datos extraídos en el formulario
      if (data.datos?.importe) {
        setImporte(data.datos.importe)
        console.log('Importe extraído:', data.datos.importe)
      }
      if (data.datos?.descripcion && !descripcion) {
        setDescripcion(data.datos.descripcion)
        console.log('Descripción extraída:', data.datos.descripcion)
      }
      if (data.datos?.fecha) {
        setFecha(data.datos.fecha)
        console.log('Fecha extraída:', data.datos.fecha)
      }
      if (data.datos?.pais) {
        setPais(data.datos.pais as Pais)
        console.log('País detectado:', data.datos.pais)
      }

      setShowOcrResult(true)

    } catch (error) {
      console.error('Error en OCR:', error)
      alert('Error al procesar la imagen. Intentá con otra foto más clara y bien enfocada.')
    } finally {
      setOcrProcessing(false)
      setOcrStatus('')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validar que sea imagen
      if (!file.type.startsWith('image/')) {
        alert('Por favor seleccioná una imagen')
        return
      }
      // Máximo 10MB
      if (file.size > 10 * 1024 * 1024) {
        alert('La imagen es muy grande. Máximo 10MB.')
        return
      }
      procesarImagenOCR(file)
    }
    // Reset input para permitir seleccionar la misma imagen
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const limpiarOCR = () => {
    setOcrPreview(null)
    setOcrRawText(null)
    setShowOcrResult(false)
  }

  // Calcular paso visual en tiempo real
  const pasoVisual = importe ? calcularPasoVisual(pais, parseFloat(importe) || 0) : null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const importeNum = parseFloat(importe)
    if (isNaN(importeNum) || importeNum <= 0) {
      alert('Por favor ingresá un importe válido')
      return
    }

    if (!nroViaje) {
      alert('No se especificó un número de viaje')
      return
    }

    try {
      // Enviar gasto al servidor
      const response = await fetch(`${API_URL}/gastos-viaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nroViaje: parseInt(nroViaje),
          fecha: new Date(fecha).toISOString(),
          pais,
          tipo,
          importe: importeNum,
          descripcion: descripcion.trim() || undefined,
          chofer: (chofer as any)?.nombreCompleto || '',
          patenteTractor: chofer?.interno || '',
        })
      })

      const data = await response.json()
      if (!data.success) throw new Error(data.error || 'Error al guardar')

      console.log('Gasto guardado en servidor:', data.data)

      // Actualizar contador de gastos del viaje
      setGastosCount(gastosCount + 1)

      // Limpiar solo los campos del formulario (mantener fecha)
      setImporte('')
      setDescripcion('')
      setShowSuccess(true)
      
      // Ocultar mensaje de éxito después de 2 segundos
      setTimeout(() => {
        setShowSuccess(false)
      }, 2000)
    } catch (err) {
      console.error('Error al guardar gasto:', err)
      alert('Error al agregar el gasto. Por favor intentá de nuevo.')
    }
  }

  return (
    <div className="section-container">
      {/* Botón volver */}
      <button
        onClick={() => navigate('/dashboard/hojas-ruta')}
        className="mb-4 text-gray-500 hover:text-white transition-colors flex items-center gap-2 text-sm"
      >
        <FaArrowLeft className="text-xs" />
        Volver
      </button>

      {/* Info del viaje */}
      {nroViaje && (
        <div className="info-panel mb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600/15 flex items-center justify-center">
                <FaReceipt className="text-emerald-400 text-sm" />
              </div>
              <div>
                <p className="text-xs text-gray-500">
                  Registrando gasto
                </p>
                <p className="text-white text-sm font-semibold">
                  Viaje {nroViaje}
                </p>
              </div>
            </div>
            {gastosCount > 0 && (
              <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md">
                {gastosCount} registrado{gastosCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Indicador de paso visual */}
      {pasoVisual && (
        <div className={`paso-indicator ${pasoVisual === 1 ? 'paso1' : 'paso2'}`}>
          PASO {pasoVisual}
        </div>
      )}

      {/* Mensaje de éxito */}
      {showSuccess && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-slide-up text-sm">
          <FaCheck className="text-xs" />
          <span className="font-medium">Gasto registrado correctamente</span>
        </div>
      )}

      <h1 className="text-lg font-semibold text-white mb-5">Nuevo Gasto</h1>

      {/* Leer ticket — un solo botón para foto o galería */}
      <div className="mb-5">
        {/* Input oculto: capture="environment" ofrece cámara trasera en móvil, galería en desktop */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Botón principal: Sacar foto / seleccionar imagen */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={ocrProcessing}
          className={`w-full glass-card p-4 flex items-center gap-3 transition-all active:scale-[0.98] ${
            ocrProcessing 
              ? 'opacity-60 cursor-wait' 
              : 'hover:border-emerald-500/30 cursor-pointer'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-600/15 flex items-center justify-center flex-shrink-0">
            {ocrProcessing ? (
              <FaSpinner className="animate-spin text-emerald-400" />
            ) : (
              <FaCamera className="text-emerald-400" />
            )}
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-white">
              {ocrProcessing ? 'Analizando ticket...' : 'Leer ticket con foto'}
            </p>
            <p className="text-[11px] text-gray-500">
              {ocrProcessing 
                ? (ocrStatus || 'Procesando...')
                : 'Sacá una foto o elegí una imagen del ticket'
              }
            </p>
          </div>
        </button>

        {/* Botón alternativo: galería sin capture (para elegir foto existente) */}
        {!ocrProcessing && (
          <button
            type="button"
            onClick={() => {
              // Crear un input sin capture para forzar galería
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'image/*'
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) {
                  if (!file.type.startsWith('image/')) { alert('Seleccioná una imagen'); return }
                  if (file.size > 10 * 1024 * 1024) { alert('La imagen es muy grande. Máximo 10MB.'); return }
                  procesarImagenOCR(file)
                }
              }
              input.click()
            }}
            className="w-full mt-2 py-2.5 px-4 flex items-center justify-center gap-2 text-gray-500 hover:text-gray-300 text-xs transition-colors"
          >
            <FaImage className="text-[10px]" />
            <span>O elegir imagen de la galería</span>
          </button>
        )}

        {/* Barra de progreso OCR */}
        {ocrProcessing && (
          <div className="mt-2 w-full bg-white/[0.04] rounded-full h-1.5 overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full animate-pulse"
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Preview de imagen y resultado OCR */}
        {ocrPreview && showOcrResult && (
          <div className="mt-3 glass-card p-3">
            <div className="flex items-start justify-between mb-2">
              <p className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">
                Resultado del escaneo
              </p>
              <button
                type="button"
                onClick={limpiarOCR}
                className="text-gray-500 hover:text-gray-300 transition-colors p-1"
              >
                <FaTimes className="text-xs" />
              </button>
            </div>
            <div className="flex gap-3">
              <img 
                src={ocrPreview} 
                alt="Ticket escaneado" 
                className="w-16 h-20 object-cover rounded-lg border border-white/[0.06]"
              />
              <div className="flex-1 min-w-0">
                {ocrRawText && (
                  <div className="text-[10px] text-gray-500 max-h-16 overflow-y-auto font-mono leading-relaxed bg-white/[0.02] rounded-md p-2">
                    {ocrRawText.split('\n').filter(l => l.trim()).slice(0, 6).map((line, i) => (
                      <div key={i} className="truncate">{line}</div>
                    ))}
                  </div>
                )}
                {importe && (
                  <p className="text-xs text-emerald-400 mt-1.5 font-medium">
                    Importe detectado: ${importe}
                  </p>
                )}
              </div>
            </div>
            <p className="text-[10px] text-gray-600 mt-2">
              Verificá y corregí los datos si es necesario
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Fecha */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
            Fecha
          </label>
          <input
            type="date"
            className="input-field text-sm"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            required
          />
        </div>

        {/* País */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
            País
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(BANDERAS) as Pais[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPais(p)}
                className={`min-h-[52px] px-3 py-2.5 rounded-xl border transition-all active:scale-95 ${
                  pais === p
                    ? 'bg-emerald-600/10 border-emerald-500/30 text-white'
                    : 'bg-white/[0.02] border-white/[0.06] text-gray-500'
                }`}
              >
                <div className="text-xl mb-0.5">{BANDERAS[p]}</div>
                <div className="text-[10px] font-medium">{NOMBRES_PAIS[p]}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Tipo de gasto */}
        {/* <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Tipo de gasto
          </label>
          <select
            className="input-field"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoGasto)}
            required
          >
            {(Object.keys(NOMBRES_TIPO) as TipoGasto[]).map((t) => (
              <option key={t} value={t}>
                {NOMBRES_TIPO[t]}
              </option>
            ))}
          </select>
        </div> */}

        {/* Importe */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
            Importe
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="input-field text-sm"
            placeholder="0.00"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            required
          />
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
            Descripción <span className="text-gray-600 normal-case tracking-normal">(opcional)</span>
          </label>
          <textarea
            className="input-field resize-none text-sm"
            rows={3}
            placeholder="Detalles adicionales..."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>

        {/* Botón submit */}
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading}
        >
          {loading ? (
            <>
              <FaSpinner className="animate-spin mr-2" />
              Registrando...
            </>
          ) : (
            'Registrar Gasto'
          )}
        </button>
      </form>
    </div>
  )
}
