import { FILE_SIZES, FILE_SORTS, FILE_STATUSES } from './dto'
import type { FileQuery } from './api'

/** La API responde 400 ante un valor inválido: se sanea la URL ANTES de pedir. */
export function parseFileQuery(sp: URLSearchParams): FileQuery {
  const page = sp.get('page')
  const size = Number(sp.get('size'))
  const sort = sp.get('sort')
  const status = sp.get('status')
  return {
    page: page !== null && /^\d{1,6}$/.test(page) ? Number(page) : 0,
    size: FILE_SIZES.find((s) => s === size) ?? 10,
    sort: FILE_SORTS.find((s) => s === sort) ?? 'updatedAt,desc',
    status: FILE_STATUSES.find((s) => s === status) ?? '',
    q: (sp.get('q') ?? '').trim().slice(0, 60),
  }
}

/** URL canónica: omite defaults. */
export function toSearchParams(q: FileQuery): URLSearchParams {
  const sp = new URLSearchParams()
  if (q.page > 0) sp.set('page', String(q.page))
  if (q.size !== 10) sp.set('size', String(q.size))
  if (q.sort !== 'updatedAt,desc') sp.set('sort', q.sort)
  if (q.status) sp.set('status', q.status)
  if (q.q) sp.set('q', q.q)
  return sp
}
