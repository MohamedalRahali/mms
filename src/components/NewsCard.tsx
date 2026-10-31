import { type CSSProperties, useState } from 'react'
import { type NewsItem } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { useFavorites } from '../lib/prefs'
import { useIntel } from '../lib/intel'
import { EntityChips, TagEditor, ToneBadge } from './Intel'
import { EngagementChips } from './Engagement'
import { canDo, useAuth } from '../lib/auth'
import { MediaBadge, MediaContext, MediaReactions, MediaTranscript } from './MediaParts'
import { PickBox } from './ReportPick'
import { BriefButton, CountryFlag, NetworkIcon, ProcessedToggle, SimilarFold } from './Listing'
import { PinButton } from './Pinboards'
import { EditItemButton } from './ItemEdit'
import { TranslateButton } from './Translate'
import { isNetwork } from '../lib/listing'

/** Fiabilité de la source, sur toutes les fiches (presse comprise, audit v4) : élevée, moyenne ou non confirmée */
function ReliabilityMark({ level }: { level?: NewsItem['reliability'] }) {
  const ar = useI18n().lang === 'ar'
  // Quatre niveaux (audit v5) : agence ou média établi, média en ligne, compte social identifié, compte anonyme
  const LABEL: Record<string, [string, string, string]> = {
    high: ['✓', 'موثوقية عالية', 'High reliability'],
    medium: ['◐', 'موثوقية متوسطة', 'Medium reliability'],
    social: ['◔', 'حساب اجتماعي معروف', 'Identified social account'],
    low: ['?', 'مصدر غير مؤكد', 'Unverified source'],
  }
  const l = level && LABEL[level]
  if (!l) return null
  const label = ar ? l[1] : l[2]
  return (
    <span className={`news-rel news-rel--${level}`} title={label}>
      {l[0]} <span className="news-rel__label">{label}</span>
    </span>
  )
}

export const HEART = 'M12 21s-7.5-4.6-9.6-9.3C1 8.4 3 5 6.4 5c2 0 3.3 1 4.1 2.2h3C14.3 6 15.6 5 17.6 5 21 5 23 8.4 21.6 11.7 19.5 16.4 12 21 12 21z'

/** Couleur et pictogramme de l'image de repli, par thème */
const COVER: Record<string, [string, string]> = {
  politique: ['#2f6fdb', 'M12 2 2 7v2h20V7L12 2zM4 11v7h3v-7H4zm6.5 0v7h3v-7h-3zM17 11v7h3v-7h-3zM2 20v2h20v-2H2z'],
  économie: ['#e8742a', 'M3 17l6-6 4 4 7-8v4h2V3h-8v2h4l-5 6-4-4-8 8 2 2z'],
  énergie: ['#c9921b', 'M13 2 4 14h6l-1 8 9-12h-6l1-8z'],
  société: [
    '#17a589',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 13c-4 0-7 2-7 4.5V20h14v-2.5C16 15 13 13 9 13zm8 0c-.6 0-1.2 0-1.7.2 1.6 1 2.7 2.5 2.7 4.3V20h5v-2.5c0-2.5-3-4.5-6-4.5z',
  ],
  santé: ['#e04848', 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3z'],
  international: [
    '#6c5ce7',
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3zm.8 2h3a15.7 15.7 0 0 0 1.4 3.6A8 8 0 0 1 5.1 16zm3-8h-3a8 8 0 0 1 4.4-3.6C8 5.6 7.5 6.8 8.1 8zM12 20c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h3a8 8 0 0 1-4.4 3.6zm1.7-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4h-3.4z',
  ],
  sécurité: ['#37474f', 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z'],
  sport: [
    '#2e9e44',
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 3.1 2.6 1.9-.9 3H9.3l-.9-3L11 5.1V5h2v.1zM5.4 9.7l2.1-1.5.9 2.9-1.8 2.6-2.2-.3a8 8 0 0 1 1-3.7zm1.9 8.1.9-2.4h3.1l1.4 2.3a8 8 0 0 1-5.4.1zm8 .3 1.4-2.4h2.4a8 8 0 0 1-3.8 2.4zm4.4-4.4h-2.3l-1.7-2.6.9-2.9 2.1 1.5c.6 1.2.9 2.6 1 4z',
  ],
  météo: ['#3b8ed0', 'M19 18H7a5 5 0 1 1 1.4-9.8A6 6 0 0 1 19.6 10 4 4 0 0 1 19 18z'],
  culture: ['#b0478e', 'M12 3v10.6A4 4 0 1 0 14 17V7h4V3h-6z'],
  'faits divers': ['#8d6e63', 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z'],
}
const COVER_OTHER: [string, string] = ['#0d7a52', 'M4 4h16v12H5.2L4 17.2V4zm2 3v2h12V7H6zm0 4v2h9v-2H6z']

/** Image de repli : dégradé du thème, pictogramme et source, quand l'article n'a pas de photo */
function NewsCover({ item }: { item: NewsItem }) {
  const i = useI18n()
  const [color, icon] = COVER[item.category] ?? COVER_OTHER
  return (
    <div className="news-cover" style={{ '--cover': color } as CSSProperties} aria-hidden>
      <svg className="news-cover__rings" viewBox="0 0 200 200">
        <circle cx="160" cy="40" r="30" />
        <circle cx="160" cy="40" r="60" />
        <circle cx="160" cy="40" r="90" />
      </svg>
      <svg className="news-cover__icon" viewBox="0 0 24 24">
        <path d={icon} />
      </svg>
      <span className="news-cover__cat">
        {i.category(item.category)}
        {item.intl && ` · ${i.intl(item.intl)}`}
      </span>
      <span className="news-cover__src" dir="auto">
        {item.origin}
      </span>
    </div>
  )
}

/** Photo de l'article (fondu à l'arrivée), remplacée par l'image de repli si elle manque ou ne se charge pas */
function NewsMedia({ item }: { item: NewsItem }) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading')
  const photo = item.image && state !== 'failed'
  return (
    <div className={photo ? `news-card__media is-${state}` : 'news-card__media'}>
      {photo ? (
        <img
          src={item.image}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState('ok')}
          onError={() => setState('failed')}
        />
      ) : (
        <NewsCover item={item} />
      )}
    </div>
  )
}

/** Carte compacte de la vue en colonnes : source, drapeau, titre, date et tonalité */
function CompactCard({ item, brief }: { item: NewsItem; brief: boolean }) {
  const i = useI18n()
  return (
    <article className={item.processed ? 'news-mini is-done' : 'news-mini'}>
      <p className="news-mini__src">
        <CountryFlag cc={item.country} />
        {isNetwork(item.channel) && <NetworkIcon name={item.channel} size={14} />}
        <span dir="auto">{item.origin}</span>
        <ReliabilityMark level={item.reliability} />
        <time>{i.dateTime(item.date)}</time>
      </p>
      <h4 dir="auto">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            {item.title}
          </a>
        ) : (
          item.title
        )}
      </h4>
      <p className="news-mini__meta">
        <ToneBadge tone={item.tone} />
        <ProcessedToggle item={item} />
      </p>
      {brief && item.lang !== 'ar' && <BriefButton item={item} />}
      <SimilarFold items={item.similar} more={item.similarMore} />
    </article>
  )
}

