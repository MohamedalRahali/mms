import { createContext, useContext } from 'react'

/** Utilisateur connecté et déconnexion, partagés par toute l'application */

export type User = { email: string; name: string }
export type Auth = { user: User; logout: () => void }

export const AuthContext = createContext<Auth | null>(null)
export const useAuth = () => useContext(AuthContext)

/** Nombre de requêtes /api en cours, pour la barre de chargement en haut de page */
let pending = 0
const busySubs = new Set<(n: number) => void>()
function setPending(n: number) {
  pending = n
  busySubs.forEach((fn) => fn(n))
}
export function onBusy(fn: (n: number) => void) {
  busySubs.add(fn)
  fn(pending)
  return () => {
    busySubs.delete(fn)
  }
}

/** Une réponse 401 de l'API (session expirée) renvoie vers la page de connexion */
export function watchUnauthorized(onUnauthorized: () => void) {
  const original = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url
    const api = url.includes('/api/')
    if (api) setPending(pending + 1)
    let res: Response
    try {
      res = await original(input, init)
    } finally {
      if (api) setPending(Math.max(0, pending - 1))
    }
    if (res.status === 401 && url.includes('/api/') && !url.includes('/api/auth/')) onUnauthorized()
    return res
  }
  return () => {
    window.fetch = original
  }
}
