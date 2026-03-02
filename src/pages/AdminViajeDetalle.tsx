import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BANDERAS, NOMBRES_PAIS, Pais } from '../types'
import {
  FaTruck, FaSpinner, FaUser, FaCalendarAlt, FaCheck,
  FaArrowLeft, FaClipboardCheck, FaExclamationTriangle,
  FaFileExport, FaMapMarkerAlt, FaTrailer, FaHashtag,
  FaBuilding, FaDownload
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

interface Gasto {
  id: string
  nroViaje: number
  fecha: string
  pais: Pais
  tipo: string
  tipoProducto: string
  codigoArticulo: string
  formalidad: string
  proveedor: string
  importe: number
  descripcion?: string
  chofer: string
  legajoChofer: string
  empresaChofer: string
  patenteTractor: string
  createdAt: string
}

interface Aprobacion {
  nroViaje: number
  aprobadoPor: string
  fechaAprobacion: string
  totalImporte: number
}

interface CormviData {
  nroViaje: number
  chofer: string
  legajoChofer: string
  patenteTractor: string
  totalRegistros: number
  totalImporte: number
  aprobacion: Aprobacion
  registros: Record<string, any>[]
  gastosOriginales: Gasto[]
}

type Vista = 'gastos' | 'cormvi'

export default function AdminViajeDetalle() {
  const { nroViaje: nroViajeParam } = useParams<{ nroViaje: string }>()
  const navigate = useNavigate()
  const nroViaje = parseInt(nroViajeParam || '0')

  const [hoja, setHoja] = useState<HojaDeRuta | null>(null)
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [aprobacion, setAprobacion] = useState<Aprobacion | null>(null)
  const [cormviData, setCormviData] = useState<CormviData | null>(null)
  const [vista, setVista] = useState<Vista>('gastos')
  const [loading, setLoading] = useState(true)
  const [aprobando, setAprobando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState('')

  const adminData = JSON.parse(sessionStorage.getItem('admin_user') || '{}')

  useEffect(() => {
    cargarDatos()
  }, [nroViaje])

  const cargarDatos = async () => {
    try {
      setLoading(true)
      setError('')

      // Cargar hoja de ruta
      const resHojas = await fetch(`${API_URL}/drivers/roadmaps-public`)
      if (resHojas.ok) {
        const data = await resHojas.json()
        if (data.success) {
          const found = (data.data || []).find((h: HojaDeRuta) => h.Nro_Viaje === nroViaje)
          setHoja(found || null)
        }
      }

      // Cargar gastos del viaje
      const resGastos = await fetch(`${API_URL}/gastos-viaje/${nroViaje}`)
      if (resGastos.ok) {
        const data = await resGastos.json()
        setGastos(data.data || [])
      }

      // Cargar aprobación
      const resAprob = await fetch(`${API_URL}/gastos-viaje/aprobaciones/todas`)
      if (resAprob.ok) {
        const data = await resAprob.json()
        setAprobacion(data.data?.[nroViaje] || null)
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const totalImporte = gastos.reduce((sum, g) => sum + g.importe, 0)

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'En curso'
    return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const formatImporte = (importe: number) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(importe)

  const aprobarRendicion = async () => {
    if (!confirm(`¿Aprobar la rendición del Viaje ${nroViaje}?\n\nTotal: $ ${formatImporte(totalImporte)}\n\nEsto habilitará la exportación a Softland.`)) return
    setAprobando(true)
    try {
      const res = await fetch(`${API_URL}/gastos-viaje/aprobaciones/${nroViaje}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aprobadoPor: adminData.nombre || 'Administrador',
          totalImporte,
          chofer: hoja?.Nombre_Chofer || '',
          patenteTractor: hoja?.Patente_Tractor || '',
        })
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
    if (!confirm('¿Revocar la aprobación? Volverá a estado pendiente.')) return
    try {
      const res = await fetch(`${API_URL}/gastos-viaje/aprobaciones/${nroViaje}`, { method: 'DELETE' })
      if (res.ok) {
        setAprobacion(null)
        setCormviData(null)
        setVista('gastos')
      }
    } catch (err) {
      console.error('Error al revocar:', err)
    }
  }

  const cargarCormvi = async () => {
    if (cormviData) { setVista('cormvi'); return }
    setExportando(true)
    try {
      const res = await fetch(`${API_URL}/gastos-viaje/exportar-cormvi/${nroViaje}`)
      const data = await res.json()
      if (!data.success) { alert(data.error || 'Error al exportar'); return }
      setCormviData(data.data)
      setVista('cormvi')
    } catch (err) {
      alert('Error de conexión al exportar')
    } finally {
      setExportando(false)
    }
  }

  const descargarCSV = () => {
    if (!cormviData?.registros) return
    const headers = Object.keys(cormviData.registros[0])
    const rows = [
      headers.join(';'),
      ...cormviData.registros.map(r =>
        headers.map(h => {
          const v = r[h]
          return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v
        }).join(';')
      )
    ]
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `CORMVI_Viaje_${nroViaje}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const descargarJSON = () => {
    if (!cormviData) return
    const blob = new Blob([JSON.stringify(cormviData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `CORMVI_Viaje_${nroViaje}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Loading ───
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

  const estaAprobado = !!aprobacion

  return (
    <div className="min-h-screen bg-[#0f1117]">

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[#0f1117]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
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
                {hoja && (
                  <span className="text-gray-500 font-normal text-sm ml-2">
                    — {hoja.Nombre_Chofer}
                  </span>
                )}
              </h1>
              <p className="text-xs text-gray-500">Panel Administrativo</p>
            </div>
          </div>
          <span className={`text-[11px] px-2.5 py-1 rounded-lg font-medium flex-shrink-0 ${
            estaAprobado
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            {estaAprobado ? '✓ Aprobado' : 'Pendiente'}
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Error ── */}
        {error && (
          <div className="info-panel border-red-500/20 bg-red-500/[0.04] flex items-center gap-2">
            <FaExclamationTriangle className="text-red-400 text-sm flex-shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* ── Info del viaje ── */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FaTruck className="text-blue-400 text-sm" />
            <h2 className="text-sm font-semibold text-white">Datos del Viaje</h2>
            {hoja && (
              <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-md font-medium ${
                hoja.Estado_Viaje === 'Abierto' ? 'status-open' : 'status-closed'
              }`}>
                {hoja.Estado_Viaje}
              </span>
            )}
          </div>
          {hoja ? (
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
                <p className="text-sm text-gray-300">{hoja.Patente_Semirremolque || '—'}</p>
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
                  <FaHashtag className="text-[9px]" /> N° Viaje
                </p>
                <p className="text-sm text-white font-mono font-medium">{nroViaje}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Gastos</p>
                <p className="text-sm text-white font-medium">
                  {gastos.length} registros · <span className="text-emerald-400">$ {formatImporte(totalImporte)}</span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No se encontró la hoja de ruta para este viaje.</p>
          )}
        </div>

        {/* ── Aprobación info ── */}
        {estaAprobado && aprobacion && (
          <div className="glass-card p-4 border border-emerald-500/10 bg-emerald-500/[0.03] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FaCheck className="text-emerald-400 text-sm" />
              <p className="text-sm text-emerald-400">
                Aprobado por <strong>{aprobacion.aprobadoPor}</strong> el {formatFecha(aprobacion.fechaAprobacion)}
              </p>
            </div>
            <button
              onClick={revocarAprobacion}
              className="text-[11px] text-gray-600 hover:text-red-400 transition-colors underline"
            >
              Revocar
            </button>
          </div>
        )}

        {/* ── Tabs: Gastos / CORMVI ── */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVista('gastos')}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all border ${
              vista === 'gastos'
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                : 'bg-white/[0.02] border-white/[0.06] text-gray-500 hover:text-gray-300'
            }`}
          >
            Gastos ({gastos.length})
          </button>
          <button
            onClick={cargarCormvi}
            disabled={!estaAprobado || exportando}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all border flex items-center gap-1.5 ${
              vista === 'cormvi'
                ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                : estaAprobado
                  ? 'bg-white/[0.02] border-white/[0.06] text-gray-500 hover:text-gray-300'
                  : 'bg-white/[0.01] border-white/[0.03] text-gray-700 cursor-not-allowed'
            }`}
            title={!estaAprobado ? 'Debés aprobar la rendición primero' : ''}
          >
            {exportando ? <FaSpinner className="animate-spin text-[10px]" /> : <FaFileExport className="text-[10px]" />}
            Exportación CORMVI
            {!estaAprobado && <span className="text-[10px] text-gray-700">(requiere aprobación)</span>}
          </button>
        </div>

        {/* ══════════════════════════════════ */}
        {/* VISTA: GASTOS                      */}
        {/* ══════════════════════════════════ */}
        {vista === 'gastos' && (
          <div className="glass-card overflow-hidden">
            {gastos.length === 0 ? (
              <div className="p-10 text-center">
                <FaClipboardCheck className="text-2xl text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No hay gastos cargados para este viaje.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/[0.04]">
                      <th className="text-left py-3 px-4 text-gray-500 font-medium uppercase tracking-wider">Fecha</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium uppercase tracking-wider">País</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium uppercase tracking-wider">Concepto</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium uppercase tracking-wider">Código</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium uppercase tracking-wider">Formalidad</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium uppercase tracking-wider">Proveedor</th>
                      <th className="text-left py-3 px-4 text-gray-500 font-medium uppercase tracking-wider">Descripción</th>
                      <th className="text-right py-3 px-4 text-gray-500 font-medium uppercase tracking-wider">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.map((gasto) => (
                      <tr key={gasto.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-3 px-4 text-gray-300">{formatFecha(gasto.fecha)}</td>
                        <td className="py-3 px-4">
                          <span className="flex items-center gap-1.5">
                            <span>{BANDERAS[gasto.pais]}</span>
                            <span className="text-gray-400">{NOMBRES_PAIS[gasto.pais]}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-gray-300">{gasto.tipo}</span>
                          {gasto.tipoProducto && (
                            <span className="block text-[10px] text-gray-600">{gasto.tipoProducto}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-400 font-mono text-[11px]">
                          {gasto.tipoProducto && gasto.codigoArticulo
                            ? `${gasto.tipoProducto}/${gasto.codigoArticulo}`
                            : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            gasto.formalidad === 'FORMAL'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {gasto.formalidad || 'N/D'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-400 max-w-[150px] truncate text-[11px]">
                          {gasto.proveedor || '—'}
                        </td>
                        <td className="py-3 px-4 text-gray-500 max-w-[200px] truncate">
                          {gasto.descripcion || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-white">$ {formatImporte(gasto.importe)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-white/[0.06] bg-white/[0.02]">
                      <td colSpan={7} className="py-3 px-4 text-right font-semibold text-gray-400">TOTAL</td>
                      <td className="py-3 px-4 text-right font-bold text-white text-sm">$ {formatImporte(totalImporte)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Botón Aprobar */}
            {gastos.length > 0 && (
              <div className="p-4 border-t border-white/[0.04] flex justify-end">
                {!estaAprobado ? (
                  <button
                    onClick={aprobarRendicion}
                    disabled={aprobando}
                    className="px-6 py-2.5 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-2 disabled:opacity-60"
                  >
                    {aprobando
                      ? <><FaSpinner className="animate-spin text-xs" /> Aprobando...</>
                      : <><FaCheck className="text-xs" /> Aprobar Rendición</>
                    }
                  </button>
                ) : (
                  <button
                    onClick={cargarCormvi}
                    disabled={exportando}
                    className="px-6 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-2 disabled:opacity-60"
                  >
                    {exportando
                      ? <><FaSpinner className="animate-spin text-xs" /> Generando...</>
                      : <><FaFileExport className="text-xs" /> Ver Exportación CORMVI</>
                    }
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════ */}
        {/* VISTA: CORMVI                      */}
        {/* ══════════════════════════════════ */}
        {vista === 'cormvi' && cormviData && (
          <div className="space-y-4">
            {/* Resumen CORMVI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="glass-card p-4">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Registros</p>
                <p className="text-2xl font-bold text-white">{cormviData.totalRegistros}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">Líneas CORMVI</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total</p>
                <p className="text-xl font-bold text-emerald-400">$ {formatImporte(cormviData.totalImporte)}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">Importe total</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Legajo</p>
                <p className="text-xl font-bold text-white font-mono">{cormviData.legajoChofer || '—'}</p>
                <p className="text-[10px] text-gray-600 mt-0.5 truncate">{cormviData.chofer}</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Patente</p>
                <p className="text-xl font-bold text-white font-mono">{cormviData.patenteTractor}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">Tractor</p>
              </div>
            </div>

            {/* Tabla CORMVI */}
            <div className="glass-card overflow-hidden">
              <div className="p-4 border-b border-white/[0.04] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <FaFileExport className="text-purple-400 text-xs" />
                    Registros CORMVI — Viaje {nroViaje}
                  </h3>
                  <p className="text-[10px] text-gray-600 mt-0.5">Formato compatible con tabla CORMVI de Softland</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={descargarCSV}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 border border-white/[0.06] transition-all flex items-center gap-1.5"
                  >
                    <FaDownload className="text-[10px]" /> CSV
                  </button>
                  <button
                    onClick={descargarJSON}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-1.5"
                  >
                    <FaDownload className="text-[10px]" /> JSON
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/[0.04]">
                      <th className="text-left py-2.5 px-3 text-gray-600 font-medium">#</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">TIPORI</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">ARTORI</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">TIPCPT</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">CODCPT</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">COFLIS</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">NLIIVA</th>
                      <th className="text-right py-2.5 px-3 text-gray-500 font-medium">CANTID</th>
                      <th className="text-right py-2.5 px-3 text-gray-500 font-medium">PRECIO</th>
                      <th className="text-right py-2.5 px-3 text-gray-500 font-medium">TOTLIN</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">PERLIQ</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">EMPLEG</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">NROLEG</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">NROVIA</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">NROFOR</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">PATTRA</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">FCHCAL</th>
                      <th className="text-right py-2.5 px-3 text-gray-500 font-medium">VAITSE</th>
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">NOMLEG</th>
                      <th className="text-right py-2.5 px-3 text-gray-500 font-medium">PRECIO_STD</th>
                      <th className="text-right py-2.5 px-3 text-gray-500 font-medium">CANTID_STD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cormviData.registros.map((reg, i) => (
                      <tr key={i} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-2 px-3 text-gray-600">{i + 1}</td>
                        <td className="py-2 px-3 text-blue-400 font-semibold">{reg.CORMVI_TIPORI}</td>
                        <td className="py-2 px-3 text-blue-300">{reg.CORMVI_ARTORI}</td>
                        <td className="py-2 px-3 text-purple-400">{reg.CORMVI_TIPCPT || '—'}</td>
                        <td className="py-2 px-3 text-purple-300">{reg.CORMVI_CODCPT || '—'}</td>
                        <td className="py-2 px-3 text-gray-600">{reg.CORMVI_COFLIS || '—'}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            reg.USR_CORMVI_NLIIVA === 'S'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {reg.USR_CORMVI_NLIIVA}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-gray-300">{reg.USR_CORMVI_CANTID}</td>
                        <td className="py-2 px-3 text-right text-white font-semibold">{formatImporte(reg.USR_CORMVI_PRECIO)}</td>
                        <td className="py-2 px-3 text-right text-emerald-400 font-semibold">{formatImporte(reg.VIRT_TOTLIN)}</td>
                        <td className="py-2 px-3 text-gray-400">{reg.USR_CORMVI_PERLIQ}</td>
                        <td className="py-2 px-3 text-gray-400">{reg.USR_CORMVI_EMPLEG || '—'}</td>
                        <td className="py-2 px-3 text-gray-300">{reg.USR_CORMVI_NROLEG || '—'}</td>
                        <td className="py-2 px-3 text-gray-300">{reg.USR_CORMVI_NROVIA}</td>
                        <td className="py-2 px-3 text-gray-600 text-[10px]">{reg.USR_CORMVI_NROFOR?.slice(-8)}</td>
                        <td className="py-2 px-3 text-gray-300">{reg.USR_CORMVI_PATTRA}</td>
                        <td className="py-2 px-3 text-gray-400">{reg.USR_CORMVI_FCHCAL}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{reg.USR_CORMVI_VAITSE}</td>
                        <td className="py-2 px-3 text-gray-400 max-w-[120px] truncate">{reg.USR_CORMVI_NOMLEG || '—'}</td>
                        <td className="py-2 px-3 text-right text-gray-400">{formatImporte(reg.CORMVI_PRECIO)}</td>
                        <td className="py-2 px-3 text-right text-gray-400">{reg.CORMVI_CANTID}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
