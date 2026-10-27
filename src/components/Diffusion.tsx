import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { canDo, useAuth } from '../lib/auth'
import './diffusion.css'

/** Chaînes TV et radios de la veille Libye : écoute en direct, et pour les administrateurs l'état et les réglages */

type Chaine = {
  id: string
  nom: string
  canal: 'tv' | 'radio'
  actif: boolean
  creneaux: string[]
  flux?: string
  referer?: string
  youtube?: string
  radio_browser?: string
  origine?: string
  note?: string
  ajout?: boolean
  attente?: boolean
  erreur?: string | null
  dernier_succes?: string | null
  dernier_enregistrement?: string | null
  derniere_transcription?: string | null
  fiches?: number
}
type Etat = { maj: string | null; max: number | null; chaines: Chaine[] }
type Test = { ok: boolean; octets: number; erreur: string }

const TEXT = {
  ar: {
    title: 'البث المباشر',
    sources: 'مصادر البث (إدارة)',
    listen: 'استماع',
    watch: 'مشاهدة',
    stop: 'إيقاف',
    noLive: 'لا توجد قناة برابط بث مباشر قابل للتشغيل.',
    cantPlay: 'تعذّر التشغيل في المتصفح (قد تمنع القناة التشغيل خارج موقعها).',
    openStream: 'فتح رابط البث',
    tv: 'تلفزيون',
    radio: 'إذاعة',
    on: 'مفعّلة',
    off: 'متوقفة',
    error: 'خطأ',
    ok: 'تعمل',
    waiting: 'في الانتظار',
    lastRec: 'آخر تسجيل',
    lastTr: 'آخر تفريغ',
    items: 'أخبار مستخرجة',
    slots: 'أوقات التسجيل',
    slotsHint: 'مثال: 20:00-21:00, 13:00-13:30 (بتوقيت طرابلس)',
    stream: 'رابط البث',
    referer: 'Referer (اختياري)',
    youtube: 'قناة يوتيوب الرسمية للمشاهدة المباشرة (اختياري)',
    source: 'المصدر',
    test: 'اختبار',
    testing: 'جارٍ الاختبار…',
    testOk: (kb: number) => `يعمل (${kb} ك.ب في 6 ثوانٍ)`,
    testKo: 'لا يعمل',
    save: 'حفظ',
    saved: 'تم الحفظ، يُطبَّق خلال دقيقة.',
    remove: 'حذف',
    reset: 'إرجاع الإعدادات الأصلية',
    add: 'إضافة قناة',
    name: 'الاسم',
    kind: 'النوع',
    badInput: 'بيانات غير صالحة (تحقق من الرابط والأوقات).',
    never: '—',
    updated: 'تحديث الحالة',
    max: (n: number) => `حدّ التسجيل المتزامن: ${n}`,
    legal: 'استعمل فقط روابط تنشرها القناة نفسها أو دليلًا عامًا (radio-browser.info).',
  },
  en: {
    title: 'Live',
    sources: 'Broadcast sources (admin)',
    listen: 'Listen',
    watch: 'Watch',
    stop: 'Stop',
    noLive: 'No channel has a playable live stream.',
    cantPlay: 'The browser cannot play this stream (the channel may only allow its own site).',
    openStream: 'Open stream',
    tv: 'TV',
    radio: 'Radio',
    on: 'On',
    off: 'Off',
    error: 'Error',
    ok: 'OK',
    waiting: 'Pending',
    lastRec: 'Last recording',
    lastTr: 'Last transcript',
    items: 'News extracted',
    slots: 'Recording slots',
    slotsHint: 'e.g. 20:00-21:00, 13:00-13:30 (Tripoli time)',
    stream: 'Stream URL',
    referer: 'Referer (optional)',
    youtube: 'Official YouTube channel for the live wall (optional)',
    source: 'Source',
    test: 'Test',
    testing: 'Testing…',
    testOk: (kb: number) => `Works (${kb} KB in 6 s)`,
    testKo: 'Not working',
    save: 'Save',
    saved: 'Saved, applied within a minute.',
    remove: 'Remove',
    reset: 'Reset to defaults',
    add: 'Add channel',
    name: 'Name',
    kind: 'Type',
    badInput: 'Invalid input (check the URL and slots).',
    never: '—',
    updated: 'Status updated',
    max: (n: number) => `Max simultaneous recordings: ${n}`,
    legal: 'Only use streams published by the channel itself or a public directory (radio-browser.info).',
  },
}

