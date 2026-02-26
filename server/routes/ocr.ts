import { Router, Request, Response } from 'express'
import axios from 'axios'

const router = Router()

// Gemini 2.5 Flash — rápido, gratuito y multimodal
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// ════════════════════════════════════════════
// POST /api/ocr/scan
// Recibe imagen base64, usa Gemini para extraer datos del ticket
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
        error: 'API Key de Google no configurada. Contactá al administrador.'
      })
    }

    // Extraer el tipo MIME y el base64 puro
    const mimeMatch = image.match(/^data:(image\/\w+);base64,/)
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg'
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '')

    console.log('[OCR] Enviando imagen a Gemini 1.5 Flash...')
    console.log(`[OCR] Tamaño base64: ${(base64Image.length / 1024).toFixed(0)} KB`)

    // Prompt optimizado para extracción de datos de tickets + clasificación Softland
    const prompt = `Analizá esta imagen de un ticket/factura/recibo/comprobante de pago de una empresa de transporte de camiones.

Extraé los siguientes datos y devolvelos ÚNICAMENTE como JSON válido (sin markdown, sin \`\`\`, solo el JSON):

{
  "importe": (número decimal del TOTAL a pagar, el monto final más importante del ticket. Si hay "TOTAL", usá ese valor. Solo el número, sin símbolo de moneda),
  "fecha": (fecha de EMISIÓN o de la TRANSACCIÓN en formato YYYY-MM-DD. IMPORTANTE: usá la fecha en que se realizó la compra/pago, NO la fecha de vencimiento, NO la fecha de CAI, NO la fecha de validez. Buscá palabras como "Fecha:", "Fecha emisión:", "Date:", o la fecha que aparece al inicio del ticket junto con la hora. Si hay varias fechas, elegí la más antigua que corresponda a cuándo se hizo la operación. Devolvé "" si no se encuentra),
  "pais": (código de país: "ARG" para Argentina, "CHL" para Chile, "URY" para Uruguay, o "" si no se puede determinar. Detectalo por CUIT/AFIP/IVA 21%=Argentina, RUT/SII/IVA 19%=Chile, RUC/DGI/IVA 22%=Uruguay),
  "descripcion": (nombre del comercio o establecimiento, máximo 120 caracteres, o ""),
  "tipoProducto": (TIPPRO: código del tipo de producto según la tabla de abajo. OBLIGATORIO, nunca vacío),
  "codigoArticulo": (ARTCOD: código del artículo según la tabla de abajo. OBLIGATORIO, nunca vacío),
  "textoCompleto": (todo el texto visible en el ticket, preservando saltos de línea)
}

CONTEXTO: Estás procesando tickets de gastos de una empresa de transporte de camiones (viajes internacionales ARG/CHL/URY).

TABLA DE REFERENCIA DE ARTÍCULOS ACTIVOS (ordenados por frecuencia de uso):
TIPPRO   | ARTCOD | Descripción                        | U.M. | Palabras Clave                                         | Frecuencia
TARIFA   | 2      | Entrada / Salida (Migraciones)     | UN   | migración, frontera, entrada, salida, paso fronterizo  | 5569
TARIFA   | 5      | Peaje Argentino                    | UN   | peaje, autopista, ruta, tag, telepeaje                 | 4662
TARIFA   | 10     | Desinfección                       | UN   | desinfección, sanitario, fumigación                    | 3434
TARIFA   | 21     | Gastos en Frontera                 | UN   | frontera, comida en frontera, cambio, extras frontera  | 2574
TARIFA   | 1      | Tunel Inter. Ruta Nac 7 Camión     | UN   | túnel, ruta 7, cristo redentor                         | 1843
HONPRO   | 6      | Honorarios Profesionales           | UN   | honorarios, profesional, gestión                       | 478
HONPRO   | 4      | ATA - Agente Transporte Aduanero   | UN   | ata, agente aduanero, despachante                      | 224
NEUMAT   | 3      | Pinchadura y Rotación              | UN   | neumático, cubierta, rotación, pinchadura              | 157
TARIFA   | 14     | Gastos extras (Caja Camión)        | UN   | caja camión, varios, extras, misceláneos               | 245
TARIFA   | 12     | Viaticos Chofer                    | UN   | viático, comida, almuerzo, cena, alojamiento, estadía  | 120
TARIFA   | 3      | Entrada / Salida (Aduana)          | UN   | aduana, dga, afip, control aduanero                    | 77
TARIFA   | 7      | Iscamen - Control Sanitario        | UN   | iscamen, control sanitario, barrera                    | 41
NEUMAT   | 1      | Pinchadura                         | UN   | pinchadura, pinchazo, reparación neumático             | 37
NEUMAT   | 2      | Rotación                           | UN   | rotación, balanceo                                     | 30
TARIFA   | 8      | Sellados                           | UN   | sellado, tasa, timbre                                  | 22
TARIFA   | 4      | Peaje Chileno                      | UN   | peaje chile, tag chile, ruta chile                     | 20
HONPRO   | 2      | Gestiones Aduaneras                | UN   | gestión aduanera, trámite                              | 12
TARIFA   | 6      | Peaje Uruguayo                     | UN   | peaje uruguay, ruta uruguay                            | 5
TARIFA   | 13     | Estacionamiento / Aparcadero       | UN   | estacionamiento, parking, aparcadero                   | 5
TARIFA   | 11     | Senasa                             | UN   | senasa, sanidad vegetal                                | 2
SERVIC   | 3      | Falso Flete                        | UN   | falso flete                                            | 2
HONPRO   | 5      | Alquiler Predio Docwell            | UN   | alquiler, predio, docwell                              | 2
HONPRO   | 3      | Servicios Aduaneros                | UN   | servicio aduanero                                      | 1
COMBLU   | 3      | Urea 32% Adblue                    | LT   | urea, adblue, def                                      | 1
COMBLU   | 9      | Aceite Hidraulico Dexron II         | LT   | aceite, lubricante, dexron                              | 1

REGLAS DE CLASIFICACIÓN (OBLIGATORIAS):
1. NUNCA uses HONPRO con ARTCOD "1" — está OBSOLETO.
2. Si el ticket dice "Peaje", "autopista", "tag", "telepeaje" → TARIFA/5 (peaje argentino). Si es de Chile → TARIFA/4. Si es de Uruguay → TARIFA/6.
3. Si dice "migración", "entrada", "salida", "paso fronterizo" → TARIFA/2.
4. Si dice "desinfección", "sanitario", "fumigación" → TARIFA/10.
5. Si dice "túnel", "ruta 7", "cristo redentor" → TARIFA/1.
6. Si es comida, restaurante, almuerzo, cena, viático → TARIFA/12 (Viáticos Chofer).
7. Si dice "frontera" y son gastos varios en la frontera (no migración ni aduana) → TARIFA/21.
8. Si dice "aduana", "DGA", "AFIP", "control aduanero" → TARIFA/3.
9. Si dice "iscamen", "control sanitario" → TARIFA/7.
10. Si dice "neumático", "cubierta", "pinchadura" → NEUMAT/3.
11. Si dice "urea", "adblue" → COMBLU/3.
12. Si dice "aceite", "lubricante" → COMBLU/9.
13. Si dice "honorarios", "gestor" → HONPRO/6.
14. Si dice "ATA", "agente aduanero", "despachante" → HONPRO/4.
15. Si el ticket menciona litros (LT), SOLO puede ser COMBLU.
16. Si hay ambigüedad entre dos opciones, priorizá la de mayor frecuencia.
17. FALLBACK: Si no hay coincidencia clara, usá TARIFA/14 (Gastos extras). NUNCA dejes tipoProducto ni codigoArticulo vacíos.

REGLAS DE EXTRACCIÓN:
- El "importe" debe ser el TOTAL FINAL del ticket (total a pagar, no subtotales ni IVA por separado)
- Si hay múltiples totales, elegí el más grande que represente el total a pagar
- FECHA: Extraé ÚNICAMENTE la fecha de emisión/transacción (cuándo se pagó). IGNORÁ completamente: fechas de vencimiento, "Vto", "Venc", "Válido hasta", "CAI Vto", "Fecha CAI". Si el ticket tiene una fecha junto a la hora (ej: "15/03/2025 14:32"), esa es la fecha de la transacción. Si hay varias fechas, usá la que está al principio del ticket o junto a "Fecha:" / "Date:" / "Emisión:"
- La fecha debe estar en formato YYYY-MM-DD
- Para el país, basate en indicadores fiscales (CUIT, RUT, RUC, tipo de IVA, etc.)
- Respondé SOLO con el JSON, nada más`

    const geminiResponse = await axios.post(
      `${GEMINI_API_URL}?key=${apiKey}`,
      {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Image
                }
              },
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    )

    // Extraer la respuesta de Gemini (buscar la parte con texto, no thinking)
    const parts = geminiResponse.data?.candidates?.[0]?.content?.parts || []
    const textPart = parts.find((p: any) => p.text !== undefined)
    const geminiText = textPart?.text || ''

    console.log('[OCR] Respuesta de Gemini:')
    console.log('─'.repeat(50))
    console.log(geminiText)
    console.log('─'.repeat(50))

    if (!geminiText.trim()) {
      return res.json({
        success: true,
        rawText: '',
        datos: { importe: '', fecha: '', pais: '', descripcion: '' },
        mensaje: 'No se pudo leer el ticket. Intentá con una foto más clara.'
      })
    }

    // Parsear el JSON de la respuesta de Gemini
    let jsonStr = geminiText.trim()
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')

    let datos: any = {}
    try {
      datos = JSON.parse(jsonStr)
    } catch (parseErr) {
      console.warn('[OCR] Error parseando JSON de Gemini, intentando extraer...')
      console.warn('[OCR] Texto recibido:', jsonStr)

      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          datos = JSON.parse(jsonMatch[0])
        } catch {
          console.error('[OCR] No se pudo parsear el JSON de Gemini')
          return res.json({
            success: true,
            rawText: geminiText,
            datos: { importe: '', fecha: '', pais: '', descripcion: '' },
            mensaje: 'Se leyó el ticket pero no se pudieron extraer los datos automáticamente.'
          })
        }
      }
    }

    // Normalizar los datos
    const resultado = {
      importe: datos.importe ? String(datos.importe) : '',
      fecha: datos.fecha || '',
      pais: datos.pais || '',
      descripcion: datos.descripcion || '',
      tipoProducto: datos.tipoProducto || '',
      codigoArticulo: datos.codigoArticulo ? String(datos.codigoArticulo) : '',
    }

    const rawText = datos.textoCompleto || geminiText

    console.log('[OCR] Datos extraídos por Gemini:', {
      importe: resultado.importe,
      fecha: resultado.fecha,
      pais: resultado.pais,
      descripcion: resultado.descripcion?.substring(0, 50),
      tipoProducto: resultado.tipoProducto,
      codigoArticulo: resultado.codigoArticulo
    })

    return res.json({
      success: true,
      rawText,
      datos: resultado,
      mensaje: 'Ticket leído correctamente'
    })

  } catch (error: any) {
    console.error('[OCR] Error:', error.message)

    if (error.response) {
      console.error('[OCR] Gemini API Status:', error.response.status)
      console.error('[OCR] Gemini API Error:', JSON.stringify(error.response.data?.error || error.response.data))

      if (error.response.status === 400) {
        return res.status(400).json({
          success: false,
          error: 'La imagen no pudo ser procesada. Intentá con otra foto.',
          details: error.response.data?.error?.message
        })
      }
      if (error.response.status === 403) {
        return res.status(500).json({
          success: false,
          error: 'API Key sin permisos. Verificá que la Generative Language API esté habilitada en Google Cloud.',
          details: error.response.data?.error?.message
        })
      }
      if (error.response.status === 429) {
        return res.status(429).json({
          success: false,
          error: 'Demasiadas solicitudes. Esperá un momento e intentá de nuevo.',
          details: error.response.data?.error?.message
        })
      }
    }

    return res.status(500).json({
      success: false,
      error: 'Error al procesar la imagen',
      details: error.response?.data?.error?.message || error.message
    })
  }
})

export default router
