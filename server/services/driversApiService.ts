import axios, { AxiosInstance } from 'axios';

/**
 * Servicio para consumir la API externa de choferes
 */
class DriversApiService {
  private api: AxiosInstance;
  private readonly bearerToken = 'db_dibia_MkI5YVBYZzRRbmx0WTJKM09UVTFNRmhaTmxjdw==';

  constructor() {
    // Configurar axios con la URL base y headers por defecto
    this.api = axios.create({
      baseURL: process.env.DRIVERS_API_URL || 'https://apirest-dibiagi.onrender.com',
      headers: {
        'Authorization': `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 60000 // 60 segundos (API externa puede tardar en despertar - cold start)
    });

    // Interceptor para logging de requests
    this.api.interceptors.request.use(
      (config) => {
        console.log(`🔵 Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Interceptor para logging de responses
    this.api.interceptors.response.use(
      (response) => {
        console.log(`✅ Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('❌ Response Error:', error.response?.status, error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * GET /drivers/v1/active
   * Obtener todos los choferes activos
   * @param search - Parámetro opcional para buscar por nombre o legajo
   */
  async obtenerChoferesActivos(search?: string) {
    try {
      const params = search ? { search } : {};
      const response = await this.api.get('/drivers/v1/active', { params });
      
      return {
        success: true,
        data: response.data,
        total: Array.isArray(response.data) ? response.data.length : 0
      };
    } catch (error: any) {
      console.error('Error al obtener choferes activos:', error.message);
      
      // Manejo de errores detallado
      if (error.response) {
        // El servidor respondió con un código de error
        return {
          success: false,
          error: 'Error en la respuesta del servidor',
          status: error.response.status,
          message: error.response.data?.message || error.message,
          details: error.response.data
        };
      } else if (error.request) {
        // La petición se hizo pero no hubo respuesta
        return {
          success: false,
          error: 'No se recibió respuesta del servidor',
          message: 'El servidor no respondió. Verifica la URL y la conexión.'
        };
      } else {
        // Error al configurar la petición
        return {
          success: false,
          error: 'Error al realizar la petición',
          message: error.message
        };
      }
    }
  }

  /**
   * Buscar chofer por nombre o legajo
   * @param search - Nombre o legajo del chofer
   */
  async buscarChofer(search: string) {
    return await this.obtenerChoferesActivos(search);
  }

  /**
   * Validar chofer para login (verificar que existe y está activo)
   * @param legajo - Legajo del chofer
   */
  async validarChoferParaLogin(legajo: string) {
    try {
      const result = await this.buscarChofer(legajo);
      
      if (result.success && result.data.length > 0) {
        const chofer = result.data[0];
        
        // Verificar que sea chofer activo
        if (chofer['EsChofer?'] === 'S' && chofer.Fecha_Egreso === 'N') {
          return {
            success: true,
            data: chofer,
            message: 'Chofer válido y activo'
          };
        } else {
          return {
            success: false,
            message: 'El chofer no está activo o no está habilitado'
          };
        }
      } else {
        return {
          success: false,
          message: 'Chofer no encontrado'
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * GET /drivers/v1/{id}
   * Obtener un chofer específico por ID (ejemplo)
   */
  async obtenerChoferPorId(id: string) {
    try {
      const response = await this.api.get(`/drivers/v1/${id}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      console.error(`Error al obtener chofer ${id}:`, error.message);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * Método genérico para hacer peticiones GET a cualquier endpoint
   */
  async get(endpoint: string, params?: any) {
    try {
      const response = await this.api.get(endpoint, { params });
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      console.error(`Error en GET ${endpoint}:`, error.message);
      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        details: error.response?.data
      };
    }
  }

  /**
   * Método genérico para hacer peticiones POST
   */
  async post(endpoint: string, data: any) {
    try {
      const response = await this.api.post(endpoint, data);
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      console.error(`Error en POST ${endpoint}:`, error.message);
      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        details: error.response?.data
      };
    }
  }

  /**
   * Método genérico para hacer peticiones PUT
   */
  async put(endpoint: string, data: any) {
    try {
      const response = await this.api.put(endpoint, data);
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      console.error(`Error en PUT ${endpoint}:`, error.message);
      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        details: error.response?.data
      };
    }
  }

  /**
   * Método genérico para hacer peticiones DELETE
   */
  async delete(endpoint: string) {
    try {
      const response = await this.api.delete(endpoint);
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error: any) {
      console.error(`Error en DELETE ${endpoint}:`, error.message);
      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        details: error.response?.data
      };
    }
  }

  /**
   * GET /vehicles/v1/tractors
   * Obtener todos los tractores activos
   * @param search - Parámetro opcional para buscar por patente o número interno
   */
  async obtenerTractoresActivos(search?: string) {
    try {
      const params = search ? { search } : {};
      const response = await this.api.get('/vehicles/v1/tractors', { params });
      
      return {
        success: true,
        data: response.data,
        total: Array.isArray(response.data) ? response.data.length : 0
      };
    } catch (error: any) {
      console.error('Error al obtener tractores activos:', error.message);
      
      if (error.response) {
        return {
          success: false,
          error: 'Error en la respuesta del servidor',
          status: error.response.status,
          message: error.response.data?.message || error.message,
          details: error.response.data
        };
      } else if (error.request) {
        return {
          success: false,
          error: 'No se recibió respuesta del servidor',
          message: 'El servidor no respondió. Verifica la URL y la conexión.'
        };
      } else {
        return {
          success: false,
          error: 'Error al realizar la petición',
          message: error.message
        };
      }
    }
  }

  /**
   * Buscar tractor por patente o interno
   * @param search - Patente o número interno
   */
  async buscarTractor(search: string) {
    return await this.obtenerTractoresActivos(search);
  }

  /**
   * GET /trips/v1/roadmaps
   * Obtener hojas de ruta (viajes) activas
   * @param search - Parámetro opcional para buscar por número de viaje o nombre del chofer
   */
  async obtenerHojasDeRuta(search?: string) {
    try {
      const params = search ? { search } : {};
      const response = await this.api.get('/trips/v1/roadmaps', { params });
      
      return {
        success: true,
        data: response.data,
        total: response.data.length
      };
    } catch (error: any) {
      if (error.response) {
        console.error('❌ Error de la API /trips/v1/roadmaps:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        });
        
        return {
          success: false,
          error: 'Error en la respuesta de la API',
          message: error.response.data?.message || `Error ${error.response.status}: ${error.response.statusText || 'Error desconocido'}`,
          status: error.response.status,
          details: error.response.data
        };
      } else if (error.request) {
        return {
          success: false,
          error: 'No se recibió respuesta de la API',
          message: 'La API no respondió. Verifica tu conexión o intenta más tarde.',
          details: error.message
        };
      } else {
        return {
          success: false,
          error: 'Error al realizar la petición',
          message: error.message
        };
      }
    }
  }

  /**
   * Buscar hoja de ruta por número de viaje o chofer
   * @param search - Número de viaje o nombre del chofer
   */
  async buscarHojaDeRuta(search: string) {
    return await this.obtenerHojasDeRuta(search);
  }

  /**
   * Probar la conexión con la API
   */
  async testConnection() {
    try {
      const response = await this.api.get('/drivers/v1/active');
      return {
        success: true,
        message: 'Conexión exitosa con la API de choferes',
        status: response.status
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'No se pudo conectar con la API de choferes',
        error: error.message,
        status: error.response?.status
      };
    }
  }
}

// Exportar instancia singleton
export default new DriversApiService();
