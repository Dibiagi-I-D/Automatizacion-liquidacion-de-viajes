import { useState, FormEvent, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGastos } from '../context/GastosContext'
import { Pais, TipoGasto, BANDERAS, NOMBRES_PAIS, NOMBRES_TIPO, calcularPasoVisual } from '../types'
import { FaCheck, FaSpinner, FaArrowLeft, FaReceipt, FaCamera, FaTimes, FaImage } from 'react-icons/fa'
import { createWorker, Worker } from 'tesseract.js'

/**
 * MOTOR OCR ULTRA-PRECISO para tickets de gasto
 * ==============================================
 * Genera MÚLTIPLES variantes de la imagen y ejecuta Tesseract en cada una,
 * luego combina los mejores resultados para máxima precisión.
 *
 * Variantes generadas:
 * 1. Original escalada - para tickets bien impresos
 * 2. Binarización Otsu clásica - para la mayoría de tickets
 * 3. Alto contraste + sharpen - para tickets desvaídos o con poca tinta
 * 4. Binarización adaptativa (local) - para fotos con iluminación desigual
 * 5. Inversión inteligente - para tickets térmicos oscuros
 */

/** Escalar imagen a resolución óptima para OCR */
function escalarImagen(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const TARGET_WIDTH = 1600
  const scale = Math.min(TARGET_WIDTH / img.width, 2.5)
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Convertir a escala de grises */
function aGrises(imageData: ImageData): Uint8Array {
  const gray = new Uint8Array(imageData.width * imageData.height)
  const d = imageData.data
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
  }
  return gray
}

/** Calcular umbral Otsu global */
function umbralOtsu(gray: Uint8Array): number {
  const hist = new Array(256).fill(0)
  for (const g of gray) hist[g]++
  const total = gray.length
  let sumTotal = 0
  for (let i = 0; i < 256; i++) sumTotal += i * hist[i]
  let sumBack = 0, wBack = 0, maxVar = 0, threshold = 128
  for (let t = 0; t < 256; t++) {
    wBack += hist[t]
    if (wBack === 0) continue
    const wFore = total - wBack
    if (wFore === 0) break
    sumBack += t * hist[t]
    const mBack = sumBack / wBack
    const mFore = (sumTotal - sumBack) / wFore
    const v = wBack * wFore * (mBack - mFore) ** 2
    if (v > maxVar) { maxVar = v; threshold = t }
  }
  return threshold
}

/** Aplicar binarización con un umbral dado a un ImageData */
function aplicarBinarizacion(canvas: HTMLCanvasElement, gray: Uint8Array, threshold: number, invertir: boolean): void {
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imgData.data
  let black = 0, white = 0
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const val = gray[j] > threshold ? 255 : 0
    if (val === 0) black++; else white++
    d[i] = val; d[i + 1] = val; d[i + 2] = val
  }
  // Invertir si fondo oscuro o forzado
  if (invertir || black > white) {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

/** Variante 1: Original escalada + leve aumento de contraste */
function varianteOriginal(img: HTMLImageElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = escalarImagen(img)
    const ctx = canvas.getContext('2d')!
    // Leve boost de contraste
    ctx.filter = 'contrast(1.3) brightness(1.05)'
    ctx.drawImage(canvas, 0, 0)
    ctx.filter = 'none'
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Blob error')), 'image/png')
  })
}

/** Variante 2: Binarización Otsu clásica */
function varianteOtsu(img: HTMLImageElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = escalarImagen(img)
    const ctx = canvas.getContext('2d')!
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const gray = aGrises(imgData)
    const thr = umbralOtsu(gray)
    aplicarBinarizacion(canvas, gray, thr, false)
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Blob error')), 'image/png')
  })
}

