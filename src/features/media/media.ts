import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../../lib/config'
import { api } from '../../lib/http'

// Contratos de Swagger — tag Media.
export type MediaPurpose = 'BADGE' | 'INCIDENT'

export interface MediaTicket {
  ticketId: string
  expiresAt: string
  provider: 'SUPABASE' | 'CLOUDINARY'
  objectPath?: string
  bucket?: string
  uploadPublicId?: string
  expectedPublicId?: string
  constraints: Record<string, unknown>
}

export interface Media {
  mediaId: number
  url: string
  width: number
  height: number
  purpose: MediaPurpose
}

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  bytes: number
  sha256: string
  previewUrl: string
}

const LIMITS: Record<MediaPurpose, { maxBytes: number }> = {
  BADGE: { maxBytes: 122_880 }, // exactamente 512×512
  INCIDENT: { maxBytes: 307_200 }, // lado mayor 800–1600
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('El navegador no pudo generar WebP.'))), 'image/webp', quality),
  )
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Prepara la imagen en el navegador:
 * - BADGE: recorte cuadrado centrado → 512×512.
 * - INCIDENT: escala para que el lado mayor quede entre 800 y 1600.
 * - Re-codifica con canvas a WebP: el canvas NO copia metadatos (EXIF/XMP), que el backend rechaza.
 * - Baja la calidad (y en INCIDENT el tamaño) hasta entrar en el peso máximo.
 * - Calcula bytes y SHA-256 del archivo EXACTO que se va a subir.
 */
export async function prepareImage(file: File, purpose: MediaPurpose): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file)
  const { maxBytes } = LIMITS[purpose]
  let longSide = purpose === 'BADGE' ? 512 : Math.min(1600, Math.max(800, Math.max(bitmap.width, bitmap.height)))

  for (;;) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible.')
    if (purpose === 'BADGE') {
      const side = Math.min(bitmap.width, bitmap.height)
      canvas.width = 512
      canvas.height = 512
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 512, 512)
    } else {
      const scale = longSide / Math.max(bitmap.width, bitmap.height)
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    }
    for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
      const blob = await canvasToWebp(canvas, quality)
      if (blob.type !== 'image/webp') throw new Error('Este navegador no exporta WebP (usa Chrome/Edge/Firefox).')
      if (blob.size <= maxBytes) {
        return {
          blob,
          width: canvas.width,
          height: canvas.height,
          bytes: blob.size,
          sha256: await sha256Hex(blob),
          previewUrl: URL.createObjectURL(blob),
        }
      }
    }
    if (purpose === 'BADGE' || longSide <= 800) throw new Error('No se pudo comprimir la imagen bajo el límite.')
    longSide = Math.max(800, Math.round(longSide * 0.8))
  }
}

export const requestTicket = (purpose: MediaPurpose, img: PreparedImage) =>
  api<MediaTicket>('/media/tickets', {
    method: 'POST',
    body: { purpose, contentType: 'image/webp', bytes: img.bytes, sha256: img.sha256, width: img.width, height: img.height },
  })

/** Sube a Supabase Storage con la clave publicable (RLS solo permite insertar en <TEAM_CODE>/…). */
export async function uploadToSupabase(ticket: MediaTicket, img: PreparedImage): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error('Falta VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY en .env')
  if (!ticket.objectPath) throw new Error('El ticket no trae objectPath (¿storage no es Supabase?).')
  const bucket = ticket.bucket ?? 'lumon-media'
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'image/webp',
    'x-upsert': 'false',
  }
  // Las claves anon antiguas son JWT y van también como Bearer; las sb_publishable_ solo en apikey.
  if (SUPABASE_PUBLISHABLE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${ticket.objectPath}`, {
    method: 'POST',
    headers,
    body: img.blob,
  })
  if (!res.ok) throw new Error(`Supabase rechazó la subida (${res.status}): ${await res.text().catch(() => '')}`)
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${ticket.objectPath}`
}

/** Idempotente: 201 la primera vez, 200 con el mismo mediaId después. Se puede reintentar. */
export const confirmMedia = (ticketId: string, url: string) =>
  api<Media>(`/media/tickets/${encodeURIComponent(ticketId)}/confirm`, { method: 'POST', body: { url }, retries: 3 })

/** Flujo completo: preparar → ticket → subir → confirmar. */
export async function uploadImage(file: File, purpose: MediaPurpose, onStep?: (step: string) => void): Promise<Media> {
  onStep?.('Preparando imagen…')
  const img = await prepareImage(file, purpose)
  onStep?.('Pidiendo ticket…')
  const ticket = await requestTicket(purpose, img)
  onStep?.('Subiendo al storage…')
  const url = await uploadToSupabase(ticket, img)
  onStep?.('Confirmando…')
  return confirmMedia(ticket.ticketId, url)
}
