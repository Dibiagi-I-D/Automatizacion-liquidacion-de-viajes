import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import HojasDeRuta from './HojasDeRuta'
import NuevoGasto from './NuevoGasto'
import Rendicion from './Rendicion'
import DetalleViaje from './DetalleViaje'
import BottomNav from '../components/BottomNav'
import { FaTruck } from 'react-icons/fa'

export default function Dashboard() {
  const { chofer } = useAuth()

  return (
    <div className="min-h-screen bg-[#0f1117] pb-20">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#0f1117]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600/15 flex items-center justify-center">
                <FaTruck className="text-emerald-400 text-sm" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white leading-tight">
                  {(chofer as any)?.nombreCompleto || chofer?.interno}
                </h2>
                <p className="text-xs text-gray-500">
                  Legajo {chofer?.legajo} · {chofer?.interno}
                </p>
              </div>
            </div>
            <div className="text-[10px] font-medium text-gray-600 uppercase tracking-wider">
              Gastos Logística
            </div>
          </div>
        </div>
      </header>

      {/* Contenido principal con padding-top para el header fijo */}
      <div className="pt-20">
        <Routes>
          <Route path="hojas-ruta" element={<HojasDeRuta />} />
          <Route path="nuevo-gasto" element={<NuevoGasto />} />
          <Route path="rendicion" element={<Rendicion />} />
          <Route path="detalle-viaje" element={<DetalleViaje />} />
          <Route path="*" element={<Navigate to="hojas-ruta" replace />} />
        </Routes>
      </div>

      {/* Navegación inferior */}
      <BottomNav />
    </div>
  )
}
