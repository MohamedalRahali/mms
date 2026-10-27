import { useEffect, useState, useSyncExternalStore } from 'react'
import { installPrompt, isInstalled, isIOS, runInstall, subscribeInstall } from '../lib/install'

const TEXT = {
  ar: {
    install: 'تثبيت التطبيق',
    iosTitle: 'تثبيت MMS على iPhone / iPad',
    ios: ['اضغط على زر المشاركة', 'في شريط Safari.', 'ثم اختر «إضافة إلى الشاشة الرئيسية».', 'ستظهر أيقونة MMS على الشاشة الرئيسية.'],
    otherTitle: 'تثبيت MMS',
    other: 'افتح قائمة المتصفح (⋮ أو ⋯) واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». على الحاسوب يمكن أيضًا الضغط على أيقونة التثبيت في شريط العنوان.',
    close: 'حسنًا',
  },
  en: {
    install: 'Install app',
    iosTitle: 'Install MMS on iPhone / iPad',
    ios: ['Tap the Share button', 'in the Safari toolbar.', 'Then choose “Add to Home Screen”.', 'The MMS icon will appear on your home screen.'],
    otherTitle: 'Install MMS',
    other: 'Open the browser menu (⋮ or ⋯) and choose “Install app” or “Add to Home screen”. On a computer you can also click the install icon in the address bar.',
    close: 'OK',
  },
}

const DOWNLOAD = 'M11 3h2v9l3.5-3.5 1.4 1.4L12 15.8 6.1 9.9l1.4-1.4L11 12V3zM5 18h14v2H5z'
const SHARE = 'M12 2.6 7.8 6.8l1.4 1.4L11 6.4V15h2V6.4l1.8 1.8 1.4-1.4L12 2.6zM5 10v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10h-3v2h1v8H7v-8h1v-2H5z'

/** Bouton « Installer l'application » : invite native, ou mode d'emploi (iPhone, autres navigateurs) */
export function InstallButton({ lang, className = 'mms-tool__btn mms-install' }: { lang: 'ar' | 'en'; className?: string }) {
  const t = TEXT[lang]
  const hasPrompt = useSyncExternalStore(subscribeInstall, () => installPrompt() !== null)
  const done = useSyncExternalStore(subscribeInstall, isInstalled)
  const [help, setHelp] = useState<'ios' | 'other' | null>(null)

  useEffect(() => {
    if (!help) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHelp(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [help])

  if (done) return null
  return (
    <>
      <button
        type="button"
        className={className}
        title={t.install}
        aria-label={t.install}
        data-ready={hasPrompt || undefined}
        onClick={async () => {
          if (await runInstall()) return
          setHelp(isIOS() ? 'ios' : 'other')
        }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path fill="currentColor" d={DOWNLOAD} />
        </svg>
        <span className="mms-install__label">{t.install}</span>
      </button>
      {help && (
        <div
          className="mms-modal mms-install-help"
          role="dialog"
          aria-modal="true"
          aria-label={help === 'ios' ? t.iosTitle : t.otherTitle}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          onClick={(e) => e.target === e.currentTarget && setHelp(null)}
        >
          <div className="mms-modal__box mms-install-help__box">
            <img src="/icons-cnsd/icon-192.png" alt="" width="64" height="64" />
            <h3>{help === 'ios' ? t.iosTitle : t.otherTitle}</h3>
            {help === 'ios' ? (
              <ol>
                <li>
                  {t.ios[0]}{' '}
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                    <path fill="currentColor" d={SHARE} />
                  </svg>{' '}
                  {t.ios[1]}
                </li>
                <li>{t.ios[2]}</li>
                <li>{t.ios[3]}</li>
              </ol>
            ) : (
              <p>{t.other}</p>
            )}
            <div className="mms-modal__actions">
              <button type="button" className="news-btn" onClick={() => setHelp(null)} autoFocus>
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