/** Variante 3: Alto contraste + nitidez (para tickets desvaídos) */
function varianteAltoContraste(img: HTMLImageElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = escalarImagen(img)
    const ctx = canvas.getContext('2d')!
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = imgData.data
    // Escala de grises + estiramiento de histograma
    let min = 255, max = 0
    const gray: number[] = []
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
      gray.push(g)
      if (g < min) min = g
      if (g > max) max = g
    }
    const range = max - min || 1
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const stretched = Math.round(((gray[j] - min) / range) * 255)
      const val = stretched > 140 ? 255 : 0  // Umbral agresivo
      d[i] = val; d[i + 1] = val; d[i + 2] = val
    }
    ctx.putImageData(imgData, 0, 0)
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Blob error')), 'image/png')
  })
}

/** Variante 4: Binarización adaptativa local (ventana deslizante) para iluminación desigual */
function varianteAdaptativa(img: HTMLImageElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = escalarImagen(img)
    const ctx = canvas.getContext('2d')!
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const w = canvas.width, h = canvas.height
    const gray = aGrises(imgData)
    const d = imgData.data

    // Calcular imagen integral para media local rápida
    const integral = new Float64Array((w + 1) * (h + 1))
    for (let y = 0; y < h; y++) {
      let rowSum = 0
      for (let x = 0; x < w; x++) {
        rowSum += gray[y * w + x]
        integral[(y + 1) * (w + 1) + (x + 1)] = rowSum + integral[y * (w + 1) + (x + 1)]
      }
    }

    // Binarización adaptativa con ventana 25x25
    const winSize = Math.max(25, Math.round(Math.min(w, h) / 20))
    const halfWin = Math.floor(winSize / 2)
    const C = 10 // Constante de offset

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const x1 = Math.max(0, x - halfWin)
        const y1 = Math.max(0, y - halfWin)
        const x2 = Math.min(w - 1, x + halfWin)
        const y2 = Math.min(h - 1, y + halfWin)
        const count = (x2 - x1 + 1) * (y2 - y1 + 1)
        const sum = integral[(y2 + 1) * (w + 1) + (x2 + 1)]
                  - integral[y1 * (w + 1) + (x2 + 1)]
                  - integral[(y2 + 1) * (w + 1) + x1]
                  + integral[y1 * (w + 1) + x1]
        const mean = sum / count
        const idx = (y * w + x) * 4
        const val = gray[y * w + x] > (mean - C) ? 255 : 0
        d[idx] = val; d[idx + 1] = val; d[idx + 2] = val
      }
    }

    ctx.putImageData(imgData, 0, 0)
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Blob error')), 'image/png')
  })
}

