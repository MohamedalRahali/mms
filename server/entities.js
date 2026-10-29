import fs from 'node:fs'
import path from 'node:path'
import { normalize } from './watches.js'

/**
 * Référentiel des entités (المرجع الموحد للفاعلين) : un nom canonique par acteur, avec ses variantes d'écriture
 * (arabe, latin, dialecte), son type (personne, organisation, lieu, média) et, pour les lieux libyens, la région
 * (غرب / شرق / جنوب). Appliqué à toutes les fiches au chargement (server/store.js) :
 * - les variantes sont fusionnées sous le nom canonique (ترامب / ترمب / Trump → دونالد ترامب) ;
 * - un média (ou une source suivie par MMS) n'est jamais compté comme acteur ;
 * - une entité classée au mauvais endroit (une ville dans « personnes ») est rangée dans la bonne liste.
 * Éditable dans la console Super Admin ; stockage data/superadmin/entities.json (sinon le référentiel de base).
 */

export const TYPES = ['person', 'org', 'place', 'media']
export const REGIONS = ['west', 'east', 'south']

const P = (name, aliases = [], libyan = true) => ({ name, type: 'person', aliases, libyan })
const O = (name, aliases = [], libyan = true) => ({ name, type: 'org', aliases, libyan })
const L = (name, region, aliases = []) => ({ name, type: 'place', aliases, libyan: true, region })
const M = (name, aliases = []) => ({ name, type: 'media', aliases, libyan: false })

