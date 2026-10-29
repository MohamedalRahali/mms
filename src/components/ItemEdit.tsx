import { type FormEvent, useContext, useEffect, useState } from 'react'
import { type NewsItem, type Tone, ReloadContext, TONES, useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useIntel } from '../lib/intel'
import { canDo, useAuth } from '../lib/auth'

/**
 * Corrections et ajouts de l'équipe (server/itemEdits.js) : tonalité et thème d'une fiche, approbation pour la vitrine
 * publique d'actualités, et ajout manuel d'un article (source absente de la veille, presse papier…).
 */

const TEXT = {
  ar: {
    edit: 'تصحيح الخبر',
    tone: 'النبرة',
    auto: 'كما حددها الرصد',
    category: 'الموضوع',
    publicLabel: 'نشر في الواجهة العامة للأخبار',
    publicHint: 'لا يظهر في الواجهة العامة إلا ما تتم الموافقة عليه صراحة: العنوان والملخص والمصدر والتاريخ والرابط فقط.',
    save: 'حفظ',
    cancel: 'إلغاء',
    saved: 'تم الحفظ.',
    edited: (by: string) => `صُحِّح بواسطة ${by}`,
    del: 'حذف هذا الخبر اليدوي',
    confirmDel: 'حذف هذا الخبر المضاف يدوياً؟',
    add: 'إضافة خبر يدوياً',
    addTitle: 'إضافة خبر يدوياً',
    date: 'تاريخ النشر',
    source: 'المصدر',
    sourceHint: 'اسم الصحيفة أو الموقع أو القناة',
    title: 'العنوان',
    summary: 'الملخص أو النص',
    url: 'الرابط (اختياري)',
    media: 'نوع الوسيلة',
    medias: { article: 'صحافة مكتوبة أو موقع', broadcast: 'تلفزيون أو إذاعة', podcast: 'بودكاست', blog: 'مدونة', social: 'شبكات التواصل' } as Record<string, string>,
    lang: 'اللغة',
    added: 'أُضيف الخبر. سيظهر في القائمة خلال لحظات.',
    errors: { NO_TITLE: 'أدخل العنوان.', NO_SOURCE: 'أدخل المصدر.', BAD_DATE: 'تاريخ غير صالح.', BAD_URL: 'الرابط يجب أن يبدأ بـ https://', FORBIDDEN: 'غير مسموح.', generic: 'تعذّرت العملية.' } as Record<string, string>,
  },
  en: {
    edit: 'Correct this news',
    tone: 'Tone',
    auto: 'As set by the monitoring',
    category: 'Topic',
    publicLabel: 'Publish on the public news portal',
    publicHint: 'Only explicitly approved news appear on the public portal: title, summary, source, date and link only.',
    save: 'Save',
    cancel: 'Cancel',
    saved: 'Saved.',
    edited: (by: string) => `corrected by ${by}`,
    del: 'Delete this manual news',
    confirmDel: 'Delete this manually added news?',
    add: 'Add news manually',
    addTitle: 'Add news manually',
    date: 'Publication date',
    source: 'Source',
    sourceHint: 'Newspaper, website or channel name',
    title: 'Headline',
    summary: 'Summary or text',
    url: 'Link (optional)',
    media: 'Media type',
    medias: { article: 'Print or website', broadcast: 'TV or radio', podcast: 'Podcast', blog: 'Blog', social: 'Social networks' } as Record<string, string>,
    lang: 'Language',
    added: 'News added. It will appear in the list in a moment.',
    errors: { NO_TITLE: 'Enter the headline.', NO_SOURCE: 'Enter the source.', BAD_DATE: 'Invalid date.', BAD_URL: 'The link must start with https://', FORBIDDEN: 'Not allowed.', generic: 'The operation failed.' } as Record<string, string>,
  },
}
const useText = () => TEXT[useI18n().lang === 'ar' ? 'ar' : 'en']
const CATEGORIES = ['politique', 'économie', 'société', 'international', 'sécurité', 'sport', 'culture', 'santé', 'énergie']
// Champ date-heure en heure de Tripoli (UTC+2), comme les enregistrements
const localValue = (t: number) => new Date(t + 2 * 3_600_000).toISOString().slice(0, 16)

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="mms-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mms-modal__box item-edit">
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

