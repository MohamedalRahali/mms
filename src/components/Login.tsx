import { useState, type FormEvent } from 'react'
import { type User } from '../lib/auth'
import { MfaCode } from './Mfa'
import { InstallButton } from './Install'
import { useBrand } from '../lib/brand'

/** Page de connexion selon la charte MMS Radar : panneau de présentation, carte claire de connexion, logo du Centre */

const TEXT = {
  ar: {
    title: 'تسجيل الدخول',
    intro: 'ادخل إلى مساحة الرصد والتحليل الخاصة بك',
    login: 'البريد الإلكتروني أو اسم المستخدم',
    password: 'كلمة المرور',
    show: 'إظهار كلمة المرور',
    hide: 'إخفاء كلمة المرور',
    remember: 'تذكرني على هذا الجهاز',
    forgot: 'نسيت كلمة المرور؟',
    forgotHint: 'اتصل بمسؤول المنصة في المركز الوطني لدعم القرار لإعادة تعيين كلمة المرور.',
    submit: 'تسجيل الدخول',
    busy: 'جارٍ التحقق…',
    errors: {
      BAD_CREDENTIALS: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
      LOCKED: 'محاولات كثيرة غير ناجحة. أعد المحاولة بعد 15 دقيقة.',
      DISABLED: 'تم تعطيل هذا الحساب. اتصل بمسؤول المنصة.',
      MAINTENANCE: 'المنصة قيد الصيانة. أعد المحاولة لاحقًا.',
      BLOCKED: 'الدخول من هذا العنوان أو هذا البلد محظور. اتصل بمسؤول المنصة.',
      BAD_REQUEST: 'البيانات المُدخلة غير صالحة.',
      NETWORK: 'المتصفح لا يصل إلى الخادم. أعد تحميل الصفحة (Ctrl+F5) أو جرّب نافذة خاصة.',
      FAILED: 'تعذّر الاتصال بالخادم. أعد المحاولة.',
    } as Record<string, string>,
    badge: 'رصد · تحليل · قرار',
    heroTitle: ['كل ما يُقال،', 'في مكان واحد'],
    heroText: 'منصة رصد وتحليل إعلامي مخصصة لفريق المركز، تجمع المصادر والتنبيهات والمؤشرات في لوحة واحدة آمنة.',
    stats: [
      ['24/7', 'رصد متواصل'],
      ['AI', 'تحليل ذكي'],
      ['ع · EN', 'واجهة ثنائية اللغة'],
    ],
    secure: 'اتصال آمن · الدخول مخصص للحسابات المعتمدة',
  },
  en: {
    title: 'Sign in',
    intro: 'Access your monitoring and analysis workspace',
    login: 'Email or username',
    password: 'Password',
    show: 'Show password',
    hide: 'Hide password',
    remember: 'Stay signed in on this device',
    forgot: 'Forgot password?',
    forgotHint: 'Contact the platform administrator at the National Decision Support Centre to reset it.',
    submit: 'Sign in',
    busy: 'Checking…',
    errors: {
      BAD_CREDENTIALS: 'Incorrect email or password.',
      LOCKED: 'Too many attempts. Try again in 15 minutes.',
      DISABLED: 'This account has been disabled. Contact the platform administrator.',
      MAINTENANCE: 'The platform is under maintenance. Try again later.',
      BLOCKED: 'Access from this address or country is blocked. Contact the platform administrator.',
      BAD_REQUEST: 'Invalid input.',
      NETWORK: 'Your browser cannot reach the server. Reload the page (Ctrl+F5) or try a private window.',
      FAILED: 'Unable to reach the server. Try again.',
    } as Record<string, string>,
    badge: 'Monitoring · Analysis · Decision',
    heroTitle: ['Everything that is said,', 'in one place'],
    heroText: "A media monitoring and analysis platform built for the Centre's team, bringing sources, alerts and indicators together in one secure dashboard.",
    stats: [
      ['24/7', 'continuous monitoring'],
      ['AI', 'smart analysis'],
      ['ع · EN', 'bilingual interface'],
    ],
    secure: 'Secure connection · access reserved for authorized accounts',
  },
}



