import { Router, Request, Response } from 'express'
import axios from 'axios'

const router = Router()

const GOOGLE_VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate'

// ────────────────────────────────────────────
// Utilidades de extracción de datos de tickets
// ────────────────────────────────────────────

/** Normalizar un string numérico con formatos regionales a float */
function normalizarNumero(str: string): number {
  let s = str.replace(/[^\d.,]/g, '')
  const puntos = (s.match(/\./g) || []).length
  const comas = (s.match(/,/g) || []).length

  // 1.234,56 → argentino/europeo
  if (puntos >= 1 && comas === 1) {
    s = s.replace(/\./g, '').replace(',', '.')
    return parseFloat(s)
  }
  // 1,234.56 → US
  if (comas >= 1 && puntos === 1) {
    s = s.replace(/,/g, '')
    return parseFloat(s)
  }
  // Solo coma como decimal: 1234,56
  if (comas === 1 && puntos === 0) {
    const despues = s.split(',')[1]
    if (despues && despues.length <= 2) {
      s = s.replace(',', '.')
    } else {
      s = s.replace(',', '')
    }
    return parseFloat(s)
  }
  // Solo punto como decimal: 1234.56
  if (puntos === 1 && comas === 0) {
    const despues = s.split('.')[1]
    // Si tiene 3 dígitos después del punto, es separador de miles
    if (despues && despues.length === 3) {
      s = s.replace('.', '')
    }
    return parseFloat(s)
  }
  // Múltiples puntos (miles): 1.234.567
  if (puntos >= 2) s = s.replace(/\./g, '')
  // Múltiples comas: 1,234,567
  if (comas >= 2) s = s.replace(/,/g, '')

  return parseFloat(s) || 0
}

/** Detectar país del ticket con sistema de puntuación */
function detectarPais(texto: string): string {
  const t = texto.toUpperCase()
  const scores: Record<string, number> = { ARG: 0, CHL: 0, URY: 0 }

  // ── ARGENTINA ──
  if (/\bCUIT\b|C\.?U\.?I\.?T\.?/.test(t)) scores.ARG += 15
  if (/\bAFIP\b/.test(t)) scores.ARG += 15
  if (/\bCAE\b/.test(t)) scores.ARG += 10
  if (/FACTURA\s*[ABC]/.test(t)) scores.ARG += 10
  if (/TICKET\s*FACTURA/.test(t)) scores.ARG += 8
  if (/RESP\.?\s*INSCRI|MONOTRIBUTO|CONSUMIDOR\s*FINAL/.test(t)) scores.ARG += 10
  if (/INGRESOS?\s*BRUTOS?|ING\.?\s*BR\.?/.test(t)) scores.ARG += 10
  if (/IVA\s*21/.test(t)) scores.ARG += 8
  if (/IVA\s*10[.,]5/.test(t)) scores.ARG += 10
  if (/IVA\s*27/.test(t)) scores.ARG += 10
  if (/YPF|AXION|PUMA\s*ENERGY/.test(t)) scores.ARG += 7
  if (/AUSA|AUSOL|AUBASA|AUTOPISTAS?\s*DEL\s*SOL|COVICO|COVISUR/.test(t)) scores.ARG += 12
  if (/BUENOS\s*AIRES|CABA|C[OÓ]RDOBA|ROSARIO|MENDOZA|TUCUM[AÁ]N|SANTA\s*FE|LA\s*PLATA|MAR\s*DEL\s*PLATA/.test(t)) scores.ARG += 8
  if (/\bARS\b|PESOS?\s*ARGENTINOS?/.test(t)) scores.ARG += 10
  if (/\$\s*\d/.test(t)) scores.ARG += 3

  // ── CHILE ──
  if (/\bRUT\b|R\.?U\.?T\.?/.test(t) && !/R\.?U\.?C/.test(t)) scores.CHL += 12
  if (/\bSII\b|SERVICIO\s*DE\s*IMPUESTOS/.test(t)) scores.CHL += 15
  if (/BOLETA\s*(ELECTR[OÓ]NICA)?/.test(t)) scores.CHL += 8
  if (/IVA\s*19/.test(t)) scores.CHL += 12
  if (/COPEC|ENEX|TERPEL/.test(t)) scores.CHL += 10
  if (/SANTIAGO|VALPARAI[SZ]O|CONCEPCI[OÓ]N|ANTOFAGASTA/.test(t)) scores.CHL += 10
  if (/\bCLP\b|PESOS?\s*CHILENOS?/.test(t)) scores.CHL += 15
  if (/GU[IÍ]A\s*DE\s*DESPACHO/.test(t)) scores.CHL += 10
  if (/COMUNA\s*DE/.test(t)) scores.CHL += 8

  // ── URUGUAY ──
  if (/\bRUC\b|R\.?U\.?C\.?/.test(t)) scores.URY += 10
  if (/\bDGI\b/.test(t)) scores.URY += 12
  if (/\bBPS\b/.test(t)) scores.URY += 8
  if (/\bCFE\b/.test(t)) scores.URY += 10
  if (/IVA\s*22/.test(t)) scores.URY += 15
  if (/ANCAP|DUCSA/.test(t)) scores.URY += 10
  if (/MONTEVIDEO|COLONIA|PUNTA\s*DEL\s*ESTE|MALDONADO|PAYSAND[UÚ]/.test(t)) scores.URY += 10
  if (/\bUYU\b|PESOS?\s*URUGUAYOS?/.test(t)) scores.URY += 15
  if (/e-?TICKET|e-?FACTURA/.test(t)) scores.URY += 5
  if (/DEPARTAMENTO\s*DE/.test(t)) scores.URY += 8

  console.log('[OCR] País scores:', scores)
  const ganador = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  return ganador[1] >= 5 ? ganador[0] : ''
}

