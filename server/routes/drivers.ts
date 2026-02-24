import { Router, Request, Response } from 'express';
import driversApiService from '../services/driversApiService';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * GET /api/drivers/active-public
 * Obtener choferes activos SIN autenticación (para el login)
 */
router.get('/active-public', async (req: Request, res: Response) => {
  try {
    console.log('📞 [Público] Consultando choferes activos...');
    
    const result = await driversApiService.obtenerChoferesActivos();
    
    if (result.success) {
      // Devolver solo datos básicos necesarios para el autocompletado
      const choferesFiltrados = result.data.map((chofer: any) => ({
        'EsChofer?': chofer['EsChofer?'],
        Codigo_Empresa_Chofer: chofer.Codigo_Empresa_Chofer,
        Nombre_Completo: chofer.Nombre_Completo,
        Legajo: chofer.Legajo,
        Documento: chofer.Documento,
        Nacionalidad: chofer.Nacionalidad,
        Fecha_Alta: chofer.Fecha_Alta,
        Fecha_Egreso: chofer.Fecha_Egreso
      }));
      
      res.json({
        success: true,
        message: 'Choferes obtenidos exitosamente',
        data: choferesFiltrados,
        total: choferesFiltrados.length
      });
    } else {
      res.status(result.status || 500).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('❌ Error en endpoint /active-public:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/drivers/tractors-public
 * Obtener tractores activos SIN autenticación (para el login)
 */
router.get('/tractors-public', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    
    console.log('📞 [Público] Consultando tractores activos...');
    if (search) {
      console.log(`🔍 Búsqueda: "${search}"`);
    }
    
    const result = await driversApiService.obtenerTractoresActivos(search as string);
    
    if (result.success) {
      res.json({
        success: true,
        message: search 
          ? `Resultados de búsqueda para: ${search}` 
          : 'Tractores obtenidos exitosamente',
        data: result.data,
        total: result.total
      });
    } else {
      res.status(result.status || 500).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('❌ Error en endpoint /tractors-public:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/drivers/roadmaps-public
 * Obtener hojas de ruta SIN autenticación (para la vista después del login)
 */
router.get('/roadmaps-public', async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    
    console.log('📞 [Público] Consultando hojas de ruta...');
    if (search) {
      console.log(`🔍 Búsqueda: "${search}"`);
    }
    
    const result = await driversApiService.obtenerHojasDeRuta(search as string);
    
    if (result.success) {
      res.json({
        success: true,
        message: search 
          ? `Resultados de búsqueda para: ${search}` 
          : 'Hojas de ruta obtenidas exitosamente',
        data: result.data,
        total: result.total
      });
    } else {
      console.error('❌ Error de la API externa:', {
        status: result.status,
        error: result.error,
        message: result.message,
        details: result.details
      });
      
      res.status(result.status || 500).json({
        success: false,
        error: result.error,
        message: result.message || 'La API externa /trips/v1/roadmaps está devolviendo error 500. Contacta al administrador de la API.',
        details: result.details
      });
    }
  } catch (error: any) {
    console.error('❌ Error en endpoint /roadmaps-public:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/drivers/active
 * Obtener todos los choferes activos desde la API externa
 * Query params:
 *  - search: Buscar por nombre o legajo (opcional)
 */
router.get('/active', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    
    console.log('📞 Consultando choferes activos desde API externa...');
    if (search) {
      console.log(`🔍 Búsqueda: "${search}"`);
    }
    
    const result = await driversApiService.obtenerChoferesActivos(search as string);
    
    if (result.success) {
      res.json({
        success: true,
        message: search 
          ? `Resultados de búsqueda para: ${search}` 
          : 'Choferes obtenidos exitosamente',
        data: result.data,
        total: result.total,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(result.status || 500).json({
        success: false,
        error: result.error,
        message: result.message,
        details: result.details
      });
    }
  } catch (error: any) {
    console.error('❌ Error en endpoint /active:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/drivers/:id
 * Obtener un chofer específico por ID
 */
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    console.log(`📞 Consultando chofer con ID: ${id}`);
    
    const result = await driversApiService.obtenerChoferPorId(id);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(result.status || 404).json({
        success: false,
        error: result.error,
        message: `Chofer con ID ${id} no encontrado`
      });
    }
  } catch (error: any) {
    console.error('❌ Error en endpoint /:id:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/drivers/search/:query
 * Buscar chofer por nombre o legajo
 */
router.get('/search/:query', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { query } = req.params;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'El parámetro de búsqueda es requerido'
      });
    }
    
    console.log(`🔍 Buscando chofer: "${query}"`);
    
    const result = await driversApiService.buscarChofer(query);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Resultados para: ${query}`,
        data: result.data,
        total: result.total
      });
    } else {
      res.status(result.status || 500).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('❌ Error en búsqueda:', error);
    res.status(500).json({
      success: false,
      error: 'Error al buscar chofer',
      message: error.message
    });
  }
});

/**
 * POST /api/drivers/validate-login
 * Validar que un chofer existe y está activo para login
 */
router.post('/validate-login', async (req: Request, res: Response) => {
  try {
    const { legajo } = req.body;
    
    if (!legajo) {
      return res.status(400).json({
        success: false,
        error: 'El legajo es requerido'
      });
    }
    
    console.log(`🔐 Validando chofer para login: ${legajo}`);
    
    const result = await driversApiService.validarChoferParaLogin(legajo);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Chofer válido',
        data: result.data
      });
    } else {
      res.status(401).json({
        success: false,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('❌ Error en validación de login:', error);
    res.status(500).json({
      success: false,
      error: 'Error al validar chofer',
      message: error.message
    });
  }
});

/**
 * GET /api/drivers/test-connection
 * Probar la conexión con la API externa
 */
router.get('/test/connection', authenticateToken, async (req: Request, res: Response) => {
  try {
    console.log('🔍 Probando conexión con API de choferes...');
    
    const result = await driversApiService.testConnection();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        status: result.status,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        message: result.message,
        error: result.error,
        status: result.status
      });
    }
  } catch (error: any) {
    console.error('❌ Error en test de conexión:', error);
    res.status(500).json({
      success: false,
      error: 'Error al probar conexión',
      message: error.message
    });
  }
});

/**
 * POST /api/drivers/sync
 * Sincronizar choferes de la API externa con la base de datos local
 */
router.post('/sync', authenticateToken, async (req: Request, res: Response) => {
  try {
    console.log('🔄 Iniciando sincronización de choferes...');
    
    // Obtener choferes de la API externa
    const result = await driversApiService.obtenerChoferesActivos();
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'No se pudieron obtener los choferes de la API',
        message: result.message
      });
    }

    // Aquí puedes agregar lógica para guardar en tu BD local
    // Por ejemplo, usando Prisma para crear/actualizar choferes
    
    // const choferes = result.data;
    // for (const chofer of choferes) {
    //   await prisma.chofer.upsert({
    //     where: { legajo: chofer.legajo },
    //     update: { interno: chofer.interno },
    //     create: { legajo: chofer.legajo, interno: chofer.interno }
    //   });
    // }

    res.json({
      success: true,
      message: 'Sincronización completada',
      total: result.total,
      data: result.data
    });
  } catch (error: any) {
    console.error('❌ Error en sincronización:', error);
    res.status(500).json({
      success: false,
      error: 'Error al sincronizar choferes',
      message: error.message
    });
  }
});

/**
 * POST /api/drivers/custom-request
 * Hacer una petición personalizada a la API externa
 */
router.post('/custom-request', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { method = 'GET', endpoint, data } = req.body;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'El endpoint es requerido'
      });
    }

    console.log(`📞 Petición personalizada: ${method} ${endpoint}`);

    let result;
    switch (method.toUpperCase()) {
      case 'GET':
        result = await driversApiService.get(endpoint, data);
        break;
      case 'POST':
        result = await driversApiService.post(endpoint, data);
        break;
      case 'PUT':
        result = await driversApiService.put(endpoint, data);
        break;
      case 'DELETE':
        result = await driversApiService.delete(endpoint);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Método HTTP no soportado'
        });
    }

    res.json(result);
  } catch (error: any) {
    console.error('❌ Error en petición personalizada:', error);
    res.status(500).json({
      success: false,
      error: 'Error al realizar petición personalizada',
      message: error.message
    });
  }
});

/**
 * GET /api/drivers/tractors
 * Obtener tractores activos (autenticado)
 */
router.get('/tractors', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    
    console.log('📞 Consultando tractores activos...');
    if (search) {
      console.log(`🔍 Búsqueda: "${search}"`);
    }
    
    const result = await driversApiService.obtenerTractoresActivos(search as string);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Tractores obtenidos exitosamente',
        data: result.data,
        total: result.total,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(result.status || 500).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('❌ Error en endpoint /tractors:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/drivers/roadmaps
 * Obtener hojas de ruta (autenticado)
 */
router.get('/roadmaps', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    
    console.log('📞 Consultando hojas de ruta...');
    if (search) {
      console.log(`🔍 Búsqueda: "${search}"`);
    }
    
    const result = await driversApiService.obtenerHojasDeRuta(search as string);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Hojas de ruta obtenidas exitosamente',
        data: result.data,
        total: result.total,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(result.status || 500).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('❌ Error en endpoint /roadmaps:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

export default router;
