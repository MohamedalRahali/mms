import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'

/**
 * الدعم الفني : petite fenêtre d'aide. Les questions courantes ont une réponse tout de suite (aide de MMS) ; sinon
 * « إرسال إلى الدعم » envoie la conversation à l'équipe technique par e-mail (server/support.js), avec la page,
 * le navigateur et les dernières erreurs de la page (jamais de mot de passe ni de jeton).
 */

type Msg = { from: 'user' | 'bot'; text: string }

// Dernières erreurs de la page (jointes à la demande pour aider le diagnostic)
const pageErrors: string[] = []
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => pageErrors.push(String(e.message || '').slice(0, 200)))
  window.addEventListener('unhandledrejection', (e) => pageErrors.push(String((e.reason && e.reason.message) || e.reason || '').slice(0, 200)))
}

type Faq = { keys: RegExp; ar: string; en: string }
const FAQ: Faq[] = [
  { keys: /2fa|تحقق|خطوتين|authenticator|qr|رمز|code/i, ar: 'التحقق بخطوتين: عند الدخول اضغط « إنشاء المفتاح »، ثم امسح رمز QR بتطبيق Google Authenticator أو Microsoft Authenticator، وأدخل الرمز المكوّن من 6 أرقام ثم « تفعيل ». احتفظ برموز الاسترداد العشرة. إذا فقدت هاتفك يمكن للمسؤول إعادة تعيين التحقق.', en: 'Two-step verification: at sign-in click “Create key”, scan the QR code with Google or Microsoft Authenticator, type the 6-digit code and click “Enable”. Keep the 10 recovery codes. If you lose your phone, an administrator can reset it.' },
  { keys: /تصدير|word|pdf|تنزيل|export|download|excel/i, ar: 'التصدير: في « لوحة الأخبار » استعمل زرَّي « تصدير Word » و« تصدير PDF » بجانب عوامل التصفية؛ الملف يتبع الفترة والتصفية المختارة. ملف PDF يعرض أول 300 خبر وملف Word القائمة كاملة.', en: 'Export: in the News board use “Export Word” and “Export PDF” next to the filters; the file follows the selected period and filters. The PDF shows the first 300 items, the Word file the full list.' },
  { keys: /رصد|watch|تنبيه|alert/i, ar: 'الرصد المبرمج: من القائمة « الرصد المبرمج » أنشئ رصداً (المنطقة، المواضيع، الفترة، المرسَل إليهم). في « إعدادات التنبيه » تختار القنوات والحد الأدنى ودرجة الأهمية والمكلّف، وتتابع التنبيهات في « متابعة التنبيهات ».', en: 'Scheduled watch: from the “Scheduled watch” menu create a watch (area, topics, period, recipients). In “Alert settings” choose channels, threshold, severity and owner; follow alerts in “Alert tracker”.' },
  { keys: /تسجيل|recording|بث|تفريغ|transcri/i, ar: 'التسجيل حسب الطلب: في صفحة « Broadcasts — البث » اختر قناة عليها « ✓ متاح الآن » وفترة محددة. يصل النص المفرغ بعد دقائق من نهاية التسجيل. القنوات عبر يوتيوب قد تكون غير متاحة مؤقتاً.', en: 'On-demand recording: on the “Broadcasts” page pick a channel marked “✓ available now” and a period. The transcript arrives a few minutes after the end. YouTube-based channels may be temporarily unavailable.' },
  { keys: /كلمة المرور|password|صورة|profile|ملف شخصي/i, ar: 'الإعدادات الشخصية: اضغط على اسمك أعلى الصفحة لتغيير الصورة أو الاسم المعروض أو كلمة المرور (10 أحرف على الأقل).', en: 'Personal settings: click your name at the top to change your photo, display name or password (10 characters minimum).' },
  { keys: /تقرير|report|تنفيذي|executive/i, ar: 'التقارير: اختر الأخبار في القائمة (مربع الاختيار) ثم « إنشاء تقرير » من صفحة « التقارير ». التقرير التنفيذي في « التقرير التنفيذي » ويمكن جدولته يومياً أو أسبوعياً.', en: 'Reports: pick news in the list (checkbox) then “Create report” on the Reports page. The executive report is under “Executive report” and can be scheduled daily or weekly.' },
  { keys: /تثبيت|pin|لوحة/i, ar: 'لوحات التثبيت: الزر 📌 على كل خبر يضيفه إلى لوحة؛ من « لوحات التثبيت » تنشئ لوحات ومجموعات وتثبيتاً تلقائياً وتصدر Word أو PDF.', en: 'Pin boards: the 📌 button on each item adds it to a board; from “Pin boards” create boards, groups, auto-pinning and export to Word or PDF.' },
  { keys: /نسبة|%|إحصاء|stat|رقم|أرقام/i, ar: 'الأرقام: « عدد الأخبار » يُحسب دون تكرار (المنشور نفسه أو العنوان نفسه يُعدّ مرة واحدة). النسب تقارن بالمتوسط اليومي للأيام المغطاة، وفوق +100% تُعرض كمضاعف (×2,7).', en: 'Figures: “news count” is without duplicates (same link or title counted once). Percentages compare daily averages of covered days; above +100% they show as a multiplier (×2.7).' },
  { keys: /تصفية|filter|فترة|period|بحث|search/i, ar: 'التصفية: في « لوحة الأخبار » اختر الفترة (أو « فترة محددة… »)، الموضوع، النبرة، المصدر… تظهر عوامل التصفية النشطة كبطاقات يمكن حذفها، وتبقى في رابط الصفحة.', en: 'Filters: in the News board pick the period (or “Custom range…”), topic, tone, source… Active filters show as removable chips and stay in the page address.' },
]