/** Extraer datos estructurados de un texto de ticket */
function extraerDatosDeTicket(textoCompleto: string) {
  const lines = textoCompleto.split('\n').map(l => l.trim()).filter(Boolean)
  const textoJoined = lines.join(' ')

  // ─── IMPORTE ───
  let importe = 0
  let mejorPrioridad = -1

  const patronesTotal: Array<{ regex: RegExp; prioridad: number }> = [
    { regex: /total\s*(?:a\s*pagar|final|general)?[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 100 },
    { regex: /tot[ai]l[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 95 },
    { regex: /t[o0]tal[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 90 },
    { regex: /importe\s*(?:total|final|neto)?[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 85 },
    { regex: /monto\s*(?:total|final)?[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 75 },
    { regex: /a\s*pagar[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 70 },
    { regex: /tarifa[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 60 },
    { regex: /peaje[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 60 },
    { regex: /neto[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 55 },
    { regex: /sub\s*total[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 45 },
    { regex: /valor[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 40 },
    { regex: /precio[\s:=$.]*(\d[\d.,]*\d|\d)/i, prioridad: 35 },
  ]

  const bloques = [textoJoined, ...lines]
  for (const bloque of bloques) {
    for (const { regex, prioridad } of patronesTotal) {
      const match = bloque.match(regex)
      if (match && match[1]) {
        const num = normalizarNumero(match[1])
        if (!isNaN(num) && num > 0 && num < 100000000 && prioridad > mejorPrioridad) {
          mejorPrioridad = prioridad
          importe = num
        }
      }
    }
  }

  // Fallback: número con $ delante (el más grande)
  if (importe === 0) {
    const candidatos: number[] = []
    const regPesos = /\$\s*(\d[\d.,]*\d|\d)/g
    let m
    while ((m = regPesos.exec(textoJoined)) !== null) {
      const num = normalizarNumero(m[1])
      if (!isNaN(num) && num > 0 && num < 100000000) candidatos.push(num)
    }
    if (candidatos.length > 0) importe = Math.max(...candidatos)
  }

  // Último recurso: número más grande (excluyendo CUIT, fechas, etc.)
  if (importe === 0) {
    const candidatos: number[] = []
    const regNums = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g
    let m
    while ((m = regNums.exec(textoJoined)) !== null) {
      const raw = m[1].replace(/[.,]/g, '')
      if (raw.length > 8) continue // Probablemente CUIT o similar
      const num = normalizarNumero(m[1])
      if (!isNaN(num) && num > 0 && num < 100000000) {
        // Verificar que no sea de una línea con CUIT, CAE, etc.
        const lineaContexto = lines.find(l => l.includes(m![1]))
        if (lineaContexto && /CUIT|CAE|DNI|PUNTO\s*DE\s*VENTA|TEL[EÉ]FONO|C[OÓ]DIGO|N[°ºU]M/i.test(lineaContexto)) continue
        candidatos.push(num)
      }
    }
    if (candidatos.length > 0) importe = Math.max(...candidatos)
  }

  // ─── FECHA ───
  let fecha = ''
  const patronesFecha = [
    /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/,
    /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})/,
  ]
  for (const line of lines) {
    for (const rx of patronesFecha) {
      const match = line.match(rx)
      if (match) {
        const dia = match[1].padStart(2, '0')
        const mes = match[2].padStart(2, '0')
        let anio = match[3]
        if (anio.length === 2) anio = '20' + anio
        const diaNum = parseInt(dia), mesNum = parseInt(mes)
        if (diaNum >= 1 && diaNum <= 31 && mesNum >= 1 && mesNum <= 12) {
          fecha = `${anio}-${mes}-${dia}`
          break
        }
      }
    }
    if (fecha) break
  }

  // ─── DESCRIPCIÓN (nombre del comercio) ───
  const lineasUtiles = lines.filter(l => {
    if (l.length < 4 || l.length > 80) return false
    if (/^[\d\s.,/$%:=\-*#]+$/.test(l)) return false
    if (/^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}/.test(l)) return false
    if (/^(total|subtotal|importe|monto|iva|neto|bruto|efectivo|cambio|cuit|cae|vencimiento|fecha|hora)/i.test(l)) return false
    return true
  })
  const descripcion = lineasUtiles.slice(0, 2).join(' - ').substring(0, 120)

  // ─── PAÍS ───
  const pais = detectarPais(textoCompleto)

  return { importe, fecha, pais, descripcion, textoCompleto }
}

// ════════════════════════════════════════════
// POST /api/ocr/scan
// Recibe imagen base64, llama a Google Cloud Vision, extrae datos
// ════════════════════════════════════════════
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const { image } = req.body

    if (!image) {
      return res.status(400).json({ success: false, error: 'No se envió imagen' })
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY
    if (!apiKey) {
      console.error('[OCR] GOOGLE_VISION_API_KEY no configurada')
      return res.status(500).json({
        success: false,
        error: 'Google Vision API no configurada. Contactá al administrador.'
      })
    }

    // Limpiar prefijo data:image/... del base64
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '')

    console.log('[OCR] Enviando imagen a Google Vision API...')
    console.log(`[OCR] Tamaño base64: ${(base64Image.length / 1024).toFixed(0)} KB`)

    // Llamar a Google Cloud Vision con TEXT_DETECTION + DOCUMENT_TEXT_DETECTION
    const visionResponse = await axios.post(
      `${GOOGLE_VISION_API_URL}?key=${apiKey}`,
      {
        requests: [
          {
            image: { content: base64Image },
            features: [
              { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
            ],
            imageContext: {
              languageHints: ['es', 'en']
            }
          }
        ]
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    )

    const result = visionResponse.data?.responses?.[0]

    if (result?.error) {
      console.error('[OCR] Google Vision error:', result.error)
      return res.status(500).json({
        success: false,
        error: result.error.message || 'Error de Google Vision'
      })
    }

    // Obtener texto completo (DOCUMENT_TEXT_DETECTION da mejor estructura)
    const textoCompleto = result?.fullTextAnnotation?.text
      || result?.textAnnotations?.[0]?.description
      || ''

    if (!textoCompleto.trim()) {
      console.log('[OCR] No se detectó texto en la imagen')
      return res.json({
        success: true,
        datos: { importe: 0, fecha: '', pais: '', descripcion: '', textoCompleto: '' },
        mensaje: 'No se detectó texto en la imagen. Intentá con una foto más clara.'
      })
    }

    console.log('[OCR] Texto detectado por Google Vision:')
    console.log('─'.repeat(50))
    console.log(textoCompleto)
    console.log('─'.repeat(50))

    // Extraer datos estructurados del texto
    const datos = extraerDatosDeTicket(textoCompleto)

    console.log('[OCR] Datos extraídos:', {
      importe: datos.importe,
      fecha: datos.fecha,
      pais: datos.pais,
      descripcion: datos.descripcion?.substring(0, 50)
    })

    return res.json({
      success: true,
      datos,
      mensaje: 'Ticket leído correctamente'
    })

  } catch (error: any) {
    console.error('[OCR] Error:', error.message)

    if (error.response) {
      console.error('[OCR] Google API Status:', error.response.status)
      console.error('[OCR] Google API Error:', JSON.stringify(error.response.data?.error || error.response.data))
    }

    return res.status(500).json({
      success: false,
      error: 'Error al procesar la imagen',
      details: error.response?.data?.error?.message || error.message
    })
  }
})

export default router
