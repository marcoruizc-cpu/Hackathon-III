// CP1: access tokens exist ONLY in JavaScript memory. Refresh tokens are one-use.
// Native Web Locks coordinates the rotation across tabs.
const API_BASE = import.meta.env.VITE_API_BASE_URL
const REFRESH_KEY = 'lumon.refresh'
const SESSION_MARKER = 'lumon.session-marker'

export interface UserInfo {
  id?: number
  email?: string
  displayName?: string
}
export interface TeamInfo { code?: string; name?: string }
export interface SessionView {
  status: 'loading' | 'authenticated' | 'anonymous'
  user: UserInfo | null
  team: TeamInfo | null
  permissions: string[]
  reason: string | null
}
export interface AuthResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user?: UserInfo
  team?: TeamInfo
}
export interface MyProfile {
  user?: UserInfo
  team?: TeamInfo
  permissions?: string[]
  role?: { code: string; name?: string }
}
interface ServerError {
  error?: string
  message?: string
  details?: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

let accessToken: string | null = null
let expiresAt = 0
let view: SessionView = {
  status: 'loading', user: null, team: null, permissions: [], reason: null,
}
const listeners = new Set<() => void>()
function notify() { for (const listener of listeners) listener() }
function patchView(patch: Partial<SessionView>) {
  view = { ...view, ...patch }; notify()
}
export function getSessionSnapshot() { return view }
export function subscribeSession(listener: () => void) {
  listeners.add(listener); return () => { listeners.delete(listener) }
}

const TAB_ID = crypto.randomUUID()
type SessionEvent =
  | { type: 'tokens'; from: string; access: string; expiresAt: number; user?: UserInfo | null; team?: TeamInfo | null; permissions?: string[] }
  | { type: 'logout'; from: string; reason: string | null }
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lumon-session-v1') : null
function broadcast(event: SessionEvent) { channel?.postMessage(event) }
function clearLocal(reason: string | null, broadcastChange = true) {
  accessToken = null; expiresAt = 0
  localStorage.removeItem(REFRESH_KEY)
  localStorage.setItem(SESSION_MARKER, crypto.randomUUID())
  patchView({ status: 'anonymous', user: null, team: null, permissions: [], reason })
  if (broadcastChange) broadcast({ type: 'logout', from: TAB_ID, reason })
}
channel?.addEventListener('message', (event: MessageEvent<SessionEvent>) => {
  const data = event.data
  if (!data || data.from === TAB_ID) return
  if (data.type === 'logout') {
    accessToken = null; expiresAt = 0
    patchView({ status: 'anonymous', user: null, team: null, permissions: [], reason: data.reason })
  } else if (data.type === 'tokens') {
    // Access token is transferred between running tabs, but never persisted.
    accessToken = data.access; expiresAt = data.expiresAt
    patchView({
      status: 'authenticated',
      user: data.user ?? view.user,
      team: data.team ?? view.team,
      permissions: data.permissions ?? view.permissions,
      reason: null,
    })
  }
})
window.addEventListener('storage', (event) => {
  if (event.key === REFRESH_KEY && !event.newValue && view.status !== 'anonymous') {
    accessToken = null; expiresAt = 0
    patchView({status:'anonymous',user:null,team:null,permissions:[],reason:'La sesión se cerró en otra pestaña.'})
  }
})

async function fetchJSON<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('X-Lumon-Build', __LUMON_BUILD__)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con Lumon.')
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const server: ServerError = body && typeof body === 'object' ? body as ServerError : {}
    throw new ApiError(response.status, server.error ?? 'HTTP_ERROR', server.message ?? `Error HTTP ${response.status}`, server.details)
  }
  return body as T
}

export async function checkHealth(signal?: AbortSignal): Promise<void> {
  await fetchJSON<unknown>('/meta/health', {signal})
}

function installTokens(payload: AuthResult) {
  if (!payload.accessToken || !payload.refreshToken) throw new Error('Lumon no devolvió ambos tokens.')
  accessToken = payload.accessToken
  expiresAt = Date.now() + Math.max(0, payload.expiresIn) * 1000
  localStorage.setItem(REFRESH_KEY, payload.refreshToken)
  patchView({status:'authenticated', user: payload.user ?? view.user, team: payload.team ?? view.team, reason:null})
  broadcast({type:'tokens',from:TAB_ID,access:accessToken,expiresAt,user:view.user,team:view.team,permissions:view.permissions})
}

