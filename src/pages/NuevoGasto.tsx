import { useState, FormEvent, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGastos } from '../context/GastosContext'
import { Pais, TipoGasto, BANDERAS, NOMBRES_PAIS, NOMBRES_TIPO, calcularPasoVisual } from '../types'
import { FaCheck, FaSpinner, FaArrowLeft, FaReceipt } from 'react-icons/fa'

export default function NuevoGasto() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { agregarGasto, loading } = useGastos()
  
  const nroViaje = searchParams.get('viaje')
  
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [pais, setPais] = useState<Pais>('ARG')
  const [tipo, setTipo] = useState<TipoGasto>('COMBUSTIBLE')
  const [importe, setImporte] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [gastosCount, setGastosCount] = useState(0)

  // Contar gastos del viaje actual al cargar
  useEffect(() => {
    if (nroViaje) {
      const gastosGuardados = localStorage.getItem('gastos_viajes')
      if (gastosGuardados) {
        const gastos = JSON.parse(gastosGuardados)
        const gastosDelViaje = gastos.filter((g: any) => g.nroViaje === parseInt(nroViaje))
        setGastosCount(gastosDelViaje.length)
      }
    }
  }, [nroViaje])

  // Calcular paso visual en tiempo real
  const pasoVisual = importe ? calcularPasoVisual(pais, parseFloat(importe) || 0) : null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const importeNum = parseFloat(importe)
    if (isNaN(importeNum) || importeNum <= 0) {
      alert('Por favor ingresá un importe válido')
      return
    }

    if (!nroViaje) {
      alert('No se especificó un número de viaje')
      return
    }

    try {
      // Crear objeto de gasto
      const nuevoGasto = {
        id: Date.now().toString(),
        nroViaje: parseInt(nroViaje),
        fecha: new Date(fecha).toISOString(),
        pais,
        tipo,
        importe: importeNum,
        descripcion: descripcion.trim() || undefined,
        createdAt: new Date().toISOString()
      }

      // Obtener gastos existentes del localStorage
      const gastosGuardados = localStorage.getItem('gastos_viajes')
      const gastos = gastosGuardados ? JSON.parse(gastosGuardados) : []
      
      // Agregar nuevo gasto
      gastos.push(nuevoGasto)
      
      // Guardar en localStorage
      localStorage.setItem('gastos_viajes', JSON.stringify(gastos))

      console.log('✅ Gasto guardado en localStorage:', nuevoGasto)
      console.log('📊 Total de gastos:', gastos.length)

      // Actualizar contador de gastos del viaje
      setGastosCount(gastosCount + 1)

      // Limpiar solo los campos del formulario (mantener fecha)
      setImporte('')
      setDescripcion('')
      setShowSuccess(true)
      
      // Ocultar mensaje de éxito después de 2 segundos
      setTimeout(() => {
        setShowSuccess(false)
      }, 2000)
    } catch (err) {
      console.error('Error al guardar gasto:', err)
      alert('Error al agregar el gasto. Por favor intentá de nuevo.')
    }
  }

  return (
    <div className="section-container">
      {/* Botón volver */}
      <button
        onClick={() => navigate('/dashboard/hojas-ruta')}
        className="mb-4 text-gray-500 hover:text-white transition-colors flex items-center gap-2 text-sm"
      >
        <FaArrowLeft className="text-xs" />
        Volver
      </button>

      {/* Info del viaje */}
      {nroViaje && (
        <div className="info-panel mb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600/15 flex items-center justify-center">
                <FaReceipt className="text-emerald-400 text-sm" />
              </div>
              <div>
                <p className="text-xs text-gray-500">
                  Registrando gasto
                </p>
                <p className="text-white text-sm font-semibold">
                  Viaje {nroViaje}
                </p>
              </div>
            </div>
            {gastosCount > 0 && (
              <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md">
                {gastosCount} registrado{gastosCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Indicador de paso visual */}
      {pasoVisual && (
        <div className={`paso-indicator ${pasoVisual === 1 ? 'paso1' : 'paso2'}`}>
          PASO {pasoVisual}
        </div>
      )}

      {/* Mensaje de éxito */}
      {showSuccess && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-slide-up text-sm">
          <FaCheck className="text-xs" />
          <span className="font-medium">Gasto registrado correctamente</span>
        </div>
      )}

      <h1 className="text-lg font-semibold text-white mb-5">Nuevo Gasto</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Fecha */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
            Fecha
          </label>
          <input
            type="date"
            className="input-field text-sm"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            required
          />
        </div>

        {/* País */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
            País
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(BANDERAS) as Pais[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPais(p)}
                className={`min-h-[52px] px-3 py-2.5 rounded-xl border transition-all active:scale-95 ${
                  pais === p
                    ? 'bg-emerald-600/10 border-emerald-500/30 text-white'
                    : 'bg-white/[0.02] border-white/[0.06] text-gray-500'
                }`}
              >
                <div className="text-xl mb-0.5">{BANDERAS[p]}</div>
                <div className="text-[10px] font-medium">{NOMBRES_PAIS[p]}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Tipo de gasto */}
        {/* <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Tipo de gasto
          </label>
          <select
            className="input-field"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoGasto)}
            required
          >
            {(Object.keys(NOMBRES_TIPO) as TipoGasto[]).map((t) => (
              <option key={t} value={t}>
                {NOMBRES_TIPO[t]}
              </option>
            ))}
          </select>
        </div> */}

        {/* Importe */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
            Importe
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="input-field text-sm"
            placeholder="0.00"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            required
          />
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
            Descripción <span className="text-gray-600 normal-case tracking-normal">(opcional)</span>
          </label>
          <textarea
            className="input-field resize-none text-sm"
            rows={3}
            placeholder="Detalles adicionales..."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>

        {/* Botón submit */}
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading}
        >
          {loading ? (
            <>
              <FaSpinner className="animate-spin mr-2" />
              Registrando...
            </>
          ) : (
            'Registrar Gasto'
          )}
        </button>
      </form>
    </div>
  )
}