/** Premier référentiel : responsables, institutions, villes et régions libyennes, et quelques noms étrangers fréquents */
export const DEFAULT_ENTITIES = [
  P('عبد الحميد الدبيبة', ['الدبيبة', 'عبدالحميد الدبيبة', 'عبد الحميد دبيبة', 'Dbeibah', 'Dbeibeh', 'Dbeiba', 'Abdulhamid Dbeibah', 'Abdul Hamid Dbeibah']),
  P('خليفة حفتر', ['حفتر', 'المشير حفتر', 'المشير خليفة حفتر', 'Haftar', 'Hifter', 'Khalifa Haftar', 'Khalifa Hifter']),
  P('صدام حفتر', ['Saddam Haftar']),
  P('بلقاسم حفتر', ['Belgassem Haftar', 'Belqasem Haftar']),
  P('محمد المنفي', ['المنفي', 'Menfi', 'Mohamed Menfi', 'Mohammed al-Menfi']),
  P('عقيلة صالح', ['المستشار عقيلة صالح', 'Aguila Saleh', 'Aqila Saleh']),
  P('محمد تكالة', ['تكالة', 'Takala', 'Mohamed Takala']),
  P('خالد المشري', ['المشري', 'Mishri', 'Khaled al-Mishri']),
  P('أسامة حماد', ['حماد', 'Osama Hammad', 'Ossama Hamad']),
  P('ناجي عيسى', ['محافظ مصرف ليبيا المركزي ناجي عيسى', 'Naji Issa']),
  P('عبد الله اللافي', ['اللافي', 'Abdullah Al-Lafi']),
  P('هانا تيتيه', ['تيتيه', 'Hanna Tetteh']),
  P('سيف الإسلام القذافي', ['سيف الاسلام القذافي', 'Saif al-Islam Gaddafi', 'Saif al-Islam Qaddafi']),
  P('معمر القذافي', ['القذافي', 'Gaddafi', 'Qaddafi', 'Kadhafi']),
  P('دونالد ترامب', ['ترامب', 'ترمب', 'دونالد ترمب', 'الرئيس ترامب', 'الرئيس الأمريكي ترامب', 'الرئيس الأمريكي دونالد ترامب', 'Trump', 'Donald Trump'], false),
  O('وزارة المواصلات الليبية', ['وزارة المواصلات', 'وزارة المواصلات والنقل', 'Ministry of Transport', 'Libyan Ministry of Transport']),
  P('رجب طيب أردوغان', ['أردوغان', 'اردوغان', 'Erdogan', 'Erdoğan'], false),
  P('عبد الفتاح السيسي', ['السيسي', 'Sisi', 'el-Sisi'], false),
  O('حكومة الوحدة الوطنية', ['حكومة الوحدة', 'الحكومة الليبية في طرابلس', 'Government of National Unity', 'GNU']),
  O('الحكومة الليبية (بنغازي)', ['حكومة حماد', 'الحكومة المكلفة من مجلس النواب', 'Libyan Government (east)']),
  O('المجلس الرئاسي', ['المجلس الرئاسي الليبي', 'Presidential Council']),
  O('مجلس النواب', ['البرلمان الليبي', 'مجلس النواب الليبي', 'House of Representatives', 'HoR', 'Libyan Parliament']),
  O('المجلس الأعلى للدولة', ['مجلس الدولة', 'المجلس الاعلى للدولة', 'High Council of State', 'HCS']),
  O('مصرف ليبيا المركزي', ['المصرف المركزي', 'البنك المركزي الليبي', 'Central Bank of Libya', 'CBL']),
  O('المؤسسة الوطنية للنفط', ['مؤسسة النفط', 'National Oil Corporation', 'NOC']),
  O('المفوضية الوطنية العليا للانتخابات', ['مفوضية الانتخابات', 'المفوضية العليا للانتخابات', 'High National Elections Commission', 'HNEC']),
  O('القيادة العامة', ['القيادة العامة للقوات المسلحة', 'الجيش الوطني الليبي', 'Libyan National Army', 'LNA']),
  O('بعثة الأمم المتحدة للدعم في ليبيا', ['البعثة الأممية', 'البعثة الأممية في ليبيا', 'UNSMIL']),
  O('ديوان المحاسبة', ['Audit Bureau']),
  O('مكتب النائب العام', ['النائب العام', 'Attorney General']),
  L('طرابلس', 'west', ['Tripoli', 'طرابلس الغرب']),
  L('مصراتة', 'west', ['Misrata', 'Misurata', 'مصراته']),
  L('الزاوية', 'west', ['Zawiya', 'Zawia', 'الزاويه']),
  L('زليتن', 'west', ['Zliten']),
  L('الخمس', 'west', ['Khoms', 'Al Khums']),
  L('غريان', 'west', ['Gharyan']),
  L('صبراتة', 'west', ['Sabratha']),
  L('زوارة', 'west', ['Zuwara', 'Zuwarah']),
  L('ترهونة', 'west', ['Tarhuna', 'Tarhouna']),
  L('بني وليد', 'west', ['Bani Walid']),
  L('الزنتان', 'west', ['Zintan']),
  L('سرت', 'west', ['Sirte', 'Sirt']),
  L('بنغازي', 'east', ['Benghazi', 'بنغازى']),
  L('درنة', 'east', ['Derna', 'Darnah']),
  L('البيضاء', 'east', ['Bayda', 'Al Bayda']),
  L('طبرق', 'east', ['Tobruk']),
  L('المرج', 'east', ['Marj', 'Al Marj']),
  L('أجدابيا', 'east', ['Ajdabiya', 'اجدابيا']),
  L('الكفرة', 'east', ['Kufra']),
  L('رأس لانوف', 'east', ['Ras Lanuf']),
  L('البريقة', 'east', ['Brega']),
  L('سبها', 'south', ['Sabha', 'Sebha']),
  L('أوباري', 'south', ['Ubari', 'Awbari', 'اوباري']),
  L('مرزق', 'south', ['Murzuq']),
  L('غات', 'south', ['Ghat']),
  L('براك الشاطئ', 'south', ['Brak']),
  L('الجفرة', 'south', ['Jufra']),
  L('القطرون', 'south', ['Qatrun']),
  L('حقل الشرارة', 'south', ['الشرارة', 'Sharara', 'El Sharara']),
  L('حقل الفيل', 'south', ['El Feel', 'Elephant field']),
  L('فزان', 'south', ['إقليم فزان', 'Fezzan', 'Fazzan']),
  L('برقة', 'east', ['إقليم برقة', 'Cyrenaica', 'Barqa']),
  L('طرابلس الكبرى', 'west', ['إقليم طرابلس', 'Tripolitania']),
  M('Libyan News Wire'),
  M('Libya Observer', ['The Libya Observer', 'ليبيا أوبزرفر']),
  M('Libya Herald'),
  M('بوابة الوسط', ['الوسط', 'Al Wasat', 'Alwasat']),
  M('قناة ليبيا الأحرار', ['ليبيا الأحرار', 'Libya Al Ahrar']),
  M('قناة 218', ['218', '218 News']),
  M('وكالة الأنباء الليبية', ['وال', 'LANA']),
  M('الجزيرة', ['قناة الجزيرة', 'Al Jazeera']),
  M('العربية', ['قناة العربية', 'Al Arabiya']),
  M('رويترز', ['Reuters']),
  M('فرانس برس', ['وكالة فرانس برس', 'AFP']),
]

