import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FaTruck, FaSpinner, FaUser, FaCheck,
  FaArrowLeft, FaClipboardCheck, FaExclamationTriangle,
  FaFileExport, FaTrailer, FaHashtag, FaBuilding, FaDownload,
  FaTimes, FaPen, FaSave, FaCopy, FaTrash, FaUndo, FaCalendarAlt
} from 'react-icons/fa'

import { totalesPorMoneda, normalizarPais, MONEDAS, BANDERAS } from '../types'
import { resolverProveedor, cargarProveedores } from '../proveedores'
import TotalesPorMoneda from '../components/TotalesPorMoneda'

const API_URL = import.meta.env.VITE_API_URL || '/api'

interface HojaDeRuta {
  Cod_Empresa: string
  Nro_Viaje: number
  Fecha_Salida: string
  Fecha_Llegada: string | null
  Nombre_Chofer: string
  Patente_Tractor: string
  Patente_Semirremolque: string
  Observaciones: string
  Estado_Viaje: string
}

/** De dónde salió cada dato de la cabecera. */
type OrigenCabecera = 'chofer' | 'hoja' | 'porteria' | 'calculado' | 'manual' | 'sin-dato'

interface ValorCabecera {
  valor: string | null
  origen: OrigenCabecera
}

/**
 * Cabecera del viaje (el equivalente a CORMVH). La calcula el backend igual
 * que Softland: salida de la hoja de ruta, llegada de portería, período con
 * la misma función. Todas las líneas del viaje heredan estos valores.
 */
interface Cabecera {
  nroViaje: number
  empresa: string
  patente: string
  /**
   * Chofer resuelto contra el padrón USR_GTCHOF. No se muestra: de acá salen
   * el legajo y la empresa que van en cada línea, y la validación de la regla 16.
   */
  chofer: { nombre: string; legajo: string; empresa: string; enPadron: boolean }
  /** Las tres fuentes de la llegada, para contrastarlas */
  llegadaCandidatas: { chofer: string | null; hoja: string | null; porteria: string | null }
  salida: ValorCabecera
  llegada: ValorCabecera
  periodoLiquidar: ValorCabecera
  periodo: number
  cajaCamion: number | null
  actualizadoPor: string | null
  actualizadoAt: string | null
}

/**
 * Un problema encontrado por las reglas de Softland (GRTQVI, contexto CORMVH).
 * `mensaje` es el texto textual del ERP; `comoSeArregla` es agregado nuestro.
 */
interface Hallazgo {
  regla: number
  nivel: 'bloquea' | 'aviso'
  mensaje: string
  comoSeArregla?: string
  gastoId?: string
}

interface Aprobacion {
  nroViaje: number
  aprobadoPor: string
  fechaAprobacion: string
  totalImporte: number
}

/**
 * Registro CORMVI — el orden de las claves define el orden de las columnas
 * en el CSV, en el copiado y en la tabla del panel. Es el orden que espera Softland.
 */
interface CormviRecord {
  CORMVI_NROCTA: string        // Proveedor
  CORMVI_TIPORI: string        // Tipo del producto original
  CORMVI_ARTORI: string        // Código de producto original
  CORMVI_TIPCPT: string        // Tipo de concepto — siempre 'A'
  CORMVI_CODCPT: string        // Concepto — siempre 'S000'
  CORMVI_COFLIS: string        // Coeficiente — moneda: ARS / $CH / $UR según el país
  USR_CORMVI_NLIIVA: string    // Informal: 'S' / 'N'
  USR_CORMVI_CANTID: number    // Cantidad
  USR_CORMVI_PRECIO: number    // Precio
  VIRT_TOTLIN: number          // Total (virtual) = cantidad × precio
  USR_CORMVI_PERLIQ: string    // Período a liquidar (YYYYMM)
  CORMVI_TEXTOS: string        // Observaciones
  USR_CORMVI_EMPLEG: string    // Empresa Legajo
  USR_CORMVI_NROLEG: string    // Legajo
  USR_CORMVI_NROVIA: number    // Hoja de Viaje N°
  USR_CORMVI_NROFOR: string    // Rendición
  USR_CORMVI_PATTRA: string    // Tractor
  USR_CORMVI_DELETE: string    // Línea a borrar — siempre 'N'
  USR_CORMVI_FCHCAL: string | null  // Fecha Salida
  USR_CORMVI_COSAVI: number | null  // Coeficiente de viaje según fecha de salida
  USR_CORMVI_VAITSE: number    // Valor de item seleccionado
  USR_CORMVI_NOMLEG: string    // Nombre Empleado
  USR_CORMVI_CAJCAM: number | null  // Valor de la Caja Camión
  CORMVI_PRECIO: number        // Precio (estándar Softland)
  CORMVI_CANTID: number        // Cantidad. En RRFF real siempre 1 (o 0), nunca negativa
  USR_CORMVI_PERIOD: number    // Período (numérico, YYYYMM)
  USR_CORMVI_FCHLLE: string | null  // Fecha de llegada
}

/**
 * Una fila tal como la arma el backend (cormviService.gastoAFilaCormvi).
 * Los campos con `_` son para el panel: NO se copian ni se exportan.
 */
interface FilaCormvi extends CormviRecord {
  _gastoId: string
  _tieneFoto: boolean
  _pais: string
  _descripcion: string
  _fechaTicket: string
  _formalidad: string
}

/**
 * Etiquetas de cada columna, en el orden exacto de CormviRecord.
 * Única fuente de verdad para la cabecera de la tabla, el copiado de filas
 * y la exportación: agregar una columna acá la propaga a los tres lugares.
 */
/**
 * `descAlLado` marca las columnas que en Softland tienen a su derecha un campo
 * de descripción que se completa solo y no se puede editar. Esas columnas NO se
 * muestran en el panel —romperían la tabla visualmente y no aportan nada— pero
 * al copiar hay que dejarles el lugar vacío: si no, todo lo que va a la derecha
 * se pega corrido una posición.
 */
const COLUMNAS_CORMVI: Array<{ campo: keyof CormviRecord; etiqueta: string; num?: boolean; descAlLado?: boolean }> = [
  { campo: 'CORMVI_NROCTA',     etiqueta: 'Proveedor',                  descAlLado: true },
  { campo: 'CORMVI_TIPORI',     etiqueta: 'Tipo del producto original', descAlLado: true },
  { campo: 'CORMVI_ARTORI',     etiqueta: 'Código de producto original', descAlLado: true },
  { campo: 'CORMVI_TIPCPT',     etiqueta: 'Tipo de concepto',           descAlLado: true },
  { campo: 'CORMVI_CODCPT',     etiqueta: 'Concepto',                   descAlLado: true },
  { campo: 'CORMVI_COFLIS',     etiqueta: 'Coeficiente',                descAlLado: true },
  { campo: 'USR_CORMVI_NLIIVA', etiqueta: 'Informal' },
  { campo: 'USR_CORMVI_CANTID', etiqueta: 'Cantidad',  num: true },
  { campo: 'USR_CORMVI_PRECIO', etiqueta: 'Precio',    num: true },
  { campo: 'VIRT_TOTLIN',       etiqueta: 'Total',     num: true },
  { campo: 'USR_CORMVI_PERLIQ', etiqueta: 'Período a liquidar' },
  { campo: 'CORMVI_TEXTOS',     etiqueta: 'Observaciones' },
  { campo: 'USR_CORMVI_EMPLEG', etiqueta: 'Empresa Legajo' },
  { campo: 'USR_CORMVI_NROLEG', etiqueta: 'Legajo' },
  { campo: 'USR_CORMVI_NROVIA', etiqueta: 'Hoja de Viaje N°' },
  { campo: 'USR_CORMVI_NROFOR', etiqueta: 'Rendición' },
  { campo: 'USR_CORMVI_PATTRA', etiqueta: 'Tractor',                    descAlLado: true },
  { campo: 'USR_CORMVI_DELETE', etiqueta: 'Línea a borrar' },
  { campo: 'USR_CORMVI_FCHCAL', etiqueta: 'Fecha Salida' },
  { campo: 'USR_CORMVI_COSAVI', etiqueta: 'Coeficiente de viaje según fecha de salida', num: true },
  { campo: 'USR_CORMVI_VAITSE', etiqueta: 'Valor de item seleccionado', num: true },
  { campo: 'USR_CORMVI_NOMLEG', etiqueta: 'Nombre Empleado',            descAlLado: true },
  { campo: 'USR_CORMVI_CAJCAM', etiqueta: 'Valor de la Caja Camión', num: true },
  { campo: 'CORMVI_PRECIO',     etiqueta: 'Precio',   num: true },
  { campo: 'CORMVI_CANTID',     etiqueta: 'Cantidad', num: true },
  { campo: 'USR_CORMVI_PERIOD', etiqueta: 'Período',  num: true },
  { campo: 'USR_CORMVI_FCHLLE', etiqueta: 'Fecha de llegada' },
]

