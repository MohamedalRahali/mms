import { useEffect, useState } from 'react'
import { LangToggle } from './AuditLog'
import { api } from './api'

/**
 * ملاحظة الأمان (audit produit v4, constat 10) : la note de sécurité d'une page — hébergement, chiffrement, 2FA, IA,
 * rôles, journal, exports, sauvegardes — lisible dans la console Super Admin (déplacée de l'application client le 30/10) et téléchargeable en fichier texte (même contenu).
 */

type Section = [string, string[]]

export const SECURITY_NOTE: Record<'ar' | 'en', { title: string; intro: string; sections: Section[]; file: string }> = {
  ar: {
    title: 'ملاحظة الأمان',
    intro: 'ملخص من صفحة واحدة لطريقة حماية المنصة وبياناتكم، لملفات طلبات العروض (آخر تحديث: 31/10/2026). وقائع مأخوذة من إعدادات المنصة فقط.',
    file: 'ملاحظة-الأمان-مرصاد.md',
    sections: [
      ['الاستضافة', ['خادم افتراضي خاص (VPS لدى OVH) مخصص للمنصة، بنظام Ubuntu، خلف nginx؛ مركز البيانات في كندا (كيبيك، حسب الموقع الجغرافي لعنوان IP الخادم).', 'النفاذ عبر HTTPS فقط على النطاق mearsaad.com، مع تحويل النطاق القديم.', 'البيانات (الحسابات، الرصد، اللوحات، التسجيلات والتفريغات) تبقى على هذا الخادم.']],
      ['التشفير', ['النقل: TLS (HTTPS) لكل الصفحات وواجهة البرمجة، بشهادة Let’s Encrypt تتجدد تلقائياً.', 'كلمات المرور: بصمة scrypt مملّحة، لا تُحفظ أبداً كنص.', 'روابط المشاركة ومفاتيح الواجهة البرمجية: تُحفظ بصمتها فقط.', 'المفاتيح السرية (الذكاء الاصطناعي، البريد، Telegram): في ملف ‎.env على الخادم، خارج الشيفرة وخارج Git.', 'التخزين: بيانات بصمة الوجه مشفّرة (AES)؛ باقي البيانات على قرص الخادم دون تشفير إضافي على مستوى التطبيق.']],
      ['التحقق بخطوتين', ['رموز TOTP من تطبيق المصادقة مع رموز احتياطية لمرة واحدة، إلزامية لكل الحسابات.', '« تذكرني » غير مفعّل افتراضياً: الجلسة القصيرة هي القاعدة.', 'قفل مؤقت بعد المحاولات الفاشلة، لكل حساب ولكل عنوان IP.']],
      ['الذكاء الاصطناعي', ['يُرسل للذكاء الاصطناعي نص الأخبار المرصودة وسؤال المستخدم فقط، دون كلمات مرور أو بيانات حسابات.', 'المزوّدون الفعليون وعروضهم ومدة الاحتفاظ ومنطقة المعالجة: انظر الجدول أدناه (يُقرأ من إعدادات الخادم).', 'إذا كان مفتاح Gemini في العرض المجاني تُنبَّه الإدارة فوراً في لوحة الإشراف.', 'حصة 60 طلباً في الساعة لكل حساب.']],
      ['الأدوار والصلاحيات', ['ثلاثة ملفات أساسية: مدير، محلل، قارئ، مع ملفات مخصصة لكل وحدة وزر.', 'تُفحص الصلاحيات على الخادم في كل طلب، وليس في الواجهة فقط.', 'حسابات اسمية لكل شخص، بما في ذلك فريق مزوّد الخدمة؛ الحساب المشترك معطّل (دون حذف).']],
      ['سجل التدقيق', ['يُسجَّل: الدخول (الناجح والمرفوض)، التسجيلات، النشر على البوابة العامة، الرصد، التصدير والتقارير، الحسابات والصلاحيات، الإعدادات.', 'لكل سطر: التاريخ، الحساب، عنوان IP، العملية، النتيجة؛ دون كلمات مرور أو محتوى.', 'الأسطر مترابطة ببصمات SHA-256: أي تعديل أو حذف يظهر.', 'يُطّلع عليه في وحدة التحكم العليا (Super Admin) في « سجل التدقيق » ويمكن تنزيله CSV.']],
      ['التصدير والنشر', ['التصدير (CSV، PDF، Word) لمن يملك صلاحية « تصدير » فقط، مع حماية ملفات CSV من حقن الصيغ.', 'لا يُرسل أي بريد خارج النطاقات المسموح بها.', 'البوابة العامة: نشر يدوي فقط بعد مراجعة بشرية، بعنوان وملخص معاد صياغتهما ورابط المصدر، مع سجل للنشر.']],
      ['النسخ الاحتياطي', ['نسخة يومية تلقائية من بيانات المنصة (حسابات، صلاحيات، رصد، لوحات، بوابة، سجلات) على الخادم نفسه، تُحفظ 14 يوماً.', 'أرشيف للشيفرة قبل كل تحديث، وكل إصدار محفوظ في Git.', 'التحديثات لا تمسّ البيانات أبداً.', 'يُنصح بتفعيل النسخ الاحتياطي الخارجي لدى المستضيف (OVH) لنسخة خارج الخادم.']],
    ],
  },
  en: {
    title: 'Security note',
    intro: 'A one-page summary of how the platform and your data are protected, for tender files (last update: 31/10/2026). Facts taken from the platform configuration only.',
    file: 'Mearsaad-security-note.md',
    sections: [
      ['Hosting', ['A dedicated virtual private server (OVH VPS) running Ubuntu, behind nginx; data centre in Canada (Quebec, from the geolocation of the server IP address).', 'HTTPS only, on mearsaad.com, with the former domain redirected.', 'Data (accounts, watches, dashboards, recordings and transcripts) stays on this server.']],
      ['Encryption', ['Transport: TLS (HTTPS) for every page and the API, with an automatically renewed Let’s Encrypt certificate.', 'Passwords: salted scrypt hash, never stored in clear.', 'Share links and API keys: only their hash is stored.', 'Secrets (AI, email, Telegram keys): in the server .env file, outside the code and Git.', 'At rest: face-recognition data is encrypted (AES); other data sits on the server disk without extra application-level encryption.']],
      ['Two-factor authentication', ['TOTP codes from an authenticator app with one-time recovery codes, mandatory for every account.', '« Stay signed in » is unchecked by default: short sessions are the rule.', 'Temporary lock after failed attempts, per account and per IP address.']],
      ['Artificial intelligence', ['Only the monitored news text and the user question are sent to the AI, never passwords or account data.', 'Actual providers, offers, retention and processing region: see the table below (read from the server configuration).', 'If the Gemini key is on the free tier, administrators are warned at once in the supervision console.', 'Quota of 60 requests per hour per account.']],
      ['Roles and permissions', ['Three base profiles (administrator, analyst, viewer) plus custom profiles per module and button.', 'Permissions are checked on the server for every request, not only in the interface.', 'Named accounts for every person, including the provider team; the shared account is disabled (not deleted).']],
      ['Audit log', ['Recorded: sign-ins (successful and refused), recordings, public-portal publications, watches, exports and reports, accounts and permissions, settings.', 'Each line: date, account, IP address, action, result; no passwords or content.', 'Lines are chained with SHA-256 hashes: any change or deletion shows.', 'It is read in the Super Admin console, under « Audit log », and can be downloaded as CSV.']],
      ['Exports and publishing', ['Exports (CSV, PDF, Word) only for profiles with the « export » permission; CSV files are protected against formula injection.', 'No email is ever sent outside the allowed domains.', 'Public portal: manual publishing only, after human review, with a rewritten title and summary and the source link, and a publication log.']],
      ['Backups', ['Automatic daily backup of platform data (accounts, permissions, watches, dashboards, portal, logs) on the same server, kept 14 days.', 'Code archived before every update, every version kept in Git.', 'Updates never touch the data.', 'Enabling the host (OVH) off-server backup is recommended for a copy outside the server.']],
    ],
  },
}

