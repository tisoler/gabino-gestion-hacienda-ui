import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MiEmpresa from './pages/MiEmpresa'
import Clientes from './pages/Clientes'
import Lotes from './pages/Lotes'
import LoteDetalle from './pages/LoteDetalle'
import Corrales from './pages/Corrales'
import Usuarios from './pages/Usuarios'
import Configuracion from './pages/Configuracion'

function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="/mi-empresa" element={<MiEmpresa />} />
                <Route path="/clientes" element={<Clientes />} />
                <Route path="/lotes" element={<Lotes />} />
                <Route path="/lotes/nueva" element={<LoteDetalle />} />
                <Route path="/lotes/:id" element={<LoteDetalle />} />
                <Route path="/corrales" element={<Corrales />} />
                <Route path="/usuarios" element={<Usuarios />} />
                <Route path="/configuracion" element={<Configuracion />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  )
}

export default App