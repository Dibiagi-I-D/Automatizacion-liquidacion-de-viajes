import { Router, Request, Response } from 'express'
import sqlServerService from '../services/sqlServerService.js'
import { requiereSesionAdmin } from '../middleware/auth.js'

const router = Router()

/**
 * GET /api/proveedores
 * Padrón completo de proveedores de Softland (PVMPRH), solo lectura.
 *
 * Es la fuente de verdad de CORMVI_NROCTA: el trigger de CORMVH rechaza
 * cualquier número que no exista acá. Se manda entero (≈2.200 filas, ~100 KB)
 * porque el panel lo usa para resolver el nombre de cada número al instante,
 * incluso mientras se tipea, sin una consulta por tecla.
 *
 * El código se devuelve sin espacios pero SIN tocar los ceros a la izquierda:
 * '03', '3', '00' y '0' son cuatro proveedores distintos en Softland.
 *
 * Requiere sesión del panel: el padrón incluye personas físicas.
 */
router.get('/', requiereSesionAdmin, async (_req: Request, res: Response) => {
  try {
    const filas = await sqlServerService.query(`
      SELECT
        LTRIM(RTRIM(PVMPRH_NROCTA)) AS codigo,
        LTRIM(RTRIM(ISNULL(PVMPRH_NOMBRE, ''))) AS nombre,
        ISNULL(PVMPRH_DEBAJA, 'N') AS debaja
      FROM PVMPRH
      WHERE PVMPRH_NROCTA IS NOT NULL AND LTRIM(RTRIM(PVMPRH_NROCTA)) <> ''
    `)

    const data = filas.map((f: any) => ({
      codigo: String(f.codigo),
      nombre: String(f.nombre),
      activo: String(f.debaja).trim() !== 'S',
    }))

    res.json({ success: true, data, total: data.length })
  } catch (error: any) {
    console.error('[Proveedores] Error al leer PVMPRH:', error?.message || error)

    if (['ESOCKET', 'ETIMEOUT', 'ELOGIN', 'ECONNCLOSED'].includes(error?.code)) {
      return res.status(503).json({
        success: false,
        sqlError: true,
        error: 'No hay conexión con Softland. No se pudo cargar el padrón de proveedores.',
      })
    }
    res.status(500).json({ success: false, error: 'Error al cargar el padrón de proveedores' })
  }
})

export default router
