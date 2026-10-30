import { useI18n } from '../lib/i18n'
import { PageHead } from './Extras'

/**
 * ملاحظة الأمان (audit produit v4, constat 10) : la note de sécurité d'une page — hébergement, chiffrement, 2FA, IA,
 * rôles, journal, exports, sauvegardes — lisible dans l'application et téléchargeable en fichier texte (même contenu).
 */

type Section = [string, string[]]

export const SECURITY_NOTE: Record<'ar' | 'en', { title: string; intro: string; sections: Section[]; file: string }> = {
  ar: {
    title: 'ملاحظة الأمان',
    intro: 'ملخص من صفحة واحدة لطريقة حماية المنصة وبياناتكم (آخر تحديث: 30/10/2026).',
    file: 'ملاحظة-الأمان-MMS.txt',
    sections: [
      ['الاستضافة', ['خادم افتراضي خاص (VPS لدى OVH) مخصص للمنصة، بنظام Ubuntu، خلف nginx.', 'النفاذ عبر HTTPS فقط على النطاق mearsaad.com، مع تحويل النطاق القديم.', 'البيانات (الحسابات، الرصد، اللوحات، التسجيلات والتفريغات) تبقى على هذا الخادم.']],
      ['التشفير', ['النقل: TLS (HTTPS) لكل الصفحات وواجهة البرمجة.', 'كلمات المرور: بصمة scrypt مملّحة، لا تُحفظ أبداً كنص.', 'روابط المشاركة ومفاتيح الواجهة البرمجية: تُحفظ بصمتها فقط.', 'المفاتيح السرية (الذكاء الاصطناعي، البريد، Telegram): في ملف ‎.env على الخادم، خارج الشيفرة وخارج Git.']],
      ['التحقق بخطوتين', ['رموز TOTP من تطبيق المصادقة مع رموز احتياطية لمرة واحدة، إلزامية لكل الحسابات.', '« تذكرني » غير مفعّل افتراضياً: الجلسة القصيرة هي القاعدة.', 'قفل مؤقت بعد المحاولات الفاشلة، لكل حساب ولكل عنوان IP.']],
      ['الذكاء الاصطناعي', ['يُرسل للذكاء الاصطناعي نص الأخبار المرصودة وسؤال المستخدم فقط، دون كلمات مرور أو بيانات حسابات.', 'المحركات المعتمدة لا تعيد استخدام البيانات للتدريب: ‏Claude (Anthropic API)، ‏Gemini عبر Vertex AI أو مفتاح مدفوع، ‏OpenAI API، أو نموذج مستضاف محلياً.', 'إذا كان مفتاح Gemini في العرض المجاني تُنبَّه الإدارة فوراً في لوحة الإشراف.', 'حصة 60 طلباً في الساعة لكل حساب.']],
      ['الأدوار والصلاحيات', ['ثلاثة ملفات أساسية: مدير، محلل، قارئ، مع ملفات مخصصة لكل وحدة وزر.', 'تُفحص الصلاحيات على الخادم في كل طلب، وليس في الواجهة فقط.', 'حسابات اسمية لكل شخص، بما في ذلك فريق مزوّد الخدمة؛ الحساب المشترك معطّل (دون حذف).']],
      ['سجل التدقيق', ['يُسجَّل: الدخول (الناجح والمرفوض)، التسجيلات، النشر على البوابة العامة، الرصد، التصدير والتقارير، الحسابات والصلاحيات، الإعدادات.', 'لكل سطر: التاريخ، الحساب، عنوان IP، العملية، النتيجة؛ دون كلمات مرور أو محتوى.', 'الأسطر مترابطة ببصمات SHA-256: أي تعديل أو حذف يظهر.', 'يطّلع عليه مديرو المنصة في « سجل التدقيق » ويمكن تنزيله CSV.']],
      ['التصدير والنشر', ['التصدير (CSV، PDF، Word) لمن يملك صلاحية « تصدير » فقط، مع حماية ملفات CSV من حقن الصيغ.', 'لا يُرسل أي بريد خارج النطاقات المسموح بها.', 'البوابة العامة: نشر يدوي فقط بعد مراجعة بشرية، بعنوان وملخص معاد صياغتهما ورابط المصدر، مع سجل للنشر.']],
      ['النسخ الاحتياطي', ['نسخة يومية تلقائية من بيانات المنصة على الخادم (14 يوماً).', 'أرشيف للشيفرة قبل كل تحديث، وكل إصدار محفوظ في Git.', 'التحديثات لا تمسّ البيانات أبداً.', 'يُنصح بتفعيل النسخ الاحتياطي الخارجي لدى المستضيف (OVH) لنسخة خارج الخادم.']],
    ],
  },
  en: {
    title: 'Security note',
    intro: 'A one-page summary of how the platform and your data are protected (last update: 30/10/2026).',
    file: 'MMS-security-note.txt',
    sections: [
      ['Hosting', ['A dedicated virtual private server (OVH VPS) running Ubuntu, behind nginx.', 'HTTPS only, on mearsaad.com, with the former domain redirected.', 'Data (accounts, watches, dashboards, recordings and transcripts) stays on this server.']],
      ['Encryption', ['Transport: TLS (HTTPS) for every page and the API.', 'Passwords: salted scrypt hash, never stored in clear.', 'Share links and API keys: only their hash is stored.', 'Secrets (AI, email, Telegram keys): in the server .env file, outside the code and Git.']],
      ['Two-factor authentication', ['TOTP codes from an authenticator app with one-time recovery codes, mandatory for every account.', '« Stay signed in » is unchecked by default: short sessions are the rule.', 'Temporary lock after failed attempts, per account and per IP address.']],
      ['Artificial intelligence', ['Only the monitored news text and the user question are sent to the AI, never passwords or account data.', 'Approved engines do not reuse data for training: Claude (Anthropic API), Gemini through Vertex AI or a paid key, OpenAI API, or a self-hosted model.', 'If the Gemini key is on the free tier, administrators are warned at once in the supervision console.', 'Quota of 60 requests per hour per account.']],
      ['Roles and permissions', ['Three base profiles (administrator, analyst, viewer) plus custom profiles per module and button.', 'Permissions are checked on the server for every request, not only in the interface.', 'Named accounts for every person, including the provider team; the shared account is disabled (not deleted).']],
      ['Audit log', ['Recorded: sign-ins (successful and refused), recordings, public-portal publications, watches, exports and reports, accounts and permissions, settings.', 'Each line: date, account, IP address, action, result; no passwords or content.', 'Lines are chained with SHA-256 hashes: any change or deletion shows.', 'Platform administrators read it in « Audit log » and can download it as CSV.']],
      ['Exports and publishing', ['Exports (CSV, PDF, Word) only for profiles with the « export » permission; CSV files are protected against formula injection.', 'No email is ever sent outside the allowed domains.', 'Public portal: manual publishing only, after human review, with a rewritten title and summary and the source link, and a publication log.']],
      ['Backups', ['Automatic daily backup of platform data on the server (14 days).', 'Code archived before every update, every version kept in Git.', 'Updates never touch the data.', 'Enabling the host (OVH) off-server backup is recommended for a copy outside the server.']],
    ],
  },
}

export function SecurityNote() {
  const i = useI18n()
  const n = SECURITY_NOTE[i.lang === 'ar' ? 'ar' : 'en']
  const download = () => {
    const text = [n.title, n.intro, '', ...n.sections.flatMap(([h, lines]) => [h, ...lines.map((l) => `- ${l}`), ''])].join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = n.file
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <div className="sec-note">
      <PageHead title={n.title} intro={n.intro} />
      <div>
        <button type="button" className="news-btn" onClick={download}>
          {i.lang === 'ar' ? '⬇ تنزيل الملاحظة (ملف نصي)' : '⬇ Download the note (text file)'}
        </button>{' '}
        <button type="button" className="news-btn news-btn--ghost" onClick={() => window.print()}>
          {i.lang === 'ar' ? 'طباعة / PDF' : 'Print / PDF'}
        </button>
      </div>
      {n.sections.map(([h, lines]) => (
        <section key={h} className="news-card">
          <h3>{h}</h3>
          <ul>
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default SecurityNote
