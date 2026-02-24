import { NavLink, useNavigate } from 'react-router-dom'
import { FaMapMarkedAlt, FaPlus, FaFileAlt, FaSignOutAlt } from 'react-icons/fa'
import { useAuth } from '../context/AuthContext'

export default function BottomNav() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    if (confirm('¿Cerrar sesión?')) {
      logout()
      navigate('/login')
    }
  }

  return (
    <nav className="bottom-nav">
      <div className="max-w-2xl mx-auto flex items-center">
        <NavLink
          to="/dashboard/hojas-ruta"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <FaMapMarkedAlt className="text-lg mb-0.5" />
          <span className="text-[10px] font-medium tracking-wide">Viajes</span>
        </NavLink>

        <NavLink
          to="/dashboard/nuevo-gasto"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center -mt-1 mb-0.5">
            <FaPlus className="text-white text-xs" />
          </div>
          <span className="text-[10px] font-medium tracking-wide">Gasto</span>
        </NavLink>

        <NavLink
          to="/dashboard/rendicion"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <FaFileAlt className="text-lg mb-0.5" />
          <span className="text-[10px] font-medium tracking-wide">Rendición</span>
        </NavLink>

        <button
          onClick={handleLogout}
          className="nav-item text-gray-600 hover:text-gray-400"
        >
          <FaSignOutAlt className="text-lg mb-0.5" />
          <span className="text-[10px] font-medium tracking-wide">Salir</span>
        </button>
      </div>
    </nav>
  )
}
