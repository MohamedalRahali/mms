import { type FormEvent, useEffect, useState } from 'react'
import { useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'
import { Highlight } from './BroadcastStudio'

/**
 * الرصد المبرمج (veilles programmées sur les enregistrements) et recherche intelligente dans les transcriptions.
 * Une veille = un sujet (mots-clés, synonymes), des chaînes, des jours, des plages horaires (Tripoli) et une période ;
 * le serveur crée lui-même les enregistrements des plages (server/rasd.js), dans la limite du budget quotidien.
 */

export type RecChannel = { id: string; nom: string; canal: 'tv' | 'radio'; slots: string[]; recordable: boolean }
type Cost = { minutesPerDay: number; costPerDay: number; totalMinutesPerDay: number; totalCostPerDay: number; part: number; worstDay: number; level: 'ok' | 'warn' | 'over' }
type Watch = {
  id: string
  name: string
  keywords: string[]
  synonyms: string[]
  channels: string[]
  days: number[]
  windows: string[]
  from: string
  to: string
  alert: boolean
  paused: boolean
  createdBy: string
  cost: Cost
  upcoming: { channel: string; start: string; end: string }[]
  recordings: { id: string; chaine: string; nom: string; debut: string; fin: string; etat: string; hits: number | null }[]
  skipped: { channel: string; at: string; error: string }[]
}
type Suggestion = { channel: string; nom: string; canal: 'tv' | 'radio'; windows: string[]; kind: 'fixed' | 'bulletin' }
type Hit = { kind: 'recording' | 'fixed'; id: string; n?: number; offset?: number; nom: string; at: string; text: string; terms: string[] }
type Draft = { id?: string; name: string; keywords: string; synonyms: string; channels: string[]; days: number[]; windows: string[]; from: string; to: string; alert: boolean }

const TEXT = {
  ar: {
    rasd: 'الرصد المبرمج',
    rasdSub: 'حدِّد موضوعاً وقنوات وأياماً وفترات: يُبرمج النظام التسجيلات تلقائياً، ثم يُفرِّغها ويُعلِّم المقاطع التي تتحدث عن الموضوع.',
    newWatch: 'رصد مبرمج جديد',
    edit: 'تعديل',
    name: 'اسم الرصد',
    keywords: 'الكلمات المفتاحية (سطر أو فاصلة لكل كلمة)',
    synonyms: 'المرادفات والصيغ الأخرى (بالعربية أو الإنجليزية)',
    channels: 'القنوات',
    days: 'الأيام',
    dayNames: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    windows: 'الفترات (بتوقيت طرابلس)',
    tripoliNow: (h: string) => `الساعة الآن في طرابلس ${h}`,
    next: (d: string) => `أول تسجيل: ${d}`,
    noNext: 'لا توجد فترة قادمة: كل الفترات مضت (بتوقيت طرابلس) وتاريخ النهاية قريب.',
    addWindow: '+ فترة',
    remove: 'حذف',
    from: 'من تاريخ',
    to: 'إلى تاريخ (اختياري)',
    alert: 'إرسال تنبيه (تيليغرام) عند العثور على الموضوع',
    suggest: 'اقتراحات',
    suggestHint: 'نشرات الأخبار الرئيسية المعروفة لكل قناة. الفترات الثابتة المسائية مسجّلة أصلاً: يكفي البحث فيها دون تكلفة.',
    fixed: 'فترة ثابتة (مسجّلة أصلاً)',
    bulletin: 'نشرة معتادة',
    use: 'إضافة',
    estimate: (m: number, c: string) => `≈ ${m} دقيقة يومياً · ≈ ${c} $ يومياً`,
    total: (c: string, p: string) => `مجموع الرصد المبرمج في أثقل يوم ≈ ${c} $ من حصة ${p} $ يومياً`,
    over: 'يتجاوز حصة التسجيلات اليومية: قلِّل القنوات أو الفترات أو الأيام، أو ارفع الحصة.',
    warn: 'قريب من حصة التسجيلات اليومية (أكثر من 80 %).',
    save: 'حفظ الرصد',
    cancel: 'إلغاء',
    saved: 'تم حفظ الرصد. ستُبرمج تسجيلات الساعات الـ26 القادمة خلال دقيقة.',
    pause: 'إيقاف مؤقت',
    resume: 'استئناف',
    del: 'حذف الرصد',
    confirmDel: 'حذف هذا الرصد؟ تُلغى تسجيلاته القادمة، وتبقى النصوص المفرّغة.',
    paused: 'متوقف',
    active: 'نشط',
    upcoming: 'التسجيلات القادمة',
    past: 'التسجيلات السابقة',
    skipped: 'فترات لم تُبرمج',
    none: 'لا شيء',
    hits: (n: number) => `${n} مقطع عن الموضوع`,
    noWatch: 'لا يوجد رصد مبرمج بعد.',
    readOnly: 'إنشاء الرصد المبرمج متاح لملفات المحللين والمشرفين.',
    states: { en_attente: 'في الانتظار', en_cours: 'جارٍ التسجيل', transcription: 'جارٍ التفريغ', termine: 'منتهٍ', echoue: 'فشل', annule: 'أُلغي' } as Record<string, string>,
    search: 'البحث الذكي',
    searchSub: 'يبحث في نصوص التسجيلات وفي نصوص الفترات الثابتة المسائية، مع مراعاة صيغ الكلمات العربية (ال، و، ب، التاء المربوطة، الهمزات) ومرادفات الرصد المختار.',
    q: 'الموضوع أو الكلمات',
    watch: 'الرصد',
    anyWatch: 'كل التسجيلات',
    channel: 'القناة',
    anyChannel: 'كل القنوات',
    status: 'الحالة',
    anyStatus: 'كل الحالات',
    source: 'المصدر',
    sources: { all: 'الكل', recordings: 'التسجيلات حسب الطلب', fixed: 'الفترات الثابتة' } as Record<string, string>,
    go: 'بحث',
    results: (n: number) => `${n} مقطع`,
    expanded: 'مع المرادفات',
    open: 'فتح المقطع',
    fixedLabel: 'فترة ثابتة',
    recLabel: 'تسجيل',
    noHits: 'لا نتائج.',
    approx: 'التوقيت تقريبي',
    errors: {
      NO_NAME: 'أدخل اسماً للرصد.',
      NO_UPCOMING: 'لا توجد فترة قادمة: كل الفترات مضت بتوقيت طرابلس. اختر فترة لاحقة أو مدّد تاريخ النهاية.',
      NO_KEYWORDS: 'أدخل كلمة مفتاحية واحدة على الأقل.',
      NO_CHANNELS: 'اختر قناة واحدة على الأقل.',
      NO_DAYS: 'اختر يوماً واحداً على الأقل.',
      NO_WINDOWS: 'أضف فترة واحدة على الأقل.',
      BAD_WINDOW: 'صيغة الفترة غير صحيحة (مثال 20:00-20:30).',
      TOO_SHORT: 'الفترة قصيرة جداً (دقيقتان على الأقل).',
      TOO_LONG: 'الفترة الواحدة لا تتجاوز 240 دقيقة.',
      OVERLAP: 'فترتان متداخلتان في هذا الرصد: ادمجهما في فترة واحدة.',
      PAST: 'تاريخ النهاية مضى: لا يمكن الرصد في الماضي.',
      BAD_RANGE: 'تاريخ النهاية قبل تاريخ البداية.',
      TOO_FAR: 'تاريخ البداية بعيد جداً (سنة كحد أقصى).',
      BUDGET: 'يتجاوز حصة التسجيلات اليومية: قلِّل القنوات أو الفترات أو الأيام.',
      NOT_RECORDABLE: 'قناة لا تملك رابط بث يمكن تسجيله.',
      TOO_MANY_CHANNELS: 'عدد كبير من القنوات (10 كحد أقصى).',
      TOO_MANY_WINDOWS: 'عدد كبير من الفترات (6 كحد أقصى).',
      TOO_MANY_WATCHES: 'تم بلوغ الحد الأقصى لعدد عمليات الرصد.',
      PARALLEL: 'عدد التسجيلات المتزامنة بلغ الحد الأقصى في هذه الفترة.',
      CAPTURES: 'الفترات الثابتة المسائية تشغل كل أماكن التسجيل في هذه الفترة.',
      generic: 'تعذّرت العملية.',
    } as Record<string, string>,
  },
  en: {
    rasd: 'Scheduled watch',
    rasdSub: 'Set a subject, channels, days and time slots: the system schedules the recordings automatically, transcribes them and marks the passages about the subject.',
    newWatch: 'New scheduled watch',
    edit: 'Edit',
    name: 'Watch name',
    keywords: 'Keywords (one per line or comma)',
    synonyms: 'Synonyms and other forms (Arabic or English)',
    channels: 'Channels',
    days: 'Days',
    dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    windows: 'Time slots (Tripoli time)',
    tripoliNow: (h: string) => `Time in Tripoli now: ${h}`,
    next: (d: string) => `First recording: ${d}`,
    noNext: 'No upcoming slot: every slot has passed (Tripoli time) and the end date is too close.',
    addWindow: '+ slot',
    remove: 'Remove',
    from: 'From',
    to: 'Until (optional)',
    alert: 'Send an alert (Telegram) when the subject is found',
    suggest: 'Suggestions',
    suggestHint: 'Known main news bulletins per channel. Fixed evening slots are already recorded: searching them is free.',
    fixed: 'fixed slot (already recorded)',
    bulletin: 'usual bulletin',
    use: 'Add',
    estimate: (m: number, c: string) => `≈ ${m} min per day · ≈ $${c} per day`,
    total: (c: string, p: string) => `All scheduled watches on the busiest day ≈ $${c} out of the $${p} daily share`,
    over: 'Exceeds the daily recording share: reduce channels, slots or days, or raise the share.',
    warn: 'Close to the daily recording share (over 80%).',
    save: 'Save watch',
    cancel: 'Cancel',
    saved: 'Watch saved. Recordings for the next 26 hours are scheduled within a minute.',
    pause: 'Pause',
    resume: 'Resume',
    del: 'Delete watch',
    confirmDel: 'Delete this watch? Its upcoming recordings are cancelled; transcripts already made are kept.',
    paused: 'Paused',
    active: 'Active',
    upcoming: 'Upcoming recordings',
    past: 'Past recordings',
    skipped: 'Slots not scheduled',
    none: 'None',
    hits: (n: number) => `${n} passages on the subject`,
    noWatch: 'No scheduled watch yet.',
    readOnly: 'Creating scheduled watches is available to analyst and admin profiles.',
    states: { en_attente: 'Pending', en_cours: 'Recording', transcription: 'Transcribing', termine: 'Done', echoue: 'Failed', annule: 'Cancelled' } as Record<string, string>,
    search: 'Smart search',
    searchSub: 'Searches recording transcripts and fixed evening slot transcripts, matching Arabic word forms (al-, wa-, bi-, ta marbuta, hamza) and the synonyms of the selected watch.',
    q: 'Subject or words',
    watch: 'Watch',
    anyWatch: 'All recordings',
    channel: 'Channel',
    anyChannel: 'All channels',
    status: 'Status',
    anyStatus: 'All statuses',
    source: 'Source',
    sources: { all: 'All', recordings: 'On-demand recordings', fixed: 'Fixed slots' } as Record<string, string>,
    go: 'Search',
    results: (n: number) => `${n} passages`,
    expanded: 'with synonyms',
    open: 'Open passage',
    fixedLabel: 'fixed slot',
    recLabel: 'recording',
    noHits: 'No results.',
    approx: 'Times are approximate',
    errors: {
      NO_NAME: 'Enter a name for the watch.',
      NO_UPCOMING: 'No upcoming slot: every slot has passed in Tripoli time. Choose a later slot or extend the end date.',
      NO_KEYWORDS: 'Enter at least one keyword.',
      NO_CHANNELS: 'Choose at least one channel.',
      NO_DAYS: 'Choose at least one day.',
      NO_WINDOWS: 'Add at least one time slot.',
      BAD_WINDOW: 'Invalid time slot (e.g. 20:00-20:30).',
      TOO_SHORT: 'Time slot too short (2 minutes at least).',
      TOO_LONG: 'A time slot cannot exceed 240 minutes.',
      OVERLAP: 'Two slots of this watch overlap: merge them into one.',
      PAST: 'The end date is past: a watch cannot cover the past.',
      BAD_RANGE: 'The end date is before the start date.',
      TOO_FAR: 'Start date too far ahead (one year at most).',
      BUDGET: 'Exceeds the daily recording share: reduce channels, slots or days.',
      NOT_RECORDABLE: 'A channel has no recordable stream.',
      TOO_MANY_CHANNELS: 'Too many channels (10 at most).',
      TOO_MANY_WINDOWS: 'Too many time slots (6 at most).',
      TOO_MANY_WATCHES: 'Maximum number of watches reached.',
      PARALLEL: 'Maximum simultaneous recordings reached at that time.',
      CAPTURES: 'The fixed evening slots use every recording place at that time.',
      generic: 'The operation failed.',
    } as Record<string, string>,
  },
}
const useText = () => TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']
const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10)
const emptyDraft = (): Draft => ({ name: '', keywords: '', synonyms: '', channels: [], days: [0, 1, 2, 3, 4, 5, 6], windows: ['20:00-20:30'], from: today(), to: '', alert: false })
const toBody = (d: Draft) => ({ ...d, keywords: d.keywords, synonyms: d.synonyms })

