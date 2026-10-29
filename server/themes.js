/**
 * Sous-thèmes du thème « دولي » (audit v3) : la zone dont parle l'actualité internationale, d'après les lieux reconnus
 * et le texte du titre et du résumé. Le thème d'origine ne change pas (veilles, tableaux et filtres enregistrés restent
 * valables) ; le sous-thème s'ajoute dans le champ `intl` et se filtre par ?intl=<clé>.
 */

import { norm } from './entities.js'

// Ordre = priorité quand plusieurs zones sont citées (organisations internationales d'abord, puis voisinage de la Libye)
export const INTL_REGIONS = [
  ['orgs', ['الأمم المتحدة', 'مجلس الأمن', 'البعثة الأممية', 'أونسميل', 'الاتحاد الأفريقي', 'الجامعة العربية', 'جامعة الدول العربية', 'صندوق النقد', 'البنك الدولي', 'المحكمة الجنائية', 'الناتو', 'حلف شمال الأطلسي', 'UNSMIL', 'United Nations', 'Security Council', 'African Union', 'Arab League', 'IMF', 'World Bank', 'NATO', 'ICC']],
  ['maghreb', ['تونس', 'الجزائر', 'المغرب', 'موريتانيا', 'مصر', 'القاهرة', 'الرباط', 'Tunisia', 'Tunisie', 'Algeria', 'Algérie', 'Morocco', 'Maroc', 'Egypt', 'Égypte', 'Mauritania']],
  ['africa', ['السودان', 'تشاد', 'النيجر', 'مالي', 'نيجيريا', 'الساحل', 'إثيوبيا', 'كينيا', 'أفريقيا', 'إفريقيا', 'Sudan', 'Chad', 'Niger', 'Mali', 'Nigeria', 'Sahel', 'Africa', 'Afrique']],
  ['arab', ['السعودية', 'الرياض', 'الإمارات', 'أبوظبي', 'قطر', 'الدوحة', 'الكويت', 'البحرين', 'عمان', 'الأردن', 'سوريا', 'لبنان', 'العراق', 'اليمن', 'فلسطين', 'غزة', 'الخليج', 'Saudi', 'Emirates', 'UAE', 'Qatar', 'Kuwait', 'Jordan', 'Syria', 'Lebanon', 'Iraq', 'Yemen', 'Palestine', 'Gaza']],
  ['europe', ['أوروبا', 'الاتحاد الأوروبي', 'إيطاليا', 'روما', 'فرنسا', 'باريس', 'ألمانيا', 'برلين', 'إسبانيا', 'اليونان', 'مالطا', 'بريطانيا', 'لندن', 'روسيا', 'موسكو', 'أوكرانيا', 'تركيا', 'أنقرة', 'Europe', 'European Union', 'Italy', 'Italie', 'France', 'Germany', 'Allemagne', 'Spain', 'Greece', 'Malta', 'Britain', 'London', 'Russia', 'Russie', 'Ukraine', 'Turkey', 'Turquie']],
  ['americas', ['الولايات المتحدة', 'واشنطن', 'أمريكا', 'الأمريكية', 'كندا', 'البرازيل', 'United States', 'Washington', 'America', 'États-Unis', 'Canada', 'Brazil']],
  ['asia', ['الصين', 'بكين', 'اليابان', 'الهند', 'باكستان', 'إيران', 'طهران', 'كوريا', 'آسيا', 'China', 'Chine', 'Japan', 'India', 'Pakistan', 'Iran', 'Korea', 'Asia', 'Asie']],
]
export const INTL_KEYS = INTL_REGIONS.map(([k]) => k)

// Adjectifs de nationalité (« وفد أوروبي », « الخارجية التونسية ») : racine + ي / ية / يا / يين / يون, avec ou sans « ال »
const ADJECTIVES = {
  orgs: ['أمم'],
  maghreb: ['تونس', 'جزائر', 'مغرب', 'مصر', 'موريتان'],
  africa: ['أفريق', 'إفريق', 'سودان', 'تشاد', 'نيجير', 'نيجر'],
  arab: ['سعود', 'إمارات', 'قطر', 'كويت', 'بحرين', 'أردن', 'سور', 'لبنان', 'عراق', 'يمن', 'فلسطين', 'خليج'],
  europe: ['أوروب', 'إيطال', 'فرنس', 'ألمان', 'إسبان', 'يونان', 'بريطان', 'روس', 'أوكران', 'ترك', 'مالط'],
  americas: ['أمريك', 'أميرك', 'كند', 'برازيل'],
  asia: ['صين', 'يابان', 'هند', 'إيران', 'باكستان', 'كور'],
}
const forms = (stem) => ['ي', 'ية', 'يا', 'يين', 'يون'].flatMap((end) => [`${stem}${end}`, `ال${stem}${end}`])

const NEEDLES = INTL_REGIONS.map(([key, words]) => [key, [...words, ...(ADJECTIVES[key] || []).flatMap(forms)].map((w) => norm(w))])

/** Zone d'une actualité « دولي » (clé de INTL_KEYS), ou '' (autre thème, ou zone non reconnue) */
export function intlRegion(it) {
  if (it?.category !== 'international') return ''
  const places = (it.places || []).map((p) => norm(p))
  for (const [key, words] of NEEDLES) if (words.some((w) => places.includes(w))) return key
  // Mots entiers seulement (« مالي » ne doit pas trouver « المالية ») ; préfixes و ب ل ف tolérés
  const tokens = norm(`${it.title || ''} ${it.summary || ''}`)
    .split(/[\s،,؛;!?؟]+/)
    .filter(Boolean)
    .map((t) => (/^[وبلف]..+/.test(t) && !/^ل[ا]/.test(t) ? [t, t.slice(1)] : [t]))
  const padded = ` ${tokens.map((t) => t[t.length - 1]).join(' ')} `
  const raw = ` ${tokens.map((t) => t[0]).join(' ')} `
  for (const [key, words] of NEEDLES) if (words.some((w) => raw.includes(` ${w} `) || padded.includes(` ${w} `))) return key
  return ''
}