/** Bouton ✎ d'une carte : tonalité, thème, vitrine publique (selon les droits du profil) */
export function EditItemButton({ item }: { item: NewsItem }) {
  const t = useText()
  const i = useI18n()
  const x = useIntel()
  const auth = useAuth()
  const reload = useContext(ReloadContext)
  const canEdit = canDo(auth?.user, 'edit_items')
  const canPublish = canDo(auth?.user, 'publish_public')
  const [open, setOpen] = useState(false)
  const [tone, setTone] = useState<Tone | ''>('')
  const [category, setCategory] = useState(item.category)
  const [pub, setPub] = useState(Boolean(item.public))
  const [msg, setMsg] = useState('')
  if (!canEdit && !canPublish) return null
  async function save(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    const calls: Promise<Response>[] = []
    if (canEdit) calls.push(fetch(`/api/items/${encodeURIComponent(item.id)}/edit`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tone, category: category === item.category && !item.edited ? '' : category }) }))
    if (canPublish && pub !== Boolean(item.public)) calls.push(fetch(`/api/items/${encodeURIComponent(item.id)}/public`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ public: pub }) }))
    const res = await Promise.all(calls)
    const bad = res.find((r) => !r.ok)
    if (bad) return setMsg(t.errors[(await bad.json().catch(() => ({}))).error] ?? t.errors.generic)
    setOpen(false)
    reload?.()
  }
  async function remove() {
    if (!window.confirm(t.confirmDel)) return
    const r = await fetch(`/api/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    if (!r.ok) return setMsg(t.errors[(await r.json().catch(() => ({}))).error] ?? t.errors.generic)
    setOpen(false)
    reload?.()
  }
  return (
    <>
      <button type="button" className={item.public ? 'news-card__fav is-on' : 'news-card__fav'} title={item.public ? `${t.edit} · ${t.publicLabel}` : t.edit} aria-label={t.edit} onClick={() => setOpen(true)}>
        ✎
      </button>
      {open && (
        <Modal title={t.edit} onClose={() => setOpen(false)}>
          <p className="news-status" dir="auto">
            {item.title}
          </p>
          <form className="item-edit__form" onSubmit={save}>
            {canEdit && (
              <>
                <fieldset className="item-edit__tones">
                  <legend>{t.tone}</legend>
                  <label>
                    <input type="radio" name="tone" checked={tone === ''} onChange={() => setTone('')} /> {t.auto}
                    {item.tone ? ` (${x.tones[item.tone as Tone] ?? item.tone})` : ''}
                  </label>
                  {TONES.map((k) => (
                    <label key={k} className={`is-${k}`}>
                      <input type="radio" name="tone" checked={tone === k} onChange={() => setTone(k)} /> {x.tones[k]}
                    </label>
                  ))}
                </fieldset>
                <label>
                  <span>{t.category}</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {[...new Set([item.category, ...CATEGORIES])].map((c) => (
                      <option key={c} value={c}>
                        {i.category(c)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {canPublish && (
              <label className="item-edit__check">
                <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} />
                <span>
                  {t.publicLabel}
                  <small>{t.publicHint}</small>
                </span>
              </label>
            )}
            {item.edited && <p className="news-status">{t.edited(item.edited.by)}</p>}
            <div className="mms-modal__actions">
              <button type="submit" className="news-btn">
                {t.save}
              </button>
              <button type="button" className="news-btn news-btn--ghost" onClick={() => setOpen(false)}>
                {t.cancel}
              </button>
              {item.manual && canEdit && (
                <button type="button" className="news-btn news-btn--ghost" onClick={remove}>
                  {t.del}
                </button>
              )}
            </div>
            {msg && <p className="news-status news-status--error">{msg}</p>}
          </form>
        </Modal>
      )}
    </>
  )
}

/** Bouton « إضافة خبر يدوياً » de la liste des actualités */
export function AddItemButton() {
  const t = useText()
  const i = useI18n()
  const x = useIntel()
  const auth = useAuth()
  const reload = useContext(ReloadContext)
  const sources = useFetch<{ sources?: { name: string }[] }>('/api/news/facets').data?.sources ?? []
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(() => ({ date: localValue(Date.now()), origin: '', title: '', summary: '', url: '', category: 'société', tone: 'neutral', media: 'article', lang: 'ar' }))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (!canDo(auth?.user, 'edit_items')) return null
  async function save(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    const r = await fetch('/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, date: new Date(Date.parse(`${f.date}:00+02:00`)).toISOString() }) })
    if (!r.ok) return setMsg({ ok: false, text: t.errors[(await r.json().catch(() => ({}))).error] ?? t.errors.generic })
    setMsg({ ok: true, text: t.added })
    setF((v) => ({ ...v, title: '', summary: '', url: '' }))
    reload?.()
  }
  return (
    <>
      <button type="button" className="news-btn news-btn--ghost mms-savewatch" onClick={() => setOpen(true)}>
        ＋ {t.add}
      </button>
      {open && (
        <Modal title={t.addTitle} onClose={() => setOpen(false)}>
          <form className="item-edit__form" onSubmit={save}>
            <div className="item-edit__row">
              <label>
                <span>{t.date}</span>
                <input type="datetime-local" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
              </label>
              <label>
                <span>{t.source}</span>
                <input value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })} list="item-sources" placeholder={t.sourceHint} maxLength={120} dir="auto" required />
                <datalist id="item-sources">
                  {sources.map((s) => (
                    <option key={s.name} value={s.name} />
                  ))}
                </datalist>
              </label>
            </div>
            <label>
              <span>{t.title}</span>
              <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={300} dir="auto" required />
            </label>
            <label>
              <span>{t.summary}</span>
              <textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} maxLength={4000} rows={4} dir="auto" />
            </label>
            <label>
              <span>{t.url}</span>
              <input type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" dir="ltr" />
            </label>
            <div className="item-edit__row">
              <label>
                <span>{t.media}</span>
                <select value={f.media} onChange={(e) => setF({ ...f, media: e.target.value })}>
                  {Object.entries(t.medias).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.category}</span>
                <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {i.category(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.tone}</span>
                <select value={f.tone} onChange={(e) => setF({ ...f, tone: e.target.value })}>
                  {TONES.map((k) => (
                    <option key={k} value={k}>
                      {x.tones[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.lang}</span>
                <select value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value })}>
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </label>
            </div>
            <div className="mms-modal__actions">
              <button type="submit" className="news-btn">
                {t.save}
              </button>
              <button type="button" className="news-btn news-btn--ghost" onClick={() => setOpen(false)}>
                {t.cancel}
              </button>
            </div>
            {msg && <p className={msg.ok ? 'news-status' : 'news-status news-status--error'}>{msg.text}</p>}
          </form>
        </Modal>
      )}
    </>
  )
}
