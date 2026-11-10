import type { Cell, FileDetail, LoadedTile, RefinementRules, SelectedGroup } from './types'

export type GetTile = (tileRow: number, tileCol: number, signal?: AbortSignal) => Promise<LoadedTile>

export async function findGroup(
  start: Cell,
  file: FileDetail,
  rules: RefinementRules,
  getTile: GetTile,
  signal?: AbortSignal,
): Promise<SelectedGroup> {
  const readCell = async (r: number, c: number) => {
    const tr = Math.floor(r / file.tileSize)
    const tc = Math.floor(c / file.tileSize)
    const tile = await getTile(tr, tc, signal)
    const localRow = r - tile.originRow
    const localCol = c - tile.originCol
    if (localRow < 0 || localRow >= tile.rows || localCol < 0 || localCol >= tile.cols) {
      throw new Error('La API devolvió coordenadas incorrectas del bloque')
    }
    const index = localRow * tile.cols + localCol
    return { digit: Number(tile.values[index]), tremor: tile.tremors[index], bin: tile.bins[index] }
  }

  if (start.r < 0 || start.c < 0 || start.r >= file.rows || start.c >= file.cols) {
    throw new Error('La posición está fuera de la grilla')
  }
  const initial = await readCell(start.r, start.c)
  if (initial.bin !== '.') throw new Error('Esta celda ya fue refinada')
  if (initial.tremor < rules.tremorThreshold) throw new Error('Esta celda no da miedo')

  const directions = rules.connectivity === 8
    ? [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
    : [[-1, 0], [0, -1], [0, 1], [1, 0]]
  const pending: Cell[] = [start]
  const visited = new Set<number>([start.r * file.cols + start.c])
  const cells: Cell[] = []
  let digitSum = 0
  let maxDigit = 0

  for (let head = 0; head < pending.length; head++) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
    const cell = pending[head]
    const current = await readCell(cell.r, cell.c)
    if (current.bin !== '.' || current.tremor < rules.tremorThreshold) continue
    cells.push(cell)
    digitSum += current.digit
    maxDigit = Math.max(maxDigit, current.digit)

    if (cells.length > rules.maxGroupSize) {
      return { cells, bin: rules.binning.order[0], noise: true,
        reason: `El grupo supera ${rules.maxGroupSize} celdas y es ruido` }
    }

    for (const [dr, dc] of directions) {
      const r = cell.r + dr
      const c = cell.c + dc
      if (r < 0 || c < 0 || r >= file.rows || c >= file.cols) continue
      const id = r * file.cols + c
      if (visited.has(id)) continue
      visited.add(id)
      const neighbor = await readCell(r, c)
      if (neighbor.bin === '.' && neighbor.tremor >= rules.tremorThreshold) {
        pending.push({ r, c })
      }
    }
  }

  const index = (rules.binning.strategy === 'MAX_DIGIT_MOD' ? maxDigit : digitSum) % 4
  const noise = cells.length < rules.minGroupSize
  return {
    cells,
    bin: rules.binning.order[index],
    noise,
    reason: noise ? `El grupo tiene menos de ${rules.minGroupSize} celdas y es ruido` : null,
  }
}
