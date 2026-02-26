import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { GastosProvider } from './context/GastosContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AdminLogin from './pages/AdminLogin'
import AdminControl from './pages/AdminControl'
import ProtectedRoute from './components/ProtectedRoute'

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const adminToken = sessionStorage.getItem('admin_token')
  if (!adminToken) {
    return <Navigate to="/admin/login" replace />
  }
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GastosProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route
              path="/admin"
              element={
                <AdminProtectedRoute>
                  <AdminControl />
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/dashboard/*"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </GastosProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
