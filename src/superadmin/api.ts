/** Appels à l'API de la console Super Admin (cookie limité à /api/superadmin) */

export class ApiError extends Error {
  status: number
  constructor(code: string, status: number) {
    super(code)
    this.status = status
  }
}

let onAuthLost: () => void = () => {}
export const setAuthLost = (fn: () => void) => (onAuthLost = fn)

export async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api/superadmin${path}`, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'content-type': 'application/json', 'x-superadmin': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    // Réseau injoignable : message distinct d'une réponse d'erreur du serveur
    throw new ApiError('NETWORK', 0)
  })
  const json = await res.json().catch(() => ({}))
  if (res.status === 401 && path !== '/login') onAuthLost()
  if (!res.ok) throw new ApiError(json.error || 'FAILED', res.status)
  return json as T
}

export const qs = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '') as [string, string][]).toString()

/* ---------------------------------------------------------------- mise en forme */

const dt = new Intl.DateTimeFormat('ar-LY-u-nu-latn', { timeZone: 'Africa/Tripoli', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const dShort = new Intl.DateTimeFormat('ar-LY-u-nu-latn', { timeZone: 'Africa/Tripoli', day: 'numeric', month: 'short' })
export const fmtDate = (iso?: string | null) => (iso ? dt.format(new Date(iso)) : '—')
export const fmtDay = (day: string) => dShort.format(new Date(`${day}T12:00:00Z`))
export const fmtNum = (n: number) => (n || 0).toLocaleString('en-US')
export function fmtBytes(n: number) {
  if (!n) return '0'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1)
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}
export function fmtMinutes(m: number) {
  if (!m) return '0 د'
  const h = Math.floor(m / 60)
  return h ? `${h} س ${m % 60} د` : `${m} د`
}
export function ago(iso?: string | null) {
  if (!iso) return '—'
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'الآن'
  if (s < 3600) return `منذ ${Math.round(s / 60)} د`
  if (s < 86400) return `منذ ${Math.round(s / 3600)} س`
  return `منذ ${Math.round(s / 86400)} يوم`
}
/** Drapeau à partir du code pays (LY → 🇱🇾) */
export function flag(cc?: string) {
  if (!cc) return '🌐'
  if (cc === 'LAN') return '🖧'
  if (!/^[A-Z]{2}$/.test(cc)) return '🌐'
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export const ROLE_LABEL: Record<string, string> = { admin: 'مدير', analyst: 'محلل', viewer: 'قارئ' }

export const ACTIVITY_LABEL: Record<string, string> = {
  login: 'تسجيل دخول',
  logout: 'تسجيل خروج',
  search: 'بحث',
  filter: 'تصفية',
  open: 'فتح مقال',
  print: 'طباعة تقرير',
  report: 'عرض تقرير',
  export: 'تصدير',
  send: 'إرسال بالبريد',
  share: 'مشاركة لوحة',
  delete: 'حذف',
  alert: 'معالجة تنبيه',
  ai: 'تحليل بالذكاء الاصطناعي',
  lang: 'تغيير اللغة',
  view: 'فتح صفحة',
}

export const SECURITY_LABEL: Record<string, string> = {
  login_ok: 'دخول ناجح',
  mfa_asked: 'طلب رمز التحقق',
  mfa_fail: 'رمز تحقق خاطئ',
  mfa_enabled: 'تفعيل التحقق بخطوتين',
  mfa_disabled: 'إيقاف التحقق بخطوتين',
  mail_blocked: 'بريد محجوب (خارج النطاقات)',
  share_create: 'إنشاء رابط مشاركة',
  login_fail: 'دخول فاشل',
  login_disabled: 'دخول حساب معطّل',
  locked: 'حظر مؤقت بعد محاولات',
  logout: 'خروج',
  sa_login_ok: 'دخول المشرف الأعلى',
  sa_login_fail: 'فشل دخول المشرف الأعلى',
  sa_locked: 'حظر مؤقت للوحة العليا',
  blocked_ip: 'طلب من عنوان محظور',
  blocked_country: 'طلب من دولة محظورة',
  perm_denied: 'طلب خارج الصلاحيات',
}

export const AUDIT_LABEL: Record<string, string> = {
  login: 'دخول',
  ai_gemini_paid: 'تصريح: مفتاح Gemini مدفوع',
  logout: 'خروج',
  user_create: 'إنشاء حساب',
  user_update: 'تعديل حساب',
  user_delete: 'حذف حساب',
  user_note: 'ملاحظة',
  user_sessions_closed: 'إغلاق الجلسات',
  block_ip: 'حظر عنوان',
  unblock_ip: 'رفع حظر عنوان',
  block_country: 'حظر دولة',
  unblock_country: 'رفع حظر دولة',
  source_on: 'تفعيل مصدر',
  source_off: 'إيقاف مصدر',
  announcement: 'شريط الإعلان',
  maintenance: 'وضع الصيانة',
  export_csv: 'تصدير CSV',
  profile_create: 'إنشاء ملف صلاحيات',
  profile_update: 'تعديل ملف صلاحيات',
  profile_delete: 'حذف ملف صلاحيات',
  source_meta: 'بلد المصدر ومدى انتشاره',
  brand: 'شعار العميل',
  apikey_create: 'إنشاء مفتاح API',
  apikey_revoke: 'إلغاء مفتاح API',
  share_revoke: 'إلغاء رابط مشاركة',
  geo_settings: 'إعدادات الحضور في إجابات النموذج الداخلي',
  mail_policy: 'النطاقات المسموح بها للبريد',
  alert_review: 'اعتماد التنبيهات الحرجة',
  mfa_policy: 'قاعدة التحقق بخطوتين',
  entities: 'المرجع الموحد للفاعلين',
  entity_ai_run: 'تصحيح الفاعلين بالذكاء الاصطناعي',
  support_email: 'بريد الدعم الفني',
  face_policy: 'سياسة التحقق بالوجه',
  face_exception: 'استثناء مؤقت من التحقق بالوجه',
  face_reset: 'إعادة تعيين التحقق بالوجه',
  face_approve: 'اعتماد تغيير الوجه',
  support_ticket: 'حالة طلب دعم',
  entity_ai_edit: 'تعديل قرار تصحيح فاعل',
  mailing_list_create: 'إنشاء قائمة مراسلة',
  mailing_list_update: 'تعديل قائمة مراسلة',
  mailing_list_delete: 'حذف قائمة مراسلة',
}

export const ERROR_LABEL: Record<string, string> = {
  BAD_CREDENTIALS: 'المعرّف أو كلمة المرور غير صحيحة.',
  LOCKED: 'محاولات كثيرة فاشلة. أعد المحاولة بعد 15 دقيقة.',
  NOT_CONFIGURED: 'لم يُنشأ حساب المشرف الأعلى على الخادم بعد.',
  BAD_EMAIL: 'بريد إلكتروني غير صالح.',
  SHORT_PASSWORD: 'كلمة المرور قصيرة (8 أحرف على الأقل).',
  EXISTS: 'هذا الحساب موجود مسبقًا.',
  SELF_IP: 'لا يمكنك حظر عنوانك الحالي.',
  SELF_COUNTRY: 'لا يمكنك حظر دولتك الحالية.',
  BAD_IP: 'عنوان IP غير صالح.',
  BAD_COUNTRY: 'رمز الدولة من حرفين (مثل LY).',
  BAD_PROFILE: 'ملف الصلاحيات غير موجود.',
  BUILTIN: 'لا يمكن حذف ملفات الأدوار الأساسية.',
  TOO_MANY: 'عدد ملفات الصلاحيات بلغ الحد الأقصى (40).',
  NETWORK: 'المتصفح لا يصل إلى الخادم. أعد تحميل الصفحة (Ctrl+F5) أو جرّب نافذة خاصة.',
  BLOCKED: 'الدخول من هذا العنوان أو هذا البلد محظور.',
  FAILED: 'تعذّر الاتصال بالخادم.',
}
export const errText = (e: unknown) => ERROR_LABEL[(e as Error)?.message] || ERROR_LABEL.FAILED
