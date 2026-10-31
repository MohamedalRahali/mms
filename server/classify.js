/**
 * Classification partagée par toutes les pages (audit v5, constat 8) : analyse, comparaison de périodes, portail,
 * rapport exécutif et exports comptent les thèmes avec ces mêmes fonctions. « دولي » est toujours découpé par zone
 * (international.europe, international.maghreb…, international.other quand la zone n'est pas reconnue).
 */

/** Thème principal d'une fiche ('autre' quand il manque) */
export const categoryKey = (it) => String(it?.category || '').trim().toLowerCase() || 'autre'

/** Thème fin : « دولي » découpé par zone, les autres inchangés */
export const fineCategory = (it) => {
  const c = categoryKey(it)
  return c === 'international' ? `international.${it.intl || 'other'}` : c
}

/** Comptes par thème fin, du plus fréquent au moins fréquent */
export function categoryCounts(items, fine = true) {
  const map = new Map()
  for (const it of items) {
    const k = fine ? fineCategory(it) : categoryKey(it)
    map.set(k, (map.get(k) || 0) + 1)
  }
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

/**
 * Thème déduit des mots du titre et du résumé quand la source n'en donne pas (audit v5 : « أخرى » = 8 245 fiches).
 * Prudent : il faut au moins deux indices du même thème, ou un indice fort, et un thème nettement en tête ; sinon la
 * fiche reste « autre ». Appliqué au chargement (store.js) : filtres, veilles, analyse et portail voient le même thème.
 */
const RULES = [
  ['sécurité', ['اشتباك', 'اشتباكات', 'مسلح', 'مسلحة', 'الجيش', 'كتيبة', 'هجوم', 'اغتيال', 'اختطاف', 'تهريب', 'الهجرة غير', 'مهاجرين', 'قوات', 'عسكري', 'أمني', 'الأمن', 'ميليشيا', 'clashes', 'armed', 'militia', 'attack', 'military', 'security', 'smuggling', 'migrants', 'sécurité', 'armée', 'milice'], ['اشتباكات', 'اغتيال', 'militia', 'clashes']],
  ['énergie', ['النفط', 'نفط', 'الغاز', 'حقل', 'مصفاة', 'المؤسسة الوطنية للنفط', 'برميل', 'الكهرباء', 'محطة توليد', 'oil', 'gas', 'refinery', 'barrel', 'electricity', 'pétrole', 'raffinerie', 'électricité'], ['النفط', 'oil', 'pétrole', 'مصفاة']],
  ['économie', ['المصرف المركزي', 'مصرف ليبيا المركزي', 'الدينار', 'الميزانية', 'الأسعار', 'التضخم', 'السيولة', 'الاستثمار', 'الاقتصاد', 'اقتصادي', 'تجارة', 'الضرائب', 'central bank', 'dinar', 'budget', 'inflation', 'economy', 'investment', 'banque centrale', 'économie'], ['المصرف المركزي', 'central bank', 'التضخم']],
  ['politique', ['الحكومة', 'مجلس النواب', 'المجلس الرئاسي', 'مجلس الدولة', 'الانتخابات', 'رئيس الوزراء', 'الدبيبة', 'حفتر', 'المنفي', 'البعثة الأممية', 'حوار', 'سياسي', 'وزير', 'government', 'parliament', 'elections', 'prime minister', 'Dbeibah', 'Haftar', 'UNSMIL', 'gouvernement', 'élections', 'parlement'], ['الانتخابات', 'مجلس النواب', 'elections']],
  ['santé', ['الصحة', 'مستشفى', 'المستشفى', 'وباء', 'لقاح', 'مرض', 'الأدوية', 'طبي', 'hospital', 'health', 'vaccine', 'disease', 'santé', 'hôpital', 'épidémie'], ['مستشفى', 'hospital', 'وباء']],
  ['sport', ['كرة القدم', 'المنتخب', 'الدوري', 'مباراة', 'نادي', 'بطولة', 'الأهلي', 'الاتحاد الليبي لكرة', 'football', 'match', 'league', 'championship', 'championnat'], ['كرة القدم', 'مباراة', 'football']],
  ['société', ['التعليم', 'المدارس', 'الجامعة', 'الطلاب', 'المرأة', 'الشباب', 'السكان', 'الرواتب', 'المواطنين', 'education', 'students', 'women', 'éducation', 'étudiants'], ['التعليم', 'education']],
  ['culture', ['ثقافة', 'مهرجان', 'معرض', 'التراث', 'فيلم', 'كتاب', 'festival', 'heritage', 'exhibition', 'patrimoine'], ['مهرجان', 'festival']],
  ['météo', ['الطقس', 'أمطار', 'الأرصاد', 'عاصفة', 'فيضانات', 'درجات الحرارة', 'weather', 'storm', 'flood', 'météo', 'tempête', 'inondation'], ['الأرصاد', 'weather', 'météo']],
  ['faits divers', ['حادث سير', 'حريق', 'وفاة', 'غرق', 'جريمة', 'القبض على', 'accident', 'fire', 'drowned', 'crime', 'incendie'], ['حادث سير', 'حريق']],
]
const low = (t) => String(t || '').toLowerCase()
export function guessCategory(title, summary = '') {
  const text = low(`${title} ${title} ${summary}`)
  if (text.trim().length < 12) return ''
  const scores = RULES.map(([cat, words, strong]) => {
    let n = 0
    for (const w of words) if (text.includes(low(w))) n++
    for (const w of strong) if (text.includes(low(w))) n++
    return [cat, n]
  }).sort((a, b) => b[1] - a[1])
  const [best, second] = scores
  if (best[1] < 2 || best[1] <= second[1]) return ''
  return best[0]
}

/** Thème donné par la source, sinon déduit ; « autre » si rien de sûr */
export function inferCategory(category, title, summary) {
  const c = String(category || '').trim().toLowerCase() || 'autre'
  if (c !== 'autre' && c !== 'other' && c !== 'أخرى') return c
  return guessCategory(title, summary) || 'autre'
}
