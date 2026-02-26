import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import gastosRoutes from './routes/gastos.js'
import gastosViajeRoutes from './routes/gastosViaje.js'
import softlandRoutes from './routes/softland.js'
import driversRoutes from './routes/drivers.js'
import ocrRoutes from './routes/ocr.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// CORS - permitir frontend local y producción
const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean) as string[]

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))

// Rutas
app.use('/api/auth', authRoutes)
app.use('/api/gastos', gastosRoutes)
app.use('/api/gastos-viaje', gastosViajeRoutes)
app.use('/api/softland', softlandRoutes)
app.use('/api/drivers', driversRoutes)
app.use('/api/ocr', ocrRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Manejo de errores global
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err)
  res.status(500).json({ message: err.message || 'Error interno del servidor' })
})

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
  console.log(`📡 API disponible en http://localhost:${PORT}/api`)
})

export default app
