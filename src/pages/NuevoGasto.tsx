import { useState, FormEvent, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGastos } from '../context/GastosContext'
import { Pais, TipoGasto, BANDERAS, NOMBRES_PAIS, NOMBRES_TIPO, calcularPasoVisual } from '../types'
import { FaCheck, FaSpinner, FaArrowLeft, FaReceipt, FaCamera, FaTimes } from 'react-icons/fa'
import { createWorker, Worker } from 'tesseract.js'

/**
 * Preprocesar imagen en Canvas para mejorar el OCR:
 * 1. Escalar a un ancho óptimo (1200px)
 * 2. Convertir a escala de grises
 * 3. Aumentar contraste agresivamente
 * 4. Binarización Otsu (blanco/negro puro)
 * 5. Invertir si el fondo es oscuro (tickets térmicos)
 */
function preprocesarImagen(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!

      // Escalar al ancho óptimo manteniendo aspect ratio
      const TARGET_WIDTH = 1200
      const scale = Math.min(TARGET_WIDTH / img.width, 2) // no agrandar más de 2x
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)

      // Dibujar imagen escalada
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      // Obtener datos de píxeles
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      // Paso 1: Convertir a escala de grises
      const grayValues: number[] = []
      for (let i = 0; i < data.length; i += 4) {
        // Luminancia ponderada (mejor para texto)
        const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
        data[i] = gray
        data[i + 1] = gray
        data[i + 2] = gray
        grayValues.push(gray)
      }

      // Paso 2: Calcular umbral Otsu para binarización
      const histogram = new Array(256).fill(0)
      for (const g of grayValues) histogram[g]++

      const total = grayValues.length
      let sumTotal = 0
      for (let i = 0; i < 256; i++) sumTotal += i * histogram[i]

      let sumBack = 0
      let weightBack = 0
      let maxVariance = 0
      let threshold = 128

      for (let t = 0; t < 256; t++) {
        weightBack += histogram[t]
        if (weightBack === 0) continue
        const weightFore = total - weightBack
        if (weightFore === 0) break

        sumBack += t * histogram[t]
        const meanBack = sumBack / weightBack
        const meanFore = (sumTotal - sumBack) / weightFore
        const variance = weightBack * weightFore * (meanBack - meanFore) ** 2

        if (variance > maxVariance) {
          maxVariance = variance
          threshold = t
        }
      }

      // Paso 3: Binarizar con el umbral Otsu
      let blackCount = 0
      let whiteCount = 0
      for (let i = 0; i < data.length; i += 4) {
        const val = data[i] > threshold ? 255 : 0
        if (val === 0) blackCount++
        else whiteCount++
        data[i] = val
        data[i + 1] = val
        data[i + 2] = val
      }

      // Paso 4: Invertir si el fondo es oscuro (más negro que blanco = ticket térmico invertido)
      if (blackCount > whiteCount) {
        for (let i = 0; i < data.length; i += 4) {
          data[i] = 255 - data[i]
          data[i + 1] = 255 - data[i + 1]
          data[i + 2] = 255 - data[i + 2]
        }
      }

      ctx.putImageData(imageData, 0, 0)

      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Error al crear blob de imagen procesada'))
      }, 'image/png')
    }
    img.onerror = () => reject(new Error('Error al cargar la imagen'))
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Normalizar un string numérico con formatos regionales a un float
 * Soporta: 1.234,56 | 1,234.56 | 1234,56 | 1234.56
 */
function normalizarNumero(str: string): number {
  let s = str.replace(/\s/g, '').replace(/\$/g, '')

  // Formato argentino/europeo: 1.234,56 → puntos como separador miles, coma decimal
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
    return parseFloat(s)
  }
  // Formato US: 1,234.56 → comas como separador miles, punto decimal
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) {
    s = s.replace(/,/g, '')
    return parseFloat(s)
  }
  // Solo coma como decimal: 1234,56
  if (/^\d+(,\d{1,2})$/.test(s)) {
    s = s.replace(',', '.')
    return parseFloat(s)
  }
  // Solo punto como decimal: 1234.56
  if (/^\d+(\.\d{1,2})$/.test(s)) {
    return parseFloat(s)
  }
  // Número entero o con punto decimal largo
  s = s.replace(/,/g, '')
  return parseFloat(s)
}

