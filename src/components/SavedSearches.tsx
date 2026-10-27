import { useState, type FormEvent } from 'react'
import { type Filters, EMPTY_FILTERS } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useAlerts } from '../lib/prefs'
import './saved.css'

/**
 * Recherches enregistrées (عمليات البحث المحفوظة) : une recherche et ses filtres, rappelés en un clic.
 * Gardées dans ce navigateur, propres à chaque compte (20 au plus).
 */

type Saved = { id: string; name: string; filters: Filters }
const MAX = 20
const keyOf = (email: string) => `mms-saved-searches:${email.toLowerCase()}`

function load(email: string): Saved[] {
  try {
    const list = JSON.parse(localStorage.getItem(keyOf(email)) || '[]')
    return Array.isArray(list) ? list.filter((s) => s && typeof s.name === 'string' && s.filters).slice(0, MAX) : []
  } catch {
    return []
  }
}
function store(email: string, list: Saved[]) {
  try {
    localStorage.setItem(keyOf(email), JSON.stringify(list))
  } catch {
    /* stockage indisponible (navigation privée) : la liste reste pour cette page */
  }
}

const TEXT = {
  ar: { alertOn: 'تنبيه مفعّل لهذا البحث (إيقاف)', alertOff: 'تنبيهي عند ظهور أخبار جديدة لهذا البحث', save: 'حفظ هذا البحث', name: 'اسم البحث', ok: 'حفظ', cancel: 'إلغاء', title: 'عمليات البحث المحفوظة', remove: 'حذف', full: 'الحد الأقصى 20 بحثًا محفوظًا', untitled: 'بحث بدون عنوان' },
  en: { alertOn: 'Alert on for this search (turn off)', alertOff: 'Alert me when new news match this search', save: 'Save this search', name: 'Search name', ok: 'Save', cancel: 'Cancel', title: 'Saved searches', remove: 'Remove', full: 'Up to 20 saved searches', untitled: 'Untitled search' },
}

// alerts : le module « التنبيهات » est ouvert ; chaque recherche avec des mots peut alors devenir une alerte
export function SavedSearches({ filters, email, onApply, alerts = false }: { filters: Filters; email: string; onApply: (f: Filters) => void; alerts?: boolean }) {
  const i = useI18n()
  const [words, setWords] = useAlerts()
  const x = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const [list, setList] = useState<Saved[]>(() => load(email))
  const [naming, setNaming] = useState<string | null>(null)
  const active = Object.values(filters).some(Boolean)
  const same = (f: Filters) => JSON.stringify({ ...EMPTY_FILTERS, ...f }) === JSON.stringify(filters)
  const current = list.find((s) => same(s.filters))

  function save(e: FormEvent) {
    e.preventDefault()
    const name = (naming ?? '').trim().slice(0, 60) || x.untitled
    const next = [{ id: Math.random().toString(36).slice(2, 10), name, filters }, ...list.filter((s) => !same(s.filters))].slice(0, MAX)
    setList(next)
    store(email, next)
    setNaming(null)
  }
  function remove(id: string) {
    const next = list.filter((s) => s.id !== id)
    setList(next)
    store(email, next)
  }

  if (!list.length && !active) return null
  return (
    <div className="mms-saved" aria-label={x.title}>
      {list.length > 0 && <span className="mms-saved__title">{x.title}</span>}
      {list.map((s) => (
        <span key={s.id} className={current?.id === s.id ? 'mms-saved__chip is-on' : 'mms-saved__chip'}>
          <button type="button" onClick={() => onApply({ ...EMPTY_FILTERS, ...s.filters })} dir="auto" title={s.filters.q || s.name}>
            ★ {s.name}
          </button>
          {alerts && s.filters.q && (
            <button
              type="button"
              className={words.includes(s.filters.q) ? 'mms-saved__bell is-on' : 'mms-saved__bell'}
              aria-pressed={words.includes(s.filters.q)}
              title={words.includes(s.filters.q) ? x.alertOn : x.alertOff}
              aria-label={words.includes(s.filters.q) ? x.alertOn : x.alertOff}
              onClick={() => setWords(words.includes(s.filters.q) ? words.filter((w) => w !== s.filters.q) : [...words, s.filters.q])}
            >
              {words.includes(s.filters.q) ? '🔔' : '🔕'}
            </button>
          )}
          <button type="button" className="mms-saved__x" aria-label={`${x.remove} ${s.name}`} title={x.remove} onClick={() => remove(s.id)}>
            ×
          </button>
        </span>
      ))}
      {active && !current && naming === null && (
        <button type="button" className="news-btn news-btn--ghost mms-saved__add" onClick={() => setNaming(filters.q || '')} disabled={list.length >= MAX} title={list.length >= MAX ? x.full : undefined}>
          ☆ {x.save}
        </button>
      )}
      {naming !== null && (
        <form className="mms-saved__form" onSubmit={save}>
          <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder={x.name} aria-label={x.name} maxLength={60} dir="auto" />
          <button type="submit" className="news-btn">
            {x.ok}
          </button>
          <button type="button" className="news-btn news-btn--ghost" onClick={() => setNaming(null)}>
            {x.cancel}
          </button>
        </form>
      )}
    </div>
  )
}
