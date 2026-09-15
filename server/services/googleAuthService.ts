import fs from 'fs'
import jwt from 'jsonwebtoken'
import axios from 'axios'

/**
 * ════════════════════════════════════════════════════════════════════
 * AUTENTICACIÓN CON GOOGLE CLOUD (service account)
 * ════════════════════════════════════════════════════════════════════
 *
 * Firma un JWT con la clave privada de la service account y lo canjea por un
 * access token en el endpoint de OAuth de Google.
 *
 * Se hace a mano con `jsonwebtoken` —que el proyecto ya usa para sus propios
 * tokens— en vez de sumar `google-auth-library`: son treinta líneas y evita
 * arrastrar una dependencia con todo su árbol para una sola llamada.
 *
 * ⚠️ La clave privada NUNCA va en el código ni en el repo. Se toma de:
 *   GOOGLE_CREDENTIALS_JSON        → el JSON completo en una variable (Render)
 *   GOOGLE_APPLICATION_CREDENTIALS → ruta al archivo .json (desarrollo local)
 */

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri: string
  project_id: string
}

let credenciales: ServiceAccount | null = null

function cargarCredenciales(): ServiceAccount {
  if (credenciales) return credenciales

  const inline = process.env.GOOGLE_CREDENTIALS_JSON
  const ruta = process.env.GOOGLE_APPLICATION_CREDENTIALS

  let crudo: string
  if (inline && inline.trim()) {
    crudo = inline
  } else if (ruta && fs.existsSync(ruta)) {
    crudo = fs.readFileSync(ruta, 'utf8')
  } else {
    throw new Error(
      'Faltan las credenciales de Google. Configurá GOOGLE_CREDENTIALS_JSON ' +
      'o GOOGLE_APPLICATION_CREDENTIALS en el .env'
    )
  }

  const parsed = JSON.parse(crudo) as ServiceAccount

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Las credenciales de Google no tienen client_email o private_key')
  }

  // En una variable de entorno los saltos de línea suelen quedar escapados
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')

  credenciales = parsed
  return parsed
}

let tokenCache: { token: string; expiraEn: number } | null = null

/**
 * Access token válido para llamar a las APIs de Google.
 *
 * Se cachea en memoria: el token dura una hora y pedir uno nuevo por cada
 * transcripción sumaría un viaje de red a cada grabación del chofer. Se renueva
 * cinco minutos antes del vencimiento para no usar uno que expire en pleno uso.
 */
export async function obtenerAccessToken(): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000)

  if (tokenCache && tokenCache.expiraEn > ahora + 300) {
    return tokenCache.token
  }

  const cred = cargarCredenciales()

  const assertion = jwt.sign(
    {
      iss: cred.client_email,
      scope: SCOPE,
      aud: cred.token_uri,
      exp: ahora + 3600,
      iat: ahora,
    },
    cred.private_key,
    { algorithm: 'RS256' }
  )

  const respuesta = await axios.post(
    cred.token_uri,
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000,
    }
  )

  const token = respuesta.data?.access_token
  const duracion = Number(respuesta.data?.expires_in) || 3600

  if (!token) {
    throw new Error('Google no devolvió un access token')
  }

  tokenCache = { token, expiraEn: ahora + duracion }
  return token
}

/** Nombre del proyecto de Google, solo para los logs. */
export function proyectoGoogle(): string {
  try {
    return cargarCredenciales().project_id
  } catch {
    return '(sin credenciales)'
  }
}
