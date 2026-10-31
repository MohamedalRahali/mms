import { useMemo, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { PageHead } from './Extras'

/**
 * مركز المساعدة (audit produit v4, constat 16) : guide par page, questions fréquentes, dépannage, glossaire et
 * contact, avec une recherche. Remplace les 7 lignes de l'ancienne page d'aide.
 */

type Topic = { q: string; a: string[] }
type Group = { title: string; topics: Topic[] }

const HELP: Record<'ar' | 'en', { intro: string; search: string; none: string; groups: Group[]; links: [string, string][] }> = {
  ar: {
    intro: 'دليل استعمال المنصة صفحة بصفحة، وأجوبة الأسئلة الشائعة، وحلول المشاكل المتكررة.',
    search: 'ابحث في المساعدة (مثال: تصدير، تسجيل، رصد)',
    none: 'لا توجد نتيجة. جرّب كلمة أخرى أو راسل الدعم الفني من زر المحادثة.',
    links: [
      ['?view=watch', 'إنشاء رصد'],
      ['?view=media-broadcast', 'التلفزيون والإذاعة'],
    ],
    groups: [
      {
        title: 'البدء',
        topics: [
          { q: 'الدخول والتحقق بخطوتين', a: ['أدخل البريد وكلمة المرور ثم رمز تطبيق المصادقة.', '« تذكرني » غير مفعّل افتراضياً: فعّله على جهازك الشخصي فقط.', 'فقدت هاتفك؟ استعمل رمزاً احتياطياً أو اطلب من المدير إعادة ضبط التحقق.'] },
          { q: 'التنقل في المنصة', a: ['القائمة الجانبية تجمع الصفحات حسب الاستعمال: الرصد، الوسائط، المراجعات، النشر، المساعدة.', 'Ctrl+K يفتح البحث السريع في كل الصفحات والإعدادات.', 'زر المظهر يبدّل بين الوضع الفاتح والداكن والألوان.'] },
          { q: 'اللغة', a: ['الواجهة بالعربية افتراضياً، مع الإنجليزية من زر اللغة. المحتوى الأجنبي يُترجم إلى العربية.'] },
        ],
      },
      {
        title: 'الصفحات',
        topics: [
          { q: 'لوحات التحكم', a: ['« تعديل اللوحة » ثم « إضافة رسم بياني »: قائمة أخبار، أعمدة، دائرة، منحنى، رقم، جدول، سحابة كلمات.', 'اسحب الرسم من رأسه وغيّر حجمه من الزاوية، ثم « حفظ ». اللوحات مشتركة بين أجهزة الفريق.'] },
          { q: 'الرادار الذكي', a: ['المواضيع الصاعدة، القصص التي تتناقلها عدة مصادر، مؤشر المزاج، والتنبيهات.', 'الأيام والأفعال الشائعة مستبعدة من المواضيع، والموضوع الواحد يظهر مرة واحدة.'] },
          { q: 'لوحة الأخبار والبحث', a: ['بحث منطقي: AND و OR و NOT والأقواس و"العبارات الدقيقة".', 'الأخبار المتشابهة تُجمع في سطر واحد « +N منشورات أخرى »، يُفتح بنقرة.', 'شارة الموثوقية (عالية، متوسطة، غير مؤكد) تظهر على كل خبر.'] },
          { q: 'الرصد المبرمج والتنبيهات', a: ['الرصد يتابع كلمات أو مواضيع ويرسل التنبيه بالبريد أو Telegram.', 'صفحة « التنبيهات » تعرض تنبيهات الرصد المشتركة مع الفريق وكلماتك الخاصة.', 'سجل الإرسال يبيّن عدد المستلمين الفعليين لكل تنبيه، و« لم يُرسل » إذا لم يوجد مستلم.'] },
          { q: 'التلفزيون والإذاعة والتسجيلات', a: ['« تسجيل حسب الطلب »: اختر القناة والفترة؛ يُفرَّغ النص تلقائياً.', 'الرصد المبرمج للبث يبحث في التفريغات عن كلماتك.', 'التسجيلات المرتبطة بتنبيه تُحفظ 90 يوماً، والباقي 3 أيام.'] },
          { q: 'التقارير والمراجعات', a: ['اختر الأخبار بعلامة ✓ ثم « التقارير »: Word أو PDF أو بريد.', 'المراجعة اليومية تجمع الخبر الواحد المكرر في مصادر عدة مرة واحدة مع ذكر المصادر الأخرى.', 'التقرير التنفيذي يعرض خبرين على الأكثر من كل مصدر.'] },
          { q: 'الصحفيون ووسائل الإعلام', a: ['قاعدة الصحفيين والوسائل الليبية مع ما نشروه وما ذُكروا فيه، شهراً بشهر.'] },
          { q: 'البوابة العامة', a: ['النشر يدوي فقط: اختر خبراً من « مقترحة »، أعد صياغة العنوان والملخص، أرفق رابط المصدر، وأكّد المراجعة.', 'لا تُنشر الفيديوهات ولا منشورات الشبكات كاملة. كل عملية مسجلة في « سجل النشر ».'] },
        ],
      },
      {
        title: 'الأسئلة الشائعة',
        topics: [
          { q: 'لماذا لا أرى بعض الصفحات أو الأزرار؟', a: ['الصلاحيات تُحدَّد حسب ملفك (مدير، محلل، قارئ أو ملف مخصص). اطلب من المدير تعديلها.'] },
          { q: 'هل تُستعمل بياناتنا لتدريب الذكاء الاصطناعي؟ ومن هو المزوّد؟', a: ['لا. المحرك الرئيسي Claude عبر واجهة Anthropic البرمجية (عرض تجاري مدفوع)، ومهام الخلفية Gemini عبر واجهة Google المدفوعة (المستوى 1)، وتفريغ صوت الإذاعة والتلفزيون عبر OpenAI API. حسب شروطهم المنشورة، لا يستخدم أيّ منهم بيانات الواجهة البرمجية للتدريب.', 'مدة الاحتفاظ لدى المزوّد: Anthropic ‏30 يوماً على الأكثر، Google ‏55 يوماً لكشف إساءة الاستخدام، OpenAI ‏30 يوماً على الأكثر. المعالجة خارج ليبيا (الولايات المتحدة أساساً)، ويمكن نقل Gemini إلى منطقة ميلانو أو الدمام عبر Google Vertex AI.', 'المحرك المستخدم فعلياً وروابط الشروط الرسمية تظهر في صفحة « التحليل الذكي » (« المزوّدون والشروط »). الإدارة تُنبَّه إذا كان مفتاح ما في عرض مجاني.'] },
          { q: 'من يرى ما أفعله؟', a: ['مديرو المنصة يطّلعون على « سجل التدقيق »: الدخول، التسجيلات، النشر، الرصد، التصدير، الحسابات.'] },
          { q: 'منذ متى البيانات متوفرة؟', a: ['تظهر « بيانات منذ » أعلى الصفحات. استرجاع الأرشيف (حتى 12 شهراً) يتم تدريجياً من أرشيفات الأخبار العامة.'] },
        ],
      },
      {
        title: 'حل المشاكل',
        topics: [
          { q: 'قناة لا تُسجَّل', a: ['قد يكون البث متوقفاً أو مصدره رفض الاتصال؛ تظهر الحالة على صفحة القنوات وتُرسل الإدارة تنبيهاً عند الانقطاع.', 'جرّب قناة أخرى أو فترة لاحقة.'] },
          { q: 'لم يصلني بريد التنبيه', a: ['تحقّق من أن عنوانك ضمن النطاقات المسموح بها، ومن مجلد الرسائل غير المرغوبة، ومن سجل الإرسال.'] },
          { q: 'رسالة « تعذّر » في التحليل الذكي', a: ['أعد المحاولة بعد دقيقة؛ إذا تكرر الأمر راسل الدعم الفني من زر المحادثة مع لقطة الشاشة.'] },
        ],
      },
      {
        title: 'مسرد',
        topics: [
          { q: 'الموثوقية', a: ['عالية: وكالات وجهات رسمية؛ متوسطة: معظم وسائل الإعلام؛ غير مؤكد: منتديات ومدونات وتعليقات. قابلة للتعديل من الإدارة.'] },
          { q: 'الوصول (Reach)', a: ['تقدير لعدد من يمكن أن يرى الخبر حسب القناة، ما لم تُدخل الإدارة رقماً حقيقياً.'] },
          { q: 'الموضوع الدقيق « دولي · … »', a: ['الأخبار الدولية مقسّمة حسب المنطقة: منظمات دولية، المغرب العربي ومصر، أفريقيا والساحل، المشرق والخليج، أوروبا، الأمريكيتان، آسيا.'] },
        ],
      },
    ],
  },
  en: {
    intro: 'How to use the platform page by page, frequent questions and fixes for common problems.',
    search: 'Search help (e.g. export, recording, watch)',
    none: 'No result. Try another word or contact support from the chat button.',
    links: [
      ['?view=watch', 'Create a watch'],
      ['?view=media-broadcast', 'TV & radio'],
    ],
    groups: [
      {
        title: 'Getting started',
        topics: [
          { q: 'Sign-in and two-factor authentication', a: ['Enter your email and password, then the authenticator app code.', '« Stay signed in » is unchecked by default: only enable it on your own device.', 'Lost your phone? Use a recovery code or ask an administrator to reset 2FA.'] },
          { q: 'Getting around', a: ['The side menu groups pages: monitoring, media, reviews, publishing, help.', 'Ctrl+K opens quick search across pages and settings.', 'The appearance button switches light/dark mode and colours.'] },
          { q: 'Language', a: ['Arabic by default, English from the language button. Foreign content is translated into Arabic.'] },
        ],
      },
      {
        title: 'Pages',
        topics: [
          { q: 'Dashboards', a: ['« Edit board » then « Add chart »: news list, bars, pie, line, key figure, table, word cloud.', 'Drag a chart by its header, resize from the corner, then « Save ». Boards are shared across the team.'] },
          { q: 'Smart radar', a: ['Emerging topics, stories picked up by several sources, mood index and alerts.', 'Weekdays and common verbs are excluded from topics; each topic appears once.'] },
          { q: 'News board and search', a: ['Boolean search: AND, OR, NOT, parentheses and "exact phrases".', 'Similar news are grouped in one row « +N more posts », opened with a click.', 'A reliability badge (high, medium, unverified) appears on every item.'] },
          { q: 'Watches and alerts', a: ['A watch follows words or topics and sends alerts by email or Telegram.', 'The « Alerts » page shows team watch alerts and your own keywords.', 'The dispatch log shows the real number of recipients, and « not sent » when there was none.'] },
          { q: 'TV, radio and recordings', a: ['« On-demand recording »: pick the channel and time; the text is transcribed automatically.', 'Broadcast watches search the transcripts for your words.', 'Recordings linked to an alert are kept 90 days, others 3 days.'] },
          { q: 'Reports and reviews', a: ['Tick news with ✓, then « Reports »: Word, PDF or email.', 'The daily review shows a story covered by several sources once, listing the other sources.', 'The executive report shows at most two items per source.'] },
          { q: 'Journalists & media', a: ['Libyan journalists and media with what they published and where they were mentioned, month by month.'] },
          { q: 'Public portal', a: ['Manual publishing only: pick a story in « Suggested », rewrite the title and summary, attach the source link and confirm the review.', 'Videos and social posts are never republished in full. Every action is in the « publication log ».'] },
        ],
      },
      {
        title: 'FAQ',
        topics: [
          { q: 'Why can’t I see some pages or buttons?', a: ['Permissions depend on your profile (administrator, analyst, viewer or custom). Ask an administrator.'] },
          { q: 'Is our data used to train AI? Who is the provider?', a: ['No. The main engine is Claude through the Anthropic API (paid commercial offer), background tasks use Gemini through Google’s paid API (Tier 1), and radio/TV audio is transcribed through the OpenAI API. Under their published terms, none of them trains on API data.', 'Retention at the provider: Anthropic 30 days at most, Google 55 days for abuse monitoring, OpenAI 30 days at most. Processing happens outside Libya (mainly United States); Gemini can be moved to the Milan or Dammam region through Google Vertex AI.', 'The engine actually in use and links to the official terms are shown on the « AI analysis » page (« Providers and terms »). Administrators are warned if a key is on a free tier.'] },
          { q: 'Who can see what I do?', a: ['Platform administrators read the « Audit log »: sign-ins, recordings, publishing, watches, exports, accounts.'] },
          { q: 'Since when is data available?', a: ['« Data since » is shown at the top of pages. Back-filling the archive (up to 12 months) runs gradually from public news archives.'] },
        ],
      },
      {
        title: 'Troubleshooting',
        topics: [
          { q: 'A channel does not record', a: ['The stream may be off air or refusing the connection; its status is on the channels page and administrators are alerted when it cuts.', 'Try another channel or a later time.'] },
          { q: 'I did not receive the alert email', a: ['Check your address is in an allowed domain, your spam folder and the dispatch log.'] },
          { q: '« Failed » message in AI analysis', a: ['Retry after a minute; if it persists, contact support from the chat button with a screenshot.'] },
        ],
      },
      {
        title: 'Glossary',
        topics: [
          { q: 'Reliability', a: ['High: agencies and official bodies; medium: most media; unverified: forums, blogs, comments. Adjustable by administrators.'] },
          { q: 'Reach', a: ['Estimated audience by channel, unless administrators enter a real figure.'] },
          { q: 'Fine topic « International · … »', a: ['International news split by region: international organisations, Maghreb & Egypt, Africa & Sahel, Middle East & Gulf, Europe, Americas, Asia.'] },
        ],
      },
    ],
  },
}

export function HelpCenter() {
  const i = useI18n()
  const h = HELP[i.lang === 'ar' ? 'ar' : 'en']
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return h.groups
    return h.groups.map((g) => ({ ...g, topics: g.topics.filter((t) => `${t.q} ${t.a.join(' ')}`.toLowerCase().includes(needle)) })).filter((g) => g.topics.length)
  }, [h, q])
  return (
    <div className="help-center">
      <PageHead title={i.t.helpTitle} intro={h.intro} />
      <input className="help-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={h.search} dir="auto" />
      <p className="help-links">
        {h.links.map(([href, label]) => (
          <a key={href} className="news-btn news-btn--ghost" href={`/${href}`}>
            {label}
          </a>
        ))}
      </p>
      {groups.length === 0 && <p className="news-status">{h.none}</p>}
      {groups.map((g) => (
        <section key={g.title} className="news-card">
          <h3>{g.title}</h3>
          {g.topics.map((t) => (
            <details key={t.q} open={Boolean(q.trim())}>
              <summary>{t.q}</summary>
              <ul>
                {t.a.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      ))}
    </div>
  )
}

export default HelpCenter
