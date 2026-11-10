import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { useAuth } from '../context/AuthContext'
import { waitForSessionProfile } from '../lib/session'

export default function Cp4Route({ children, permissions }: { children: ReactNode; permissions: string[] }) {
  const [ready, setReady] = useState(false)
  const auth = useAuth()
  useEffect(() => {
    let active = true
    void waitForSessionProfile().then(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])

  if (!ready) return <p className="p-8 text-center" role="status">Verificando permisos de Lumon…</p>
  return <ProtectedRoute>
    {permissions.every(auth.can) ? <Layout>{children}</Layout> : <Navigate to="/403" replace />}
  </ProtectedRoute>
}
