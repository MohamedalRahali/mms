import { type FormEvent, useContext, useEffect, useState } from 'react'
import { type NewsItem, type Tone, DrillContext } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'
import { ToneBadge } from './Intel'
import './listing.css'
import './pool.css'
import { ExportButtons } from './ExportButtons'

/** لوحات التثبيت : collections d'articles épinglés, communes à l'équipe (server/pinboards.js) */

export type BoardSummary = {
  id: string
  name: string
  description: string
  color: string
  group: string
  rule: { query: string; until: string; since: string } | null
  createdBy: string
  createdAt: string
  count: number
  updatedAt: string
  lastPinnedAt: string | null
}
type PinnedItem = { key: string; id: string; kind?: 'clip'; title: string; summary: string; url: string; origin: string; channel: string; date: string; tone: Tone | ''; addedBy: string; addedAt: string }

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
    description: 'الوصف',
    color: 'اللون في الرسوم',
    group: 'المجموعة',
    noGroup: 'بدون مجموعة',
    auto: 'تثبيت تلقائي للأخبار الجديدة المطابقة لاستعلام',
    query: 'الاستعلام (AND / OR / NOT)',
    queryHint: 'مثال: (النفط OR الشرارة) AND إنتاج',
    until: 'حتى تاريخ',
    autoHint: 'تُثبَّت الأخبار المنشورة بعد الحفظ والمطابقة للاستعلام كل 5 دقائق، حتى التاريخ المحدد.',
    autoBadge: 'تثبيت تلقائي',
    save: 'حفظ',
    cancel: 'إلغاء',
    edit: 'تعديل',
    search: 'ابحث في اللوحات',
    sort: 'الترتيب',
    sortRecent: 'آخر تثبيت',
    sortName: 'الاسم',
    sortCount: 'عدد الأخبار',
    last: 'آخر تثبيت',
    noMatch: 'لا توجد لوحة مطابقة.',
    inNews: 'عرض في لوحة الأخبار',
    csv: 'تنزيل CSV',
    bulk: 'تثبيت المحدد في لوحة',
    bulkDone: (n: number, b: string) => `أُضيف ${n} خبر إلى «${b}»`,
    errors: { NO_NAME: 'أدخل اسماً للوحة.', BAD_QUERY: 'الاستعلام غير صالح.', TOO_MANY: 'تم بلوغ الحد الأقصى لعدد اللوحات.', generic: 'تعذّرت العملية.' } as Record<string, string>,
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
    description: 'Description',
    color: 'Colour in charts',
    group: 'Group',
    noGroup: 'No group',
    auto: 'Automatically pin new news matching a query',
    query: 'Query (AND / OR / NOT)',
    queryHint: 'e.g. (oil OR Sharara) AND production',
    until: 'Until',
    autoHint: 'News published after saving that match the query are pinned every 5 minutes, until the chosen date.',
    autoBadge: 'auto-pinning',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    search: 'Search boards',
    sort: 'Order',
    sortRecent: 'Last pinned',
    sortName: 'Name',
    sortCount: 'Number of news',
    last: 'last pinned',
    noMatch: 'No matching board.',
    inNews: 'Show in NewsBoard',
    csv: 'Download CSV',
    bulk: 'Pin selection to a board',
    bulkDone: (n: number, b: string) => `${n} news added to “${b}”`,
    errors: { NO_NAME: 'Enter a board name.', BAD_QUERY: 'Invalid query.', TOO_MANY: 'Maximum number of boards reached.', generic: 'The operation failed.' } as Record<string, string>,
  },
}
const useText = () => TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']

