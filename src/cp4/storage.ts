export interface SupabaseDestination {
  projectUrl: string
  publicKey: string
  bucket: string
  objectPath: string
}

export interface UploadProgress {
  loaded: number
  total: number | null
}

/** El ticket de Lumon determina la ruta. Supabase recibe únicamente su clave pública. */
export function uploadToSupabase(
  destination: SupabaseDestination,
  blob: Blob,
  onProgress: (progress: UploadProgress) => void,
  signal: AbortSignal,
): Promise<string> {
  const { projectUrl, publicKey, bucket, objectPath } = destination
  const project = new URL(projectUrl)
  const segments = objectPath.split('/')
  if (project.protocol !== 'https:' || project.username || project.password ||
      project.pathname !== '/' || project.search || project.hash ||
      !bucket || bucket === '.' || bucket === '..' || bucket.includes('/') ||
      segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('La configuración o la ruta del ticket de Supabase no es válida.')
  }
  if (!publicKey || publicKey.startsWith('sb_secret_')) {
    throw new Error('Configura la clave publicable de Supabase.')
  }
  if (publicKey.startsWith('eyJ')) {
    try {
      const payload = publicKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      if (JSON.parse(atob(payload)).role !== 'anon') throw new Error()
    } catch {
      throw new Error('La clave JWT de Supabase debe tener el rol anon.')
    }
  } else if (!publicKey.startsWith('sb_publishable_')) {
    throw new Error('Configura una clave sb_publishable_ o anon de Supabase.')
  }
  const path = [bucket, ...segments].map(encodeURIComponent).join('/')
  const root = project.origin + '/storage/v1/object'
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const request = new XMLHttpRequest()
    const abort = () => request.abort()
    request.upload.onprogress = event => onProgress({
      loaded: event.loaded,
      total: event.lengthComputable ? event.total : null,
    })
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve(root + '/public/' + path)
      else reject(new Error('Supabase rechazó la subida (HTTP ' + request.status + ').'))
    }
    request.onerror = () => reject(new Error('No se pudo conectar con Supabase.'))
    request.ontimeout = () => reject(new Error('La subida a Supabase tardó demasiado.'))
    request.onabort = () => reject(signal.reason ?? new DOMException('Subida cancelada', 'AbortError'))
    request.onloadend = () => signal.removeEventListener('abort', abort)
    request.open('POST', root + '/' + path)
    request.timeout = 60_000
    request.setRequestHeader('apikey', publicKey)
    if (publicKey.startsWith('eyJ')) request.setRequestHeader('Authorization', 'Bearer ' + publicKey)
    request.setRequestHeader('Content-Type', blob.type)
    request.setRequestHeader('x-upsert', 'false')
    signal.addEventListener('abort', abort, { once: true })
    try {
      request.send(blob)
    } catch (error) {
      signal.removeEventListener('abort', abort)
      reject(error)
    }
  })
}
