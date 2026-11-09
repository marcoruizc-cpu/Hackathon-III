/** Espera cancelable. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Espera creciente: Retry-After (si vino) o 500ms·2^intento, con jitter, tope 15 s.
 * Jitter = aleatorio para que varias pestañas/requests no reintenten en el mismo instante.
 */
export function backoffMs(attempt: number, retryAfterSeconds: number | null): number {
  if (retryAfterSeconds !== null) return retryAfterSeconds * 1000 + Math.random() * 250
  const base = Math.min(15000, 500 * 2 ** attempt)
  return base / 2 + Math.random() * (base / 2)
}
