import { Router, Request, Response } from 'express';
import sqlServerService from '../services/sqlServerService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/softland/tractores
 * Obtener todos los tractores activos desde Softland
 */
router.get('/tractores', authenticateToken, async (req: Request, res: Response) => {
  try {
    const tractores = await sqlServerService.obtenerTractores();
    res.json({
      success: true,
      data: tractores,
      total: tractores.length
    });
  } catch (error: any) {
    console.error('Error al obtener tractores:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener tractores desde Softland',
      message: error.message
    });
  }
});

/**
 * GET /api/softland/chofer/:legajo
 * Obtener datos de un chofer por legajo
 */
router.get('/chofer/:legajo', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { legajo } = req.params;
    
    if (!legajo) {
      return res.status(400).json({
        success: false,
        error: 'El legajo es requerido'
      });
    }

    const chofer = await sqlServerService.obtenerChoferPorLegajo(legajo);
    
    if (!chofer) {
      return res.status(404).json({
        success: false,
        error: 'Chofer no encontrado'
      });
    }

    res.json({
      success: true,
      data: chofer
    });
  } catch (error: any) {
    console.error('Error al obtener chofer:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener datos del chofer',
      message: error.message
    });
  }
});

/**
 * GET /api/softland/viajes/:legajo
 * Obtener viajes de un chofer en un rango de fechas
 * Query params: fechaInicio, fechaFin
 */
router.get('/viajes/:legajo', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { legajo } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    if (!legajo) {
      return res.status(400).json({
        success: false,
        error: 'El legajo es requerido'
      });
    }

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({
        success: false,
        error: 'Las fechas de inicio y fin son requeridas'
      });
    }

    const viajes = await sqlServerService.obtenerViajesPorChofer(
      legajo,
      new Date(fechaInicio as string),
      new Date(fechaFin as string)
    );

    res.json({
      success: true,
      data: viajes,
      total: viajes.length
    });
  } catch (error: any) {
    console.error('Error al obtener viajes:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener viajes del chofer',
      message: error.message
    });
  }
});

/**
 * GET /api/softland/verificar-tractor/:interno
 * Verificar si existe un tractor por su número interno
 */
router.get('/verificar-tractor/:interno', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { interno } = req.params;

    if (!interno) {
      return res.status(400).json({
        success: false,
        error: 'El número interno es requerido'
      });
    }

    const existe = await sqlServerService.existeTractor(interno);

    res.json({
      success: true,
      existe,
      interno
    });
  } catch (error: any) {
    console.error('Error al verificar tractor:', error);
    res.status(500).json({
      success: false,
      error: 'Error al verificar tractor',
      message: error.message
    });
  }
});

/**
 * GET /api/softland/resumen-gastos/:legajo
 * Obtener resumen de gastos por tipo para un chofer en un mes
 * Query params: mes, anio
 */
router.get('/resumen-gastos/:legajo', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { legajo } = req.params;
    const { mes, anio } = req.query;

    if (!legajo || !mes || !anio) {
      return res.status(400).json({
        success: false,
        error: 'El legajo, mes y año son requeridos'
      });
    }

    const resumen = await sqlServerService.obtenerResumenGastos(
      legajo,
      parseInt(mes as string),
      parseInt(anio as string)
    );

    res.json({
      success: true,
      data: resumen,
      periodo: {
        mes: parseInt(mes as string),
        anio: parseInt(anio as string)
      }
    });
  } catch (error: any) {
    console.error('Error al obtener resumen de gastos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener resumen de gastos',
      message: error.message
    });
  }
});

/**
 * POST /api/softland/consulta-personalizada
 * Ejecutar una consulta SQL personalizada (solo para desarrollo/admin)
 * NOTA: En producción, esto debería estar muy restringido
 */
router.post('/consulta-personalizada', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { query, params } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'La consulta SQL es requerida'
      });
    }

    // Validar que solo sean consultas SELECT (seguridad básica)
    if (!query.trim().toUpperCase().startsWith('SELECT')) {
      return res.status(403).json({
        success: false,
        error: 'Solo se permiten consultas SELECT'
      });
    }

    const resultado = await sqlServerService.query(query, params);

    res.json({
      success: true,
      data: resultado,
      total: resultado.length
    });
  } catch (error: any) {
    console.error('Error en consulta personalizada:', error);
    res.status(500).json({
      success: false,
      error: 'Error al ejecutar consulta',
      message: error.message
    });
  }
});

export default router;
