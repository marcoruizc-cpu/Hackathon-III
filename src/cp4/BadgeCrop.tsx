import { useEffect, useRef, useState } from 'react'
import { cropBounds, type Crop } from './media'

const clamp = (value: number) => Math.min(1, Math.max(-1, value))

export default function BadgeCrop({ file, crop, onCrop, disabled }: {
  file: File
  crop: Crop
  onCrop: (crop: Crop) => void
  disabled: boolean
}) {
  const drag = useRef<{ id: number; x: number; y: number; crop: Crop } | null>(null)
  const [source, setSource] = useState('')
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const bounds = size && cropBounds(size.width, size.height, crop)
  return <div className="space-y-3">
    <p id="cp4-crop-help" className="text-sm text-slate-300">Arrastra para encuadrar. Usa las flechas sobre el recorte o los controles inferiores.</p>
    <div className="relative aspect-square w-full max-w-64 touch-none overflow-hidden rounded border border-slate-500 bg-slate-950 focus-visible:ring-2 focus-visible:ring-cyan-300"
      role="group" tabIndex={disabled ? -1 : 0} aria-label="Recorte del fotocheck" aria-describedby="cp4-crop-help"
      onKeyDown={event => {
        if (disabled) return
        const offsets: Record<string, [number, number]> = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, -0.05], ArrowDown: [0, 0.05] }
        const offset = offsets[event.key]
        if (!offset) return
        event.preventDefault()
        onCrop({ ...crop, x: clamp(crop.x + offset[0]), y: clamp(crop.y + offset[1]) })
      }}
      onPointerDown={event => {
        if (disabled || !size || event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, crop }
      }}
      onPointerMove={event => {
        const start = drag.current
        if (disabled || start?.id !== event.pointerId || !size || !bounds) return
        const factor = 2 * bounds.side / event.currentTarget.clientWidth
        const horizontal = size.width - bounds.side
        const vertical = size.height - bounds.side
        onCrop({
          ...crop,
          x: horizontal > 0 ? clamp(start.crop.x - (event.clientX - start.x) * factor / horizontal) : 0,
          y: vertical > 0 ? clamp(start.crop.y - (event.clientY - start.y) * factor / vertical) : 0,
        })
      }}
      onLostPointerCapture={() => { drag.current = null }}>
      {source && <img src={source} alt="" draggable={false}
        onLoad={event => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        onError={() => setError(true)}
        className="pointer-events-none absolute max-w-none"
        style={size && bounds ? {
          width: 100 * size.width / bounds.side + '%',
          height: 100 * size.height / bounds.side + '%',
          left: -100 * bounds.left / bounds.side + '%',
          top: -100 * bounds.top / bounds.side + '%',
        } : { visibility: 'hidden' }} />}
    </div>
    {error && <p role="alert" className="text-amber-300">No se pudo leer la imagen para el recorte.</p>}
    <div className="grid gap-2 sm:grid-cols-3">
      <label>Zoom <input className="block w-full" type="range" min={1} max={4} step={0.05} value={crop.zoom}
        disabled={disabled || !size} onChange={e => onCrop({ ...crop, zoom: e.currentTarget.valueAsNumber })} /></label>
      <label>Horizontal <input className="block w-full" type="range" min={-1} max={1} step={0.02} value={crop.x}
        disabled={disabled || !size || size.width === bounds?.side} onChange={e => onCrop({ ...crop, x: e.currentTarget.valueAsNumber })} /></label>
      <label>Vertical <input className="block w-full" type="range" min={-1} max={1} step={0.02} value={crop.y}
        disabled={disabled || !size || size.height === bounds?.side} onChange={e => onCrop({ ...crop, y: e.currentTarget.valueAsNumber })} /></label>
    </div>
  </div>
}
