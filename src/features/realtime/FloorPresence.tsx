import { useEffect, useState } from 'react'
import type { FloorClient, FloorState } from './floor'

function useFloor(client: FloorClient | null): FloorState | null {
  const [state, setState] = useState<FloorState | null>(null)
  useEffect(() => {
    if (!client) { setState(null); return }
    const update = (next: FloorState) => setState({ ...next, members: new Map(next.members), claims: new Map(next.claims) })
    update(client.state)
    return client.changed.subscribe(update)
  }, [client])
  return state
}

/** Capa separada: el movimiento de cursores NO fuerza render de toda la grilla del CP2. */
export function FloorCursors({client, cellSize}: {client: FloorClient | null; cellSize: number}) {
  const state = useFloor(client)
  if (!state?.connected) return null
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0">
    {[...state.members.values()].filter(m => m.r !== null && m.c !== null).map(m =>
      <div key={m.userId} className="absolute z-10 rounded border-2 border-fuchsia-400 bg-fuchsia-950/70 px-1 text-xs text-white"
        style={{ top: m.r! * cellSize, left: m.c! * cellSize }}>
        {m.displayName}
      </div>
    )}
    {[...state.claims.values()].filter(c => c.claimId !== state.myClaimId).flatMap(claim =>
      claim.cells.map((cell, i) => <div key={`${claim.claimId}-${i}`} className="absolute border-2 border-rose-400 bg-rose-500/20"
        style={{width:cellSize,height:cellSize,top:cell.r*cellSize,left:cell.c*cellSize}} />)
    )}
  </div>
}

export function FloorPresence({ client, onJump }: {client: FloorClient | null; onJump:(r:number,c:number)=>void}) {
  const state = useFloor(client)
  return <section aria-label="Piso compartido" className="rounded-xl border border-slate-600 p-3">
    <h3 className="font-bold">Piso compartido · CP5</h3>
    <p role="status" className="text-sm">{state?.connected ? 'Conectado' : state?.stoppedReason ? `Desconectado: ${state.stoppedReason}` : 'Conectando…'}</p>
    <p className="text-xs">Reservas visibles: {state?.claims.size ?? 0}</p>
    <ul className="mt-2 space-y-1 text-sm">
      {state && [...state.members.values()].map(member => <li key={member.userId}>
        <button type="button" className="text-cyan-300 underline disabled:text-slate-400" disabled={member.r === null || member.c === null}
          onClick={() => onJump(member.r!, member.c!)}>
          {member.displayName}{member.r !== null && member.c !== null ? ` (${member.r}, ${member.c})` : ' · fuera de vista'}
        </button>
      </li>)}
    </ul>
  </section>
}
