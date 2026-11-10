import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import {
  bootstrapSession, getSessionSnapshot, login, logout,
  register, subscribeSession,
} from '../lib/session'

interface AuthActions {
  login: typeof login
  register: typeof register
  logout: typeof logout
}
const Context = createContext<AuthActions | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => { void bootstrapSession() }, [])
  const actions = useMemo<AuthActions>(() => ({login, register, logout}), [])
  return <Context.Provider value={actions}>{children}</Context.Provider>
}
export function useAuth() {
  const actions = useContext(Context)
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot)
  if (!actions) throw new Error('AuthProvider no encontrado')
  return { ...session, ...actions, can: (permission: string) => session.permissions.includes(permission) }
}
