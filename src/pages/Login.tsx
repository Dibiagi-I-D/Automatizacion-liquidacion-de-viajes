import { useState, FormEvent, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FaTruck, FaSpinner, FaSearch, FaTimes, FaCheck } from 'react-icons/fa'
import * as api from '../api/client'

interface Chofer {
  'EsChofer?': string;
  Codigo_Empresa_Chofer: string;
  Nombre_Completo: string;
  Legajo: string;
  Documento: string;
  Nacionalidad: string;
  Fecha_Alta: string;
  Fecha_Egreso: string;
}

interface Tractor {
  USR_TRASEM_PATENT: string;
  USR_TRASEM_NROINT: string;
  USR_TRASEM_TIPVEH: string;
  USR_TRASEM_EMPUNI: string;
  USR_TRASEM_CONDIC: string;
}

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [legajo, setLegajo] = useState('')
  const [interno, setInterno] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Estados para autocompletado
  const [searchQuery, setSearchQuery] = useState('')
  const [choferes, setChoferes] = useState<Chofer[]>([])
  const [filteredChoferes, setFilteredChoferes] = useState<Chofer[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loadingChoferes, setLoadingChoferes] = useState(false)
  const [selectedChofer, setSelectedChofer] = useState<Chofer | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Estados para autocompletado de tractores
  const [searchTractor, setSearchTractor] = useState('')
  const [tractores, setTractores] = useState<Tractor[]>([])
  const [filteredTractores, setFilteredTractores] = useState<Tractor[]>([])
  const [showTractorDropdown, setShowTractorDropdown] = useState(false)
  const [loadingTractores, setLoadingTractores] = useState(false)
  const [selectedTractor, setSelectedTractor] = useState<Tractor | null>(null)
  const tractorDropdownRef = useRef<HTMLDivElement>(null)
  const tractorInputRef = useRef<HTMLInputElement>(null)

  // Cargar choferes al montar el componente
  useEffect(() => {
    cargarChoferes()
    cargarTractores()
  }, [])

  // Filtrar choferes cuando cambia el texto de búsqueda
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setFilteredChoferes([])
      setShowDropdown(false)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = choferes.filter(chofer => 
      chofer.Nombre_Completo.toLowerCase().includes(query) ||
      chofer.Legajo.includes(searchQuery) ||
      chofer.Documento.includes(searchQuery)
    )

    setFilteredChoferes(filtered)
    setShowDropdown(filtered.length > 0)
  }, [searchQuery, choferes])

  // Filtrar tractores cuando cambia el texto de búsqueda
  useEffect(() => {
    if (searchTractor.trim().length === 0) {
      setFilteredTractores([])
      setShowTractorDropdown(false)
      return
    }

    const query = searchTractor.toUpperCase()
    const filtered = tractores.filter(tractor => 
      tractor.USR_TRASEM_PATENT.toUpperCase().includes(query) ||
      tractor.USR_TRASEM_NROINT.includes(query)
    )

    setFilteredTractores(filtered)
    setShowTractorDropdown(filtered.length > 0)
  }, [searchTractor, tractores])

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
      if (tractorDropdownRef.current && !tractorDropdownRef.current.contains(event.target as Node)) {
        setShowTractorDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const cargarChoferes = async () => {
    try {
      setLoadingChoferes(true)
      // Usar una petición pública sin token para obtener choferes
      // Timeout más largo para cold start de la API
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 segundos
      
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/drivers/active-public`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      const data = await response.json()
      
      if (data.success) {
        setChoferes(data.data)
      }
    } catch (error) {
      console.error('Error al cargar choferes:', error)
      // Si falla, continuar sin autocompletado
      setError('La API puede estar despertando (cold start). Espera un momento y recarga.')
    } finally {
      setLoadingChoferes(false)
    }
  }

  const cargarTractores = async () => {
    try {
      setLoadingTractores(true)
      // Timeout más largo para cold start de la API
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 segundos
      
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/drivers/tractors-public`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      const data = await response.json()
      
      if (data.success) {
        setTractores(data.data)
      }
    } catch (error) {
      console.error('Error al cargar tractores:', error)
      setError('La API puede estar despertando (cold start). Espera un momento y recarga.')
    } finally {
      setLoadingTractores(false)
    }
  }

  const seleccionarChofer = (chofer: Chofer) => {
    setSelectedChofer(chofer)
    setLegajo(chofer.Legajo)
    setSearchQuery(chofer.Nombre_Completo)
    setShowDropdown(false)
    setError('')
  }

  const limpiarSeleccion = () => {
    setSelectedChofer(null)
    setLegajo('')
    setSearchQuery('')
    setFilteredChoferes([])
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setSelectedChofer(null)
    setLegajo('')
  }

  const seleccionarTractor = (tractor: Tractor) => {
    setSelectedTractor(tractor)
    setInterno(tractor.USR_TRASEM_PATENT)
    setSearchTractor(`${tractor.USR_TRASEM_PATENT} (${tractor.USR_TRASEM_NROINT})`)
    setShowTractorDropdown(false)
    setError('')
  }

  const limpiarTractor = () => {
    setSelectedTractor(null)
    setInterno('')
    setSearchTractor('')
    setFilteredTractores([])
    setShowTractorDropdown(false)
    tractorInputRef.current?.focus()
  }

  const handleTractorChange = (value: string) => {
    setSearchTractor(value)
    setSelectedTractor(null)
    setInterno('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!selectedChofer) {
      setError('Por favor seleccioná un chofer de la lista')
      return
    }

    if (!selectedTractor) {
      setError('Por favor seleccioná un tractor/patente de la lista')
      return
    }

    setLoading(true)
    try {
      // Crear un token simple con los datos del chofer y tractor
      const fakeToken = btoa(JSON.stringify({
        chofer: selectedChofer,
        tractor: selectedTractor,
        timestamp: Date.now()
      }))

      // Simular objeto chofer para el contexto (incluir nombre y patente para filtrar hojas de ruta)
      const choferData = {
        id: selectedChofer.Legajo,
        legajo: selectedChofer.Legajo,
        interno: selectedTractor.USR_TRASEM_PATENT,
        nroInterno: selectedTractor.USR_TRASEM_NROINT, // También guardamos el número interno
        createdAt: new Date().toISOString(),
        nombreCompleto: selectedChofer.Nombre_Completo,
        patenteTractor: selectedTractor.USR_TRASEM_PATENT
      } as any

      console.log('🚀 LOGIN - Datos guardados:', choferData)
      
      login(fakeToken, choferData)
      navigate('/dashboard/hojas-ruta')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-[#0f1117]">
      {/* Logo / Header */}
      <div className="mb-10 text-center animate-slide-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600/15 mb-5">
          <FaTruck className="text-2xl text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-1 tracking-tight">
          Gastos Logística
        </h1>
        <p className="text-gray-500 text-sm">
          Sistema de rendiciones
        </p>
      </div>

      {/* Formulario */}
      <div className="w-full max-w-md glass-card p-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        {/* Mensaje de carga inicial */}
        {(loadingChoferes || loadingTractores) && choferes.length === 0 && tractores.length === 0 && (
          <div className="mb-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl text-gray-300 text-sm">
            <FaSpinner className="inline animate-spin mr-2 text-emerald-400" />
            <span className="font-medium">Cargando datos...</span>
            <p className="text-xs mt-1.5 text-gray-500">
              La primera carga puede demorar hasta 60 segundos.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Campo de búsqueda con autocompletado */}
          <div className="relative" ref={dropdownRef}>
            <label htmlFor="search" className="block text-sm font-medium text-gray-400 mb-2">
              Chofer
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                id="search"
                type="text"
                className="input-field pl-10 pr-10"
                placeholder="Buscar por nombre o legajo..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                disabled={loading}
                autoComplete="off"
              />
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              
              {searchQuery && (
                <button
                  type="button"
                  onClick={limpiarSeleccion}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <FaTimes />
                </button>
              )}
            </div>

            {/* Dropdown de resultados */}
            {showDropdown && filteredChoferes.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-[#1a1d27] border border-white/[0.08] rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                {filteredChoferes.slice(0, 10).map((chofer, index) => (
                  <button
                    key={`${chofer.Legajo}-${index}`}
                    type="button"
                    onClick={() => seleccionarChofer(chofer)}
                    className="w-full px-4 py-3 text-left hover:bg-white/[0.04] transition border-b border-white/[0.04] last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">
                          {chofer.Nombre_Completo}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Legajo {chofer.Legajo} · Doc. {chofer.Documento}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Mensaje de carga */}
            {loadingChoferes && (
              <div className="absolute z-50 w-full mt-1 bg-[#1a1d27] border border-white/[0.08] rounded-xl shadow-2xl p-4 text-center">
                <FaSpinner className="animate-spin inline mr-2 text-emerald-400" />
                <span className="text-gray-400 text-sm">Cargando choferes...</span>
              </div>
            )}

            {/* Sin resultados */}
            {showDropdown && filteredChoferes.length === 0 && searchQuery.length > 0 && !loadingChoferes && (
              <div className="absolute z-50 w-full mt-1 bg-[#1a1d27] border border-white/[0.08] rounded-xl shadow-2xl p-4 text-center text-gray-500 text-sm">
                Sin resultados para "{searchQuery}"
              </div>
            )}
          </div>

          {/* Mostrar datos del chofer seleccionado */}
          {selectedChofer && (
            <div className="p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <FaCheck className="text-emerald-400 text-[10px]" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{selectedChofer.Nombre_Completo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Legajo {selectedChofer.Legajo} · {selectedChofer.Nacionalidad}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Campo de legajo (oculto, se llena automáticamente) */}
          <input type="hidden" value={legajo} />

          {/* Campo de búsqueda de tractores/patentes */}
          <div className="relative" ref={tractorDropdownRef}>
            <label htmlFor="searchTractor" className="block text-sm font-medium text-gray-400 mb-2">
              Tractor / Patente
            </label>
            <div className="relative">
              <input
                ref={tractorInputRef}
                id="searchTractor"
                type="text"
                className="input-field pl-10 pr-10"
                placeholder="Patente o número interno..."
                value={searchTractor}
                onChange={(e) => handleTractorChange(e.target.value)}
                disabled={loading}
                autoComplete="off"
              />
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              
              {searchTractor && (
                <button
                  type="button"
                  onClick={limpiarTractor}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <FaTimes />
                </button>
              )}
            </div>

            {/* Dropdown de tractores */}
            {showTractorDropdown && filteredTractores.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-[#1a1d27] border border-white/[0.08] rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                {filteredTractores.slice(0, 10).map((tractor, index) => (
                  <button
                    key={`${tractor.USR_TRASEM_NROINT}-${index}`}
                    type="button"
                    onClick={() => seleccionarTractor(tractor)}
                    className="w-full px-4 py-3 text-left hover:bg-white/[0.04] transition border-b border-white/[0.04] last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">
                          {tractor.USR_TRASEM_PATENT}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Interno {tractor.USR_TRASEM_NROINT} · {tractor.USR_TRASEM_EMPUNI}
                        </p>
                      </div>
                      <span className="text-[10px] font-medium text-gray-500 bg-white/[0.04] px-2 py-0.5 rounded">
                        {tractor.USR_TRASEM_TIPVEH === 'T' ? 'Tractor' : 'Vehículo'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Mensaje de carga de tractores */}
            {loadingTractores && (
              <div className="absolute z-50 w-full mt-1 bg-[#1a1d27] border border-white/[0.08] rounded-xl shadow-2xl p-4 text-center">
                <FaSpinner className="animate-spin inline mr-2 text-emerald-400" />
                <span className="text-gray-400 text-sm">Cargando tractores...</span>
              </div>
            )}

            {/* Sin resultados de tractores */}
            {showTractorDropdown && filteredTractores.length === 0 && searchTractor.length > 0 && !loadingTractores && (
              <div className="absolute z-50 w-full mt-1 bg-[#1a1d27] border border-white/[0.08] rounded-xl shadow-2xl p-4 text-center text-gray-500 text-sm">
                Sin resultados para "{searchTractor}"
              </div>
            )}
          </div>

          {/* Mostrar datos del tractor seleccionado */}
          {selectedTractor && (
            <div className="p-3 rounded-xl bg-blue-500/[0.06] border border-blue-500/15">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <FaCheck className="text-blue-400 text-[10px]" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{selectedTractor.USR_TRASEM_PATENT}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Interno {selectedTractor.USR_TRASEM_NROINT} · {selectedTractor.USR_TRASEM_EMPUNI}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Campo de interno (oculto, se llena automáticamente) */}
          <input type="hidden" value={interno} />

          {/* Campo de interno (oculto, se llena automáticamente) */}
          <input type="hidden" value={interno} />

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? (
              <>
                <FaSpinner className="animate-spin mr-2" />
                Ingresando...
              </>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>
      </div>

      {/* Footer */}
      <div className="mt-10 text-center text-gray-600 text-xs">
        <p>Transporte Logístico Internacional</p>
        <p className="mt-0.5 text-gray-700">Argentina · Chile · Uruguay</p>
      </div>
    </div>
  )
}
