import { useSyncExternalStore } from 'react'
import { type NewsItem } from './news'

/** Préférences propres à chaque poste (favoris, alertes, menu replié) gardées dans le navigateur */

const listeners = new Set<() => void>()
const memory = new Map<string, unknown>()

function read<T>(key: string, fallback: T): T {
  if (memory.has(key)) return memory.get(key) as T
  let value = fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw) value = JSON.parse(raw) as T
  } catch {
    /* stockage indisponible : valeur par défaut */
  }
  memory.set(key, value)
  return value
}

function write<T>(key: string, value: T) {
  memory.set(key, value)
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* stockage indisponible : la valeur reste valable pour la session */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const value = useSyncExternalStore(subscribe, () => read(key, fallback))
  return [value, (v: T) => write(key, v)]
}

const NO_FAVORITES: NewsItem[] = []
const NO_ALERTS: string[] = []

export function useFavorites() {
  const [list, setList] = usePref('mms.favorites', NO_FAVORITES)
  return {
    list,
    has: (id: string) => list.some((it) => it.id === id),
    toggle: (item: NewsItem) => setList(list.some((it) => it.id === item.id) ? list.filter((it) => it.id !== item.id) : [item, ...list]),
    clear: () => setList([]),
  }
}

export const useAlerts = () => usePref('mms.alerts', NO_ALERTS)
export const useCollapsed = () => usePref('mms.sideCollapsed', false)
export const useLastSeen = () => usePref<string | null>('mms.lastSeen', null)
