import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { Page } from '../features/grid/dto'
import type { Incident, IncidentCreate, Severity } from '../features/incidents/api'
import { ApiError, apiRequest } from '../lib/session'
import { describeError, safeHttpUrl } from './api'
import MediaUpload from './MediaUpload'
import type { Media } from './media'

const severities: Record<Severity, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' }
const button = 'inline-block rounded-lg border border-cyan-700 px-3 py-2 text-cyan-200 hover:bg-slate-800 disabled:opacity-50'
const field = 'mt-1 block w-full rounded border border-slate-600 bg-slate-900 px-3 py-2'

export default function IncidentsPage() {
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const rawPage = Number(params.get('page') ?? 0)
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 ? rawPage : 0
  const [result, setResult] = useState<Page<Incident> | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    setResult(null)
    void apiRequest<Page<Incident>>('/incidents?page=' + page + '&size=10', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult(data)
    }).catch(error => {
      if (!controller.signal.aborted) setError(describeError(error))
    })
    return () => controller.abort()
  }, [page, retry])

  return <main className="mx-auto max-w-5xl space-y-5 px-5 py-10">
    <h1 className="text-3xl font-bold">Reportes de incidencia</h1>
    {can('incidents:create') && can('media:upload') && <Link className={button} to="/incidents/new">Nuevo reporte</Link>}
    {error && <div role="alert" className="space-y-2 text-amber-300">
      <p>{error}</p><button className={button} onClick={() => setRetry(value => value + 1)}>Reintentar</button>
    </div>}
    {!result && !error && <p role="status">Cargando reportes…</p>}
    {result && <>
      {result.content.length === 0 && <p>No hay reportes en esta página.</p>}
      <ul className="space-y-3">
        {result.content.map(incident => <li className="space-y-3 break-words rounded-lg border border-slate-700 p-4" key={incident.id}>
          <h2 className="text-xl font-semibold">{incident.title}</h2>
          <p className="text-sm text-slate-300">{severities[incident.severity]} · {incident.createdBy.displayName} · {new Date(incident.createdAt).toLocaleString('es-PE')}</p>
          {incident.file && <p>Archivo relacionado · {incident.file.name}</p>}
          <p className="whitespace-pre-wrap">{incident.description}</p>
          <div className="flex flex-wrap gap-3">
            {incident.photos.map((photo, index) => {
              const url = safeHttpUrl(photo.url)
              return url && <a href={url} target="_blank" rel="noopener noreferrer" key={photo.mediaId}>
                <img className="h-24 w-32 rounded bg-slate-800 object-contain" src={url} loading="lazy"
                  width={128} height={96} alt={'Foto ' + (index + 1) + ' de ' + incident.title} />
              </a>
            })}
          </div>
        </li>)}
      </ul>
      <nav aria-label="Paginación de incidencias" className="flex items-center gap-3">
        <button className={button} disabled={page === 0} onClick={() => setParams({ page: String(page - 1) })}>Anterior</button>
        <span>Página {page + 1}{result.totalPages > 0 ? ' de ' + result.totalPages : ''}</span>
        <button className={button} disabled={page + 1 >= result.totalPages} onClick={() => setParams({ page: String(page + 1) })}>Siguiente</button>
      </nav>
    </>}
  </main>
}

interface PhotoSlot {
  id: number
  media: Media | null
}

