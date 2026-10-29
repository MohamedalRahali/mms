import { useEffect, useRef, useState } from 'react'

/**
 * التحقق بالوجه : écrans d'inscription et de vérification (server/face.js). La caméra filme en direct ; seules
 * quelques images basse définition (320×240) partent au serveur pour le calcul, puis sont oubliées. Rien n'est
 * gardé dans le navigateur.
 */

export type FaceState = { required: boolean; enrolled: boolean; verified: boolean; lockedUntil: string | null; engine: boolean; exceptionUntil: string | null; soft?: boolean; softUntil?: string | null }
type Lang = 'ar' | 'en'
type Step = 'center' | 'left' | 'right'

const T = {
  ar: {
    enrollTitle: 'تسجيل الوجه',
    verifyTitle: 'التحقق بالوجه',
    why: 'لحماية حسابك ومنع استعماله من شخص آخر، تطلب المنصة التحقق من وجهك عند كل دخول، إضافة إلى كلمة المرور والتحقق بخطوتين.',
    what: 'ما الذي يُحفظ؟ نموذج رقمي مشفّر لوجهك على خادم المنصة فقط، مرتبط بحسابك وحده. لا تُحفظ أي صورة أو فيديو، ولا تُستعمل صورتك الشخصية. يمكنك سحب موافقتك وحذف النموذج في أي وقت من إعدادات حسابك.',
    consent: 'أوافق صراحةً على معالجة صورة وجهي لإنشاء نموذج التحقق واستعماله عند الدخول إلى هذا الحساب.',
    start: 'تشغيل الكاميرا',
    verifyIntro: 'ضع وجهك داخل الإطار واتبع التعليمات. يستغرق التحقق بضع ثوانٍ.',
    steps: { center: 'انظر إلى الكاميرا مباشرة', left: 'أدر رأسك إلى يسارك حتى يصبح السهم أخضر', right: 'أدر رأسك إلى يمينك حتى يصبح السهم أخضر' } as Record<Step, string>,
    checking: 'جارٍ التحقق…',
    okEnroll: 'تم تسجيل وجهك وتفعيل التحقق بالوجه لحسابك.',
    okVerify: 'تم التحقق.',
    retry: 'إعادة المحاولة',
    logout: 'تسجيل الخروج',
    help: 'نصائح: إضاءة أمامية جيدة، وجه مكشوف (دون نظارات شمسية أو قناع)، الكاميرا على مستوى العينين، شخص واحد فقط في الصورة.',
    recovery: 'لا تستطيع إتمام التحقق؟ تواصل مع الدعم الفني أو مسؤول المنصة لمنحك وصولاً مؤقتاً بعد التأكد من هويتك.',
    softNote: (d: string) => `فترة تجريبية حتى ${d}: يمكنك المتابعة الآن وإتمام التحقق لاحقاً. بعد هذا التاريخ يصبح التحقق بالوجه إلزامياً.`,
    later: 'لاحقاً',
    softFail: 'لم يتم التحقق هذه المرة. خلال الفترة التجريبية يمكنك المتابعة، وسيُطلب منك التحقق مجدداً في الدخول القادم.',
    continue: 'متابعة',
    password: 'كلمة المرور (للتأكيد)',
    code: 'رمز التحقق بخطوتين',
    changeNote: 'تغيير الوجه المسجل يتطلب كلمة المرور ورمز التحقق بخطوتين واعتماد مسؤول المنصة.',
    errors: {
      DENIED: 'لم يُسمح باستعمال الكاميرا. اسمح بها من إعدادات المتصفح (رمز القفل بجانب العنوان) ثم أعد المحاولة.',
      NOCAM: 'لم يتم العثور على كاميرا. صِل كاميرا أو استعمل جهازاً مزوداً بكاميرا.',
      BUSY: 'الكاميرا مستعملة من برنامج آخر. أغلقه ثم أعد المحاولة.',
      LOST: 'انقطعت الكاميرا أثناء الالتقاط. تحقق من توصيلها ثم أعد المحاولة.',
      INSECURE: 'الكاميرا تتطلب اتصالاً آمناً (https).',
      NO_FACE: 'لم يظهر وجه في الصورة. ضع وجهك داخل الإطار.',
      MULTI_FACE: 'يظهر أكثر من وجه. يجب أن تكون وحدك أمام الكاميرا.',
      QUALITY: 'الصورة غير واضحة أو مظلمة. حسّن الإضاءة واقترب قليلاً.',
      LIVENESS: 'تعذّر التأكد من أن الوجه حقيقي وحاضر. اتبع حركات الرأس المطلوبة، ولا تستعمل صورة أو شاشة.',
      MISMATCH: 'لم يتم التحقق من الهوية. أعد المحاولة في إضاءة جيدة.',
      LOCKED: 'محاولات كثيرة غير ناجحة. التحقق متوقف مؤقتاً حتى',
      REAUTH: 'للتأكيد، أعد تسجيل الدخول أو أدخل كلمة المرور.',
      REAUTH_2FA: 'رمز التحقق بخطوتين غير صحيح أو مستعمل. أدخل الرمز الحالي من تطبيق المصادقة.',
      APPROVAL: 'تغيير الوجه المسجل يحتاج إلى اعتماد مسؤول المنصة. أُرسل طلبك؛ أعد المحاولة بعد الاعتماد (صالح 24 ساعة).',
      KEY: 'خدمة التحقق بالوجه غير جاهزة بعد. تم إبلاغ مسؤول المنصة.',
      CHALLENGE: 'انتهت مهلة المحاولة. أعد المحاولة.',
      CONSENT: 'الموافقة مطلوبة قبل تسجيل الوجه.',
      ENGINE: 'خدمة التحقق بالوجه غير متاحة حالياً.',
      ENGINE_ERROR: 'عطل تقني في خدمة التحقق بالوجه (ليس خطأ منك، ولم تُحتسب المحاولة). تم إبلاغ المسؤول؛ أعد المحاولة بعد قليل.',
      NOT_ENROLLED: 'لا يوجد وجه مسجل لهذا الحساب.',
      FAILED: 'تعذّر الاتصال بالخادم. أعد المحاولة.',
    } as Record<string, string>,
    panel: 'التحقق بالوجه',
    stateOn: 'مُفعّل لحسابك',
    stateOff: 'غير مسجل',
    reenroll: 'تحديث تسجيل الوجه',
    withdraw: 'سحب الموافقة وحذف نموذج الوجه',
    withdrawn: 'تم حذف نموذج الوجه.',
    close: 'إغلاق',
    exception: 'وصول مؤقت دون تحقق بالوجه حتى',
    notRequired: 'التحقق بالوجه غير مفعّل لحسابك حالياً.',
  },
  en: {
    enrollTitle: 'Face enrollment',
    verifyTitle: 'Face verification',
    why: 'To protect your account and prevent anyone else from using it, the platform verifies your face at each sign-in, in addition to your password and two-step verification.',
    what: 'What is kept? An encrypted digital template of your face, on the platform server only, tied to your account alone. No photo or video is kept, and your profile picture is never used. You can withdraw consent and delete the template at any time from your account settings.',
    consent: 'I explicitly consent to the processing of my face image to create the verification template and use it when signing in to this account.',
    start: 'Turn on camera',
    verifyIntro: 'Place your face inside the frame and follow the instructions. It takes a few seconds.',
    steps: { center: 'Look straight at the camera', left: 'Turn your head to your left until the arrow turns green', right: 'Turn your head to your right until the arrow turns green' } as Record<Step, string>,
    checking: 'Checking…',
    okEnroll: 'Your face is enrolled and face verification is on for your account.',
    okVerify: 'Verified.',
    retry: 'Try again',
    logout: 'Sign out',
    help: 'Tips: good light in front of you, uncovered face (no sunglasses or mask), camera at eye level, only one person in view.',
    recovery: 'Cannot complete verification? Contact technical support or the platform administrator for temporary access after your identity is confirmed.',
    softNote: (d: string) => `Trial period until ${d}: you can continue now and complete verification later. After that date, face verification becomes mandatory.`,
    later: 'Later',
    softFail: 'Verification did not succeed this time. During the trial period you can continue; you will be asked again at your next sign-in.',
    continue: 'Continue',
    password: 'Password (to confirm)',
    code: 'Two-step code',
    changeNote: 'Changing the enrolled face requires your password, a two-step code and approval from the platform administrator.',
    errors: {
      DENIED: 'Camera access was refused. Allow it in the browser settings (lock icon next to the address), then try again.',
      NOCAM: 'No camera found. Connect a camera or use a device that has one.',
      BUSY: 'The camera is used by another program. Close it, then try again.',
      LOST: 'The camera disconnected during capture. Check it, then try again.',
      INSECURE: 'The camera requires a secure connection (https).',
      NO_FACE: 'No face in the picture. Place your face inside the frame.',
      MULTI_FACE: 'More than one face is visible. You must be alone in front of the camera.',
      QUALITY: 'The picture is blurry or dark. Improve the light and come a little closer.',
      LIVENESS: 'Could not confirm a live face. Follow the head movements asked, and do not use a photo or a screen.',
      MISMATCH: 'Identity not verified. Try again in good light.',
      LOCKED: 'Too many unsuccessful attempts. Verification is paused until',
      REAUTH: 'To confirm, sign in again or enter your password.',
      REAUTH_2FA: 'The two-step code is wrong or already used. Enter the current code from your authenticator app.',
      APPROVAL: 'Changing the enrolled face needs approval from the platform administrator. Your request was sent; try again once approved (valid 24 hours).',
      KEY: 'Face verification is not ready yet. The platform administrator has been informed.',
      CHALLENGE: 'The attempt timed out. Try again.',
      CONSENT: 'Consent is required before enrollment.',
      ENGINE: 'Face verification is not available right now.',
      ENGINE_ERROR: 'Technical problem in face verification (not your fault, the attempt was not counted). The administrator has been informed; try again shortly.',
      NOT_ENROLLED: 'No face is enrolled for this account.',
      FAILED: 'Could not reach the server. Try again.',
    } as Record<string, string>,
    panel: 'Face verification',
    stateOn: 'On for your account',
    stateOff: 'Not enrolled',
    reenroll: 'Update face enrollment',
    withdraw: 'Withdraw consent and delete the face template',
    withdrawn: 'The face template was deleted.',
    close: 'Close',
    exception: 'Temporary access without face verification until',
    notRequired: 'Face verification is not on for your account right now.',
  },
}

