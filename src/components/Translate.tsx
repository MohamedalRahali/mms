import { useState } from 'react'
import { type NewsItem } from '../lib/news'
import { useI18n } from '../lib/i18n'

/**
 * Traduction d'un article (titre et résumé) dans la langue de l'interface, à la demande. Service public gratuit de
 * Google Translate appelé depuis le navigateur : seul le texte public de l'article part, jamais la recherche ni le
 * compte. Résultat gardé pour la session (sessionStorage).
 */

const cacheKey = (id: string, tl: string) => `mms-tr:${tl}:${id}`

async function translate(text: string, tl: string) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(text.slice(0, 1800))}`
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!res.ok) throw new Error(String(res.status))
  const json = await res.json()
  return (json?.[0] as [string][] | undefined)?.map((p) => p[0]).join('') ?? ''
}

export function TranslateButton({ item }: { item: NewsItem }) {
  const i = useI18n()
  const tl = i.lang === 'ar' ? 'ar' : 'en'
  const [out, setOut] = useState<{ title: string; summary: string } | null>(() => {
    try {
      const raw = sessionStorage.getItem(cacheKey(item.id, tl))
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [state, setState] = useState<'' | 'busy' | 'error'>('')
  const [shown, setShown] = useState(false)
  // Article déjà dans la langue de l'interface : rien à traduire
  if ((item.lang || 'ar') === tl) return null
  const label = i.lang === 'ar' ? 'ترجمة' : 'Translate'
  async function run() {
    if (out) return setShown(!shown)
    setState('busy')
    try {
      const [title, summary] = await Promise.all([translate(item.title, tl), item.summary ? translate(item.summary, tl) : Promise.resolve('')])
      const r = { title, summary }
      setOut(r)
      setShown(true)
      setState('')
      try {
        sessionStorage.setItem(cacheKey(item.id, tl), JSON.stringify(r))
      } catch {
        /* stockage indisponible */
      }
    } catch {
      setState('error')
    }
  }
  return (
    <div className="mms-itr">
      <button type="button" className="mms-brief-btn" onClick={run} disabled={state === 'busy'} title={i.lang === 'ar' ? 'ترجمة آلية (Google)' : 'Machine translation (Google)'}>
        🌐 {state === 'busy' ? '…' : state === 'error' ? (i.lang === 'ar' ? 'تعذّرت الترجمة' : 'Translation failed') : shown ? (i.lang === 'ar' ? 'إخفاء الترجمة' : 'Hide translation') : label}
      </button>
      {shown && out && (
        <div className="mms-brief" dir={tl === 'ar' ? 'rtl' : 'ltr'} lang={tl}>
          <b>{out.title}</b>
          {out.summary && <p>{out.summary}</p>}
          <small>{i.lang === 'ar' ? 'ترجمة آلية' : 'Machine translation'}</small>
        </div>
      )}
    </div>
  )
}
