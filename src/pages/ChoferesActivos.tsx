import { useState, useEffect } from 'react';
import { getChoferesActivos, testDriversConnection, syncChoferes, buscarChofer } from '../api/client';
import { useAuth } from '../context/AuthContext';

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

interface ApiResponse {
  success: boolean;
  message?: string;
  data: Chofer[];
  total: number;
  timestamp?: string;
  error?: string;
}

export default function ChoferesActivos() {
  const { token, isAuthenticated } = useAuth();
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conexionOk, setConexionOk] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Verificar conexión con la API al montar el componente
  useEffect(() => {
    verificarConexion();
  }, []);

  // Cargar choferes
  useEffect(() => {
    cargarChoferes();
  }, []);

  const verificarConexion = async () => {
    if (!token) return;
    
    try {
      const response = await testDriversConnection(token);
      if (response.success) {
        setConexionOk(true);
        console.log('✅ Conexión con API de choferes establecida');
      } else {
        setConexionOk(false);
        console.error('❌ Error de conexión con API de choferes');
      }
    } catch (err) {
      setConexionOk(false);
      console.error('❌ No se pudo verificar conexión:', err);
    }
  };

  const cargarChoferes = async (search?: string) => {
    if (!token) return;
    
    try {
      setLoading(true);
      setError(null);
      setIsSearching(!!search);

      const response = await getChoferesActivos(token, search);

      if (response.success) {
        setChoferes(response.data);
        console.log(`✅ ${response.total} choferes cargados`);
      } else {
        setError(response.message || 'Error al cargar choferes');
      }
    } catch (err: any) {
      console.error('❌ Error al cargar choferes:', err);
      setError(
        err.message || 
        'No se pudieron cargar los choferes. Verifica tu conexión.'
      );
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      cargarChoferes(searchQuery.trim());
    } else {
      cargarChoferes(); // Sin filtro
    }
  };

  const limpiarBusqueda = () => {
    setSearchQuery('');
    cargarChoferes();
  };

  const sincronizarChoferes = async () => {
    if (!token) return;
    
    try {
      setLoading(true);
      const response = await syncChoferes(token);

      if (response.success) {
        alert(`✅ ${response.total} choferes sincronizados correctamente`);
        await cargarChoferes(); // Recargar la lista
      } else {
        alert('❌ Error en la sincronización');
      }
    } catch (err: any) {
      console.error('Error al sincronizar:', err);
      alert('Error al sincronizar choferes');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Debes iniciar sesión para ver los choferes</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando choferes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Choferes Activos
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                {choferes.length} choferes {searchQuery ? `(filtrados por: "${searchQuery}")` : 'disponibles'}
              </p>
            </div>
            
            <div className="flex gap-3">
              {/* Indicador de conexión */}
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${
                  conexionOk === true ? 'bg-green-500' : 
                  conexionOk === false ? 'bg-red-500' : 
                  'bg-gray-400'
                }`}></div>
                <span className="text-sm text-gray-600">
                  {conexionOk === true ? 'API Conectada' : 
                   conexionOk === false ? 'API Desconectada' : 
                   'Verificando...'}
                </span>
              </div>

              {/* Botones */}
              <button
                onClick={() => cargarChoferes()}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                🔄 Recargar
              </button>
              
              <button
                onClick={sincronizarChoferes}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                🔄 Sincronizar
              </button>
            </div>
          </div>

          {/* Barra de búsqueda */}
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre o legajo (ej: AGUERO o 1234)..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={limpiarBusqueda}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || isSearching}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium"
            >
              {isSearching ? '🔍 Buscando...' : '🔍 Buscar'}
            </button>
          </form>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <span className="text-red-800">⚠️ {error}</span>
            </div>
          </div>
        )}

        {/* Choferes Grid */}
        {choferes.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500 text-lg">
              No hay choferes disponibles
            </p>
            <button
              onClick={cargarChoferes}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Intentar de nuevo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {choferes.map((chofer, index) => (
              <div
                key={`${chofer.Legajo}-${index}`}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {chofer.Nombre_Completo || 'Sin nombre'}
                    </h3>
                    
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center text-sm">
                        <span className="text-gray-500 w-28">Legajo:</span>
                        <span className="font-medium text-gray-900">
                          {chofer.Legajo}
                        </span>
                      </div>
                      
                      <div className="flex items-center text-sm">
                        <span className="text-gray-500 w-28">Documento:</span>
                        <span className="font-medium text-gray-900">
                          {chofer.Documento || 'N/A'}
                        </span>
                      </div>

                      <div className="flex items-center text-sm">
                        <span className="text-gray-500 w-28">Nacionalidad:</span>
                        <span className="font-medium text-gray-900">
                          {chofer.Nacionalidad || 'N/A'}
                        </span>
                      </div>

                      <div className="flex items-center text-sm">
                        <span className="text-gray-500 w-28">Fecha Alta:</span>
                        <span className="font-medium text-gray-900">
                          {chofer.Fecha_Alta ? new Date(chofer.Fecha_Alta).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    chofer['EsChofer?'] === 'S' && chofer.Fecha_Egreso === 'N'
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {chofer['EsChofer?'] === 'S' && chofer.Fecha_Egreso === 'N' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {/* Código de Empresa */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <span className="text-xs text-gray-500">
                    Código Empresa: {chofer.Codigo_Empresa_Chofer}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer con info adicional */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">
            💡 Información
          </h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Los datos se obtienen desde la API externa de choferes</li>
            <li>• Usa el botón "Sincronizar" para actualizar tu base de datos local</li>
            <li>• Los choferes inactivos no se mostrarán en este listado</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
