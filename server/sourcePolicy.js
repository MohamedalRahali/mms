import fs from 'node:fs'
import path from 'node:path'

/**
 * Politique des sources sociales et des forums (audit v3) : comptes automatiques (bots), comptes personnels et forums
 * inappropriés écartés ; « r/u/X » et « r/u_X » ramenés à un seul nom ; liste blanche facultative des forums.
 *
 * Réglage : data/superadmin/source-policy.json (console Super Admin) — { blocked: [...], forumAllow: [...] }.
 * Les règles par défaut ci-dessous s'appliquent toujours ; la liste blanche, si elle n'est pas vide, ne garde que
 * les forums listés (les autres canaux ne sont pas concernés).
 */

// Fils Reddit automatiques ou hors sujet relevés par l'audit v3, et motifs de comptes automatiques ou inappropriés
const DEFAULT_BLOCKED = ['r/AutoNewspaper', 'r/ALJAZEERAauto', 'r/MapPorn', 'r/MilitaryPorn', 'r/WhitePeopleTwitter', 'r/PredictionCodesMarket', 'r/TrueChristianPolitics']

// Audit v4 : forums Reddit autorisés par défaut (liste blanche) ; le Super Admin en ajoute dans « forumAllow »
export const REDDIT_ALLOW = ['r/libya', 'r/LibyaNews', 'r/Libyan', 'r/worldnews', 'r/geopolitics', 'r/MiddleEast', 'r/MiddleEastNews', 'r/africa', 'r/arabs', 'r/europe', 'r/news', 'r/anime_titties', 'r/UnitedNations', 'r/OSINT', 'r/CredibleDefense']
// Sources religieuses ou de prédication, sur tous les canaux (audit v4 : Awqaf, lecteur du Coran, cheikh Belal Elsanhoury)
const RELIGIOUS_SOURCE = /أوقاف|اوقاف|awqaf|السنهوري|sanhoury|الشيخ |شيخ |sheikh|imam |إمام |الدعوة|دعوية|فتاوى|fatwa|islamic ?(channel|tv|radio)|dawah/i
// Titres de vidéos YouTube clairement religieux ou de divertissement (une actualité sur un concours de Coran reste)
const YOUTUBE_OFFTOPIC_TITLE = /تلاوة|ترتيل|تجويد|رقية شرعية|خطبة الجمعة|سورة [^\s]+ (كاملة|بصوت)|بصوت الشيخ|درس ديني|محاضرة دينية|نشيد|أنشودة|كليب|أغنية|مسلسل .* الحلقة|official (music )?video|full episode/i
const BOT_PATTERNS = [/^r\/\w*auto$/i, /^r\/auto\w*newspaper/i, /porn/i, /nsfw/i, /\bbot$/i, /_bot\b/i]

// YouTube : chaînes hors sujet pour une veille d'actualité (récitation, religion, divertissement, musique), d'après le
// nom de la chaîne seulement : un titre d'actualité qui parle d'un concours de Coran ou d'un « مسلسل » reste gardé
const YOUTUBE_OFFTOPIC = /قرآن|القران|تلاوة|تلاوات|ترتيل|تجويد|رقية|الرقيه|أناشيد|اناشيد|نشيد|أدعية|ادعية|خطبة الجمعة|كرتون|رسوم متحركة|أغاني|اغاني|أغنية|اغنية|مسلسل|كليب|\bquran\b|\bkoran\b|recitation|\bruqya|nasheed|cartoon|\bkids\b|lyrics|official music|music video|\bgaming\b|\bvlog/i

let file = ''
// Audit v4 (vérification en production du 30/10) : liste blanche des chaînes YouTube. Une vidéo n'est gardée que si
// sa chaîne est une chaîne d'information connue (ci-dessous) ou listée par le Super Admin (« youtubeAllow »).
// Les recherches YouTube remontaient des vlogs, podcasts et chaînes de divertissement sans rapport.
export const YOUTUBE_NEWS =
  /ليبي|libya|libye|الأحرار|ahrar|218|الوسط|wasat|الحدث|hadath|الوطنية|wataniya|المسار|masar|الرسمية|rasmia|النبأ|nabaa|التناصح|tanasuh|سلام|الجزيرة|jazeera|العربية|arabiya|سكاي نيوز|sky ?news|france ?24|فرانس ?24|bbc|بي بي سي|\bdw\b|دويتشه|\brt\b|روسيا اليوم|trt|cnn|الشرق|asharq|العربي|alaraby|الميادين|mayadeen|euronews|يورونيوز|reuters|رويترز|associated press|\bap\b|afp|al ?ghad|الغد|القاهرة الإخبارية|wion|haber|الإخبارية|الاخبارية|إخبارية|اخبارية|أخبار|اخبار|\bnews\b|\bnachrichten\b|\binfo\b/i
let policy = { blocked: [], forumAllow: [], youtubeAllow: [] }

