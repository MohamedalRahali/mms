import { useCallback, useEffect, useState } from 'react'

/**
 * Thème de couleurs choisi par l'utilisateur (sélecteur de la barre du haut), indépendant du mode sombre ou clair.
 * Gardé dans le profil sur le serveur (il suit l'utilisateur d'un appareil à l'autre) et copié dans le navigateur
 * pour s'appliquer dès le chargement, avant la connexion. Couleurs : palettes.css.
 */

export type Palette = 'cnsd' | 'mms' | 'marine' | 'bordeaux'
export const DEFAULT_PALETTE: Palette = 'cnsd'

export const PALETTES: { key: Palette; ar: string; en: string; arHint: string; enHint: string; swatch: string[] }[] = [
  { key: 'cnsd', ar: 'هوية المركز', en: 'Centre identity', arHint: 'برتقالي وفضي وأبيض، ألوان الشعار', enHint: 'Orange, silver and white, from the logo', swatch: ['#f5892c', '#a6abb2', '#ffffff', '#2a2c30'] },
  { key: 'mms', ar: 'MMS Radar', en: 'MMS Radar', arHint: 'الأخضر الزمردي والذهبي، الهوية السابقة', enHint: 'Emerald and gold, the previous charter', swatch: ['#2fcb81', '#e5b841', '#e6f1e9', '#0f3a27'] },
  { key: 'marine', ar: 'أزرق مؤسسي', en: 'Institutional blue', arHint: 'أزرق داكن وذهبي', enHint: 'Navy blue and gold', swatch: ['#6fa3ea', '#e5b841', '#e6edf7', '#0f2547'] },
  { key: 'bordeaux', ar: 'عنابي', en: 'Burgundy', arHint: 'عنابي ورملي', enHint: 'Garnet and sand', swatch: ['#e46a88', '#e0bb6a', '#f0e9e3', '#4a0f22'] },
]

const KEY = 'mms-palette'
const isPalette = (v: unknown): v is Palette => PALETTES.some((p) => p.key === v)

export function readPalette(): Palette {
  try {
    const v = localStorage.getItem(KEY)
    return isPalette(v) ? v : DEFAULT_PALETTE
  } catch {
    return DEFAULT_PALETTE
  }
}

export function applyPalette(p: Palette) {
  document.documentElement.dataset.palette = p
  try {
    localStorage.setItem(KEY, p)
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
}

/** Thème courant ; relu dans le profil une fois connecté, enregistré dans le profil à chaque changement */
export function usePalette(): [Palette, (p: Palette) => void] {
  const [palette, setPalette] = useState<Palette>(readPalette)
  useEffect(() => {
    let alive = true
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const p = j?.prefs?.palette
        if (alive && isPalette(p)) {
          applyPalette(p)
          setPalette(p)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  const choose = useCallback((p: Palette) => {
    applyPalette(p)
    setPalette(p)
    fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefs: { palette: p } }) }).catch(() => {})
  }, [])
  return [palette, choose]
}

/** Couleur d'accent du thème courant (« r, g, b »), pour les dessins sur canvas */
export function accentRgb(): string {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--green)'
  document.body.appendChild(probe)
  const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(probe).color)
  probe.remove()
  return m ? `${m[1]}, ${m[2]}, ${m[3]}` : '47, 203, 129'
}

/** Thème et mode courants (« cnsd-dark »…), relus à chaque changement : à mettre dans les dépendances d'un dessin */
export function useLook(): string {
  const read = () => `${document.documentElement.dataset.palette}-${document.documentElement.dataset.theme}`
  const [look, setLook] = useState(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setLook(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-theme'] })
    return () => mo.disconnect()
  }, [])
  return look
}