export async function listBoards(): Promise<BoardSummary[]> {
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

/** Formulaire d'un tableau : nom, description, couleur, groupe, épinglage automatique (requête + date limite) */
function BoardForm({ initial, groups, onDone }: { initial?: BoardSummary; groups: string[]; onDone: (saved: boolean) => void }) {
  const t = useText()
  const [f, setF] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    color: initial?.color || '#2fcb81',
    group: initial?.group ?? '',
    auto: Boolean(initial?.rule?.query),
    query: initial?.rule?.query ?? '',
    until: initial?.rule?.until ?? '',
  })
  const [err, setErr] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    setErr('')
    const body = { name: f.name, description: f.description, color: f.color, group: f.group, rule: f.auto ? { query: f.query, until: f.until } : { query: '' } }
    const r = await fetch(initial ? `/api/pinboards/${initial.id}` : '/api/pinboards', { method: initial ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) return setErr(t.errors[(await r.json().catch(() => ({}))).error] ?? t.errors.generic)
    onDone(true)
  }
  return (
    <form className="pin-form" onSubmit={save}>
      <label>
        <span>{t.name}</span>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} dir="auto" required />
      </label>
      <label>
        <span>{t.description}</span>
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={400} rows={2} dir="auto" />
      </label>
      <div className="pin-form__row">
        <label>
          <span>{t.color}</span>
          <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} />
        </label>
        <label>
          <span>{t.group}</span>
          <input value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} list="pin-groups" maxLength={60} dir="auto" placeholder={t.noGroup} />
          <datalist id="pin-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="pin-form__check">
        <input type="checkbox" checked={f.auto} onChange={(e) => setF({ ...f, auto: e.target.checked })} />
        <span>{t.auto}</span>
      </label>
      {f.auto && (
        <div className="pin-form__row">
          <label>
            <span>{t.query}</span>
            <input value={f.query} onChange={(e) => setF({ ...f, query: e.target.value })} maxLength={500} dir="auto" placeholder={t.queryHint} required />
          </label>
          <label>
            <span>{t.until}</span>
            <input type="date" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} />
          </label>
        </div>
      )}
      {f.auto && <p className="news-status">{t.autoHint}</p>}
      <div className="mms-modal__actions">
        <button type="submit" className="news-btn">
          {t.save}
        </button>
        <button type="button" className="news-btn news-btn--ghost" onClick={() => onDone(false)}>
          {t.cancel}
        </button>
      </div>
      {err && <p className="news-status news-status--error">{err}</p>}
    </form>
  )
}