/**
 * Una fila con el ancho REAL que espera Softland: los 27 valores más las 8
 * columnas de descripción intercaladas, que van vacías.
 *
 * Es la única forma de que al pegar cada dato caiga en su columna. Softland
 * rellena solo esas descripciones a partir del código de la izquierda.
 */
function filaParaSoftland(reg: CormviRecord): string[] {
  const celdas: string[] = []
  for (const col of COLUMNAS_CORMVI) {
    celdas.push(valorCormviTexto(reg, col.campo))
    if (col.descAlLado) celdas.push('')   // hueco para la descripción automática
  }
  return celdas
}

/** Cabecera con el mismo ancho que `filaParaSoftland`. */
function cabeceraParaSoftland(usarEtiquetas: boolean): string[] {
  const celdas: string[] = []
  for (const col of COLUMNAS_CORMVI) {
    celdas.push(usarEtiquetas ? col.etiqueta : String(col.campo))
    if (col.descAlLado) celdas.push(usarEtiquetas ? `Descripción ${col.etiqueta}` : `DESC_${col.campo}`)
  }
  return celdas
}

/** Columnas que llevan fecha y hay que formatear como dd/mm/aaaa. */
const COLUMNAS_FECHA: ReadonlyArray<keyof CormviRecord> = ['USR_CORMVI_FCHCAL', 'USR_CORMVI_FCHLLE']

/**
 * Un valor de celda como texto plano para pegar en Softland.
 *
 * Tres reglas, todas para que la fila no se desfase al pegarla:
 *
 *  1. Ni tabulaciones ni saltos de línea. Las columnas se separan con TAB y las
 *     filas con salto: si un texto trae uno adentro, parte la fila al medio y
 *     todo lo que sigue cae una columna corrida. Se reemplazan por espacio.
 *  2. Las fechas salen dd/mm/aaaa, no en ISO. Pegar "2026-08-15T00:00:00.000Z"
 *     no lo interpreta como fecha ningún sistema.
 *  3. Los decimales van con coma, que es lo que espera un Excel en español.
 *     Con punto, "1234.5" se lee como texto o como 12345.
 *
 * Un valor vacío devuelve "" y conserva igual su tabulación: la columna queda
 * en blanco pero las de la derecha no se corren.
 */
function valorCormviTexto(reg: CormviRecord, campo: keyof CormviRecord): string {
  const v = reg[campo]
  if (v === null || v === undefined) return ''

  // PROVEEDOR es un número de cuenta en Softland. El OCR guarda la razón social,
  // así que acá se traduce: a la planilla va el número, nunca el nombre.
  if (campo === 'CORMVI_NROCTA') return resolverProveedor(v).codigo

  if (COLUMNAS_FECHA.includes(campo)) {
    const d = new Date(String(v))
    if (!isNaN(d.getTime())) {
      const dd = String(d.getUTCDate()).padStart(2, '0')
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      return `${dd}/${mm}/${d.getUTCFullYear()}`
    }
  }

  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : String(v).replace('.', ',')
  }

  return String(v).replace(/[\t\r\n]+/g, ' ').trim()
}

/** Un registro CORMVI sin los campos internos del panel (los `_`). */
function soloCormvi(f: FilaCormvi): CormviRecord {
  const reg = {} as Record<string, unknown>
  for (const col of COLUMNAS_CORMVI) reg[col.campo] = f[col.campo]
  return reg as unknown as CormviRecord
}

/** 'AAAA-MM-DD' → 'dd/mm/aaaa' sin pasar por Date (evita el corrimiento de zona horaria). */
function fechaCorta(v: string | null | undefined): string {
  if (!v) return ''
  const [a, m, d] = String(v).slice(0, 10).split('-')
  return d ? `${d}/${m}/${a}` : String(v)
}

