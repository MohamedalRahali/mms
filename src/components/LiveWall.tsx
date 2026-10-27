import { useEffect, useRef, useState } from 'react'
import { useFetch } from '../lib/news'
import { useI18n } from '../lib/i18n'
import { MediaIcon } from './MediaParts'
import './live.css'

/**
 * Mur du direct « البث المباشر » : toutes les chaînes TV en même temps, sans son, et les radios ; un clic ouvre la
 * chaîne en grand avec le son. Sources officielles seulement (flux HLS de la chaîne, ou son direct YouTube officiel).
 * Pendant la vue en grand, les autres écrans s'arrêtent (moins de bande passante qu'une rangée d'écrans muets).
 */

type LiveChannel = {
  id: string
  nom: string
  canal: 'tv' | 'radio'
  mode: 'hls' | 'audio' | 'youtube' | 'none'
  src?: string
  live?: boolean | null
  videoId?: string
  channelId?: string
  site?: string
  last?: string | null
  reason?: 'referer' | 'nosource'
}

// Écrans lus en même temps au plus ; les suivants attendent un clic
const MAX_PLAYING = 6

const TEXT = {
  ar: {
    title: 'البث المباشر',
    sub: 'كل القنوات في الوقت نفسه وبدون صوت. انقر على شاشة لمشاهدتها كبيرة مع الصوت.',
    onAir: (n: string) => `${n} على الهواء`,
    tv: 'القنوات التلفزيونية',
    radios: 'الإذاعات',
    live: 'مباشر',
    offline: 'لا يوجد بث مباشر الآن',
    offlineSite: 'البث متاح على موقع القناة فقط · انقر للرابط',
    site: 'مشاهدة البث على موقع القناة الرسمي',
    unavailable: 'غير قابل للتشغيل في المتصفح',
    referer: 'الرابط الرسمي لا يعمل إلا على موقع القناة',
    nosource: 'لا يوجد رابط بث عام',
    paused: 'متوقف لتخفيف الاستهلاك · انقر للمشاهدة',
    limit: (n: number) => `تُشغَّل ${n} شاشات كحدّ أقصى في الوقت نفسه لتخفيف الاستهلاك.`,
    last: 'آخر تسجيل',
    listen: 'انقر للاستماع',
    noRadio: 'لا توجد إذاعة مفعّلة برابط بث عام حالياً.',
    noTv: 'لا توجد قناة مفعّلة حالياً.',
    youtube: 'فتح القناة على يوتيوب',
    close: 'إغلاق',
    fullscreen: 'ملء الشاشة',
    failed: 'تعذّر تشغيل هذا البث في المتصفح.',
    viaYoutube: 'عبر يوتيوب',
    viaHls: 'البث الرسمي',
    viaSite: 'موقع القناة',
  },
  en: {
    title: 'Live wall',
    sub: 'Every channel at once, muted. Click a screen to watch it large with sound.',
    onAir: (n: string) => `${n} on air`,
    tv: 'TV channels',
    radios: 'Radio stations',
    live: 'LIVE',
    offline: 'Not live right now',
    offlineSite: 'Live only on the channel’s website · click for the link',
    site: 'Watch on the channel’s official website',
    unavailable: 'Cannot play in the browser',
    referer: 'The official stream only plays on the channel’s own site',
    nosource: 'No public stream',
    paused: 'Paused to save bandwidth · click to watch',
    limit: (n: number) => `At most ${n} screens play at once to save bandwidth.`,
    last: 'Last recording',
    listen: 'Click to listen',
    noRadio: 'No radio station with a public stream is enabled yet.',
    noTv: 'No TV channel is enabled yet.',
    youtube: 'Open the channel on YouTube',
    close: 'Close',
    fullscreen: 'Full screen',
    failed: 'This stream cannot be played in the browser.',
    viaYoutube: 'via YouTube',
    viaHls: 'official stream',
    viaSite: 'Channel website',
  },
}

// Direct YouTube : vidéo en cours si le serveur l'a trouvée ; s'il n'a pas pu lire YouTube, l'embed « live_stream » de la
// chaîne officielle (YouTube affiche lui-même le direct ou sa carte hors antenne)
const ytLive = (c: LiveChannel) => (c.live && c.videoId ? c.videoId : c.live === null && c.channelId ? `live_stream?channel=${c.channelId}` : '')

const playable = (c: LiveChannel) => c.mode === 'hls' || c.mode === 'audio' || (c.mode === 'youtube' && !!ytLive(c))