/** Generar todas las variantes de una imagen para OCR */
function generarVariantesImagen(source: File | Blob): Promise<Blob[]> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      try {
        const variantes = await Promise.all([
          varianteOriginal(img),
          varianteOtsu(img),
          varianteAltoContraste(img),
          varianteAdaptativa(img),
        ])
        resolve(variantes)
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Error al cargar imagen'))
    img.src = URL.createObjectURL(source)
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
 * Detectar el país de origen del ticket basándose en pistas del texto.
 * Analiza: moneda, CUIT/RUT/RUC, empresas conocidas, palabras clave regionales.
 */
function detectarPais(texto: string): 'ARG' | 'CHL' | 'URY' | null {
  const t = texto.toUpperCase()

  // ────── Puntuación por país ──────
  let argScore = 0
  let chlScore = 0
  let uryScore = 0

  // ── ARGENTINA ──
  // Moneda
  if (/\bARS\b/.test(t)) argScore += 10
  if (/PESOS?\s*ARGENTINOS?/i.test(t)) argScore += 10
  // Identificadores fiscales
  if (/\bCUIT\b/.test(t)) argScore += 15
  if (/\bC\.?U\.?I\.?T\.?\b/.test(t)) argScore += 15
  if (/\bCAE\b/.test(t)) argScore += 10
  if (/\bAFIP\b/.test(t)) argScore += 15
  // Factura argentina
  if (/FACTURA\s*[ABC]/.test(t)) argScore += 10
  if (/TICKET\s*FACTURA/.test(t)) argScore += 8
  if (/NOTA\s*DE\s*CR[EÉ]DITO/.test(t)) argScore += 5
  // IVA argentino (21%, 10.5%, 27%)
  if (/IVA\s*21/.test(t)) argScore += 8
  if (/IVA\s*10[.,]5/.test(t)) argScore += 10
  if (/IVA\s*27/.test(t)) argScore += 10
  // Provincias / ciudades
  if (/BUENOS\s*AIRES|CABA|CORDOBA|ROSARIO|MENDOZA|TUCUMAN|SANTA\s*FE|ENTRE\s*RIOS|LA\s*PLATA|MAR\s*DEL\s*PLATA/i.test(t)) argScore += 8
  // Empresas comunes
  if (/YPF|SHELL|AXION|PUMA\s*ENERGY|VIALIDAD|AUBASA|AUTOPISTA/i.test(t)) argScore += 7
  // Peajes argentinos
  if (/AUSA|AUSOL|AUTOPISTAS?\s*DEL\s*SOL|CAMINOS?\s*DEL\s*RIO|COVICO|COVISUR/i.test(t)) argScore += 12
  // $ como moneda (compartido pero más probable ARG por contexto de la app)
  if (/\$\s*\d/.test(t)) argScore += 3
  // Responsable Inscripto / Monotributo
  if (/RESP\.?\s*INSCR|MONOTRIBUTO|CONSUMIDOR\s*FINAL/i.test(t)) argScore += 10
  // Ingresos Brutos
  if (/INGRESOS?\s*BRUTOS?|ING\.?\s*BR\.?/i.test(t)) argScore += 10

  // ── CHILE ──
  // Moneda
  if (/\bCLP\b/.test(t)) chlScore += 15
  if (/PESOS?\s*CHILENOS?/i.test(t)) chlScore += 15
  // Identificador fiscal
  if (/\bRUT\b/.test(t)) chlScore += 12
  if (/\bR\.?U\.?T\.?\b/.test(t)) chlScore += 12
  if (/\bSII\b/.test(t)) chlScore += 15
  if (/SERVICIO\s*DE\s*IMPUESTOS/i.test(t)) chlScore += 15
  // Boleta / Factura chilena
  if (/BOLETA\s*(ELECTR[OÓ]NICA|DE\s*VENTA)?/i.test(t)) chlScore += 8
  if (/GUIA\s*DE\s*DESPACHO/i.test(t)) chlScore += 10
  // IVA Chile (19%)
  if (/IVA\s*19/.test(t)) chlScore += 12
  // Ciudades / regiones
  if (/SANTIAGO|VALPARAI[SZ]O|CONCEPCI[OÓ]N|ANTOFAGASTA|TEMUCO|RANCAGUA|TALCA|ARICA|IQUIQUE/i.test(t)) chlScore += 10
  // Empresas / peajes Chile
  if (/COPEC|ENEX|PETROBRAS|TERPEL|AUTOPISTA\s*CENTRAL|COSTANERA\s*NORTE|VESPUCIO|RUTA\s*DEL\s*MAIPO/i.test(t)) chlScore += 10
  // TAG Chile
  if (/\bTAG\b|TELEPEAJE/i.test(t)) chlScore += 5
  // Peso chileno no usa decimales generalmente
  if (/COMUNA\s*DE/i.test(t)) chlScore += 8

  // ── URUGUAY ──
  // Moneda
  if (/\bUYU\b/.test(t)) uryScore += 15
  if (/PESOS?\s*URUGUAYOS?/i.test(t)) uryScore += 15
  if (/\bU\$S\b|\bUI\b/.test(t)) uryScore += 5
  // Identificador fiscal
  if (/\bRUC\b/.test(t)) uryScore += 10
  if (/\bR\.?U\.?C\.?\b/.test(t)) uryScore += 10
  if (/\bDGI\b/.test(t)) uryScore += 12
  if (/\bBPS\b/.test(t)) uryScore += 8
  if (/\bCFE\b/.test(t)) uryScore += 10 // Comprobante Fiscal Electrónico
  // IVA Uruguay (22%)
  if (/IVA\s*22/.test(t)) uryScore += 15
  // Ciudades
  if (/MONTEVIDEO|COLONIA|PUNTA\s*DEL\s*ESTE|SALTO|PAYSAND[UÚ]|RIVERA|MALDONADO|FRAY\s*BENTOS/i.test(t)) uryScore += 10
  // Empresas / peajes Uruguay
  if (/ANCAP|DUCSA|PETROBRAS|CORPORACI[OÓ]N\s*VIAL/i.test(t)) uryScore += 10
  // e-Ticket / e-Factura
  if (/e-?TICKET|e-?FACTURA|e-?BOLETA/i.test(t)) uryScore += 5
  // Departamento (división administrativa uruguaya)
  if (/DEPARTAMENTO\s*DE/i.test(t)) uryScore += 8

  console.log('Detección de país - Scores:', { ARG: argScore, CHL: chlScore, URY: uryScore })

  // Necesitamos al menos un puntaje mínimo para estar seguros
  const minScore = 5
  const maxScore = Math.max(argScore, chlScore, uryScore)

  if (maxScore < minScore) return null

  if (argScore >= chlScore && argScore >= uryScore) return 'ARG'
  if (chlScore >= argScore && chlScore >= uryScore) return 'CHL'
  return 'URY'
}

/**
 * Extraer el importe y descripción más probables de un texto OCR.
 * Estrategia multi-paso con alta tolerancia a errores de OCR.
 */
function extraerDatosDeTexto(texto: string): { importe: string; descripcionExtraida: string; fechaExtraida: string; paisDetectado: Pais | null } {
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

  // ────────── 6. Detectar país del ticket ──────────
  const paisDetectado = detectarPais(texto)

  return { importe: mejorImporteStr, descripcionExtraida, fechaExtraida, paisDetectado }
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
   * MOTOR OCR MULTI-PASADA ULTRA-PRECISO
   * Genera 4 variantes de la imagen, ejecuta OCR en cada una con distintos
   * modos de segmentación, y combina los resultados para máxima precisión.
   */
  const procesarImagenOCR = async (source: File | Blob, previewUrl?: string) => {
    try {
      setOcrProcessing(true)
      setOcrProgress(0)
      setOcrStatus('Preparando imagen...')
      setOcrRawText(null)
      setShowOcrResult(false)

      // Crear preview de la imagen original
      if (previewUrl) {
        setOcrPreview(previewUrl)
      } else {
        const reader = new FileReader()
        reader.onload = (e) => setOcrPreview(e.target?.result as string)
        reader.readAsDataURL(source)
      }

      // Paso 1: Generar múltiples variantes de la imagen
      setOcrStatus('Optimizando imagen (4 variantes)...')
      setOcrProgress(3)
      const variantes = await generarVariantesImagen(source)
      const nombresVariantes = ['Original mejorada', 'Binarización Otsu', 'Alto contraste', 'Binarización adaptativa']

      // Paso 2: Crear worker de Tesseract con español
      setOcrStatus('Iniciando motor de reconocimiento...')
      setOcrProgress(8)
      const worker = await createWorker('spa', 1, {
        logger: () => {} // silenciar logs individuales, manejamos progreso manualmente
      })
      workerRef.current = worker

      // Paso 3: Ejecutar OCR en cada variante con distintos PSM
      // PSM 6 = uniform block (bueno para tickets)
      // PSM 3 = fully automatic (bueno como fallback)
      const configs: Array<{ psm: number; nombre: string }> = [
        { psm: 6, nombre: 'Bloque uniforme' },
        { psm: 3, nombre: 'Auto-detección' },
      ]

      const resultados: Array<{ text: string; confidence: number; variante: string; config: string }> = []
      const totalPasadas = variantes.length * configs.length
      let pasadaActual = 0

      for (let vi = 0; vi < variantes.length; vi++) {
        for (const config of configs) {
          pasadaActual++
          const pct = 10 + Math.round((pasadaActual / totalPasadas) * 80)
          setOcrProgress(pct)
          setOcrStatus(`Leyendo: ${nombresVariantes[vi]} (${config.nombre}) [${pasadaActual}/${totalPasadas}]`)

          try {
            await worker.setParameters({
              tessedit_pageseg_mode: config.psm as any,
              preserve_interword_spaces: '1',
            })
            const { data: { text, confidence } } = await worker.recognize(variantes[vi])
            if (text.trim().length > 5) {
              resultados.push({
                text,
                confidence,
                variante: nombresVariantes[vi],
                config: config.nombre,
              })
              console.log(`[OCR] ${nombresVariantes[vi]} / ${config.nombre}: confianza=${confidence.toFixed(1)}%, chars=${text.length}`)
            }
          } catch (err) {
            console.warn(`[OCR] Error en ${nombresVariantes[vi]} / ${config.nombre}:`, err)
          }
        }
      }

      // Paso 4: Seleccionar el mejor resultado
      setOcrStatus('Analizando resultados...')
      setOcrProgress(92)

      if (resultados.length === 0) {
        throw new Error('No se pudo leer texto de ninguna variante')
      }

      // Ordenar por confianza y elegir el mejor
      resultados.sort((a, b) => b.confidence - a.confidence)

      // Usar el texto con mayor confianza como base
      const mejorTexto = resultados[0].text
      console.log(`\n[OCR] ★ Mejor resultado: ${resultados[0].variante} / ${resultados[0].config} (${resultados[0].confidence.toFixed(1)}%)`)
      console.log('--- BEST OCR TEXT ---')
      console.log(mejorTexto)
      console.log('--- END ---')

      // También intentar extraer datos de TODOS los resultados buenos
      // y usar el que consiga extraer más información
      const extracciones = resultados
        .filter(r => r.confidence > 30)
        .map(r => ({
          ...extraerDatosDeTexto(r.text),
          text: r.text,
          confidence: r.confidence,
          info: `${r.variante} / ${r.config}`,
        }))

      // Elegir la extracción que logró sacar importe (prioridad) + más datos
      let mejorExtraccion = extracciones[0]
      for (const ext of extracciones) {
        const score = (ext.importe ? 100 : 0) + (ext.fechaExtraida ? 20 : 0) + (ext.paisDetectado ? 15 : 0) + (ext.descripcionExtraida ? 10 : 0)
        const mejorScore = (mejorExtraccion.importe ? 100 : 0) + (mejorExtraccion.fechaExtraida ? 20 : 0) + (mejorExtraccion.paisDetectado ? 15 : 0) + (mejorExtraccion.descripcionExtraida ? 10 : 0)
        if (score > mejorScore || (score === mejorScore && ext.confidence > mejorExtraccion.confidence)) {
          mejorExtraccion = ext
        }
      }

      console.log(`[OCR] ★ Mejor extracción de: ${mejorExtraccion.info}`)
      setOcrRawText(mejorExtraccion.text)

      // Extraer datos del mejor resultado
      setOcrStatus('Cargando datos...')
      setOcrProgress(98)

      if (mejorExtraccion.importe) {
        setImporte(mejorExtraccion.importe)
        console.log('Importe extraído:', mejorExtraccion.importe)
      }
      if (mejorExtraccion.descripcionExtraida && !descripcion) {
        setDescripcion(mejorExtraccion.descripcionExtraida)
        console.log('Descripción extraída:', mejorExtraccion.descripcionExtraida)
      }
      if (mejorExtraccion.fechaExtraida) {
        setFecha(mejorExtraccion.fechaExtraida)
        console.log('Fecha extraída:', mejorExtraccion.fechaExtraida)
      }
      if (mejorExtraccion.paisDetectado) {
        setPais(mejorExtraccion.paisDetectado)
        console.log('País detectado:', mejorExtraccion.paisDetectado)
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
                ? (ocrStatus || `Procesando ${ocrProgress}%`)
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