/** Carte d'actualité ; « board » reprend la grande carte NewsBoard (liseré rouge, titre en grand), « compact » la vue en colonnes */
export function NewsCard({ item, variant = 'list', brief = false }: { item: NewsItem; variant?: 'list' | 'board' | 'compact'; brief?: boolean }) {
  if (variant === 'compact') return <CompactCard item={item} brief={brief} />
  return <FullCard item={item} variant={variant} brief={brief} />
}

function FullCard({ item, variant, brief }: { item: NewsItem; variant: 'list' | 'board'; brief: boolean }) {
  const i = useI18n()
  const fav = useFavorites()
  const x = useIntel()
  const liked = fav.has(item.id)
  const important = (item.importance ?? 1) >= 2
  const auth = useAuth()
  return (
    <article className={`news-card news-card--${item.flux} news-card--${variant}${item.processed ? ' is-done' : ''}`}>
      <NewsMedia item={item} />
      <div className="news-card__body">
        <p className="news-card__source">
          <span className="news-card__origin">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              {/* Icône de source (journal) : l'ancien arc de cercle ressemblait à un chargement sans fin */}
              <path d="M5 4h11a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zm3 4h7M8 12h7M8 16h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span dir="auto">{item.origin}</span>
            <CountryFlag cc={item.country} />
            {isNetwork(item.channel) && <NetworkIcon name={item.channel} size={15} />}
            <ReliabilityMark level={item.reliability} />
          </span>
          <span className="news-card__tools">
            {variant === 'list' && <ProcessedToggle item={item} />}
            {variant === 'list' && <PinButton item={item} />}
            {variant === 'list' && <EditItemButton item={item} />}
            <PickBox item={item} />
            <button
              type="button"
              className={liked ? 'news-card__fav is-on' : 'news-card__fav'}
              aria-pressed={liked}
              title={liked ? i.t.favRemove : i.t.favAdd}
              onClick={() => fav.toggle(item)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path d={HEART} />
              </svg>
            </button>
            <span className={`mms-flag mms-flag--${item.flux}`} title={i.flux(item.flux)} />
          </span>
        </p>
        <MediaContext item={item} />
        <h3 dir="auto">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </h3>
        {item.summary && (
          <p className="news-card__text" dir="auto">
            {item.summary}
          </p>
        )}
        {brief && item.lang !== 'ar' && <BriefButton item={item} />}
        <TranslateButton item={item} />
        <p className="news-card__meta">
          <span>{i.dateTime(item.date)}</span>
          <span>{i.channel(item.channel)}</span>
          <MediaBadge item={item} />
          {item.lang && <span>{i.language(item.lang)}</span>}
          {variant === 'list' && (
            <span className="news-badge">
              {i.category(item.category)}
              {item.intl && ` · ${i.intl(item.intl)}`}
            </span>
          )}
          <ToneBadge tone={item.tone} />
          {important && <span className={`mms-importance mms-importance--${item.importance}`}>{x.importance[item.importance ?? 2]}</span>}
          {item.broadcasts > 1 && <span className="news-badge news-badge--rep">{i.t.broadcastTimes(item.broadcasts)}</span>}
          {item.live && <span className="mms-tag mms-tag--live">{i.t.notConsolidated}</span>}
          {item.demo && <span className="mms-tag mms-tag--demo">{i.t.example}</span>}
        </p>
        <MediaTranscript item={item} />
        <EngagementChips value={item.engagement} />
        <MediaReactions item={item} />
        <EntityChips item={item} />
        <SimilarFold items={item.similar} more={item.similarMore} />
        {variant === 'list' && canDo(auth?.user, 'tags') && <TagEditor item={item} />}
      </div>
    </article>
  )
}