export function initSourcePolicy(dir) {
  file = path.join(dir, 'source-policy.json')
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    policy = { blocked: list(saved.blocked), forumAllow: list(saved.forumAllow), youtubeAllow: list(saved.youtubeAllow) }
  } catch {
    policy = { blocked: [], forumAllow: [], youtubeAllow: [] }
  }
}

const list = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(/[\n,]+/))
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, 500)

export const sourcePolicy = () => ({ ...policy, defaults: DEFAULT_BLOCKED })

export function setSourcePolicy(body) {
  policy = { blocked: list(body?.blocked), forumAllow: list(body?.forumAllow), youtubeAllow: list(body?.youtubeAllow) }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(policy, null, 2))
  return sourcePolicy()
}

/** Nom d'auteur ou de fil Reddit normalisé : « r/u/X », « r/u_X », « u/X » → « u/X » ; « R/Libya » → « r/Libya » */
export function canonicalOrigin(origin) {
  const o = String(origin || '').trim()
  const user = /^(?:r\/)?u[/_]([\w-]+)$/i.exec(o)
  if (user) return `u/${user[1]}`
  const sub = /^r\/([\w-]+)$/i.exec(o)
  if (sub) return `r/${sub[1]}`
  return o
}

const lower = (s) => String(s || '').toLowerCase()

/** Vrai si la fiche vient d'une source écartée : défauts, liste du Super Admin, comptes Reddit personnels, forums hors liste blanche */
/**
 * Bruit hors veille (audit v5, constat 8) : courses hippiques et paris, publicités et annonces commerciales (laboratoires
 * d'analyses, offres, numéros à appeler), dans le fil comme dans les transcriptions radio. Une actualité sur le secteur
 * de la santé ou un laboratoire national reste : il faut un vocabulaire de publicité (offre, خصم، اتصل…) ou de pari.
 */
const HORSE_RACING = /سباق (الخيل|الخيول|خيل)|ميدان السباق|الفروسية.*(رهان|سباق)|horse ?rac|hippodrome|courses? hippiques?|\bturf\b|\bpmu\b|quint[ée] ?\+|مراهنات رياضية|المراهنات على|sports betting|bookmaker/i
const LAB_AD = /(مختبر|معمل|مختبرات|تحاليل|laborato)[^.]{0,80}(خصم|عرض|عروض|تخفيض|اتصل|اتصلوا|للحجز|واتساب|whatsapp|offre|promo|discount|call)|(خصم|عرض خاص|تخفيضات)[^.]{0,60}(تحاليل|تحليل|مختبر)/i
const AD_SIGNS = /(اتصل(وا)? (بنا )?على|للحجز والاستفسار|للاستفسار (اتصل|واتساب)|رقم الهاتف|واتساب ?:?\s*\+?\d|عرض لفترة محدودة|خصم \d+ ?%|سارعوا|اطلبوا الآن|call now|limited offer)/i
export function noiseItem(it) {
  const text = `${it.title || ''} ${it.summary || ''}`
  if (HORSE_RACING.test(text)) return 'racing'
  if (LAB_AD.test(text)) return 'ad'
  // Publicité : signe d'annonce ET numéro de téléphone (7 chiffres ou plus)
  if (AD_SIGNS.test(text) && /\+?\d[\d\s-]{6,}\d/.test(text)) return 'ad'
  if (it.advert === true || it.publicite === true) return 'ad'
  return ''
}

export function excludedBySource(it) {
  if (noiseItem(it)) return true
  const o = canonicalOrigin(it.origin)
  const lo = lower(o)
  if (DEFAULT_BLOCKED.some((b) => lower(b) === lo) || policy.blocked.some((b) => lower(canonicalOrigin(b)) === lo)) return true
  const social = it.channel === 'reddit' || it.media === 'forum' || it.media === 'social'
  if (social && BOT_PATTERNS.some((re) => re.test(o))) return true
  if (it.channel === 'youtube' && (YOUTUBE_OFFTOPIC.test(o) || YOUTUBE_OFFTOPIC_TITLE.test(String(it.title || '')))) return true
  if (it.channel === 'youtube' && !YOUTUBE_NEWS.test(o) && !policy.youtubeAllow.some((y) => lower(y) === lo)) return true
  if (RELIGIOUS_SOURCE.test(o) && it.channel !== 'site') return true
  // Reddit : forums de la liste blanche seulement (défaut + ajouts du Super Admin)
  if (it.channel === 'reddit' && lo.startsWith('r/') && ![...REDDIT_ALLOW, ...policy.forumAllow].some((f) => lower(canonicalOrigin(f)) === lo)) return true
  // Comptes personnels Reddit (u/…) : pas des médias, ni des forums
  if (it.channel === 'reddit' && lo.startsWith('u/')) return true
  if (policy.forumAllow.length && it.media === 'forum' && !policy.forumAllow.some((f) => lower(canonicalOrigin(f)) === lo)) return true
  return false
}
