import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaTruck, FaSpinner, FaMapMarkedAlt, FaCalendarAlt, FaCheckCircle, FaClock, FaPlus, FaUser, FaTrailer } from 'react-icons/fa'
import { useAuth } from '../context/AuthContext'

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

export default function HojasDeRuta() {
  const navigate = useNavigate()
  const { chofer } = useAuth()
  const [hojasDeRuta, setHojasDeRuta] = useState<HojaDeRuta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [gastosCount, setGastosCount] = useState<Record<number, number>>({})

  // Cargar conteo de gastos desde localStorage
  useEffect(() => {
    const gastosGuardados = localStorage.getItem('gastos_viajes')
    if (gastosGuardados) {
      const gastos = JSON.parse(gastosGuardados)
      const counts: Record<number, number> = {}
      gastos.forEach((gasto: any) => {
        counts[gasto.nroViaje] = (counts[gasto.nroViaje] || 0) + 1
      })
      setGastosCount(counts)
    }
  }, [hojasDeRuta])

  useEffect(() => {
    cargarHojasDeRuta()
  }, [])

  const cargarHojasDeRuta = async () => {
    try {
      setLoading(true)
      setError('')
      
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/drivers/roadmaps-public`)
      
      // Si la API devuelve error 500, mostrar mensaje específico
      if (response.status === 500) {
        setError('⚠️ Error en la API de hojas de ruta. El servidor externo está devolviendo un error 500. Por favor contacta al administrador del sistema.')
        setLoading(false)
        return
      }
      
      const data = await response.json()
      
      if (data.success) {
        // Filtrar solo las hojas de ruta del chofer y tractor logueados
        const nombreChofer = (chofer as any)?.nombreCompleto || ''
        const patenteTractor = chofer?.interno || ''
        const nroInterno = (chofer as any)?.nroInterno || ''
        
        console.log('🔍 DEBUG - Datos de filtrado:')
        console.log('Chofer logueado:', nombreChofer)
        console.log('Patente logueada:', patenteTractor)
        console.log('Nro Interno logueado:', nroInterno)
        console.log('Total de hojas recibidas:', data.data.length)
        
        // Mostrar primeras hojas para debug con TODOS los campos
        if (data.data.length > 0) {
          console.log('📄 HOJA 1 COMPLETA:', JSON.stringify(data.data[0], null, 2))
          console.log('📄 HOJA 1 - Nombre_Chofer:', data.data[0].Nombre_Chofer)
          console.log('📄 HOJA 1 - Patente_Tractor:', data.data[0].Patente_Tractor)
          
          if (data.data.length > 1) {
            console.log('📄 HOJA 2 - Nombre_Chofer:', data.data[1].Nombre_Chofer)
            console.log('📄 HOJA 2 - Patente_Tractor:', data.data[1].Patente_Tractor)
          }
        }
        
        // Buscar específicamente hojas que tengan la patente o el chofer
        const hojasConEstaPatente = data.data.filter((h: HojaDeRuta) => 
          h.Patente_Tractor && h.Patente_Tractor.includes('427')
        )
        console.log('🚗 Hojas con patente que contiene "427":', hojasConEstaPatente.length)
        if (hojasConEstaPatente.length > 0) {
          console.log('🚗 Primera hoja con esta patente:', hojasConEstaPatente[0])
        }
        
        const hojasConEsteChofer = data.data.filter((h: HojaDeRuta) => 
          h.Nombre_Chofer && h.Nombre_Chofer.includes('Valenzuela')
        )
        console.log('👤 Hojas con chofer que contiene "Valenzuela":', hojasConEsteChofer.length)
        if (hojasConEsteChofer.length > 0) {
          console.log('👤 Primera hoja con este chofer:', hojasConEsteChofer[0])
        }
        
        const hojasFiltradas = data.data.filter((hoja: HojaDeRuta) => {
          // Validar que existan los campos necesarios
          if (!hoja.Nombre_Chofer || !hoja.Patente_Tractor) {
            return false
          }
          
          // Normalizar nombres para comparación (sin espacios extras, mayúsculas)
          const nombreHojaNormalizado = (hoja.Nombre_Chofer || '').trim().toUpperCase()
          const nombreChoferNormalizado = (nombreChofer || '').trim().toUpperCase()
          
          // Normalizar patentes (eliminar TODOS los espacios)
          const patenteHojaNormalizada = (hoja.Patente_Tractor || '').trim().toUpperCase().replace(/\s+/g, '')
          const patenteTractorNormalizada = (patenteTractor || '').trim().toUpperCase().replace(/\s+/g, '')
          
          const nombreMatch = nombreHojaNormalizado === nombreChoferNormalizado
          const patenteMatch = patenteHojaNormalizada === patenteTractorNormalizada
          
          // Debug de cada comparación
          console.log('📋 Comparando hoja de ruta:', {
            nroViaje: hoja.Nro_Viaje,
            choferHoja: hoja.Nombre_Chofer,
            patenteHoja: hoja.Patente_Tractor,
            choferLogueado: nombreChofer,
            patenteLogueada: patenteTractor,
            nombreMatch,
            patenteMatch,
            ambosMatch: nombreMatch && patenteMatch
          })
          
          return nombreMatch && patenteMatch
        })
        
        console.log('✅ Hojas filtradas:', hojasFiltradas.length)
        if (hojasFiltradas.length > 0) {
          console.log('Hojas que pasaron el filtro:', hojasFiltradas)
        }
        
        // Ordenar por número de viaje descendente (el más reciente primero)
        const hojasOrdenadas = hojasFiltradas.sort((a: HojaDeRuta, b: HojaDeRuta) => b.Nro_Viaje - a.Nro_Viaje)
        
        // Filtrar: mostrar solo el último viaje y los que estén a menos de 10 días
        let hojasRecientes: HojaDeRuta[] = []
        
        if (hojasOrdenadas.length > 0) {
          const viajeReciente = hojasOrdenadas[0]
          hojasRecientes.push(viajeReciente)
          
          // Fecha del viaje más reciente
          const fechaReciente = new Date(viajeReciente.Fecha_Salida)
          
          // Agregar viajes con menos de 10 días de diferencia
          for (let i = 1; i < hojasOrdenadas.length; i++) {
            const hoja = hojasOrdenadas[i]
            const fechaHoja = new Date(hoja.Fecha_Salida)
            const diferenciaDias = Math.abs((fechaReciente.getTime() - fechaHoja.getTime()) / (1000 * 60 * 60 * 24))
            
            if (diferenciaDias <= 10) {
              hojasRecientes.push(hoja)
            }
          }
        }
        
        console.log('📅 Viajes recientes (últimos 10 días):', hojasRecientes.length)
        setHojasDeRuta(hojasRecientes)
      } else {
        setError(data.message || 'Error al cargar hojas de ruta')
      }
    } catch (err) {
      console.error('Error al cargar hojas de ruta:', err)
      setError('⚠️ La API de hojas de ruta está devolviendo un error 500. Por favor contacta al administrador del sistema o intenta más tarde.')
    } finally {
      setLoading(false)
    }
  }

  const filteredHojas = hojasDeRuta.filter(hoja => 
    hoja.Nro_Viaje.toString().includes(searchQuery) ||
    hoja.Nombre_Chofer.toLowerCase().includes(searchQuery.toLowerCase()) ||
    hoja.Patente_Tractor.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'En curso'
    return new Date(fecha).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="section-container flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <FaSpinner className="animate-spin text-2xl text-emerald-400 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando hojas de ruta...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="section-container">
        <div className="info-panel border-red-500/20 bg-red-500/[0.04]">
          <p className="font-medium text-red-400 text-sm mb-1">Error de conexión</p>
          <p className="text-xs text-gray-500">{error}</p>
          <button
            onClick={cargarHojasDeRuta}
            className="mt-3 btn-primary text-sm"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="section-container">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold text-white">
          Hojas de Ruta
        </h1>
        <span className="text-xs text-gray-500 font-medium">
          {filteredHojas.length} viaje{filteredHojas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Info del chofer y tractor */}
      <div className="info-panel mb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">Sesión activa</p>
            <p className="text-sm text-white font-medium">
              {(chofer as any)?.nombreCompleto || 'Chofer'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {chofer?.interno || 'Tractor'} · Últimos 10 días
            </p>
          </div>
        </div>
      </div>

      {/* Buscador */}
      {hojasDeRuta.length > 0 && (
        <div className="mb-5">
          <input
            type="text"
            className="input-field text-sm"
            placeholder="Buscar por N° de viaje..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {/* Lista de hojas de ruta */}
      {filteredHojas.length === 0 ? (
        <div className="text-center py-16 glass-card p-8">
          <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
            <FaMapMarkedAlt className="text-xl text-gray-600" />
          </div>
          {searchQuery ? (
            <>
              <p className="text-base font-medium text-white mb-1">
                Sin resultados
              </p>
              <p className="text-gray-500 text-sm">
                No se encontraron viajes con ese criterio
              </p>
            </>
          ) : hojasDeRuta.length === 0 ? (
            <>
              <p className="text-base font-medium text-white mb-1">
                Sin hojas de ruta asignadas
              </p>
              <p className="text-gray-500 text-sm mb-5">
                Contactá con tu supervisor para que te asigne un viaje.
              </p>
            </>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHojas.map((hoja) => (
            <div
              key={`${hoja.Cod_Empresa}-${hoja.Nro_Viaje}`}
              className="glass-card p-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-base font-semibold text-white">
                      Viaje {hoja.Nro_Viaje}
                    </h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                      hoja.Estado_Viaje === 'Abierto'
                        ? 'status-open'
                        : 'status-closed'
                    }`}>
                      {hoja.Estado_Viaje === 'Abierto' ? 'Abierto' : 'Cerrado'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{hoja.Cod_Empresa}</p>
                </div>
                
                {/* Contador de gastos */}
                {gastosCount[hoja.Nro_Viaje] && gastosCount[hoja.Nro_Viaje] > 0 && (
                  <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md">
                    {gastosCount[hoja.Nro_Viaje]} gasto{gastosCount[hoja.Nro_Viaje] !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Detalles */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <FaUser className="text-gray-600 text-[10px]" />
                  <span className="truncate">{hoja.Nombre_Chofer}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <FaTruck className="text-gray-600 text-[10px]" />
                  <span>{hoja.Patente_Tractor}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <FaTrailer className="text-gray-600 text-[10px]" />
                  <span>{hoja.Patente_Semirremolque}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <FaCalendarAlt className="text-gray-600 text-[10px]" />
                  <span>
                    {formatFecha(hoja.Fecha_Salida)} — {formatFecha(hoja.Fecha_Llegada)}
                  </span>
                </div>
              </div>

              {/* Observaciones */}
              {hoja.Observaciones && (
                <div className="mb-3 pt-3 border-t border-white/[0.04]">
                  <p className="text-xs text-gray-500">
                    {hoja.Observaciones}
                  </p>
                </div>
              )}

              {/* Botón para agregar gastos */}
              <div className="pt-3 border-t border-white/[0.04]">
                <button
                  className="btn-primary w-full text-sm"
                  onClick={() => {
                    navigate(`/dashboard/nuevo-gasto?viaje=${hoja.Nro_Viaje}`)
                  }}
                >
                  <FaPlus className="mr-2 text-xs" />
                  Agregar Gasto
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
