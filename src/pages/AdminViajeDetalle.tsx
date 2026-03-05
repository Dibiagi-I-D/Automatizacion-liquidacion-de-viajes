import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  FaTruck, FaSpinner, FaUser, FaCalendarAlt, FaCheck,
  FaArrowLeft, FaClipboardCheck, FaExclamationTriangle,
  FaFileExport, FaTrailer, FaHashtag, FaBuilding, FaDownload,
  FaTimes
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

            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="bg-white/[0.04] border-b-2 border-white/[0.08]">
                    <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs uppercase tracking-wider sticky left-0 bg-[#161821] min-w-[40px]">#</th>
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
                  </tr>
                </thead>
                <tbody>
                  {registrosCormvi.map((reg, i) => (
                    <tr key={i} className="border-t border-white/[0.05] hover:bg-white/[0.03] transition-colors">
                      <td className="py-3.5 px-4 text-gray-500 font-bold sticky left-0 bg-[#0f1117]">{i + 1}</td>
                      <td className="py-3.5 px-4 text-gray-400">{reg.CORMVI_NROCTA || <span className="text-gray-700">—</span>}</td>
                      <td className="py-3.5 px-4 text-blue-400 font-bold">{reg.CORMVI_TIPORI}</td>
                      <td className="py-3.5 px-4 text-blue-300 font-semibold">{reg.CORMVI_ARTORI}</td>
                      <td className="py-3.5 px-4 text-purple-400 font-semibold">{reg.CORMVI_TIPCPT || <span className="text-gray-700">—</span>}</td>
                      <td className="py-3.5 px-4 text-purple-300 font-semibold">{reg.CORMVI_CODCPT || <span className="text-gray-700">—</span>}</td>
                      <td className="py-3.5 px-4 text-gray-500">{reg.CORMVI_COFLIS || <span className="text-gray-700">—</span>}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                          reg.USR_CORMVI_NLIIVA === 'S'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-300'
                        }`}>
                          {reg.USR_CORMVI_NLIIVA}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-gray-200">{reg.USR_CORMVI_CANTID}</td>
                      <td className="py-3.5 px-4 text-right text-white font-bold">{formatImporte(reg.USR_CORMVI_PRECIO)}</td>
                      <td className="py-3.5 px-4 text-gray-300">{reg.USR_CORMVI_PERLIQ}</td>
                      <td className="py-3.5 px-4 text-gray-300">{reg.USR_CORMVI_EMPLEG || <span className="text-gray-700">—</span>}</td>
                      <td className="py-3.5 px-4 text-gray-200 font-semibold">{reg.USR_CORMVI_NROLEG || <span className="text-gray-700 font-normal">—</span>}</td>
                      <td className="py-3.5 px-4 text-gray-200 font-semibold">{reg.USR_CORMVI_NROVIA}</td>
                      <td className="py-3.5 px-4 text-gray-400">{reg.USR_CORMVI_NROFOR.slice(-8)}</td>
                      <td className="py-3.5 px-4 text-gray-200 font-semibold">{reg.USR_CORMVI_PATTRA || <span className="text-gray-700 font-normal">—</span>}</td>
                      <td className="py-3.5 px-4 text-gray-300">{reg.USR_CORMVI_FCHCAL}</td>
                      <td className="py-3.5 px-4 text-gray-500">{reg.USR_CORMVI_COSAVI || <span className="text-gray-700">—</span>}</td>
                      <td className="py-3.5 px-4 text-right text-gray-400">{reg.USR_CORMVI_VAITSE}</td>
                      <td className="py-3.5 px-4 text-gray-200">{reg.USR_CORMVI_NOMLEG || <span className="text-gray-700">—</span>}</td>
                      <td className="py-3.5 px-4 text-gray-500">{reg.USR_CORMVI_CAJCAM || <span className="text-gray-700">—</span>}</td>
                      <td className="py-3.5 px-4 text-right text-gray-300">{formatImporte(reg.CORMVI_PRECIO)}</td>
                      <td className="py-3.5 px-4 text-right text-gray-300">{reg.CORMVI_CANTID}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-white/[0.08] bg-white/[0.03]">
                    <td colSpan={9} className="py-4 px-4 text-right font-bold text-gray-400 text-xs uppercase tracking-wider">TOTAL</td>
                    <td className="py-4 px-4 text-right font-bold text-white text-base">
                      {formatImporte(totalImporte)}
                    </td>
                    <td colSpan={13} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}