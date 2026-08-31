import { useState, FormEvent, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Pais, BANDERAS, NOMBRES_PAIS, calcularPasoVisual } from '../types'
import { FaCheck, FaSpinner, FaArrowLeft, FaReceipt, FaCamera, FaTimes, FaImage } from 'react-icons/fa'

const API_URL = import.meta.env.VITE_API_URL || '/api'

interface ConceptoSoftland {
  tipoProducto: string
  codigoArticulo: string
  descripcion: string
  unidadMedida: string
}

export default function NuevoGasto() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { chofer } = useAuth()
  
  const nroViaje = searchParams.get('viaje')
  
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [pais, setPais] = useState<Pais>('ARG')
  const [tipoProducto, setTipoProducto] = useState('')
  const [codigoArticulo, setCodigoArticulo] = useState('')
  const [formalidad, setFormalidad] = useState<'FORMAL' | 'INFORMAL'>('INFORMAL')
  const [codigoProveedor, setCodigoProveedor] = useState('')
  const [importe, setImporte] = useState('')
  const [descripcion, setDescripcion] = useState('')
  // Guardado: mientras dura, un cartel tapa la pantalla para que no se pueda
  // volver a tocar el botón. Al terminar, el mismo cartel muestra el resultado.
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null)
  const enviando = useRef(false)
  const [gastosCount, setGastosCount] = useState(0)

  // Conceptos Softland
  const [conceptos, setConceptos] = useState<ConceptoSoftland[]>([])
  const [loadingConceptos, setLoadingConceptos] = useState(true)

  // Estados para OCR (Google Cloud Vision)
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('')
  const [ocrPreview, setOcrPreview] = useState<string | null>(null)
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

  // Cargar conceptos Softland
  useEffect(() => {
    fetch(`${API_URL}/conceptos`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setConceptos(data.data || [])
      })
      .catch(() => console.error('Error al cargar conceptos'))
      .finally(() => setLoadingConceptos(false))
  }, [])

  /**
   * Redimensiona la foto antes de guardarla en la base.
   * La cámara de un celular saca 3–8 MB; para verificar un ticket alcanza
   * con el lado mayor en 1600 px, lo que deja archivos de 150–400 KB.
   * Si algo falla devuelve el original: nunca bloquea el guardado del gasto.
   */
  const comprimirImagen = (dataUrl: string, maxLado = 1600, calidad = 0.82): Promise<string> =>
    new Promise((resolve) => {
      try {
        const img = new Image()
        img.onload = () => {
          const escala = Math.min(1, maxLado / Math.max(img.width, img.height))
          if (escala === 1 && dataUrl.length < 900_000) return resolve(dataUrl)

          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * escala)
          canvas.height = Math.round(img.height * escala)

          const ctx = canvas.getContext('2d')
          if (!ctx) return resolve(dataUrl)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

          resolve(canvas.toDataURL('image/jpeg', calidad))
        }
        img.onerror = () => resolve(dataUrl)
        img.src = dataUrl
      } catch {
        resolve(dataUrl)
      }
    })

  /**
   * OCR con Gemini 1.5 Flash (servidor)
   * Envía la imagen al backend que usa Gemini AI para máxima precisión.
   */
  const procesarImagenOCR = async (source: File | Blob, previewUrl?: string) => {
    try {
      setOcrProcessing(true)
      setOcrStatus('Enviando imagen al servidor...')
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


      // Cargar datos extraídos en el formulario
      if (data.datos?.importe) {
        setImporte(data.datos.importe)
        console.log('Importe extraído:', data.datos.importe)
      }
      if (data.datos?.descripcion) {
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

      // Siempre completar tipo y código — si la IA no pudo clasificar, usar TARIFA/14 (Gastos extras)
      const tp = data.datos?.tipoProducto || 'TARIFA'
      const ca = data.datos?.codigoArticulo ? String(data.datos.codigoArticulo) : '14'
      setTipoProducto(tp)
      setCodigoArticulo(ca)
      console.log('Concepto asignado:', tp, '/', ca)

      // Formalidad (FORMAL/INFORMAL)
      const form = data.datos?.formalidad === 'FORMAL' ? 'FORMAL' : 'INFORMAL'
      setFormalidad(form)
      console.log('Formalidad:', form)

      // Proveedor (el OCR puede devolver un nombre; lo guardamos como texto libre)
      if (data.datos?.proveedor) {
        setCodigoProveedor(data.datos.proveedor)
        console.log('Proveedor:', data.datos.proveedor)
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
    setShowOcrResult(false)
  }

  // Calcular paso visual en tiempo real
  const pasoVisual = importe ? calcularPasoVisual(pais, parseFloat(importe) || 0) : null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    // Guarda contra el doble toque: en un celular los dos clicks pueden llegar
    // antes de que React vuelva a dibujar el botón deshabilitado. El ref se lee
    // y se escribe en el acto, así que el segundo envío no pasa de acá.
    if (enviando.current) return

    const importeNum = parseFloat(importe)
    if (isNaN(importeNum) || importeNum <= 0) {
      alert('Por favor ingresá un importe válido')
      return
    }

    if (!nroViaje) {
      alert('No se especificó un número de viaje')
      return
    }

    enviando.current = true
    setGuardando(true)

    try {
      // Estos campos ya no se muestran en el formulario: normalmente los completa el
      // OCR. Si el gasto se carga a mano (sin foto), quedan vacíos, así que acá se
      // aplica el mismo fallback que usa el backend: TARIFA/14 — Gastos extras.
      const tipoProductoFinal   = tipoProducto   || 'TARIFA'
      const codigoArticuloFinal = codigoArticulo || '14'

      // Obtener la descripción del concepto para guardarla como texto legible
      const conceptoSeleccionado = conceptos.find(
        c => c.tipoProducto === tipoProductoFinal && c.codigoArticulo === codigoArticuloFinal
      )

      // Adjuntar la foto del ticket (comprimida) para que quede como respaldo
      let fotoParaGuardar: string | undefined
      if (ocrPreview) {
        try {
          fotoParaGuardar = await comprimirImagen(ocrPreview)
        } catch {
          fotoParaGuardar = ocrPreview
        }
      }

      // Enviar gasto al servidor
      const response = await fetch(`${API_URL}/gastos-viaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foto: fotoParaGuardar,
          nroViaje: parseInt(nroViaje),
          fecha: new Date(fecha).toISOString(),
          pais,
          tipo: conceptoSeleccionado?.descripcion || tipoProductoFinal,
          tipoProducto:   tipoProductoFinal,
          codigoArticulo: codigoArticuloFinal,
          formalidad,
          codigoProveedor: codigoProveedor.trim() || undefined,
          importe: importeNum,
          descripcion: descripcion.trim() || undefined,
          chofer: (chofer as any)?.nombreCompleto || '',
          legajoChofer: chofer?.legajo || '',
          empresaChofer: (chofer as any)?.empresaChofer || '',
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
      setTipoProducto('')
      setCodigoArticulo('')
      setFormalidad('INFORMAL')
      setCodigoProveedor('')
      // Limpiar la foto: si no, el próximo gasto se guardaría con el ticket anterior
      limpiarOCR()

      setResultado({ ok: true, mensaje: 'Gasto registrado' })
    } catch (err) {
      console.error('Error al guardar gasto:', err)
      setResultado({
        ok: false,
        mensaje: err instanceof Error && err.message
          ? err.message
          : 'No se pudo guardar el gasto. Revisá la señal e intentá de nuevo.',
      })
    } finally {
      setGuardando(false)
      enviando.current = false
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

      {/*
        Cartel de guardado. Tapa toda la pantalla a propósito: mientras el gasto
        viaja al servidor no hay forma de volver a tocar el botón, que era lo que
        generaba gastos duplicados cuando la conexión tardaba.
      */}
      {(guardando || resultado) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl bg-[#161a22] border border-white/[0.08] p-6 text-center shadow-2xl">

            {guardando && (
              <>
                <FaSpinner className="animate-spin text-3xl text-emerald-400 mx-auto mb-4" />
                <p className="text-white font-semibold">Registrando gasto…</p>
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
                  {resultado.ok ? 'Gasto registrado' : 'No se pudo registrar'}
                </p>
                <p className="text-gray-500 text-xs mt-1.5 break-words">
                  {resultado.ok
                    ? `Ya quedó cargado en el viaje ${nroViaje}.`
                    : resultado.mensaje}
                </p>
                <button
                  type="button"
                  onClick={() => setResultado(null)}
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
                className="w-24 h-32 object-cover rounded-lg border border-white/[0.06] flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="space-y-1.5">
                  {importe && (
                    <p className="text-sm text-emerald-400 font-medium">
                      Importe: ${importe}
                    </p>
                  )}
                  {fecha && (
                    <p className="text-sm text-gray-300">
                      Fecha: {fecha}
                    </p>
                  )}
                  {descripcion && (
                    <p className="text-sm text-gray-300">
                      Comercio: {descripcion}
                    </p>
                  )}
                  {tipoProducto && codigoArticulo && (
                    <p className="text-sm text-blue-400 font-medium">
                      Concepto: {tipoProducto}/{codigoArticulo} — {conceptos.find(c => c.tipoProducto === tipoProducto && c.codigoArticulo === codigoArticulo)?.descripcion || 'Detectado'}
                    </p>
                  )}
                  <p className={`text-sm font-medium ${formalidad === 'FORMAL' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    Formalidad: {formalidad}
                  </p>
                  {codigoProveedor && (
                    <p className="text-sm text-gray-300">
                      Proveedor: {codigoProveedor}
                    </p>
                  )}
                </div>
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

        {/*
          Tipo de gasto, concepto, formalidad y proveedor NO se muestran al chofer:
          los completa el OCR y viajan igual en el POST. Se ocultaron tras pruebas
          de usuario — eran campos de nomenclatura Softland que el chofer no puede
          decidir bien y que solo agregaban fricción. Los estados siguen vivos.
        */}

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
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={guardando}
        >
          {guardando ? (
            <>
              <FaSpinner className="animate-spin mr-2" />
              Registrando…
            </>
          ) : (
            'Registrar Gasto'
          )}
        </button>
      </form>
    </div>
  )
}
