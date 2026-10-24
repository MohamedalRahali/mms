/**
 * Journal d'activité côté navigateur, lu par la console Super Admin :
 * article ouvert (lien externe), rapport imprimé, changement de langue.
 * Le reste (recherche, filtres, analyses IA, exports) est déduit des appels à l'API par le serveur.
 */

export function track(type: 'open' | 'print' | 'lang' | 'view', detail = '') {
  try {
    const body = JSON.stringify({ type, detail: detail.slice(0, 300) })
    if (!navigator.sendBeacon?.('/api/platform/activity', new Blob([body], { type: 'application/json' })))
      fetch('/api/platform/activity', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch {
    /* journal facultatif */
  }
}

export function installTracking() {
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.('a[href^="http"]') as HTMLAnchorElement | null
    if (!a || a.origin === location.origin) return
    const title = a.closest('article')?.querySelector('h2, h3, h4')?.textContent || a.textContent || ''
    track('open', `${title.trim().slice(0, 200)} — ${a.href}`)
  }
  const onPrint = () => track('print', document.querySelector('h1, h2')?.textContent?.trim() || document.title)
  document.addEventListener('click', onClick, true)
  window.addEventListener('beforeprint', onPrint)
  return () => {
    document.removeEventListener('click', onClick, true)
    window.removeEventListener('beforeprint', onPrint)
  }
}
