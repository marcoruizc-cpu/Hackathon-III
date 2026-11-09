export interface Emitter<T> {
  emit: (value: T) => void
  subscribe: (listener: (value: T) => void) => () => void
}

export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<(value: T) => void>()
  return {
    emit(value) {
      listeners.forEach((l) => l(value))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
