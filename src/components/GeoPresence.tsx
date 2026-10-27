import { useEffect, useState } from 'react'
import { type Tone, TONES } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useIntel } from '../lib/intel'
import { canDo, useAuth } from '../lib/auth'
import { ToneMeter } from './Listing'
import './listing.css'
import './geo.css'
import { LoadState } from './LoadState'

/**
 * الحضور في إجابات الذكاء الاصطناعي : questions du client posées à l'IA configurée dans MMS, réponses gardées,
 * présence et tonalité des entités suivies, historique. Voir server/geo.js.
 */

type Mention = { name: string; count: number; cited: boolean; tone: Tone | ''; inSources?: boolean }
type Run = { id: string; at: string; questionId: string; question: string; answer: string; sources: string[]; mentions: Mention[]; why: string }
type Summary = { name: string; runs: number; cited: number; rate: number; mentions: number; tone: Record<Tone, number>; perDay: { date: string; runs: number; cited: number }[] }
type Settings = { enabled: boolean; schedule: 'off' | 'daily' | 'weekly'; dailyLimit: number; questions: { id: string; text: string }[]; entities: string[] }
type GeoView = { ai: boolean; running: boolean; settings: Settings; today: number; lastScheduled: string | null; summary: Summary[]; runs: Run[] }

const TEXT = {
  ar: {
    title: 'الحضور في إجابات الذكاء الاصطناعي',
    sub: 'نطرح أسئلتكم على الذكاء الاصطناعي المُعدّ في MMS ونقيس هل تُذكر الجهات التي تتابعونها، وكم مرة، وبأي نبرة، مع سجل للتطور.',
    note: 'القياس يخص نموذج الذكاء الاصطناعي المُعدّ في MMS (وليس ChatGPT أو غيره من الخدمات)؛ لا يتم جمع أي بيانات من تلك الخدمات.',
    noKey: 'لا يوجد مفتاح ذكاء اصطناعي مُعدّ على الخادم: يمكنكم تحضير الأسئلة، لكن لا يمكن طرحها الآن.',
    questions: 'الأسئلة',
    qHint: 'سؤال في كل سطر، كما يطرحه الجمهور (30 كحد أقصى)',
    entities: 'الجهات المتابَعة',
    eHint: 'اسم في كل سطر: شخصيات، مؤسسات، وسائل إعلام (40 كحد أقصى)',
    schedule: 'التكرار',
    schedules: { off: 'عند الطلب فقط', daily: 'يومياً', weekly: 'أسبوعياً' },
    limit: 'حد الأسئلة يومياً',
    enabled: 'مفعّل',
    save: 'حفظ الإعدادات',
    saved: 'تم الحفظ.',
    runAll: 'اطرح الأسئلة الآن',
    running: 'جارٍ الطرح…',
    today: (n: number, max: number) => `اليوم: ${n} / ${max} سؤال`,
    presence: 'الحضور خلال 30 يوماً',
    rate: 'نسبة الحضور',
    mentions: 'مرات الذكر',
    answers: 'آخر الإجابات',
    sources: 'المصادر المذكورة',
    cited: 'مذكور',
    absent: 'غير مذكور',
    empty: 'لا توجد إجابات بعد.',
    errors: { NO_KEY: 'لا يوجد مفتاح ذكاء اصطناعي.', DISABLED: 'الميزة معطّلة.', NO_QUESTIONS: 'أضف سؤالاً واحداً على الأقل ثم احفظ.', DAY_LIMIT: 'تم بلوغ الحد اليومي.', BUSY: 'عملية جارية، انتظر قليلاً.', FAILED: 'تعذّر الطرح الآن.' } as Record<string, string>,
    readOnly: 'تعديل الإعدادات وطرح الأسئلة غير متاحين في ملف صلاحياتك.',
  },
  en: {
    title: 'Presence in AI answers',
    sub: 'Your questions are asked to the AI configured in MMS; we measure whether the entities you follow are mentioned, how often and with what tone, with history.',
    note: 'This measures the AI model configured in MMS (not ChatGPT or other services); no data is collected from those services.',
    noKey: 'No AI key is configured on the server: you can prepare questions, but they cannot be asked yet.',
    questions: 'Questions',
    qHint: 'One question per line, as the public would ask it (30 max)',
    entities: 'Followed entities',
    eHint: 'One name per line: people, institutions, media (40 max)',
    schedule: 'Frequency',
    schedules: { off: 'On demand only', daily: 'Daily', weekly: 'Weekly' },
    limit: 'Questions per day',
    enabled: 'Enabled',
    save: 'Save settings',
    saved: 'Saved.',
    runAll: 'Ask the questions now',
    running: 'Asking…',
    today: (n: number, max: number) => `Today: ${n} / ${max} questions`,
    presence: 'Presence over 30 days',
    rate: 'Presence rate',
    mentions: 'Mentions',
    answers: 'Latest answers',
    sources: 'Sources cited',
    cited: 'mentioned',
    absent: 'not mentioned',
    empty: 'No answers yet.',
    errors: { NO_KEY: 'No AI key.', DISABLED: 'The feature is disabled.', NO_QUESTIONS: 'Add at least one question, then save.', DAY_LIMIT: 'Daily limit reached.', BUSY: 'Already running, please wait.', FAILED: 'Could not ask right now.' } as Record<string, string>,
    readOnly: 'Editing settings and asking questions are not enabled for your profile.',
  },
}

