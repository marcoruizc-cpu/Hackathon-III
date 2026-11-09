import { api } from '../lib/http'
import type { LoginRequest, LoginResponse, Me, RegisterRequest, RegisterResponse } from './dto'

export const login = (body: LoginRequest) =>
  api<LoginResponse>('/auth/login', { method: 'POST', body, auth: false })

export const register = (body: RegisterRequest) =>
  api<RegisterResponse>('/auth/register', { method: 'POST', body, auth: false })

/** No requiere Authorization: revoca la sesión del refresh token y emite session.revoked. */
export const logout = (refreshToken: string) =>
  api<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false })

export const getMe = (signal?: AbortSignal) => api<Me>('/auth/me', { signal })
