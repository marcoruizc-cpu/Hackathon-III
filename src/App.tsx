import {BrowserRouter,Navigate,Route,Routes} from 'react-router-dom'
import {AuthProvider} from './context/AuthContext'
import {HealthGate} from './components/HealthGate'
import {ProtectedRoute} from './components/ProtectedRoute'
import {Dashboard} from './pages/Dashboard'
import {Login} from './pages/Login'
import {Register} from './pages/Register'
import {Status} from './pages/Status'
import {Forbidden,NotFound,FilePlaceholder} from './pages/Errors'

export default function App(){
  return <BrowserRouter><HealthGate><AuthProvider><Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace/>}/>
    <Route path="/login" element={<Login/>}/>
    <Route path="/register" element={<Register/>}/>
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard/></ProtectedRoute>}/>
    <Route path="/files" element={<ProtectedRoute permission="files:read"><FilePlaceholder/></ProtectedRoute>}/>
    <Route path="/files/:id/refine" element={<ProtectedRoute permission="files:read"><FilePlaceholder/></ProtectedRoute>}/>
    <Route path="/estado" element={<ProtectedRoute><Status/></ProtectedRoute>}/>
    <Route path="/403" element={<ProtectedRoute><Forbidden/></ProtectedRoute>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></AuthProvider></HealthGate></BrowserRouter>
}
