import { createContext, useContext } from 'react'

/** Utilisateur connecté et déconnexion, partagés par toute l'application */

export type Role = 'viewer' | 'analyst' | 'admin'
/** Modules (pages du menu) et actions (boutons) permis par le profil du compte, réglés dans la console Super Admin */
export type ModuleKey =
  | 'dashboard'
  | 'radar'
  | 'news'
  | 'media'
  | 'watch'
  | 'stats'
  | 'assistant'
  | 'ai'
  | 'sov'
  | 'compare'
  | 'briefing'
  | 'reports'
  | 'report'
  | 'alerts'
  | 'favorites'
  | 'geo'
export type ActionKey = 'export' | 'ai_ask' | 'ai_run' | 'edit_dashboards' | 'manage_watches' | 'tags' | 'send_email' | 'schedule' | 'diffusion' | 'mark_processed' | 'share_dashboards' | 'edit_items' | 'publish_public'
export type Perms = { profile: string; profileName: string; modules: ModuleKey[]; actions: ActionKey[] }
export type MfaInfo = { enabled: boolean; required: boolean; setup: boolean; recoveryLeft: number }
export type User = { email: string; name: string; role?: Role; perms?: Perms; mfa?: MfaInfo; avatar?: string }

const RANK: Record<Role, number> = { viewer: 0, analyst: 1, admin: 2 }
/** Le compte a-t-il au moins ce rôle ? Les comptes sans rôle sont administrateurs. */
export const can = (user: User | undefined | null, min: Role) => RANK[user?.role ?? 'admin'] >= RANK[min]

// Sans permissions reçues du serveur (ancienne version), mêmes droits qu'avant : par rôle
const ROLE_ACTIONS: Record<Role, ActionKey[]> = {
  admin: ['export', 'ai_ask', 'ai_run', 'edit_dashboards', 'manage_watches', 'tags', 'send_email', 'schedule', 'diffusion', 'mark_processed', 'share_dashboards', 'edit_items', 'publish_public'],
  analyst: ['export', 'ai_ask', 'ai_run', 'edit_dashboards', 'manage_watches', 'tags', 'send_email', 'mark_processed', 'share_dashboards', 'edit_items'],
  viewer: ['export', 'ai_ask', 'send_email'],
}
/** Le profil du compte ouvre-t-il ce module ? */
export const hasModule = (user: User | undefined | null, m: ModuleKey) => !user?.perms || user.perms.modules.includes(m)
/** Le profil du compte permet-il cette action (bouton) ? */
export const canDo = (user: User | undefined | null, a: ActionKey) => (user?.perms ? user.perms.actions.includes(a) : ROLE_ACTIONS[user?.role ?? 'admin'].includes(a))
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