// Mots qui rattachent un texte à la Libye (pertinence des alertes)
const LIBYA_WORDS = ['ليبيا', 'ليبي', 'ليبية', 'الليبي', 'الليبية', 'الليبيين', 'Libya', 'Libyan', 'Libye', 'libyen', 'libyenne', 'Libia']

let file = ''
let entities = DEFAULT_ENTITIES
let index = new Map() // forme normalisée → entité
let version = 0
let libyaNorm = []
const listeners = new Set()

export const norm = (s) => normalize(s).replace(/[«»"'“”().,:]/g, '').replace(/\s+/g, ' ').trim()

// Décisions de l'IA (server/entityAI.js) : couche sous le référentiel saisi à la main, qui reste prioritaire
let aiDecisions = []
export function setAiEntities(list) {
  aiDecisions = Array.isArray(list) ? list : []
  rebuild()
}

function rebuild() {
  index = new Map()
  for (const e of entities) for (const n of [e.name, ...(e.aliases || [])]) if (norm(n)) index.set(norm(n), e)
  // Variantes fusionnées par l'IA : rattachées à l'entité du référentiel si le nom canonique y figure, sinon à une
  // entité « IA » ; noms rejetés (prénom seul, titre générique, erreur d'extraction) marqués pour être écartés
  const aiByName = new Map()
  for (const d of aiDecisions) {
    const k = norm(d.raw)
    if (!k || index.has(k)) continue
    if (d.reject) {
      index.set(k, { name: d.raw, type: 'reject' })
      continue
    }
    const ck = norm(d.canonical || d.raw)
    let target = index.get(ck) || aiByName.get(ck)
    if (!target) {
      target = { name: d.canonical || d.raw, type: d.type === 'org' ? 'org' : d.type === 'place' ? 'place' : 'person', aliases: [], libyan: d.libyan === true, role: d.role || '', ai: true }
      aiByName.set(ck, target)
      index.set(ck, target)
    }
    index.set(k, target)
  }
  const libyanNames = entities.filter((e) => e.libyan && e.type !== 'media').flatMap((e) => [e.name, ...(e.aliases || [])].filter((n) => norm(n).length >= 4))
  libyaNorm = [...new Set([...LIBYA_WORDS, ...libyanNames].map(norm).filter(Boolean))]
  version++
  for (const fn of listeners) fn()
}

export function cleanEntity(e) {
  const name = String(e?.name || '').trim().slice(0, 120)
  if (!name) return null
  const type = TYPES.includes(e.type) ? e.type : 'person'
  const aliases = [...new Set((Array.isArray(e.aliases) ? e.aliases : String(e.aliases || '').split(/[,،\n]/)).map((a) => String(a).trim().slice(0, 120)).filter((a) => a && a !== name))].slice(0, 40)
  return { name, type, aliases, libyan: e.libyan !== false && type !== 'media', ...(type === 'place' && REGIONS.includes(e.region) ? { region: e.region } : {}) }
}

export function initEntities(dir) {
  file = path.join(dir, 'entities.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')).entities
    if (Array.isArray(saved) && saved.length) {
      // Référentiel enregistré + entrées et variantes ajoutées depuis dans le référentiel par défaut (sans rien retirer)
      const list = saved.map(cleanEntity).filter(Boolean)
      for (const d of DEFAULT_ENTITIES) {
        const same = list.find((e) => e.name === d.name)
        if (same) same.aliases = [...new Set([...(same.aliases || []), ...d.aliases])]
        else list.push({ ...d })
      }
      entities = list
    }
  } catch {
    entities = DEFAULT_ENTITIES
  }
  rebuild()
}

export const listEntities = () => entities.map((e) => ({ ...e }))
export const entitiesVersion = () => version
export const onEntitiesChange = (fn) => listeners.add(fn)

