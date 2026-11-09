import type { Bin, Cell, Rules } from './dto'
import type { TileStore } from './tileStore'

export type GroupResult =
  | { kind: 'group'; cells: Cell[]; bin: Bin; digitSum: number; maxDigit: number }
  | { kind: 'needTiles'; tiles: [number, number][] }
  | { kind: 'notScary' }
  | { kind: 'refined' }
  | { kind: 'noise'; size: number }

const N4: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]
const N8: [number, number][] = [...N4, [-1, -1], [-1, 1], [1, -1], [1, 1]]

/**
 * Grupo = conjunto MÁXIMO de celdas conectadas (4 u 8 vecinos) con tremor >= umbral.
 * BFS desde la celda clicada. Un grupo puede cruzar bloques: si toca uno no cargado,
 * devuelve `needTiles` y quien llama los pide y vuelve a intentar.
 * Tamaño fuera de [min, max] → ruido. Caja = order[índice] según la estrategia.
 */
export function findGroup(store: TileStore, rules: Rules, r: number, c: number): GroupResult {
  const start = store.cell(r, c)
  if (!start) return { kind: 'needTiles', tiles: [store.tileOf(r, c)] }
  if (start.tremor < rules.tremorThreshold) return { kind: 'notScary' }
  if (start.bin !== '.') return { kind: 'refined' }

  const dirs = rules.connectivity === 8 ? N8 : N4
  const seen = new Set<number>([r * store.cols + c])
  const queue: Cell[] = [{ r, c }]
  const cells: Cell[] = []
  const missing = new Map<string, [number, number]>()
  let digitSum = 0
  let maxDigit = 0

  while (queue.length > 0) {
    const cur = queue.shift() as Cell
    const data = store.cell(cur.r, cur.c)
    if (!data) continue
    cells.push(cur)
    digitSum += data.value
    maxDigit = Math.max(maxDigit, data.value)

    for (const [dr, dc] of dirs) {
      const nr = cur.r + dr
      const nc = cur.c + dc
      if (nr < 0 || nc < 0 || nr >= store.rows || nc >= store.cols) continue
      const id = nr * store.cols + nc
      if (seen.has(id)) continue
      const n = store.cell(nr, nc)
      if (!n) {
        const t = store.tileOf(nr, nc)
        missing.set(`${t[0]}:${t[1]}`, t)
        continue
      }
      if (n.tremor >= rules.tremorThreshold) {
        seen.add(id)
        queue.push({ r: nr, c: nc })
      }
    }
  }

  if (missing.size > 0) return { kind: 'needTiles', tiles: [...missing.values()] }
  if (cells.length < rules.minGroupSize || cells.length > rules.maxGroupSize) return { kind: 'noise', size: cells.length }

  const index = (rules.binning.strategy === 'DIGIT_SUM_MOD' ? digitSum : maxDigit) % 4
  const bin = rules.binning.order[index] as Bin
  return { kind: 'group', cells, bin, digitSum, maxDigit }
}

/** Resuelve el grupo cargando los bloques vecinos que falten (hasta 6 rondas). */
export async function resolveGroup(store: TileStore, rules: Rules, r: number, c: number): Promise<GroupResult> {
  for (let round = 0; round < 6; round++) {
    const result = findGroup(store, rules, r, c)
    if (result.kind !== 'needTiles') return result
    await Promise.all(result.tiles.map(([tr, tc]) => store.load(tr, tc)))
  }
  return findGroup(store, rules, r, c)
}
