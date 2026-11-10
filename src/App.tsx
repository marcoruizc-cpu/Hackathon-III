import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { HealthGate } from './components/HealthGate'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Status } from './pages/Status'
import { Forbidden, NotFound } from './pages/Errors'
import FilesPage from './cp2/FilesPage'
import RefinePage from './cp2/RefinePage'
import { LumonApi } from './cp2/api'
import Cp4Route from './cp4/Cp4Route'
import RefinersPage from './cp4/RefinersPage'
import RefinerPage from './cp4/RefinerPage'
import IncidentsPage, { NewIncidentPage } from './cp4/IncidentsPage'

const cp2Api = new LumonApi()

export default function App() {
  return <BrowserRouter><HealthGate><AuthProvider><Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/files" element={<ProtectedRoute permission="files:read"><Layout><FilesPage api={cp2Api} /></Layout></ProtectedRoute>} />
    <Route path="/files/:id/refine" element={<ProtectedRoute permission="files:read"><Layout><RefinePage api={cp2Api} /></Layout></ProtectedRoute>} />
    <Route path="/refiners" element={<Cp4Route permissions={['refiners:read']}><RefinersPage /></Cp4Route>} />
    <Route path="/refiners/:id" element={<Cp4Route permissions={['refiners:read']}><RefinerPage /></Cp4Route>} />
    <Route path="/refiners/:id/badge" element={
      <Cp4Route permissions={['refiners:read', 'refiners:write', 'media:upload']}><RefinerPage editBadge /></Cp4Route>
    } />
    <Route path="/incidents" element={<Cp4Route permissions={['incidents:read']}><IncidentsPage /></Cp4Route>} />
    <Route path="/incidents/new" element={
      <Cp4Route permissions={['incidents:create', 'media:upload']}><NewIncidentPage /></Cp4Route>
    } />
    <Route path="/estado" element={<ProtectedRoute><Status /></ProtectedRoute>} />
    <Route path="/403" element={<ProtectedRoute><Forbidden /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes></AuthProvider></HealthGate></BrowserRouter>
}
