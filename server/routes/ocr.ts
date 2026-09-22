import { Router, Request, Response } from 'express'
import axios from 'axios'

const router = Router()

// Gemini 2.5 Flash — rápido, gratuito y multimodal
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

/**
 * Pares TIPPRO/ARTCOD válidos para rendición (formulario RRFF).
 * Se usan como enum del responseSchema: el modelo solo puede elegir uno de estos,
 * así que una clasificación inexistente deja de ser posible.
 * Debe mantenerse sincronizado con CONCEPTOS_ACTIVOS de server/routes/conceptos.ts.
 */
const CONCEPTOS_VALIDOS = [
  'TARIFA/1',  'TARIFA/2',  'TARIFA/3',  'TARIFA/4',  'TARIFA/5',
  'TARIFA/6',  'TARIFA/7',  'TARIFA/8',  'TARIFA/10', 'TARIFA/11',
  'TARIFA/12', 'TARIFA/13', 'TARIFA/14', 'TARIFA/21',
  'HONPRO/2',  'HONPRO/3',  'HONPRO/4',  'HONPRO/5',  'HONPRO/6',
  'NEUMAT/1',  'NEUMAT/2',  'NEUMAT/3',
  'COMBLU/3',  'COMBLU/9',
  'SERVIC/3',
] as const

/** Concepto por defecto cuando no hay coincidencia clara: Gastos extras (Caja Camión) */
const CONCEPTO_FALLBACK = 'TARIFA/14'

interface ProveedorOCR {
  /** CORMVI_NROCTA tal cual está en PVMPRH: '03', '3' y '00' son proveedores distintos */
  cta: string
  nombre: string
  pais: 'ARG' | 'CHL' | 'URY'
  /** "Contado sin IVA": el que se usa cuando el ticket no identifica al emisor */
  generico?: boolean
  /** Conceptos con los que aparece en las rendiciones reales, del más al menos usado */
  conceptos: string
  /** Cómo suele figurar en el ticket, cuando la razón social no alcanza */
  pista?: string
}

/**
 * Proveedores que el OCR puede asignar a CORMVI_NROCTA.
 *
 * Sacados de las rendiciones reales (líneas RRFF + CRFF en CORMVI) cruzadas con
 * el padrón PVMPRH, en septiembre de 2026: son los 33 activos con 5 usos o más,
 * y cubren el 98,7% de las líneas. Quedan afuera los dados de baja (00, 412) y
 * los internos que nunca figuran como emisor de un ticket (999999, 542, 3, 0).
 *
 * Reemplaza una tabla anterior con los números correctos pero los nombres
 * inventados: decía que el 177 era un despachante de aduana, y es ISCAMEN.
 */