let inflightRefresh: Promise<string> | null = null
async function doRefresh(): Promise<string> {
  const perform = async (): Promise<string> => {
    // Read the CURRENT one-use token while holding the cross-tab lock.
    const token = localStorage.getItem(REFRESH_KEY)
    if (!token) throw new ApiError(401,'NO_SESSION','No hay sesión activa.')
    try {
      const payload = await fetchJSON<AuthResult>('/auth/refresh', {
        method:'POST',body:JSON.stringify({refreshToken:token}),
      })
      installTokens(payload)
      return payload.accessToken
    } catch (error) {
      if (error instanceof ApiError && (error.status === 0 || error.status === 401 || ['REFRESH_REUSED','SESSION_REVOKED','TOKEN_INVALID'].includes(error.code))) {
        clearLocal(error.status === 0 ? 'No se confirmó la rotación del token. Inicia sesión nuevamente para evitar reutilizarlo.' : 'La sesión fue revocada. Inicia sesión nuevamente.')
      }
      throw error
    }
  }
  if (navigator.locks) {
    return navigator.locks.request('lumon-refresh-token', {mode:'exclusive'}, perform)
  }
  // Modern Chromium supports navigator.locks; fallback only protects one tab.
  return perform()
}
export function refreshAccess(): Promise<string> {
  if (!inflightRefresh) {
    inflightRefresh = doRefresh().finally(() => { inflightRefresh = null })
  }
  return inflightRefresh
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken && localStorage.getItem(REFRESH_KEY)) await refreshAccess()
  if (!accessToken) throw new ApiError(401,'NO_SESSION','Debes iniciar sesión.')
  const usedToken = accessToken
  try {
    return await fetchJSON<T>(path,init,usedToken)
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    if (['SESSION_REVOKED','REFRESH_REUSED','TOKEN_INVALID'].includes(error.code)) {
      clearLocal('Tu sesión fue revocada. Inicia sesión otra vez.')
      throw error
    }
    if (error.code !== 'TOKEN_EXPIRED') throw error
    // Another request/tab may have already renewed the token.
    const fresh = accessToken && accessToken !== usedToken && expiresAt > Date.now()
      ? accessToken : await refreshAccess()
    // Exactly one retry per original request.
    return fetchJSON<T>(path,init,fresh)
  }
}

async function readProfile() {
  const me = await apiRequest<MyProfile>('/auth/me')
  patchView({
    status:'authenticated',
    user: me.user ?? view.user,
    team: me.team ?? view.team,
    permissions: Array.isArray(me.permissions) ? me.permissions : [],
    reason:null,
  })
  if (accessToken) broadcast({
    type:'tokens',from:TAB_ID,access:accessToken,expiresAt,
    user:view.user,team:view.team,permissions:view.permissions,
  })
}
let bootstrapTask: Promise<void> | null = null
export function bootstrapSession(): Promise<void> {
  if (!bootstrapTask) {
    bootstrapTask = (async () => {
      if (!localStorage.getItem(REFRESH_KEY)) {
        patchView({status:'anonymous',reason:null});return
      }
      try {
        await refreshAccess()
        await readProfile()
      } catch(error) {
        if (error instanceof ApiError && error.status === 0) {
          // Keep the refresh token: a temporary outage is not a logout.
          patchView({status:'anonymous',reason:'No se pudo restaurar la sesión. Reintenta al volver la conexión.'})
        } else if (localStorage.getItem(REFRESH_KEY)) {
          patchView({status:'anonymous',reason:'No se pudo restaurar la sesión. Vuelve a iniciar sesión.'})
        }
      }
    })()
  }
  return bootstrapTask
}

async function authorize(payload: AuthResult) {
  installTokens(payload)
  try { await readProfile() }
  catch (error) {
    // Display the login but keep permissions safe (none) when /auth/me fails.
    patchView({ status:'authenticated', permissions:[] })
    if (error instanceof ApiError && error.code === 'SESSION_REVOKED') throw error
  }
}
export async function login(email: string,password: string) {
  const payload = await fetchJSON<AuthResult>('/auth/login',{
    method:'POST',body:JSON.stringify({email,password}),
  })
  await authorize(payload)
}
export async function register(teamName: string,email: string,password: string) {
  // Confirm exact field names against the /auth/register schema in Swagger.
  const payload = await fetchJSON<AuthResult>('/auth/register',{
    method:'POST',body:JSON.stringify({teamName,email,password}),
  })
  await authorize(payload)
}
export async function logout() {
  // Prevent refresh/logout races across tabs with the SAME Web Lock.
  const perform = async () => {
    const token = accessToken
    const refresh = localStorage.getItem(REFRESH_KEY)
    try {
      if (refresh) {
        await fetchJSON('/auth/logout',{
          method:'POST',body:JSON.stringify({refreshToken:refresh}),
        },token)
      }
    } finally {
      clearLocal(null)
    }
  }
  if (navigator.locks) await navigator.locks.request('lumon-refresh-token', {mode:'exclusive'}, perform)
  else await perform()
}
