import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, apiRequest } from '../lib/session'

interface Item { id:number; fullName?:string; title?:string; version?:number }
export default function RefinersIndexPage() {
  const [params,setParams] = useSearchParams()
  const page = Math.max(0, Number(params.get('page') ?? '0') || 0)
  const [items,setItems] = useState<Item[]>([])
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(true)
  const [hasMore,setHasMore] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true);setError('')
    void apiRequest<unknown>(`/refiners?page=${page}&size=15`,{signal:controller.signal}).then(raw => {
      if (controller.signal.aborted) return
      const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string,unknown> : {}
      const data = obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data) ? obj.data as Record<string,unknown> : obj
      const rows = Array.isArray(data.content) ? data.content : Array.isArray(data.items) ? data.items : Array.isArray(raw) ? raw : []
      setItems(rows.filter((v):v is Item => typeof v === 'object' && v !== null && typeof (v as Item).id === 'number'))
      setHasMore(typeof data.totalPages === 'number' ? page + 1 < data.totalPages : rows.length >= 15)
    }).catch(e => {if (!controller.signal.aborted) setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Error al consultar expedientes')})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return () => controller.abort()
  },[page])
  return <main className="mx-auto max-w-4xl p-6 text-slate-100">
    <h1 className="text-3xl font-bold">Expedientes · CP4/CP5</h1>
    <p className="my-3 text-sm text-slate-300">Edición segura con ETag (If-Match) y resolución de conflictos.</p>
    {loading && <p role="status">Cargando…</p>}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    <ul className="divide-y divide-slate-700">
      {items.map(v => <li key={v.id} className="flex items-center justify-between py-3">
        <span>{v.fullName ?? `Refinador #${v.id}`} · {v.title ?? ''}</span>
        <Link className="text-cyan-300 underline" to={`/refiners/${v.id}/edit`}>Editar</Link>
      </li>)}
    </ul>
    <div className="mt-5 flex gap-4">
      <button disabled={page===0} onClick={()=>setParams({page:String(page-1)})} className="rounded border px-3 py-2 disabled:opacity-40">Anterior</button>
      <button disabled={!hasMore} onClick={()=>setParams({page:String(page+1)})} className="rounded border px-3 py-2 disabled:opacity-40">Siguiente</button>
    </div>
  </main>
}
