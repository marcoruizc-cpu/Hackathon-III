import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import type { Permission } from './dto'
import { useSession } from './SessionContext'

/** Rutas privadas: "verificando" sin mostrar el login; sin sesión → /login recordando a dónde iba. */
export function RequireAuth() {
  const { state, retry } = useSession()
  const location = useLocation()

  if (state.status === 'checking') return <p className="p-8 text-center text-slate-400">Verificando sesión…</p>
  if (state.status === 'error')
    return (
      <div className="p-8 text-center">
        <p className="text-red-400">{state.message}</p>
        <button className="mt-4 rounded bg-slate-700 px-4 py-2" onClick={retry}>
          Reintentar
        </button>
      </div>
    )
  if (state.status === 'signedOut') {
    const from = state.reason === 'LOGOUT' ? undefined : location
    return <Navigate to="/login" replace state={from ? { from } : undefined} />
  }
  return <Outlet />
}

/** La interfaz se decide por permisos (los roles cambian entre workspaces). */
export function Can({ permission, children, fallback = null }: { permission: Permission; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useSession()
  return <>{can(permission) ? children : fallback}</>
}

export function RequirePermission({ permission }: { permission: Permission }) {
  const { can } = useSession()
  if (!can(permission))
    return <p className="p-8 text-center text-amber-400">No tienes el permiso <code>{permission}</code>.</p>
  return <Outlet />
}