const slotsOf = (s: string) =>
  s
    .split(/[,،\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

function Player({ ch, onClose }: { ch: Chaine; onClose: () => void }) {
  const d = TEXT[useI18n().lang]
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  useEffect(() => {
    ref.current?.play().catch(() => {})
  }, [ch.flux])
  const props = { ref, src: ch.flux, controls: true, autoPlay: true, onError: () => setFailed(true) }
  return (
    <div className="dif-player">
      <div className="dif-player__head">
        <b dir="auto">{ch.nom}</b>
        <button type="button" className="news-btn news-btn--ghost" onClick={onClose}>
          {d.stop}
        </button>
      </div>
      {ch.canal === 'tv' ? <video {...props} playsInline /> : <audio {...props} />}
      {failed && (
        <p className="dif-note">
          {d.cantPlay}{' '}
          <a href={ch.flux} target="_blank" rel="noreferrer">
            {d.openStream}
          </a>
        </p>
      )}
    </div>
  )
}

function Row({ ch, onChange }: { ch: Chaine; onChange: () => void }) {
  const i = useI18n()
  const d = TEXT[i.lang]
  const [slots, setSlots] = useState(ch.creneaux.join(', '))
  const [flux, setFlux] = useState(ch.flux || '')
  const [referer, setReferer] = useState(ch.referer || '')
  const [youtube, setYoutube] = useState(ch.youtube || '')
  const [msg, setMsg] = useState('')
  const [test, setTest] = useState<Test | 'busy' | null>(null)
  const when = (iso?: string | null) => (iso ? i.dateTime(iso) : d.never)
  const state = !ch.actif ? 'off' : ch.attente ? 'waiting' : ch.erreur ? 'error' : 'ok'

  async function save(patch: Partial<Chaine>) {
    try {
      await send(`/api/diffusion/${ch.id}`, 'PATCH', patch)
      setMsg(d.saved)
      onChange()
    } catch {
      setMsg(d.badInput)
    }
  }
  async function runTest() {
    setTest('busy')
    try {
      setTest(await send('/api/diffusion/test', 'POST', { flux, referer }))
    } catch {
      setTest({ ok: false, octets: 0, erreur: d.badInput })
    }
  }

  return (
    <tr className={ch.actif ? '' : 'is-off'}>
      <td>
        <b dir="auto">{ch.nom}</b>
        <small>{ch.canal === 'tv' ? d.tv : d.radio}</small>
        {ch.origine && <small dir="auto">{ch.origine}</small>}
        {ch.note && <small className="dif-warn" dir="auto">{ch.note}</small>}
      </td>
      <td>
        <span className={`dif-state dif-state--${state}`}>{d[state]}</span>
        {ch.erreur && (
          <small className="dif-warn" dir="ltr" title={ch.erreur}>
            {ch.erreur.slice(0, 120)}
          </small>
        )}
        <label className="dif-switch">
          <input type="checkbox" checked={ch.actif} onChange={(e) => save({ actif: e.target.checked })} /> {ch.actif ? d.on : d.off}
        </label>
      </td>
      <td>
        <small>
          {d.lastRec} : {when(ch.dernier_enregistrement)}
        </small>
        <small>
          {d.lastTr} : {when(ch.derniere_transcription)}
        </small>
        <small>
          {d.items} : {i.num(ch.fiches || 0)}
        </small>
      </td>
      <td className="dif-edit">
        <input value={slots} onChange={(e) => setSlots(e.target.value)} placeholder={d.slotsHint} aria-label={d.slots} dir="ltr" />
        <input value={flux} onChange={(e) => setFlux(e.target.value)} placeholder={ch.youtube || ch.radio_browser || d.stream} aria-label={d.stream} dir="ltr" />
        <input value={referer} onChange={(e) => setReferer(e.target.value)} placeholder={d.referer} aria-label={d.referer} dir="ltr" />
        <input value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder={d.youtube} aria-label={d.youtube} dir="ltr" />
        <div className="dif-actions">
          <button type="button" className="news-btn news-btn--ghost" disabled={!flux || test === 'busy'} onClick={runTest}>
            {test === 'busy' ? d.testing : d.test}
          </button>
          <button type="button" className="news-btn" onClick={() => save({ creneaux: slotsOf(slots), flux, referer, youtube })}>
            {d.save}
          </button>
          <button
            type="button"
            className="news-btn news-btn--ghost"
            onClick={() => send(`/api/diffusion/${ch.id}`, 'DELETE').then(onChange, () => setMsg(d.badInput))}
          >
            {ch.ajout ? d.remove : d.reset}
          </button>
        </div>
        {test && test !== 'busy' && (
          <small className={test.ok ? 'dif-ok' : 'dif-warn'} dir="auto">
            {test.ok ? d.testOk(Math.round(test.octets / 1024)) : `${d.testKo} : ${test.erreur}`}
          </small>
        )}
        {msg && <small>{msg}</small>}
      </td>
    </tr>
  )
}

function AddForm({ onAdded }: { onAdded: () => void }) {
  const d = TEXT[useI18n().lang]
  const [form, setForm] = useState({ nom: '', canal: 'tv', flux: '', referer: '', creneaux: '' })
  const [msg, setMsg] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await send('/api/diffusion', 'POST', { ...form, creneaux: slotsOf(form.creneaux) })
      setForm({ nom: '', canal: 'tv', flux: '', referer: '', creneaux: '' })
      setMsg(d.saved)
      onAdded()
    } catch {
      setMsg(d.badInput)
    }
  }
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  return (
    <form className="dif-add" onSubmit={submit}>
      <input value={form.nom} onChange={set('nom')} placeholder={d.name} aria-label={d.name} required />
      <select value={form.canal} onChange={set('canal')} aria-label={d.kind}>
        <option value="tv">{d.tv}</option>
        <option value="radio">{d.radio}</option>
      </select>
      <input value={form.flux} onChange={set('flux')} placeholder={d.stream} aria-label={d.stream} dir="ltr" required />
      <input value={form.referer} onChange={set('referer')} placeholder={d.referer} aria-label={d.referer} dir="ltr" />
      <input value={form.creneaux} onChange={set('creneaux')} placeholder={d.slotsHint} aria-label={d.slots} dir="ltr" />
      <button type="submit" className="news-btn">
        {d.add}
      </button>
      {msg && <small>{msg}</small>}
    </form>
  )
}

