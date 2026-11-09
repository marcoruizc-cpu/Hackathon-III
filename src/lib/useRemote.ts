import { useCallback, useEffect, useRef, useState } from 'react'

import { errorMessage } from './errors'

interface Result<T> {
  key: string
  data: T | null
  error: unknown
}

export interface Remote<T> {
  data: T | null
  error: unknown
  errorText: string | null
  loading: boolean
  retry: () => void
  /** Reemplaza el dato en memoria (p. ej. tras un PATCH) sin volver a pedir. */
  setData: (data: T) => void
}

/**
 * GET por `key` (H2): aborta la request anterior al cambiar la key y solo muestra
 * la respuesta cuya key es la actual. Con caos (respuestas desordenadas) esto es obligatorio.
 */
export function useRemote<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): Remote<T> {
  const [result, setResult] = useState<Result<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    loadRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data, error: null })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, data: null, error })
      })
    return () => controller.abort()
  }, [key, attempt])

  const current = result && result.key === key ? result : null
  const retry = useCallback(() => {
    setResult(null)
    setAttempt((n) => n + 1)
  }, [])
  const setData = useCallback(
    (data: T) => {
      if (key !== null) setResult({ key, data, error: null })
    },
    [key],
  )

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    errorText: current?.error ? errorMessage(current.error) : null,
    loading: key !== null && current === null,
    retry,
    setData,
  }
}
