import { aiClientDisclosure, aiDisclosure, aiDisclosureMarkdown } from './aiDisclosure.js'

/**
 * ملاحظة الأمان (audit produit v4 constat 10, v6 constat 11) : la note de sécurité d'une page pour les appels
 * d'offres — hébergement, chiffrement, 2FA, IA, rôles, journal d'audit, exports, sauvegardes. Une seule source,
 * servie à l'application client (centre d'aide, tous les comptes : /api/security-note) et à la console Super Admin
 * (/api/superadmin/security-note, fournisseurs d'IA nommés). Téléchargeable en Markdown ou imprimable en PDF.
 * Faits vérifiés seulement (configuration de la plateforme, code, hébergeur) ; l'état des sauvegardes est lu en direct.
 */

export const NOTE_UPDATED = '2026-11-01'

const TEXT = {
  ar: {
    title: 'ملاحظة الأمان',
    intro: 'ملخص من صفحة واحدة لطريقة حماية المنصة وبياناتكم، لملفات طلبات العروض (آخر تحديث: 01/11/2026). وقائع مأخوذة من إعدادات المنصة فقط.',
    file: 'ملاحظة-الأمان-مرصاد.md',
    sections: [
      ['الاستضافة', ['خادم افتراضي خاص (VPS لدى OVH) مخصص للمنصة، بنظام Ubuntu، خلف nginx؛ مركز البيانات في كندا (كيبيك، حسب الموقع الجغرافي لعنوان IP الخادم).', 'النفاذ عبر HTTPS فقط على النطاق mearsaad.com، مع تحويل النطاق القديم.', 'البيانات (الحسابات، الرصد، اللوحات، التسجيلات والتفريغات) تبقى على هذا الخادم؛ لا يُرسل للذكاء الاصطناعي إلا ما يرد في القسم الخاص به.']],
      ['التشفير', ['النقل: TLS (HTTPS) لكل الصفحات وواجهة البرمجة، بشهادة Let’s Encrypt تتجدد تلقائياً.', 'كلمات المرور: بصمة scrypt مملّحة، لا تُحفظ أبداً كنص.', 'روابط المشاركة ومفاتيح الواجهة البرمجية وروابط التفعيل: تُحفظ بصمتها فقط.', 'المفاتيح السرية (الذكاء الاصطناعي، البريد، Telegram): على الخادم فقط، خارج الشيفرة وخارج Git.', 'التخزين: بيانات بصمة الوجه مشفّرة (AES)؛ باقي البيانات على قرص الخادم دون تشفير إضافي على مستوى التطبيق.']],
      ['التحقق بخطوتين', ['رموز TOTP من تطبيق المصادقة مع رموز احتياطية لمرة واحدة، إلزامية لكل الحسابات.', '« تذكرني » غير مفعّل افتراضياً: الجلسة القصيرة هي القاعدة.', 'قفل مؤقت بعد المحاولات الفاشلة، لكل حساب ولكل عنوان IP.']],
      ['الذكاء الاصطناعي', ['يُرسل للذكاء الاصطناعي نص الأخبار المرصودة وسؤال المستخدم، وصوت البث العام للتفريغ فقط، دون كلمات مرور أو بيانات حسابات.', 'لكل استعمال: نوع العرض، شرط عدم التدريب، مدة الاحتفاظ لدى المزوّد ومنطقة المعالجة في الجدول أدناه (يُقرأ من إعدادات الخادم).', 'لا يُقبل أي مفتاح في عرض مجاني: تُنبَّه الإدارة فوراً إن حدث ذلك.', 'حصة 60 طلباً في الساعة لكل حساب.']],
      ['الأدوار والصلاحيات', ['ثلاثة ملفات أساسية: مدير، محلل، قارئ، مع ملفات مخصصة لكل وحدة وزر.', 'تُفحص الصلاحيات على الخادم في كل طلب، وليس في الواجهة فقط.', 'حسابات اسمية لكل شخص، بما في ذلك فريق مزوّد الخدمة؛ الحساب المشترك معطّل (دون حذف) وكل استعمال له يظهر بالأحمر.']],
      ['سجل التدقيق', ['يُسجَّل: الدخول (الناجح والمرفوض)، التسجيلات، النشر على البوابة العامة، الرصد، التصدير والتقارير، الحسابات والصلاحيات، الإعدادات.', 'لكل سطر: التاريخ، الحساب، عنوان IP، العملية، النتيجة؛ دون كلمات مرور أو محتوى.', 'الأسطر مترابطة ببصمات SHA-256: أي تعديل أو حذف يظهر.', 'يطّلع عليه مدير العميل في « سجل التدقيق (اطلاع) » (عناوين IP مقنّعة)، والنسخة الكاملة مع تنزيل CSV في وحدة التحكم العليا.']],
      ['التصدير والنشر', ['التصدير (CSV، PDF، Word) لمن يملك صلاحية « تصدير » فقط، مع حماية ملفات CSV من حقن الصيغ.', 'لا يُرسل أي بريد خارج النطاقات المسموح بها.', 'البوابة العامة: نشر يدوي فقط بعد مراجعة بشرية، بعنوان وملخص معاد صياغتهما ورابط المصدر، مع سجل للنشر.']],
      ['النسخ الاحتياطي', ['نسخة يومية تلقائية من بيانات المنصة (حسابات، صلاحيات، رصد، لوحات، بوابة، سجلات) على الخادم نفسه، تُحفظ 14 يوماً؛ الصوت وصادرات الجمع غير مشمولة (يُعاد بناؤها).', 'أرشيف للشيفرة قبل كل تحديث، وكل إصدار محفوظ في Git.', 'التحديثات لا تمسّ البيانات أبداً.', 'لا توجد بعدُ نسخة خارج الخادم: يُنصح بتفعيل النسخ الاحتياطي الخارجي لدى المستضيف (OVH).']],
    ],
    backups: (b) => (b.count ? `حالة النسخ الآن: ${b.count} نسخة محفوظة، آخرها ${b.newest.replace(/^mms-data-|\.tgz$/g, '')}.` : 'حالة النسخ الآن: لا توجد نسخة بعد.'),
    aiTitle: 'الذكاء الاصطناعي — المعالجة لكل استعمال',
    cols: { offer: 'العرض', noReuse: 'عدم التدريب', retention: 'الاحتفاظ لدى المزوّد', region: 'منطقة المعالجة', terms: 'الشروط الرسمية' },
  },
  en: {
    title: 'Security note',
    intro: 'A one-page summary of how the platform and your data are protected, for tender files (last update: 01/11/2026). Facts taken from the platform configuration only.',
    file: 'Mearsaad-security-note.md',
    sections: [
      ['Hosting', ['A dedicated virtual private server (OVH VPS) running Ubuntu, behind nginx; data centre in Canada (Quebec, from the geolocation of the server IP address).', 'HTTPS only, on mearsaad.com, with the former domain redirected.', 'Data (accounts, watches, dashboards, recordings and transcripts) stays on this server; only what the AI section lists is sent to AI.']],
      ['Encryption', ['Transport: TLS (HTTPS) for every page and the API, with an automatically renewed Let’s Encrypt certificate.', 'Passwords: salted scrypt hash, never stored in clear.', 'Share links, API keys and activation links: only their hash is stored.', 'Secrets (AI, email, Telegram keys): on the server only, outside the code and Git.', 'At rest: face-recognition data is encrypted (AES); other data sits on the server disk without extra application-level encryption.']],
      ['Two-factor authentication', ['TOTP codes from an authenticator app with one-time recovery codes, mandatory for every account.', '« Stay signed in » is unchecked by default: short sessions are the rule.', 'Temporary lock after failed attempts, per account and per IP address.']],
      ['Artificial intelligence', ['Only the monitored news text and the user question, and public broadcast audio for transcription, are sent to AI; never passwords or account data.', 'For each use: offer, no-training clause, retention at the provider and processing region in the table below (read from the server configuration).', 'No free-tier key is accepted: administrators are warned at once if one is detected.', 'Quota of 60 requests per hour per account.']],
      ['Roles and permissions', ['Three base profiles (administrator, analyst, viewer) plus custom profiles per module and button.', 'Permissions are checked on the server for every request, not only in the interface.', 'Named accounts for every person, including the provider team; the shared account is disabled (not deleted) and any use of it shows in red.']],
      ['Audit log', ['Recorded: sign-ins (successful and refused), recordings, public-portal publications, watches, exports and reports, accounts and permissions, settings.', 'Each line: date, account, IP address, action, result; no passwords or content.', 'Lines are chained with SHA-256 hashes: any change or deletion shows.', 'The client administrator reads it under « Audit log (read-only) » (masked IP addresses); the full version with CSV download is in the Super Admin console.']],
      ['Exports and publishing', ['Exports (CSV, PDF, Word) only for profiles with the « export » permission; CSV files are protected against formula injection.', 'No email is ever sent outside the allowed domains.', 'Public portal: manual publishing only, after human review, with a rewritten title and summary and the source link, and a publication log.']],
      ['Backups', ['Automatic daily backup of platform data (accounts, permissions, watches, dashboards, portal, logs) on the same server, kept 14 days; audio and collection exports are not included (they are rebuilt).', 'Code archived before every update, every version kept in Git.', 'Updates never touch the data.', 'There is no off-server copy yet: enabling the host (OVH) off-server backup is recommended.']],
    ],
    backups: (b) => (b.count ? `Backups right now: ${b.count} kept, newest ${b.newest.replace(/^mms-data-|\.tgz$/g, '')}.` : 'Backups right now: none yet.'),
    aiTitle: 'Artificial intelligence — processing per use',
    cols: { offer: 'Offer', noReuse: 'No training', retention: 'Retention at the provider', region: 'Processing region', terms: 'Official terms' },
  },
}

