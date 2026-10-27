import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { type NewsItem, type NewsResponse } from '../lib/news'
import { useI18n } from '../lib/i18n'
import './cmdk.css'

/**
 * Palette de commandes (Ctrl+K / ⌘K) : aller à n'importe quelle page permise, chercher dans les actualités,
 * changer de thème ou de langue, sans passer par le menu. Les pages proposées sont celles du profil du compte.
 */

export type PaletteEntry = { id: string; label: string; group: string; run: () => void; keywords?: string }

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟ̀-ͯ]/g, '') // diacritiques arabes et latins
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')

const TEXT = {
  ar: {
    placeholder: 'اكتب اسم صفحة أو كلمة للبحث في الأخبار…',
    searchNews: (q: string) => `البحث في الأخبار عن «${q}»`,
    news: 'أخبار مطابقة',
    none: 'لا نتائج. اضغط Enter للبحث في كل الأخبار.',
    hint: '↑↓ للتنقل · Enter للفتح · Esc للإغلاق',
    title: 'الانتقال السريع',
  },
  en: {
    placeholder: 'Type a page name or a word to search the news…',
    searchNews: (q: string) => `Search the news for “${q}”`,
    news: 'Matching news',
    none: 'No match. Press Enter to search all news.',
    hint: '↑↓ to move · Enter to open · Esc to close',
    title: 'Quick jump',
  },
}

export function CommandPalette({ entries, onClose, onSearch }: { entries: PaletteEntry[]; onClose: () => void; onSearch: ((q: string) => void) | null }) {
  const i = useI18n()
  const x = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [news, setNews] = useState<NewsItem[]>([])
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    input.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Actualités correspondantes (5 au plus), après une courte pause de frappe
  useEffect(() => {
    const term = q.trim()
    if (!onSearch || term.length < 2) return setNews([])
    const ctrl = new AbortController()
    const id = window.setTimeout(() => {
      fetch(`/api/news?size=5&q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<NewsResponse>) : null))
        .then((json) => json && setNews(json.items))
        .catch(() => {})
    }, 220)
    return () => {
      ctrl.abort()
      window.clearTimeout(id)
    }
  }, [q, onSearch])

  const rows = useMemo(() => {
    const term = norm(q.trim())
    const pages = term ? entries.filter((e) => norm(`${e.label} ${e.keywords ?? ''} ${e.group}`).includes(term)) : entries
    const out: PaletteEntry[] = [...pages]
    if (onSearch && q.trim()) {
      out.push({ id: '__search', label: x.searchNews(q.trim()), group: x.news, run: () => onSearch(q.trim()) })
      for (const n of news) out.push({ id: `n-${n.id}`, label: n.title, group: x.news, keywords: n.origin, run: () => onSearch(`"${n.title.slice(0, 80).replace(/"/g, '')}"`) })
    }
    return out
  }, [entries, q, news, onSearch, x])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  function pick(e: PaletteEntry | undefined) {
    if (!e) return
    onClose()
    e.run()
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows[sel]) pick(rows[sel])
      else if (onSearch && q.trim()) {
        onClose()
        onSearch(q.trim())
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  let lastGroup = ''
  return (
    <div className="mms-cmdk" role="presentation" onMouseDown={onClose}>
      <div className="mms-cmdk__box" role="dialog" aria-modal="true" aria-label={x.title} dir={i.dir} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mms-cmdk__field">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path fill="currentColor" d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />
          </svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={x.placeholder}
            aria-label={x.placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="mms-cmdk-list"
            aria-activedescendant={rows[sel] ? `cmdk-${rows[sel].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="mms-cmdk__list" id="mms-cmdk-list" role="listbox" ref={list}>
          {rows.map((r, k) => {
            const head = r.group !== lastGroup ? r.group : ''
            lastGroup = r.group
            return (
              <li key={r.id} role="presentation">
                {head && <p className="mms-cmdk__group">{head}</p>}
                <button
                  type="button"
                  id={`cmdk-${r.id}`}
                  role="option"
                  aria-selected={k === sel}
                  className={k === sel ? 'mms-cmdk__item is-sel' : 'mms-cmdk__item'}
                  onMouseMove={() => setSel(k)}
                  onClick={() => pick(r)}
                >
                  <span dir="auto">{r.label}</span>
                  {r.keywords && r.id.startsWith('n-') && <small dir="auto">{r.keywords}</small>}
                </button>
              </li>
            )
          })}
          {!rows.length && <li className="mms-cmdk__none">{x.none}</li>}
        </ul>
        <p className="mms-cmdk__hint">{x.hint}</p>
      </div>
    </div>
  )
}
