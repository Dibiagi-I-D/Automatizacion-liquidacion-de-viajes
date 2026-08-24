import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FaTruck, FaSpinner, FaUser, FaCalendarAlt, FaCheck,
  FaArrowLeft, FaClipboardCheck, FaExclamationTriangle,
  FaFileExport, FaTrailer, FaHashtag, FaBuilding, FaDownload,
  FaTimes, FaPen, FaSave
} from 'react-icons/fa'

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

// Interfaz que refleja la respuesta real de: GET /trips/v1/expenses-step1
// Campos documentados + campos técnicos que devuelve la API
interface GastoAPI {
  // ── Campos documentados ──────────────────────────────────────
  Codigo_Formulario:  string         // Siempre 'RRFF'
  Numero_Formulario:  string         // RENDICION  (ej: '0001-00001234')
  Nombre_Proveedor:   string         // Nombre del proveedor (display)
  Descripcion_Gasto:  string         // Descripción del gasto
  Cantidad:           number         // CANTIDAD del movimiento
  Precio_Unitario:    number         // PRECIO unitario
  Nombre_Chofer:      string         // NOMBRE EMPLEADO
  Numero_Viaje:       string | number // HOJA DE VIAJE N
  Patente_Tractor:    string         // TRACTOR
  // ── Campos técnicos (columnas Softland/CORMVI) ───────────────
  Proveedor:          string         // PROVEEDOR — código numérico (ej: 999999)
  Tipo_Producto:      string         // TIPO DE PRODUCTO ORIGINAL (TARIFA, etc.)
  Codigo_Articulo:    string         // CODIGO PRODUCTO ORIGINAL (10, 21, etc.)
  Informal:           string         // INFORMAL: 'S' / 'N'
  Periodo_Liquidacion: string        // PERIODO A LIQUIDAR (YYYYMM)
  Empresa_Legajo:     string         // EMPRESA LEGAJO
  Legajo:             string         // LEGAJO del chofer
  Fecha_Salida:       string | null  // FECHA SALIDA del viaje
  Coeficiente_Viaje:  number | null  // COEF. VIAJE SEGUN FECHA SALIDA
  Valor_Item:         number         // VALOR DE ITEM SELECCIONADO
  Valor_Caja_Camion:  number | null  // VALOR DE LA CAJA CAMION
  Cantidad_CORMVI:    number         // CANTIDAD CORMVI: -1 débito / 1 crédito
  // ── Sólo para gastos guardados en dibiagi_admin_db ────────────
  _localId?:          string         // id en dbo.gastos_viaje → habilita la edición
  _tieneFoto?:        boolean        // hay imagen del ticket adjunta
  [key: string]:      any            // otros campos técnicos adicionales
}

interface Aprobacion {
  nroViaje: number
  aprobadoPor: string
  fechaAprobacion: string
  totalImporte: number
}

interface CormviRecord {
  CORMVI_NROCTA: string        // PROVEEDOR
  CORMVI_TIPORI: string        // TIPO DE PRODUCTO ORIGINAL
  CORMVI_ARTORI: string        // CODIGO PRODUCTO ORIGINAL
  CORMVI_TIPCPT: string        // TIPO DE CONCEPTO — siempre 'A'
  CORMVI_CODCPT: string        // CONCEPTO — siempre 'S000'
  CORMVI_COFLIS: string        // COEFICIENTE — siempre 'ARS'
  USR_CORMVI_NLIIVA: string    // INFORMAL: 'S' / 'N'
  USR_CORMVI_CANTID: number    // CANTIDAD
  USR_CORMVI_PRECIO: number    // PRECIO
  VIRT_TOTLIN: number          // (virtual) CANTIDAD × PRECIO
  USR_CORMVI_PERLIQ: string    // PERIODO A LIQUIDAR
  USR_CORMVI_EMPLEG: string    // EMPRESA LEGAJO
  USR_CORMVI_NROLEG: string    // LEGAJO
  USR_CORMVI_NROVIA: number    // HOJA DE VIAJE N
  USR_CORMVI_NROFOR: string    // RENDICION
  USR_CORMVI_PATTRA: string    // TRACTOR
  USR_CORMVI_FCHCAL: string | null  // FECHA SALIDA
  USR_CORMVI_COSAVI: number | null  // COEF. VIAJE SEGUN FECHA SALIDA
  USR_CORMVI_VAITSE: number    // VALOR DE ITEM SELECCIONADO
  USR_CORMVI_NOMLEG: string    // NOMBRE EMPLEADO
  USR_CORMVI_CAJCAM: number | null  // VALOR DE LA CAJA CAMION
  CORMVI_PRECIO: number        // PRECIO (estándar Softland)
  CORMVI_CANTID: number        // CANTIDAD CORMVI (-1 / 1)
}

