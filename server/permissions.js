import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Permissions détaillées par profil (الصلاحيات التفصيلية), réglées dans la console Super Admin.
 *
 * - Un profil = la liste des modules (pages du menu) et des actions (boutons) autorisés.
 * - Trois profils de base, un par rôle (admin, analyst, viewer), modifiables ; le Super Admin peut en créer d'autres
 *   (« تحليل فقط »…) et en attribuer un à chaque compte, sans créer de nouveau compte par combinaison.
 * - Un compte suit le profil qui lui est attribué, sinon celui de son rôle.
 * - Appliqué deux fois : l'interface masque ce qui n'est pas permis, et le serveur refuse les appels correspondants (403).
 * - Stockage : data/superadmin/permissions.json. Sans ce fichier, les profils de base reproduisent les anciens droits par rôle.
 */

export const MODULES = [
  ['dashboard', 'لوحات القيادة'],
  ['radar', 'الرادار الذكي'],
  ['news', 'الأخبار والبحث المتقدم'],
  ['media', 'صفحات الوسائط والبث المباشر'],
  ['watch', 'الرصد المبرمج'],
  ['stats', 'التحليل'],
  ['assistant', 'Around (المساعد الذكي)'],
  ['ai', 'التحليل الذكي'],
  ['sov', 'حصة الظهور'],
  ['compare', 'مقارنة الفترات'],
  ['briefing', 'التقرير التنفيذي'],
  ['reports', 'التقارير'],
  ['report', 'الاستعراض اليومي'],
  ['alerts', 'التنبيهات'],
  ['favorites', 'المفضلة'],
  ['geo', 'الحضور في إجابات الذكاء الاصطناعي'],
]

export const ACTIONS = [
  ['export', 'تصدير CSV وطباعة التقارير'],
  ['ai_ask', 'أسئلة للذكاء الاصطناعي (Around، مساعد البحث، شرح القفزات)'],
  ['ai_run', 'تشغيل التحليل الذكي والملخصات التنفيذية'],
  ['edit_dashboards', 'إنشاء اللوحات وتعديلها'],
  ['manage_watches', 'إنشاء الرصد المبرمج وتعديله وحذفه'],
  ['tags', 'إضافة الوسوم إلى الأخبار'],
  ['send_email', 'إرسال التقارير بالبريد الإلكتروني'],
  ['schedule', 'جدولة التقرير التنفيذي وإرساله'],
  ['diffusion', 'إدارة مصادر البث (التلفزيون والإذاعات)'],
  ['mark_processed', 'تحديد الأخبار كمُعالَجة'],
  ['share_dashboards', 'مشاركة لوحات القيادة برابط للقراءة فقط'],
]

// Actions ajoutées après la première version des réglages : accordées aux profils de base déjà enregistrés
// selon leur rôle (comme les nouveaux modules), jamais aux profils créés par le Super Admin
const LATER_ACTIONS = ['mark_processed', 'share_dashboards']

const MODULE_KEYS = MODULES.map(([k]) => k)
const ACTION_KEYS = ACTIONS.map(([k]) => k)
export const BASE_ROLES = ['admin', 'analyst', 'viewer']
const ROLE_NAMES = { admin: 'مدير', analyst: 'محلل', viewer: 'قارئ' }

// Mêmes droits qu'avant les permissions détaillées (minRole de server/index.js et diffusion.js)
const DEFAULT_ACTIONS = {
  admin: ACTION_KEYS,
  analyst: ['export', 'ai_ask', 'ai_run', 'edit_dashboards', 'manage_watches', 'tags', 'send_email', 'mark_processed', 'share_dashboards'],
  viewer: ['export', 'ai_ask', 'send_email'],
}

let file = ''
let profiles = []

const defaults = () => BASE_ROLES.map((r) => ({ id: r, name: ROLE_NAMES[r], builtin: true, modules: [...MODULE_KEYS], actions: [...DEFAULT_ACTIONS[r]] }))

function clean(p, builtin) {
  return {
    id: String(p.id),
    name: String(p.name || '').trim().slice(0, 60) || String(p.id),
    builtin,
    // Seuls les modules et actions connus ; un module ajouté plus tard est ouvert aux profils de base
    modules: MODULE_KEYS.filter((k) => (Array.isArray(p.modules) ? p.modules.includes(k) : true)),
    actions: ACTION_KEYS.filter((k) => Array.isArray(p.actions) && p.actions.includes(k)),
    ...(p.updatedAt ? { updatedAt: String(p.updatedAt) } : {}),
  }
}

