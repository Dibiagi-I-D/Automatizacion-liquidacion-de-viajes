/**
 * PROVEEDORES — resolución contra el padrón real de Softland (PVMPRH).
 *
 * En CORMVI la columna PROVEEDOR (`CORMVI_NROCTA`) es un número de cuenta, y
 * el número es la fuente de verdad: el nombre que se muestra tiene que salir de
 * PVMPRH. Antes había acá una lista de 15 proveedores escrita a mano; los
 * números eran los más usados, pero 14 de los 15 nombres no correspondían
 * (el 177 figuraba como "ATA / Despachantes" y en Softland es ISCAMEN).
 *
 * El padrón se baja una vez por sesión y la resolución es sincrónica, para que
 * funcione dentro de la tabla, al copiar filas y mientras se tipea un número.
 */

const API_URL = import.meta.env.VITE_API_URL || '/api'

interface Proveedor {
  codigo: string
  nombre: string
  activo: boolean
}

/**
 * - `ok`          el número existe en Softland
 * - `baja`        existe pero está dado de baja
 * - `inexistente` se cargó un número que Softland no tiene: el alta va a fallar
 * - `sin-codigo`  hay un texto (razón social del OCR) que no se pudo asociar
 * - `vacio`       no hay nada cargado
 * - `cargando`    todavía no llegó el padrón
 */
export type EstadoProveedor = 'ok' | 'baja' | 'inexistente' | 'sin-codigo' | 'vacio' | 'cargando'

export interface ProveedorResuelto {
  /** Lo que viaja a Softland. Vacío si no hay un número válido para mandar. */
  codigo: string
  /** Razón social según PVMPRH, o el texto original si no se pudo resolver. */
  nombre: string
  estado: EstadoProveedor
}

let porCodigo: Map<string, Proveedor> | null = null
/** `null` como valor marca un nombre que comparten varios códigos (ej. '03' y '00'). */
let porNombre: Map<string, Proveedor | null> | null = null
let carga: Promise<void> | null = null

/** Sin acentos, sin signos y en minúsculas, para comparar razones sociales. */
function normalizar(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Baja el padrón una sola vez; si falla, la próxima llamada reintenta. */
export function cargarProveedores(token: string): Promise<void> {
  if (porCodigo) return Promise.resolve()
  if (carga) return carga

  carga = (async () => {
    const res = await fetch(`${API_URL}/proveedores`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(data.error || `Error ${res.status}`)

    const lista: Proveedor[] = data.data || []
    const codigos = new Map<string, Proveedor>()
    const nombres = new Map<string, Proveedor | null>()

    for (const p of lista) {
      codigos.set(p.codigo, p)
      const clave = normalizar(p.nombre)
      if (!clave) continue
      // Un nombre repetido no identifica a nadie: no se usa para resolver
      nombres.set(clave, nombres.has(clave) ? null : p)
    }

    porCodigo = codigos
    porNombre = nombres
  })()

  carga.catch(() => { carga = null })
  return carga
}

/**
 * Resuelve lo que haya guardado en el gasto —un número o una razón social— y
 * devuelve el número para Softland, el nombre real y en qué estado quedó.
 *
 * El número se compara tal cual, sin espacios pero conservando los ceros a la
 * izquierda: en Softland '03', '3', '00' y '0' son cuatro proveedores distintos.
 */
export function resolverProveedor(valor: unknown): ProveedorResuelto {
  const bruto = String(valor ?? '').trim()
  if (!bruto) return { codigo: '', nombre: '', estado: 'vacio' }

  const esNumero = /^\d+$/.test(bruto)

  if (!porCodigo || !porNombre) {
    return esNumero
      ? { codigo: bruto, nombre: '', estado: 'cargando' }
      : { codigo: '', nombre: bruto, estado: 'cargando' }
  }

  const p = porCodigo.get(bruto)
  if (p) return { codigo: p.codigo, nombre: p.nombre, estado: p.activo ? 'ok' : 'baja' }

  // El OCR guarda la razón social: solo se asocia si coincide con UNA del padrón
  const porRazon = porNombre.get(normalizar(bruto))
  if (porRazon) {
    return { codigo: porRazon.codigo, nombre: porRazon.nombre, estado: porRazon.activo ? 'ok' : 'baja' }
  }

  if (esNumero) return { codigo: bruto, nombre: '', estado: 'inexistente' }
  return { codigo: '', nombre: bruto, estado: 'sin-codigo' }
}
