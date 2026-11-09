import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ApiError, errorMessage } from '../lib/errors'
import * as authApi from './api'
import type { LoginRequest, Me, Permission, RegisterRequest } from './dto'
import { endSession, getRefreshToken, hasRefreshToken, sessionEnded, setTokens, type SessionEndReason } from './tokens'

export type SessionState =
  | { status: 'checking' }
  | { status: 'signedIn'; me: Me }
  | { status: 'signedOut'; reason: SessionEndReason | null }
  | { status: 'error'; message: string }

interface SessionValue {
  state: SessionState
  me: Me | null
  can: (permission: Permission) => boolean
  signIn: (body: LoginRequest) => Promise<void>
  signUp: (body: RegisterRequest) => Promise<{ teamCode: string }>
  signOut: () => Promise<void>
  /** Vuelve a leer /auth/me (p. ej. tras abrir el Piso de Pruebas). */
  reloadMe: () => Promise<void>
  retry: () => void
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'checking' })
  const [attempt, setAttempt] = useState(0)

  // Restaurar al cargar: si hay refresh token, apiRequest hace el refresh (accessToken vive solo en memoria).
  useEffect(() => {
    let cancelled = false
    if (!hasRefreshToken()) {
      setState({ status: 'signedOut', reason: null })
      return
    }
    authApi
      .getMe()
      .then((me) => {
        if (!cancelled) setState({ status: 'signedIn', me })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) setState({ status: 'signedOut', reason: null })
        else setState({ status: 'error', message: errorMessage(error, 'No se pudo validar la sesión.') })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  // Sesión terminada en esta u otra pestaña (refresh reusado, revocada, logout, token inválido).
  useEffect(() => sessionEnded.subscribe((reason) => setState({ status: 'signedOut', reason })), [])

  const signIn = useCallback(async (body: LoginRequest) => {
    const res = await authApi.login(body)
    setTokens(res)
    const me = await authApi.getMe()
    setState({ status: 'signedIn', me })
  }, [])

  const signUp = useCallback(async (body: RegisterRequest) => {
    const res = await authApi.register(body)
    setTokens(res)
    const me = await authApi.getMe()
    setState({ status: 'signedIn', me })
    return { teamCode: res.team.code }
  }, [])

  const signOut = useCallback(async () => {
    const rt = getRefreshToken()
    try {
      if (rt) await authApi.logout(rt)
    } finally {
      endSession('LOGOUT')
    }
  }, [])

  const reloadMe = useCallback(async () => {
    const me = await authApi.getMe()
    setState({ status: 'signedIn', me })
  }, [])

  const retry = useCallback(() => {
    setState({ status: 'checking' })
    setAttempt((n) => n + 1)
  }, [])

  const me = state.status === 'signedIn' ? state.me : null
  const can = useCallback((p: Permission) => me?.permissions.includes(p) ?? false, [me])

  const value = useMemo(
    () => ({ state, me, can, signIn, signUp, signOut, reloadMe, retry }),
    [state, me, can, signIn, signUp, signOut, reloadMe, retry],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>')
  return ctx
}
