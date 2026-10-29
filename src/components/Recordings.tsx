import { type FormEvent, useEffect, useState } from 'react'
import { useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'
import { Highlight } from './BroadcastStudio'
import { MediaIcon } from './MediaParts'
import { RasdPanel, SmartSearch } from './Rasd'

/**
 * Enregistrements à la demande (mur du direct) : choisir une chaîne et une période précise ; la veille enregistre le
 * direct pendant cette période seulement, transcrit, puis supprime l'audio. Suivi de l'état, recherche et
 * téléchargement de la transcription (TXT, SRT). Données : server/recordings.js.
 */

type State = 'en_attente' | 'en_cours' | 'transcription' | 'termine' | 'echoue' | 'annule'
type Rec = {
  id: string
  chaine: string
  nom: string
  canal: 'tv' | 'radio'
  debut: string
  fin: string
  par: string
  estimate: number
  etat: State
  enregistrement?: number
  transcription?: number
  secondes?: number
  erreur?: string
  avertissement?: string
  partiel?: string
  cout?: number
  texte?: boolean
  rasd?: string[]
  hits?: number | null
}
type Channel = { id: string; nom: string; canal: 'tv' | 'radio'; slots: string[]; recordable: boolean }
type Data = {
  items: Rec[]
  channels: Channel[]
  limits: { maxMinutes: number; minMinutes: number; maxParallel: number; maxCaptures: number; maxDaysAhead: number; costPerMinute: number }
  budget: {
    day: string
    cap: number
    spent: number
    reserved: number
    remaining: number
    hours: number
    total: number | null
    fixed: { spent: number; cap: number } | null
    month: { spent: number; cap: number } | null
    known: boolean
  }
  veille: { maj: string | null }
}
type Transcript = { nom: string; debut: string; fin: string; passages: { at: string; text: string }[] }

const TEXT = {
  ar: {
    title: 'تسجيل حسب الطلب',
    tabs: { record: 'برمجة التسجيل', rasd: 'الرصد المبرمج', search: 'البحث الذكي' } as Record<string, string>,
    rasdTag: 'رصد مبرمج',
    hitsN: (n: number) => `${n} مقطع عن الموضوع`,
    sub: 'اختر قناة وفترة محددة: يُسجَّل البث المباشر خلال هذه الفترة فقط، ثم يُفرَّغ نصه تلقائياً ويُحذف الصوت.',
    channel: 'القناة',
    start: 'البداية',
    end: 'النهاية',
    local: 'بتوقيت طرابلس',
    tripoliNow: (h: string) => `الساعة الآن في طرابلس ${h}`,
    now: 'الآن',
    plus: (m: number) => `+${m} د`,
    duration: 'المدة',
    estimate: 'تكلفة التفريغ التقديرية',
    remaining: (r: string, c: string, h: string) => `ميزانية التسجيلات اليوم: المتبقي ${r} $ من ${c} $ (≈ ${h} س من الصوت)`,
    unknownBudget: 'الرصد لم يرسل ميزانيته بعد: التقدير على أساس الحصة الافتراضية.',
    split: 'توزيع ميزانية التفريغ اليومية',
    splitHint: (t: string) => `السقف الإجمالي ≈ ${t} $ يومياً (65 $ شهرياً)، يتقاسمه التسجيل الثابت المسائي والتسجيلات حسب الطلب.`,
    part: 'حصة التسجيلات حسب الطلب ($ يومياً)',
    fixedShare: (f: string, s: string) => `الحصة المتبقية للفترات الثابتة: ${f} $ يومياً (استُهلك اليوم ${s} $)`,
    save: 'حفظ التوزيع',
    savedSplit: 'تم حفظ التوزيع. يطبّقه الرصد خلال دقيقة.',
    submit: 'برمجة التسجيل',
    scheduled: 'تمت برمجة التسجيل.',
    merged: 'تداخلت الفترة مع تسجيل قائم لهذه القناة، فدُمجت الفترتان في تسجيل واحد.',
    list: 'التسجيلات',
    empty: 'لا توجد تسجيلات مبرمجة.',
    states: { en_attente: 'في الانتظار', en_cours: 'جارٍ التسجيل', transcription: 'جارٍ التفريغ', termine: 'منتهٍ', echoue: 'فشل', annule: 'أُلغي' } as Record<State, string>,
    recProgress: 'التسجيل',
    trProgress: 'التفريغ',
    stop: 'إيقاف الآن',
    cancel: 'إلغاء',
    view: 'عرض النص',
    txt: 'تنزيل TXT',
    srt: 'تنزيل SRT',
    by: 'بواسطة',
    min: (n: number) => `${n} د`,
    partial: 'تسجيل جزئي',
    retries: (n: number) => `${n} محاولة إعادة اتصال`,
    readOnly: 'برمجة التسجيلات متاحة لملفات المحللين والمشرفين.',
    search: 'ابحث في كل النصوص المفرّغة',
    searchGo: 'بحث',
    noHits: 'لا نتائج.',
    filter: 'ابحث في هذا النص',
    close: 'إغلاق',
    approx: 'التوقيت تقريبي',
    notRecordable: 'لا يوجد رابط بث يمكن تسجيله',
    errors: {
      PAST: 'هذه الفترة بدأت قبل أكثر من دقيقتين. البث المباشر لا يتيح الرجوع إلى الماضي (دقيقة إلى أربع دقائق فقط حسب الفحص)، لذا لا يمكن تسجيل فترة مضت.',
      pastSlots: (s: string) => `هذه القناة تُسجَّل تلقائياً في الفترة ${s}: راجع نصوصها في تبويب «النص» للقناة.`,
      TOO_SHORT: (n: number) => `المدة الدنيا ${n} دقائق.`,
      TOO_LONG: (n: number) => `المدة القصوى ${n} دقيقة للتسجيل الواحد.`,
      TOO_FAR: (n: number) => `لا يمكن البرمجة لأكثر من ${n} يوماً مقدماً.`,
      PARALLEL: (n: number) => `لا يمكن تسجيل أكثر من ${n} قنوات في الوقت نفسه. اختر فترة أخرى.`,
      CAPTURES: (n: number, f: number) => `في هذه الفترة تُسجَّل ${f} قنوات ضمن الفترات الثابتة المسائية، والحد الأقصى للرصد ${n} تسجيلات في الوقت نفسه. اختر فترة أخرى.`,
      BAD_PART: (m: string) => `أدخل مبلغاً بين 0 و${m} $.`,
      BUDGET: (e: string, r: string) => `التكلفة التقديرية ${e} $ تتجاوز المتبقي من سقف هذا الشهر (${r} $).`,
      NOT_RECORDABLE: 'هذه القناة لا تملك رابط بث يمكن تسجيله.',
      NO_CHANNEL: 'القناة غير موجودة.',
      BAD_RANGE: 'يجب أن تكون النهاية بعد البداية.',
      FINISHED: 'هذا التسجيل انتهى بالفعل.',
      NO_VEILLE: 'خدمة التسجيل في الرصد لم تستجب في الموعد (لم تُحدَّث بعد على الخادم أو متوقفة).',
      generic: 'تعذّرت العملية.',
    },
    veille: {
      STREAM_DOWN: (n: string) => (n ? `رابط البث لم يعمل بعد ${n} محاولات.` : 'رابط البث لم يعمل خلال الفترة.'),
      NO_AUDIO: 'لم يُستقبل أي صوت خلال الفترة (خدمة التسجيل لم تكن تعمل أو البث متوقف).',
      BUDGET: 'ميزانية التسجيلات لهذا اليوم استُنفدت: لم يُفرَّغ النص. أعد المحاولة غداً أو ارفع الحصة.',
      TRANSCRIBE: 'فشل التفريغ الآلي للنص.',
      WAIT_SLOT: 'في انتظار مكان: عدد التسجيلات الجارية بلغ الحد الأقصى.',
      RETRY: 'انقطع البث، جارٍ إعادة الاتصال…',
      STREAM_CUT: 'انقطع البث أثناء التسجيل: النص يغطي الجزء المسجَّل فقط.',
    },
  },
  en: {
    title: 'Record on demand',
    tabs: { record: 'Schedule recording', rasd: 'Scheduled watch', search: 'Smart search' } as Record<string, string>,
    rasdTag: 'scheduled watch',
    hitsN: (n: number) => `${n} passages on the subject`,
    sub: 'Pick a channel and a precise period: the live stream is recorded during that period only, then transcribed automatically and the audio deleted.',
    channel: 'Channel',
    start: 'Start',
    end: 'End',
    local: 'Tripoli time',
    tripoliNow: (h: string) => `Time in Tripoli now: ${h}`,
    now: 'Now',
    plus: (m: number) => `+${m} min`,
    duration: 'Duration',
    estimate: 'Estimated transcription cost',
    remaining: (r: string, c: string, h: string) => `On-demand budget today: $${r} left out of $${c} (≈ ${h} h of audio)`,
    unknownBudget: 'The monitoring has not sent its budget yet: estimate based on the default share.',
    split: 'Daily transcription budget split',
    splitHint: (t: string) => `Total cap ≈ $${t} per day ($65 per month), shared between the fixed evening slots and on-demand recordings.`,
    part: 'On-demand share ($ per day)',
    fixedShare: (f: string, s: string) => `Left for the fixed slots: $${f} per day ($${s} used today)`,
    save: 'Save split',
    savedSplit: 'Split saved. The monitoring applies it within a minute.',
    submit: 'Schedule recording',
    scheduled: 'Recording scheduled.',
    merged: 'The period overlapped an existing recording of this channel, so both were merged into one.',
    list: 'Recordings',
    empty: 'No recording scheduled.',
    states: { en_attente: 'Pending', en_cours: 'Recording', transcription: 'Transcribing', termine: 'Done', echoue: 'Failed', annule: 'Cancelled' } as Record<State, string>,
    recProgress: 'Recording',
    trProgress: 'Transcription',
    stop: 'Stop now',
    cancel: 'Cancel',
    view: 'View text',
    txt: 'Download TXT',
    srt: 'Download SRT',
    by: 'by',
    min: (n: number) => `${n} min`,
    partial: 'Partial recording',
    retries: (n: number) => `${n} reconnection attempts`,
    readOnly: 'Scheduling recordings is available to analyst and admin profiles.',
    search: 'Search all transcripts',
    searchGo: 'Search',
    noHits: 'No results.',
    filter: 'Search this transcript',
    close: 'Close',
    approx: 'Times are approximate',
    notRecordable: 'No recordable stream',
    errors: {
      PAST: 'This period started more than 2 minutes ago. Live streams cannot be rewound (1 to 4 minutes at most, as tested), so a past period cannot be recorded.',
      pastSlots: (s: string) => `This channel is recorded automatically during ${s}: see its transcripts in the channel's “Transcript” tab.`,
      TOO_SHORT: (n: number) => `Minimum duration is ${n} minutes.`,
      TOO_LONG: (n: number) => `Maximum duration is ${n} minutes per recording.`,
      TOO_FAR: (n: number) => `Recordings cannot be scheduled more than ${n} days ahead.`,
      PARALLEL: (n: number) => `At most ${n} channels can be recorded at the same time. Choose another period.`,
      CAPTURES: (n: number, f: number) => `${f} channels are already recorded in the fixed evening slots at that time, and the monitoring records at most ${n} at once. Choose another period.`,
      BAD_PART: (m: string) => `Enter an amount between 0 and $${m}.`,
      BUDGET: (e: string, r: string) => `The estimated cost ($${e}) exceeds what is left of this month's cap ($${r}).`,
      NOT_RECORDABLE: 'This channel has no recordable stream.',
      NO_CHANNEL: 'Unknown channel.',
      BAD_RANGE: 'The end must be after the start.',
      FINISHED: 'This recording has already finished.',
      NO_VEILLE: 'The monitoring recorder did not respond in time (not updated on the server yet, or stopped).',
      generic: 'The operation failed.',
    },
    veille: {
      STREAM_DOWN: (n: string) => (n ? `The stream did not work after ${n} attempts.` : 'The stream did not work during the period.'),
      NO_AUDIO: 'No audio was received during the period (recorder not running, or stream off air).',
      BUDGET: "Today's recording budget is used up: the text was not transcribed. Try again tomorrow or raise the share.",
      TRANSCRIBE: 'Automatic transcription failed.',
      WAIT_SLOT: 'Waiting for a free slot: the maximum number of recordings is running.',
      RETRY: 'Stream interrupted, reconnecting…',
      STREAM_CUT: 'The stream was cut during the recording: the text covers the recorded part only.',
    },
  },
}
const useText = () => TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']

/** Message de la veille « CODE|détail » : texte traduit + détail technique (anglais ou français, laissé tel quel) */
function veilleMessage(t: (typeof TEXT)['ar'], raw?: string) {
  if (!raw) return null
  if (raw === 'NO_VEILLE') return { text: t.errors.NO_VEILLE, detail: '' }
  const [code, ...rest] = raw.split('|')
  const v = t.veille as Record<string, unknown>
  const known = v[code]
  if (code === 'STREAM_DOWN') {
    const n = /^\d+$/.test(rest[0] ?? '') ? (rest.shift() as string) : ''
    return { text: t.veille.STREAM_DOWN(n), detail: rest.join('|') }
  }
  if (typeof known === 'string') return { text: known, detail: rest.join('|') }
  return { text: raw, detail: '' }
}

function VeilleNote({ raw, className }: { raw?: string; className: string }) {
  const t = useText()
  const m = veilleMessage(t, raw)
  if (!m) return null
  return (
    <p className={className}>
      {m.text}
      {m.detail && (
        <small className="rec-row__detail" dir="ltr">
          {m.detail}
        </small>
      )}
    </p>
  )
}
type Err = { error: string; slots?: string[]; max?: number; days?: number; estimate?: number; remaining?: number; fixed?: number }

function errorText(t: (typeof TEXT)['ar'], e: Err, limits?: Data['limits']) {
  const E = t.errors
  switch (e.error) {
    case 'PAST':
      return `${E.PAST}${e.slots?.length ? ` ${E.pastSlots(e.slots.join('، '))}` : ''}`
    case 'TOO_SHORT':
      return E.TOO_SHORT(limits?.minMinutes ?? 2)
    case 'TOO_LONG':
      return E.TOO_LONG(e.max ?? limits?.maxMinutes ?? 240)
    case 'TOO_FAR':
      return E.TOO_FAR(e.days ?? 30)
    case 'PARALLEL':
      return E.PARALLEL(e.max ?? limits?.maxParallel ?? 3)
    case 'BUDGET':
      return E.BUDGET(String(e.estimate ?? '?'), String(e.remaining ?? '?'))
    case 'CAPTURES':
      return E.CAPTURES(e.max ?? limits?.maxCaptures ?? 6, e.fixed ?? 0)
    case 'BAD_PART':
      return E.BAD_PART(String(e.max ?? '?'))
    default: {
      const known = (E as Record<string, unknown>)[e.error]
      return typeof known === 'string' ? known : E.generic
    }
  }
}

// Champs de date et d'heure en heure de Tripoli (UTC+2 toute l'année), quel que soit le fuseau du poste
const localValue = (t: number) => new Date(t + 2 * 3_600_000).toISOString().slice(0, 16)
const fromLocal = (v: string) => Date.parse(`${v}:00+02:00`)

function Bar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <span className="rec-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <small>
        {label} {pct}%
      </small>
      <i>
        <b style={{ width: `${pct}%` }} />
      </i>
    </span>
  )
}

