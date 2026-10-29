import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'
import { type AlertFlow, type SmartAlert } from '../lib/radar'
import { type WatchAlert } from '../lib/watches'
import { AlertFlowBar } from './AlertFlow'

/**
 * Alertes par mots-clés du « الرصد المبرمج » : réglages d'une veille (canaux, seuil, gravité, personne chargée, délai)
 * et suivi des alertes envoyées (ouvertes, en retard, clôturées). Serveur : server/watches.js, server/alertFlow.js.
 */

export const DEFAULT_ALERT: WatchAlert = { channels: ['email', 'telegram'], threshold: 1, severity: 'info', assignee: '', dueHours: 0 }

const TEXT = {
  ar: {
    settings: 'إعدادات التنبيه',
    channels: 'قنوات الإرسال',
    email: 'البريد الإلكتروني',
    telegram: 'تيليغرام',
    threshold: 'الحد الأدنى للأخبار قبل الإرسال',
    severity: 'درجة الأهمية',
    sev: { info: 'معلومة', high: 'مرتفع', critical: 'حرج' } as Record<WatchAlert['severity'], string>,
    assignee: 'المكلّف بالمتابعة',
    due: 'مهلة المعالجة (بالساعات، 0 = بدون)',
    save: 'حفظ',
    saved: 'تم الحفظ.',
    summary: (a: WatchAlert) => `${a.channels.map((c) => (c === 'email' ? 'بريد' : 'تيليغرام')).join(' + ')} · ابتداءً من ${a.threshold} خبر${a.dueHours ? ` · مهلة ${a.dueHours} س` : ''}`,
    pending: (n: number) => `${n} خبر في الانتظار حتى بلوغ الحد`,
    tracker: 'متابعة التنبيهات',
    open: 'مفتوحة',
    closed: 'مغلقة مؤخراً',
    none: 'لا توجد تنبيهات مفتوحة.',
    overdue: 'متأخر',
    dueAt: 'قبل',
    news: (n: number) => `${n} خبر`,
    show: 'عرض الأخبار',
  },
  en: {
    settings: 'Alert settings',
    channels: 'Channels',
    email: 'Email',
    telegram: 'Telegram',
    threshold: 'Minimum news before sending',
    severity: 'Severity',
    sev: { info: 'Info', high: 'High', critical: 'Critical' } as Record<WatchAlert['severity'], string>,
    assignee: 'Assigned to',
    due: 'Handling deadline (hours, 0 = none)',
    save: 'Save',
    saved: 'Saved.',
    summary: (a: WatchAlert) => `${a.channels.map((c) => (c === 'email' ? 'email' : 'Telegram')).join(' + ')} · from ${a.threshold} news${a.dueHours ? ` · ${a.dueHours} h deadline` : ''}`,
    pending: (n: number) => `${n} news waiting until the threshold is reached`,
    tracker: 'Alert tracker',
    open: 'Open',
    closed: 'Recently closed',
    none: 'No open alert.',
    overdue: 'Overdue',
    dueAt: 'due',
    news: (n: number) => `${n} news`,
    show: 'Show news',
  },
}

const useText = () => TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']