const W = 320
const H = 240
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Image de la vidéo en RGB brut 320×240 (base64) : aucun format de fichier, rien n'est enregistré */
function grab(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(video, 0, 0, W, H)
  const { data } = ctx.getImageData(0, 0, W, H)
  const rgb = new Uint8Array(W * H * 3)
  for (let i = 0, j = 0; i < data.length; i += 4) {
    rgb[j++] = data[i]
    rgb[j++] = data[i + 1]
    rgb[j++] = data[i + 2]
  }
  let bin = ''
  for (let i = 0; i < rgb.length; i += 0x8000) bin += String.fromCharCode(...rgb.subarray(i, i + 0x8000))
  return btoa(bin)
}

const camError = (e: unknown) => {
  const n = (e as { name?: string })?.name
  if (!window.isSecureContext) return 'INSECURE'
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'DENIED'
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'NOCAM'
  if (n === 'NotReadableError' || n === 'AbortError') return 'BUSY'
  return 'NOCAM'
}

/** Capture guidée : consentement (inscription), caméra, défi de poses tiré par le serveur, envoi */
function Capture({ lang, purpose, password, code, onDone, onSoft }: { lang: Lang; purpose: 'enroll' | 'verify'; password?: string; code?: string; onDone: () => void; onSoft?: () => void }) {
  const t = T[lang]
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [phase, setPhase] = useState<'idle' | 'live' | 'sending' | 'done'>('idle')
  const [instruction, setInstruction] = useState('')
  // Étape en cours et pose atteinte (retour du serveur en direct) : la flèche passe au vert
  const [step, setStep] = useState<Step | null>(null)
  const [reached, setReached] = useState(false)
  const [error, setError] = useState('')
  const [until, setUntil] = useState('')
  // Rodage : l'échec n'a pas bloqué, la personne peut continuer
  const [soft, setSoft] = useState(false)
  const stop = () => {
    stream.current?.getTracks().forEach((tr) => tr.stop())
    stream.current = null
  }
  useEffect(() => stop, [])

  async function run() {
    setError('')
    setUntil('')
    let lost = false
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('x'), { name: window.isSecureContext ? 'NotFoundError' : 'SecurityError' })
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
    } catch (e) {
      setError(camError(e))
      return
    }
    stream.current.getVideoTracks()[0]?.addEventListener('ended', () => (lost = true))
    const v = video.current!
    v.srcObject = stream.current
    await v.play().catch(() => undefined)
    setPhase('live')
    try {
      const ch = await fetch('/api/face/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose }) })
      const c = await ch.json().catch(() => ({}))
      if (!ch.ok) throw Object.assign(new Error(c.error || 'FAILED'), { code: c.error || 'FAILED' })
      const frames: { w: number; h: number; rgb: string; step: string }[] = []
      for (const s of c.steps as Step[]) {
        setStep(s)
        setReached(false)
        setInstruction(t.steps[s])
        await wait(700)
        // Jusqu'à 8 secondes : le serveur dit si la pose demandée est atteinte, l'image retenue est celle-là
        let shot = ''
        const until = Date.now() + 8000
        while (Date.now() < until) {
          if (lost || !stream.current) throw Object.assign(new Error('LOST'), { code: 'LOST' })
          const rgb = grab(v, canvas.current!)
          shot = rgb
          const p = await fetch('/api/face/probe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nonce: c.nonce, frame: { w: W, h: H, rgb } }) })
          const pj = await p.json().catch(() => ({}))
          if (!p.ok && pj.error === 'ENGINE_ERROR') throw Object.assign(new Error('ENGINE_ERROR'), { code: 'ENGINE_ERROR' })
          if (p.ok && pj.faces === 1 && pj.pose === s) {
            setReached(true)
            await wait(350)
            shot = grab(v, canvas.current!)
            break
          }
          await wait(250)
        }
        frames.push({ w: W, h: H, rgb: shot, step: s })
      }
      setStep(null)
      stop()
      setPhase('sending')
      setInstruction(t.checking)
      const res = await fetch(`/api/face/${purpose}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce: c.nonce, frames, ...(purpose === 'enroll' ? { consent: true, password, code } : {}) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok && j.soft) setSoft(true)
      if (!res.ok) throw Object.assign(new Error(j.error || 'FAILED'), { code: j.error || 'FAILED', until: j.until })
      setPhase('done')
      setInstruction(purpose === 'enroll' ? t.okEnroll : t.okVerify)
      setTimeout(onDone, 900)
    } catch (e) {
      stop()
      const err = e as { code?: string; until?: string }
      setError(err.code || 'FAILED')
      setUntil(err.until || '')
      setPhase('idle')
      setInstruction('')
    }
  }

  const fmt = (iso: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-LY' : 'en-GB', { timeStyle: 'short', timeZone: 'Africa/Tripoli' }).format(new Date(iso))
  return (
    <div className="face-capture">
      <div className={`face-capture__frame ${phase === 'live' ? 'is-live' : ''}`}>
        <video ref={video} muted playsInline aria-hidden />
        <span className="face-capture__oval" aria-hidden />
        {step && (
          // Aperçu en miroir : « vers votre gauche » = vers la gauche de l'écran
          <span className={`face-capture__arrow ${reached ? 'is-ok' : ''}`} aria-hidden>
            {step === 'left' ? '←' : step === 'right' ? '→' : '●'}
          </span>
        )}
        {instruction && (
          <p className="face-capture__say" role="status" aria-live="assertive">
            {instruction}
          </p>
        )}
      </div>
      <canvas ref={canvas} width={W} height={H} hidden />
      {error && (
        <p className="news-status news-status--error" role="alert">
          {t.errors[error] ?? t.errors.FAILED}
          {error === 'LOCKED' && until ? ` ${fmt(until)}` : ''}
        </p>
      )}
      {soft && onSoft && (
        <p className="news-status">
          {t.softFail}{' '}
          <button type="button" className="news-btn" onClick={onSoft}>
            {t.continue}
          </button>
        </p>
      )}
      {phase === 'idle' && (
        <button type="button" className="news-btn" onClick={run}>
          {error ? t.retry : t.start}
        </button>
      )}
      <small className="face-capture__help">{t.help}</small>
    </div>
  )
}

/** Écran imposé après mot de passe et double authentification : inscription (avec consentement) ou vérification */
export function FaceRequired({ lang, face, onDone, onLogout }: { lang: Lang; face: FaceState; onDone: () => void; onLogout: () => void }) {
  const t = T[lang]
  const [agreed, setAgreed] = useState(false)
  const enroll = !face.enrolled
  // Rodage : « لاحقاً » (pas de caméra, refus) ; le serveur l'accepte seulement pendant la période
  const later = async (reason: string) => {
    const r = await fetch('/api/face/defer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }).catch(() => null)
    if (r?.ok) onDone()
  }
  const until = face.softUntil ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-LY' : 'en-GB', { dateStyle: 'long', timeZone: 'Africa/Tripoli' }).format(new Date(face.softUntil)) : ''
  return (
    <div className="mms-maintenance mfa-page face-page" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <h1>{enroll ? t.enrollTitle : t.verifyTitle}</h1>
      {face.soft && until && <p className="news-status">{t.softNote(until)}</p>}
      {enroll ? (
        <>
          <p>{t.why}</p>
          <p className="face-page__what">{t.what}</p>
          <label className="face-page__consent">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> {t.consent}
          </label>
          {agreed && <Capture lang={lang} purpose="enroll" onDone={onDone} onSoft={face.soft ? onDone : undefined} />}
        </>
      ) : (
        <>
          <p>{t.verifyIntro}</p>
          <Capture lang={lang} purpose="verify" onDone={onDone} onSoft={face.soft ? onDone : undefined} />
        </>
      )}
      {face.soft && (
        <button type="button" className="news-btn news-btn--ghost" onClick={() => later(enroll && !agreed ? 'consent' : 'later')}>
          {t.later}
        </button>
      )}
      <small>{t.recovery}</small>
      <button type="button" className="news-btn news-btn--ghost" onClick={onLogout}>
        {t.logout}
      </button>
    </div>
  )
}

/** Panneau du compte : état, mise à jour (mot de passe exigé), retrait du consentement */
export function FacePanel({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = T[lang]
  const [state, setState] = useState<FaceState | null>(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [mode, setMode] = useState<'' | 'reenroll'>('')
  const [msg, setMsg] = useState('')
  const load = () =>
    fetch('/api/face/status')
      .then((r) => r.json())
      .then(setState)
      .catch(() => setMsg(t.errors.FAILED))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function withdraw() {
    const res = await fetch('/api/face/withdraw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
    const j = await res.json().catch(() => ({}))
    setMsg(res.ok ? t.withdrawn : (t.errors[j.error] ?? t.errors.FAILED))
    setPassword('')
    load()
  }
  return (
    <div className="mms-modal" role="dialog" aria-modal="true" aria-label={t.panel} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mms-modal__box" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <h2>{t.panel}</h2>
        {state && (
          <p>
            {state.enrolled ? t.stateOn : state.required ? t.stateOff : t.notRequired}
            {state.exceptionUntil ? ` · ${t.exception} ${new Date(state.exceptionUntil).toLocaleString(lang === 'ar' ? 'ar-LY' : 'en-GB')}` : ''}
          </p>
        )}
        {state?.engine && (
          <>
            {state.enrolled && <p className="news-status">{t.changeNote}</p>}
            <div className="mfa-enable">
              <label>
                {t.password}
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </label>
              {state.enrolled && (
                <label>
                  {t.code}
                  <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} dir="ltr" autoComplete="one-time-code" />
                </label>
              )}
            </div>
            <div className="face-panel__actions">
              <button type="button" className="news-btn" disabled={!password || (state.enrolled && code.length !== 6)} onClick={() => setMode('reenroll')}>
                {t.reenroll}
              </button>
              {state.enrolled && (
                <button type="button" className="news-btn news-btn--ghost" disabled={!password} onClick={withdraw}>
                  {t.withdraw}
                </button>
              )}
            </div>
            {mode === 'reenroll' && (
              <Capture
                lang={lang}
                purpose="enroll"
                password={password}
                code={code}
                onDone={() => {
                  setMode('')
                  setPassword('')
                  setCode('')
                  load()
                }}
              />
            )}
          </>
        )}
        {msg && <p className="news-status">{msg}</p>}
        <div className="mms-modal__actions">
          <button type="button" className="news-btn news-btn--ghost" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  )
}
