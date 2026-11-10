import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { describeError, getRefiner, patchRefiner, safeHttpUrl, type RefinerSnapshot } from './api'
import MediaUpload from './MediaUpload'
import type { Media } from './media'
import { RefinerBadge } from './RefinersPage'

const button = 'rounded-lg border border-cyan-700 px-3 py-2 text-cyan-200 hover:bg-slate-800 disabled:opacity-50'

export default function RefinerPage({ editBadge = false }: { editBadge?: boolean }) {
  const { id } = useParams()
  const refinerId = Number(id)
  if (!id || !/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(refinerId)) {
    return <main className="p-8"><h1 className="text-2xl font-bold">Expediente inválido</h1><Link to="/refiners">Volver al directorio</Link></main>
  }
  return <RefinerDetail key={id + ':' + editBadge} id={refinerId} editBadge={editBadge} />
}

function RefinerDetail({ id, editBadge }: { id: number; editBadge: boolean }) {
  const { can } = useAuth()
  const [snapshot, setSnapshot] = useState<RefinerSnapshot | null>(null)
  const [media, setMedia] = useState<Media | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const saving = useRef<AbortController | null>(null)
  useEffect(() => () => saving.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    void getRefiner(id, controller.signal).then(value => {
      if (!controller.signal.aborted) setSnapshot(value)
    }).catch(error => {
      if (!controller.signal.aborted) setError(describeError(error))
    })
    return () => controller.abort()
  }, [id, retry])

  async function assign(photo: Media, base: RefinerSnapshot) {
    if (saving.current || !can('refiners:write') || !can('media:upload')) return
    const controller = new AbortController()
    saving.current = controller
    setMedia(photo)
    setBusy(true)
    setError('')
    setStatus('Asignando fotocheck…')
    try {
      const current = base.etag ? base : await getRefiner(id, controller.signal)
      const result = await patchRefiner(id, { badgeMediaId: photo.mediaId }, current.etag, controller.signal)
      if (controller.signal.aborted) return
      setSnapshot(result.snapshot)
      if (result.kind === 'conflict' && result.snapshot.refiner.badge?.url !== photo.url) {
        setStatus('')
        setError('El expediente cambió mientras editabas. Revisa la versión actual que se muestra aquí y decide si quieres aplicar tu fotocheck.')
        return
      }
      setMedia(null)
      setStatus('Fotocheck actualizado.')
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(describeError(error))
        setStatus('')
      }
    } finally {
      saving.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  const refiner = snapshot?.refiner
  const profile = safeHttpUrl(refiner?.profileUrl ?? null)
  const canEdit = can('refiners:write') && can('media:upload')
  return <main className="mx-auto max-w-3xl space-y-5 px-5 py-10">
    <Link className="text-cyan-300 underline" to={editBadge ? '/refiners/' + id : '/refiners'}>
      {editBadge ? 'Volver al expediente' : 'Volver al directorio'}
    </Link>
    <h1 className="break-words text-3xl font-bold">{editBadge ? 'Editar fotocheck' : refiner?.fullName ?? 'Expediente'}</h1>
    {!snapshot && !error && <p role="status">Cargando expediente…</p>}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {!snapshot && error && <button className={button} onClick={() => setRetry(value => value + 1)}>Reintentar</button>}
    {snapshot && refiner && <>
      <div className="flex items-start gap-4 rounded-lg border border-slate-700 p-4">
        <RefinerBadge refiner={refiner} />
        <div className="min-w-0 break-words">
          {editBadge && <h2 className="font-semibold">{refiner.fullName}</h2>}
          <p>{refiner.title}</p>
          <p>{refiner.department.name} · Anexo {refiner.extension}</p>
          <p className="text-sm text-slate-300">Versión {refiner.version}</p>
        </div>
      </div>
      {!editBadge && <>
        <p className="whitespace-pre-wrap break-words">{refiner.bio}</p>
        {profile && <a className="block text-cyan-300 underline" href={profile} target="_blank" rel="noopener noreferrer">Abrir perfil externo</a>}
        {canEdit && <Link className={button + ' inline-block'} to={'/refiners/' + id + '/badge'}>Cambiar fotocheck</Link>}
      </>}
      {editBadge && canEdit && <>
        <MediaUpload purpose="BADGE" disabled={busy || !!media} onMedia={photo => void assign(photo, snapshot)} />
        {media && !busy && <div className="flex flex-wrap items-center gap-3">
          <img className="h-16 w-16 rounded object-cover" src={safeHttpUrl(media.url) ?? undefined} width={64} height={64} alt="Fotocheck pendiente de asignación" />
          <button className={button} onClick={() => void assign(media, snapshot)}>Aplicar fotocheck confirmado</button>
          <button className={button} onClick={() => { setMedia(null); setError('') }}>Descartar cambio</button>
        </div>}
        {status && <p role="status">{status}</p>}
      </>}
    </>}
  </main>
}