/** Champs des réglages d'alerte (formulaire de création et modification d'une veille) */
export function AlertFields({ value, onChange }: { value: WatchAlert; onChange: (a: WatchAlert) => void }) {
  const t = useText()
  const set = (patch: Partial<WatchAlert>) => onChange({ ...value, ...patch })
  const toggle = (c: 'email' | 'telegram') => {
    const next = value.channels.includes(c) ? value.channels.filter((x) => x !== c) : [...value.channels, c]
    if (next.length) set({ channels: next })
  }
  return (
    <div className="mms-alertset">
      <fieldset className="mms-field">
        <legend>{t.channels}</legend>
        <label>
          <input type="checkbox" checked={value.channels.includes('email')} onChange={() => toggle('email')} /> {t.email}
        </label>
        <label>
          <input type="checkbox" checked={value.channels.includes('telegram')} onChange={() => toggle('telegram')} /> {t.telegram}
        </label>
      </fieldset>
      <label className="mms-field">
        <span>{t.threshold}</span>
        <input type="number" min={1} max={50} value={value.threshold} onChange={(e) => set({ threshold: Math.min(Math.max(Number(e.target.value) || 1, 1), 50) })} />
      </label>
      <label className="mms-field">
        <span>{t.severity}</span>
        <select value={value.severity} onChange={(e) => set({ severity: e.target.value as WatchAlert['severity'] })}>
          {(['info', 'high', 'critical'] as const).map((s) => (
            <option key={s} value={s}>
              {t.sev[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="mms-field">
        <span>{t.assignee}</span>
        <input value={value.assignee} maxLength={120} onChange={(e) => set({ assignee: e.target.value })} dir="auto" />
      </label>
      <label className="mms-field">
        <span>{t.due}</span>
        <input type="number" min={0} max={720} value={value.dueHours} onChange={(e) => set({ dueHours: Math.min(Math.max(Number(e.target.value) || 0, 0), 720) })} />
      </label>
    </div>
  )
}

/** Résumé et modification des réglages d'alerte d'une veille existante */
export function WatchAlertRow({ id, alert, pending, onSaved }: { id: string; alert?: WatchAlert; pending?: number; onSaved: () => void }) {
  const t = useText()
  const mayEdit = canDo(useAuth()?.user, 'manage_watches')
  const current = alert ?? DEFAULT_ALERT
  const [draft, setDraft] = useState(current)
  const [msg, setMsg] = useState('')
  async function save() {
    const res = await fetch(`/api/watches/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alert: draft }) })
    setMsg(res.ok ? t.saved : '')
    if (res.ok) onSaved()
  }
  return (
    <div className="mms-watch__alert">
      <p className="mms-watch__meta">
        <span className={`mms-sev mms-sev--${current.severity}`}>{t.sev[current.severity]}</span> {t.summary(current)}
        {current.assignee && (
          <>
            {' · '}
            {t.assignee}: <b dir="auto">{current.assignee}</b>
          </>
        )}
        {pending ? ` · ${t.pending(pending)}` : ''}
      </p>
      {mayEdit && (
        <details onToggle={() => (setDraft(current), setMsg(''))}>
          <summary>{t.settings}</summary>
          <AlertFields value={draft} onChange={setDraft} />
          <button type="button" className="news-btn" onClick={save}>
            {t.save}
          </button>
          {msg && <span className="news-status is-ok"> {msg}</span>}
        </details>
      )}
    </div>
  )
}

const MERGE_TEXT = {
  ar: {
    title: 'عمليات رصد متشابهة',
    intro: 'هذه العمليات تراقب تقريباً الكلمات نفسها. الدمج ينشئ رصداً واحداً يجمع قواعدها والمرسَل إليهم، ويعطّل العمليات الأصلية دون حذفها (يمكن إعادة تفعيلها).',
    group: (n: number, common: number, words: number) => `${n} عمليات · ${common} كلمة مشتركة من ${words}`,
    merge: 'دمج في رصد واحد',
    confirm: (names: string[]) => `دمج: ${names.join('، ')}؟
ستُعطَّل العمليات الأصلية ولن تُحذف.`,
    done: 'تم الدمج. العمليات الأصلية معطّلة ومحفوظة.',
    failed: 'تعذّر الدمج.',
  },
  en: {
    title: 'Similar watches',
    intro: 'These watches monitor nearly the same words. Merging creates one watch with all their rules and recipients, and disables the originals without deleting them (they can be re-enabled).',
    group: (n: number, common: number, words: number) => `${n} watches · ${common} of ${words} words in common`,
    merge: 'Merge into one watch',
    confirm: (names: string[]) => `Merge: ${names.join(', ')}?
The originals will be disabled, not deleted.`,
    done: 'Merged. The originals are disabled and kept.',
    failed: 'The merge failed.',
  },
}

/** Proposition de fusion des veilles presque identiques (confirmée par l'utilisateur, rien n'est supprimé) */
export function MergeProposals({ tick, onMerged }: { tick: number; onMerged: () => void }) {
  const t = MERGE_TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']
  const mayEdit = canDo(useAuth()?.user, 'manage_watches')
  const [groups, setGroups] = useState<{ ids: string[]; names: string[]; common: number; words: number }[]>([])
  const [msg, setMsg] = useState('')
  useEffect(() => {
    let off = false
    fetch('/api/watches/similar')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => !off && json && setGroups(json.groups ?? []))
      .catch(() => {})
    return () => {
      off = true
    }
  }, [tick])
  async function merge(ids: string[], names: string[]) {
    if (!window.confirm(t.confirm(names))) return
    const res = await fetch('/api/watches/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    setMsg(res.ok ? t.done : t.failed)
    if (res.ok) onMerged()
  }
  if (!mayEdit || (!groups.length && !msg)) return null
  return (
    <section className="mms-note mms-merge">
      {groups.length > 0 && (
        <>
          <strong>{t.title}</strong>
          <p>{t.intro}</p>
          <ul>
            {groups.map((g) => (
              <li key={g.ids.join()}>
                <span dir="auto">{g.names.join(' · ')}</span>
                <small> ({t.group(g.ids.length, g.common, g.words)})</small>{' '}
                <button type="button" className="news-btn" onClick={() => merge(g.ids, g.names)}>
                  {t.merge}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {msg && <p className="news-status is-ok">{msg}</p>}
    </section>
  )
}

type Row = AlertFlow & {
  id: string
  overdue: boolean
  updatedAt?: string
  meta: { watchId: string; name: string; count: number; titles: string[]; severity: WatchAlert['severity']; openedAt: string; dueAt: string | null }
}

/** Suivi des alertes envoyées par les veilles : statut, personne chargée, échéance, historique */
export function WatchAlertTracker({ onOpen, tick }: { onOpen: (id: string) => void; tick: number }) {
  const i = useI18n()
  const t = useText()
  const [data, setData] = useState<{ open: Row[]; closed: Row[] } | null>(null)
  const [mine, setMine] = useState(0)
  useEffect(() => {
    let off = false
    fetch('/api/watches/alerts')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => !off && json && setData(json))
      .catch(() => {})
    return () => {
      off = true
    }
  }, [tick, mine])
  if (!data) return null
  const card = (r: Row) => (
    <li key={r.id} className={`mms-alertrow${r.overdue ? ' is-overdue' : ''}`}>
      <header>
        <span className={`mms-sev mms-sev--${r.meta.severity}`}>{t.sev[r.meta.severity]}</span>
        <b dir="auto">{r.meta.name}</b>
        <small>
          {i.dateTime(r.meta.openedAt)} · {t.news(r.meta.count)}
          {r.meta.dueAt && ` · ${t.dueAt} ${i.dateTime(r.meta.dueAt)}`}
        </small>
        {r.overdue && <span className="mms-alertrow__late">{t.overdue}</span>}
      </header>
      {r.meta.titles.length > 0 && (
        <ul>
          {r.meta.titles.map((x, k) => (
            <li key={k} dir="auto">
              {x}
            </li>
          ))}
        </ul>
      )}
      <div className="mms-alertrow__flow">
        <AlertFlowBar key={`${r.id}-${r.status}-${r.history.length}`} alert={{ id: r.id, flow: r } as unknown as SmartAlert} />
        <button type="button" className="news-btn news-btn--ghost" onClick={() => onOpen(r.meta.watchId)}>
          {t.show}
        </button>
      </div>
    </li>
  )
  return (
    <section className="mms-widget mms-alerttracker">
      <header className="mms-widget__head mms-widget__head--plain">
        <div>
          <span>MMS / {t.tracker}</span>
          <strong>
            {t.open} ({data.open.length}){data.open.some((r) => r.overdue) ? ` · ${t.overdue} (${data.open.filter((r) => r.overdue).length})` : ''}
          </strong>
        </div>
        <button type="button" className="news-btn news-btn--ghost" onClick={() => setMine(mine + 1)} aria-label="↻">
          ↻
        </button>
      </header>
      <div className="mms-widget__body">
        {data.open.length === 0 ? <p className="news-status">{t.none}</p> : <ol className="mms-alertlist">{data.open.map(card)}</ol>}
        {data.closed.length > 0 && (
          <details>
            <summary>
              {t.closed} ({data.closed.length})
            </summary>
            <ol className="mms-alertlist">{data.closed.map(card)}</ol>
          </details>
        )}
      </div>
    </section>
  )
}