function gastoToCormvi(gasto: GastoAPI): CormviRecord {
  // Período de liquidación desde el campo de la API o derivado de Fecha_Salida
  const periodoLiq = gasto.Periodo_Liquidacion ||
    (gasto.Fecha_Salida
      ? (() => { const d = new Date(gasto.Fecha_Salida!); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}` })()
      : '')
  const fechaSalida = gasto.Fecha_Salida ?? null
  return {
    CORMVI_NROCTA:         gasto.Proveedor || '',          // código numérico del proveedor
    CORMVI_TIPORI:         gasto.Tipo_Producto || '',
    CORMVI_ARTORI:         gasto.Codigo_Articulo || '',
    CORMVI_TIPCPT:         'A',
    CORMVI_CODCPT:         'S000',
    CORMVI_COFLIS:         'ARS',
    USR_CORMVI_NLIIVA:     gasto.Informal === 'S' ? 'S' : 'N',
    USR_CORMVI_CANTID:     gasto.Cantidad ?? 1,
    USR_CORMVI_PRECIO:     gasto.Precio_Unitario,
    VIRT_TOTLIN:           (gasto.Cantidad ?? 1) * gasto.Precio_Unitario,
    USR_CORMVI_PERLIQ:     periodoLiq,
    USR_CORMVI_EMPLEG:     gasto.Empresa_Legajo || '',
    USR_CORMVI_NROLEG:     gasto.Legajo || '',
    USR_CORMVI_NROVIA:     Number(gasto.Numero_Viaje) || 0,
    USR_CORMVI_NROFOR:     gasto.Numero_Formulario || '',
    USR_CORMVI_PATTRA:     gasto.Patente_Tractor || '',
    USR_CORMVI_FCHCAL:     fechaSalida,
    USR_CORMVI_COSAVI:     gasto.Coeficiente_Viaje ?? null,
    USR_CORMVI_VAITSE:     gasto.Valor_Item ?? 0,
    USR_CORMVI_NOMLEG:     gasto.Nombre_Chofer || '',
    USR_CORMVI_CAJCAM:     gasto.Valor_Caja_Camion ?? null,
    CORMVI_PRECIO:         gasto.Precio_Unitario,
    CORMVI_CANTID:         gasto.Cantidad_CORMVI ?? -1,
  }
}

export default function AdminViajeDetalle() {
  const { nroViaje: nroViajeParam } = useParams<{ nroViaje: string }>()
  const navigate = useNavigate()
  const nroViaje = parseInt(nroViajeParam || '0')

  const [hoja, setHoja] = useState<HojaDeRuta | null>(null)
  const [gastos, setGastos] = useState<GastoAPI[]>([])
  const [aprobacion, setAprobacion] = useState<Aprobacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [aprobando, setAprobando] = useState(false)
  const [error, setError] = useState('')

  // Edición de gastos guardados en dibiagi_admin_db
  const [editando, setEditando] = useState<GastoAPI | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState('')

  // Edición inline celda por celda
  const [celdaGuardando, setCeldaGuardando] = useState<string | null>(null)
  const [errorCelda, setErrorCelda] = useState('')

  // Visor de la foto del ticket
  const [fotoAmpliada, setFotoAmpliada] = useState<{ url: string; titulo: string } | null>(null)

  const adminData = JSON.parse(sessionStorage.getItem('admin_user') || '{}')
  const estaAprobado = !!aprobacion

  // Generar registros CORMVI directamente desde los gastos (sin necesitar aprobación)
  const registrosCormvi = useMemo<CormviRecord[]>(
    () => gastos.map(g => gastoToCormvi(g)),
    [gastos]
  )

  useEffect(() => { cargarDatos() }, [nroViaje])

  /** Convierte un gasto registrado localmente al formato GastoAPI para unificarlo en la tabla */
  const localGastoToAPI = (g: any): GastoAPI => {
    const fecha = g.fecha ? new Date(g.fecha) : null
    const periodoLiq = fecha
      ? `${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}`
      : ''
    return {
      Codigo_Formulario:   'LOCAL',
      Numero_Formulario:   g.rendicion || g.id || '',
      Nombre_Proveedor:    g.codigoProveedor || '',
      Descripcion_Gasto:   g.descripcion || g.tipo || '',
      Cantidad:            g.cantidad ?? 1,
      Precio_Unitario:     g.importe ?? 0,
      Nombre_Chofer:       g.chofer || '',
      Numero_Viaje:        g.nroViaje,
      Patente_Tractor:     g.patenteTractor || '',
      Proveedor:           g.codigoProveedor || '',
      Tipo_Producto:       g.tipoProducto || '',
      Codigo_Articulo:     g.codigoArticulo || '',
      Informal:            g.formalidad === 'INFORMAL' ? 'S' : 'N',
      Periodo_Liquidacion: periodoLiq,
      Empresa_Legajo:      g.empresaChofer || '',
      Legajo:              g.legajoChofer || '',
      Fecha_Salida:        g.fecha || null,
      Coeficiente_Viaje:   g.coeficienteViaje ?? null,
      Valor_Item:          g.valorItemSeleccionado ?? g.importe ?? 0,
      Valor_Caja_Camion:   g.valorCajaCamion ?? null,
      Cantidad_CORMVI:     g.cantidadCormvi ?? -1,
      _localId:            g.id,
      _tieneFoto:          !!g.tieneFoto,
    }
  }

  const cargarDatos = async () => {
    try {
      setLoading(true)
      setError('')

      const [resHojas, resLocal, resExterno, resAprob] = await Promise.all([
        fetch(`${API_URL}/drivers/roadmaps-public`),
        // Gastos registrados localmente (en memoria del servidor)
        fetch(`${API_URL}/gastos-viaje/${nroViaje}`),
        // Gastos desde la API externa (expenses-step1) — puede no estar disponible aún
        fetch(`${API_URL}/drivers/expenses-step1?search=${nroViaje}&limit=200`).catch(() => null),
        fetch(`${API_URL}/gastos-viaje/aprobaciones/todas`),
      ])

      if (resHojas.ok) {
        const data = await resHojas.json()
        if (data.success) {
          const found = (data.data || []).find((h: HojaDeRuta) => h.Nro_Viaje === nroViaje)
          setHoja(found || null)
        }
      }

      // Gastos locales → convertir al formato GastoAPI
      const gastosLocales: GastoAPI[] = []
      if (resLocal.ok) {
        const data = await resLocal.json()
        const locales = data.data || []
        gastosLocales.push(...locales.map(localGastoToAPI))
      }

      // Gastos externos (API portería) — solo si respondió OK
      const gastosExternos: GastoAPI[] = []
      if (resExterno && resExterno.ok) {
        const data = await resExterno.json()
        if (data.success && Array.isArray(data.data)) {
          gastosExternos.push(...data.data)
        }
      }

      // Mergear: externos primero, luego locales (evitar duplicados por Numero_Formulario)
      const formulariosSeen = new Set(gastosExternos.map(g => g.Numero_Formulario).filter(Boolean))
      const localesSinDuplicar = gastosLocales.filter(g => !formulariosSeen.has(g.Numero_Formulario))
      setGastos([...gastosExternos, ...localesSinDuplicar])

      if (resAprob.ok) {
        const data = await resAprob.json()
        setAprobacion(data.data?.[nroViaje] || null)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setLoading(false)
    }
  }

  const totalImporte = gastos.reduce((sum, g) => sum + (g.Precio_Unitario ?? 0), 0)

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'En curso'
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const formatImporte = (n: number) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

  const aprobarRendicion = async () => {
    if (!confirm(`Aprobar la rendicion del Viaje ${nroViaje}?\n\nTotal: $ ${formatImporte(totalImporte)}`)) return
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
   * Guarda un solo campo de un gasto (edición inline).
   * Actualiza la fila en memoria con lo que devuelve el servidor, en vez de
   * recargar todo: la tabla es ancha y un reload completo perdería el scroll.
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

      // Reemplazar sólo la fila afectada
      const actualizado = localGastoToAPI(data.data)
      setGastos(prev => prev.map(g => (g._localId === gastoId ? actualizado : g)))
    } catch (err) {
      setErrorCelda(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
      // Que el error no quede colgado en pantalla para siempre
      setTimeout(() => setErrorCelda(''), 6000)
    } finally {
      setCeldaGuardando(null)
    }
  }

  // ── Edición de un gasto guardado en dibiagi_admin_db ──────────────
  const abrirEdicion = (g: GastoAPI) => {
    setErrorEdicion('')
    setEditando(g)
    setForm({
      codigoProveedor:       g.Proveedor ?? '',
      tipoProducto:          g.Tipo_Producto ?? '',
      codigoArticulo:        g.Codigo_Articulo ?? '',
      formalidad:            g.Informal === 'S' ? 'INFORMAL' : 'FORMAL',
      cantidad:              String(g.Cantidad ?? 1),
      importe:               String(g.Precio_Unitario ?? 0),
      cantidadCormvi:        String(g.Cantidad_CORMVI ?? -1),
      valorItemSeleccionado: String(g.Valor_Item ?? g.Precio_Unitario ?? 0),
      rendicion:             g.Numero_Formulario ?? '',
      legajoChofer:          g.Legajo ?? '',
      empresaChofer:         g.Empresa_Legajo ?? '',
      chofer:                g.Nombre_Chofer ?? '',
      patenteTractor:        g.Patente_Tractor ?? '',
      descripcion:           g.Descripcion_Gasto ?? '',
      fecha:                 g.Fecha_Salida ? new Date(g.Fecha_Salida).toISOString().split('T')[0] : '',
    })
  }

  const cerrarEdicion = () => {
    setEditando(null)
    setForm({})
    setErrorEdicion('')
  }

  const setCampo = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }))

  const guardarEdicion = async () => {
    if (!editando?._localId) return

    const importeNum = parseFloat(form.importe)
    if (isNaN(importeNum) || importeNum <= 0) {
      setErrorEdicion('El precio debe ser un número mayor a 0')
      return
    }
    const cantidadNum = parseFloat(form.cantidad)
    if (isNaN(cantidadNum)) {
      setErrorEdicion('La cantidad debe ser un número')
      return
    }

    setGuardando(true)
    setErrorEdicion('')
    try {
      const res = await fetch(`${API_URL}/gastos-viaje/${editando._localId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoProveedor:       form.codigoProveedor,
          tipoProducto:          form.tipoProducto,
          codigoArticulo:        form.codigoArticulo,
          formalidad:            form.formalidad,
          cantidad:              cantidadNum,
          importe:               importeNum,
          cantidadCormvi:        parseFloat(form.cantidadCormvi),
          valorItemSeleccionado: parseFloat(form.valorItemSeleccionado),
          rendicion:             form.rendicion,
          legajoChofer:          form.legajoChofer,
          empresaChofer:         form.empresaChofer,
          chofer:                form.chofer,
          patenteTractor:        form.patenteTractor,
          descripcion:           form.descripcion,
          ...(form.fecha ? { fecha: new Date(form.fecha).toISOString() } : {}),
        })
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Error ${res.status}`)
      }

      cerrarEdicion()
      await cargarDatos()   // recarga desde la BD → /admin y la app del chofer quedan iguales
    } catch (err) {
      setErrorEdicion(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
    } finally {
      setGuardando(false)
    }
  }

  const descargarCSV = () => {
    if (registrosCormvi.length === 0) return
    const headers = Object.keys(registrosCormvi[0]) as (keyof CormviRecord)[]
    const rows = [
      headers.join(';'),
      ...registrosCormvi.map(r =>
        headers.map(h => {
          const v = r[h]
          return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v
        }).join(';')
      )
    ]
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `CORMVI_Viaje_${nroViaje}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const descargarJSON = () => {
    const payload = {
      nroViaje,
      chofer: gastos[0]?.Nombre_Chofer || '',
      legajoChofer: gastos[0]?.Legajo || '',
      patenteTractor: gastos[0]?.Patente_Tractor || '',
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
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
            {gastos.length > 0 && (
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

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/[0.04] border border-red-500/20">
            <FaExclamationTriangle className="text-red-400 text-sm flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
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
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FaCalendarAlt className="text-[9px]" /> Salida
                </p>
                <p className="text-sm text-gray-300">{formatFecha(hoja.Fecha_Salida)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FaCalendarAlt className="text-[9px]" /> Llegada
                </p>
                <p className="text-sm text-gray-300">{formatFecha(hoja.Fecha_Llegada)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FaHashtag className="text-[9px]" /> N Viaje
                </p>
                <p className="text-sm text-white font-mono font-medium">{nroViaje}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Gastos</p>
                <p className="text-sm text-white font-medium">
                  {gastos.length} registros  <span className="text-emerald-400">$ {formatImporte(totalImporte)}</span>
                </p>
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

        {/* Tabla CORMVI  siempre visible */}
        {gastos.length === 0 ? (
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
                  {registrosCormvi.length} registros  $ {formatImporte(totalImporte)}
                  {!estaAprobado && (
                    <span className="ml-2 text-amber-500"> Pendiente de aprobacion</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
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
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[150px]">Período a Liquidar</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[130px]">Empresa Legajo</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[90px]">Legajo</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[130px]">Hoja de Viaje N°</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[110px]">Rendición</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[100px]">Tractor</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[120px]">Fecha Salida</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[240px]">Coef. Viaje según Fecha Salida</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[160px]">Valor Ítem Seleccionado</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[160px]">Nombre Empleado</th>
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[160px]">Valor Caja Camión</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[110px]">Precio</th>
                    <th className="text-right py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[100px]">Cantidad</th>
                    <th className="text-center py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider min-w-[80px]">Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosCormvi.map((reg, i) => {
                    const g = gastos[i]
                    const id = g?._localId
                    // Sólo los gastos guardados en dibiagi_admin_db se pueden editar.
                    // Los que vienen de la API de portería son de solo lectura.
                    const celda = (campo: string, extra: Partial<PropsCelda> = {}) => ({
                      gastoId: id,
                      campo,
                      guardando: celdaGuardando === `${id}:${campo}`,
                      onGuardar: guardarCampo,
                      ...extra,
                    })

                    return (
                      <tr key={g?._localId || i} className="border-t border-white/[0.05] hover:bg-white/[0.03] transition-colors group">
                        <td className="py-3.5 px-4 text-gray-500 font-bold sticky left-0 bg-[#0f1117]">{i + 1}</td>

                        {/* Foto del ticket */}
                        <td className="py-2 px-4 text-center">
                          {id && g?._tieneFoto ? (
                            <button
                              onClick={() => setFotoAmpliada({
                                url: `${API_URL}/gastos-viaje/${id}/foto`,
                                titulo: `${reg.CORMVI_TIPORI}/${reg.CORMVI_ARTORI} · $ ${formatImporte(reg.USR_CORMVI_PRECIO)}`,
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

                        <Celda {...celda('codigoProveedor')} valor={reg.CORMVI_NROCTA} className="text-gray-400" />
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

                        <Celda {...celda('cantidad')} valor={reg.USR_CORMVI_CANTID} tipo="number" alinear="right" className="text-gray-200" />
                        <Celda {...celda('importe')}  valor={reg.USR_CORMVI_PRECIO}  tipo="number" alinear="right"
                               className="text-white font-bold" render={(v) => formatImporte(Number(v))} />

                        {/* Derivado de la fecha — se cambia editando Fecha Salida */}
                        <td className="py-3.5 px-4 text-gray-300" title="Se deriva de la Fecha Salida">{reg.USR_CORMVI_PERLIQ}</td>

                        <Celda {...celda('empresaChofer')}  valor={reg.USR_CORMVI_EMPLEG} className="text-gray-300" />
                        <Celda {...celda('legajoChofer')}   valor={reg.USR_CORMVI_NROLEG} className="text-gray-200 font-semibold" />
                        <Celda {...celda('nroViaje')}       valor={reg.USR_CORMVI_NROVIA} tipo="number" className="text-gray-200 font-semibold" />
                        <Celda {...celda('rendicion')}      valor={reg.USR_CORMVI_NROFOR} className="text-gray-400"
                               render={(v) => String(v).slice(-8)} />
                        <Celda {...celda('patenteTractor')} valor={reg.USR_CORMVI_PATTRA} className="text-gray-200 font-semibold" />
                        <Celda
                          {...celda('fecha')}
                          valor={reg.USR_CORMVI_FCHCAL}
                          tipo="date"
                          className="text-gray-300"
                          valorEdicion={reg.USR_CORMVI_FCHCAL ? String(reg.USR_CORMVI_FCHCAL).split(' ')[0] : ''}
                          render={(v) => (v ? String(v).split(' ')[0] : '')}
                        />
                        <Celda {...celda('coeficienteViaje')}      valor={reg.USR_CORMVI_COSAVI} tipo="number" className="text-gray-500" />
                        <Celda {...celda('valorItemSeleccionado')} valor={reg.USR_CORMVI_VAITSE} tipo="number" alinear="right" className="text-gray-400" />
                        <Celda {...celda('chofer')}                valor={reg.USR_CORMVI_NOMLEG} className="text-gray-200" />
                        <Celda {...celda('valorCajaCamion')}       valor={reg.USR_CORMVI_CAJCAM} tipo="number" className="text-gray-500" />
                        <Celda {...celda('importe')}               valor={reg.CORMVI_PRECIO} tipo="number" alinear="right"
                               className="text-gray-300" render={(v) => formatImporte(Number(v))} />
                        <Celda {...celda('cantidadCormvi')}        valor={reg.CORMVI_CANTID} tipo="number" alinear="right" className="text-gray-300" />

                        <td className="py-3.5 px-4 text-center">
                          {id ? (
                            <button
                              onClick={() => abrirEdicion(g)}
                              title="Editar todos los campos de este gasto"
                              className="w-7 h-7 rounded-md bg-white/[0.05] hover:bg-blue-500/20 text-gray-400 hover:text-blue-300 border border-white/[0.08] transition-all inline-flex items-center justify-center"
                            >
                              <FaPen className="text-[10px]" />
                            </button>
                          ) : (
                            <span className="text-gray-700 text-[10px]" title="Gasto de la API externa — no editable acá">API</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="border-t-2 border-white/[0.08] bg-white/[0.03]">
                    <td colSpan={10} className="py-4 px-4 text-right font-bold text-gray-400 text-xs uppercase tracking-wider">TOTAL</td>
                    <td className="py-4 px-4 text-right font-bold text-white text-base">
                      {formatImporte(totalImporte)}
                    </td>
                    <td colSpan={14} />
                  </tr>
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
                  <Campo label="Proveedor (código)" value={form.codigoProveedor} onChange={(v) => setCampo('codigoProveedor', v)} placeholder="999999" />
                  <Campo label="Rendición" value={form.rendicion} onChange={(v) => setCampo('rendicion', v)} placeholder="0001-00001234" />
                  <Campo label="Fecha salida" type="date" value={form.fecha} onChange={(v) => setCampo('fecha', v)} />
                </div>
              </div>

              {/* Importes */}
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Importes</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Campo label="Precio" type="number" value={form.importe} onChange={(v) => setCampo('importe', v)} />
                  <Campo label="Cantidad" type="number" value={form.cantidad} onChange={(v) => setCampo('cantidad', v)} />
                  <Campo label="Cant. CORMVI" type="number" value={form.cantidadCormvi} onChange={(v) => setCampo('cantidadCormvi', v)} />
                  <Campo label="Valor ítem" type="number" value={form.valorItemSeleccionado} onChange={(v) => setCampo('valorItemSeleccionado', v)} />
                </div>
                <p className="text-[11px] text-gray-600 mt-2">
                  Total línea: <span className="text-emerald-400 font-medium">
                    $ {formatImporte((parseFloat(form.cantidad) || 0) * (parseFloat(form.importe) || 0))}
                  </span>
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

              <Campo label="Descripción" value={form.descripcion} onChange={(v) => setCampo('descripcion', v)} />
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
  className?: string
  alinear?: 'left' | 'right'
}

function Celda({
  valor, campo, gastoId, guardando, onGuardar,
  tipo = 'text', opciones, valorEdicion, render,
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