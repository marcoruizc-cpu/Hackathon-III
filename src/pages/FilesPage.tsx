import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button, Empty, ErrorBox, inputClass, Loading } from '../components/ui'
import { getFiles, type FileQuery } from '../features/grid/api'
import { FILE_SIZES, FILE_SORTS, FILE_STATUSES } from '../features/grid/dto'
import { parseFileQuery, toSearchParams } from '../features/grid/query'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useRemote } from '../lib/useRemote'

/** Lista paginada del servidor; todo el estado en la URL (atrás/adelante/recargar/compartir). */
export default function FilesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = parseFileQuery(searchParams)
  const key = toSearchParams(query).toString()
  const { data, errorText, loading, retry } = useRemote(`files?${key}`, (signal) => getFiles(query, signal))

  function update(patch: Partial<FileQuery>, resetPage = true) {
    const next = { ...query, ...patch, ...(resetPage ? { page: 0 } : {}) }
    setSearchParams(toSearchParams(next))
  }

  // Si la URL traía valores inválidos, se reescribe la canónica (sin crear entrada en el historial).
  useEffect(() => {
    if (toSearchParams(query).toString() !== searchParams.toString()) setSearchParams(toSearchParams(query), { replace: true })
  })

  const [search, setSearch] = useState(query.q)
  const debounced = useDebouncedValue(search, 400)
  useEffect(() => {
    if (debounced.trim() !== query.q) update({ q: debounced.trim().slice(0, 60) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  // Página que ya no existe (p. ej. tras filtrar) → última válida.
  useEffect(() => {
    if (data && data.totalPages > 0 && query.page >= data.totalPages) update({ page: data.totalPages - 1 }, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query.page])

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Archivos</h1>
      <div className="grid gap-2 sm:grid-cols-4">
        <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" maxLength={60} aria-label="Buscar" />
        <select className={inputClass} value={query.status} onChange={(e) => update({ status: e.target.value })} aria-label="Estado">
          <option value="">Todos</option>
          {FILE_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className={inputClass} value={query.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Orden">
          {FILE_SORTS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className={inputClass} value={query.size} onChange={(e) => update({ size: Number(e.target.value) })} aria-label="Tamaño">
          {FILE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} por página
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-96">
        {loading ? (
          <Loading />
        ) : errorText ? (
          <ErrorBox message={errorText} onRetry={retry} />
        ) : data && data.content.length === 0 ? (
          <Empty message="Sin resultados." />
        ) : data ? (
          <>
            <ul className="divide-y divide-slate-800 rounded border border-slate-800">
              {data.content.map((f) => (
                <li key={f.id} className="flex items-center justify-between p-3">
                  <Link to={`/files/${f.id}/refine`} className="font-medium text-emerald-400 hover:underline">
                    {f.name}
                  </Link>
                  <span className="text-sm text-slate-400">
                    {f.status} · {Math.round(f.progress.overall * 100)}% · {f.refinedGroups}/{f.totalGroups} · errores {f.mistakes}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between">
              <Button variant="secondary" disabled={query.page <= 0} onClick={() => update({ page: query.page - 1 }, false)}>
                Anterior
              </Button>
              <span className="text-sm text-slate-400">
                Página {data.totalPages === 0 ? 0 : query.page + 1} de {data.totalPages} · {data.totalElements} archivos
              </span>
              <Button variant="secondary" disabled={query.page >= data.totalPages - 1} onClick={() => update({ page: query.page + 1 }, false)}>
                Siguiente
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </main>
  )
}