function Spark({ rows }: { rows: { date: string; runs: number; cited: number }[] }) {
  if (rows.length < 2) return null
  const w = 120
  const h = 28
  const pts = rows.map((r, k) => `${(k / (rows.length - 1)) * w},${h - (r.runs ? (r.cited / r.runs) * h : 0)}`).join(' ')
  return (
    <svg className="geo-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function GeoPresence() {
  const i = useI18n()
  const x = useIntel()
  const g = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const auth = useAuth()
  const canRun = canDo(auth?.user, 'ai_run')
  const [view, setView] = useState<GeoView | null>(null)
  const [questions, setQuestions] = useState('')
  const [entities, setEntities] = useState('')
  const [form, setForm] = useState<Pick<Settings, 'enabled' | 'schedule' | 'dailyLimit'>>({ enabled: true, schedule: 'off', dailyLimit: 20 })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  function apply(v: GeoView) {
    setView(v)
    setQuestions(v.settings.questions.map((q) => q.text).join('\n'))
    setEntities(v.settings.entities.join('\n'))
    setForm({ enabled: v.settings.enabled, schedule: v.settings.schedule, dailyLimit: v.settings.dailyLimit })
  }
  useEffect(() => {
    fetch('/api/geo')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((v) => apply(v))
      .catch(() => setLoadFailed(true))
  }, [])

  async function save() {
    if (!view) return
    const old = new Map(view.settings.questions.map((q) => [q.text, q.id]))
    const body = {
      ...form,
      questions: questions
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text) => ({ id: old.get(text), text })),
      entities: entities
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean),
    }
    const res = await fetch('/api/geo/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      apply(await res.json())
      setMsg(g.saved)
    } else setMsg(g.errors.FAILED)
  }
  async function run() {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch('/api/geo/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const json = await res.json().catch(() => ({}))
      if (res.ok) apply(json)
      else setMsg(g.errors[json.error] ?? g.errors.FAILED)
    } finally {
      setBusy(false)
    }
  }

  if (!view) return <LoadState error={loadFailed} />
  return (
    <div className="geo">
      <header className="geo__head">
        <h2>{g.title}</h2>
        <p>{g.sub}</p>
        <p className="news-status">{g.note}</p>
        {!view.ai && <p className="mms-note">{g.noKey}</p>}
      </header>

      {canRun ? (
        <section className="geo__settings">
          <label>
            <span>{g.questions}</span>
            <textarea rows={6} value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder={g.qHint} dir="auto" />
          </label>
          <label>
            <span>{g.entities}</span>
            <textarea rows={6} value={entities} onChange={(e) => setEntities(e.target.value)} placeholder={g.eHint} dir="auto" />
          </label>
          <div className="geo__row">
            <label className="geo__inline">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              {g.enabled}
            </label>
            <label className="geo__inline">
              {g.schedule}
              <select value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value as Settings['schedule'] })}>
                {(Object.keys(g.schedules) as Settings['schedule'][]).map((k) => (
                  <option key={k} value={k}>
                    {g.schedules[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="geo__inline">
              {g.limit}
              <input type="number" min={1} max={100} value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) || 1 })} />
            </label>
            <button type="button" className="news-btn news-btn--ghost" onClick={save}>
              {g.save}
            </button>
            <button type="button" className="news-btn" onClick={run} disabled={busy || !view.ai || !form.enabled}>
              {busy ? g.running : g.runAll}
            </button>
            <span className="news-status">{g.today(view.today, view.settings.dailyLimit)}</span>
          </div>
          {msg && (
            <p className="news-status" role="status">
              {msg}
            </p>
          )}
        </section>
      ) : (
        <p className="mms-note">{g.readOnly}</p>
      )}

      <section>
        <h3>{g.presence}</h3>
        <div className="geo__cards">
          {view.summary.map((s) => {
            const sum = TONES.reduce((n, t) => n + s.tone[t], 0)
            return (
              <article key={s.name} className="geo__card">
                <h4 dir="auto">{s.name}</h4>
                <p className="geo__rate">
                  <b>{s.rate}%</b> <small>{g.rate}</small>
                </p>
                <p className="geo__meta">
                  {g.mentions}: {i.num(s.mentions)} · {i.num(s.cited)}/{i.num(s.runs)}
                </p>
                {sum > 0 && <ToneMeter tone={s.tone} sentiment={Math.round(((s.tone.positive - s.tone.negative) / sum) * 100)} />}
                <Spark rows={s.perDay} />
              </article>
            )
          })}
        </div>
      </section>

      <section>
        <h3>{g.answers}</h3>
        {!view.runs.length && <p className="news-status">{g.empty}</p>}
        {view.runs.map((r) => (
          <details key={r.id} className="geo__run">
            <summary>
              <span dir="auto">{r.question}</span>
              <time>{i.dateTime(r.at)}</time>
              <span className="geo__chips">
                {r.mentions.map((m) => (
                  <span key={m.name} className={m.cited ? `geo__chip is-on is-${m.tone}` : 'geo__chip'} title={m.cited ? `${g.cited} · ${m.tone ? x.tones[m.tone] : ''}` : g.absent}>
                    {m.cited ? '●' : '○'} {m.name}
                  </span>
                ))}
              </span>
            </summary>
            <p className="geo__answer" dir="auto">
              {r.answer}
            </p>
            {r.sources.length > 0 && (
              <p className="news-status">
                {g.sources}: {r.sources.join(' · ')}
              </p>
            )}
          </details>
        ))}
      </section>
    </div>
  )
}