const T = {
  ar: {
    open: 'الدعم الفني',
    title: 'الدعم الفني',
    hello: 'مرحباً، كيف يمكنني مساعدتك؟ اكتب سؤالك، أو صف المشكلة وأرسلها إلى فريق الدعم.',
    placeholder: 'اكتب سؤالك أو المشكلة…',
    ask: 'إرسال',
    noAnswer: 'لم أجد إجابة جاهزة لهذا السؤال. يمكنك إرساله إلى فريق الدعم وسيصلهم فوراً بالبريد الإلكتروني.',
    toSupport: 'إرسال إلى الدعم',
    sent: (id: string) => `تم إرسال طلبك إلى فريق الدعم (رقم ${id}). سيتواصلون معك عبر بريدك الإلكتروني.`,
    notSent: 'تم تسجيل طلبك، لكن تعذّر إرسال البريد الآن؛ سيطّلع عليه فريق الدعم من لوحة الإدارة.',
    tooMany: 'أرسلت عدة طلبات خلال ساعة. أعد المحاولة لاحقاً.',
    failed: 'تعذّر الإرسال. أعد المحاولة.',
    close: 'إغلاق',
  },
  en: {
    open: 'Support',
    title: 'Technical support',
    hello: 'Hello, how can I help? Type your question, or describe the problem and send it to the support team.',
    placeholder: 'Type your question or the problem…',
    ask: 'Send',
    noAnswer: 'I have no ready answer for this. You can send it to the support team; they receive it right away by e-mail.',
    toSupport: 'Send to support',
    sent: (id: string) => `Your request was sent to the support team (no. ${id}). They will reply to your e-mail.`,
    notSent: 'Your request was recorded, but the e-mail could not be sent now; the support team will see it in the admin console.',
    tooMany: 'You sent several requests within an hour. Please try again later.',
    failed: 'Sending failed. Please retry.',
    close: 'Close',
  },
}

export function SupportChat() {
  const i = useI18n()
  const ar = i.lang === 'ar'
  const t = T[ar ? 'ar' : 'en']
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState('')
  const end = useRef<HTMLDivElement>(null)
  // Corps en bloc : les navigateurs récents renvoient une promesse de scrollIntoView, que React prendrait pour un nettoyage
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [msgs, open])

  function ask(e: FormEvent) {
    e.preventDefault()
    const q = draft.trim()
    if (!q) return
    setDraft('')
    const hit = FAQ.find((f) => f.keys.test(q))
    setPending(q)
    setMsgs((m) => [...m, { from: 'user', text: q }, { from: 'bot', text: hit ? (ar ? hit.ar : hit.en) : t.noAnswer }])
  }
  async function send() {
    const message = pending || msgs.filter((m) => m.from === 'user').map((m) => m.text).join('\n')
    if (!message || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversation: msgs, page: location.pathname + location.search, browser: navigator.userAgent, errors: pageErrors.slice(-5) }),
      })
      const j = await res.json().catch(() => ({}))
      const text = res.status === 429 ? t.tooMany : !res.ok ? t.failed : j.ticket?.mail ? t.sent(j.ticket.id) : t.notSent
      setMsgs((m) => [...m, { from: 'bot', text }])
      if (res.ok) setPending('')
    } catch {
      setMsgs((m) => [...m, { from: 'bot', text: t.failed }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="mms-support__tab mms-noprint" onClick={() => setOpen(!open)} aria-expanded={open}>
        🛟 {t.open}
      </button>
      {open && (
        <section className="mms-support" role="dialog" aria-label={t.title} dir={i.dir}>
          <header>
            <strong>{t.title}</strong>
            <button type="button" className="news-btn news-btn--ghost" onClick={() => setOpen(false)} aria-label={t.close}>
              ×
            </button>
          </header>
          <div className="mms-support__msgs">
            <p className="mms-support__msg is-bot">{t.hello}</p>
            {msgs.map((m, k) => (
              <p key={k} className={`mms-support__msg is-${m.from}`} dir="auto">
                {m.text}
              </p>
            ))}
            <div ref={end} />
          </div>
          {msgs.length > 0 && (
            <button type="button" className="news-btn mms-support__send" disabled={busy} onClick={send}>
              {busy ? '…' : `✉ ${t.toSupport}`}
            </button>
          )}
          <form onSubmit={ask} className="mms-support__form">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t.placeholder} aria-label={t.placeholder} maxLength={1500} dir="auto" />
            <button type="submit" className="news-btn">
              {t.ask}
            </button>
          </form>
        </section>
      )}
    </>
  )
}