export function NewIncidentPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<Severity>('LOW')
  const [fileId, setFileId] = useState('')
  const [photos, setPhotos] = useState<PhotoSlot[]>([{ id: 0, media: null }])
  const nextSlot = useRef(1)
  const submission = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => () => submission.current?.abort(), [])

  const allConfirmed = photos.length > 0 && photos.every(slot => slot.media !== null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!allConfirmed || submission.current || created) return
    setError('')
    const id = fileId.trim() ? Number(fileId) : undefined
    if (title.trim().length < 3 || title.trim().length > 120 || !description.trim() || description.trim().length > 4000) {
      setError('Completa el título (3 a 120 caracteres) y la descripción (1 a 4000).')
      return
    }
    if (id !== undefined && (!Number.isSafeInteger(id) || id < 1)) {
      setError('El ID de archivo debe ser un entero positivo.')
      return
    }
    const mediaIds = photos.flatMap(slot => slot.media ? [slot.media.mediaId] : [])
    if (new Set(mediaIds).size !== photos.length) {
      setError('Cada foto debe tener una confirmación distinta.')
      return
    }
    const body: IncidentCreate = { title: title.trim(), description: description.trim(), severity, mediaIds, ...(id === undefined ? {} : { fileId: id }) }
    const controller = new AbortController()
    submission.current = controller
    setBusy(true)
    try {
      await apiRequest<Incident>('/incidents', { method: 'POST', body: JSON.stringify(body), signal: controller.signal })
      if (controller.signal.aborted) return
      setCreated(true)
      if (can('incidents:read')) navigate('/incidents', { replace: true })
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = describeError(error)
        setError(error instanceof ApiError && error.status === 0
          ? message + ' Revisa los reportes antes de repetir el envío si la respuesta se perdió.'
          : message)
      }
    } finally {
      submission.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return <main className="mx-auto max-w-3xl space-y-5 px-5 py-10">
    <h1 className="text-3xl font-bold">Nuevo reporte de incidencia</h1>
    {can('incidents:read') && <Link className="text-cyan-300 underline" to="/incidents">Volver a reportes</Link>}
    {created ? <p role="status">Reporte creado correctamente.</p> : <form className="space-y-5" onSubmit={event => void submit(event)}>
      <fieldset className="space-y-4" disabled={busy}>
        <label className="block">Título<input className={field} value={title} required minLength={3} maxLength={120}
          onChange={event => setTitle(event.currentTarget.value)} /></label>
        <label className="block">Descripción<textarea className={field} value={description} required maxLength={4000} rows={5}
          onChange={event => setDescription(event.currentTarget.value)} /></label>
        <label className="block">Gravedad<select className={field} value={severity} onChange={event => setSeverity(event.currentTarget.value as Severity)}>
          {Object.entries(severities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="block">ID de archivo (opcional)<input className={field} type="number" min={1} step={1} value={fileId}
          onChange={event => setFileId(event.currentTarget.value)} /></label>
      </fieldset>
      <section className="space-y-3" aria-labelledby="incident-photos">
        <h2 className="text-xl font-semibold" id="incident-photos">Fotos · 1 a 3</h2>
        {photos.map((slot, index) => <div className="space-y-2 rounded-lg bg-slate-900 p-3" key={slot.id}>
          <h3 className="font-semibold">Foto {index + 1}</h3>
          {slot.media
            ? <div className="flex items-center gap-3"><img className="h-20 w-24 rounded object-contain" width={96} height={80}
                src={safeHttpUrl(slot.media.url) ?? undefined} alt={'Foto ' + (index + 1)} /><p role="status">Confirmada por Lumon</p></div>
            : <MediaUpload purpose="INCIDENT" disabled={busy} onMedia={media => {
                setPhotos(current => current.map(item => item.id === slot.id ? { ...item, media } : item))
              }} />}
          {(photos.length > 1 || slot.media) && <button className={button} type="button" disabled={busy} onClick={() => {
            const replacement = { id: nextSlot.current++, media: null }
            setPhotos(current => current.length > 1 ? current.filter(item => item.id !== slot.id) : [replacement])
          }}>Quitar foto {index + 1}</button>}
        </div>)}
        {photos.length < 3 && <button className={button} type="button" disabled={busy} onClick={() => {
          const slot = { id: nextSlot.current++, media: null }
          setPhotos(current => current.length < 3 ? [...current, slot] : current)
        }}>Añadir otra foto</button>}
      </section>
      {!allConfirmed && <p className="text-sm text-slate-300">Confirma todas las fotos añadidas para enviar el reporte.</p>}
      {error && <p role="alert" className="text-amber-300">{error}</p>}
      <button className={button} type="submit" disabled={busy || !allConfirmed}>{busy ? 'Enviando…' : 'Enviar reporte'}</button>
    </form>}
  </main>
}