export function initPermissions(dir) {
  file = path.join(dir, 'permissions.json')
  profiles = defaults()
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).profiles || []
    for (const p of saved) {
      const base = BASE_ROLES.includes(p.id)
      // Modules apparus depuis l'enregistrement (absents de « known ») : ouverts aux profils de base, comme avant
      const added = base && Array.isArray(p.known) ? MODULE_KEYS.filter((k) => !p.known.includes(k)) : []
      const modules = [...(Array.isArray(p.modules) ? p.modules : MODULE_KEYS), ...added]
      // Actions apparues depuis l'enregistrement : droits par défaut du rôle
      const knownActions = Array.isArray(p.knownActions) ? p.knownActions : ACTION_KEYS.filter((k) => !LATER_ACTIONS.includes(k))
      const newActions = base ? DEFAULT_ACTIONS[p.id].filter((k) => !knownActions.includes(k)) : []
      const actions = [...(Array.isArray(p.actions) ? p.actions : []), ...newActions]
      // Nom des profils de base : celui du rôle, toujours
      const row = clean({ ...p, ...(base ? { name: ROLE_NAMES[p.id] } : {}), modules, actions }, base)
      if (base) profiles[BASE_ROLES.indexOf(p.id)] = row
      else if (/^p_[a-z0-9]{6,16}$/.test(row.id)) profiles.push(row)
    }
  } catch {
    /* pas encore de réglages : profils de base */
  }
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ savedAt: new Date().toISOString(), profiles: profiles.map((p) => ({ ...p, known: MODULE_KEYS, knownActions: ACTION_KEYS })) }, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export const listProfiles = () => profiles.map((p) => ({ ...p }))
export const profileExists = (id) => profiles.some((p) => p.id === id)

/** Profil appliqué à un compte : celui qui lui est attribué, sinon celui de son rôle */
export function profileOf(user) {
  const role = BASE_ROLES.includes(user?.role) ? user.role : 'admin'
  return profiles.find((p) => p.id === user?.profile) || profiles.find((p) => p.id === role)
}

/** Droits effectifs envoyés à l'interface */
export function permsOf(user) {
  const p = profileOf(user)
  return { profile: p.id, profileName: p.name, modules: [...p.modules], actions: [...p.actions] }
}

/* ---------------------------------------------------------------- contrôle des appels à l'API */

// Chemin (relatif à /api) → modules dont l'un suffit. Les lectures communes (/news, /news/stats, /news/facets, /health,
// /tags en lecture, /img) restent ouvertes à toute session : elles servent à presque toutes les pages.
const MODULE_RULES = [
  [/^\/dashboards(\/|$)/, ['dashboard']],
  [/^\/radar(\/|$)/, ['radar']],
  [/^\/media(\/|$)/, ['media']],
  [/^\/diffusion(\/|$)/, ['media']],
  [/^\/watches(\/|$)/, ['watch']],
  [/^\/ai\/analysis$/, ['ai']],
  [/^\/ai\/(ask|agent)$/, ['assistant']],
  [/^\/ai\/query$/, ['news', 'assistant']],
  [/^\/ai\/spike$/, ['dashboard', 'stats', 'ai']],
  [/^\/news\/spikes$/, ['dashboard', 'stats', 'ai']],
  [/^\/news\/sov$/, ['sov']],
  [/^\/news\/compare$/, ['compare']],
  [/^\/news\/export\.csv$/, ['news', 'media']],
  [/^\/briefing(\/|$)/, ['briefing']],
  [/^\/reports(\/|$)/, ['reports']],
  [/^\/shares(\/|$)/, ['dashboard']],
  [/^\/ai\/brief$/, ['news', 'media']],
  [/^\/news\/processed$/, ['news', 'media']],
  [/^\/geo(\/|$)/, ['geo']],
  [/^\/sources(\/|$)/, ['news']],
  [/^\/pinboards(\/|$)/, ['news', 'media', 'dashboard']],
  [/^\/recordings(\/|$)/, ['media']],
  [/^\/rasd(\/|$)/, ['media']],
  [/^\/report$/, ['report']],
]

/** Action exigée par l'appel, ou '' */
function actionFor(method, p) {
  const write = method !== 'GET' && method !== 'HEAD'
  if (p === '/news/export.csv') return 'export'
  if (write && /^\/ai\/(ask|agent|query|spike|brief)$/.test(p)) return 'ai_ask'
  if (write && p === '/news/processed') return 'mark_processed'
  if (write && p.startsWith('/radar/alerts/')) return 'mark_processed'
  if (p.startsWith('/shares')) return 'share_dashboards'
  if (write && p.startsWith('/geo')) return 'ai_run'
  if (write && p === '/radar/explain') return 'ai_ask'
  if (write && (p === '/ai/analysis' || p === '/briefing/summary')) return 'ai_run'
  if (write && p.startsWith('/dashboards')) return 'edit_dashboards'
  if (write && p.startsWith('/watches')) return 'manage_watches'
  if (write && p.startsWith('/tags')) return 'tags'
  if (write && p.startsWith('/pinboards')) return 'tags'
  // Enregistrements à la demande : analystes et administrateurs (mêmes profils que les tableaux d'épingles)
  if (write && p === '/recordings/budget') return 'diffusion'
  if (write && p.startsWith('/recordings')) return 'tags'
  // الرصد المبرمج : estimation ouverte aux mêmes profils que la création (analystes et administrateurs)
  if (write && p.startsWith('/rasd')) return 'tags'
  if (write && /^\/reports\/[^/]+\/email$/.test(p)) return 'send_email'
  if ((write && p.startsWith('/briefing/schedule')) || p === '/briefing/send') return 'schedule'
  if (write && p.startsWith('/diffusion')) return 'diffusion'
  return ''
}

