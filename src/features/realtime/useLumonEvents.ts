import { useEffect, useRef } from 'react'

import { lumonEvents, type EventType, type LumonEvent } from './events'

/** Suscribe un componente a ciertos tipos de evento. */
export function useLumonEvents(types: readonly EventType[], handler: (ev: LumonEvent) => void) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  const key = types.join(',')
  useEffect(() => {
    const wanted = new Set(key.split(','))
    return lumonEvents.subscribe((ev) => {
      if (wanted.has(ev.type)) ref.current(ev)
    })
  }, [key])
}