export default function AdminViajeDetalle() {
  const { nroViaje: nroViajeParam } = useParams<{ nroViaje: string }>()
  const navigate = useNavigate()
  const nroViaje = parseInt(nroViajeParam || '0')

  const [hoja, setHoja] = useState<HojaDeRuta | null>(null)
  // Filas CORMVI y cabecera tal como las arma el backend (cormviService)
  const [registros, setRegistros] = useState<FilaCormvi[]>([])
  const [cabecera, setCabecera] = useState<Cabecera | null>(null)
  const [validaciones, setValidaciones] = useState<Hallazgo[]>([])
  const [aprobacion, setAprobacion] = useState<Aprobacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [aprobando, setAprobando] = useState(false)
  const [error, setError] = useState('')

  // Marca de "copiado" para el feedback visual del botón (id de fila o 'todas')
  const [copiado, setCopiado] = useState<string | null>(null)
  // Id del gasto que se está borrando, para deshabilitar el botón mientras tanto
  const [borrando, setBorrando] = useState<string | null>(null)

  // Edición de gastos guardados en dibiagi_admin_db
  const [editando, setEditando] = useState<FilaCormvi | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState('')

  // Edición inline celda por celda
  const [celdaGuardando, setCeldaGuardando] = useState<string | null>(null)
  const [errorCelda, setErrorCelda] = useState('')

  // Visor de la foto del ticket
  const [fotoAmpliada, setFotoAmpliada] = useState<{ url: string; titulo: string } | null>(null)

  // Padrón de proveedores de Softland. Al pasar a 'listo' la tabla se vuelve a
  // dibujar y cada número muestra su razón social real.
  const [padron, setPadron] = useState<'cargando' | 'listo' | 'error'>('cargando')

  const adminData = JSON.parse(sessionStorage.getItem('admin_user') || '{}')
  // Solo el rol 'admin' elimina gastos. El backend lo vuelve a validar contra
  // el JWT, así que esconder el botón es comodidad, no la restricción real.
  const puedeEliminar = adminData.rol === 'admin'
  const estaAprobado = !!aprobacion

  // Sin los campos internos: esto es lo que se copia y se exporta
  const registrosCormvi: CormviRecord[] = registros.map(soloCormvi)
  const token = sessionStorage.getItem('admin_token') || ''

  useEffect(() => { cargarDatos() }, [nroViaje])

  useEffect(() => {
    cargarProveedores(sessionStorage.getItem('admin_token') || '')
      .then(() => setPadron('listo'))
      .catch(() => setPadron('error'))
  }, [])

  /**
   * Trae filas y cabecera ya armadas por el backend. Toda la lógica de
   * Softland (fechas del viaje, período, caja camión) vive en cormviService:
   * el panel solo muestra.
   *
   * `silencioso` recarga sin el spinner de pantalla completa, para no perder
   * el scroll de la tabla después de editar una celda.
   */
  const cargarDatos = async (silencioso = false) => {
    try {
      if (!silencioso) setLoading(true)
      setError('')

      const [resHojas, resCormvi, resAprob] = await Promise.all([
        fetch(`${API_URL}/drivers/roadmaps-public`),
        fetch(`${API_URL}/gastos-viaje/${nroViaje}/cormvi`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/gastos-viaje/aprobaciones/todas`),
      ])

      if (resHojas.ok) {
        const data = await resHojas.json()
        if (data.success) {
          const found = (data.data || []).find((h: HojaDeRuta) => h.Nro_Viaje === nroViaje)
          setHoja(found || null)
        }
      }

      if (resCormvi.status === 401) {
        setError('La sesión venció. Volvé a ingresar al panel.')
      } else {
        const data = await resCormvi.json().catch(() => ({}))
        if (!resCormvi.ok || !data.success) {
          setError(data.error || `No se pudieron cargar los registros (${resCormvi.status})`)
        } else {
          setRegistros(data.data.registros || [])
          setCabecera(data.data.cabecera || null)
          setValidaciones(data.data.validaciones || [])
        }
      }

      if (resAprob.ok) {
        const data = await resAprob.json()
        setAprobacion(data.data?.[nroViaje] || null)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      if (!silencioso) setLoading(false)
    }
  }

  /** Corrige la cabecera. Devuelve el mensaje de error, o null si salió bien. */
  const guardarCabecera = async (cambios: { salida?: string; llegada?: string; periodoLiquidar?: string }) => {
    try {
      const res = await fetch(`${API_URL}/gastos-viaje/${nroViaje}/cabecera`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(cambios),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) return data.error || `Error ${res.status}`
      // Todas las líneas heredan la cabecera: se recargan todas
      await cargarDatos(true)
      return null
    } catch {
      return 'Error de conexión al guardar la cabecera'
    }
  }

  // Un total por moneda. `totalImporte` (suma cruda) se mantiene solo porque el
  // backend lo persiste en dbo.aprobaciones_viaje.total_importe; NO se muestra.
  const totalesGastos = totalesPorMoneda(
    registros.map(r => ({ pais: r._pais, importe: r.USR_CORMVI_PRECIO ?? 0 }))
  )
  const totalImporte = registros.reduce((sum, r) => sum + (r.USR_CORMVI_PRECIO ?? 0), 0)

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'En curso'
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const formatImporte = (n: number) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

  const aprobarRendicion = async () => {
    const detalle = totalesGastos.map(t => `  ${t.moneda}: $ ${formatImporte(t.total)} (${t.cantidad} gastos)`).join('\n')
    if (!confirm(`Aprobar la rendicion del Viaje ${nroViaje}?\n\nTotales por moneda:\n${detalle}`)) return
    setAprobando(true)
    try {
      const res = await fetch(`${API_URL}/gastos-viaje/aprobaciones/${nroViaje}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aprobadoPor: adminData.nombre || 'Administrador', totalImporte })
      })
      if (res.ok) {
        const data = await res.json()
        setAprobacion(data.data)
      }
    } catch (err) {
      console.error('Error al aprobar:', err)
    } finally {
      setAprobando(false)
    }
  }

  /**
   * Elimina un gasto. Es la única pantalla donde se puede: el chofer carga y
   * consulta, pero el control de la rendición es del área administrativa.
   */
  const eliminarGasto = async (reg: FilaCormvi) => {
    const id = reg._gastoId
    if (!id) return

    // Con espacios, no con barra: 'TARIFA/5' no es un valor que exista en
    // Softland, son dos columnas. Escribirlo junto confunde al leer el panel.
    const detalle = `${reg.CORMVI_TIPORI} · ${reg.CORMVI_ARTORI}  ·  $ ${formatImporte(reg.USR_CORMVI_PRECIO)}`
    if (!confirm(`Eliminar este gasto del viaje ${nroViaje}?\n\n${detalle}\n\nNo se puede deshacer.`)) return

    setBorrando(id)
    try {
      // El token lleva el rol; sin él el backend responde 401.
      const res = await fetch(`${API_URL}/gastos-viaje/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success !== false) {
        setRegistros(prev => prev.filter(x => x._gastoId !== id))
      } else {
        alert(data.error || 'No se pudo eliminar el gasto.')
      }
    } catch {
      alert('Error de conexión al eliminar el gasto.')
    } finally {
      setBorrando(null)
    }
  }

  const revocarAprobacion = async () => {
    if (!confirm('Revocar la aprobacion? Volvera a estado pendiente.')) return
    try {
      const res = await fetch(`${API_URL}/gastos-viaje/aprobaciones/${nroViaje}`, { method: 'DELETE' })
      if (res.ok) setAprobacion(null)
    } catch (err) {
      console.error('Error al revocar:', err)
    }
  }

  /**
   * Guarda un solo campo de un gasto (edición inline) y recarga en silencio:
   * la fila la vuelve a armar el backend, así lo que se ve es exactamente lo
   * que se exportaría. Sin spinner general, para no perder el scroll.
   */
  const guardarCampo = async (gastoId: string, campo: string, valor: any) => {
    setCeldaGuardando(`${gastoId}:${campo}`)
    setErrorCelda('')
    try {
      const res = await fetch(`${API_URL}/gastos-viaje/${gastoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: valor }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || `Error ${res.status}`)

      await cargarDatos(true)
    } catch (err) {
      setErrorCelda(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
      // Que el error no quede colgado en pantalla para siempre
      setTimeout(() => setErrorCelda(''), 6000)
    } finally {
      setCeldaGuardando(null)
    }
  }

  // ── Edición de un gasto guardado en dibiagi_admin_db ──────────────
  // Solo lo que es propio de cada gasto. Fechas, período y caja camión son de
  // la cabecera; cantidad, coeficiente y valor ítem son fijos en un RRFF.
  const abrirEdicion = (r: FilaCormvi) => {
    setErrorEdicion('')
    setEditando(r)
    setForm({
      codigoProveedor: r.CORMVI_NROCTA ?? '',
      tipoProducto:    r.CORMVI_TIPORI ?? '',
      codigoArticulo:  r.CORMVI_ARTORI ?? '',
      formalidad:      r._formalidad === 'FORMAL' ? 'FORMAL' : 'INFORMAL',
      importe:         String(r.USR_CORMVI_PRECIO ?? 0),
      rendicion:       r.USR_CORMVI_NROFOR ?? '',
      legajoChofer:    r.USR_CORMVI_NROLEG ?? '',
      empresaChofer:   r.USR_CORMVI_EMPLEG ?? '',
      chofer:          r.USR_CORMVI_NOMLEG ?? '',
      patenteTractor:  r.USR_CORMVI_PATTRA ?? '',
      descripcion:     r._descripcion ?? '',
    })
  }

  const cerrarEdicion = () => {
    setEditando(null)
    setForm({})
    setErrorEdicion('')
  }

  const setCampo = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  const guardarEdicion = async () => {
    if (!editando?._gastoId) return

    const importeNum = parseFloat(form.importe)
    if (isNaN(importeNum) || importeNum <= 0) {
      setErrorEdicion('El precio debe ser un número mayor a 0')
      return
    }

    setGuardando(true)
    setErrorEdicion('')
    try {
      const res = await fetch(`${API_URL}/gastos-viaje/${editando._gastoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoProveedor: form.codigoProveedor,
          tipoProducto:    form.tipoProducto,
          codigoArticulo:  form.codigoArticulo,
          formalidad:      form.formalidad,
          importe:         importeNum,
          rendicion:       form.rendicion,
          legajoChofer:    form.legajoChofer,
          empresaChofer:   form.empresaChofer,
          chofer:          form.chofer,
          patenteTractor:  form.patenteTractor,
          descripcion:     form.descripcion,
        })
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Error ${res.status}`)
      }

      cerrarEdicion()
      await cargarDatos(true)   // recarga desde la BD → /admin y la app del chofer quedan iguales
    } catch (err) {
      setErrorEdicion(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
    } finally {
      setGuardando(false)
    }
  }

  const descargarCSV = () => {
    if (registrosCormvi.length === 0) return
    // Mismo ancho y contenido que el copiado, entrecomillado para CSV.
    // Incluye las columnas de descripción vacías: el archivo va al mismo destino.
    const csv = (s: string) =>
      s.includes(';') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s

    const rows = [
      cabeceraParaSoftland(false).join(';'),
      ...registrosCormvi.map(r => filaParaSoftland(r).map(csv).join(';'))
    ]
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `CORMVI_Viaje_${nroViaje}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Copia registros al portapapeles separados por tabulaciones, que es el
   * formato que Excel interpreta como celdas al pegar.
   */
  const copiarFilas = async (regs: CormviRecord[], marca: string, conCabecera = false) => {
    const lineas = regs.map(r => filaParaSoftland(r).join('\t'))
    if (conCabecera) lineas.unshift(cabeceraParaSoftland(true).join('\t'))

    try {
      await navigator.clipboard.writeText(lineas.join('\n'))
      setCopiado(marca)
      setTimeout(() => setCopiado(prev => (prev === marca ? null : prev)), 1500)
    } catch {
      alert('No se pudo copiar. Es posible que el navegador bloquee el portapapeles fuera de HTTPS.')
    }
  }

  const descargarJSON = () => {
    const payload = {
      nroViaje,
      cabecera,
      totalRegistros: registrosCormvi.length,
      totalImporte,
      aprobacion,
      registros: registrosCormvi,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `CORMVI_Viaje_${nroViaje}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="text-center">
          <FaSpinner className="animate-spin text-3xl text-blue-400 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando viaje {nroViaje}...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f1117]">

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0f1117]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="admin-container py-3 flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-gray-400 hover:text-white transition-all border border-white/[0.06]"
          >
            <FaArrowLeft className="text-xs" />
          </button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-600/15 flex items-center justify-center flex-shrink-0">
              <FaClipboardCheck className="text-blue-400 text-sm" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-white leading-tight truncate">
                Viaje {nroViaje}
                {hoja && <span className="text-gray-500 font-normal text-sm ml-2"> {hoja.Nombre_Chofer}</span>}
              </h1>
              <p className="text-xs text-gray-500">Panel Administrativo</p>
            </div>
          </div>

          {/* Estado + botones aprobar/revocar */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {registros.length > 0 && (
              estaAprobado ? (
                <button
                  onClick={revocarAprobacion}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-gray-500 hover:text-red-400 hover:bg-red-500/[0.06] border border-white/[0.06] transition-all"
                >
                  <FaTimes className="text-[10px]" /> Revocar
                </button>
              ) : (
                <button
                  onClick={aprobarRendicion}
                  disabled={aprobando}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-60"
                >
                  {aprobando
                    ? <><FaSpinner className="animate-spin text-[10px]" /> Aprobando...</>
                    : <><FaCheck className="text-[10px]" /> Aprobar</>
                  }
                </button>
              )
            )}
            <span className={`text-[11px] px-2.5 py-1 rounded-lg font-medium ${
              estaAprobado
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}>
              {estaAprobado ? ' Aprobado' : 'Pendiente'}
            </span>
          </div>
        </div>
      </header>

      <div className="admin-container py-6 space-y-5">

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/[0.04] border border-red-500/20">
            <FaExclamationTriangle className="text-red-400 text-sm flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Sin padrón no hay forma de saber si un número de proveedor es válido */}
        {padron === 'error' && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-amber-500/[0.04] border border-amber-500/20">
            <FaExclamationTriangle className="text-amber-400 text-sm flex-shrink-0" />
            <p className="text-sm text-amber-400">
              No se pudo cargar el padrón de proveedores de Softland. Los números se muestran sin verificar.
            </p>
          </div>
        )}

        {/* Info del viaje */}
        {hoja && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <FaTruck className="text-blue-400 text-sm" />
              <h2 className="text-sm font-semibold text-white">Datos del Viaje</h2>
              <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-md font-medium ${
                hoja.Estado_Viaje === 'Abierto' ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-400'
              }`}>
                {hoja.Estado_Viaje}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FaUser className="text-[9px]" /> Chofer
                </p>
                <p className="text-sm text-white font-medium">{hoja.Nombre_Chofer}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FaTruck className="text-[9px]" /> Tractor
                </p>
                <p className="text-sm text-white font-medium">{hoja.Patente_Tractor}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FaTrailer className="text-[9px]" /> Semi
                </p>
                <p className="text-sm text-gray-300">{hoja.Patente_Semirremolque || ''}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FaBuilding className="text-[9px]" /> Empresa
                </p>
                <p className="text-sm text-gray-300">{hoja.Cod_Empresa}</p>
              </div>
              {/* Las fechas del viaje están en la tarjeta de cabecera: son las
                  que van a Softland y se corrigen ahí, no acá. */}
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FaHashtag className="text-[9px]" /> N Viaje
                </p>
                <p className="text-sm text-white font-mono font-medium">{nroViaje}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">
                  Gastos  {registros.length} registros
                </p>
                <TotalesPorMoneda totales={totalesGastos} />
              </div>
            </div>
          </div>
        )}

        {/* Banner aprobacion */}
        {estaAprobado && aprobacion && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/10">
            <FaCheck className="text-emerald-400 text-sm flex-shrink-0" />
            <p className="text-sm text-emerald-400">
              Aprobado por <strong>{aprobacion.aprobadoPor}</strong> el {formatFecha(aprobacion.fechaAprobacion)}
            </p>
          </div>
        )}

        {/* Cabecera de la rendición: lo que en Softland es CORMVH */}
        {cabecera && <CabeceraRendicion cabecera={cabecera} onGuardar={guardarCabecera} />}

        {/* Las mismas reglas que corre la pantalla de Softland */}
        {registros.length > 0 && <Validaciones hallazgos={validaciones} />}

        {/* Tabla CORMVI  siempre visible */}
        {registros.length === 0 ? (
          <div className="text-center py-16 bg-white/[0.03] border border-white/[0.06] rounded-xl">
            <FaClipboardCheck className="text-2xl text-gray-700 mx-auto mb-3" />
            <p className="text-base font-medium text-white mb-1">Sin gastos</p>
            <p className="text-gray-500 text-sm">No hay gastos cargados para este viaje.</p>
          </div>
        ) : (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
            {/* Cabecera con descargas */}
            <div className="p-4 border-b border-white/[0.04] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <FaFileExport className="text-purple-400 text-xs" />
                  Registros CORMVI  Viaje {nroViaje}
                </h3>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {registrosCormvi.length} registros
                  {totalesGastos.map(t => (
                    <span key={t.pais} className="ml-2">
                      {t.moneda} $ {formatImporte(t.total)}
                    </span>
                  ))}
                  {!estaAprobado && (
                    <span className="ml-2 text-amber-500"> Pendiente de aprobacion</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => copiarFilas(registrosCormvi, 'todas', true)}
                  title="Copiar todas las filas con cabecera, listas para pegar en Softland"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                    copiado === 'todas'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-white/[0.05] hover:bg-white/[0.09] text-gray-300 hover:text-white border-white/[0.08]'
                  }`}
                >
                  {copiado === 'todas'
                    ? <><FaCheck className="text-[10px]" /> Copiado</>
                    : <><FaCopy className="text-[10px]" /> Copiar tabla</>}
                </button>
                <button
                  onClick={descargarCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-gray-300 hover:text-white border border-white/[0.08] transition-all"
                >
                  <FaDownload className="text-[10px]" /> CSV
                </button>
                <button
                  onClick={descargarJSON}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-gray-300 hover:text-white border border-white/[0.08] transition-all"
                >
                  <FaDownload className="text-[10px]" /> JSON
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="bg-white/[0.04] border-b-2 border-white/[0.08]">
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider sticky left-0 bg-[#161821] min-w-[40px]">#</th>
                    <th className="text-center py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[76px]">Ticket</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[120px]">Proveedor</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[180px]">Tipo Producto Original</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[180px]">Cód. Producto Original</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[140px]">Tipo de Concepto</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[110px]">Concepto</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[110px]">Coeficiente</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[90px]">Informal</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[90px]">Cantidad</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[120px]">Precio</th>
                    {/* Columna solo informativa: NO forma parte de COLUMNAS_CORMVI,
                        así que no se copia ni se exporta. */}
                    <th className="text-left py-3 px-4 text-gray-500 font-bold text-xs uppercase tracking-wider min-w-[96px]">Moneda</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[120px]">Total</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[150px]">Período a Liquidar</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[160px]">Observaciones</th>
                    {/* Informativa: lo que escribió el chofer. En Softland esta
                        columna va vacía, así que no se copia ni se exporta. */}
                    <th className="text-left py-3 px-4 text-gray-500 font-bold text-xs uppercase tracking-wider min-w-[200px]">Detalle del ticket</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[130px]">Empresa Legajo</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[90px]">Legajo</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[130px]">Hoja de Viaje N°</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[110px]">Rendición</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[100px]">Tractor</th>
                    <th className="text-center py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[120px]">Línea a Borrar</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[120px]">Fecha Salida</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[240px]">Coef. Viaje según Fecha Salida</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[160px]">Valor Ítem Seleccionado</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[160px]">Nombre Empleado</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[160px]">Valor Caja Camión</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[110px]">Precio</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[100px]">Cantidad</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[110px]">Período</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[140px]">Fecha de Llegada</th>
                    <th className="text-center py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[80px]">Copiar</th>
                    <th className="text-center py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[92px]">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((reg, i) => {
                    const id = reg._gastoId
                    // Una fila que Softland rechazaría se marca en el borde
                    const rechazada = validaciones.some(v => v.gastoId === id && v.nivel === 'bloquea')
                    const celda = (campo: string, extra: Partial<PropsCelda> = {}) => ({
                      gastoId: id,
                      campo,
                      guardando: celdaGuardando === `${id}:${campo}`,
                      onGuardar: guardarCampo,
                      ...extra,
                    })

                    return (
                      <tr
                        key={id || i}
                        title={rechazada ? 'Softland rechazaría esta línea — mirá las validaciones arriba' : undefined}
                        className={`border-t border-white/[0.05] hover:bg-white/[0.03] transition-colors group ${
                          rechazada ? 'bg-red-500/[0.04]' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4 text-gray-500 font-bold sticky left-0 bg-[#0f1117]">{i + 1}</td>

                        {/* Foto del ticket */}
                        <td className="py-2 px-4 text-center">
                          {id && reg._tieneFoto ? (
                            <button
                              onClick={() => setFotoAmpliada({
                                url: `${API_URL}/gastos-viaje/${id}/foto`,
                                titulo: `${reg.CORMVI_TIPORI} · ${reg.CORMVI_ARTORI} · $ ${formatImporte(reg.USR_CORMVI_PRECIO)}`,
                              })}
                              title="Ver el ticket en grande"
                              className="w-12 h-12 rounded-md overflow-hidden border border-white/[0.1] hover:border-blue-400/60 transition-all inline-block bg-black/30"
                            >
                              <img
                                src={`${API_URL}/gastos-viaje/${id}/foto`}
                                alt="Ticket"
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ) : (
                            <span className="text-gray-700 text-[10px]" title="Sin foto adjunta">—</span>
                          )}
                        </td>

                        {/* Se muestra el número de cuenta arriba y la razón social
                            abajo. A Softland viaja únicamente el número. */}
                        <Celda
                          {...celda('codigoProveedor')}
                          valor={reg.CORMVI_NROCTA}
                          className="text-gray-200"
                          render={(v) => <ProveedorInfo valor={v} />}
                          ayuda={(borrador) => <ProveedorInfo valor={borrador} compacto />}
                        />
                        <Celda {...celda('tipoProducto')}    valor={reg.CORMVI_TIPORI} className="text-blue-400 font-bold" />
                        <Celda {...celda('codigoArticulo')}  valor={reg.CORMVI_ARTORI} className="text-blue-300 font-semibold" />

                        {/* Constantes del formato CORMVI — no se editan */}
                        <td className="py-3.5 px-4 text-purple-400 font-semibold" title="Constante del formato CORMVI">{reg.CORMVI_TIPCPT}</td>
                        <td className="py-3.5 px-4 text-purple-300 font-semibold" title="Constante del formato CORMVI">{reg.CORMVI_CODCPT}</td>
                        <td className="py-3.5 px-4 text-gray-500" title="Constante del formato CORMVI">{reg.CORMVI_COFLIS}</td>

                        <Celda
                          {...celda('formalidad')}
                          valor={reg.USR_CORMVI_NLIIVA}
                          tipo="select"
                          opciones={[{ v: 'INFORMAL', label: 'S — Informal' }, { v: 'FORMAL', label: 'N — Formal' }]}
                          valorEdicion={reg.USR_CORMVI_NLIIVA === 'S' ? 'INFORMAL' : 'FORMAL'}
                          render={(v) => (
                            <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                              v === 'S' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
                            }`}>{v}</span>
                          )}
                        />

                        {/* Regla 7: un gasto de viaje se carga siempre con cantidad 1 */}
                        <td className="py-3.5 px-4 text-right text-gray-500 tabular-nums" title="En un RRFF la cantidad es siempre 1">
                          {reg.USR_CORMVI_CANTID}
                        </td>
                        <Celda {...celda('importe')}  valor={reg.USR_CORMVI_PRECIO}  tipo="number" alinear="right"
                               className="text-white font-bold" render={(v) => formatImporte(Number(v))} />

                        {/* Moneda del gasto — solo para leer la tabla; no se copia */}
                        <td className="py-3.5 px-4" title="Moneda del gasto. No se copia a Softland.">
                          {(() => {
                            const p = normalizarPais(reg._pais)
                            return (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-sm leading-none">{BANDERAS[p]}</span>
                                <span className="text-gray-300 font-semibold">{MONEDAS[p]}</span>
                              </span>
                            )
                          })()}
                        </td>

                        {/* Columna virtual: cantidad × precio, no se edita */}
                        <td className="py-3.5 px-4 text-right text-gray-400 tabular-nums" title="Cantidad × Precio">
                          {formatImporte(reg.VIRT_TOTLIN)}
                        </td>

                        {/* De la cabecera: se corrige arriba, no fila por fila */}
                        <td className="py-3.5 px-4 text-gray-300" title="Viene de la cabecera de la rendición">{reg.USR_CORMVI_PERLIQ}</td>

                        {/* Vacía en el 99,96% de las líneas reales de Softland */}
                        <td className="py-3.5 px-4 text-gray-700" title="En Softland esta columna va vacía">—</td>

                        {/* Lo que cargó el chofer. Se edita, pero no viaja a Softland. */}
                        <Celda {...celda('descripcion')} valor={reg._descripcion} className="text-gray-400" />

                        <Celda {...celda('empresaChofer')}  valor={reg.USR_CORMVI_EMPLEG} className="text-gray-300" />
                        <Celda {...celda('legajoChofer')}   valor={reg.USR_CORMVI_NROLEG} className="text-gray-200 font-semibold" />
                        <td className="py-3.5 px-4 text-gray-200 font-semibold" title="Hoja de viaje de esta rendición">
                          {reg.USR_CORMVI_NROVIA}
                        </td>
                        <Celda {...celda('rendicion')}      valor={reg.USR_CORMVI_NROFOR} className="text-gray-400"
                               render={(v) => String(v).slice(-8)} />
                        <Celda {...celda('patenteTractor')} valor={reg.USR_CORMVI_PATTRA} className="text-gray-200 font-semibold" />

                        {/* Constante 'N' — así vienen todas las filas reales de CORMVI */}
                        <td className="py-3.5 px-4 text-center text-gray-500" title="Línea a borrar — siempre N">
                          {reg.USR_CORMVI_DELETE}
                        </td>

                        {/* Fecha de salida del VIAJE (no la del ticket): es de la cabecera */}
                        <td className="py-3.5 px-4 text-gray-300" title="Fecha de salida del viaje. Se corrige en la cabecera.">
                          {fechaCorta(reg.USR_CORMVI_FCHCAL) || <span className="text-gray-700">—</span>}
                        </td>
                        {/* En los RRFF reales estas dos son 0: las completa Softland al autorizar */}
                        <td className="py-3.5 px-4 text-gray-600 tabular-nums" title="Siempre 0 en un RRFF: lo calcula Softland al autorizar">
                          {reg.USR_CORMVI_COSAVI}
                        </td>
                        <td className="py-3.5 px-4 text-right text-gray-600 tabular-nums" title="Siempre 0 en un RRFF: lo calcula Softland al autorizar">
                          {reg.USR_CORMVI_VAITSE}
                        </td>
                        <Celda {...celda('chofer')} valor={reg.USR_CORMVI_NOMLEG} className="text-gray-200" />
                        <td className="py-3.5 px-4 text-gray-500 tabular-nums" title="Valor vigente de la caja camión (USR_CAJCAM). Viene de la cabecera.">
                          {reg.USR_CORMVI_CAJCAM ?? <span className="text-gray-700">—</span>}
                        </td>
                        {/* Mismo precio y misma cantidad que las columnas USR_: Softland
                            guarda las dos y tienen que coincidir */}
                        <td className="py-3.5 px-4 text-right text-gray-300 tabular-nums" title="Igual al precio de arriba">
                          {formatImporte(reg.CORMVI_PRECIO)}
                        </td>
                        <td className="py-3.5 px-4 text-right text-gray-500 tabular-nums" title="En un RRFF la cantidad es siempre 1">
                          {reg.CORMVI_CANTID}
                        </td>

                        {/* De la cabecera: período numérico y fecha de llegada */}
                        <td className="py-3.5 px-4 text-right text-gray-300 tabular-nums" title="Mes de carga. Viene de la cabecera.">
                          {reg.USR_CORMVI_PERIOD || ''}
                        </td>
                        <td className="py-3.5 px-4 text-gray-300" title="Fecha de llegada del viaje. Se corrige en la cabecera.">
                          {fechaCorta(reg.USR_CORMVI_FCHLLE) || <span className="text-gray-700">—</span>}
                        </td>

                        {/* Copiar la fila completa en el orden de columnas de Softland */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => copiarFilas([reg], `fila-${i}`)}
                            title="Copiar esta fila (se pega en Excel como celdas)"
                            className={`w-7 h-7 rounded-md border transition-all inline-flex items-center justify-center ${
                              copiado === `fila-${i}`
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-white/[0.05] hover:bg-purple-500/20 text-gray-400 hover:text-purple-300 border-white/[0.08]'
                            }`}
                          >
                            {copiado === `fila-${i}`
                              ? <FaCheck className="text-[10px]" />
                              : <FaCopy className="text-[10px]" />}
                          </button>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => abrirEdicion(reg)}
                                title="Editar todos los campos de este gasto"
                                className="w-7 h-7 rounded-md bg-white/[0.05] hover:bg-blue-500/20 text-gray-400 hover:text-blue-300 border border-white/[0.08] transition-all inline-flex items-center justify-center"
                              >
                                <FaPen className="text-[10px]" />
                              </button>
                              {/* El borrado solo lo ve el rol 'admin' */}
                              {puedeEliminar && (
                                <button
                                  onClick={() => eliminarGasto(reg)}
                                  disabled={borrando === id}
                                  title="Eliminar este gasto"
                                  className="w-7 h-7 rounded-md bg-white/[0.05] hover:bg-red-500/20 text-gray-500 hover:text-red-300 border border-white/[0.08] transition-all inline-flex items-center justify-center disabled:opacity-40"
                                >
                                  {borrando === id
                                    ? <FaSpinner className="text-[10px] animate-spin" />
                                    : <FaTrash className="text-[10px]" />}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-700 text-[10px]" title="Gasto de la API externa — no se edita ni se borra acá">API</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Una fila de total por moneda: los importes no son sumables entre sí */}
                  {totalesGastos.map((t, i) => (
                    <tr
                      key={t.pais}
                      className={`bg-white/[0.03] ${i === 0 ? 'border-t-2 border-white/[0.08]' : ''}`}
                    >
                      {/* 10 de etiqueta + el importe bajo "Precio" + las 22 restantes = 33 */}
                      <td colSpan={10} className="py-3 px-4 text-right font-bold text-gray-400 text-xs uppercase tracking-wider">
                        Total {t.moneda}  <span className="text-gray-600 normal-case">{t.cantidad} reg.</span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-white text-base tabular-nums">
                        {formatImporte(t.total)}
                      </td>
                      <td colSpan={22} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ══ Aviso flotante si falla una edición inline ══ */}
      {errorCelda && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-950/95 border border-red-500/30 shadow-2xl backdrop-blur-sm">
          <FaExclamationTriangle className="text-red-400 text-xs flex-shrink-0" />
          <p className="text-xs text-red-300">{errorCelda}</p>
        </div>
      )}

      {/* ══ Visor de la foto del ticket ══ */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setFotoAmpliada(null)}
        >
          <div className="flex items-center gap-3 mb-3 max-w-full" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-300 font-medium truncate">{fotoAmpliada.titulo}</p>
            <a
              href={fotoAmpliada.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.08] hover:bg-white/[0.14] text-gray-200 transition-all flex-shrink-0"
            >
              <FaDownload className="text-[10px]" /> Abrir original
            </a>
            <button
              onClick={() => setFotoAmpliada(null)}
              className="w-8 h-8 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center text-gray-300 transition-all flex-shrink-0"
            >
              <FaTimes className="text-xs" />
            </button>
          </div>
          <img
            src={fotoAmpliada.url}
            alt="Ticket"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[82vh] object-contain rounded-lg border border-white/[0.1]"
          />
          <p className="text-[11px] text-gray-600 mt-3">Clic fuera de la imagen para cerrar</p>
        </div>
      )}

      {/* ══ Modal de edición ══ */}
      {editando && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
          onClick={cerrarEdicion}
        >
          <div
            className="bg-[#161821] border border-white/[0.08] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div className="sticky top-0 bg-[#161821] border-b border-white/[0.06] px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/15 flex items-center justify-center flex-shrink-0">
                <FaPen className="text-blue-400 text-xs" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white">Editar gasto</h3>
                <p className="text-[11px] text-gray-500">
                  Viaje {nroViaje} · guardado en dibiagi_admin_db
                </p>
              </div>
              <button
                onClick={cerrarEdicion}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-gray-400 hover:text-white transition-all"
              >
                <FaTimes className="text-xs" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {errorEdicion && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/[0.06] border border-red-500/20">
                  <FaExclamationTriangle className="text-red-400 text-xs flex-shrink-0" />
                  <p className="text-xs text-red-400">{errorEdicion}</p>
                </div>
              )}

              {/* Clasificación Softland */}
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Clasificación Softland</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Campo label="Tipo Producto" value={form.tipoProducto} onChange={(v) => setCampo('tipoProducto', v)} placeholder="TARIFA" />
                  <Campo label="Cód. Artículo" value={form.codigoArticulo} onChange={(v) => setCampo('codigoArticulo', v)} placeholder="14" />
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1.5">Formalidad</label>
                    <select
                      value={form.formalidad}
                      onChange={(e) => setCampo('formalidad', e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                    >
                      <option value="INFORMAL">INFORMAL</option>
                      <option value="FORMAL">FORMAL</option>
                    </select>
                  </div>
                  <div>
                    <Campo label="Proveedor (código)" value={form.codigoProveedor} onChange={(v) => setCampo('codigoProveedor', v)} placeholder="03" />
                    <div className="mt-1"><ProveedorInfo valor={form.codigoProveedor} compacto /></div>
                  </div>
                  <Campo label="Rendición" value={form.rendicion} onChange={(v) => setCampo('rendicion', v)} placeholder="0001-00001234" />
                </div>
              </div>

              {/* Importe. Cantidad, coeficiente y valor ítem no se editan: en un
                  RRFF la cantidad es 1 y los otros dos los calcula Softland. */}
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Importe</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Campo label="Precio" type="number" value={form.importe} onChange={(v) => setCampo('importe', v)} />
                </div>
                <p className="text-[11px] text-gray-600 mt-2">
                  La línea va con cantidad 1: el total es el mismo precio.
                </p>
              </div>

              {/* Chofer y vehículo */}
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Chofer y vehículo</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Campo label="Nombre empleado" value={form.chofer} onChange={(v) => setCampo('chofer', v)} />
                  <Campo label="Legajo" value={form.legajoChofer} onChange={(v) => setCampo('legajoChofer', v)} />
                  <Campo label="Empresa legajo" value={form.empresaChofer} onChange={(v) => setCampo('empresaChofer', v)} />
                  <Campo label="Tractor" value={form.patenteTractor} onChange={(v) => setCampo('patenteTractor', v)} />
                </div>
              </div>

              <Campo label="Detalle del ticket (queda en el panel, no va a Softland)"
                     value={form.descripcion} onChange={(v) => setCampo('descripcion', v)} />
            </div>

            {/* Footer del modal */}
            <div className="sticky bottom-0 bg-[#161821] border-t border-white/[0.06] px-5 py-4 flex items-center justify-end gap-2">
              <button
                onClick={cerrarEdicion}
                disabled={guardando}
                className="px-4 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardarEdicion}
                disabled={guardando}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all disabled:opacity-60"
              >
                {guardando
                  ? <><FaSpinner className="animate-spin text-[10px]" /> Guardando...</>
                  : <><FaSave className="text-[10px]" /> Guardar cambios</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   VALIDACIONES DE SOFTLAND

   Las reglas del motor GRTQVI (contexto CORMVH) corren mientras se tipea
   en la pantalla del ERP. Acá se corren antes, sobre la tabla armada, para
   que nadie pegue una rendición que Softland va a rechazar.

   El mensaje que se muestra es el TEXTUAL del ERP, con su número de regla:
   así, si administración lo ve después en Softland, es la misma frase.
   ══════════════════════════════════════════════════════════════════ */

function Validaciones({ hallazgos }: { hallazgos: Hallazgo[] }) {
  const bloqueos = hallazgos.filter(h => h.nivel === 'bloquea')
  const avisos = hallazgos.filter(h => h.nivel === 'aviso')

  if (hallazgos.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20">
        <FaCheck className="text-emerald-400 text-sm flex-shrink-0" />
        <p className="text-sm text-emerald-400">
          Pasa las validaciones de Softland para cargar una rendición.
        </p>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border p-5 ${
      bloqueos.length
        ? 'bg-red-500/[0.04] border-red-500/20'
        : 'bg-amber-500/[0.04] border-amber-500/20'
    }`}>
      <div className="flex items-center gap-2 mb-1">
        <FaExclamationTriangle className={`text-sm ${bloqueos.length ? 'text-red-400' : 'text-amber-400'}`} />
        <h2 className="text-sm font-semibold text-white">Validaciones de Softland</h2>
      </div>
      <p className="text-[11px] text-gray-500 mb-4">
        {bloqueos.length > 0 && <>{bloqueos.length} {bloqueos.length === 1 ? 'rechazo' : 'rechazos'}</>}
        {bloqueos.length > 0 && avisos.length > 0 && ' · '}
        {avisos.length > 0 && <>{avisos.length} {avisos.length === 1 ? 'aviso' : 'avisos'}</>}
        {' — es lo mismo que diría el ERP al cargar esta rendición.'}
      </p>

      <ul className="space-y-2.5">
        {hallazgos.map((h, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className={`mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
              h.nivel === 'bloquea'
                ? 'bg-red-500/15 text-red-300'
                : 'bg-amber-500/15 text-amber-300'
            }`}>
              {h.nivel === 'bloquea' ? 'RECHAZA' : 'AVISA'}
            </span>
            <div className="min-w-0">
              <p className={`text-xs ${h.nivel === 'bloquea' ? 'text-red-300' : 'text-amber-300'}`}>
                {h.mensaje}
              </p>
              {h.comoSeArregla && (
                <p className="text-[11px] text-gray-500 mt-0.5">{h.comoSeArregla}</p>
              )}
            </div>
            {h.regla > 0 && (
              <span className="ml-auto text-[10px] text-gray-600 flex-shrink-0" title="Número de regla en el motor GRTQVI de Softland">
                regla {h.regla}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   CABECERA DE LA RENDICIÓN — el equivalente a CORMVH

   Estas tres fechas son del viaje, no de cada ticket: todas las líneas
   heredan las mismas. Se calculan como en Softland (salida de la hoja de
   ruta, llegada de portería, período por la función usr_fn_devuelvePeriodo)
   y acá se pueden corregir. Corregir vuelve a armar todas las filas.
   ══════════════════════════════════════════════════════════════════ */

const ORIGEN_ETIQUETA: Record<OrigenCabecera, { texto: string; clase: string; ayuda: string }> = {
  chofer:    { texto: 'lo declaró el chofer', clase: 'bg-emerald-500/10 text-emerald-300', ayuda: 'El chofer la declaró al cerrar la hoja en la app, el día que llegó' },
  hoja:      { texto: 'hoja de ruta', clase: 'bg-blue-500/10 text-blue-300',      ayuda: 'Fecha cargada en la hoja de ruta (USR_GTVIAH)' },
  porteria:  { texto: 'portería',     clase: 'bg-blue-500/10 text-blue-300',      ayuda: 'Primera entrada del tractor por portería después de la salida' },
  calculado: { texto: 'calculado',    clase: 'bg-white/[0.06] text-gray-400',     ayuda: 'Lo calcula la misma fórmula que usa Softland' },
  manual:    { texto: 'corregido',    clase: 'bg-amber-500/10 text-amber-300',    ayuda: 'Corregido a mano desde este panel' },
  'sin-dato':{ texto: 'sin dato',     clase: 'bg-red-500/10 text-red-300',        ayuda: 'No hay dato: Softland va a rechazar la rendición así' },
}

function CabeceraRendicion({
  cabecera, onGuardar,
}: {
  cabecera: Cabecera
  onGuardar: (cambios: { salida?: string; llegada?: string; periodoLiquidar?: string }) => Promise<string | null>
}) {
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error, setError] = useState('')

  const aplicar = async (campo: 'salida' | 'llegada' | 'periodoLiquidar', valor: string) => {
    setGuardando(campo)
    setError('')
    const err = await onGuardar({ [campo]: valor })
    if (err) {
      setError(err)
      setTimeout(() => setError(''), 8000)
    }
    setGuardando(null)
  }

  const hayCorreccion = [cabecera.salida, cabecera.llegada, cabecera.periodoLiquidar]
    .some(v => v.origen === 'manual')

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <FaCalendarAlt className="text-purple-400 text-sm" />
        <h2 className="text-sm font-semibold text-white">Cabecera de la rendición</h2>
        {hayCorreccion && cabecera.actualizadoPor && (
          <span className="ml-auto text-[10px] text-amber-400/80">
            Corregido por {cabecera.actualizadoPor}
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-600 mb-4">
        Son datos del viaje: todas las líneas se cargan con estos valores.
      </p>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-500/[0.06] border border-red-500/20">
          <FaExclamationTriangle className="text-red-400 text-xs flex-shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <CampoCabecera
          label="Fecha de salida"
          valor={cabecera.salida}
          tipo="date"
          guardando={guardando === 'salida'}
          onAplicar={(v) => aplicar('salida', v)}
        />
        <CampoCabecera
          label="Fecha de llegada"
          valor={cabecera.llegada}
          tipo="date"
          guardando={guardando === 'llegada'}
          onAplicar={(v) => aplicar('llegada', v)}
        />
        <CampoCabecera
          label="Período a liquidar"
          valor={cabecera.periodoLiquidar}
          tipo="text"
          placeholder="AAAAMM"
          guardando={guardando === 'periodoLiquidar'}
          onAplicar={(v) => aplicar('periodoLiquidar', v)}
        />
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Período</p>
            <p className="text-sm text-gray-300 font-mono" title="Mes en que se carga la rendición">
              {cabecera.periodo || '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Caja camión</p>
            <p className="text-sm text-gray-300 font-mono" title="Valor vigente a la fecha de salida (USR_CAJCAM)">
              {cabecera.cajaCamion ?? '—'}
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}

/**
 * Un campo de la cabecera con su origen. El botón de volver atrás solo aparece
 * si el valor fue corregido a mano: manda "" y vuelve a mandar el calculado.
 */
function CampoCabecera({
  label, valor, tipo, placeholder, guardando, onAplicar,
}: {
  label: string
  valor: ValorCabecera
  tipo: 'date' | 'text'
  placeholder?: string
  guardando: boolean
  onAplicar: (v: string) => void
}) {
  const [borrador, setBorrador] = useState(valor.valor || '')
  const origen = ORIGEN_ETIQUETA[valor.origen]

  // Si el valor cambió del lado del servidor (p. ej. al revertir), se refleja acá
  useEffect(() => { setBorrador(valor.valor || '') }, [valor.valor])

  const sinCambios = (valor.valor || '') === borrador

  return (
    <div>
      <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
        {label}
        <span className={`normal-case tracking-normal px-1.5 py-0.5 rounded ${origen.clase}`} title={origen.ayuda}>
          {origen.texto}
        </span>
      </p>
      <div className="flex items-center gap-1.5">
        <input
          type={tipo}
          value={borrador}
          placeholder={placeholder}
          disabled={guardando}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !sinCambios) onAplicar(borrador) }}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-gray-700 focus:outline-none focus:border-blue-500/50 transition-colors disabled:opacity-50"
        />
        {guardando ? (
          <FaSpinner className="animate-spin text-blue-400 text-xs flex-shrink-0" />
        ) : (
          <>
            {!sinCambios && (
              <button
                onClick={() => onAplicar(borrador)}
                title="Guardar esta corrección"
                className="w-7 h-7 rounded-md bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center flex-shrink-0 transition-all"
              >
                <FaSave className="text-[10px]" />
              </button>
            )}
            {valor.origen === 'manual' && sinCambios && (
              <button
                onClick={() => onAplicar('')}
                title="Volver al valor calculado"
                className="w-7 h-7 rounded-md bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 hover:text-white border border-white/[0.08] flex items-center justify-center flex-shrink-0 transition-all"
              >
                <FaUndo className="text-[10px]" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   CELDA EDITABLE — un lápiz por columna
   Click en el lápiz → input inline. Enter guarda, Escape cancela.
   Si no hay `gastoId` (gasto de la API externa) es sólo lectura.
   ══════════════════════════════════════════════════════════════════ */
interface PropsCelda {
  valor: any
  campo: string
  gastoId?: string
  guardando?: boolean
  onGuardar?: (gastoId: string, campo: string, valor: any) => Promise<void>
  tipo?: 'text' | 'number' | 'date' | 'select'
  opciones?: { v: string; label: string }[]
  /** Valor que se carga en el input, si difiere del que se muestra */
  valorEdicion?: any
  /** Cómo se pinta el valor cuando NO se está editando */
  render?: (v: any) => React.ReactNode
  /** Qué se muestra debajo del input MIENTRAS se escribe */
  ayuda?: (borrador: string) => React.ReactNode
  className?: string
  alinear?: 'left' | 'right'
}

function Celda({
  valor, campo, gastoId, guardando, onGuardar,
  tipo = 'text', opciones, valorEdicion, render, ayuda,
  className = '', alinear = 'left',
}: PropsCelda) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  useEffect(() => {
    if (editando) inputRef.current?.focus()
  }, [editando])

  const editable = !!gastoId && !!onGuardar
  const vacio = valor === null || valor === undefined || valor === ''

  const abrir = () => {
    setBorrador(String(valorEdicion ?? valor ?? ''))
    setEditando(true)
  }

  const confirmar = async () => {
    setEditando(false)
    const original = String(valorEdicion ?? valor ?? '')
    if (borrador === original) return          // sin cambios, no molestamos al servidor

    let payload: any = borrador
    if (tipo === 'number') {
      payload = borrador === '' ? null : parseFloat(borrador)
      if (payload !== null && isNaN(payload)) return
    }
    if (tipo === 'date') {
      payload = borrador ? new Date(borrador).toISOString() : null
      if (!borrador) return                    // la fecha no puede quedar vacía
    }
    await onGuardar!(gastoId!, campo, payload)
  }

  const alineacion = alinear === 'right' ? 'text-right' : ''

  if (editando) {
    return (
      <td className={`py-2 px-2 ${alineacion}`}>
        {tipo === 'select' ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onBlur={confirmar}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditando(false) }}
            className="w-full bg-[#0b0d13] border border-blue-500/60 rounded px-2 py-1.5 text-xs text-white focus:outline-none"
          >
            {opciones?.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={tipo === 'number' ? 'number' : tipo === 'date' ? 'date' : 'text'}
            step={tipo === 'number' ? 'any' : undefined}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onBlur={confirmar}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); confirmar() }
              if (e.key === 'Escape') setEditando(false)
            }}
            className={`w-full min-w-[80px] bg-[#0b0d13] border border-blue-500/60 rounded px-2 py-1.5 text-xs text-white focus:outline-none ${alineacion}`}
          />
        )}
        {ayuda && <div className="mt-1">{ayuda(borrador)}</div>}
      </td>
    )
  }

  return (
    <td className={`py-3.5 px-4 ${alineacion} ${className}`}>
      <span className="inline-flex items-center gap-1.5 max-w-full">
        <span className="truncate">
          {guardando
            ? <FaSpinner className="animate-spin text-blue-400 text-[11px]" />
            : vacio
              ? <span className="text-gray-700">—</span>
              : (render ? render(valor) : valor)
          }
        </span>
        {editable && !guardando && (
          <button
            onClick={abrir}
            title={`Editar ${campo}`}
            className="text-gray-600 hover:text-blue-400 opacity-60 hover:opacity-100 transition-all flex-shrink-0"
          >
            <FaPen className="text-[9px]" />
          </button>
        )}
      </span>
    </td>
  )
}

/** Campo de texto reutilizable del modal de edición */
function Campo({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[11px] text-gray-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        step={type === 'number' ? 'any' : undefined}
        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-700 focus:outline-none focus:border-blue-500/50 transition-colors"
      />
    </div>
  )
}

/**
 * Número de proveedor con su razón social según el padrón de Softland.
 *
 * `compacto` es la versión de una línea que acompaña al input mientras se
 * tipea: responde "¿a quién corresponde este número?" antes de guardar.
 */
function ProveedorInfo({ valor, compacto = false }: { valor: unknown; compacto?: boolean }) {
  const p = resolverProveedor(valor)
  const chico = 'text-[10px] font-sans leading-tight'

  if (compacto) {
    switch (p.estado) {
      case 'vacio':       return <span className={`${chico} text-gray-600`}>Escribí el número de proveedor</span>
      case 'cargando':    return <span className={`${chico} text-gray-600`}>Cargando padrón…</span>
      case 'ok':          return <span className={`${chico} text-emerald-400`}>{p.nombre}</span>
      case 'baja':        return <span className={`${chico} text-amber-400`}>{p.nombre} — dado de baja</span>
      case 'inexistente': return <span className={`${chico} text-red-400`}>No existe en Softland</span>
      case 'sin-codigo':  return <span className={`${chico} text-amber-400`}>Poné el número, no el nombre</span>
    }
  }

  if (p.estado === 'vacio') return <span className="text-gray-700">—</span>

  // Se muestra lo que viaja a Softland arriba y la razón social abajo
  const numero = p.codigo || 'sin código'
  const colorNumero =
    p.estado === 'inexistente' ? 'text-red-400' :
    p.estado === 'sin-codigo'  ? 'text-amber-400' :
    'text-gray-100'

  const detalle =
    p.estado === 'ok'          ? <span className="text-gray-500">{p.nombre}</span> :
    p.estado === 'baja'        ? <span className="text-amber-400">{p.nombre} · dado de baja</span> :
    p.estado === 'inexistente' ? <span className="text-red-400">No existe en Softland</span> :
    p.estado === 'sin-codigo'  ? <span className="text-gray-500">{p.nombre}</span> :
    null

  return (
    <span
      className="block leading-tight"
      title={p.estado === 'inexistente' ? 'Este número no está en el padrón de proveedores. El alta en Softland lo va a rechazar.' : undefined}
    >
      <span className={`font-semibold ${colorNumero}`}>{numero}</span>
      {detalle && <span className={`block ${chico} mt-0.5 max-w-[220px] truncate`}>{detalle}</span>}
    </span>
  )
}