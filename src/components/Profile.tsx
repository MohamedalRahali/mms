import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'

/**
 * الإعدادات الشخصية : photo de profil (aperçu avant enregistrement, remplacement, suppression), nom affiché,
 * changement de mot de passe, accès à la double authentification. Données : server/profile.js.
 */

const TEXT = {
  ar: {
    title: 'الإعدادات الشخصية',
    photo: 'الصورة الشخصية',
    photoHint: 'PNG أو JPEG أو WebP، 2 ميغابايت كحد أقصى.',
    choose: 'اختيار صورة',
    preview: 'معاينة: احفظ لتطبيقها',
    savePhoto: 'حفظ الصورة',
    removePhoto: 'إزالة الصورة',
    cancel: 'إلغاء',
    name: 'الاسم المعروض',
    saveName: 'حفظ الاسم',
    email: 'البريد الإلكتروني',
    password: 'تغيير كلمة المرور',
    current: 'كلمة المرور الحالية',
    next: 'كلمة المرور الجديدة (10 أحرف على الأقل)',
    repeat: 'تأكيد كلمة المرور الجديدة',
    savePassword: 'تغيير كلمة المرور',
    mismatch: 'كلمتا المرور الجديدتان غير متطابقتين.',
    mfa: 'التحقق بخطوتين',
    mfaOpen: 'إدارة التحقق بخطوتين',
    saved: 'تم الحفظ.',
    pwDone: (n: number) => (n ? `تم تغيير كلمة المرور وأُغلقت ${n} جلسة أخرى.` : 'تم تغيير كلمة المرور.'),
    close: 'إغلاق',
    errors: {
      BAD_TYPE: 'نوع الملف غير مقبول: PNG أو JPEG أو WebP فقط.',
      TOO_BIG: 'الصورة أكبر من 2 ميغابايت.',
      EMPTY: 'الملف فارغ.',
      TOO_MANY: 'محاولات كثيرة: أعد المحاولة لاحقاً.',
      BAD_PASSWORD: 'كلمة المرور الحالية غير صحيحة.',
      TOO_SHORT: 'كلمة المرور الجديدة قصيرة (10 أحرف على الأقل).',
      SAME: 'كلمة المرور الجديدة مطابقة للحالية.',
      WEAK: 'لا يمكن أن تكون كلمة المرور هي اسم المستخدم.',
      NO_NAME: 'أدخل اسماً.',
      generic: 'تعذّرت العملية.',
    } as Record<string, string>,
  },
  en: {
    title: 'Personal settings',
    photo: 'Profile picture',
    photoHint: 'PNG, JPEG or WebP, 2 MB at most.',
    choose: 'Choose a picture',
    preview: 'Preview: save to apply',
    savePhoto: 'Save picture',
    removePhoto: 'Remove picture',
    cancel: 'Cancel',
    name: 'Display name',
    saveName: 'Save name',
    email: 'E-mail',
    password: 'Change password',
    current: 'Current password',
    next: 'New password (10 characters at least)',
    repeat: 'Repeat the new password',
    savePassword: 'Change password',
    mismatch: 'The two new passwords do not match.',
    mfa: 'Two-step verification',
    mfaOpen: 'Manage two-step verification',
    saved: 'Saved.',
    pwDone: (n: number) => (n ? `Password changed; ${n} other session(s) closed.` : 'Password changed.'),
    close: 'Close',
    errors: {
      BAD_TYPE: 'File type not accepted: PNG, JPEG or WebP only.',
      TOO_BIG: 'The picture is larger than 2 MB.',
      EMPTY: 'The file is empty.',
      TOO_MANY: 'Too many attempts: try again later.',
      BAD_PASSWORD: 'The current password is wrong.',
      TOO_SHORT: 'The new password is too short (10 characters at least).',
      SAME: 'The new password is the same as the current one.',
      WEAK: 'The password cannot be the user name.',
      NO_NAME: 'Enter a name.',
      generic: 'The operation failed.',
    } as Record<string, string>,
  },
}

const OK_TYPES = ['image/png', 'image/jpeg', 'image/webp']
type Profile = { email: string; name: string; avatar: string }

/** Pastille de l'utilisateur : sa photo si elle existe, sinon ses initiales (même rendu partout) */
export function Avatar({ src, label, size = 34 }: { src?: string; label: string; size?: number }) {
  if (src) return <img className="mms-user__avatar mms-user__avatar--img" src={src} alt="" width={size} height={size} />
  return (
    <span className="mms-user__avatar" aria-hidden>
      {label}
    </span>
  )
}

