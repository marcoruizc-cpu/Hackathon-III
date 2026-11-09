import { ApiError, NetworkError } from '../../lib/errors'
import { backoffMs, sleep } from '../../lib/sleep'
import { postRefinement } from './api'
import type { Bin, Cell, RefineResult } from './dto'

/**
 * Una INTENCIÓN de refinar = una Idempotency-Key. Se crea al decidir refinar un grupo y se
 * reutiliza en cada reintento (red, 503, doble clic). Regla de Kier: ningún grupo se refina dos veces.
 */
export interface RefineIntent {
  key: string
  fileId: number
  bin: Bin
  cells: Cell[]
}

export function createIntent(fileId: number, bin: Bin, cells: Cell[]): RefineIntent {
  return { key: crypto.randomUUID(), fileId, bin, cells }
}

export interface RefineOutcome {
  result: RefineResult
  /** true si la respuesta fue la repetición guardada (Idempotent-Replayed: true). */
  replayed: boolean
  attempts: number
}

/**
 * Envía la intención y, ante 503 o fallo de red, reintenta con la MISMA key tras Retry-After.
 * Con caos ≥ 1 el primer refinamiento suele "perder" la respuesta (503) aunque ya se guardó:
 * el reintento devuelve 201 + Idempotent-Replayed. Errores definitivos (409/422/4xx) se lanzan tal cual.
 */
export async function submitRefinement(intent: RefineIntent, maxAttempts = 6): Promise<RefineOutcome> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await postRefinement(intent.fileId, { bin: intent.bin, cells: intent.cells }, intent.key)
      return { result: res.data, replayed: res.headers.get('Idempotent-Replayed') === 'true', attempts: attempt + 1 }
    } catch (error: unknown) {
      const retryable =
        error instanceof NetworkError || (error instanceof ApiError && (error.status === 503 || error.status === 429))
      if (retryable && attempt + 1 < maxAttempts) {
        await sleep(backoffMs(attempt, error instanceof ApiError ? error.retryAfter : null))
        continue
      }
      throw error
    }
  }
}

/** Mensaje claro para cada error del contrato. */
export function describeRefineError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Sin conexión. Reintenta: se usará la misma key, no se duplicará.'
  const d = error.details as Record<string, unknown> | null
  switch (error.error) {
    case 'ALREADY_REFINED':
      return 'Ese grupo ya estaba refinado. Se actualizaron los bloques.'
    case 'GROUP_CLAIMED': {
      const holder = d && typeof d.holder === 'object' && d.holder ? (d.holder as { displayName?: string }).displayName : null
      return `Reservado por ${holder ?? 'otro usuario'}. Intenta en unos segundos.`
    }
    case 'GROUP_INVALID':
      return `Grupo inválido (${String(d?.reason ?? '')}${d?.missing !== undefined ? `, faltan ${String(d.missing)}` : ''}).`
    case 'WRONG_BIN':
      return `Caja equivocada. Errores del archivo: ${String(d?.mistakes ?? '?')}.`
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'Esa key ya se usó con otro cuerpo (error de la app).'
    default:
      return error.message
  }
}
