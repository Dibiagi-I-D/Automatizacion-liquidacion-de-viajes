import { Router, Request, Response } from 'express'
import axios from 'axios'
import { obtenerAccessToken } from '../services/googleAuthService.js'

const router = Router()

const SPEECH_API_URL = 'https://speech.googleapis.com/v1/speech:recognize'

/**
 * Codificaciones de audio que acepta Google Speech-to-Text y que además puede
 * generar un navegador. Se mapea desde el mimeType que informa el MediaRecorder
 * del celular, porque cada uno graba en lo suyo.
 */
const ENCODINGS: Record<string, string> = {
  'audio/webm': 'WEBM_OPUS',
  'audio/ogg': 'OGG_OPUS',
  'audio/wav': 'LINEAR16',
  'audio/x-wav': 'LINEAR16',
  'audio/flac': 'FLAC',
}

/** Sync recognize admite hasta 60 segundos; 10 MB es el tope de la request. */
const MAX_AUDIO_BYTES = 10 * 1024 * 1024

function encodingPara(mime: string): string | null {
  const base = String(mime || '').split(';')[0].trim().toLowerCase()
  return ENCODINGS[base] || null
}

/**
 * POST /api/voz/transcribir
 * Recibe un audio grabado en el celular y devuelve el texto.
 *
 * Pensado para que el chofer dicte el prediagnóstico en vez de escribirlo: en
 * la ruta, con guantes y apurado, dictar es mucho más rápido que tipear en un
 * teclado táctil.
 *
 * Body: { audio: "data:audio/webm;codecs=opus;base64,...", idioma?: "es-AR" }
 */
router.post('/transcribir', async (req: Request, res: Response) => {
  const { audio, idioma } = req.body

  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ success: false, error: 'No se envió audio' })
  }

  const match = audio.match(/^data:([^;]+)(;[^,]*)?;base64,(.+)$/)
  if (!match) {
    return res.status(400).json({ success: false, error: 'El audio debe ser un data URL en base64' })
  }

  const mime = match[1]
  const base64 = match[3]
  const encoding = encodingPara(mime)

  if (!encoding) {
    console.error(`[Voz] Formato no soportado: ${mime}`)
    return res.status(400).json({
      success: false,
      error: 'El formato de audio de este teléfono no está soportado. Escribí el texto a mano.',
    })
  }

  const bytes = Buffer.byteLength(base64, 'base64')
  if (bytes === 0) {
    return res.status(400).json({ success: false, error: 'El audio llegó vacío' })
  }
  if (bytes > MAX_AUDIO_BYTES) {
    return res.status(413).json({
      success: false,
      error: 'La grabación es demasiado larga. Probá con uno más corto.',
    })
  }

  try {
    const token = await obtenerAccessToken()

    console.log(`[Voz] Transcribiendo ${(bytes / 1024).toFixed(0)} KB (${encoding})...`)

    const respuesta = await axios.post(
      SPEECH_API_URL,
      {
        config: {
          encoding,
          // Opus siempre sale a 48 kHz desde el navegador. Para LINEAR16 y FLAC
          // Google lo lee de la cabecera, así que el valor se ignora.
          sampleRateHertz: 48000,
          languageCode: idioma || 'es-AR',
          enableAutomaticPunctuation: true,
          // Sin `model`: los modelos especializados (latest_long, phone_call)
          // no están disponibles para es-AR y Google rechaza la request con 400.
        },
        audio: { content: base64 },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    )

    const resultados = respuesta.data?.results || []
    const texto = resultados
      .map((r: any) => r.alternatives?.[0]?.transcript || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!texto) {
      console.log('[Voz] Google no reconoció nada en el audio')
      return res.json({
        success: true,
        texto: '',
        mensaje: 'No se entendió el audio. Probá de nuevo hablando más cerca del teléfono.',
      })
    }

    console.log(`[Voz] Transcripción: "${texto.slice(0, 80)}${texto.length > 80 ? '…' : ''}"`)
    return res.json({ success: true, texto })

  } catch (error: any) {
    const status = error.response?.status
    const detalle = error.response?.data?.error?.message || error.message
    console.error('[Voz] Error de Google Speech:', status, detalle)

    if (status === 403) {
      return res.status(500).json({
        success: false,
        error: 'La API de transcripción no está habilitada o la cuenta no tiene permisos. Avisá a sistemas.',
        details: detalle,
      })
    }
    if (status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Demasiadas transcripciones seguidas. Esperá un momento.',
      })
    }
    if (String(detalle).includes('credenciales') || String(detalle).includes('GOOGLE_')) {
      return res.status(500).json({
        success: false,
        error: 'Faltan las credenciales de Google en el servidor. Avisá a sistemas.',
      })
    }

    return res.status(500).json({
      success: false,
      error: 'No se pudo transcribir el audio. Escribí el texto a mano.',
      details: detalle,
    })
  }
})

export default router