export function ProfilePanel({ initials, onClose, onChange, onMfa }: { initials: string; onClose: () => void; onChange: (p: { name?: string; avatar?: string }) => void; onMfa: () => void }) {
  const i = useI18n()
  const t = TEXT[i.lang === 'ar' ? 'ar' : 'en']
  const [p, setP] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string; at: 'photo' | 'name' | 'pw' } | null>(null)
  const [pw, setPw] = useState({ current: '', next: '', repeat: '' })
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setP(d)
        setName(d.name)
      })
  }, [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview])
  const err = async (r: Response) => t.errors[(await r.json().catch(() => ({}))).error] ?? t.errors.generic
  function pick(f: File | undefined) {
    setMsg(null)
    if (!f) return
    // Mêmes règles que le serveur, vérifiées ici d'abord (le serveur vérifie aussi le contenu réel du fichier)
    if (!OK_TYPES.includes(f.type)) return setMsg({ ok: false, text: t.errors.BAD_TYPE, at: 'photo' })
    if (f.size > 2 * 1024 * 1024) return setMsg({ ok: false, text: t.errors.TOO_BIG, at: 'photo' })
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }
  async function savePhoto() {
    if (!file) return
    const r = await fetch('/api/profile/avatar', { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
    if (!r.ok) return setMsg({ ok: false, text: await err(r), at: 'photo' })
    const { avatar } = await r.json()
    setP((x) => (x ? { ...x, avatar } : x))
    setFile(null)
    setPreview('')
    onChange({ avatar })
    setMsg({ ok: true, text: t.saved, at: 'photo' })
  }
  async function removePhoto() {
    const r = await fetch('/api/profile/avatar', { method: 'DELETE' })
    if (!r.ok) return setMsg({ ok: false, text: await err(r), at: 'photo' })
    setP((x) => (x ? { ...x, avatar: '' } : x))
    onChange({ avatar: '' })
    setMsg({ ok: true, text: t.saved, at: 'photo' })
  }
  async function saveName(e: FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!r.ok) return setMsg({ ok: false, text: await err(r), at: 'name' })
    onChange({ name: (await r.json()).name })
    setMsg({ ok: true, text: t.saved, at: 'name' })
  }
  async function savePassword(e: FormEvent) {
    e.preventDefault()
    if (pw.next !== pw.repeat) return setMsg({ ok: false, text: t.mismatch, at: 'pw' })
    const r = await fetch('/api/profile/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: pw.current, next: pw.next }) })
    if (!r.ok) return setMsg({ ok: false, text: await err(r), at: 'pw' })
    setPw({ current: '', next: '', repeat: '' })
    setMsg({ ok: true, text: t.pwDone((await r.json()).closed ?? 0), at: 'pw' })
  }
  const note = (at: 'photo' | 'name' | 'pw') => msg?.at === at && <p className={msg.ok ? 'news-status' : 'news-status news-status--error'}>{msg.text}</p>
  return (
    <div className="mms-modal" role="dialog" aria-modal="true" aria-label={t.title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mms-modal__box prof">
        <h3>{t.title}</h3>
        {!p ? (
          <p className="news-status">{i.t.loading}</p>
        ) : (
          <>
            <section className="prof__section">
              <h4>{t.photo}</h4>
              <div className="prof__photo">
                <Avatar src={preview || p.avatar} label={initials} size={88} />
                <div>
                  <p className="news-status">{preview ? t.preview : t.photoHint}</p>
                  <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
                  <div className="mms-modal__actions">
                    {!preview && (
                      <button type="button" className="news-btn news-btn--ghost" onClick={() => input.current?.click()}>
                        {t.choose}
                      </button>
                    )}
                    {preview && (
                      <>
                        <button type="button" className="news-btn" onClick={savePhoto}>
                          {t.savePhoto}
                        </button>
                        <button
                          type="button"
                          className="news-btn news-btn--ghost"
                          onClick={() => {
                            setFile(null)
                            setPreview('')
                          }}
                        >
                          {t.cancel}
                        </button>
                      </>
                    )}
                    {!preview && p.avatar && (
                      <button type="button" className="news-btn news-btn--ghost" onClick={removePhoto}>
                        {t.removePhoto}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {note('photo')}
            </section>
            <form className="prof__section" onSubmit={saveName}>
              <h4>{t.name}</h4>
              <div className="prof__row">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} dir="auto" aria-label={t.name} required />
                <button type="submit" className="news-btn">
                  {t.saveName}
                </button>
              </div>
              <p className="news-status">
                {t.email} : <span dir="ltr">{p.email}</span>
              </p>
              {note('name')}
            </form>
            <form className="prof__section" onSubmit={savePassword}>
              <h4>{t.password}</h4>
              <label>
                <span>{t.current}</span>
                <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
              </label>
              <label>
                <span>{t.next}</span>
                <input type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
              </label>
              <label>
                <span>{t.repeat}</span>
                <input type="password" autoComplete="new-password" minLength={10} value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} required />
              </label>
              <button type="submit" className="news-btn">
                {t.savePassword}
              </button>
              {note('pw')}
            </form>
            <section className="prof__section">
              <h4>{t.mfa}</h4>
              <button type="button" className="news-btn news-btn--ghost" onClick={onMfa}>
                🔐 {t.mfaOpen}
              </button>
            </section>
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