const ytEmbed = (c: LiveChannel, sound: boolean) => {
  const path = ytLive(c)
  const params = `autoplay=1&mute=${sound ? 0 : 1}&controls=${sound ? 1 : 0}&playsinline=1&rel=0&modestbranding=1`
  return `https://www.youtube-nocookie.com/embed/${path}${path.includes('?') ? '&' : '?'}${params}`
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const on = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return setSeen(true)
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, seen] as const
}

/** Flux HLS : lecture native (Safari) ou hls.js chargé à la demande ; qualité la plus basse dans la grille */
function HlsVideo({ src, low, onFail }: { src: string; low: boolean; onFail: () => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    let hls: { destroy: () => void } | null = null
    let stopped = false
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.play().catch(() => {})
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (stopped) return
        if (!Hls.isSupported()) return onFail()
        const h = new Hls({ startLevel: low ? 0 : -1, capLevelToPlayerSize: true, maxBufferLength: low ? 8 : 30, backBufferLength: low ? 0 : 30 })
        hls = h
        if (low) h.on(Hls.Events.MANIFEST_PARSED, () => (h.autoLevelCapping = 0))
        h.on(Hls.Events.ERROR, (_e, d) => d.fatal && onFail())
        h.loadSource(src)
        h.attachMedia(video)
        video.play().catch(() => {})
      }, onFail)
    }
    return () => {
      stopped = true
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [src, low, onFail])
  return <video ref={ref} muted={low} autoPlay playsInline controls={!low} onError={onFail} />
}

function statusOf(c: LiveChannel, x: (typeof TEXT)['ar']) {
  if (c.mode === 'none') return c.reason === 'referer' ? x.referer : x.nosource
  if (c.mode === 'youtube' && !ytLive(c)) return c.site ? x.offlineSite : c.live === false ? x.offline : x.unavailable
  return ''
}

/** Source affichée au pied de l'écran : direct YouTube, flux officiel, ou site de la chaîne (flux réservé à son lecteur) */
function viaOf(c: LiveChannel, x: (typeof TEXT)['ar']) {
  if (c.mode === 'hls' || c.mode === 'audio') return x.viaHls
  if (c.site && !ytLive(c)) return x.viaSite
  return c.mode === 'youtube' ? x.viaYoutube : ''
}

function Tile({ c, play, onOpen }: { c: LiveChannel; play: boolean; onOpen: () => void }) {
  const i = useI18n()
  const x = TEXT[i.lang]
  const [ref, seen] = useOnScreen<HTMLDivElement>()
  const [failed, setFailed] = useState(false)
  const fail = useRef(() => setFailed(true)).current
  const ok = playable(c) && !failed
  const running = ok && play && seen
  const status = failed ? x.failed : statusOf(c, x)

  return (
    <div ref={ref} className={`lw-tile${ok ? ' is-live' : ' is-off'}`}>
      <div className="lw-tile__screen">
        {running && c.mode === 'hls' && c.src && <HlsVideo src={c.src} low onFail={fail} />}
        {running && c.mode === 'youtube' && (
          <iframe src={ytEmbed(c, false)} title={c.nom} allow="autoplay; encrypted-media; picture-in-picture" loading="lazy" tabIndex={-1} />
        )}
        {!running && (
          <div className="lw-tile__poster">
            <MediaIcon name="tv" size={34} />
            <span>{ok ? x.paused : status}</span>
            {c.last && !ok && (
              <small>
                {x.last} : {i.dateTime(c.last)}
              </small>
            )}
          </div>
        )}
      </div>
      <button type="button" className="lw-tile__hit" onClick={onOpen} aria-label={`${c.nom}${ok ? ` · ${x.live}` : ` · ${status}`}`}>
        <span className="lw-tile__name" dir="auto">
          {c.nom}
        </span>
        {ok && <span className="lw-badge">{x.live}</span>}
        <span className="lw-tile__via">{viaOf(c, x)}</span>
      </button>
    </div>
  )
}