export function Diffusion() {
  const i = useI18n()
  const d = TEXT[i.lang]
  const auth = useAuth()
  const admin = canDo(auth?.user, 'diffusion')
  const [bump, setBump] = useState(0)
  const { data } = useFetch<Etat>(`/api/diffusion?v=${bump}`, 60_000)
  const [playing, setPlaying] = useState<Chaine | null>(null)
  const [open, setOpen] = useState(false)
  // Un flux qui exige le Referer du site de la chaîne ne se lit pas depuis MMS : il reste enregistré, sans lecteur ici
  const live = (data?.chaines || []).filter((c) => c.actif && c.flux && !c.referer)
  const refresh = () => setBump((n) => n + 1)

  return (
    <section className="dif">
      <div className="dif-live">
        <h3>{d.title}</h3>
        {live.length === 0 && data && <p className="dif-note">{d.noLive}</p>}
        {live.map((c) => (
          <button key={c.id} type="button" className={playing?.id === c.id ? 'dif-chip is-on' : 'dif-chip'} onClick={() => setPlaying(playing?.id === c.id ? null : c)}>
            {c.canal === 'tv' ? '📺' : '📻'} <span dir="auto">{c.nom}</span> · {c.canal === 'tv' ? d.watch : d.listen}
          </button>
        ))}
        {admin && (
          <button type="button" className="news-btn news-btn--ghost dif-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            {d.sources}
          </button>
        )}
      </div>
      {playing && <Player key={playing.id} ch={playing} onClose={() => setPlaying(null)} />}
      {admin && open && data && (
        <div className="dif-admin">
          <p className="dif-note">
            {d.legal} {data.max ? `· ${d.max(data.max)}` : ''} {data.maj ? `· ${d.updated} : ${i.dateTime(data.maj)}` : ''}
          </p>
          <div className="dif-table">
            <table>
              <tbody>
                {data.chaines.map((c) => (
                  <Row key={`${c.id}-${bump}`} ch={c} onChange={refresh} />
                ))}
              </tbody>
            </table>
          </div>
          <AddForm onAdded={refresh} />
        </div>
      )}
    </section>
  )
}
