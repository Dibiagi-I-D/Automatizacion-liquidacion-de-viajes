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
  "formalidad": (clasificación fiscal: "FORMAL" o "INFORMAL". Ver reglas de formalidad abajo. OBLIGATORIO, nunca vacío),
  "proveedor": (nombre o razón social del proveedor/emisor del ticket, máximo 120 caracteres. Si no se puede identificar, devolvé ""),
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

REGLAS DE FORMALIDAD (OBLIGATORIAS):
La formalidad determina el tratamiento fiscal del IVA. Solo hay DOS valores posibles: "FORMAL" o "INFORMAL".

Es FORMAL cuando:
- El ticket tiene IVA discriminado (línea "IVA 21%: $XXX" o "IVA 10.5%")
- Tiene CUIT del emisor (formato XX-XXXXXXXX-X)
- Tiene CAE (Código de Autorización Electrónico)
- Dice "FACTURA A" o "FACTURA B"
- Es de un proveedor grande/oficial (autopistas, organismos gubernamentales, estaciones de servicio)
- Tiene QR de AFIP

Es INFORMAL cuando:
- No discrimina IVA (solo monto total sin desglose)
- Dice "Monotributo" o "IVA no discriminado"
- Es ticket manuscrito o recibo simple
- Dice "FACTURA C" (consumidor final)
- Son gastos menores (comidas, propinas, cambios de moneda, estacionamientos informales)
- No aparece CUIT ni datos fiscales del emisor

Guía probabilística por artículo (usar cuando no hay señales claras en el ticket):
- TARIFA/1 (Túnel Cristo Redentor): 99% FORMAL → por defecto FORMAL
- TARIFA/2 (Migraciones): 96% FORMAL → si tiene CAE→FORMAL, si no→INFORMAL
- TARIFA/3 (Aduana): 96% FORMAL → por defecto FORMAL (organismo oficial)
- TARIFA/5 (Peaje ARG): 94% FORMAL → si tiene IVA discriminado→FORMAL, si no→INFORMAL
- TARIFA/10 (Desinfección): 90% FORMAL → si organismo oficial→FORMAL, si no→INFORMAL
- TARIFA/4 (Peaje CHL): por defecto FORMAL
- TARIFA/6 (Peaje URY): por defecto FORMAL
- TARIFA/7 (Iscamen): 12% FORMAL → si sello oficial→FORMAL, si no→INFORMAL
- TARIFA/8 (Sellados): por defecto INFORMAL
- TARIFA/11 (Senasa): por defecto FORMAL (organismo oficial)
- TARIFA/12 (Viáticos): 8% FORMAL → por defecto INFORMAL
- TARIFA/13 (Estacionamiento): por defecto INFORMAL
- TARIFA/14 (Gastos extras): 14% FORMAL → por defecto INFORMAL
- TARIFA/21 (Gastos Frontera): 2% FORMAL → por defecto INFORMAL
- HONPRO/4 (ATA): 8% FORMAL → si tiene CUIT y CAE→FORMAL, si no→INFORMAL
- HONPRO/6 (Honorarios): 6% FORMAL → por defecto INFORMAL
- HONPRO/2 (Gestiones Aduaneras): por defecto INFORMAL
- HONPRO/3 (Servicios Aduaneros): por defecto INFORMAL
- HONPRO/5 (Alquiler Docwell): por defecto INFORMAL
- NEUMAT/1,2,3 (Neumáticos): 1% FORMAL → por defecto INFORMAL
- COMBLU/3,9 (Combustibles/Lubricantes): si tiene factura→FORMAL, si no→INFORMAL
- SERVIC/3 (Falso Flete): por defecto INFORMAL
NUNCA devuelvas "MIXTO" — siempre decidí entre FORMAL o INFORMAL.

REGLAS DE PROVEEDOR:
Identificá al proveedor/emisor del ticket. La empresa tiene proveedores recurrentes. Usá esta tabla para mapear lo que ves en el ticket al proveedor correcto.

