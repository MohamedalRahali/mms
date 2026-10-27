import { type FormEvent, useEffect, useState } from 'react'
import { type NewsItem, type Tone } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'
import { ToneBadge } from './Intel'
import './listing.css'

/** لوحات التثبيت : collections d'articles épinglés, communes à l'équipe (server/pinboards.js) */

type BoardSummary = { id: string; name: string; createdBy: string; createdAt: string; count: number; updatedAt: string }
type PinnedItem = { key: string; id: string; title: string; summary: string; url: string; origin: string; channel: string; date: string; tone: Tone | ''; addedBy: string; addedAt: string }

const TEXT = {
  ar: {
    title: 'لوحات التثبيت',
    intro: 'مجموعات أخبار مثبّتة مشتركة بين أعضاء الفريق.',
    pin: 'تثبيت في لوحة',
    pinned: 'تم التثبيت',
    newBoard: 'لوحة جديدة',
    name: 'اسم اللوحة',
    create: 'إنشاء',
    empty: 'لا توجد لوحات بعد.',
    emptyBoard: 'لا توجد أخبار مثبّتة في هذه اللوحة.',
    items: (n: number) => `${n} خبر`,
    by: 'أنشأها',
    remove: 'إزالة',
    del: 'حذف اللوحة',
    confirmDel: 'حذف هذه اللوحة وكل ما فيها؟',
    back: 'كل اللوحات',
    close: 'إغلاق',
  },
  en: {
    title: 'Pin boards',
    intro: 'Collections of pinned news shared by the team.',
    pin: 'Pin to a board',
    pinned: 'Pinned',
    newBoard: 'New board',
    name: 'Board name',
    create: 'Create',
    empty: 'No boards yet.',
    emptyBoard: 'Nothing pinned on this board yet.',
    items: (n: number) => `${n} items`,
    by: 'Created by',
    remove: 'Remove',
    del: 'Delete board',
    confirmDel: 'Delete this board and everything on it?',
    back: 'All boards',
    close: 'Close',
  },
}
const useText = () => TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']

async function listBoards(): Promise<BoardSummary[]> {
  try {
    const r = await fetch('/api/pinboards')
    return r.ok ? (await r.json()).boards : []
  } catch {
    return []
  }
}

/** Bouton 📌 d'une carte : choisir le tableau d'épingles où ranger l'article */
export function PinButton({ item }: { item: NewsItem }) {
  const t = useText()
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [done, setDone] = useState('')
  if (!canDo(auth?.user, 'tags')) return null
  async function toggle() {
    setOpen(!open)
    if (!open) setBoards(await listBoards())
  }
  async function pin(id: string, name: string) {
    const r = await fetch(`/api/pinboards/${id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) })
    if (r.ok) {
      setDone(name)
      setOpen(false)
    }
  }
  return (
    <span className="pin-btn">
      <button type="button" className={done ? 'news-card__fav is-on' : 'news-card__fav'} title={done ? `${t.pinned} · ${done}` : t.pin} aria-label={t.pin} aria-expanded={open} onClick={toggle}>
        📌
      </button>
      {open && (
        <span className="pin-menu" role="menu">
          {boards === null && <span className="pin-menu__empty">…</span>}
          {boards?.length === 0 && <span className="pin-menu__empty">{t.empty}</span>}
          {boards?.map((b) => (
            <button key={b.id} type="button" role="menuitem" onClick={() => pin(b.id, b.name)}>
              <span dir="auto">{b.name}</span> <small>{b.count}</small>
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

/** Fenêtre « لوحات التثبيت » : liste des tableaux, contenu d'un tableau, création et suppression */
export function PinboardsDialog({ onClose }: { onClose: () => void }) {
  const i = useI18n()
  const t = useText()
  const auth = useAuth()
  const can = canDo(auth?.user, 'tags')
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [open, setOpen] = useState<{ board: BoardSummary; items: PinnedItem[] } | null>(null)
  const [name, setName] = useState('')
  const reload = () => listBoards().then(setBoards)
  useEffect(() => {
    reload()
  }, [])
  async function create(e: FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/pinboards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (r.ok) {
      setName('')
      reload()
    }
  }
  async function show(id: string) {
    const r = await fetch(`/api/pinboards/${id}`)
    if (r.ok) {
      const { board } = await r.json()
      setOpen({ board, items: board.items })
    }
  }
  async function unpin(key: string) {
    if (!open) return
    const r = await fetch(`/api/pinboards/${open.board.id}/items`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })
    if (r.ok) setOpen({ ...open, items: open.items.filter((x) => x.key !== key) })
  }
  async function remove() {
    if (!open || !window.confirm(t.confirmDel)) return
    const r = await fetch(`/api/pinboards/${open.board.id}`, { method: 'DELETE' })
    if (r.ok) {
      setOpen(null)
      reload()
    }
  }
  return (
    <div className="mms-modal" role="dialog" aria-modal="true" aria-label={t.title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mms-modal__box pin-dialog">
        <h3>{open ? open.board.name : t.title}</h3>
        {!open && <p className="news-status">{t.intro}</p>}
        {!open && can && (
          <form className="mms-modal__actions" onSubmit={create}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.name} aria-label={t.name} maxLength={80} dir="auto" required />
            <button type="submit" className="news-btn">
              {t.create}
            </button>
          </form>
        )}
        {!open && boards?.length === 0 && <p className="news-status">{t.empty}</p>}
        {!open && (
          <ul className="pin-list">
            {boards?.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => show(b.id)}>
                  <b dir="auto">📌 {b.name}</b>
                  <small>
                    {t.items(b.count)} · {t.by} <span dir="ltr">{b.createdBy}</span>
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && (
          <>
            <div className="mms-modal__actions">
              <button type="button" className="news-btn news-btn--ghost" onClick={() => setOpen(null)}>
                {t.back}
              </button>
              {can && (
                <button type="button" className="news-btn news-btn--ghost" onClick={remove}>
                  {t.del}
                </button>
              )}
            </div>
            {!open.items.length && <p className="news-status">{t.emptyBoard}</p>}
            <ul className="pin-items">
              {open.items.map((x) => (
                <li key={x.key}>
                  <p className="pin-items__src">
                    <b dir="auto">{x.origin}</b> · {i.dateTime(x.date)} <ToneBadge tone={x.tone} />
                  </p>
                  <a href={x.url} target="_blank" rel="noopener noreferrer" dir="auto">
                    {x.title}
                  </a>
                  <small>
                    📌 <span dir="ltr">{x.addedBy}</span> · {i.dateTime(x.addedAt)}
                  </small>
                  {can && (
                    <button type="button" className="news-btn news-btn--ghost" onClick={() => unpin(x.key)}>
                      {t.remove}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mms-modal__actions">
          <button type="button" className="news-btn news-btn--ghost" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  )
}