/**
 * Note complète : { lang, title, intro, file, sections, backups, ai, markdown, updated }.
 * mode : « neutral » (application client, sans nom de fournisseur, réglage de la console) ou « named ».
 */
export function securityNote(lang = 'ar', { mode = 'neutral', backups = null, status } = {}) {
  const l = lang === 'en' ? 'en' : 'ar'
  const t = TEXT[l]
  const ai = mode === 'named' ? { ...aiDisclosure(l, status), mode: 'named' } : aiClientDisclosure(l, 'neutral', status)
  const sections = t.sections.map(([h, lines]) => [h, h === t.sections[7][0] && backups ? [...lines, t.backups(backups)] : lines])
  const md = [`# ${t.title}`, '', t.intro, '', ...sections.flatMap(([h, lines]) => [`## ${h}`, ...lines.map((x) => `- ${x}`), ''])]
  if (mode === 'named') md.push(aiDisclosureMarkdown(l, status))
  else {
    md.push(`## ${t.aiTitle}`, '')
    for (const r of ai.rows) {
      md.push(`### ${r.useLabel}`, `- ${t.cols.offer}: ${r.offer}`)
      if (r.noReuse) md.push(`- ${t.cols.noReuse}: ${r.noReuse}`)
      md.push(`- ${t.cols.retention}: ${r.retention}`, `- ${t.cols.region}: ${r.region}`, '')
    }
    md.push(ai.sent, '', ai.named, '', `_${ai.noCert}_`)
  }
  return { lang: l, title: t.title, intro: t.intro, file: t.file, sections, ai, cols: t.cols, aiTitle: t.aiTitle, markdown: md.join('\n'), updated: NOTE_UPDATED }
}
