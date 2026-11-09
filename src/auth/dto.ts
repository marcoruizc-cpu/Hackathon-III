// Contratos de Swagger (Lumon API 2.0.0) — tag Sesión.
export type Permission =
  | 'files:read'
  | 'files:refine'
  | 'refiners:read'
  | 'refiners:write'
  | 'media:upload'
  | 'incidents:read'
  | 'incidents:create'
  | 'team:manage'

export interface User {
  id: number
  email: string
  displayName: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface LoginResponse extends TokenPair {
  user: User
}

export interface RegisterResponse extends TokenPair {
  user: User
  team: { code: string; name: string }
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  teamName: string
  email: string
  password: string
}

export interface ClearanceStatus {
  granted: boolean
  grantedAt: string | null
}

/** GET /auth/me */
export interface Me {
  id: number
  email: string
  displayName: string
  team: { code: string; name: string }
  role: { code: string; name: string }
  permissions: Permission[]
  clearance: ClearanceStatus
}
