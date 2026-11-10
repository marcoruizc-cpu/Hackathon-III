import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Page } from '../features/grid/dto'
import { describeError, getDepartments, getRefiners, safeHttpUrl, type Department, type Refiner } from './api'

export function RefinerBadge({ refiner }: { refiner: Refiner }) {
  const url = safeHttpUrl(refiner.badge?.url ?? null)
  return <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-800">
    {url ? <img className="h-full w-full object-cover" width={80} height={80} loading="lazy"
      src={url} alt={'Fotocheck de ' + refiner.fullName} /> : <span className="text-center text-xs text-slate-300">Sin fotocheck</span>}
  </div>
}

export default function RefinersPage() {
  const [params, setParams] = useSearchParams()
  const [departments, setDepartments] = useState<Department[]>([])
  const [departmentError, setDepartmentError] = useState('')
  const [result, setResult] = useState<Page<Refiner> | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const rawPage = Number(params.get('page') ?? 0)
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 ? rawPage : 0
  const rawSize = Number(params.get('size'))
  const size = rawSize === 25 || rawSize === 50 ? rawSize : 10
  const rawDepartment = params.get('departmentId') ?? ''
  const department = /^[1-9][0-9]*$/.test(rawDepartment) && Number.isSafeInteger(Number(rawDepartment)) ? rawDepartment : ''
  const query = (params.get('q') ?? '').slice(0, 60)
  const [search, setSearch] = useState(query)
  useEffect(() => { setSearch(query) }, [query])

  useEffect(() => {
    const controller = new AbortController()
    setDepartmentError('')
    void getDepartments(controller.signal).then(data => {
      if (!controller.signal.aborted) setDepartments(data)
    }).catch(error => {
      if (!controller.signal.aborted) setDepartmentError(describeError(error))
    })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    setResult(null)
    void getRefiners(page, size, department, query, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult(data)
    }).catch(error => {
      if (!controller.signal.aborted) setError(describeError(error))
    })
    return () => controller.abort()
  }, [page, size, department, query, retry])

  function update(key: string, value: string, resetPage = true) {
    const next = new URLSearchParams(params)
    if (resetPage) next.delete('page')
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  const field = 'mt-1 block w-full rounded border border-slate-600 bg-slate-900 px-3 py-2'
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
    <h1 className="text-3xl font-bold">Expedientes del personal</h1>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); update('q', search.trim()) }}>
      <label>Nombre, título o anexo<input className={field} type="search" value={search} maxLength={60}
        onChange={event => setSearch(event.currentTarget.value)} /></label>
      <button className="rounded border border-cyan-600 px-3 py-2" type="submit">Buscar</button>
      <label>Departamento<select className={field} value={department} onChange={event => update('departmentId', event.currentTarget.value)}>
        <option value="">Todos</option>
        {department && !departments.some(item => String(item.id) === department) && <option value={department}>Departamento {department}</option>}
        {departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label>Por página<select className={field} value={size} onChange={event => update('size', event.currentTarget.value)}>
        {[10, 25, 50].map(value => <option key={value}>{value}</option>)}
      </select></label>
    </form>
    {(error || departmentError) && <div role="alert" className="space-y-2 text-amber-300">
      {error && <p>{error}</p>}
      {departmentError && departmentError !== error && <p>Departamentos · {departmentError}</p>}
      <button className="rounded border px-3 py-2" onClick={() => setRetry(value => value + 1)}>Reintentar</button>
    </div>}
    {!result && !error && <p role="status">Cargando expedientes…</p>}
    {result && <>
      <p role="status">{result.totalElements} expedientes</p>
      {result.content.length === 0 && <p>No hay expedientes en esta página.</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {result.content.map(refiner => <li className="flex gap-3 rounded-lg border border-slate-700 p-4" key={refiner.id}>
          <RefinerBadge refiner={refiner} />
          <div className="min-w-0 break-words">
            <Link className="font-semibold text-cyan-300 underline" to={'/refiners/' + refiner.id}>{refiner.fullName}</Link>
            <p>{refiner.title}</p><p className="text-sm text-slate-300">{refiner.department.name} · Anexo {refiner.extension}</p>
          </div>
        </li>)}
      </ul>
      <nav aria-label="Paginación de expedientes" className="flex flex-wrap items-center gap-3">
        <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={page === 0} onClick={() => update('page', String(page - 1), false)}>Anterior</button>
        <span>Página {page + 1}{result.totalPages > 0 ? ' de ' + result.totalPages : ''}</span>
        <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={page + 1 >= result.totalPages} onClick={() => update('page', String(page + 1), false)}>Siguiente</button>
      </nav>
    </>}
  </main>
}
