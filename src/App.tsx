import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { RequireAuth, RequirePermission } from './auth/guards'
import { SessionProvider } from './auth/SessionContext'
import { Layout } from './components/Layout'
import EstadoPage from './pages/EstadoPage'
import FilesPage from './pages/FilesPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import RegisterPage from './pages/RegisterPage'

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="estado" element={<EstadoPage />} />
              <Route element={<RequirePermission permission="files:read" />}>
                <Route path="files" element={<FilesPage />} />
                <Route path="files/:id/refine" element={<p className="p-8">Grilla (CP2): pendiente</p>} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  )
}
