import { useState, FormEvent, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGastos } from '../context/GastosContext'
import { Pais, TipoGasto, BANDERAS, NOMBRES_PAIS, NOMBRES_TIPO, calcularPasoVisual } from '../types'
import { FaCheck, FaSpinner, FaArrowLeft, FaReceipt, FaCamera, FaTimes } from 'react-icons/fa'
import { createWorker, Worker } from 'tesseract.js'

export default function NuevoGasto() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { agregarGasto, loading } = useGastos()
  
  const nroViaje = searchParams.get('viaje')
  
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [pais, setPais] = useState<Pais>('ARG')
  const [tipo, setTipo] = useState<TipoGasto>('COMBUSTIBLE')
  const [importe, setImporte] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [gastosCount, setGastosCount] = useState(0)

  // Estados para OCR
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrPreview, setOcrPreview] = useState<string | null>(null)
  const [ocrRawText, setOcrRawText] = useState<string | null>(null)
  const [showOcrResult, setShowOcrResult] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)

  // Contar gastos del viaje actual al cargar
  useEffect(() => {
    if (nroViaje) {
      const gastosGuardados = localStorage.getItem('gastos_viajes')
      if (gastosGuardados) {
        const gastos = JSON.parse(gastosGuardados)
        const gastosDelViaje = gastos.filter((g: any) => g.nroViaje === parseInt(nroViaje))
        setGastosCount(gastosDelViaje.length)
      }
    }
  }, [nroViaje])

  // Cleanup del worker OCR al desmontar
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
      }
    }
  }, [])

  /**
   * Extraer el importe más probable de un texto OCR de ticket/recibo.
   * Busca patrones como "TOTAL", "IMPORTE", "MONTO", etc. y extrae el número asociado.
   * Si no encuentra keyword, toma el número más grande como candidato.
   */
  const extraerImporteDeTexto = (texto: string): { importe: string; descripcionExtraida: string } => {
    const lines = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    
    // Patrones de keywords que suelen preceder al importe total
    const keywordsTotal = [
      /total\s*(?:a\s*pagar|final|general|neto|bruto)?[\s:$]*([0-9][0-9.,]*)/i,
      /importe\s*(?:total|final|neto)?[\s:$]*([0-9][0-9.,]*)/i,
      /monto\s*(?:total|final)?[\s:$]*([0-9][0-9.,]*)/i,
      /a\s*pagar[\s:$]*([0-9][0-9.,]*)/i,
      /subtotal[\s:$]*([0-9][0-9.,]*)/i,
      /neto[\s:$]*([0-9][0-9.,]*)/i,
      /valor[\s:$]*([0-9][0-9.,]*)/i,
      /precio[\s:$]*([0-9][0-9.,]*)/i,
    ]

    let mejorImporte = ''
    let mejorPrioridad = -1

    // Buscar en cada línea por keywords
    for (const line of lines) {
      for (let i = 0; i < keywordsTotal.length; i++) {
        const match = line.match(keywordsTotal[i])
        if (match && match[1]) {
          const prioridad = keywordsTotal.length - i // Más prioridad a "TOTAL"
          if (prioridad > mejorPrioridad) {
            mejorPrioridad = prioridad
            mejorImporte = match[1]
          }
        }
      }
    }

    // Si no encontró keyword, buscar todos los números y tomar el más grande
    if (!mejorImporte) {
      const todosLosNumeros: number[] = []
      const regexNumeros = /\$?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/g
      
      for (const line of lines) {
        let match
        while ((match = regexNumeros.exec(line)) !== null) {
          // Normalizar: si tiene formato 1.234,56 (AR) -> 1234.56
          let numStr = match[1]
          // Detectar formato argentino: 1.234,56
          if (numStr.includes('.') && numStr.includes(',')) {
            numStr = numStr.replace(/\./g, '').replace(',', '.')
          } else if (numStr.includes(',')) {
            // Solo coma: podría ser decimal
            const partes = numStr.split(',')
            if (partes[partes.length - 1].length <= 2) {
              numStr = numStr.replace(',', '.')
            } else {
              numStr = numStr.replace(/,/g, '')
            }
          }
          
          const num = parseFloat(numStr)
          if (!isNaN(num) && num > 0) {
            todosLosNumeros.push(num)
          }
        }
      }

      if (todosLosNumeros.length > 0) {
        const maximo = Math.max(...todosLosNumeros)
        mejorImporte = maximo.toString()
      }
    } else {
      // Normalizar el importe encontrado
      let numStr = mejorImporte
      if (numStr.includes('.') && numStr.includes(',')) {
        numStr = numStr.replace(/\./g, '').replace(',', '.')
      } else if (numStr.includes(',')) {
        const partes = numStr.split(',')
        if (partes[partes.length - 1].length <= 2) {
          numStr = numStr.replace(',', '.')
        } else {
          numStr = numStr.replace(/,/g, '')
        }
      }
      mejorImporte = numStr
    }

    // Extraer una descripción corta (primeras líneas que no sean solo números)
    const descripcionLineas = lines
      .filter(l => l.length > 3 && !/^[0-9\s.,/$%:=-]+$/.test(l))
      .slice(0, 2)
    const descripcionExtraida = descripcionLineas.join(' - ').substring(0, 100)

    return {
      importe: mejorImporte,
      descripcionExtraida
    }
  }

  /**
   * Procesar imagen con OCR usando Tesseract.js
   */
  const procesarImagenOCR = async (file: File) => {
    try {
      setOcrProcessing(true)
      setOcrProgress(0)
      setOcrRawText(null)
      setShowOcrResult(false)

      // Crear preview de la imagen
      const reader = new FileReader()
      reader.onload = (e) => setOcrPreview(e.target?.result as string)
      reader.readAsDataURL(file)

      // Crear worker de Tesseract
      const worker = await createWorker('spa', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100))
          }
        }
      })
      workerRef.current = worker

      // Configurar para mejor precisión en números
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789.,$ ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzáéíóúñÁÉÍÓÚÑ:/-+%\n ',
      })

      // Reconocer texto
      const { data: { text } } = await worker.recognize(file)
      
      console.log('OCR Raw text:', text)
      setOcrRawText(text)

      // Extraer importe y descripción
      const { importe: importeExtraido, descripcionExtraida } = extraerImporteDeTexto(text)

      if (importeExtraido) {
        setImporte(importeExtraido)
      }
      if (descripcionExtraida && !descripcion) {
        setDescripcion(descripcionExtraida)
      }

      setShowOcrResult(true)

      // Limpiar worker
      await worker.terminate()
      workerRef.current = null

    } catch (error) {
      console.error('Error en OCR:', error)
      alert('Error al procesar la imagen. Intentá con otra foto más clara.')
    } finally {
      setOcrProcessing(false)
      setOcrProgress(0)
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
      // Crear objeto de gasto
      const nuevoGasto = {
        id: Date.now().toString(),
        nroViaje: parseInt(nroViaje),
        fecha: new Date(fecha).toISOString(),
        pais,
        tipo,
        importe: importeNum,
        descripcion: descripcion.trim() || undefined,
        createdAt: new Date().toISOString()
      }

      // Obtener gastos existentes del localStorage
      const gastosGuardados = localStorage.getItem('gastos_viajes')
      const gastos = gastosGuardados ? JSON.parse(gastosGuardados) : []
      
      // Agregar nuevo gasto
      gastos.push(nuevoGasto)
      
      // Guardar en localStorage
      localStorage.setItem('gastos_viajes', JSON.stringify(gastos))

      console.log('✅ Gasto guardado en localStorage:', nuevoGasto)
      console.log('📊 Total de gastos:', gastos.length)

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

      {/* Botón OCR - Escanear ticket */}
      <div className="mb-5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelect}
        />
        
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
              {ocrProcessing ? 'Procesando imagen...' : 'Escanear ticket'}
            </p>
            <p className="text-[11px] text-gray-500">
              {ocrProcessing 
                ? `Reconociendo texto ${ocrProgress}%`
                : 'Sacá una foto al ticket y se completa automáticamente'
              }
            </p>
          </div>
        </button>

        {/* Barra de progreso OCR */}
        {ocrProcessing && (
          <div className="mt-2 w-full bg-white/[0.04] rounded-full h-1.5 overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${ocrProgress}%` }}
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
