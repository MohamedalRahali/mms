import { useEffect, useState } from 'react'

/**
 * Effets de l'interface : relief 3D qui suit la souris et halo lumineux sur les panneaux,
 * thème clair ou sombre. Un seul écouteur pour toute la page ; rien si l'utilisateur refuse les animations.
 */

const TILT = '.fx-tilt, .mms-widget, .news-card, .mms-kpi, .news-tile, .mms-watch'
const MAX_DEG = 5

export function useFx() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(hover: hover)').matches) return
    let current: HTMLElement | null = null
    let raf = 0
    let last: PointerEvent | null = null

    function reset(el: HTMLElement) {
      el.style.removeProperty('--rx')
      el.style.removeProperty('--ry')
      el.classList.remove('is-lit')
    }
    function apply() {
      raf = 0
      const e = last
      if (!e) return
      const el = (e.target as Element | null)?.closest?.(TILT) as HTMLElement | null
      if (el !== current) {
        if (current) reset(current)
        current = el
      }
      // Pas de relief pendant l'édition du tableau de bord (glisser-déposer)
      if (!el || el.closest('.mms-grid.is-editing')) return
      const b = el.getBoundingClientRect()
      const px = (e.clientX - b.left) / b.width
      const py = (e.clientY - b.top) / b.height
      // Les grands panneaux bougent moins que les petites cartes
      const k = el.classList.contains('fx-soft') || b.width > 700 ? 0.35 : 1
      el.style.setProperty('--rx', `${((0.5 - py) * MAX_DEG * k).toFixed(2)}deg`)
      el.style.setProperty('--ry', `${((px - 0.5) * MAX_DEG * k).toFixed(2)}deg`)
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
      el.classList.add('is-lit')
    }
    const onMove = (e: PointerEvent) => {
      last = e
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onLeave = () => {
      if (current) reset(current)
      current = null
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [])
}

export type Theme = 'dark' | 'light'
const KEY = 'mms-theme'

function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(readTheme)
  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* stockage indisponible : le choix vaut pour la session */
    }
  }, [theme])
  return [theme, setTheme]
}
