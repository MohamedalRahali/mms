/**
 * Ce que voient les comptes qui ne sont pas administrateurs (audit produit v4, constat 7) :
 * jamais le message brut d'un outil (yt-dlp, ffmpeg, Python…), ni ses liens (dépôt GitHub de yt-dlp…), ni de coût en
 * dollars. Ils reçoivent un code lisible (STREAM_DOWN, YOUTUBE_BLOCKED…) que l'interface traduit en phrase claire.
 * Les administrateurs (rôle admin ou action « diffusion ») gardent le détail pour le diagnostic.
 */

export const isAdminReq = (req) => req.user?.role === 'admin' || Boolean(req.perms?.actions?.includes('diffusion'))

const CODE = /^[A-Z][A-Z0-9_]{2,40}$/

/** Code d'erreur public tiré d'un message brut de la veille (« STREAM_DOWN|3|ERROR: … » → « STREAM_DOWN|3 ») */
export function publicError(raw) {
  const s = String(raw || '').trim()
  if (!s) return s
  const [code, ...rest] = s.split('|')
  if (/not a bot|sign in to confirm|cookies/i.test(s)) return 'YOUTUBE_BLOCKED'
  if (CODE.test(code)) return [code, ...(/^\d+$/.test(rest[0] || '') ? [rest[0]] : [])].join('|')
  if (/timed? ?out|timeout/i.test(s)) return 'TIMEOUT'
  if (/40[134]|forbidden|not found|unavailable|offline|no video formats|is not live/i.test(s)) return 'STREAM_DOWN'
  return 'TECHNICAL'
}

/** Copie d'une liste d'objets dont les champs d'erreur sont réduits à leur code */
export function redactErrors(list, fields = ['erreur', 'error', 'lastError', 'detail']) {
  return (list || []).map((o) => {
    if (!o || typeof o !== 'object') return o
    const out = { ...o }
    for (const f of fields) if (typeof out[f] === 'string' && out[f]) out[f] = publicError(out[f])
    return out
  })
}
