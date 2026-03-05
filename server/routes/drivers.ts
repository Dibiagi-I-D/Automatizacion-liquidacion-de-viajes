import { Router, Request, Response } from 'express';
import driversApiService from '../services/driversApiService.js';
import { authenticateToken } from '../middleware/auth.js';
import sqlServerService from '../services/sqlServerService.js';

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
 * GET /api/drivers/viaje-activo-public
 * Detectar el viaje activo en tiempo real cruzando:
 *   - USR_GTPOCU (movimientos de entrada/salida del tractor)
 *   - USR_GTVIAH (hojas de ruta con Nro de Viaje real)
 * Devuelve el viaje más reciente que coincida con el último movimiento del tractor.
 * Query params:
 *  - patente: Patente del tractor logueado (obligatorio)
 */
router.get('/viaje-activo-public', async (req: Request, res: Response) => {
  try {
    const { patente } = req.query;

    if (!patente || typeof patente !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'El parámetro "patente" es requerido'
      });
    }

    const patenteNorm = patente.trim().toUpperCase();
    console.log(`🔍 [Viaje Activo] Buscando viaje para patente: ${patenteNorm}`);

    // QUERY PRINCIPAL: Cruzar último movimiento del tractor (USR_GTPOCU)
    // con la hoja de ruta más reciente (USR_GTVIAH) para la misma patente
    const query = `
      SELECT TOP 1
        p.USR_GTPOCU_INGSAL AS TipoMovimiento,
        p.USR_GTPOCU_FECHAC AS FechaMovimiento,
        p.USR_GTPOCU_HORACO AS HoraMovimiento,
        p.USR_GTPOCU_TRACTO AS Patente,
        p.USR_GTPOCU_CHONOM AS Chofer,
        p.USR_GTPOCU_ORIGEN AS OrigenMovimiento,
        p.USR_GTPOCU_DESTIN AS DestinoMovimiento,
        p.USR_GTPOCU_INTTRA AS NumeroInterno,
        h.USR_GTVIAH_NROVIA AS NroViaje,
        h.USR_GTVIAH_CODEMP AS CodEmpresa,
        h.USR_GTVIAH_CERRAD AS Cerrado,
        h.USR_GTVIAH_FSALID AS FechaSalida,
        h.USR_GTVIAH_FLLEGA AS FechaLlegada,
        h.USR_GTVIAH_CHOFER AS ChoferHR,
        h.USR_GTVIAH_PATTRA AS PatenteHR,
        h.USR_GTVIAH_PATSEM AS PatenteSemi,
        h.USR_GTVIAH_ORIGEN AS OrigenHR,
        h.USR_GTVIAH_DESTIN AS DestinoHR,
        h.USR_GTVIAH_TEXTOS AS Observaciones,
        h.USR_GTVIAH_LIQUID AS Liquidado
      FROM USR_GTPOCU p
      INNER JOIN USR_GTVIAH h 
        ON p.USR_GTPOCU_TRACTO = h.USR_GTVIAH_PATTRA
        AND h.USR_GTVIAH_ANULAD = 'N'
        AND h.USR_GT_DEBAJA = 'N'
      WHERE p.USR_GTPOCU_TRACTO = @patente
        AND DATEDIFF(DAY, TRY_CONVERT(date, p.USR_GTPOCU_FECHAC), CONVERT(date, GETDATE())) <= 10
      ORDER BY p.USR_GTPOCU_FECHAC DESC, p.USR_GTPOCU_HORACO DESC, h.USR_GTVIAH_NROVIA DESC
    `;

    const resultados = await sqlServerService.query(query, { patente: patenteNorm });

    if (resultados.length === 0) {
      console.log(`⚠️ No se encontró viaje activo para ${patenteNorm}`);
      return res.json({
        success: true,
        found: false,
        message: 'No se encontraron viajes recientes para este tractor',
        data: null
      });
    }

    const r = resultados[0];
    console.log(`✅ Viaje activo: ${r.NroViaje} (${r.TipoMovimiento}) — ${r.ChoferHR}`);

    res.json({
      success: true,
      found: true,
      message: `Viaje activo: ${r.NroViaje}`,
      data: {
        nroViaje: r.NroViaje,
        codEmpresa: r.CodEmpresa,
        patente: r.Patente,
        numeroInterno: r.NumeroInterno,
        tipoMovimiento: r.TipoMovimiento,
        fechaMovimiento: r.FechaMovimiento,
        horaMovimiento: r.HoraMovimiento,
        origenMovimiento: r.OrigenMovimiento,
        destinoMovimiento: r.DestinoMovimiento,
        chofer: r.ChoferHR,
        patenteSemi: r.PatenteSemi,
        fechaSalida: r.FechaSalida,
        fechaLlegada: r.FechaLlegada,
        origenHR: r.OrigenHR,
        destinoHR: r.DestinoHR,
        observaciones: r.Observaciones,
        cerrado: r.Cerrado,
        liquidado: r.Liquidado
      }
    });

  } catch (error: any) {
    console.error('❌ Error al buscar viaje activo:', error);
    
    if (error.code === 'ESOCKET' || error.code === 'ETIMEOUT' || error.code === 'ELOGIN') {
      return res.json({
        success: true,
        found: false,
        message: 'SQL Server no disponible',
        data: null,
        sqlError: true
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error al consultar viaje activo',
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

/**
 * GET /api/drivers/expenses-step1
 * Gastos de viaje Paso 1 (código RRFF)
 * Proxy hacia: https://api-app-porteria.onrender.com/trips/v1/expenses-step1
 *
 * Query params (todos opcionales):
 *   search  — filtra por Nro Viaje, Chofer, Patente o Nro Formulario
 *   page    — número de página (default: 1)
 *   limit   — registros por página (default: 20)
 */
router.get('/expenses-step1', async (req: Request, res: Response) => {
  try {
    const { search, page, limit } = req.query;

    console.log('📞 [expenses-step1] Consultando gastos viaje paso 1...');
    if (search) console.log(`🔍 Búsqueda: "${search}"`);

    const result = await driversApiService.obtenerGastosViajePaso1(
      search as string | undefined,
      page  ? parseInt(page  as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    if (result.success) {
      res.json({
        success: true,
        message: search
          ? `Resultados para: "${search}"`
          : 'Gastos viaje paso 1 obtenidos exitosamente',
        data:       result.data,
        total:      result.total,
        pagination: result.pagination
      });
    } else {
      res.status((result as any).status || 500).json({
        success: false,
        error:   (result as any).error,
        message: (result as any).message
      });
    }
  } catch (error: any) {
    console.error('❌ Error en endpoint /expenses-step1:', error);
    res.status(500).json({
      success: false,
      error:   'Error interno del servidor',
      message: error.message
    });
  }
});

export default router;