/** Fenêtre « لوحات التثبيت » : tableaux (recherche, tri, groupes), contenu d'un tableau, réglages, export */
export function PinboardsDialog({ onClose }: { onClose: () => void }) {
  const i = useI18n()
  const t = useText()
  const auth = useAuth()
  const can = canDo(auth?.user, 'tags')
  const canExport = canDo(auth?.user, 'export')
  const drill = useContext(DrillContext)
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [open, setOpen] = useState<{ board: BoardSummary; items: PinnedItem[] } | null>(null)
  const [form, setForm] = useState<{ board?: BoardSummary } | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'name' | 'count' | 'recent'>('recent')
  const reload = () => listBoards().then(setBoards)
  useEffect(() => {
    reload()
  }, [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
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
  const groups = [...new Set((boards ?? []).map((b) => b.group).filter(Boolean))].sort()
  const needle = q.trim().toLowerCase()
  const shown = (boards ?? [])
    .filter((b) => !needle || `${b.name} ${b.description} ${b.group}`.toLowerCase().includes(needle))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'count' ? b.count - a.count : (b.lastPinnedAt ?? b.createdAt).localeCompare(a.lastPinnedAt ?? a.createdAt)))
  const byGroup = new Map<string, BoardSummary[]>()
  for (const b of shown) byGroup.set(b.group || '', [...(byGroup.get(b.group || '') ?? []), b])
  const openInNews = (id: string) => {
    drill({ pinboard: id })
    onClose()
  }
  return (
    <div className="mms-modal" role="dialog" aria-modal="true" aria-label={t.title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mms-modal__box pin-dialog">
        <h3>{form ? (form.board ? `${t.edit} — ${form.board.name}` : t.newBoard) : open ? open.board.name : t.title}</h3>
        {form && (
          <BoardForm
            initial={form.board}
            groups={groups}
            onDone={(saved) => {
              setForm(null)
              if (saved) {
                reload()
                if (open && form.board) show(open.board.id)
              }
            }}
          />
        )}
        {!form && !open && (
          <>
            <p className="news-status">{t.intro}</p>
            <div className="pin-tools">
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} dir="auto" />
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t.sort}>
                <option value="recent">{t.sortRecent}</option>
                <option value="name">{t.sortName}</option>
                <option value="count">{t.sortCount}</option>
              </select>
              {can && (
                <button type="button" className="news-btn" onClick={() => setForm({})}>
                  + {t.newBoard}
                </button>
              )}
            </div>
            {boards?.length === 0 && <p className="news-status">{t.empty}</p>}
            {[...byGroup.entries()]
              .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])))
              .map(([g, list]) => (
                <section key={g || '_'} className="pin-group">
                  {(groups.length > 0 || g) && <h4 dir="auto">{g || t.noGroup}</h4>}
                  <ul className="pin-list">
                    {list.map((b) => (
                      <li key={b.id}>
                        <button type="button" onClick={() => show(b.id)}>
                          <b dir="auto">
                            <i className="pin-dot" style={{ background: b.color || 'var(--green)' }} aria-hidden /> {b.name}
                            {b.rule?.query && <span className="pin-auto">{t.autoBadge}</span>}
                          </b>
                          {b.description && <span dir="auto">{b.description}</span>}
                          <small>
                            {t.items(b.count)}
                            {b.lastPinnedAt ? ` · ${t.last} ${i.dateTime(b.lastPinnedAt)}` : ''} · {t.by} <span dir="ltr">{b.createdBy}</span>
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            {boards && boards.length > 0 && shown.length === 0 && <p className="news-status">{t.noMatch}</p>}
          </>
        )}
        {!form && open && (
          <>
            <div className="mms-modal__actions pin-actions">
              <button type="button" className="news-btn news-btn--ghost" onClick={() => setOpen(null)}>
                {i.dir === 'rtl' ? '→' : '←'} {t.back}
              </button>
              <button type="button" className="news-btn" onClick={() => openInNews(open.board.id)}>
                {t.inNews}
              </button>
              {canExport && <ExportButtons query={`pinboard=${encodeURIComponent(open.board.id)}`} title={open.board.name} period={i.lang === 'ar' ? 'كل الفترة' : 'all time'} filters={[]} />}
              {can && (
                <button type="button" className="news-btn news-btn--ghost" onClick={() => setForm({ board: open.board })}>
                  {t.edit}
                </button>
              )}
              {can && (
                <button type="button" className="news-btn news-btn--ghost" onClick={remove}>
                  {t.del}
                </button>
              )}
            </div>
            {open.board.description && (
              <p className="news-status" dir="auto">
                {open.board.description}
              </p>
            )}
            {open.board.rule?.query && (
              <p className="news-status">
                {t.autoBadge} : <code dir="auto">{open.board.rule.query}</code>
                {open.board.rule.until ? ` · ${t.until} ${open.board.rule.until}` : ''}
              </p>
            )}
            {!open.items.length && <p className="news-status">{t.emptyBoard}</p>}
            <ul className="pin-items">
              {open.items.map((x) => (
                <li key={x.key}>
                  <p className="pin-items__src">
                    <b dir="auto">{x.origin}</b> · {i.dateTime(x.date)} <ToneBadge tone={x.tone} />
                  </p>
                  <a href={x.url} target="_blank" rel="noopener noreferrer" dir="auto">
                    {x.kind === 'clip' ? '🎬 ' : ''}
                    {x.title}
                  </a>
                  {x.kind === 'clip' && (
                    <p className="pin-items__clip" dir="auto">
                      {x.summary}
                    </p>
                  )}
                  <small>
                    📌 <span dir="ltr">{x.addedBy === 'auto' ? t.autoBadge : x.addedBy}</span> · {i.dateTime(x.addedAt)}
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

/** Barre de sélection : épingler d'un coup toutes les publications cochées dans un tableau */
export function PinSelection({ ids }: { ids: string[] }) {
  const t = useText()
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [msg, setMsg] = useState('')
  if (!canDo(auth?.user, 'tags') || !ids.length) return null
  async function toggle() {
    setOpen(!open)
    setMsg('')
    if (!open) setBoards(await listBoards())
  }
  async function pin(b: BoardSummary) {
    const r = await fetch(`/api/pinboards/${b.id}/items/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    const json = await r.json().catch(() => ({}))
    setOpen(false)
    setMsg(r.ok ? t.bulkDone(json.added ?? 0, b.name) : t.errors.generic)
  }
  return (
    <span className="pin-btn pin-bulk">
      <button type="button" className="rpt-tray__link" onClick={toggle} aria-expanded={open}>
        📌 {t.bulk}
      </button>
      {open && (
        <span className="pin-menu pin-menu--up" role="menu">
          {boards === null && <span className="pin-menu__empty">…</span>}
          {boards?.length === 0 && <span className="pin-menu__empty">{t.empty}</span>}
          {boards?.map((b) => (
            <button key={b.id} type="button" role="menuitem" onClick={() => pin(b)}>
              <span dir="auto">{b.name}</span> <small>{b.count}</small>
            </button>
          ))}
        </span>
      )}
      {msg && <small className="pin-bulk__msg">{msg}</small>}
    </span>
  )
}
