import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LumonApi, type FilesQuery } from './api'
import type { DataFile, Page } from './types'
import './cp2.css'

interface Props { api: LumonApi }

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

export default function FilesPage({ api }: Props) {
  const [params, setParams] = useSearchParams()
  const query = useMemo<FilesQuery>(() => ({
    page: positiveInt(params.get('page'), 1, 100000),
    pageSize: positiveInt(params.get('pageSize'), 10, 100),
    q: params.get('q')?.trim() ?? '',
    status: params.get('status') ?? '',
    sort: params.get('sort') ?? '',
  }), [params])
  const [text, setText] = useState(query.q ?? '')
  const [page, setPage] = useState<Page<DataFile> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)

  const queryKey = JSON.stringify(query)
  useEffect(() => { setText(query.q ?? '') }, [query.q])
  useEffect(() => {
    if (text === (query.q ?? '')) return
    const id = window.setTimeout(() => {
      setParams(previous => {
        const next = new URLSearchParams(previous)
        if (text.trim()) next.set('q', text.trim())
        else next.delete('q')
        next.delete('page')
        return next
      }, { replace: true })
    }, 450)
    return () => window.clearTimeout(id)
  }, [text, query.q, setParams])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    api.files(query, controller.signal).then(data => {
      if (!controller.signal.aborted) setPage(data)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Error al cargar archivos')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [api, queryKey, retry])

  const update = (key: string, value: string) => {
    setParams(previous => {
      const next = new URLSearchParams(previous)
      if (value) next.set(key, value)
      else next.delete(key)
      if (key !== 'page') next.delete('page')
      return next
    })
  }

  return (
    <main className="cp2-page">
      <div className="cp2-heading">
        <div>
          <p className="cp2-eyebrow">LUMON / ORIENTACIÓN</p>
          <h1>Archivos de macrodatos</h1>
          <p>Selecciona un archivo para comenzar a refinar sus grupos.</p>
        </div>
      </div>
      <section className="cp2-panel" aria-label="Filtros de archivos">
        <div className="cp2-filters">
          <label>Buscar
            <input value={text} onChange={event => setText(event.target.value)} placeholder="Nombre del archivo" type="search" />
          </label>
          <label>Estado
            <select value={query.status} onChange={event => update('status', event.target.value)}>
              <option value="">Todos</option>
              <option value="ACTIVE">Activo</option>
              <option value="COMPLETE">Completado</option>
            </select>
          </label>
          <label>Orden
            <select value={query.sort} onChange={event => update('sort', event.target.value)}>
              <option value="">Predeterminado</option>
              <option value="name,asc">Nombre</option>
              <option value="progress,desc">Progreso</option>
              <option value="updatedAt,desc">Actualización reciente</option>
            </select>
          </label>
          <label>Por página
            <select value={String(query.pageSize)} onChange={event => update('pageSize', event.target.value)}>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>
      </section>
      <section className="cp2-panel" aria-busy={loading}>
        {loading && <p role="status" className="cp2-hint">Cargando archivos...</p>}
        {error && <div className="cp2-error" role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Reintentar</button></div>}
        {!loading && !error && page?.items.length === 0 && <p className="cp2-hint">No se encontraron archivos.</p>}
        {!loading && !error && page && page.items.length > 0 && (
          <div className="cp2-table-wrap">
            <table className="cp2-table">
              <thead><tr><th>Archivo</th><th>Estado</th><th>Dimensiones</th><th>Progreso</th><th /></tr></thead>
              <tbody>{page.items.map(file => (
                <tr key={file.id}>
                  <td><strong>{file.name}</strong><span className="cp2-muted">ID {file.id}</span></td>
                  <td>{file.status}</td>
                  <td>{file.rows != null && file.cols != null ? `${file.rows} × ${file.cols}` : '—'}</td>
                  <td>{file.progress === undefined ? '—' : `${file.progress.toFixed(1)}%`}</td>
                  <td><Link className="cp2-button cp2-primary" to={`/files/${file.id}/refine`}>Abrir</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="cp2-pagination">
          <span>Página {query.page}{page?.total !== undefined ? ` · ${page.total} archivos` : ''}</span>
          <div className="cp2-actions">
            <button disabled={loading || query.page <= 1} onClick={() => update('page', String(query.page - 1))}>Anterior</button>
            <button disabled={loading || !page?.hasNext} onClick={() => update('page', String(query.page + 1))}>Siguiente</button>
          </div>
        </div>
      </section>
    </main>
  )
}
