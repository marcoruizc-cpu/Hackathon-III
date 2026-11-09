import { api } from '../../lib/http'

// Contratos de Swagger — tags Integraciones, Equipo, Sala de Bienestar.
export interface Check {
  name: string
  passed: boolean
  detail: string
}

export interface DeployChallenge {
  origin: string
  token: string
  wellKnownPath: string
  expiresAt: string
}

export interface IntegrationStatus {
  deploy: {
    origin: string | null
    verifiedAt: string | null
    lastBuildSeen: string | null
    lastBuildSeenAt: string | null
    pendingChallenge: { origin: string; expiresAt: string } | null
  }
  storage: { provider: 'SUPABASE' | 'CLOUDINARY' | null; verifiedAt: string | null; checks: Check[]; config: Record<string, string> | null }
  clearance: { granted: boolean; grantedAt: string | null }
}

export type StorageRequest =
  | { provider: 'SUPABASE'; projectUrl: string; bucket: 'lumon-media'; publicKey: string }
  | { provider: 'CLOUDINARY'; cloudName: string; uploadPreset: string }

export interface RosterMember {
  name: string
  code: string
}

export interface Roster {
  members: RosterMember[]
  complete: boolean
  locked: boolean
}

export interface ClearanceCheckResult {
  granted: boolean
  grantedAt: string | null
  checks: Check[]
}

export interface Clearance extends ClearanceCheckResult {
  checkedAt: string | null
  workspace: { kind: 'DEV' | 'EVAL'; chaosLevel: 0 | 1 | 2 }
  roster: Roster
  round: {
    approved: boolean
    nextRoundAt: string | null
    drawnMember: { round: number; name: string; code: string; startsAt: string } | null
    attempts: { round: number; member: RosterMember; result: 'PASSED' | 'FAILED' | 'ABSENT' | null }[]
  }
}

export const requestChallenge = (origin: string) =>
  api<DeployChallenge>('/integrations/deploy/challenge', { method: 'POST', body: { origin } })
export const verifyDeploy = () => api<{ origin: string; verifiedAt: string }>('/integrations/deploy/verify', { method: 'POST' })
export const registerStorage = (body: StorageRequest) =>
  api<{ provider: string; verifiedAt: string; checks: Check[] }>('/integrations/storage', { method: 'PUT', body })
export const getIntegrationStatus = (signal?: AbortSignal) => api<IntegrationStatus>('/integrations/status', { signal })

export const getRoster = (signal?: AbortSignal) => api<Roster>('/team/roster', { signal })
export const putRoster = (members: RosterMember[]) => api<Roster>('/team/roster', { method: 'PUT', body: { members } })

export const setChaos = (level: 0 | 1 | 2) => api<{ level: number }>('/workspace/chaos', { method: 'PUT', body: { level } })

export const getClearance = (signal?: AbortSignal) => api<Clearance>('/clearance', { signal })
export const runClearanceCheck = () => api<ClearanceCheckResult>('/clearance/check', { method: 'POST' })
