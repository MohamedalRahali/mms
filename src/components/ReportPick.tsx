import { useState } from 'react'
import type { NewsItem } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { MAX_PICK, selection, useSelection } from '../lib/reportSelection'
import { PinSelection } from './Pinboards'
import './reports.css'

/** Sélection des publications pour le générateur de rapports : case sur chaque carte, page entière, barre flottante */

const TEXT = {
  ar: {
    pick: 'إضافة إلى التقرير',
    unpick: 'إزالة من التقرير',
    page: 'تحديد منشورات الصفحة',
    unpage: 'إلغاء تحديد الصفحة',
    selected: (n: string) => `${n} منشور محدد`,
    generate: 'إنشاء تقرير',
    clear: 'إلغاء التحديد',
    show: 'عرض المحدد',
    hide: 'إخفاء',
    max: (n: number) => `الحد الأقصى ${n} منشور في التقرير`,
    remove: 'إزالة',
  },
  en: {
    pick: 'Add to report',
    unpick: 'Remove from report',
    page: 'Select this page',
    unpage: 'Unselect this page',
    selected: (n: string) => `${n} selected`,
    generate: 'Generate report',
    clear: 'Clear selection',
    show: 'Show selection',
    hide: 'Hide',
    max: (n: number) => `Up to ${n} posts per report`,
    remove: 'Remove',
  },
}
export const pickText = (lang: string) => TEXT[lang === 'en' ? 'en' : 'ar']

/** Case à cocher d'une carte d'actualité */
export function PickBox({ item }: { item: NewsItem }) {
  const i = useI18n()
  const t = pickText(i.lang)
  useSelection()
  const on = selection.has(item.id)
  return (
    <label className={on ? 'rpt-pick is-on' : 'rpt-pick'} title={on ? t.unpick : t.pick}>
      <input type="checkbox" checked={on} onChange={() => selection.toggle(item)} aria-label={on ? t.unpick : t.pick} />
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <path d="M5 12.5l4.2 4.2L19 7" />
      </svg>
    </label>
  )
}

/** Cocher ou décocher toutes les publications affichées sur la page */
export function PickPage({ items }: { items: NewsItem[] }) {
  const i = useI18n()
  const t = pickText(i.lang)
  useSelection()
  if (!items.length) return null
  const all = items.every((it) => selection.has(it.id))
  return (
    <button type="button" className="news-btn news-btn--ghost rpt-pickpage" aria-pressed={all} onClick={() => (all ? selection.remove(items) : selection.add(items))}>
      <span className={all ? 'rpt-pickpage__box is-on' : 'rpt-pickpage__box'} aria-hidden />
      {all ? t.unpage : t.page}
    </button>
  )
}

/** Barre flottante : nombre de publications cochées, liste, effacer, « إنشاء تقرير » */
export function ReportTray({ onGenerate, hidden }: { onGenerate: () => void; hidden?: boolean }) {
  const i = useI18n()
  const t = pickText(i.lang)
  const list = useSelection()
  const [open, setOpen] = useState(false)
  if (!list.length || hidden) return null
  return (
    <div className="rpt-tray" role="region" aria-label={t.selected(i.num(list.length))} dir={i.dir}>
      {open && (
        <ul className="rpt-tray__list">
          {list.map((p) => (
            <li key={p.id}>
              <span dir="auto">{p.title}</span>
              <small dir="auto">
                {p.origin} · {i.dateTime(p.date)}
              </small>
              <button type="button" onClick={() => selection.remove([p])} aria-label={`${t.remove}: ${p.title}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="rpt-tray__bar">
        <span className="rpt-tray__count">
          <b>{i.num(list.length)}</b> {t.selected('').trim()}
        </span>
        {list.length >= MAX_PICK && <small className="rpt-tray__max">{t.max(MAX_PICK)}</small>}
        <button type="button" className="rpt-tray__link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? t.hide : t.show}
        </button>
        <PinSelection ids={list.map((p) => p.id)} />
        <button type="button" className="rpt-tray__link" onClick={() => selection.clear()}>
          {t.clear}
        </button>
        <button type="button" className="news-btn rpt-tray__go" onClick={onGenerate}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path fill="currentColor" d="M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 12h8v1.6H8zm0 3.5h8v1.6H8z" />
          </svg>
          {t.generate}
        </button>
      </div>
    </div>
  )
}
