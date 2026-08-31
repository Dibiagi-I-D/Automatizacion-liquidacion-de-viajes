import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'secret-super-seguro-cambiar-en-produccion'

export interface AuthRequest extends Request {
  user?: {
    choferId: string
    legajo: string
  }
}

export interface AdminRequest extends Request {
  admin?: {
    usuario: string
    nombre: string
    rol: string
  }
}

/**
 * Exige un token de administrador con rol 'admin'.
 *
 * Ocultar un botón en el frontend no restringe nada: la ruta sigue estando ahí
 * y se puede llamar igual. Por eso el permiso se valida acá, contra el rol que
 * viene firmado dentro del JWT.
 */
export function requiereRolAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ success: false, error: 'Necesitás iniciar sesión para hacer esto' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { usuario: string; nombre: string; rol: string }

    if (decoded.rol !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Tu usuario no tiene permiso para eliminar gastos. Pedíselo a un administrador.',
      })
    }

    ;(req as AdminRequest).admin = decoded
    next()
  } catch {
    return res.status(403).json({ success: false, error: 'Sesión inválida o vencida. Volvé a entrar.' })
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Token no provisto' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { choferId: string; legajo: string }
    ;(req as AuthRequest).user = decoded
    next()
  } catch (err) {
    return res.status(403).json({ message: 'Token inválido o expirado' })
  }
}