/** Raison du refus (module ou action manquant), ou '' si l'appel est permis */
export function denialOf(perms, method, p) {
  for (const [re, mods] of MODULE_RULES) if (re.test(p) && !mods.some((m) => perms.modules.includes(m))) return `module:${mods[0]}`
  const action = actionFor(method, p)
  if (action && !perms.actions.includes(action)) return `action:${action}`
  return ''
}

/** Middleware monté après requireAuth sur /api : req.perms pour les routes, 403 sinon */
export function permissionGate(onDenied = () => {}) {
  return (req, res, next) => {
    // Express ignore la casse et la barre finale : même normalisation ici, sinon /Watches ou /ai/analysis/ échappent au contrôle
    const p = req.path.toLowerCase().replace(/\/+$/, '') || '/'
    if (p.startsWith('/auth/') || !req.user) return next()
    req.perms = permsOf(req.user)
    const why = denialOf(req.perms, req.method, p)
    if (!why) return next()
    onDenied(req, why)
    res.status(403).json({ error: 'FORBIDDEN', reason: why })
  }
}

/* ---------------------------------------------------------------- console Super Admin */

const fail = (res, status, error) => res.status(status).json({ error })

/**
 * Routes de la console (montées sur le routeur /api/superadmin, après son contrôle du jeton) :
 * GET /permissions, PUT /permissions/:id, POST /permissions (nouveau profil), DELETE /permissions/:id.
 * usersOf(id) donne les comptes rattachés à un profil (pour les compter et refuser une suppression).
 */
export function mountPermissionsAdmin(sa, { audit, usersOf, detach }) {
  sa.get('/permissions', (_req, res) =>
    res.json({
      modules: MODULES.map(([key, label]) => ({ key, label })),
      actions: ACTIONS.map(([key, label]) => ({ key, label })),
      profiles: profiles.map((p) => ({ ...p, users: usersOf(p.id).length })),
    }),
  )

  sa.post('/permissions', (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 60)
    if (!name) return fail(res, 400, 'NO_NAME')
    if (profiles.length >= 40) return fail(res, 400, 'TOO_MANY')
    if (profiles.some((p) => p.name === name)) return fail(res, 409, 'EXISTS')
    // Point de départ : un profil existant (copie), sinon aucun droit
    const from = profiles.find((p) => p.id === req.body?.copyOf)
    const row = clean({ id: `p_${crypto.randomBytes(5).toString('hex')}`, name, modules: from ? from.modules : [], actions: from ? from.actions : [], updatedAt: new Date().toISOString() }, false)
    profiles.push(row)
    save()
    audit(req, 'profile_create', row.name, from ? `copie de ${from.name}` : '')
    res.status(201).json({ profile: row })
  })

  sa.put('/permissions/:id', (req, res) => {
    const i = profiles.findIndex((p) => p.id === req.params.id)
    if (i < 0) return fail(res, 404, 'NOT_FOUND')
    const old = profiles[i]
    const next = clean(
      {
        id: old.id,
        name: old.builtin ? old.name : req.body?.name ?? old.name,
        modules: Array.isArray(req.body?.modules) ? req.body.modules : old.modules,
        actions: Array.isArray(req.body?.actions) ? req.body.actions : old.actions,
        updatedAt: new Date().toISOString(),
      },
      old.builtin,
    )
    // Un profil sans aucun module laisserait ses comptes devant une page vide
    if (!next.modules.length) return fail(res, 400, 'NO_MODULE')
    profiles[i] = next
    save()
    const diff = (a, b) => b.filter((k) => !a.includes(k))
    const changes = [
      ...diff(old.modules, next.modules).map((k) => `+${k}`),
      ...diff(next.modules, old.modules).map((k) => `-${k}`),
      ...diff(old.actions, next.actions).map((k) => `+${k}`),
      ...diff(next.actions, old.actions).map((k) => `-${k}`),
    ]
    audit(req, 'profile_update', next.name, changes.join(' ') || (old.name !== next.name ? `nom : ${old.name} → ${next.name}` : ''))
    res.json({ profile: next })
  })

  sa.delete('/permissions/:id', (req, res) => {
    const p = profiles.find((x) => x.id === req.params.id)
    if (!p) return fail(res, 404, 'NOT_FOUND')
    if (p.builtin) return fail(res, 400, 'BUILTIN')
    // Les comptes rattachés reviennent au profil de leur rôle
    const n = detach(p.id)
    profiles = profiles.filter((x) => x.id !== p.id)
    save()
    audit(req, 'profile_delete', p.name, n ? `${n} comptes revenus au profil de leur rôle` : '')
    res.json({ ok: true, detached: n })
  })
}