function RadioTile({ c, active, onOpen }: { c: LiveChannel; active: boolean; onOpen: () => void }) {
  const i = useI18n()
  const x = TEXT[i.lang]
  const ok = playable(c)
  return (
    <button type="button" className={`lw-radio${ok ? ' is-live' : ' is-off'}${active ? ' is-on' : ''}`} onClick={onOpen}>
      <MediaIcon name="radio" size={22} />
      <span className="lw-radio__name" dir="auto">
        {c.nom}
      </span>
      {ok ? (
        <span className="lw-eq" aria-hidden>
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : null}
      <small>{ok ? x.listen : statusOf(c, x)}</small>
    </button>
  )
}

function Focus({ c, onClose }: { c: LiveChannel; onClose: () => void }) {
  const i = useI18n()
  const x = TEXT[i.lang]
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const fail = useRef(() => setFailed(true)).current
  const ok = playable(c) && !failed

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    box.current?.focus()
    return () => document.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="lw-focus" role="dialog" aria-modal="true" aria-label={c.nom} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lw-focus__box" ref={box} tabIndex={-1}>
        <header>
          <MediaIcon name={c.canal === 'radio' ? 'radio' : 'tv'} size={20} />
          <b dir="auto">{c.nom}</b>
          {ok && <span className="lw-badge">{x.live}</span>}
          <span className="lw-focus__tools">
            {c.canal === 'tv' && (
              <button type="button" className="news-btn news-btn--ghost" onClick={() => box.current?.requestFullscreen?.().catch(() => {})}>
                {x.fullscreen}
              </button>
            )}
            <button type="button" className="news-btn" onClick={onClose}>
              {x.close}
            </button>
          </span>
        </header>
        <div className={c.canal === 'radio' ? 'lw-focus__stage is-radio' : 'lw-focus__stage'}>
          {ok && c.mode === 'hls' && c.src && <HlsVideo src={c.src} low={false} onFail={fail} />}
          {ok && c.mode === 'youtube' && (
            <iframe src={ytEmbed(c, true)} title={c.nom} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          )}
          {ok && c.mode === 'audio' && c.src && (
            <div className="lw-focus__radio">
              <span className="lw-eq is-big" aria-hidden>
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <audio src={c.src} controls autoPlay onError={fail} />
            </div>
          )}
          {!ok && (
            <div className="lw-tile__poster">
              <MediaIcon name={c.canal === 'radio' ? 'radio' : 'tv'} size={44} />
              <span>{failed ? x.failed : statusOf(c, x)}</span>
              {c.last && (
                <small>
                  {x.last} : {i.dateTime(c.last)}
                </small>
              )}
            </div>
          )}
        </div>
        <p className="lw-focus__links">
          {c.site && (
            <a className="lw-focus__link" href={c.site} target="_blank" rel="noopener noreferrer">
              {x.site}
            </a>
          )}
          {c.mode === 'youtube' && c.src && (
            <a className="lw-focus__link" href={c.src} target="_blank" rel="noopener noreferrer">
              {x.youtube}
            </a>
          )}
        </p>
      </div>
    </div>
  )
}

export function LiveWall() {
  const i = useI18n()
  const x = TEXT[i.lang]
  const { data, error } = useFetch<{ channels: LiveChannel[] }>('/api/media/live', 60_000)
  const [focus, setFocus] = useState<LiveChannel | null>(null)
  const visible = usePageVisible()
  const channels = data?.channels ?? []
  // Écrans en direct d'abord
  const tvs = channels.filter((c) => c.canal === 'tv').sort((a, b) => Number(playable(b)) - Number(playable(a)))
  const radios = channels.filter((c) => c.canal === 'radio').sort((a, b) => Number(playable(b)) - Number(playable(a)))
  const onAir = channels.filter(playable).length
  const liveTvs = tvs.filter(playable)

  return (
    <div className="lw mms-media--broadcast">
      <header className="mms-mpage__head">
        <span className="mms-mpage__ico">
          <MediaIcon name="live" size={26} />
        </span>
        <div>
          <h2>{x.title}</h2>
          <p>{x.sub}</p>
        </div>
        {data && <span className="lw-onair">{x.onAir(i.num(onAir))}</span>}
      </header>

      {error && <p className="news-status news-status--error">{i.t.loadError}</p>}
      {!data && !error && <p className="news-status">{i.t.loading}</p>}

      {data && (
        <>
          <h3 className="lw-h">{x.tv}</h3>
          {tvs.length === 0 && <p className="mms-mpage__empty">{x.noTv}</p>}
          <div className="lw-grid">
            {tvs.map((c) => (
              <Tile key={c.id} c={c} play={visible && !focus && liveTvs.indexOf(c) < MAX_PLAYING} onOpen={() => setFocus(c)} />
            ))}
          </div>
          {liveTvs.length > MAX_PLAYING && <p className="lw-note">{x.limit(MAX_PLAYING)}</p>}

          <h3 className="lw-h">{x.radios}</h3>
          {radios.length === 0 ? (
            <p className="mms-mpage__empty">{x.noRadio}</p>
          ) : (
            <div className="lw-radios">
              {radios.map((c) => (
                <RadioTile key={c.id} c={c} active={focus?.id === c.id} onOpen={() => setFocus(c)} />
              ))}
            </div>
          )}
        </>
      )}

      {focus && <Focus c={focus} onClose={() => setFocus(null)} />}
    </div>
  )
}
