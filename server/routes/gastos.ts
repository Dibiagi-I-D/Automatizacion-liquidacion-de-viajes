import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth.js'
import { calcularPaso } from '../utils/calcularPaso.js'

const router = Router()
const prisma = new PrismaClient()

// GET /api/gastos - Obtener todos los gastos del chofer
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const choferId = req.user!.choferId

    const gastos = await prisma.gasto.findMany({
      where: { choferId },
      orderBy: { fecha: 'desc' },
    })

    res.json(gastos)
  } catch (error) {
    console.error('Error al obtener gastos:', error)
    res.status(500).json({ message: 'Error al obtener gastos' })
  }
})

// POST /api/gastos - Crear un nuevo gasto
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const choferId = req.user!.choferId
    const { fecha, pais, tipo, importe, descripcion } = req.body

    // Validaciones
    if (!fecha || !pais || !tipo || importe === undefined) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' })
    }

    if (typeof importe !== 'number' || importe <= 0) {
      return res.status(400).json({ message: 'El importe debe ser un número positivo' })
    }

    if (!['ARG', 'CHL', 'URY'].includes(pais)) {
      return res.status(400).json({ message: 'País inválido' })
    }

    if (!['COMBUSTIBLE', 'PEAJE', 'NEUMATICO', 'HONORARIO', 'VIATICO', 'OTRO'].includes(tipo)) {
      return res.status(400).json({ message: 'Tipo de gasto inválido' })
    }

    // Calcular paso (LÓGICA CENTRAL DEL NEGOCIO)
    const paso = calcularPaso(pais, importe)

    // Crear gasto
    const gasto = await prisma.gasto.create({
      data: {
        fecha: new Date(fecha),
        pais,
        tipo,
        importe,
        descripcion: descripcion?.trim() || null,
        paso,
        choferId,
      },
    })

    res.status(201).json(gasto)
  } catch (error) {
    console.error('Error al crear gasto:', error)
    res.status(500).json({ message: 'Error al crear gasto' })
  }
})

// DELETE /api/gastos - Eliminar todos los gastos del chofer (nueva rendición)
router.delete('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const choferId = req.user!.choferId

    await prisma.gasto.deleteMany({
      where: { choferId },
    })

    res.status(204).send()
  } catch (error) {
    console.error('Error al eliminar gastos:', error)
    res.status(500).json({ message: 'Error al eliminar gastos' })
  }
})

export default router
