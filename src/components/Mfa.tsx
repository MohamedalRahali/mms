import { type FormEvent, useState } from 'react'
import { type User } from '../lib/auth'
import '../components/listing.css'

/**
 * Double authentification (التحقق بخطوتين) : deuxième étape de la connexion, activation (clé à saisir dans
 * l'application d'authentification, ou lien otpauth:// sur téléphone), codes de secours, désactivation.
 */

export type MfaState = { enabled: boolean; required: boolean; setup: boolean; recoveryLeft: number }

const TEXT = {
  ar: {
    codeTitle: 'رمز التحقق',
    codeIntro: 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة، أو أحد رموز الاسترداد.',
    code: 'الرمز',
    verify: 'تحقق',
    back: 'رجوع',
    errors: { BAD_CODE: 'الرمز غير صحيح.', EXPIRED: 'انتهت المهلة، أعد تسجيل الدخول.', FAILED: 'تعذّر التحقق.' } as Record<string, string>,
    setupTitle: 'تفعيل التحقق بخطوتين',
    setupRequired: 'التحقق بخطوتين إلزامي لحسابك. فعّله الآن للمتابعة (دقيقة واحدة).',
    step1: '1. ثبّت تطبيق مصادقة على هاتفك (Google Authenticator أو Microsoft Authenticator أو FreeOTP).',
    step2: '2. أضف حساباً بإدخال هذا المفتاح يدوياً، أو افتح الرابط من الهاتف:',
    step3: '3. أدخل الرمز الذي يظهر في التطبيق:',
    start: 'إنشاء المفتاح',
    openApp: 'فتح في تطبيق المصادقة',
    enable: 'تفعيل',
    recoveryTitle: 'رموز الاسترداد',
    recoveryIntro: 'احفظ هذه الرموز في مكان آمن: كل رمز يُستعمل مرة واحدة إذا فقدت هاتفك. لن تظهر مرة أخرى.',
    copy: 'نسخ الرموز',
    done: 'تم، متابعة',
    logout: 'تسجيل الخروج',
    panelTitle: 'التحقق بخطوتين',
    on: (n: number) => `مفعّل · ${n} رمز استرداد متبقٍ`,
    off: 'غير مفعّل',
    required: 'إلزامي لحسابك',
    disable: 'إيقاف',
    disableIntro: 'أدخل رمزاً من التطبيق لإيقاف التحقق بخطوتين.',
    close: 'إغلاق',
  },
  en: {
    codeTitle: 'Verification code',
    codeIntro: 'Enter the 6-digit code from your authenticator app, or one of your recovery codes.',
    code: 'Code',
    verify: 'Verify',
    back: 'Back',
    errors: { BAD_CODE: 'Incorrect code.', EXPIRED: 'Timed out, please sign in again.', FAILED: 'Verification failed.' } as Record<string, string>,
    setupTitle: 'Turn on two-step verification',
    setupRequired: 'Two-step verification is required for your account. Turn it on now to continue (one minute).',
    step1: '1. Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or FreeOTP).',
    step2: '2. Add an account by typing this key, or open the link on the phone:',
    step3: '3. Enter the code shown in the app:',
    start: 'Create the key',
    openApp: 'Open in authenticator app',
    enable: 'Turn on',
    recoveryTitle: 'Recovery codes',
    recoveryIntro: 'Keep these codes somewhere safe: each one works once if you lose your phone. They will not be shown again.',
    copy: 'Copy codes',
    done: 'Done, continue',
    logout: 'Log out',
    panelTitle: 'Two-step verification',
    on: (n: number) => `On · ${n} recovery codes left`,
    off: 'Off',
    required: 'Required for your account',
    disable: 'Turn off',
    disableIntro: 'Enter a code from the app to turn off two-step verification.',
    close: 'Close',
  },
}

const textOf = (lang: string) => TEXT[lang === 'en' ? 'en' : 'ar']

