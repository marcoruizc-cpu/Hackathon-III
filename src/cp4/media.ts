import type { Media, MediaPurpose, MediaTicket } from '../features/media/media'
import type { IntegrationStatus } from '../features/integrations/api'
import { apiRequest } from '../lib/session'
import { uploadToSupabase, type UploadProgress } from './storage'

export type { Media, MediaPurpose }

export interface PreparedMedia {
  blob: Blob
  width: number
  height: number
  sha256: string
}

function encodeWebP(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob || blob.type !== 'image/webp') reject(new Error('Este navegador no pudo exportar el recorte como WebP. Abre la app en Google Chrome y vuelve a preparar la imagen.'))
      else resolve(blob)
    }, 'image/webp', quality)
  })
}

export interface Crop {
  x: number
  y: number
  zoom: number
}

export const defaultCrop: Crop = { x: 0, y: 0, zoom: 1 }

export function cropBounds(width: number, height: number, crop: Crop) {
  const side = Math.min(width, height) / crop.zoom
  return { side, left: (width - side) * (crop.x + 1) / 2, top: (height - side) * (crop.y + 1) / 2 }
}

export async function prepareMedia(file: File, purpose: MediaPurpose, signal: AbortSignal, crop = defaultCrop): Promise<PreparedMedia> {
  if (!file.size || (file.type && !file.type.startsWith('image/'))) throw new Error('Selecciona una imagen válida.')
  if (!globalThis.crypto?.subtle) throw new Error('Abre la app desde HTTPS o localhost para calcular SHA-256.')
  signal.throwIfAborted()
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('No se pudo leer la imagen.') })
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('El navegador no puede preparar la imagen.')
    const isBadge = purpose === 'BADGE'
    const maxBytes = isBadge ? 122_880 : 307_200
    const originalLongSide = Math.max(bitmap.width, bitmap.height)
    let longSide = isBadge ? 512 : Math.max(800, Math.min(1600, originalLongSide))
    for (;;) {
      signal.throwIfAborted()
      const scale = longSide / originalLongSide
      canvas.width = isBadge ? 512 : Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = isBadge ? 512 : Math.max(1, Math.round(bitmap.height * scale))
      if (isBadge) {
        const { left, top, side } = cropBounds(bitmap.width, bitmap.height, crop)
        context.drawImage(bitmap, left, top, side, side, 0, 0, 512, 512)
      } else {
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      }
      // Canvas crea un WebP nuevo y descarta EXIF/XMP del original.
      for (const quality of [0.92, 0.82, 0.72, 0.62, 0.52, 0.42, 0.32, 0.22, 0.12]) {
        const blob = await encodeWebP(canvas, quality)
        signal.throwIfAborted()
        if (!blob.size || blob.size > maxBytes) continue
        const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
        signal.throwIfAborted()
        const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
        return { blob, width: canvas.width, height: canvas.height, sha256 }
      }
      if (isBadge || longSide <= 800) throw new Error('La imagen supera el límite de peso incluso después de comprimirla.')
      longSide = Math.max(800, Math.floor(longSide * 0.8))
    }
  } finally {
    bitmap.close()
  }
}

export interface UploadedMedia {
  ticketId: string
  url: string
}

export async function sendMedia(
  image: PreparedMedia,
  purpose: MediaPurpose,
  onProgress: (progress: UploadProgress) => void,
  signal: AbortSignal,
): Promise<UploadedMedia> {
  const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!projectUrl || !publicKey) throw new Error('Faltan las variables públicas de Supabase en .env.local.')
  const { storage } = await apiRequest<IntegrationStatus>('/integrations/status', { signal })
  if (!storage.verifiedAt || storage.provider !== 'SUPABASE') {
    throw new Error('Verifica Supabase en Lumon antes de subir imágenes.')
  }
  if (storage.config?.projectUrl?.replace(/\/+$/, '') !== projectUrl || storage.config.bucket !== 'lumon-media') {
    throw new Error('La URL o el bucket de Supabase difieren de la configuración verificada por Lumon.')
  }
  const ticket = await apiRequest<MediaTicket>('/media/tickets', {
    method: 'POST',
    body: JSON.stringify({
      purpose, contentType: 'image/webp', bytes: image.blob.size,
      sha256: image.sha256, width: image.width, height: image.height,
    }),
    signal,
  })
  if (ticket.provider !== 'SUPABASE' || ticket.bucket !== 'lumon-media' || !ticket.objectPath) {
    throw new Error('Lumon no devolvió un destino de Supabase válido.')
  }
  const url = await uploadToSupabase(
    { projectUrl, publicKey, bucket: ticket.bucket, objectPath: ticket.objectPath }, image.blob, onProgress, signal,
  )
  return { ticketId: ticket.ticketId, url }
}

export function confirmMedia(upload: UploadedMedia, signal: AbortSignal) {
  return apiRequest<Media>('/media/tickets/' + encodeURIComponent(upload.ticketId) + '/confirm', {
    method: 'POST',
    body: JSON.stringify({ url: upload.url }),
    signal,
  })
}