const PROVEEDORES_OCR: ProveedorOCR[] = [
  { cta: '03',   nombre: 'AR Proveedor Contado Sin IVA "Liq. Viajes"', pais: 'ARG', generico: true, conceptos: 'TARIFA/21, TARIFA/2, HONPRO/6', pista: 'ticket argentino informal, sin CUIT ni razón social identificable' },
  { cta: '103',  nombre: 'Dirección Nacional de Migraciones', pais: 'ARG', conceptos: 'TARIFA/2', pista: 'DNM, control migratorio, paso fronterizo' },
  { cta: '404',  nombre: 'Corredores Viales S.A.', pais: 'ARG', conceptos: 'TARIFA/5', pista: 'peaje en ruta nacional' },
  { cta: '8',    nombre: 'Ente Control de Rutas Provinciales', pais: 'ARG', conceptos: 'TARIFA/5', pista: 'peaje en ruta provincial' },
  { cta: '13',   nombre: 'Dirección Nacional de Vialidad', pais: 'ARG', conceptos: 'TARIFA/1, TARIFA/3', pista: 'DNV; túnel internacional Cristo Redentor del lado argentino' },
  { cta: '177',  nombre: 'ISCAMEN - Instituto de Sanidad y Calidad Agropecuaria Mendoza', pais: 'ARG', conceptos: 'TARIFA/10', pista: 'desinfección o barrera sanitaria en Mendoza' },
  { cta: '142',  nombre: 'Camara de Comercio Exterior de San Juan', pais: 'ARG', conceptos: 'TARIFA/10', pista: 'desinfección en San Juan' },
  { cta: '155',  nombre: 'Comision Administradora del Río Uruguay', pais: 'ARG', conceptos: 'TARIFA/5', pista: 'CARU, puentes internacionales sobre el río Uruguay' },
  { cta: '1011', nombre: 'Comuna San Jeronimo Sud', pais: 'ARG', conceptos: 'TARIFA/5' },
  { cta: '286',  nombre: 'Servicom SRL', pais: 'ARG', conceptos: 'HONPRO/4', pista: 'agente de transporte aduanero' },
  { cta: '426',  nombre: 'Tunel Subfluvial Raul Uranga - Carlos Sylvestre Begnis', pais: 'ARG', conceptos: 'TARIFA/5', pista: 'túnel subfluvial Paraná - Santa Fe' },
  { cta: '1607', nombre: 'Yacante Miriam Elizabeth', pais: 'ARG', conceptos: 'HONPRO/6, HONPRO/4' },
  { cta: '514',  nombre: 'Logistica Internacional S.A.', pais: 'ARG', conceptos: 'HONPRO/4' },
  { cta: '421',  nombre: 'Unidad Ejecutora Corredor Vial Nº6', pais: 'ARG', conceptos: 'TARIFA/5' },
  { cta: '411',  nombre: 'Unidad Ejecutora Corredor Vial Nº 9', pais: 'ARG', conceptos: 'TARIFA/5' },
  { cta: '598',  nombre: 'Caminos de las Sierras S.A', pais: 'ARG', conceptos: 'TARIFA/5' },
  { cta: '427',  nombre: 'Unidad Ejecutora Autopista AP 01', pais: 'ARG', conceptos: 'TARIFA/5' },
  { cta: '571',  nombre: 'Servicios Viales de Santa Fe S.A.', pais: 'ARG', conceptos: 'TARIFA/5' },
  { cta: '156',  nombre: 'Caminos del Rio Uruguay S.A.', pais: 'ARG', conceptos: 'TARIFA/5, TARIFA/6' },
  { cta: '675',  nombre: 'Autopistas del Sol S.A', pais: 'ARG', conceptos: 'TARIFA/5' },
  { cta: '1640', nombre: 'Jerez Nayla Daiana', pais: 'ARG', conceptos: 'TARIFA/14, HONPRO/6' },

  { cta: '01',   nombre: 'CH Proveedor Contado Sin IVA "Liq. Viajes"', pais: 'CHL', generico: true, conceptos: 'TARIFA/4, TARIFA/12, TARIFA/14', pista: 'boleta o ticket chileno sin emisor identificable' },
  { cta: '147',  nombre: 'Ministerio de Obras Públicas Dirección Gral de OO PP DCYF', pais: 'CHL', conceptos: 'TARIFA/4', pista: 'MOP Chile, Dirección de Vialidad' },
  { cta: '146',  nombre: 'Soc. Concesionaria Autopista Los Libertadores S.A.', pais: 'CHL', conceptos: 'TARIFA/4' },
  { cta: '409',  nombre: 'Soc Concesionaria Autopista Los Andes S A', pais: 'CHL', conceptos: 'TARIFA/4' },
  { cta: '145',  nombre: 'Soc. Concesionaria Autopista del Aconcagua S. A.', pais: 'CHL', conceptos: 'TARIFA/4' },
  { cta: '152',  nombre: 'Ruta del Maipo Sociedad Concesionaria S.A.', pais: 'CHL', conceptos: 'TARIFA/4' },
  { cta: '515',  nombre: 'Ruta de la Araucania S.A.', pais: 'CHL', conceptos: 'TARIFA/4' },
  { cta: '521',  nombre: 'Sociedad Concesionaria Autopista San Antonio-Stgo. S.A.', pais: 'CHL', conceptos: 'TARIFA/4' },
  { cta: '517',  nombre: 'Soc. Concesionaria Ruta 5 Talca Chillan S.A.', pais: 'CHL', conceptos: 'TARIFA/4' },
  { cta: '573',  nombre: 'Ruta Sur Sociedad Concesionaria', pais: 'CHL', conceptos: 'TARIFA/4' },
  { cta: '419',  nombre: 'Soc. Concesionaria del Elqui S.A.', pais: 'CHL', conceptos: 'TARIFA/4' },

  { cta: '02',   nombre: 'UY Proveedor s/IVA Liq. de Viajes', pais: 'URY', generico: true, conceptos: 'TARIFA/6, TARIFA/12, TARIFA/14', pista: 'ticket uruguayo sin emisor identificable' },
]

/**
 * Valor para "ninguno de la lista". Es preferible a que el modelo adivine: un
 * número equivocado se exporta sin que nadie lo note, uno vacío el panel lo
 * marca como "sin código" para que administración lo complete.
 */