export function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const loginBrand = useBrand()
  const [lang, setLang] = useState<'ar' | 'en'>('ar')
  const t = TEXT[lang]
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [visible, setVisible] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Double authentification active sur le compte : deuxième étape (code à 6 chiffres)
  const [ticket, setTicket] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      // Réseau injoignable (fetch rejeté) ≠ réponse du serveur : deux messages distincts (retour client du 30/10)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password, remember }),
      }).catch(() => {
        throw new Error('NETWORK')
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `HTTP_${res.status}`)
      if (json.mfa === 'code' && json.ticket) {
        setTicket(json.ticket)
        setPassword('')
        return
      }
      onLogin(json.user)
    } catch (err) {
      const code = (err as Error).message
      // Code inconnu de cet écran : message générique avec le code, pour le diagnostic
      setError(t.errors[code] ?? `${t.errors.FAILED} (${code})`)
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mms-login" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <section className="mms-login__panel">
        <header className="mms-login__top">
          <span className="mms-login__logo">
            <img src="/logo-cnsd/v2/logo-anime-fond-sombre.svg" alt="رئاسة مجلس الوزراء — المركز الوطني لدعم القرار" />
          </span>
          <div className="mms-login__actions">
            <InstallButton lang={lang} className="mms-login__install" />
            <div className="mms-login__lang" role="group" aria-label="Language">
              <button type="button" className={lang === 'ar' ? 'is-active' : ''} onClick={() => setLang('ar')}>
                العربية
              </button>
              <button type="button" className={lang === 'en' ? 'is-active' : ''} onClick={() => setLang('en')}>
                English
              </button>
            </div>
          </div>
        </header>

        <div className="mms-login__hero">
          <span className="mms-login__badge">{t.badge}</span>
          <h1>
            {t.heroTitle[0]}
            <br />
            <em>{t.heroTitle[1]}</em>
          </h1>
          <p>{t.heroText}</p>
        </div>
        <ul className="mms-login__stats">
          {t.stats.map(([n, l]) => (
            <li key={l}>
              <strong dir="ltr">{n}</strong>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </section>

      <main className="mms-login__main">
        {ticket ? (
          <MfaCode ticket={ticket} lang={lang} onLogin={onLogin} onBack={() => setTicket('')} />
        ) : (
        <form className="mms-login__card" onSubmit={submit}>
          {/* Marque produit « مرصاد — Mearsaad » (carte de connexion claire) */}
          <div className="mms-login__brand">
            <img className="mms-login__mearsaad" src="/brand/mearsaad-light@2x.png" alt="مرصاد — Mearsaad" height={60} />
          </div>
          <h2>{t.title}</h2>
          <p className="mms-login__intro">{t.intro}</p>

          <label className="mms-login__field">
            <span>{t.login}</span>
            <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" dir="ltr" required autoFocus />
          </label>
          <label className="mms-login__field">
            <span>{t.password}</span>
            <span className="mms-login__pw">
              <input
                type={visible ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                dir="ltr"
                required
              />
              <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? t.hide : t.show} title={visible ? t.hide : t.show}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                  <path
                    fill="currentColor"
                    d={
                      visible
                        ? 'M2 4.3L3.3 3l17.7 17.7-1.3 1.3-3.3-3.3c-1.4.6-2.9.8-4.4.8-5 0-9.3-3.1-11-7.5.8-2 2.1-3.7 3.8-5L2 4.3zM12 6.5c5 0 9.3 3.1 11 7.5-.6 1.6-1.6 3-2.8 4.2L16.8 15A5 5 0 0 0 10 8.2L8.3 6.5c1.2-.3 2.4-.5 3.7-.5z'
                        : 'M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'
                    }
                  />
                </svg>
              </button>
            </span>
          </label>

          <div className="mms-login__row">
            <label className="mms-login__remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              {t.remember}
            </label>
            <button type="button" className="mms-login__forgot" onClick={() => setForgot(!forgot)}>
              {t.forgot}
            </button>
          </div>
          {forgot && <p className="mms-login__hint">{t.forgotHint}</p>}
          {error && (
            <p className="mms-login__error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="mms-login__submit" disabled={busy}>
            {busy ? t.busy : t.submit}
          </button>
          <p className="mms-login__secure">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <path fill="currentColor" d="M12 1L4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-4zm-1.5 15L7 12.5l1.4-1.4 2.1 2.1 5.1-5.1L17 9.5 10.5 16z" />
            </svg>
            {t.secure}
          </p>
        </form>
        )}
        {/* Marque blanche (هوية المخرجات) : sans la marque Around */}
        <p className="around-credit">
          {!loginBrand?.whiteLabel && <img src="/around-logo-footer.png" alt="Around Expressions" width={120} height={91} loading="lazy" />}
          <span dir="ltr">© {new Date().getFullYear()} {loginBrand?.whiteLabel ? loginBrand.name || 'MMS' : 'Mearsaad — Copyright by Around Expressions'}</span>
        </p>
      </main>
    </div>
  )
}
