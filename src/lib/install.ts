/** Installation de l'application (PWA) : l'évènement beforeinstallprompt est capté dès le chargement, avant React */

export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

let deferred: InstallEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
}

export function subscribeInstall(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function installPrompt() {
  return deferred
}

/** Déjà ouverte comme application installée (Android, ordinateur, ou écran d'accueil iOS) */
export function isInstalled() {
  if (installed) return true
  try {
    if (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches) return true
  } catch {
    /* navigateur ancien */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iPhone / iPad : pas de beforeinstallprompt, installation par le bouton Partager */
export function isIOS() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Lance l'invite native ; renvoie false si aucune invite n'est disponible */
export async function runInstall(): Promise<boolean> {
  const evt = deferred
  if (!evt) return false
  await evt.prompt()
  const choice = await evt.userChoice.catch(() => ({ outcome: 'dismissed' }))
  deferred = null
  if (choice.outcome === 'accepted') installed = true
  notify()
  return true
}