TABLA COMPLETA DE PROVEEDORES (ordenados por frecuencia de uso):
Cta | Proveedor                                  | Registros | Categoría Típica | Formalidad | Palabras clave en el ticket
103 | Dirección Nacional de Migraciones           | 5515      | TARIFA-2         | FORMAL     | migraciones, DNM, entrada, salida, paso fronterizo
03  | Autopistas del Sol / Ausol                  | 4878      | TARIFA-5         | FORMAL     | autopista del sol, ausol, peaje, autopista
404 | SENASA - Servicio Desinfección              | 2151      | TARIFA-10        | FORMAL     | senasa, desinfección, fumigación, servicio sanitario
8   | Red de Peajes Varios                        | 2085      | TARIFA-5         | FORMAL     | peaje, ruta, telepeaje, tag, vialidad
13  | Túnel Cristo Redentor Concesión             | 1842      | TARIFA-1         | FORMAL     | túnel, cristo redentor, ruta 7, paso los libertadores
177 | ATA / Despachantes de Aduana                | 1754      | HONPRO-4         | INFORMAL   | ata, agente aduanero, despachante, aduana
142 | Gestores / Profesionales Varios             | 1307      | HONPRO-6         | INFORMAL   | honorarios, gestor, profesional, trámite
00  | Proveedores Informales Genéricos            | 176       | TARIFA-14        | INFORMAL   | (sin datos fiscales, tickets sin razón social)
410 | Concesionaria Peaje Mendoza                 | 150       | TARIFA-5         | FORMAL     | peaje mendoza, ruta mendoza
210 | Gomerías / Servicios Neumáticos             | 157       | NEUMAT-3         | INFORMAL   | gomería, pinchadura, neumático, cubierta
305 | Iscamen - Control Fitosanitario             | 41        | TARIFA-7         | INFORMAL   | iscamen, barrera sanitaria, control fitosanitario
500 | Restaurantes / Comidas en ruta              | 120       | TARIFA-12        | INFORMAL   | restaurante, comedor, parador, almuerzo, cena
600 | Estacionamientos                            | 5         | TARIFA-13        | INFORMAL   | estacionamiento, parking, cochera
700 | Docwell / Alquileres                        | 2         | HONPRO-5         | INFORMAL   | docwell, alquiler, predio
800 | Servicios Aduaneros Varios                  | 1         | HONPRO-3         | INFORMAL   | servicio aduanero, gestión aduanera

INSTRUCCIONES DE DETECCIÓN DE PROVEEDOR:
1. Buscá la RAZÓN SOCIAL o NOMBRE COMERCIAL del emisor en el ticket (ej: "AUTOPISTAS DEL SOL S.A.", "YPF S.A.")
2. Buscá el CUIT del emisor (formato XX-XXXXXXXX-X) y su nombre asociado
3. Buscá logos, marcas o sellos visibles
4. RELACIÓN INTELIGENTE: Cruzá la información del proveedor con el artículo clasificado:
   - Si clasificaste como TARIFA/2 (Migraciones) → el proveedor probablemente es "Dirección Nacional de Migraciones"
   - Si clasificaste como TARIFA/5 (Peaje ARG) → buscá el nombre de la autopista/concesionaria en el ticket
   - Si clasificaste como TARIFA/10 (Desinfección) → el proveedor probablemente es "SENASA" o el organismo sanitario
   - Si clasificaste como TARIFA/1 (Túnel) → el proveedor es "Túnel Cristo Redentor"
   - Si clasificaste como HONPRO/4 (ATA) → buscá el nombre del despachante/agente aduanero
   - Si clasificaste como HONPRO/6 (Honorarios) → buscá el nombre del profesional/gestor
   - Si clasificaste como NEUMAT → buscá el nombre de la gomería
   - Si clasificaste como TARIFA/12 (Viáticos) → buscá el nombre del restaurante/comercio
   - Si clasificaste como TARIFA/3 (Aduana) → "Aduana" o "DGA" o la oficina aduanera
   - Si clasificaste como TARIFA/7 (Iscamen) → "ISCAMEN"
   - Si clasificaste como TARIFA/11 (Senasa) → "SENASA"
5. COHERENCIA: El proveedor, el artículo y la formalidad deben ser coherentes entre sí. Ejemplo: si el proveedor es "Dirección Nacional de Migraciones", el artículo debe ser TARIFA/2 y la formalidad FORMAL.
6. Si no podés identificar al proveedor con certeza, devolvé "" (vacío). NO inventes nombres.

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
      formalidad: (datos.formalidad === 'FORMAL' || datos.formalidad === 'INFORMAL') ? datos.formalidad : 'INFORMAL',
      proveedor: datos.proveedor || '',
    }

    const rawText = datos.textoCompleto || geminiText

    console.log('[OCR] Datos extraídos por Gemini:', {
      importe: resultado.importe,
      fecha: resultado.fecha,
      pais: resultado.pais,
      descripcion: resultado.descripcion?.substring(0, 50),
      tipoProducto: resultado.tipoProducto,
      codigoArticulo: resultado.codigoArticulo,
      formalidad: resultado.formalidad,
      proveedor: resultado.proveedor?.substring(0, 50),
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