const SIN_PROVEEDOR = 'NINGUNO'

const CODIGOS_PROVEEDOR = [...PROVEEDORES_OCR.map(p => p.cta), SIN_PROVEEDOR]

const TABLA_PROVEEDORES = PROVEEDORES_OCR
  .map(p => `${p.cta.padEnd(5)}| ${p.nombre} | ${p.pais} | ${p.conceptos}${p.pista ? ` | ${p.pista}` : ''}`)
  .join('\n')

// ── Red de seguridad: del nombre del emisor al número ────────────────────
//
// Probado con fotos reales de choferes, el modelo LEE bien al emisor pero a
// veces falla al pasarlo a número: leyó "CORREDORES VIALES S.A." y devolvió el
// genérico 03 en vez del 404, incluso con temperatura 0 y la regla explícita.
// Leer es lo que hace bien; mapear un nombre a un número conviene hacerlo acá,
// de forma determinística.

/** Palabras que no identifican a nadie: tipos societarios y conectores. */
const PALABRAS_VACIAS = new Set([
  's', 'a', 'sa', 'srl', 'de', 'del', 'la', 'las', 'los', 'el', 'y', 'n',
  'soc', 'sociedad', 'anonima', 'concesionaria',
])

function normalizarTexto(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Los genéricos quedan afuera: su nombre nunca figura impreso en un ticket. */
const CLAVES_PROVEEDOR = PROVEEDORES_OCR
  .filter(p => !p.generico)
  .map(p => ({
    proveedor: p,
    claves: normalizarTexto(p.nombre).split(' ').filter(t => t && !PALABRAS_VACIAS.has(t)),
  }))

/**
 * Proveedor cuyas palabras clave aparecen TODAS en el texto del emisor.
 * Exigir todas evita falsos positivos: "Control Fitosanitario San Carlos" no
 * matchea "Ente Control de Rutas Provinciales" solo por compartir "control".
 * Si matchean varios, gana el de nombre más específico.
 */
function proveedorPorEmisor(texto: string): ProveedorOCR | null {
  const palabras = new Set(normalizarTexto(texto).split(' '))
  let mejor: { proveedor: ProveedorOCR; n: number } | null = null

  for (const { proveedor, claves } of CLAVES_PROVEEDOR) {
    if (claves.length === 0 || !claves.every(t => palabras.has(t))) continue
    if (!mejor || claves.length > mejor.n) mejor = { proveedor, n: claves.length }
  }
  return mejor?.proveedor ?? null
}

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * POST a Gemini reintentando ante fallas transitorias.
 *
 * 503 ("high demand") y 429 (rate limit) son temporales y frecuentes en horas pico.
 * Sin reintento, el chofer ve un error y tiene que volver a sacar la foto — con el
 * costo de subida que eso implica desde la ruta. Dos reintentos cortos resuelven
 * la mayoría sin que se entere.
 */
async function postearAGeminiConReintento(url: string, body: any, config: any, intentos = 3) {
  let ultimoError: any

  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await axios.post(url, body, config)
    } catch (error: any) {
      ultimoError = error
      const status = error.response?.status
      const esTransitorio = status === 503 || status === 429

      if (!esTransitorio || intento === intentos) throw error

      const esperaMs = 1200 * intento  // 1,2s y luego 2,4s
      console.warn(`[OCR] Gemini respondió ${status}, reintento ${intento}/${intentos - 1} en ${esperaMs}ms`)
      await esperar(esperaMs)
    }
  }

  throw ultimoError
}

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

    console.log('[OCR] Enviando imagen a Gemini 2.5 Flash...')
    console.log(`[OCR] Tamaño base64: ${(base64Image.length / 1024).toFixed(0)} KB`)

    // Prompt optimizado para extracción de datos de tickets + clasificación Softland
    //
    // NO se pide transcripción del ticket: generar texto es la parte secuencial y lenta
    // de la inferencia, y el texto completo solo alimentaba un panel informativo.
    // Sin él, el modelo escribe ~40 palabras en vez de varios cientos.
    //
    // El formato lo garantiza responseSchema (abajo), no el prompt: por eso acá ya no
    // hace falta pedir "solo JSON, sin markdown" ni describir la forma de la respuesta.
    const prompt = `Analizá esta imagen de un ticket/factura/recibo/comprobante de pago de una empresa de transporte de camiones.

Tu única tarea es extraer los datos con la mayor exactitud posible. Concentrate en leer bien
el importe y la fecha: son los dos campos que después se controlan a mano si están mal.

Campos a completar:
- importe: el TOTAL a pagar, el monto final del ticket. Solo el número, sin símbolo de moneda.
- fecha: la fecha de EMISIÓN o de la TRANSACCIÓN, en formato YYYY-MM-DD.
- pais: ARG, CHL o URY.
- descripcion: nombre del comercio o establecimiento, máximo 120 caracteres.
- concepto: el par TIPPRO/ARTCOD según la tabla de abajo.
- formalidad: FORMAL o INFORMAL, según las reglas de abajo.
- proveedor: el NÚMERO de proveedor (Cta) de la tabla de proveedores de abajo, o "${SIN_PROVEEDOR}".

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
9. Si lo emite ISCAMEN o la Cámara de Comercio Exterior de San Juan → TARIFA/10 (es la desinfección en frontera). Otro control sanitario que no sea desinfección → TARIFA/7.
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
En Softland el proveedor es un NÚMERO de cuenta. Devolvé el número (columna Cta) del proveedor que emitió el ticket.
Esta tabla sale de las rendiciones reales de la empresa: la columna "Conceptos" dice con qué artículo se usa cada proveedor.

Cta  | Proveedor | País | Conceptos habituales | Cómo figura en el ticket
${TABLA_PROVEEDORES}

CÓMO ELEGIR EL PROVEEDOR (en este orden):
1. Buscá en el ticket la RAZÓN SOCIAL, el CUIT/RUT, logos o sellos del emisor. Si corresponde a un proveedor de la tabla → su número.
   ESTO MANDA SIEMPRE: si reconocés al emisor, usá su número aunque el ticket esté borroso, gastado o parezca informal.
   Los genéricos (03, 01, 02) son SOLO para cuando no podés saber a quién se le pagó.
2. Si NO reconocés al emisor y el ticket es INFORMAL (sin CUIT ni RUT, manuscrito, recibo simple) → el proveedor GENÉRICO de su país:
   Argentina → 03   ·   Chile → 01   ·   Uruguay → 02
3. Si es de Chile o Uruguay y no podés identificar al emisor → también el genérico del país (01 o 02). Así se cargan en la práctica.
4. Si es de Argentina, el ticket es FORMAL y el emisor NO está en la tabla → "${SIN_PROVEEDOR}". Administración lo asigna a mano.
   No elijas "el más parecido": un número equivocado se contabiliza sin que nadie lo note.

COHERENCIA OBLIGATORIA entre proveedor, concepto y formalidad:
- Los genéricos (03, 01, 02) son "contado SIN IVA" → la formalidad es INFORMAL.
- Los demás proveedores de la tabla son organismos o empresas con factura → casi siempre FORMAL.
- El concepto tiene que ser coherente con la columna "Conceptos habituales" del proveedor elegido.
  Ejemplos: 103 Migraciones → TARIFA/2. 177 ISCAMEN → TARIFA/10. 13 Vialidad Nacional (túnel) → TARIFA/1. Peajes chilenos → TARIFA/4.

REGLAS DE EXTRACCIÓN:
- El "importe" debe ser el TOTAL FINAL del ticket (total a pagar, no subtotales ni IVA por separado)
- Si hay múltiples totales, elegí el más grande que represente el total a pagar
- FECHA: Extraé ÚNICAMENTE la fecha de emisión/transacción (cuándo se pagó). IGNORÁ completamente: fechas de vencimiento, "Vto", "Venc", "Válido hasta", "CAI Vto", "Fecha CAI". Si el ticket tiene una fecha junto a la hora (ej: "15/03/2025 14:32"), esa es la fecha de la transacción. Si hay varias fechas, usá la que está al principio del ticket o junto a "Fecha:" / "Date:" / "Emisión:"
- Para el país, basate en indicadores fiscales (CUIT, RUT, RUC, tipo de IVA, etc.)`

    const geminiResponse = await postearAGeminiConReintento(
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
          temperature: 0,          // extracción, no redacción: determinista
          maxOutputTokens: 400,    // sin transcripción, la respuesta son ~40 palabras
          thinkingConfig: {
            thinkingBudget: 0
          },
          // El esquema garantiza la forma de la respuesta: no hay que limpiar
          // vallas de markdown ni rescatar el JSON con una expresión regular.
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            required: ['importe', 'fecha', 'pais', 'concepto', 'formalidad', 'proveedor'],
            properties: {
              importe:     { type: 'NUMBER' },
              fecha:       { type: 'STRING', description: 'YYYY-MM-DD, fecha de emisión' },
              pais:        { type: 'STRING', enum: ['ARG', 'CHL', 'URY'] },
              descripcion: { type: 'STRING' },
              formalidad:  { type: 'STRING', enum: ['FORMAL', 'INFORMAL'] },
              // Igual que con el concepto: el modelo solo puede elegir un número
              // que existe en Softland, nunca inventar uno.
              proveedor:   { type: 'STRING', enum: CODIGOS_PROVEEDOR },
              // Un solo campo con los 25 pares válidos: así el modelo no puede
              // devolver combinaciones inexistentes como COMBLU/5.
              concepto: {
                type: 'STRING',
                enum: CONCEPTOS_VALIDOS
              }
            }
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
        datos: { importe: '', fecha: '', pais: '', descripcion: '' },
        mensaje: 'No se pudo leer el ticket. Intentá con una foto más clara.'
      })
    }

    // Con responseMimeType 'application/json' la respuesta ya es JSON válido.
    // El try/catch queda como red de seguridad ante un cambio de la API.
    let datos: any = {}
    try {
      datos = JSON.parse(geminiText)
    } catch {
      console.error('[OCR] Gemini devolvió algo que no es JSON:', geminiText.slice(0, 300))
      return res.json({
        success: true,
        datos: { importe: '', fecha: '', pais: '', descripcion: '' },
        mensaje: 'Se leyó el ticket pero no se pudieron extraer los datos automáticamente.'
      })
    }

    let conceptoRaw: string = typeof datos.concepto === 'string' && datos.concepto.includes('/')
      ? datos.concepto
      : CONCEPTO_FALLBACK

    let proveedor = PROVEEDORES_OCR.find(p => p.cta === datos.proveedor)

    // Solo se corrige cuando el modelo eligió genérico o ninguno pero su propia
    // lectura del emisor nombra a un proveedor de la tabla. Si ya eligió uno
    // específico, se respeta: no se le discute una elección concreta.
    if (!proveedor || proveedor.generico) {
      const porEmisor = proveedorPorEmisor(String(datos.descripcion || ''))
      if (porEmisor) {
        console.log(`[OCR] Proveedor corregido por el emisor leído: ${datos.proveedor} → ${porEmisor.cta} (${porEmisor.nombre})`)
        proveedor = porEmisor

        // El concepto venía atado al proveedor equivocado por la regla de
        // coherencia: si no es uno de los habituales del corregido, se toma
        // su concepto principal (95-99% de los casos reales).
        const habituales = porEmisor.conceptos.split(',').map(c => c.trim())
        if (!habituales.includes(conceptoRaw)) conceptoRaw = habituales[0]
      }
    }

    // "TARIFA/5" → tipoProducto TARIFA, codigoArticulo 5
    const [tipoProducto, codigoArticulo] = conceptoRaw.split('/')

    // Un genérico es "contado SIN IVA" por definición: no puede ser formal
    // aunque el modelo lo haya leído así.
    const formalidad = proveedor?.generico
      ? 'INFORMAL'
      : (datos.formalidad === 'FORMAL' || datos.formalidad === 'INFORMAL') ? datos.formalidad : 'INFORMAL'

    // Normalizar los datos
    const resultado = {
      importe: (datos.importe !== undefined && datos.importe !== null) ? String(datos.importe) : '',
      fecha: datos.fecha || '',
      pais: datos.pais || '',
      descripcion: datos.descripcion || '',
      tipoProducto,
      codigoArticulo,
      formalidad,
      // El número va a CORMVI_NROCTA; el nombre es solo para mostrarlo
      codigoProveedor: proveedor?.cta || '',
      proveedor: proveedor?.nombre || '',
    }

    console.log('[OCR] Datos extraídos por Gemini:', {
      importe: resultado.importe,
      fecha: resultado.fecha,
      pais: resultado.pais,
      descripcion: resultado.descripcion?.substring(0, 50),
      tipoProducto: resultado.tipoProducto,
      codigoArticulo: resultado.codigoArticulo,
      formalidad: resultado.formalidad,
      proveedor: `${resultado.codigoProveedor || '(ninguno)'} ${resultado.proveedor.substring(0, 40)}`,
    })

    return res.json({
      success: true,
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
      // Llega acá solo si los reintentos automáticos tampoco alcanzaron
      if (error.response.status === 503) {
        return res.status(503).json({
          success: false,
          error: 'El servicio de lectura está saturado en este momento. Probá de nuevo en un minuto — la foto no se perdió.',
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
