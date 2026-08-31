import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()
const JWT_SECRET = process.env.JWT_SECRET || 'secret-super-seguro-cambiar-en-produccion'

// Usuarios administrativos (en el futuro se puede mover a la BD)
/**
 * Usuarios del panel administrativo.
 *
 * El `rol` decide qué puede hacer cada uno:
 *   admin    → todo, incluido eliminar gastos
 *   operador → revisar, corregir y aprobar, pero NO eliminar
 *
 * El rol viaja dentro del JWT, así que el backend puede validarlo sin
 * confiar en lo que diga el navegador.
 */
const ADMIN_USERS = [
  { usuario: 'admin',    password: 'admin588', nombre: 'Administrador', rol: 'admin'    },
  { usuario: 'veronica', password: 'veronica', nombre: 'Verónica',      rol: 'operador' },
]

// POST /api/auth/admin-login
router.post('/admin-login', async (req, res) => {
  try {
    const { usuario, password } = req.body

    if (!usuario || !password) {
      return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos' })
    }

    const admin = ADMIN_USERS.find(
      u => u.usuario.toLowerCase() === usuario.toLowerCase() && u.password === password
    )

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Credenciales incorrectas' })
    }

    const token = jwt.sign(
      { usuario: admin.usuario, nombre: admin.nombre, rol: admin.rol },
      JWT_SECRET,
      { expiresIn: '8h' }
    )

    res.json({
      success: true,
      token,
      admin: {
        usuario: admin.usuario,
        nombre: admin.nombre,
        rol: admin.rol,
      },
    })
  } catch (error) {
    console.error('Error en admin-login:', error)
    res.status(500).json({ success: false, message: 'Error al iniciar sesión' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { legajo, interno } = req.body

    if (!legajo || !interno) {
      return res.status(400).json({ message: 'Legajo e interno son requeridos' })
    }

    // Buscar o crear chofer
    let chofer = await prisma.chofer.findUnique({
      where: { legajo: legajo.trim() },
    })

    if (!chofer) {
      // Crear nuevo chofer
      chofer = await prisma.chofer.create({
        data: {
          legajo: legajo.trim(),
          interno: interno.trim(),
        },
      })
    } else {
      // Actualizar interno si cambió
      if (chofer.interno !== interno.trim()) {
        chofer = await prisma.chofer.update({
          where: { id: chofer.id },
          data: { interno: interno.trim() },
        })
      }
    }

    // Generar token JWT
    const token = jwt.sign(
      { choferId: chofer.id, legajo: chofer.legajo },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({
      token,
      chofer: {
        id: chofer.id,
        legajo: chofer.legajo,
        interno: chofer.interno,
        createdAt: chofer.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error en login:', error)
    res.status(500).json({ message: 'Error al iniciar sesión' })
  }
})

export default router
