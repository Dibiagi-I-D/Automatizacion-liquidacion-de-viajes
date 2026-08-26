const API_URL = import.meta.env.VITE_API_URL || '/api'

export interface HojaDeRuta {
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

export interface ViajeActivo {
  nroViaje: number
  codEmpresa: string
  patente: string
  numeroInterno: number
  tipoMovimiento: string
  fechaMovimiento: string
  horaMovimiento: string
  origenMovimiento: string
  destinoMovimiento: string
  chofer: string
  legajoChofer: string
  empresaChofer: string
  patenteSemi: string
  fechaSalida: string | null
  fechaLlegada: string | null
  origenHR: string
  destinoHR: string
  observaciones: string
  cerrado: string
  liquidado: string
}

export type ResultadoViaje =
  /** Hay hoja abierta para este chofer + tractor */
  | { estado: 'encontrado'; hoja: HojaDeRuta; viaje: ViajeActivo | null; modo: 'tiempo-real' | 'historial' }
  /** SQL respondió bien y este chofer NO tiene hoja abierta con ese tractor */
  | { estado: 'sin-hoja'; mensaje: string }
  /** No se pudo consultar */
  | { estado: 'error'; mensaje: string }

interface ChoferLogueado {
  legajo?: string
  interno?: string
  nombreCompleto?: string
}

/** Arma una HojaDeRuta con los datos que devuelve SQL Server (USR_GTVIAH). */
function hojaDesdeViaje(v: ViajeActivo, patenteFallback: string): HojaDeRuta {
  return {
    Cod_Empresa: v.codEmpresa || '',
    Nro_Viaje: v.nroViaje,
    Fecha_Salida: v.fechaSalida || '',
    Fecha_Llegada: v.fechaLlegada || null,
    Nombre_Chofer: v.chofer || '',
    Patente_Tractor: v.patente || patenteFallback,
    Patente_Semirremolque: v.patenteSemi || '',
    Observaciones: v.observaciones || '',
    Estado_Viaje: v.cerrado === 'N' ? 'Abierto' : 'Cerrado',
  }
}

/**
 * Devuelve LA hoja de ruta que el chofer está usando ahora — nunca un historial.
 *
 * Cruza los dos datos del login: patente del tractor y legajo del chofer.
 * Si el chofer no tiene una hoja abierta con ese tractor, devuelve 'sin-hoja'
 * en vez de caer al historial, porque el fallback devolvería la de otro chofer.
 *
 * Solo si SQL Server está caído se recurre a la API externa, y ahí también se
 * queda con una sola hoja: la de número más alto.
 */
export async function buscarViajeActivo(chofer: ChoferLogueado | null): Promise<ResultadoViaje> {
  // Ojo con el nombre: `interno` guarda la PATENTE, no el número interno.
  const patente = (chofer?.interno || '').trim()
  const legajo = (chofer?.legajo || '').trim()
  const nombre = (chofer?.nombreCompleto || '').trim()

  if (!patente) {
    return { estado: 'error', mensaje: 'No hay un tractor asociado a esta sesión. Volvé a ingresar.' }
  }

  // ── Camino principal: SQL Server, cruzando patente + legajo ──
  let sqlDisponible = true
  try {
    const res = await fetch(
      `${API_URL}/drivers/viaje-activo-public` +
      `?patente=${encodeURIComponent(patente)}` +
      `&legajo=${encodeURIComponent(legajo)}`
    )
    const data = await res.json()

    if (data.sqlError) {
      sqlDisponible = false
    } else if (data.success && data.found && data.data?.nroViaje) {
      const viaje = data.data as ViajeActivo
      return { estado: 'encontrado', hoja: hojaDesdeViaje(viaje, patente), viaje, modo: 'tiempo-real' }
    } else {
      return {
        estado: 'sin-hoja',
        mensaje: `No encontramos una hoja de ruta abierta para ${nombre || 'este chofer'} ` +
                 `con el tractor ${patente}. Verificá que hayas seleccionado tu tractor al ingresar.`,
      }
    }
  } catch {
    sqlDisponible = false
  }

  if (sqlDisponible) {
    return { estado: 'error', mensaje: 'No se pudo determinar tu viaje. Intentá de nuevo en unos segundos.' }
  }

  // ── Fallback: historial de la API externa, quedándose con la más reciente ──
  try {
    const res = await fetch(`${API_URL}/drivers/roadmaps-public`)
    if (res.status === 500) {
      return { estado: 'error', mensaje: 'La API de hojas de ruta está devolviendo un error. Contactá al administrador.' }
    }

    const data = await res.json()
    if (!data.success) {
      return { estado: 'error', mensaje: data.message || 'Error al cargar hojas de ruta' }
    }

    const norm = (s: string) => (s || '').trim().toUpperCase()
    const normPat = (s: string) => norm(s).replace(/\s+/g, '')

    const propias: HojaDeRuta[] = (data.data || []).filter((h: HojaDeRuta) =>
      h.Nombre_Chofer && h.Patente_Tractor &&
      norm(h.Nombre_Chofer) === norm(nombre) &&
      normPat(h.Patente_Tractor) === normPat(patente)
    )

    if (propias.length === 0) {
      return {
        estado: 'sin-hoja',
        mensaje: `No encontramos hojas de ruta para ${nombre || 'este chofer'} con el tractor ${patente}.`,
      }
    }

    // Solo la más reciente: el chofer trabaja sobre una hoja por vez.
    const masReciente = propias.sort((a, b) => b.Nro_Viaje - a.Nro_Viaje)[0]
    return { estado: 'encontrado', hoja: masReciente, viaje: null, modo: 'historial' }
  } catch {
    return { estado: 'error', mensaje: 'Error de conexión al buscar tu viaje.' }
  }
}
