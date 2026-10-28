import { useContext, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { WidgetBody, useWidgetTitles } from './Charts'
import { type Facets, type Flux, FLUX_KEYS, ReloadContext, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { canDo, hasModule, useAuth } from '../lib/auth'
import { ShareDialog, useBrand } from './Share'
import { LoadState } from './LoadState'
import { SaveSearchButton } from './Listing'
import { EMPTY_FILTERS, type Filters } from '../lib/news'

const RADAR_TYPES: string[] = ['emerging', 'stories', 'alerts', 'mood']
import {
  type Board,
  type WidgetConf,
  type WidgetType,
  append,
  BUILDER_TEXT,
  COLS,
  compact,
  DEFAULT_BOARDS,
  DIMS,
  GAP_PX,
  makeWidget,
  METRICS,
  newId,
  PERIODS,
  ROW_PX,
  SPLITS,
  STEPS,
  STYLES,
  WIDGET_TYPES,
} from '../lib/dashboards'
import { type WatchOption } from '../lib/watches'

/**
 * Tableaux de bord que le client compose lui-même, comme le mode édition de NewsBoard :
 * grille, « ADD CHART », SAVE / CANCEL, widgets déplaçables et redimensionnables.
 */

const ICON = {
  edit: 'M3 17.2V21h3.8L17.8 10l-3.8-3.8L3 17.2zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8L20.7 7z',
  copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z',
  trash: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  dots: 'M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
}

/** Petite vignette de chaque type, pour le choix dans l'éditeur */
const TYPE_ICON: Record<WidgetType, string> = {
  news: 'M4 5h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z',
  bars: 'M3 5h14v3H3zm0 5.5h9v3H3zM3 16h18v3H3z',
  columns: 'M5 10h3v10H5zm5.5-6h3v16h-3zM16 13h3v7h-3z',
  pie: 'M11 2v20a10 10 0 0 1 0-20zm2 0v9h9a10 10 0 0 0-9-9zm0 11v9a10 10 0 0 0 9-9h-9z',
  line: 'M3 17l6-6 4 4 8-8 1.4 1.4L13 17.8l-4-4-4.6 4.6z',
  kpi: 'M4 4h16v16H4zm4 11h2V9H8v6zm3.5 0h2v-4h-2v4zm3.5 0h2v-6h-2v6z',
  table: 'M3 4h18v16H3zm2 2v3h6V6H5zm8 0v3h6V6h-6zm-8 5v3h6v-3H5zm8 0v3h6v-3h-6zm-8 5v2h6v-2H5zm8 0v2h6v-2h-6z',
  cloud: 'M4 9h7v3H4zm9 0h7v2h-7zM6 14h5v2H6zm7 0h4v4h-4zM3 18h8v2H3z',
  tone: 'M3 19h18v2H3zM3 13l5-4 4 3 5-6 4 3v3l-4-3-5 6-4-3-5 4z',
  emerging: 'M3 20l6-7 4 3 7-9V3h-5l1.8 1.8L13 11l-4-3-7.5 8.6z',
  stories: 'M4 4h10v4H4zm0 6h16v4H4zm0 6h12v4H4zm12-12h4v4h-4z',
  alerts: 'M12 2L1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z',
  mood: 'M12 4a10 10 0 0 0-10 10h3a7 7 0 0 1 14 0h3A10 10 0 0 0 12 4zm-1 10l4-5-1 6a1.6 1.6 0 1 1-3-1z',
  timeline: 'M3 19h18v2H3zm0-3l4-6 4 3 4-7 6 5v3l-5-4-4 7-4-3-5 7z',
  treemap: 'M3 3h11v11H3zm13 0h5v6h-5zm0 8h5v10h-5zM3 16h11v5H3z',
  feed: 'M4 4h16v4H4zm0 6h16v4H4zm0 6h16v4H4z',
  text: 'M5 4h14v3h-5.5v13h-3V7H5z',
}

function Svg({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d={d} fill="currentColor" />
    </svg>
  )
}

/** Menu ⋮ en mode consultation : actualiser, agrandir, imprimer */
function ViewMenu({ expanded, onExpand }: { expanded: boolean; onExpand: () => void }) {
  const { t } = useI18n()
  const reload = useContext(ReloadContext)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])
  const items: [string, () => void][] = [
    [t.menuRefresh, reload],
    [expanded ? t.menuClose : t.menuExpand, onExpand],
    [t.menuPrint, () => window.print()],
  ]
  return (
    <div className="mms-wmenu mms-noprint" ref={ref}>
      <button type="button" className="mms-wmenu__btn" aria-label={t.toolMenu} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Svg d={ICON.dots} />
      </button>
      {open && (
        <ul className="mms-pop mms-pop__list mms-pop__list--links">
          {items.map(([label, run]) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  run()
                }}
              >
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Drag = { id: string; mode: 'move' | 'resize'; x0: number; y0: number; start: WidgetConf[]; dx: number; dy: number }

function GridWidget(props: {
  conf: WidgetConf
  editing: boolean
  dragging: Drag | null
  onGrab: (e: ReactPointerEvent, mode: Drag['mode']) => void
  onEdit: () => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const { conf, editing, dragging } = props
  const i = useI18n()
  const b = BUILDER_TEXT[i.lang]
  const { path, title } = useWidgetTitles(conf)
  const [expanded, setExpanded] = useState(false)
  // Alerte à partir du graphique (comme « créer une alerte depuis un tableau de bord ») : profils qui gèrent les veilles
  const auth = useAuth()
  const canAlert = canDo(auth?.user, 'manage_watches') && hasModule(auth?.user, 'watch')
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [expanded])
  const held = dragging?.id === conf.id
  const red = conf.type === 'news'
  const cls = ['mms-widget', 'mms-cell', expanded && 'is-expanded', editing && 'is-editing', held && 'is-held'].filter(Boolean).join(' ')
  return (
    <article className={cls} style={{ gridColumn: `${conf.x + 1} / span ${conf.w}`, gridRow: `${conf.y + 1} / span ${conf.h}`, ['--h' as string]: conf.h }}>
      <header className={`mms-widget__head mms-widget__head--${red ? 'red' : 'plain'}`} onPointerDown={editing ? (e) => props.onGrab(e, 'move') : undefined}>
        <div>
          <span>{path}</span>
          <strong>{title}</strong>
        </div>
        {editing ? (
          <div className="mms-cell__tools" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" title={b.editWidget} aria-label={b.editWidget} onClick={props.onEdit}>
              <Svg d={ICON.edit} />
            </button>
            <button type="button" title={b.duplicate} aria-label={b.duplicate} onClick={props.onDuplicate}>
              <Svg d={ICON.copy} />
            </button>
            <button type="button" title={b.remove} aria-label={b.remove} onClick={props.onRemove}>
              <Svg d={ICON.trash} />
            </button>
          </div>
        ) : (
          <span className="mms-wtools">
            {canAlert && conf.type !== 'text' && <SaveSearchButton filters={{ ...EMPTY_FILTERS, q: conf.q ?? '', category: conf.category, flux: conf.flux, channel: conf.channel ?? '' } as Filters} email={auth?.user.email ?? ''} askKeyword compact context={title} />}
            <ViewMenu expanded={expanded} onExpand={() => setExpanded(!expanded)} />
          </span>
        )}
      </header>
      <div className="mms-widget__body mms-cell__body">
        <WidgetBody conf={conf} />
      </div>
      {editing && <span className="mms-cell__resize" onPointerDown={(e) => props.onGrab(e, 'resize')} aria-hidden />}
    </article>
  )
}

/** Fenêtre de réglage d'un widget, avec aperçu en direct */
function WidgetEditor({ initial, onApply, onClose }: { initial: WidgetConf; onApply: (w: WidgetConf) => void; onClose: () => void }) {
  const i = useI18n()
  const b = BUILDER_TEXT[i.lang]
  const [conf, setConf] = useState(initial)
  const facets = useFetch<Facets>('/api/news/facets').data
  const set = (patch: Partial<WidgetConf>) => setConf((c) => ({ ...c, ...patch }))
  const usesDim = !['news', 'line', 'kpi', 'tone', 'emerging', 'stories', 'alerts', 'mood', 'timeline', 'feed', 'text'].includes(conf.type)
  // Source de données : toutes les actualités ou une recherche enregistrée (veille), affinée par des mots-clés
  const watches = useFetch<{ watches: WatchOption[] }>('/api/news/watches').data?.watches ?? []
  const usesSource = !['text', ...RADAR_TYPES].includes(conf.type)
  const compare = conf.compare ?? []
  // Widgets du radar proposés seulement si le module « الرادار الذكي » est ouvert au profil
  const mayRadar = hasModule(useAuth()?.user, 'radar')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="mms-modal" role="dialog" aria-modal="true" aria-label={b.editWidget} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mms-modal__box mms-modal__box--editor">
        <div className="mms-editor">
          <div className="mms-editor__form">
            <p className="mms-editor__label">{b.type}</p>
            <div className="mms-editor__types">
              {WIDGET_TYPES.filter((type) => mayRadar || !RADAR_TYPES.includes(type)).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={conf.type === type ? 'is-active' : ''}
                  aria-pressed={conf.type === type}
                  onClick={() => set({ type })}
                >
                  <Svg d={TYPE_ICON[type]} size={28} />
                  <span>{b.types[type]}</span>
                </button>
              ))}
            </div>
            <label>
              <span>{b.widgetTitle}</span>
              <input value={conf.title} onChange={(e) => set({ title: e.target.value })} dir="auto" />
            </label>
            {conf.type === 'text' && (
              <label>
                <span>{b.textBody}</span>
                <textarea className="mms-editor__text" value={conf.text ?? ''} onChange={(e) => set({ text: e.target.value })} maxLength={1000} rows={5} dir="auto" />
              </label>
            )}
            {usesSource && (
              <div className="mms-editor__row">
                <label>
                  <span>{b.dataSource}</span>
                  <select value={conf.watch ?? ''} onChange={(e) => set({ watch: e.target.value })}>
                    <option value="">{b.allNews}</option>
                    {watches.map((w) => (
                      <option key={w.id} value={w.id}>
                        🔔 {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{b.keywords}</span>
                  <input value={conf.q ?? ''} onChange={(e) => set({ q: e.target.value })} maxLength={300} dir="auto" placeholder="AND / OR / NOT" />
                </label>
              </div>
            )}
            {conf.type !== 'text' && <div className="mms-editor__row">
              <label>
                <span>{b.source}</span>
                <select value={conf.flux} onChange={(e) => set({ flux: e.target.value as Flux | '' })}>
                  <option value="">{i.t.allSources}</option>
                  {FLUX_KEYS.map((f) => (
                    <option key={f} value={f}>
                      {i.flux(f)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{b.period}</span>
                <select value={conf.days} onChange={(e) => set({ days: Number(e.target.value) })}>
                  {PERIODS.map((d) => (
                    <option key={d} value={d}>
                      {b.days(d)}
                    </option>
                  ))}
                </select>
              </label>
            </div>}
            {conf.type === 'timeline' && (
              <>
                <div className="mms-editor__row">
                  <label>
                    <span>{b.step}</span>
                    <select value={conf.step ?? 'day'} onChange={(e) => set({ step: e.target.value as WidgetConf['step'] })}>
                      {STEPS.map((s) => (
                        <option key={s} value={s}>
                          {b.steps[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{b.style}</span>
                    <select value={conf.style ?? 'area'} onChange={(e) => set({ style: e.target.value as WidgetConf['style'] })}>
                      {STYLES.map((s) => (
                        <option key={s} value={s}>
                          {b.styles[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <span>{b.split}</span>
                  <select value={conf.split ?? ''} onChange={(e) => set({ split: e.target.value as WidgetConf['split'] })}>
                    {SPLITS.map((s) => (
                      <option key={s} value={s}>
                        {b.splits[s]}
                      </option>
                    ))}
                  </select>
                </label>
                {conf.split === 'compare' && (
                  <fieldset className="mms-editor__checks">
                    <legend>{b.compare}</legend>
                    {watches.map((w) => (
                      <label key={w.id}>
                        <input
                          type="checkbox"
                          checked={compare.includes(w.id)}
                          disabled={!compare.includes(w.id) && compare.length >= 4}
                          onChange={(e) => set({ compare: e.target.checked ? [...compare, w.id] : compare.filter((id) => id !== w.id) })}
                        />
                        <span dir="auto">{w.name}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </>
            )}
            {conf.type === 'feed' && (
              <label>
                <span>{b.channelFilter}</span>
                <select value={conf.channel ?? ''} onChange={(e) => set({ channel: e.target.value })}>
                  <option value="">{b.allChannels}</option>
                  {facets?.channels.map((c) => (
                    <option key={c.name} value={c.name}>
                      {i.channel(c.name)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {usesDim && (
              <label>
                <span>{b.dim}</span>
                <select value={conf.dim} onChange={(e) => set({ dim: e.target.value as WidgetConf['dim'] })}>
                  {DIMS.map((d) => (
                    <option key={d} value={d}>
                      {b.dims[d]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {conf.type === 'kpi' && (
              <label>
                <span>{b.metric}</span>
                <select value={conf.metric} onChange={(e) => set({ metric: e.target.value as WidgetConf['metric'] })}>
                  {METRICS.map((m) => (
                    <option key={m} value={m}>
                      {b.metrics[m]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {conf.type === 'news' && (
              <label>
                <span>{b.category}</span>
                <select value={conf.category} onChange={(e) => set({ category: e.target.value })}>
                  <option value="">{b.allCategories}</option>
                  {facets?.categories.map((c) => (
                    <option key={c.name} value={c.name}>
                      {i.category(c.name)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mms-editor__actions">
              <button type="button" className="news-btn" onClick={() => onApply(conf)}>
                {b.apply}
              </button>
              <button type="button" className="news-btn news-btn--ghost" onClick={onClose}>
                {b.cancel}
              </button>
            </div>
          </div>
          <div className="mms-editor__preview">
            <p className="mms-editor__label">{b.preview}</p>
            <PreviewCard conf={conf} />
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewCard({ conf }: { conf: WidgetConf }) {
  const { path, title } = useWidgetTitles(conf)
  return (
    <article className="mms-widget mms-preview">
      <header className={`mms-widget__head mms-widget__head--${conf.type === 'news' ? 'red' : 'plain'}`}>
        <div>
          <span>{path}</span>
          <strong>{title}</strong>
        </div>
      </header>
      <div className="mms-widget__body mms-cell__body">
        <WidgetBody conf={conf} />
      </div>
    </article>
  )
}

export function Builder({ flux }: { flux: Flux | '' }) {
  const auth = useAuth()
  const i = useI18n()
  const b = BUILDER_TEXT[i.lang]
  const [saved, setSaved] = useState<Board[] | null>(null)
  const [draft, setDraft] = useState<Board[] | null>(null)
  const [active, setActive] = useState('main')
  const [drag, setDrag] = useState<Drag | null>(null)
  const [editor, setEditor] = useState<{ conf: WidgetConf; isNew: boolean } | null>(null)
  const [status, setStatus] = useState<'' | 'saving' | 'error'>('')
  const [loadFailed, setLoadFailed] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [sharing, setSharing] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const brand = useBrand()

  useEffect(() => setSlot(document.getElementById('mms-appbar-slot')), [])
  useEffect(() => {
    fetch('/api/dashboards')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => setSaved(json.boards?.length ? json.boards : DEFAULT_BOARDS))
      .catch(() => setLoadFailed(true))
  }, [])

  const editing = draft !== null
  const boards = draft ?? saved ?? []
  const board = boards.find((x) => x.id === active) ?? boards[0]
  const boardName = (x: Board) => x.name || (x.id === 'main' ? b.defaultBoard : x.id === 'intel' ? b.intelBoard : b.newBoard)

  // Le choix de veille dans la barre noire s'applique aux widgets réglés sur « toutes les sources »
  const scoped = (w: WidgetConf) => (flux && !w.flux && !editing ? { ...w, flux } : w)

  function updateBoard(fn: (x: Board) => Board) {
    setDraft((d) => (d ?? []).map((x) => (x.id === board.id ? fn(x) : x)))
  }
  const setWidgets = (fn: (ws: WidgetConf[]) => WidgetConf[]) => updateBoard((x) => ({ ...x, widgets: fn(x.widgets) }))

  function startEdit() {
    setDraft(structuredClone(saved ?? DEFAULT_BOARDS))
  }
  function cancel() {
    setDraft(null)
    setStatus('')
    if (!saved?.some((x) => x.id === active)) setActive(saved?.[0]?.id ?? 'main')
  }
  async function save() {
    if (!draft) return
    setStatus('saving')
    try {
      const res = await fetch('/api/dashboards', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boards: draft }) })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json()
      setSaved(json.boards)
      setDraft(null)
      setStatus('')
    } catch {
      setStatus('error')
    }
  }
  function addBoard() {
    const next: Board = { id: newId(), name: '', widgets: [] }
    setDraft((d) => [...(d ?? structuredClone(saved ?? DEFAULT_BOARDS)), next])
    setActive(next.id)
  }
  function removeBoard() {
    if (boards.length < 2 || !window.confirm(b.confirmDelete)) return
    const rest = boards.filter((x) => x.id !== board.id)
    setDraft(rest)
    setActive(rest[0].id)
  }

  // Glisser-déposer : on recalcule la grille à partir de l'état du début du geste
  function grab(e: ReactPointerEvent, conf: WidgetConf, mode: Drag['mode']) {
    if (e.button !== 0) return
    e.preventDefault()
    setDrag({ id: conf.id, mode, x0: e.clientX, y0: e.clientY, start: board.widgets, dx: 0, dy: 0 })
  }
  useEffect(() => {
    if (!drag) return
    const grid = gridRef.current
    const colPx = grid ? (grid.clientWidth - GAP_PX * (COLS - 1)) / COLS + GAP_PX : 80
    const sign = i.dir === 'rtl' ? -1 : 1
    function onMove(e: PointerEvent) {
      if (!drag) return
      const dc = Math.round(((e.clientX - drag.x0) * sign) / colPx)
      const dr = Math.round((e.clientY - drag.y0) / (ROW_PX + GAP_PX))
      const moved = drag.start.map((w) =>
        w.id !== drag.id ? w : drag.mode === 'move' ? { ...w, x: w.x + dc, y: w.y + dr } : { ...w, w: w.w + dc, h: w.h + dr },
      )
      setWidgets(() => compact(moved, drag.id))
    }
    function onUp() {
      setWidgets((ws) => compact(ws))
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, drag?.mode])

  function applyWidget(conf: WidgetConf, isNew: boolean) {
    setWidgets((ws) => (isNew ? append(ws, conf) : compact(ws.map((w) => (w.id === conf.id ? conf : w)))))
    setEditor(null)
  }

  const canEdit = canDo(auth?.user, 'edit_dashboards')
  const canShare = canDo(auth?.user, 'share_dashboards')
  // Choix du tableau dans la barre noire, pour tous les profils ; boutons d'édition pour ceux qui peuvent modifier
  const picker =
    boards.length > 1 ? (
      <select className="mms-boardpick" value={board?.id ?? ''} onChange={(e) => setActive(e.target.value)} aria-label={i.lang === 'ar' ? 'اختيار لوحة القيادة' : 'Choose a dashboard'}>
        {boards.map((x) => (
          <option key={x.id} value={x.id}>
            {boardName(x)}
          </option>
        ))}
      </select>
    ) : null
  const bar =
    slot && !canEdit && picker
      ? createPortal(<div className="mms-editbar">{picker}</div>, slot)
      : slot && canEdit
      ? createPortal(
          editing ? (
            <div className="mms-editbar">
              <button type="button" className="mms-editbar__add" onClick={() => setEditor({ conf: makeWidget('bars'), isNew: true })}>
                <Svg d={ICON.plus} />
                {b.addChart}
              </button>
              <button type="button" className="mms-editbar__save" onClick={save} disabled={status === 'saving'}>
                {status === 'saving' ? b.saving : b.save}
              </button>
              <button type="button" className="mms-editbar__cancel" onClick={cancel}>
                {b.cancel}
              </button>
            </div>
          ) : (
            <div className="mms-editbar">
              {picker}
              <button type="button" className="mms-editbar__add" onClick={startEdit} disabled={!saved}>
                <Svg d={ICON.edit} />
                {b.edit}
              </button>
            </div>
          ),
          slot,
        )
      : null

  if (loadFailed) return <LoadState error />
  if (!saved || !board) return <p className="news-status">{i.t.loading}</p>
  const ordered = [...board.widgets].sort((a, c) => a.y - c.y || a.x - c.x)

  return (
    <div className="mms-builder">
      {bar}
      {/* En-tête du tableau : logo du client (console Super Admin), nom du tableau, partage par lien */}
      <header className="mms-boardhead">
        <img src={brand?.logo || '/logo-npdc.png'} alt={brand?.name || ''} />
        <div>
          <h2 dir="auto">{boardName(board)}</h2>
          {brand?.name && <small dir="auto">{brand.name}</small>}
        </div>
        {canShare && !editing && hasModule(auth?.user, 'dashboard') && (
          <div className="mms-boardhead__actions">
            <button type="button" className="news-btn news-btn--ghost" onClick={() => setSharing(true)}>
              🔗 {i.lang === 'ar' ? 'مشاركة' : 'Share'}
            </button>
          </div>
        )}
      </header>
      {sharing && (
        <ShareDialog
          board={board}
          boardName={boardName(board)}
          onClose={() => setSharing(false)}
          onPersist={
            canEdit
              ? async () => {
                  const res = await fetch('/api/dashboards', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boards: saved }) })
                  if (res.ok) setSaved((await res.json()).boards)
                  return res.ok
                }
              : undefined
          }
        />
      )}
      <div className="mms-boards">
        <div className="mms-boards__tabs" role="tablist">
          {boards.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={x.id === board.id}
              className={x.id === board.id ? 'is-active' : ''}
              onClick={() => setActive(x.id)}
            >
              {boardName(x)}
            </button>
          ))}
          {canEdit && (
            <button type="button" className="mms-boards__new" onClick={addBoard}>
              <Svg d={ICON.plus} size={18} />
              {b.newBoard}
            </button>
          )}
        </div>
        {editing && (
          <div className="mms-boards__edit">
            <label>
              <span>{b.boardName}</span>
              <input value={board.name} placeholder={boardName(board)} onChange={(e) => updateBoard((x) => ({ ...x, name: e.target.value }))} dir="auto" />
            </label>
            {boards.length > 1 && (
              <button type="button" className="news-btn news-btn--ghost" onClick={removeBoard}>
                {b.deleteBoard}
              </button>
            )}
            <div className="seg mms-devices" role="group" aria-label={b.device}>
              {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
                <button key={d} type="button" className={device === d ? 'seg__btn is-active' : 'seg__btn'} aria-pressed={device === d} onClick={() => setDevice(d)}>
                  {b.devices[d]}
                </button>
              ))}
            </div>
            <p className="news-status">{b.editHint}</p>
          </div>
        )}
        {status === 'error' && <p className="news-status news-status--error">{b.saveError}</p>}
      </div>

      {board.widgets.length === 0 ? (
        <p className="mms-note">{b.empty}</p>
      ) : (
        <div className={editing && device !== 'desktop' ? `mms-device mms-device--${device}` : undefined}>
        <div
          ref={gridRef}
          className={editing && device !== 'desktop' ? 'mms-grid is-phone' : editing ? 'mms-grid is-editing' : 'mms-grid'}
          style={{ gridAutoRows: `${ROW_PX}px`, gap: `${GAP_PX}px` }}
        >
          {ordered.map((w) => (
            <GridWidget
              key={w.id}
              conf={scoped(w)}
              editing={editing && device === 'desktop'}
              dragging={drag}
              onGrab={(e, mode) => grab(e, w, mode)}
              onEdit={() => setEditor({ conf: w, isNew: false })}
              onDuplicate={() => setWidgets((ws) => append(ws, { ...w, id: newId() }))}
              onRemove={() => setWidgets((ws) => compact(ws.filter((x) => x.id !== w.id)))}
            />
          ))}
        </div>
        </div>
      )}

      {editor && <WidgetEditor initial={editor.conf} onApply={(c) => applyWidget(c, editor.isNew)} onClose={() => setEditor(null)} />}
    </div>
  )
}
