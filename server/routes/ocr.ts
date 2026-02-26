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
  "fecha": (fecha en formato YYYY-MM-DD, o "" si no se encuentra),
  "pais": (código de país: "ARG" para Argentina, "CHL" para Chile, "URY" para Uruguay, o "" si no se puede determinar. Detectalo por CUIT/AFIP/IVA 21%=Argentina, RUT/SII/IVA 19%=Chile, RUC/DGI/IVA 22%=Uruguay),
  "descripcion": (nombre del comercio o establecimiento, máximo 120 caracteres, o ""),
  "tipoProducto": (código del tipo de producto según la tabla de abajo, o ""),
  "codigoArticulo": (código del artículo según la tabla de abajo, o ""),
  "textoCompleto": (todo el texto visible en el ticket, preservando saltos de línea)
}

TABLA DE CONCEPTOS PARA CLASIFICACIÓN:
Usá esta tabla para mapear el contenido del ticket al tipoProducto y codigoArticulo correctos:

| tipoProducto | codigoArticulo | Descripción                  |
|-------------|----------------|-------------------------------|
| COMBLU      | 1              | Gasoil                        |
| COMBLU      | 2              | Nafta                         |
| COMBLU      | 3              | Lubricante                    |
| COMBLU      | 4              | GNC                           |
| COMBLU      | 5              | AdBlue / Urea                 |
| TARIFA      | 5              | Peaje                         |
| TARIFA      | 6              | Balanza                       |
| TARIFA      | 7              | Gastos en Frontera            |
| TARIFA      | 8              | Cruce de Frontera             |
| TARIFA      | 9              | Estacionamiento               |
| TARIFA      | 10             | Lavado de Unidad              |
| HONPRO      | 2              | Despachante de Aduana         |
| HONPRO      | 3              | Gestión Documental            |
| REPUES      | 1              | Neumáticos / Cubiertas        |
| REPUES      | 2              | Filtros                       |
| REPUES      | 3              | Repuesto General              |
| VIATIC      | 1              | Comida / Almuerzo / Cena      |
| VIATIC      | 2              | Hotel / Alojamiento           |
| VIATIC      | 3              | Viático General               |
| VARIOS      | 1              | Teléfono / Comunicaciones     |
| VARIOS      | 2              | Materiales de Limpieza        |
| VARIOS      | 99             | Otro Gasto                    |

REGLAS DE CLASIFICACIÓN:
- NUNCA uses HONPRO con codigoArticulo "1" (está obsoleto)
- Si el ticket dice "Peaje" o "Toll", usá TARIFA/5
- Si el ticket dice "Gasoil", "Diesel", "Gas Oil", usá COMBLU/1
- Si el ticket dice "Nafta", "Bencina", "Gasolina", usá COMBLU/2
- Si es un restaurante, bar, comida, usá VIATIC/1
- Si es un hotel, hostel, alojamiento, usá VIATIC/2
- Si es una gomería, cubierta, neumático, usá REPUES/1
- Si es una estación de servicio o expendedora de combustible, usá COMBLU/1
- Si es un lavadero de vehículos, usá TARIFA/10
- IMPORTANTE: SIEMPRE debés clasificar el ticket. Si no podés determinar la categoría exacta, usá VARIOS/99 como fallback. NUNCA dejes tipoProducto ni codigoArticulo vacíos.

REGLAS DE EXTRACCIÓN:
- El "importe" debe ser el TOTAL FINAL del ticket (total a pagar, no subtotales ni IVA por separado)
- Si hay múltiples totales, elegí el más grande que represente el total a pagar
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