function TranscriptModal({ rec, onClose, focus, terms = [] }: { rec: Rec; onClose: () => void; focus?: number; terms?: string[] }) {
  const i = useI18n()
  const t = useText()
  const { data, error } = useFetch<Transcript>(`/api/recordings/${rec.id}/transcript`, 0)
  const [q, setQ] = useState('')
  // Passage ouvert depuis la recherche intelligente : mis en vue une fois le texte chargé
  useEffect(() => {
    if (data && focus != null) document.querySelector(`.rec-passages li[data-n="${focus}"]`)?.scrollIntoView({ block: 'center' })
  }, [data, focus])
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  const shown = (data?.passages ?? []).filter((p) => !q.trim() || p.text.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="mms-modal rec-modal" role="dialog" aria-modal="true" aria-label={rec.nom} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mms-modal__box bc-modal">
        <h3 dir="auto">
          {rec.nom} · {i.dateTime(rec.debut)} – {i.time(rec.fin)}
        </h3>
        <div className="rec-modal__bar">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.filter} aria-label={t.filter} dir="auto" />
          <a className="news-btn news-btn--ghost" href={`/api/recordings/${rec.id}/transcript?format=txt&lang=${i.lang}`} download>
            {t.txt}
          </a>
          <a className="news-btn news-btn--ghost" href={`/api/recordings/${rec.id}/transcript?format=srt`} download>
            {t.srt}
          </a>
        </div>
        <p className="ld-hint">≈ {t.approx}</p>
        {error && <p className="news-status news-status--error">{i.t.loadError}</p>}
        {!data && !error && <p className="news-status">{i.t.loading}</p>}
        {data && (
          <ol className="bc-passages rec-passages">
            {shown.map((p) => {
              const n = data.passages.indexOf(p)
              return (
                <li key={n} data-n={n} className={`${q.trim() ? 'is-hit' : ''}${n === focus ? ' is-focus' : ''}`}>
                  <span className="bc-passages__time">≈ {i.time(p.at)}</span>
                  <p dir="auto">
                    <Highlight text={p.text} terms={q.trim() ? [q.trim()] : terms} />
                  </p>
                </li>
              )
            })}
            {shown.length === 0 && <li className="news-status">{t.noHits}</li>}
          </ol>
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

function RecRow({ r, can, onChange, onView, limits }: { r: Rec; can: boolean; onChange: () => void; onView: () => void; limits: Data['limits'] }) {
  const i = useI18n()
  const t = useText()
  const [msg, setMsg] = useState('')
  const minutes = Math.round((Date.parse(r.fin) - Date.parse(r.debut)) / 60_000)
  async function stop() {
    setMsg('')
    const res = await fetch(`/api/recordings/${r.id}/stop`, { method: 'POST' })
    if (!res.ok) setMsg(errorText(t, await res.json().catch(() => ({ error: 'generic' })), limits))
    onChange()
  }
  const active = r.etat === 'en_attente' || r.etat === 'en_cours'
  return (
    <li className={`rec-row is-${r.etat}`}>
      <div className="rec-row__head">
        <MediaIcon name={r.canal === 'radio' ? 'radio' : 'tv'} size={18} />
        <b dir="auto">{r.nom}</b>
        <span className={`rec-state is-${r.etat}`}>{t.states[r.etat]}</span>
        <time>
          {i.dateTime(r.debut)} – {i.time(r.fin)} · {t.min(minutes)}
        </time>
        {(r.rasd?.length ?? 0) > 0 && <span className="rasd-tag">🎯 {t.rasdTag}</span>}
        {r.hits != null && <span className={r.hits ? 'rasd-hits is-on' : 'rasd-hits'}>{t.hitsN(r.hits)}</span>}
        <small className="rec-row__by" dir="ltr">
          {r.par}
        </small>
      </div>
      {(r.etat === 'en_cours' || r.etat === 'transcription') && (
        <div className="rec-row__bars">
          <Bar value={r.enregistrement ?? 0} label={t.recProgress} />
          <Bar value={r.transcription ?? 0} label={t.trProgress} />
        </div>
      )}
      {r.etat === 'echoue' && <VeilleNote raw={r.erreur} className="rec-row__err" />}
      {r.etat === 'en_cours' && <VeilleNote raw={r.avertissement} className="rec-row__warn" />}
      {r.partiel && <VeilleNote raw={r.partiel} className="rec-row__warn" />}
      <div className="rec-row__actions">
        {r.etat === 'termine' && r.texte && (
          <>
            <button type="button" className="news-btn" onClick={onView}>
              {t.view}
            </button>
            <a className="news-btn news-btn--ghost" href={`/api/recordings/${r.id}/transcript?format=txt&lang=${i.lang}`} download>
              {t.txt}
            </a>
            <a className="news-btn news-btn--ghost" href={`/api/recordings/${r.id}/transcript?format=srt`} download>
              {t.srt}
            </a>
          </>
        )}
        {can && active && (
          <button type="button" className="news-btn news-btn--ghost" onClick={stop}>
            {r.etat === 'en_cours' || Date.parse(r.debut) <= Date.now() ? t.stop : t.cancel}
          </button>
        )}
        <small className="rec-row__cost">
          {t.estimate} ≈ {(r.cout || r.estimate).toFixed(3)} $
        </small>
      </div>
      {msg && <p className="news-status news-status--error">{msg}</p>}
    </li>
  )
}

/** Réglage (administrateurs) : part quotidienne du plafond de transcription réservée aux demandes */
function BudgetSplit({ budget, onSaved }: { budget: Data['budget']; onSaved: () => void }) {
  const t = useText()
  const [part, setPart] = useState(String(budget.cap))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const total = budget.total ?? 65 / 31
  const fixed = Math.max(0, total - (Number(part) || 0))
  async function save(e: FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/recordings/budget', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ part: Number(part) }) })
    const json = await res.json().catch(() => ({ error: 'generic' }))
    setMsg(res.ok ? { ok: true, text: t.savedSplit } : { ok: false, text: errorText(t, json) })
    if (res.ok) onSaved()
  }
  return (
    <form className="rec-split" onSubmit={save}>
      <b>{t.split}</b>
      <p className="ld-hint">{t.splitHint(total.toFixed(2))}</p>
      <div className="rec-split__row">
        <label>
          <span>{t.part}</span>
          <input type="number" min={0} max={Number(total.toFixed(2))} step={0.05} value={part} onChange={(e) => setPart(e.target.value)} dir="ltr" />
        </label>
        <span className="rec-split__bar" aria-hidden>
          <i style={{ width: `${Math.min(100, ((Number(part) || 0) / total) * 100)}%` }} />
        </span>
        <button type="submit" className="news-btn news-btn--ghost">
          {t.save}
        </button>
      </div>
      <p className="ld-hint">{t.fixedShare(fixed.toFixed(2), (budget.fixed?.spent ?? 0).toFixed(2))}</p>
      {msg && <p className={msg.ok ? 'news-status' : 'news-status news-status--error'}>{msg.text}</p>}
    </form>
  )
}

/** Programmation et suivi. channel : formulaire limité à cette chaîne (panneau de la chaîne ouverte en grand) */
export function Recordings({ channel }: { channel?: string }) {
  const i = useI18n()
  const t = useText()
  const auth = useAuth()
  const can = canDo(auth?.user, 'tags')
  const [tick, setTick] = useState(0)
  const { data, error } = useFetch<Data>(`/api/recordings?t=${tick}`, 15_000)
  const [form, setForm] = useState(() => ({ chaine: channel ?? '', debut: localValue(Date.now()), fin: localValue(Date.now() + 30 * 60_000) }))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<Rec | null>(null)
  const [tab, setTab] = useState<'record' | 'rasd' | 'search'>('record')
  const [focus, setFocus] = useState<{ n: number; terms: string[] } | null>(null)
  const channels = (data?.channels ?? []).filter((c) => !channel || c.id === channel)
  useEffect(() => {
    if (!form.chaine && channels.length) setForm((f) => ({ ...f, chaine: channels.find((c) => c.recordable)?.id ?? '' }))
  }, [channels, form.chaine])
  const start = fromLocal(form.debut)
  const end = fromLocal(form.fin)
  const minutes = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - Math.max(start, Date.now())) / 60_000)) : 0
  const cost = minutes * (data?.limits.costPerMinute ?? 0.003)
  const preset = (m: number) => {
    const now = Date.now()
    setForm((f) => ({ ...f, debut: localValue(now), fin: localValue(now + m * 60_000) }))
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setBusy(true)
    try {
      const res = await fetch('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chaine: form.chaine, debut: new Date(fromLocal(form.debut)).toISOString(), fin: new Date(fromLocal(form.fin)).toISOString() }),
      })
      const json = await res.json().catch(() => ({ error: 'generic' }))
      setMsg(res.ok ? { ok: true, text: json.merged ? t.merged : t.scheduled } : { ok: false, text: errorText(t, json, data?.limits) })
      setTick((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }
  const items = (data?.items ?? []).filter((r) => !channel || r.chaine === channel)
  return (
    <section className="rec">
      {!channel && (
        <header className="rec__head">
          <h3 className="lw-h">{t.title}</h3>
          <p className="ld-hint">{t.sub}</p>
        </header>
      )}
      {channel && <p className="ld-hint">{t.sub}</p>}
      {!channel && (
        <div className="mms-rtabs ld-tabs" role="tablist">
          {(['record', 'rasd', 'search'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>
              {t.tabs[k]}
            </button>
          ))}
        </div>
      )}
      {error && <p className="news-status news-status--error">{i.t.loadError}</p>}
      {data && tab === 'rasd' && <RasdPanel channels={data.channels} />}
      {data && tab === 'search' && (
        <SmartSearch
          channels={data.channels}
          onOpenRecording={(id, n, terms) => {
            setFocus({ n, terms })
            setView(data.items.find((r) => r.id === id) ?? null)
          }}
        />
      )}
      {data && can && tab === 'record' && (
        <form className="rec-form" onSubmit={submit}>
          {!channel && (
            <label>
              <span>{t.channel}</span>
              <select value={form.chaine} onChange={(e) => setForm({ ...form, chaine: e.target.value })} required>
                {channels.map((c) => (
                  <option key={c.id} value={c.id} disabled={!c.recordable}>
                    {c.canal === 'radio' ? '📻' : '📺'} {c.nom}
                    {c.recordable ? '' : ` — ${t.notRecordable}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>
              {t.start} <small>({t.local})</small>
            </span>
            <input type="datetime-local" value={form.debut} onChange={(e) => setForm({ ...form, debut: e.target.value })} required />
          </label>
          <label>
            <span>
              {t.end} <small>({t.local})</small>
            </span>
            <input type="datetime-local" value={form.fin} onChange={(e) => setForm({ ...form, fin: e.target.value })} required />
          </label>
          <div className="rec-form__presets">
            <small className="rasd-clock">🕒 {t.tripoliNow(localValue(Date.now()).slice(11, 16))}</small>
            <span>{t.now}</span>
            {[15, 30, 60, 120].map((m) => (
              <button key={m} type="button" className="ld-toggle" onClick={() => preset(m)}>
                {t.plus(m)}
              </button>
            ))}
          </div>
          <p className="rec-form__est">
            {t.duration} : <b>{t.min(minutes)}</b> · {t.estimate} : <b>≈ {cost.toFixed(3)} $</b> · {t.remaining(data.budget.remaining.toFixed(2), data.budget.cap.toFixed(2), String(data.budget.hours))}
            {!data.budget.known && <small> — {t.unknownBudget}</small>}
          </p>
          <button type="submit" className="news-btn" disabled={busy || !form.chaine}>
            {t.submit}
          </button>
          {msg && <p className={msg.ok ? 'news-status' : 'news-status news-status--error'}>{msg.text}</p>}
        </form>
      )}
      {data && !can && tab === 'record' && <p className="news-status">{t.readOnly}</p>}
      {data && !channel && tab === 'record' && canDo(auth?.user, 'diffusion') && <BudgetSplit budget={data.budget} onSaved={() => setTick((n) => n + 1)} />}
      {data && tab === 'record' && (
        <>
          <h4 className="rec__list">{t.list}</h4>
          {items.length === 0 ? (
            <p className="news-status">{t.empty}</p>
          ) : (
            <ul className="rec-rows">
              {items.map((r) => (
                <RecRow key={r.id} r={r} can={can} limits={data.limits} onChange={() => setTick((n) => n + 1)} onView={() => setView(r)} />
              ))}
            </ul>
          )}
        </>
      )}
      {view && (
        <TranscriptModal
          rec={view}
          focus={focus?.n}
          terms={focus?.terms}
          onClose={() => {
            setView(null)
            setFocus(null)
          }}
        />
      )}
    </section>
  )
}