/**
 * Extraer el importe y descripción más probables de un texto OCR.
 * Estrategia multi-paso con alta tolerancia a errores de OCR.
 */
function extraerDatosDeTexto(texto: string): { importe: string; descripcionExtraida: string; fechaExtraida: string } {
  const lines = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // ────────── 1. Buscar por keywords de TOTAL ──────────
  // Patrones ordenados por prioridad (más específico = más prioridad)
  const patronesTotal: Array<{ regex: RegExp; prioridad: number }> = [
    // "TOTAL" con variantes
    { regex: /total\s*(?:a\s*pagar|final|general)?[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 100 },
    { regex: /tot[ai]l[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 95 }, // OCR puede leer "totai"
    { regex: /t[o0]tal[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 90 }, // OCR puede leer "t0tal"
    // Importe
    { regex: /importe\s*(?:total|final|neto)?[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 85 },
    { regex: /imp[o0]rte[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 80 },
    // Monto
    { regex: /monto\s*(?:total|final)?[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 75 },
    // A pagar
    { regex: /a\s*pagar[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 70 },
    // Neto / Bruto
    { regex: /neto[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 55 },
    { regex: /bruto[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 50 },
    // Subtotal (menor prioridad que total)
    { regex: /sub\s*total[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 45 },
    // Valor / Precio
    { regex: /valor[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 40 },
    { regex: /precio[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 35 },
    // Peaje especifico
    { regex: /tarifa[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 60 },
    { regex: /peaje[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 60 },
    // Litros x precio = importe (estaciones de servicio)
    { regex: /importe[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 65 },
  ]

  let mejorImporteStr = ''
  let mejorPrioridad = -1

  // Buscar en el texto completo (uniendo líneas cercanas) y también línea por línea
  const textoCompleto = lines.join(' ')
  const bloques = [textoCompleto, ...lines]

  for (const bloque of bloques) {
    for (const { regex, prioridad } of patronesTotal) {
      const match = bloque.match(regex)
      if (match && match[1]) {
        const num = normalizarNumero(match[1])
        if (!isNaN(num) && num > 0 && prioridad > mejorPrioridad) {
          mejorPrioridad = prioridad
          mejorImporteStr = num.toString()
        }
      }
    }
  }

  // ────────── 2. Si no encontró keyword, buscar número con $ delante ──────────
  if (!mejorImporteStr) {
    const regexPesos = /\$\s*(\d[\d.,]*\d|\d)/g
    const candidatos: number[] = []
    let m
    while ((m = regexPesos.exec(textoCompleto)) !== null) {
      const num = normalizarNumero(m[1])
      if (!isNaN(num) && num > 0) candidatos.push(num)
    }
    if (candidatos.length > 0) {
      // El más grande con $ es probablemente el total
      mejorImporteStr = Math.max(...candidatos).toString()
    }
  }

  // ────────── 3. Último recurso: el número más grande del ticket ──────────
  if (!mejorImporteStr) {
    const regexNums = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g
    const candidatos: number[] = []
    let m
    while ((m = regexNums.exec(textoCompleto)) !== null) {
      const num = normalizarNumero(m[1])
      // Filtrar números que parecen fechas, horas, CUIT, etc.
      if (!isNaN(num) && num > 0 && num < 100000000) {
        // Ignorar si parece CUIT (11 dígitos) o fecha
        const raw = m[1].replace(/[.,]/g, '')
        if (raw.length <= 8) {
          candidatos.push(num)
        }
      }
    }
    if (candidatos.length > 0) {
      mejorImporteStr = Math.max(...candidatos).toString()
    }
  }

  // ────────── 4. Extraer descripción (nombre del comercio o concepto) ──────────
  const lineasTexto = lines.filter(l => {
    // Descartar líneas que son solo números, fechas, espacios
    if (l.length < 4) return false
    if (/^[\d\s.,/$%:=\-*#]+$/.test(l)) return false
    if (/^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}/.test(l)) return false
    if (/^(total|subtotal|importe|monto|iva|neto|bruto|efectivo|cambio|cuit|cae)/i.test(l)) return false
    return true
  })
  const descripcionExtraida = lineasTexto.slice(0, 2).join(' - ').substring(0, 120)

  // ────────── 5. Intentar extraer fecha del ticket ──────────
  let fechaExtraida = ''
  const regexFechas = [
    /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/,  // dd/mm/yyyy
    /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})/,   // dd/mm/yy
  ]
  for (const line of lines) {
    for (const rx of regexFechas) {
      const match = line.match(rx)
      if (match) {
        const dia = match[1].padStart(2, '0')
        const mes = match[2].padStart(2, '0')
        let anio = match[3]
        if (anio.length === 2) anio = '20' + anio
        // Validar rango
        const diaNum = parseInt(dia)
        const mesNum = parseInt(mes)
        if (diaNum >= 1 && diaNum <= 31 && mesNum >= 1 && mesNum <= 12) {
          fechaExtraida = `${anio}-${mes}-${dia}`
          break
        }
      }
    }
    if (fechaExtraida) break
  }

  return { importe: mejorImporteStr, descripcionExtraida, fechaExtraida }
}

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
  const [ocrStatus, setOcrStatus] = useState('')
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
   * Procesar imagen con OCR:
   * 1. Preprocesar con Canvas (grayscale + Otsu binarization)
   * 2. Ejecutar Tesseract en español con parámetros optimizados
   * 3. Extraer datos inteligentemente del texto reconocido
   */
  const procesarImagenOCR = async (file: File) => {
    try {
      setOcrProcessing(true)
      setOcrProgress(0)
      setOcrStatus('Preparando imagen...')
      setOcrRawText(null)
      setShowOcrResult(false)

      // Crear preview de la imagen original
      const reader = new FileReader()
      reader.onload = (e) => setOcrPreview(e.target?.result as string)
      reader.readAsDataURL(file)

      // Preprocesar la imagen (escala de grises + binarización Otsu)
      setOcrStatus('Mejorando imagen para lectura...')
      setOcrProgress(5)
      const imagenProcesada = await preprocesarImagen(file)

      // Crear worker de Tesseract con español
      setOcrStatus('Iniciando reconocimiento...')
      setOcrProgress(10)
      const worker = await createWorker('spa', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(10 + Math.round(m.progress * 85))
            setOcrStatus(`Leyendo texto ${Math.round(m.progress * 100)}%`)
          }
        }
      })
      workerRef.current = worker

      // Parámetros optimizados para tickets - NO usar whitelist
      await worker.setParameters({
        tessedit_pageseg_mode: 6 as any,  // Assume a single uniform block of text
        preserve_interword_spaces: '1',
      })

      // Reconocer texto de la imagen preprocesada
      const { data: { text } } = await worker.recognize(imagenProcesada)

      console.log('--- OCR RAW TEXT ---')
      console.log(text)
      console.log('--- END OCR ---')
      setOcrRawText(text)

      // Extraer datos del texto reconocido
      setOcrStatus('Extrayendo datos...')
      setOcrProgress(98)
      const { importe: importeExtraido, descripcionExtraida, fechaExtraida } = extraerDatosDeTexto(text)

      if (importeExtraido) {
        setImporte(importeExtraido)
        console.log('Importe extraído:', importeExtraido)
      }
      if (descripcionExtraida && !descripcion) {
        setDescripcion(descripcionExtraida)
        console.log('Descripción extraída:', descripcionExtraida)
      }
      if (fechaExtraida) {
        setFecha(fechaExtraida)
        console.log('Fecha extraída:', fechaExtraida)
      }

      setOcrProgress(100)
      setShowOcrResult(true)

      // Limpiar worker
      await worker.terminate()
      workerRef.current = null

    } catch (error) {
      console.error('Error en OCR:', error)
      alert('Error al procesar la imagen. Intentá con otra foto más clara y bien enfocada.')
    } finally {
      setOcrProcessing(false)
      setOcrProgress(0)
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
                ? (ocrStatus || `Procesando ${ocrProgress}%`)
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
