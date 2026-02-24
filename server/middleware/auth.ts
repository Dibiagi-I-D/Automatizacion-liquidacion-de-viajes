import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'secret-super-seguro-cambiar-en-produccion'

export interface AuthRequest extends Request {
  user?: {
    choferId: string
    legajo: string
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