function WatchEditor({ initial, channels, onDone }: { initial: Draft; channels: RecChannel[]; onDone: (saved: boolean) => void }) {
  const t = useText()
  const [d, setD] = useState<Draft>(initial)
  const [cost, setCost] = useState<Cost | null>(null)
  const [next, setNext] = useState<{ start: string; channel: string } | null | undefined>(undefined)
  const i = useI18n()
  // Heure de Tripoli (UTC+2), rafraîchie chaque minute : les plages d'une veille sont dans ce fuseau
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const tripoli = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Tripoli' }).format(new Date(clock))
  const [err, setErr] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const suggest = useFetch<{ suggestions: Suggestion[] }>('/api/rasd/suggest', 0).data?.suggestions ?? []
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  // Estimation du coût à chaque changement (après une courte pause de saisie)
  useEffect(() => {
    const id = setTimeout(async () => {
      const res = await fetch('/api/rasd/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toBody(d)) }).catch(() => null)
      const json = res ? await res.json().catch(() => ({})) : {}
      setCost(res?.ok ? json.cost : null)
      setNext(res?.ok ? json.next : undefined)
    }, 400)
    return () => clearTimeout(id)
  }, [d])
  async function save(e: FormEvent) {
    e.preventDefault()
    setErr('')
    const res = await fetch(d.id ? `/api/rasd/${d.id}` : '/api/rasd', { method: d.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toBody(d)) })
    const json = await res.json().catch(() => ({ error: 'generic' }))
    if (!res.ok) return setErr(t.errors[json.error] ?? t.errors.generic)
    onDone(true)
  }
  const setWindow = (k: number, part: 0 | 1, v: string) =>
    set({
      windows: d.windows.map((w, j) => {
        if (j !== k) return w
        const p = w.split('-')
        p[part] = v
        return p.join('-')
      }),
    })
  const addSuggestion = (s: Suggestion) => set({ channels: d.channels.includes(s.channel) ? d.channels : [...d.channels, s.channel], windows: [...new Set([...d.windows, ...s.windows])].slice(0, 6) })
  return (
    <form className="rasd-editor" onSubmit={save}>
      <div className="rasd-editor__grid">
        <label>
          <span>{t.name}</span>
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} dir="auto" required />
        </label>
        <label className="rasd-editor__dates">
          <span>{t.from}</span>
          <input type="date" value={d.from} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="rasd-editor__dates">
          <span>{t.to}</span>
          <input type="date" value={d.to} onChange={(e) => set({ to: e.target.value })} />
        </label>
        <label className="rasd-editor__wide">
          <span>{t.keywords}</span>
          <textarea value={d.keywords} onChange={(e) => set({ keywords: e.target.value })} rows={2} dir="auto" />
        </label>
        <label className="rasd-editor__wide">
          <span>{t.synonyms}</span>
          <textarea value={d.synonyms} onChange={(e) => set({ synonyms: e.target.value })} rows={2} dir="auto" />
        </label>
      </div>
      <fieldset className="rasd-editor__set">
        <legend>
          {t.channels}{' '}
          <button type="button" className="ld-toggle" onClick={() => setShowSuggest(!showSuggest)} aria-expanded={showSuggest}>
            💡 {t.suggest}
          </button>
        </legend>
        {showSuggest && (
          <div className="rasd-suggest">
            <p className="ld-hint">{t.suggestHint}</p>
            <ul>
              {suggest.map((s) => (
                <li key={s.channel}>
                  <span dir="auto">
                    {s.canal === 'radio' ? '📻' : '📺'} {s.nom}
                  </span>
                  <span dir="ltr">{s.windows.join(' · ')}</span>
                  <small className={`rasd-kind is-${s.kind}`}>{s.kind === 'fixed' ? t.fixed : t.bulletin}</small>
                  <button type="button" className="news-btn news-btn--ghost" onClick={() => addSuggestion(s)}>
                    {t.use}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="rasd-chips">
          {channels
            .filter((c) => c.recordable)
            .map((c) => (
              <label key={c.id} className={d.channels.includes(c.id) ? 'rasd-chip is-on' : 'rasd-chip'}>
                <input type="checkbox" checked={d.channels.includes(c.id)} onChange={(e) => set({ channels: e.target.checked ? [...d.channels, c.id] : d.channels.filter((x) => x !== c.id) })} />
                <span dir="auto">
                  {c.canal === 'radio' ? '📻' : '📺'} {c.nom}
                </span>
              </label>
            ))}
        </div>
      </fieldset>
      <fieldset className="rasd-editor__set">
        <legend>{t.days}</legend>
        <div className="rasd-chips">
          {t.dayNames.map((n, k) => (
            <label key={k} className={d.days.includes(k) ? 'rasd-chip is-on' : 'rasd-chip'}>
              <input type="checkbox" checked={d.days.includes(k)} onChange={(e) => set({ days: e.target.checked ? [...d.days, k].sort() : d.days.filter((x) => x !== k) })} />
              <span>{n}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="rasd-editor__set">
        <legend>
          {t.windows} <small className="rasd-clock">🕒 {t.tripoliNow(tripoli)}</small>
        </legend>
        <div className="rasd-windows">
          {d.windows.map((w, k) => (
            <span key={k} className="rasd-window" dir="ltr">
              <input type="time" value={w.split('-')[0]} onChange={(e) => setWindow(k, 0, e.target.value)} aria-label={`${t.windows} ${k + 1}`} />
              <span>→</span>
              <input type="time" value={w.split('-')[1]} onChange={(e) => setWindow(k, 1, e.target.value)} aria-label={`${t.windows} ${k + 1}`} />
              <button type="button" className="ld-toggle" onClick={() => set({ windows: d.windows.filter((_, j) => j !== k) })} aria-label={t.remove}>
                ✕
              </button>
            </span>
          ))}
          {d.windows.length < 6 && (
            <button type="button" className="ld-toggle" onClick={() => set({ windows: [...d.windows, '14:00-14:30'] })}>
              {t.addWindow}
            </button>
          )}
        </div>
      </fieldset>
      <label className="rasd-editor__check">
        <input type="checkbox" checked={d.alert} onChange={(e) => set({ alert: e.target.checked })} />
        <span>{t.alert}</span>
      </label>
      {next !== undefined && (
        <p className={next ? 'rasd-next' : 'rasd-next is-none'}>{next ? t.next(`${i.dateTime(next.start)} · ${channels.find((c) => c.id === next.channel)?.nom ?? next.channel}`) : t.noNext}</p>
      )}
      {cost && (
        <p className={`rasd-cost is-${cost.level}`}>
          {t.estimate(cost.minutesPerDay, cost.costPerDay.toFixed(3))} · {t.total(cost.totalCostPerDay.toFixed(3), cost.part.toFixed(2))}
          {cost.level !== 'ok' && <b> — {cost.level === 'over' ? t.over : t.warn}</b>}
        </p>
      )}
      <div className="rasd-editor__actions">
        <button type="submit" className="news-btn" disabled={cost?.level === 'over' || next === null}>
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

function WatchCard({ w, channels, can, onChange, onEdit }: { w: Watch; channels: RecChannel[]; can: boolean; onChange: () => void; onEdit: () => void }) {
  const i = useI18n()
  const t = useText()
  const name = (id: string) => channels.find((c) => c.id === id)?.nom ?? id
  const [err, setErr] = useState('')
  async function act(url: string, init: RequestInit) {
    setErr('')
    const res = await fetch(url, init)
    if (!res.ok) setErr(t.errors[(await res.json().catch(() => ({}))).error] ?? t.errors.generic)
    onChange()
  }
  return (
    <li className={w.paused ? 'rasd-card is-paused' : 'rasd-card'}>
      <header>
        <b dir="auto">🎯 {w.name}</b>
        <span className={w.paused ? 'rec-state is-annule' : 'rec-state is-termine'}>{w.paused ? t.paused : t.active}</span>
        <small className="rasd-card__cost">{t.estimate(w.cost.minutesPerDay, w.cost.costPerDay.toFixed(3))}</small>
      </header>
      <p className="rasd-card__line">
        {[...w.keywords, ...w.synonyms].map((k) => (
          <span key={k} className="news-badge" dir="auto">
            {k}
          </span>
        ))}
      </p>
      <p className="rasd-card__line ld-hint">
        {w.channels.map(name).join('، ')} · {w.days.map((d) => t.dayNames[d]).join('، ')} · <span dir="ltr">{w.windows.join(' · ')}</span> · {w.from}
        {w.to ? ` → ${w.to}` : ''}
        {w.alert ? ' · 🔔' : ''}
      </p>
      <div className="rasd-card__cols">
        <div>
          <h5>{t.upcoming}</h5>
          {w.upcoming.length === 0 ? (
            <p className="ld-hint">{t.none}</p>
          ) : (
            <ul>
              {w.upcoming.slice(0, 4).map((u, k) => (
                <li key={k}>
                  {i.dateTime(u.start)} – {i.time(u.end)} · <span dir="auto">{name(u.channel)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h5>{t.past}</h5>
          {w.recordings.length === 0 ? (
            <p className="ld-hint">{t.none}</p>
          ) : (
            <ul>
              {w.recordings.slice(0, 5).map((r) => (
                <li key={r.id}>
                  {i.dateTime(r.debut)} · <span dir="auto">{r.nom}</span> · {t.states[r.etat] ?? r.etat}
                  {r.hits != null && <b className={r.hits ? 'rasd-hits is-on' : 'rasd-hits'}> · {t.hits(r.hits)}</b>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {w.skipped.length > 0 && (
        <details className="rasd-card__skipped">
          <summary>
            {t.skipped} ({w.skipped.length})
          </summary>
          <ul>
            {w.skipped.map((s, k) => (
              <li key={k}>
                {i.dateTime(s.at)} · <span dir="auto">{name(s.channel)}</span> · {t.errors[s.error] ?? s.error}
              </li>
            ))}
          </ul>
        </details>
      )}
      {can && (
        <div className="rasd-card__actions">
          <button type="button" className="news-btn news-btn--ghost" onClick={onEdit}>
            {t.edit}
          </button>
          <button type="button" className="news-btn news-btn--ghost" onClick={() => act(`/api/rasd/${w.id}/pause`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: !w.paused }) })}>
            {w.paused ? t.resume : t.pause}
          </button>
          <button type="button" className="news-btn news-btn--ghost" onClick={() => window.confirm(t.confirmDel) && act(`/api/rasd/${w.id}`, { method: 'DELETE' })}>
            {t.del}
          </button>
        </div>
      )}
      {err && <p className="news-status news-status--error">{err}</p>}
    </li>
  )
}

export function RasdPanel({ channels }: { channels: RecChannel[] }) {
  const t = useText()
  const auth = useAuth()
  const can = canDo(auth?.user, 'tags')
  const [tick, setTick] = useState(0)
  const { data, error } = useFetch<{ watches: Watch[]; part: number }>(`/api/rasd?t=${tick}`, 30_000)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [msg, setMsg] = useState('')
  const i = useI18n()
  return (
    <div className="rasd">
      <p className="ld-hint">{t.rasdSub}</p>
      {error && <p className="news-status news-status--error">{i.t.loadError}</p>}
      {can && !editing && (
        <button type="button" className="news-btn" onClick={() => (setMsg(''), setEditing(emptyDraft()))}>
          + {t.newWatch}
        </button>
      )}
      {!can && <p className="news-status">{t.readOnly}</p>}
      {editing && (
        <WatchEditor
          initial={editing}
          channels={channels}
          onDone={(saved) => {
            setEditing(null)
            if (saved) setMsg(t.saved)
            setTick((n) => n + 1)
          }}
        />
      )}
      {msg && <p className="news-status">{msg}</p>}
      {data && data.watches.length === 0 && !editing && <p className="news-status">{t.noWatch}</p>}
      <ul className="rasd-list">
        {data?.watches.map((w) => (
          <WatchCard
            key={w.id}
            w={w}
            channels={channels}
            can={can}
            onChange={() => setTick((n) => n + 1)}
            onEdit={() => setEditing({ id: w.id, name: w.name, keywords: w.keywords.join('\n'), synonyms: w.synonyms.join('\n'), channels: w.channels, days: w.days, windows: w.windows, from: w.from, to: w.to, alert: w.alert })}
          />
        ))}
      </ul>
    </div>
  )
}

export function SmartSearch({ channels, onOpenRecording }: { channels: RecChannel[]; onOpenRecording: (id: string, n: number, terms: string[]) => void }) {
  const t = useText()
  const i = useI18n()
  const watches = useFetch<{ watches: Watch[] }>('/api/rasd', 0).data?.watches ?? []
  const [f, setF] = useState({ q: '', watch: '', channel: '', from: '', to: '', status: '', source: 'all' })
  const [query, setQuery] = useState('')
  const { data, error } = useFetch<{ terms: string[]; expanded: string[]; total: number; hits: Hit[] }>(query ? `/api/rasd/search?${query}` : '/api/rasd/search?q=', 0)
  function submit(e: FormEvent) {
    e.preventDefault()
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v))
    setQuery(p.toString())
  }
  return (
    <div className="rasd-search">
      <p className="ld-hint">{t.searchSub}</p>
      <form className="rasd-search__form" onSubmit={submit}>
        <label className="rasd-search__q">
          <span>{t.q}</span>
          <input type="search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} dir="auto" />
        </label>
        <label>
          <span>{t.watch}</span>
          <select value={f.watch} onChange={(e) => setF({ ...f, watch: e.target.value })}>
            <option value="">{t.anyWatch}</option>
            {watches.map((w) => (
              <option key={w.id} value={w.id}>
                🎯 {w.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t.channel}</span>
          <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
            <option value="">{t.anyChannel}</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t.from}</span>
          <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </label>
        <label>
          <span>{t.to}</span>
          <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </label>
        <label>
          <span>{t.status}</span>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">{t.anyStatus}</option>
            {['termine', 'echoue', 'en_cours', 'transcription', 'en_attente', 'annule'].map((s) => (
              <option key={s} value={s}>
                {t.states[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t.source}</span>
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            {['all', 'recordings', 'fixed'].map((s) => (
              <option key={s} value={s}>
                {t.sources[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="news-btn">
          {t.go}
        </button>
      </form>
      {error && <p className="news-status news-status--error">{i.t.loadError}</p>}
      {query && data && (
        <>
          <p className="ld-hint">
            {t.results(data.total)} · ≈ {t.approx}
            {data.expanded.length > 0 && (
              <>
                {' · '}
                {t.expanded} :{' '}
                {data.expanded.map((x) => (
                  <span key={x} className="news-badge" dir="auto">
                    {x}
                  </span>
                ))}
              </>
            )}
          </p>
          {data.hits.length === 0 ? (
            <p className="news-status">{t.noHits}</p>
          ) : (
            <ol className="bc-passages rasd-results">
              {data.hits.map((h, k) => (
                <li key={k} className="is-hit">
                  <span className="bc-passages__time">≈ {i.time(h.at)}</span>
                  <p dir="auto">
                    <small className="rasd-results__src">
                      {h.kind === 'fixed' ? t.fixedLabel : t.recLabel} · <b dir="auto">{h.nom}</b> · {i.dateTime(h.at)}
                    </small>
                    <Highlight text={h.text} terms={h.terms} />
                  </p>
                  {h.kind === 'recording' ? (
                    <button type="button" className="ld-toggle" onClick={() => onOpenRecording(h.id, h.n ?? 0, h.terms)}>
                      {t.open}
                    </button>
                  ) : (
                    <a className="ld-toggle rasd-results__link" href={`/?clip=${encodeURIComponent(h.id)}&t=${h.offset ?? 0}&q=${encodeURIComponent(h.terms[0] ?? '')}`}>
                      {t.open}
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}