type AiRow = { use: string; useLabel: string; vendor: string; product: string; offer: string; noReuse: string; retention: string; region: string; terms: { label: string; url: string }[] }
type AiDisclosure = { rows: AiRow[]; sent: string; noCert: string; markdown: string }

export function SecurityNote() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar')
  const [ai, setAi] = useState<AiDisclosure | null>(null)
  useEffect(() => {
    api<AiDisclosure>(`/ai-disclosure?lang=${lang}`).then(setAi, () => setAi(null))
  }, [lang])
  const n = SECURITY_NOTE[lang]
  const download = () => {
    const text = [`# ${n.title}`, '', n.intro, '', ...n.sections.flatMap(([h, lines]) => [`## ${h}`, ...lines.map((l) => `- ${l}`), '']), ai?.markdown || ''].join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/markdown;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = n.file
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="sa-card sa-card--wide sa-secnote" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <div className="sa-card__head">
        <h2>{n.title}</h2>
        <span className="sa-row">
          <LangToggle lang={lang} onLang={setLang} />
          <button type="button" className="sa-btn" onClick={download}>
            {lang === 'ar' ? '⬇ تنزيل الملاحظة (Markdown)' : '⬇ Download the note (Markdown)'}
          </button>
          <button type="button" className="sa-btn sa-btn--ghost" onClick={() => window.print()}>
            {lang === 'ar' ? 'طباعة / PDF' : 'Print / PDF'}
          </button>
        </span>
      </div>
      <p className="sa-muted">{n.intro}</p>
      {n.sections.map(([h, lines]) => (
        <div key={h}>
          <h3>{h}</h3>
          <ul>
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ))}
      {ai && (
        <div>
          <h3>{lang === 'ar' ? 'الذكاء الاصطناعي — المزوّدون الفعليون' : 'Artificial intelligence — actual providers'}</h3>
          <ul>
            {ai.rows.map((r) => (
              <li key={r.use}>
                <strong>{r.useLabel}</strong> : {r.vendor} — {r.product} · {r.offer}. {r.noReuse} {r.retention} {lang === 'ar' ? 'المنطقة' : 'Region'}: {r.region}.{' '}
                {r.terms.map((t) => (
                  <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" style={{ marginInlineEnd: '0.5rem' }}>
                    {t.label}
                  </a>
                ))}
              </li>
            ))}
          </ul>
          <p className="sa-muted">{ai.noCert}</p>
        </div>
      )}
    </section>
  )
}
