import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/session'
import { describeError } from './api'
import BadgeCrop from './BadgeCrop'
import { confirmMedia, defaultCrop, prepareMedia, sendMedia, type Media, type MediaPurpose, type PreparedMedia, type UploadedMedia } from './media'
import type { UploadProgress } from './storage'

const button = 'rounded-lg border border-cyan-700 px-3 py-2 hover:bg-slate-800 disabled:opacity-50'

export default function MediaUpload({ purpose, onMedia, disabled }: {
  purpose: MediaPurpose
  onMedia: (media: Media) => void
  disabled: boolean
}) {
  const task = useRef<AbortController | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [selection, setSelection] = useState(0)
  const [crop, setCrop] = useState(defaultCrop)
  const [image, setImage] = useState<PreparedMedia | null>(null)
  const [preview, setPreview] = useState('')
  const [pending, setPending] = useState<UploadedMedia | null>(null)
  const [stage, setStage] = useState('')
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [error, setError] = useState('')
  useEffect(() => () => task.current?.abort(), [])
  useEffect(() => {
    if (!image) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(image.blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  async function prepare(file: File) {
    if (task.current) return
    const controller = new AbortController()
    task.current = controller
    setImage(null)
    setPending(null)
    setError('')
    setStage('Preparando WebP…')
    try {
      const result = await prepareMedia(file, purpose, controller.signal, crop)
      if (!controller.signal.aborted) setImage(result)
    } catch (error) {
      if (!controller.signal.aborted) setError(describeError(error))
    } finally {
      task.current = null
      setStage('')
    }
  }

  function select(next: File) {
    if (disabled || task.current) return
    setError('')
    setImage(null)
    setPending(null)
    if (purpose === 'BADGE') {
      setFile(next)
      setSelection(value => value + 1)
      setCrop(defaultCrop)
    } else {
      void prepare(next)
    }
  }

  async function upload() {
    if (!image || task.current || disabled) return
    const controller = new AbortController()
    task.current = controller
    setError('')
    setProgress(null)
    try {
      let uploaded = pending
      if (!uploaded) {
        setStage('Solicitando ticket a Lumon…')
        uploaded = await sendMedia(image, purpose, value => {
          setStage('Subiendo a Supabase…')
          setProgress(value)
        }, controller.signal)
        if (controller.signal.aborted) return
        setPending(uploaded)
      }
      setStage('Confirmando con Lumon…')
      const media = await confirmMedia(uploaded, controller.signal)
      if (controller.signal.aborted) return
      setImage(null)
      setPending(null)
      setFile(null)
      onMedia(media)
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(describeError(error))
        if (error instanceof ApiError && error.status === 410) setPending(null)
      }
    } finally {
      task.current = null
      setStage('')
      setProgress(null)
    }
  }

  const percent = progress?.total ? Math.round(100 * progress.loaded / progress.total) : null
  return <div onDragOver={event => event.preventDefault()}
    onDrop={event => {
      event.preventDefault()
      const next = event.dataTransfer.files[0]
      if (next) select(next)
    }}
    onPaste={event => {
      const next = Array.from(event.clipboardData.files).find(item => item.type.startsWith('image/'))
      if (!next) return
      event.preventDefault()
      select(next)
    }} className="space-y-3 rounded-lg border border-slate-700 p-4">
    <label className="block">
      <span className="block font-medium">{purpose === 'BADGE' ? 'Preparar fotocheck' : 'Preparar foto de incidencia'}</span>
      <input className="mt-2 block w-full text-sm" type="file" accept="image/*" disabled={disabled || !!stage}
        onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) select(file)
        }} />
    </label>
    <p className="text-sm text-slate-300">También puedes arrastrar una imagen aquí o pegarla con el foco en el selector.</p>
    {file && <BadgeCrop key={selection} file={file} crop={crop} disabled={disabled || !!stage} onCrop={next => {
      setCrop(next)
      setImage(null)
      setPending(null)
      setError('')
    }} />}
    {file && !image && <button className={button} type="button" disabled={disabled || !!stage} onClick={() => void prepare(file)}>
      Preparar recorte
    </button>}
    {image && preview && <div className="flex items-center gap-3">
      <img className="h-20 w-20 rounded object-contain" src={preview} alt="Vista previa del WebP" />
      <p className="text-sm text-slate-300">{image.width} × {image.height} · {image.blob.size.toLocaleString('es-PE')} bytes</p>
    </div>}
    {stage && <p role="status">{stage}</p>}
    {stage === 'Subiendo a Supabase…' && <div className="flex items-center gap-3">
      <progress aria-label="Progreso de subida" max={100} value={percent ?? undefined} />
      <span>{percent === null ? 'Enviando…' : percent + '%'}</span>
    </div>}
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {image && <button className={button} type="button" disabled={disabled || !!stage} onClick={() => void upload()}>
      {pending ? 'Reintentar confirmación' : 'Subir imagen'}
    </button>}
    {stage && <button className={button + ' ml-2'} type="button" onClick={() => task.current?.abort()}>Cancelar</button>}
  </div>
}
