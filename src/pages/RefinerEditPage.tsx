import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLumonEvents } from '../features/realtime/useLumonEvents'
import { getRefiner, patchRefiner, type Refiner, type RefinerPatch, type PatchOutcome } from '../features/refiners/api'

interface Draft { title: string; extension: string; bio: string }
const toDraft = (record: Refiner): Draft => ({ title: record.title ?? '', extension: record.extension ?? '', bio: record.bio ?? '' })

export default function RefinerEditPage() {
  const id = Number(useParams().id)
  const [record, setRecord] = useState<Refiner | null>(null)
  const [etag, setEtag] = useState('')
  const [draft, setDraft] = useState<Draft>({title:'',extension:'',bio:''})
  const [serverVersionChanged, setServerVersionChanged] = useState(false)
  const [conflict, setConflict] = useState<{current:Refiner; etag:string} | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!Number.isSafeInteger(id) || id < 1) {setError('ID de expediente inválido'); return}
    setBusy(true)
    try {
      const result = await getRefiner(id)
      setRecord(result.refiner); setEtag(result.etag); setDraft(toDraft(result.refiner))
      setConflict(null); setServerVersionChanged(false); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir el expediente') }
    finally { setBusy(false) }
  }, [id])
  useEffect(() => { void load() }, [load])

  useLumonEvents(['refiner.updated', 'stream.reset'], (event) => {
    if (event.type === 'stream.reset') { setServerVersionChanged(true); return }
    if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return
    const data = event.data as Record<string, unknown>
    const currentId = data.id ?? data.refinerId
    if (currentId === id && (typeof data.version !== 'number' || !record || data.version > record.version)) {
      setServerVersionChanged(true)
    }
  })

  async function save(confirmOverwrite = false) {
    if (!record || busy) return
    if (serverVersionChanged && !confirmOverwrite && !conflict) {
      setError('Otro usuario editó este expediente. Compara la versión del servidor antes de guardar.')
      try {
        const latest = await getRefiner(id)
        setConflict({current:latest.refiner, etag:latest.etag})
      } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo consultar la versión actual.') }
      return
    }
    setBusy(true); setError(''); setNotice('')
    const patch:RefinerPatch = { title: draft.title, extension: draft.extension, bio: draft.bio }
    try {
      const result:PatchOutcome = await patchRefiner(id, patch, confirmOverwrite && conflict ? conflict.etag : etag)
      if (result.kind === 'conflict') {
        setConflict({current:result.current, etag:result.etag})
        setError('Conflicto 412: revisa los campos antes de decidir.')
      } else {
        setRecord(result.refiner); setEtag(result.etag); setDraft(toDraft(result.refiner))
        setConflict(null); setServerVersionChanged(false); setNotice('Expediente actualizado en Lumon.')
      }
    } catch (e) {setError(e instanceof Error ? e.message : 'Error al guardar')} finally {setBusy(false)}
  }

  return <main className="mx-auto max-w-3xl space-y-5 px-5 py-10 text-slate-100">
    <Link to="/refiners" className="text-cyan-300 underline">← Expedientes</Link>
    <h1 className="text-3xl font-bold">Editar expediente · CP5</h1>
    {busy && <p role="status">Procesando…</p>}
    {notice && <p role="status" className="text-emerald-300">{notice}</p>}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    {serverVersionChanged && <p role="alert" className="rounded border border-amber-500 p-3 text-amber-200">Lumon informó cambios en el servidor. No sobrescribiremos sin tu decisión.</p>}
    {record && <>
      <p className="text-slate-300">{record.fullName} · versión leída {record.version} · ETag {etag}</p>
      <label className="block">Cargo
        <input className="mt-1 w-full rounded bg-slate-800 p-2" value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/>
      </label>
      <label className="block">Extensión
        <input className="mt-1 w-full rounded bg-slate-800 p-2" value={draft.extension} onChange={e=>setDraft(d=>({...d,extension:e.target.value}))}/>
      </label>
      <label className="block">Biografía (texto sin HTML)
        <textarea className="mt-1 min-h-32 w-full rounded bg-slate-800 p-2" value={draft.bio} onChange={e=>setDraft(d=>({...d,bio:e.target.value}))}/>
      </label>
      <button disabled={busy || Boolean(conflict)} onClick={()=>void save()} className="rounded bg-cyan-700 px-4 py-2 disabled:opacity-50">Guardar con If-Match</button>
    </>}
    {conflict && <section className="space-y-3 rounded-lg border border-amber-500 bg-slate-900 p-4" role="alert">
      <h2 className="text-xl font-bold">Conflicto de versión — decide qué conservar</h2>
      <div className="grid grid-cols-3 gap-2 text-sm font-semibold"><span>Campo</span><span>Tu edición</span><span>Servidor actual</span></div>
      {(['title','extension','bio'] as const).map(field => <div key={field} className="grid grid-cols-3 gap-2 border-t border-slate-600 pt-2 text-sm">
        <span>{field}</span><span className="break-words">{draft[field]}</span><span className="break-words">{conflict.current[field]}</span>
      </div>)}
      <p className="text-sm text-slate-300">La opción conservar tus cambios crea una nueva operación explícita usando el ETag actual. No hay sobrescritura silenciosa.</p>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="rounded bg-amber-500 px-3 py-2 text-black" onClick={()=>void save(true)}>Conservar mi edición</button>
        <button disabled={busy} className="rounded border border-slate-400 px-3 py-2" onClick={()=>{
          setRecord(conflict.current);setEtag(conflict.etag);setDraft(toDraft(conflict.current));setConflict(null);setServerVersionChanged(false);setError('')
        }}>Usar valores del servidor</button>
      </div>
    </section>}
  </main>
}
