import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()
const JWT_SECRET = process.env.JWT_SECRET || 'secret-super-seguro-cambiar-en-produccion'

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
