import { useEffect, useSyncExternalStore } from 'react'
import { type NewsItem } from './news'
import { hasModule, useAuth } from './auth'

/** Préférences propres à chaque poste (favoris, menu replié) gardées dans le navigateur ; alertes : sur le serveur */

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

/*
 * Mots-clés d'alerte personnels (audit v6, constat 1a) : gardés sur le serveur pour le compte connecté
 * (/api/alert-words), plus dans le navigateur. Au premier chargement, les mots de l'ancien stockage du navigateur
 * (« mms.alerts ») sont envoyés une seule fois au serveur (migrate), qui ne les accepte que si le compte n'a encore
 * rien ; l'ancienne clé est alors renommée (« mms.alerts.migrated », copie de secours) et n'est plus lue.
 */
const OLD_ALERTS_KEY = 'mms.alerts'
type AlertState = { email: string; words: string[]; loaded: boolean }
let alertState: AlertState = { email: '', words: NO_ALERTS, loaded: false }
const alertListeners = new Set<() => void>()
const setAlertState = (s: AlertState) => {
  alertState = s
  alertListeners.forEach((l) => l())
}

function oldBrowserWords(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(OLD_ALERTS_KEY) || '[]')
    return Array.isArray(v) ? v.filter((w): w is string => typeof w === 'string' && w.trim() !== '') : []
  } catch {
    return []
  }
}
function retireOldBrowserWords() {
  try {
    const raw = localStorage.getItem(OLD_ALERTS_KEY)
    if (raw !== null) {
      localStorage.setItem(`${OLD_ALERTS_KEY}.migrated`, raw)
      localStorage.removeItem(OLD_ALERTS_KEY)
    }
  } catch {
    /* stockage indisponible : rien à migrer */
  }
}

async function putWords(words: string[], migrate = false) {
  const res = await fetch('/api/alert-words', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ words, migrate }) })
  if (!res.ok) throw new Error('SAVE_FAILED')
  return (await res.json()) as { words: string[] }
}

let loading = ''
async function loadAlertWords(email: string) {
  if (loading === email) return
  loading = email
  try {
    const res = await fetch('/api/alert-words')
    // Module « التنبيهات » fermé pour ce profil (403) ou session expirée : liste vide, rien n'est migré
    if (!res.ok) return setAlertState({ email, words: NO_ALERTS, loaded: true })
    const d = (await res.json()) as { words: string[]; known: boolean }
    let words = d.words
    const old = oldBrowserWords()
    if (!d.known && old.length) words = (await putWords(old, true)).words
    if (d.known || old.length) retireOldBrowserWords()
    if (alertState.email === email) setAlertState({ email, words, loaded: true })
  } catch {
    if (alertState.email === email) setAlertState({ email, words: alertState.words, loaded: true })
  } finally {
    loading = ''
  }
}

export function useAlerts(): [string[], (v: string[]) => void] {
  const user = useAuth()?.user
  // Sans le module « التنبيهات », aucun appel (il serait refusé et journalisé)
  const email = user && hasModule(user, 'alerts') ? user.email.toLowerCase() : ''
  const state = useSyncExternalStore(
    (l) => {
      alertListeners.add(l)
      return () => alertListeners.delete(l)
    },
    () => alertState,
  )
  useEffect(() => {
    if (!email) return
    if (alertState.email !== email) setAlertState({ email, words: NO_ALERTS, loaded: false })
    if (!alertState.loaded) void loadAlertWords(email)
  }, [email])
  const words = state.email === email ? state.words : NO_ALERTS
  const set = (next: string[]) => {
    if (!email) return
    const before = alertState.words
    setAlertState({ email, words: next, loaded: true })
    // Échec d'enregistrement : la liste revient à l'état du serveur
    putWords(next)
      .then((d) => alertState.email === email && setAlertState({ email, words: d.words, loaded: true }))
      .catch(() => alertState.email === email && setAlertState({ email, words: before, loaded: true }))
  }
  return [words, set]
}
export const useCollapsed = () => usePref('mms.sideCollapsed', false)
export const useLastSeen = () => usePref<string | null>('mms.lastSeen', null)