/** Deuxième étape de la connexion */
export function MfaCode({ ticket, lang, onLogin, onBack }: { ticket: string; lang: 'ar' | 'en'; onLogin: (u: User) => void; onBack: () => void }) {
  const t = textOf(lang)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/auth/mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, code: code.trim() }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'FAILED')
      onLogin(json.user)
    } catch (err) {
      const c = (err as Error).message
      setError(t.errors[c] ?? t.errors.FAILED)
      setCode('')
      if (c === 'EXPIRED') setTimeout(onBack, 1500)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="mms-login__card" onSubmit={submit}>
      <h2>{t.codeTitle}</h2>
      <p className="mms-login__hint">{t.codeIntro}</p>
      <label className="mms-login__field">
        <span>{t.code}</span>
        <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={20} dir="ltr" required />
      </label>
      {error && (
        <p className="mms-login__error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="mms-login__submit" disabled={busy}>
        {t.verify}
      </button>
      <button type="button" className="news-btn news-btn--ghost" onClick={onBack}>
        {t.back}
      </button>
    </form>
  )
}

/** Activation : clé, code de confirmation, puis codes de secours (montrés une fois) */
export function MfaEnroll({ lang, onDone }: { lang: 'ar' | 'en'; onDone: (mfa: MfaState) => void }) {
  const t = textOf(lang)
  const [key, setKey] = useState<{ secret: string; uri: string } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [state, setState] = useState<MfaState | null>(null)
  async function start() {
    setError('')
    const res = await fetch('/api/auth/mfa/setup', { method: 'POST' })
    if (res.ok) setKey(await res.json())
    else setError(t.errors.FAILED)
  }
  async function enable(e: FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/auth/mfa/enable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return setError(t.errors[json.error] ?? t.errors.FAILED)
    setCodes(json.recovery)
    setState(json.mfa)
  }
  if (codes)
    return (
      <div className="mfa-box">
        <h3>{t.recoveryTitle}</h3>
        <p>{t.recoveryIntro}</p>
        <ol className="mfa-codes" dir="ltr">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <div className="mms-modal__actions">
          <button type="button" className="news-btn news-btn--ghost" onClick={() => navigator.clipboard?.writeText(codes.join('\n')).catch(() => {})}>
            {t.copy}
          </button>
          <button type="button" className="news-btn" onClick={() => state && onDone(state)}>
            {t.done}
          </button>
        </div>
      </div>
    )
  return (
    <div className="mfa-box">
      <p>{t.step1}</p>
      {!key ? (
        <button type="button" className="news-btn" onClick={start}>
          {t.start}
        </button>
      ) : (
        <>
          <p>{t.step2}</p>
          <p className="mfa-key" dir="ltr">
            {key.secret.replace(/(.{4})/g, '$1 ').trim()}
          </p>
          <a className="news-btn news-btn--ghost" href={key.uri}>
            {t.openApp}
          </a>
          <form onSubmit={enable} className="mfa-enable">
            <label>
              <span>{t.step3}</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" required />
            </label>
            <button type="submit" className="news-btn">
              {t.enable}
            </button>
          </form>
        </>
      )}
      {error && (
        <p className="news-status news-status--error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Écran imposé quand la double authentification est obligatoire pour le compte mais pas encore activée */
export function MfaRequired({ lang, onDone, onLogout }: { lang: 'ar' | 'en'; onDone: (mfa: MfaState) => void; onLogout: () => void }) {
  const t = textOf(lang)
  return (
    <div className="mms-maintenance mfa-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <h1>{t.setupTitle}</h1>
      <p>{t.setupRequired}</p>
      <MfaEnroll lang={lang} onDone={onDone} />
      <button type="button" className="news-btn news-btn--ghost" onClick={onLogout}>
        {t.logout}
      </button>
    </div>
  )
}

/** Panneau du compte : état, activation, désactivation (si la règle le permet) */
export function MfaPanel({ lang, mfa, onChange, onClose }: { lang: 'ar' | 'en'; mfa: MfaState; onChange: (m: MfaState) => void; onClose: () => void }) {
  const t = textOf(lang)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  async function disable(e: FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth/mfa/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return setError(t.errors[json.error] ?? t.errors.FAILED)
    onChange(json.mfa)
  }
  return (
    <div className="mms-modal" role="dialog" aria-modal="true" aria-label={t.panelTitle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mms-modal__box" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <h3>{t.panelTitle}</h3>
        <p className="news-status">
          {mfa.enabled ? t.on(mfa.recoveryLeft) : t.off}
          {mfa.required && ` · ${t.required}`}
        </p>
        {!mfa.enabled && <MfaEnroll lang={lang} onDone={onChange} />}
        {mfa.enabled && !mfa.required && (
          <form onSubmit={disable} className="mfa-enable">
            <label>
              <span>{t.disableIntro}</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} dir="ltr" required />
            </label>
            <button type="submit" className="news-btn news-btn--ghost">
              {t.disable}
            </button>
          </form>
        )}
        {error && <p className="news-status news-status--error">{error}</p>}
        <div className="mms-modal__actions">
          <button type="button" className="news-btn news-btn--ghost" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  )
}
