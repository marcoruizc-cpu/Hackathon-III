import type {ReactNode} from 'react'
import {Navigate,useLocation} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'

export function ProtectedRoute({children,permission}:{children:ReactNode;permission?:string}) {
  const auth=useAuth()
  const location=useLocation()
  if(auth.status==='loading') return <div className="p-8 text-center" role="status">Restaurando sesión…</div>
  if(auth.status==='anonymous') {
    const requested=location.pathname+location.search+location.hash
    return <Navigate to={`/login?next=${encodeURIComponent(requested)}`} replace />
  }
  if(permission && !auth.can(permission)) return <Navigate to="/403" replace />
  return <>{children}</>
}