/** Remplace le référentiel (console Super Admin) ; deux entités qui partagent une variante : la première garde */
export function saveEntities(list) {
  const clean = (Array.isArray(list) ? list : []).map(cleanEntity).filter(Boolean).slice(0, 2000)
  entities = clean
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ savedAt: new Date().toISOString(), entities }, null, 1))
  fs.renameSync(tmp, file)
  rebuild()
  return listEntities()
}

/** Entité du référentiel pour un nom (ou une variante), ou null */
export const lookup = (name) => index.get(norm(name)) || null

/**
 * Range les entités d'une fiche : variantes fusionnées, médias retirés, chaque nom dans sa liste.
 * mediaNames : noms des sources suivies (normalisés) ; une source n'est jamais un acteur.
 */
// Prénoms seuls (« محمد ») : trop ambigus pour être un acteur ; écartés sauf s'ils sont dans le référentiel
const FIRST_NAMES = new Set(['محمد', 'أحمد', 'احمد', 'علي', 'عبدالله', 'عبد الله', 'خالد', 'عمر', 'مصطفى', 'إبراهيم', 'ابراهيم', 'يوسف', 'حسن', 'حسين', 'سالم', 'عبدالرحمن', 'صالح', 'محمود', 'فاطمة', 'مريم', 'عائشة', 'خديجة', 'سارة', 'Mohamed', 'Mohammed', 'Muhammad', 'Ahmed', 'Ali', 'Omar', 'Khaled'])

export function resolveEntities(it, mediaNames = new Set()) {
  const out = { people: [], orgs: [], places: [] }
  const seen = new Set()
  const push = (list, raw) => {
    const name = String(raw || '').trim()
    if (!name) return
    const e = lookup(name)
    // Rejeté par la correction IA (ou le Super Admin) : pas un acteur
    if (e?.type === 'reject') return
    if (!e && list === 'people' && FIRST_NAMES.has(name)) return
    if (e?.type === 'media' || (!e && mediaNames.has(norm(name)))) return
    const canon = e ? e.name : name
    const target = e ? (e.type === 'person' ? 'people' : e.type === 'place' ? 'places' : 'orgs') : list
    const key = `${target}|${norm(canon)}`
    if (seen.has(key)) return
    seen.add(key)
    out[target].push(canon)
  }
  for (const n of it.people || []) push('people', n)
  for (const n of it.orgs || []) push('orgs', n)
  for (const n of it.places || []) push('places', n)
  return out
}

/** La fiche concerne-t-elle la Libye ? (mot « ليبيا », acteur, institution ou lieu libyen dans le texte ou ses entités) */
export function libyaRelevant(it) {
  const text = norm(`${it.title} ${it.summary || ''}`)
  if (libyaNorm.some((w) => text.includes(w))) return true
  return [...(it.people || []), ...(it.orgs || []), ...(it.places || [])].some((n) => lookup(n)?.libyan)
}

/**
 * Répartition territoriale : nombre de fiches par région (غرب / شرق / جنوب) et par lieu libyen du référentiel,
 * à partir des lieux cités dans chaque fiche (géolocalisation par mots-clés, sans service externe).
 */
export function regionStats(items) {
  const regions = { west: 0, east: 0, south: 0 }
  const places = new Map()
  let located = 0
  for (const it of items) {
    const seen = new Set()
    for (const p of it.places || []) {
      const e = lookup(p)
      if (!e?.region || seen.has(e.name)) continue
      seen.add(e.name)
      const row = places.get(e.name) || { name: e.name, region: e.region, count: 0 }
      row.count++
      places.set(e.name, row)
    }
    const r = regionOf(it)
    if (r) {
      regions[r]++
      located++
    }
  }
  return { total: items.length, located, regions, places: [...places.values()].sort((a, b) => b.count - a.count).slice(0, 25) }
}

/** Région libyenne d'une fiche (la plus citée parmi ses lieux), ou '' */
export function regionOf(it) {
  const count = { west: 0, east: 0, south: 0 }
  for (const p of it.places || []) {
    const r = lookup(p)?.region
    if (r) count[r]++
  }
  const best = REGIONS.reduce((a, b) => (count[b] > count[a] ? b : a), 'west')
  return count[best] ? best : ''
}

rebuild()
