import { useSyncExternalStore } from 'react'
import type { NewsItem } from './news'

/**
 * Publications cochées pour le générateur de rapports. La sélection est gardée dans l'onglet
 * (sessionStorage) : elle survit au changement de page et au rechargement, pas à la fermeture.
 */

export type Picked = { id: string; title: string; origin: string; date: string }

export const MAX_PICK = 300 // même limite que le serveur (server/reports.js)
const KEY = 'mms-report-selection'

function load(): Picked[] {
  try {
    const list = JSON.parse(sessionStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string').slice(0, MAX_PICK) : []
  } catch {
    return []
  }
}

let picked: Picked[] = load()
let ids = new Set(picked.map((p) => p.id))
const subs = new Set<() => void>()

function commit(next: Picked[]) {
  picked = next.slice(0, MAX_PICK)
  ids = new Set(picked.map((p) => p.id))
  try {
    sessionStorage.setItem(KEY, JSON.stringify(picked))
  } catch {
    /* stockage indisponible : la sélection reste en mémoire */
  }
  subs.forEach((fn) => fn())
}

const toPicked = (it: NewsItem): Picked => ({ id: it.id, title: it.title.slice(0, 200), origin: it.origin, date: it.date })

export const selection = {
  has: (id: string) => ids.has(id),
  list: () => picked,
  toggle(it: NewsItem) {
    if (ids.has(it.id)) commit(picked.filter((p) => p.id !== it.id))
    else if (picked.length < MAX_PICK) commit([...picked, toPicked(it)])
  },
  add(items: NewsItem[]) {
    const fresh = items.filter((it) => !ids.has(it.id)).map(toPicked)
    if (fresh.length) commit([...picked, ...fresh])
  },
  remove(list: { id: string }[]) {
    const drop = new Set(list.map((p) => p.id))
    commit(picked.filter((p) => !drop.has(p.id)))
  },
  clear: () => commit([]),
}

const subscribe = (fn: () => void) => {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

/** Liste cochée, mise à jour dans tous les composants qui l'utilisent */
export const useSelection = () => useSyncExternalStore(subscribe, () => picked)
