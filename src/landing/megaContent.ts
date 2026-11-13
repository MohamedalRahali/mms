/**
 * Méga-menus, pages de présentation et assistant « Around » de la vitrine publique Mearsaad (anglais, français, arabe).
 * Contenu original, fonctions décrites = fonctions réelles de MMS (aucun client, chiffre ou récompense inventé).
 */
import type { LandingLang } from './copy'

/** Illustration animée d'une page ou d'une carte vedette (schéma de l'interface) */
export type Visual = 'monitor' | 'broadcast' | 'intel' | 'ai' | 'alerts' | 'reports' | 'shield' | 'globe' | 'team' | 'book' | 'code'

export const PAGES = {
  platform: { path: '/platform', icon: 'layers', visual: 'intel' },
  around: { path: '/around', icon: 'spark', visual: 'ai' },
  monitoring: { path: '/features/media-monitoring', icon: 'news', visual: 'monitor' },
  social: { path: '/features/social-listening', icon: 'social', visual: 'monitor' },
  broadcast: { path: '/features/tv-radio', icon: 'tv', visual: 'broadcast' },
  radar: { path: '/features/smart-radar', icon: 'target', visual: 'alerts' },
  alerts: { path: '/features/alerts', icon: 'bell', visual: 'alerts' },
  briefings: { path: '/features/briefings', icon: 'doc', visual: 'reports' },
  dashboards: { path: '/features/dashboards', icon: 'chart', visual: 'intel' },
  reports: { path: '/features/reports', icon: 'doc', visual: 'reports' },
  watches: { path: '/features/private-watches', icon: 'eye', visual: 'monitor' },
  aivis: { path: '/features/ai-visibility', icon: 'spark', visual: 'ai' },
  api: { path: '/features/integrations-api', icon: 'code', visual: 'code' },
  reputation: { path: '/solutions/reputation-crisis', icon: 'shield', visual: 'alerts' },
  intelligence: { path: '/solutions/strategic-intelligence', icon: 'trend', visual: 'intel' },
  pr: { path: '/solutions/pr-impact', icon: 'pr', visual: 'reports' },
  opinion: { path: '/solutions/public-opinion', icon: 'users', visual: 'monitor' },
  benchmark: { path: '/solutions/share-of-voice', icon: 'chart', visual: 'intel' },
  government: { path: '/solutions/government', icon: 'gov', visual: 'globe' },
  enterprise: { path: '/solutions/enterprise', icon: 'building', visual: 'intel' },
  agencies: { path: '/solutions/agencies', icon: 'briefcase', visual: 'reports' },
  newsrooms: { path: '/solutions/newsrooms', icon: 'media', visual: 'broadcast' },
  why: { path: '/why-mearsaad', icon: 'star', visual: 'globe' },
  languages: { path: '/why-mearsaad/languages', icon: 'language', visual: 'ai' },
  coverage: { path: '/why-mearsaad/coverage', icon: 'globe', visual: 'globe' },
  support: { path: '/why-mearsaad/support', icon: 'headset', visual: 'team' },
  security: { path: '/security', icon: 'lock', visual: 'shield' },
  help: { path: '/resources/help-center', icon: 'headset', visual: 'book' },
  academy: { path: '/resources/academy', icon: 'users', visual: 'team' },
  guides: { path: '/resources/guides', icon: 'book', visual: 'book' },
  glossary: { path: '/resources/glossary', icon: 'doc', visual: 'book' },
  about: { path: '/company/about', icon: 'globe', visual: 'globe' },
  careers: { path: '/company/careers', icon: 'briefcase', visual: 'team' },
  press: { path: '/company/press', icon: 'news', visual: 'book' },
  contact: { path: '/company/contact', icon: 'mail', visual: 'team' },
} satisfies Record<string, { path: string; icon: string; visual: Visual }>

export type PageKey = keyof typeof PAGES
export const pageFromPath = (p: string): PageKey | null => {
  const clean = p.replace(/\/+$/, '') || '/'
  return (Object.keys(PAGES) as PageKey[]).find((k) => PAGES[k].path === clean) ?? null
}

/** Lien de menu : une page (clé), ou une ancre de la page d'accueil (#tour) */
export type Target = PageKey | `#${string}`
export const hrefOf = (t: Target) => (t.startsWith('#') ? `/${t}` : PAGES[t as PageKey].path)

export type MenuKey = 'product' | 'solutions' | 'why' | 'resources' | 'company'
export const MENU_KEYS: MenuKey[] = ['product', 'solutions', 'why', 'resources', 'company']
/** Menu « d'origine » d'une page (pour le fil d'Ariane et l'onglet actif) : le produit d'abord, les ressources en dernier */
export const menuOf = (menus: Record<MenuKey, { cols: unknown; intros?: unknown; quick?: unknown }>, k: string): MenuKey =>
  (['product', 'why', 'company', 'solutions', 'resources'] as MenuKey[]).find((m) => JSON.stringify(menus[m]).includes(`"to":"${k}"`)) ?? 'product'

type Item = { to: Target; label: string; desc?: string }
type Intro = { to: Target; title: string; text: string; cta: string; icon?: string }
type Featured = { to: Target; visual: Visual; tag: string; title: string; text: string; cta: string }
export type Menu = {
  label: string
  layout: 'intro' | 'columns' | 'compact'
  intros?: Intro[]
  quick?: Item[]
  cols: { heading?: string; items: Item[] }[]
  featured: Featured
}

type PageCopy = { eyebrow: string; title: string; lead: string; points: [string, string][] }

export type Mega = {
  menus: Record<MenuKey, Menu>
  pages: Record<PageKey, PageCopy>
  ui: { home: string; related: string; explore: string; back: string; demoTitle: string; demoText: string; demo: string; login: string; open: string; close: string }
  ask: {
    button: string
    title: string
    subtitle: string
    hello: string
    placeholder: string
    send: string
    suggestions: string
    fallback: string
    demo: string
    readMore: string
    disclaimer: string
    qa: { q: string; a: string; to: Target; keys: string[] }[]
  }
}

/* ======================================================================== English */

const en: Mega = {
  menus: {
    product: {
      label: 'Product',
      layout: 'intro',
      intros: [
        { to: 'platform', title: 'The Mearsaad platform', text: 'Media monitoring and intelligence in one workspace: every source, every language, analysed continuously.', cta: 'Explore the platform', icon: 'layers' },
        { to: 'around', title: 'Around, AI assistant', text: 'Ask your coverage a question and get a sourced answer, a summary or a briefing in seconds.', cta: 'Meet Around', icon: 'spark' },
      ],
      cols: [
        {
          heading: 'Capabilities',
          items: [
            { to: 'monitoring', label: 'Media monitoring', desc: 'Online news, print and podcasts in one feed' },
            { to: 'social', label: 'Social listening', desc: 'Follow conversations on networks and forums' },
            { to: 'broadcast', label: 'TV & radio monitoring', desc: 'Live channels, transcripts and clips' },
          ],
        },
        {
          items: [
            { to: 'radar', label: 'Smart radar', desc: 'Emerging topics and weak signals, spotted early' },
            { to: 'alerts', label: 'Alerts & activity alarm', desc: 'Spikes and negative tone, flagged instantly' },
            { to: 'watches', label: 'Private watches', desc: 'Confidential monitoring for sensitive subjects' },
          ],
        },
      ],
      featured: { to: 'briefings', visual: 'reports', tag: 'New', title: 'Daily AI briefings', text: 'A written summary of what changed overnight, in your language, in every inbox before the first meeting.', cta: 'Learn more' },
    },
    solutions: {
      label: 'Solutions',
      layout: 'columns',
      cols: [
        {
          heading: 'By use case',
          items: [
            { to: 'reputation', label: 'Reputation & crisis management' },
            { to: 'intelligence', label: 'Strategic intelligence & weak signals' },
            { to: 'pr', label: 'Press relations & campaign impact' },
            { to: 'opinion', label: 'Public opinion tracking' },
            { to: 'benchmark', label: 'Benchmark & share of voice' },
          ],
        },
        {
          heading: 'By organisation',
          items: [
            { to: 'government', label: 'Government & institutions' },
            { to: 'enterprise', label: 'Enterprises & groups' },
            { to: 'agencies', label: 'Communication agencies' },
            { to: 'newsrooms', label: 'Media & newsrooms' },
          ],
        },
        {
          heading: 'By capability',
          items: [
            { to: 'broadcast', label: 'TV & radio monitoring' },
            { to: 'monitoring', label: 'Online news monitoring' },
            { to: 'social', label: 'Social listening' },
            { to: 'around', label: 'Around AI assistant' },
            { to: 'watches', label: 'Private watches' },
          ],
        },
      ],
      featured: { to: '#tour', visual: 'monitor', tag: 'Interactive', title: 'Guided product tour', text: 'See the platform in action. Walk through monitoring, broadcast, analysis, AI, alerts and reports step by step.', cta: 'Start the tour' },
    },
    why: {
      label: 'Why Mearsaad',
      layout: 'intro',
      intros: [{ to: 'why', title: 'Why Mearsaad', text: 'Built in the region, for teams whose decisions depend on Arabic, French and English media.', cta: 'Discover why Mearsaad', icon: 'star' }],
      cols: [
        {
          heading: 'Why teams choose us',
          items: [
            { to: 'languages', label: 'Arabic first, truly multilingual', desc: 'Arabic, French and English analysed natively, interface included' },
            { to: 'coverage', label: 'Regional coverage that goes deep', desc: 'Local channels, radios, websites and pages others miss' },
            { to: 'security', label: 'Institution-grade security', desc: 'Isolated workspaces, two-factor and face verification' },
            { to: 'support', label: 'A team at your side', desc: 'Set-up, training and analysts from Around Expressions' },
          ],
        },
      ],
      featured: { to: 'security', visual: 'shield', tag: 'Trust', title: 'Your data stays yours', text: 'Each client runs in its own isolated workspace, with personal access, a full audit log and copy protection.', cta: 'Read about security' },
    },
    resources: {
      label: 'Resources',
      layout: 'intro',
      intros: [
        { to: 'help', title: 'Help center', text: 'Answers, how-tos and support for every Mearsaad user.', cta: 'Visit the help center', icon: 'headset' },
        { to: 'academy', title: 'Mearsaad Academy', text: 'Training sessions to get your team productive from the first week.', cta: 'See the training', icon: 'users' },
      ],
      cols: [
        {
          items: [
            { to: 'guides', label: 'Practical guides' },
            { to: 'glossary', label: 'Media monitoring glossary' },
            { to: '#tour', label: 'Product tour' },
            { to: 'contact', label: 'Ask an expert' },
          ],
        },
      ],
      featured: { to: 'guides', visual: 'book', tag: 'Guide', title: 'Write a Boolean query that works', text: 'AND, OR, NOT, exact phrases and Arabic spelling variants: build searches that catch everything and nothing else.', cta: 'Read the guide' },
    },
    company: {
      label: 'Company',
      layout: 'compact',
      cols: [
        {
          items: [
            { to: 'about', label: 'Our story' },
            { to: 'careers', label: 'Careers' },
            { to: 'press', label: 'Press & media kit' },
            { to: 'contact', label: 'Contact' },
          ],
        },
      ],
      featured: { to: 'about', visual: 'globe', tag: 'Around Expressions', title: 'Mearsaad, مرصاد', text: 'The media mining and monitoring system designed by Around Expressions for institutions, brands and newsrooms.', cta: 'Our story' },
    },
  },
  pages: {
    platform: { eyebrow: 'Product', title: 'One platform for every story that matters', lead: 'Mearsaad collects online news, social media, TV and radio around the clock, analyses them with AI and gives each team the dashboards, alerts and reports it needs.', points: [['Every source in one feed', 'Websites, print, podcasts, social networks, YouTube, TV and radio, deduplicated and searchable together.'], ['Analysis that never stops', 'Tone, entities, topics and spikes are computed continuously, not at the end of the month.'], ['A workspace per client', 'Users, data, dashboards and settings are isolated for each organisation.'], ['Ready on day one', 'Our team configures your topics, sources and alerts with you.']] },
    around: { eyebrow: 'AI assistant', title: 'Around: ask your coverage, get a sourced answer', lead: 'Around reads the articles, posts and transcripts in your workspace and answers in your language, with references you can open.', points: [['Grounded answers', 'Every answer points to the coverage it is based on, so you can verify in one click.'], ['Summaries and briefings', 'Turn a week of coverage into a clear note for decision-makers.'], ['Explanations, not just numbers', 'Ask why a topic is rising or why tone turned negative.'], ['Exports included', 'Send an answer to a report, a PDF or a presentation.']] },
    monitoring: { eyebrow: 'Capability', title: 'Online news monitoring without the noise', lead: 'News websites, print and podcasts arrive in a single feed, folded into stories and searchable with precise Boolean queries.', points: [['Boolean search', 'AND, OR, NOT, exact phrases and spelling variants for Arabic names.'], ['Stories, not duplicates', 'Republished articles are grouped so you read each story once.'], ['Filters that matter', 'Topic, country, media type, tone and period in two clicks.'], ['Pinboards and saved searches', 'Keep and share the coverage your team works on.']] },
    social: { eyebrow: 'Capability', title: 'Social listening for the conversations that move opinion', lead: 'Follow pages, accounts, YouTube channels, forums and comments next to traditional media, with the same tone and topic analysis.', points: [['Networks and forums', 'Public posts, comments and discussions alongside the press.'], ['Reactions measured', 'See which posts drive engagement and debate.'], ['Same analysis everywhere', 'Tone, entities and topics computed identically for every source.'], ['Spikes flagged', 'Unusual activity on a page or a hashtag triggers an alert.']] },
    broadcast: { eyebrow: 'Capability', title: 'TV & radio monitoring, transcribed and searchable', lead: 'Follow channels live on one wall, read automatic transcripts and find the exact minute a name was said.', points: [['Live wall', 'Several TV and radio channels on one screen, with audio on demand.'], ['Automatic transcripts', 'Search spoken words like you search articles.'], ['Clips to share', 'Cut the relevant minutes and send them to your team.'], ['Programme summaries', 'AI summaries of each programme segment.']] },
    radar: { eyebrow: 'Capability', title: 'The smart radar spots what is about to matter', lead: 'Mearsaad compares every hour with its usual rhythm and surfaces emerging topics, rising people and stories picked up by many outlets.', points: [['Emerging topics', 'New subjects detected before they make headlines.'], ['Media mood barometer', 'Overall tone of coverage, hour by hour.'], ['Stories covered by many outlets', 'See when a story spreads from one source to many.'], ['One click to the evidence', 'Every signal opens the articles behind it.']] },
    alerts: { eyebrow: 'Capability', title: 'Alerts and an activity alarm you cannot miss', lead: 'Watches on any query notify the right people by email or Telegram, and the activity alarm sounds on screen when coverage spikes.', points: [['Thresholds you choose', 'Volume, negative tone or new sources: you decide what deserves an alert.'], ['Activity alarm', 'A full-screen alarm in the newsroom when unusual activity is detected.'], ['Alert workflow', 'Acknowledge, assign and close each alert with a history.'], ['Email and Telegram', 'Notifications where your team already works.']] },
    briefings: { eyebrow: 'New', title: 'Daily AI briefings, ready before the first meeting', lead: 'Each morning, Mearsaad writes a short summary of what changed on your topics, with links to the coverage, and sends it to your list.', points: [['Written for decision-makers', 'Key facts, tone and what to watch, in a few paragraphs.'], ['Your language', 'Arabic, French or English, whatever the source language.'], ['Scheduled delivery', 'Daily reviews and weekly briefings at the time you choose.'], ['Traceable', 'Every sentence links back to its sources.']] },
    dashboards: { eyebrow: 'Capability', title: 'Dashboards that explain the coverage', lead: 'Build dashboards from drag-and-drop widgets: volume, tone, share of voice, people, organisations, sources and regions.', points: [['Drag-and-drop widgets', 'Compose a view per team, topic or client.'], ['Period comparison', 'This week against last week, this month against last month.'], ['Read-only sharing', 'Share a live dashboard with a secure link.'], ['Map and timeline', 'Where and when the coverage happens.']] },
    reports: { eyebrow: 'Capability', title: 'Professional reports in minutes', lead: 'Select the stories that matter, add your analysis and export a branded report, or schedule it for your stakeholders.', points: [['Report editor', 'Your logo, your colours, your structure.'], ['Every format', 'PDF, Word, PowerPoint and CSV.'], ['Scheduled sending', 'Daily, weekly or monthly, to the right people.'], ['AI drafting', 'Around proposes summaries you can edit.']] },
    watches: { eyebrow: 'Capability', title: 'Private watches for sensitive subjects', lead: 'Create confidential monitoring visible only to the people you choose, separated from the rest of the workspace.', points: [['Restricted visibility', 'Only named members see the watch and its results.'], ['Same power', 'Sources, alerts, dashboards and AI work as everywhere else.'], ['Copy protection', 'Watermarking and copy blocking on sensitive content.'], ['Full trace', 'Every access is recorded in the audit log.']] },
    aivis: { eyebrow: 'Capability', title: 'AI visibility: how AI assistants describe you', lead: 'Ask the questions your audience asks AI assistants and track how your organisation appears in the answers over time.', points: [['Your questions', 'Define the prompts that matter for your brand or institution.'], ['Answers kept', 'Each answer is saved so you can compare over time.'], ['Presence measured', 'See whether and how you are mentioned.'], ['Act on gaps', 'Spot inaccurate narratives before they settle.']] },
    api: { eyebrow: 'Capability', title: 'Integrations & API', lead: 'Bring Mearsaad data into your own tools with a secure API and exports, or embed a live dashboard.', points: [['Client API', 'Programmatic access to your coverage with a personal key.'], ['Exports', 'CSV, PDF, Word and PowerPoint from any view.'], ['Shared dashboards', 'Embed a read-only live view in your intranet.'], ['Notifications', 'Email and Telegram for alerts and briefings.']] },
    reputation: { eyebrow: 'Use case', title: 'Reputation & crisis management', lead: 'Detect a crisis in its first hour, understand where it comes from and follow its spread across media until it fades.', points: [['First-hour detection', 'Spikes and negative tone trigger an immediate alert.'], ['Origin and spread', 'See which outlet started it and who picked it up.'], ['Shared situation room', 'Everyone follows the same live dashboard.'], ['After-action report', 'Export the timeline and the coverage in minutes.']] },
    intelligence: { eyebrow: 'Use case', title: 'Strategic intelligence & weak signals', lead: 'Follow competitors, regulators, markets and countries, and catch the weak signals that announce change.', points: [['Smart radar', 'Emerging topics and rising names surfaced automatically.'], ['Thematic watches', 'One watch per market, competitor or file.'], ['AI synthesis', 'Around turns hundreds of articles into a briefing.'], ['History', 'Search months of coverage to understand a trend.']] },
    pr: { eyebrow: 'Use case', title: 'Press relations & campaign impact', lead: 'Measure the reach of every announcement, compare with peers and prove the value of your communication.', points: [['Every mention', 'Press, social, TV and radio coverage of your campaigns.'], ['Share of voice', 'Your presence against peers over any period.'], ['Tone and messages', 'Check whether your key messages land.'], ['Client-ready reports', 'Branded exports for management or clients.']] },
    opinion: { eyebrow: 'Use case', title: 'Public opinion tracking', lead: 'Understand what the public discusses, how sentiment evolves and which voices shape the debate.', points: [['Topics of debate', 'Subjects ranked by volume and momentum.'], ['Sentiment over time', 'Tone curves per topic, region or source.'], ['Influential voices', 'People and pages that drive the conversation.'], ['Regional view', 'Coverage mapped by country and city.']] },
    benchmark: { eyebrow: 'Use case', title: 'Benchmark & share of voice', lead: 'Compare your media presence with competitors or peer institutions, by period, channel and tone.', points: [['Side by side', 'Several organisations compared in one dashboard.'], ['By channel', 'Online, social, TV and radio separately or together.'], ['Period over period', 'Progress measured week after week.'], ['Exportable', 'Charts ready for your presentations.']] },
    government: { eyebrow: 'Organisation', title: 'For government & institutions', lead: 'Follow public debate, measure the reach of official communication and brief leadership every morning, with institution-grade security.', points: [['Morning briefings', 'A written review of what changed overnight.'], ['Broadcast monitoring', 'National and regional TV and radio, transcribed.'], ['Sensitive files', 'Private watches with restricted access.'], ['Sovereign security', 'Isolated workspace, two-factor and face verification.']] },
    enterprise: { eyebrow: 'Organisation', title: 'For enterprises & groups', lead: 'Protect your brand, follow your markets and give every department the media view it needs.', points: [['One workspace, many teams', 'Roles and permissions for communication, strategy and management.'], ['Brand protection', 'Crisis alerts and tone tracking.'], ['Market intelligence', 'Competitors, regulators and partners followed.'], ['Reporting', 'Scheduled reports for executives.']] },
    agencies: { eyebrow: 'Organisation', title: 'For communication agencies', lead: 'Monitor several clients, deliver branded reports and show results that justify your work.', points: [['Per-client views', 'Dashboards and watches organised by client.'], ['Branded reports', 'Your client’s logo and colours in every export.'], ['Campaign measurement', 'Reach, tone and share of voice.'], ['Faster delivery', 'AI drafts summaries your team refines.']] },
    newsrooms: { eyebrow: 'Organisation', title: 'For media & newsrooms', lead: 'Monitor competitors, find the sources behind a story and follow broadcasts minute by minute.', points: [['Live wall', 'Competing channels followed live.'], ['Transcripts', 'Find a quote in seconds.'], ['Story tracking', 'See who covered what, and when.'], ['Alerts', 'Breaking topics flagged as they emerge.']] },
    why: { eyebrow: 'Why Mearsaad', title: 'Built for the media you actually follow', lead: 'Mearsaad was designed by Around Expressions for teams whose decisions depend on Arabic, French and English media, local and international.', points: [['Arabic first', 'Language analysis designed for Arabic and its variants.'], ['Deep regional coverage', 'Local channels, radios and websites.'], ['Security by design', 'Every client isolated, every action traced.'], ['People behind the platform', 'Analysts and trainers at your side.']] },
    languages: { eyebrow: 'Why Mearsaad', title: 'Arabic first, truly multilingual', lead: 'Arabic, French and English are analysed natively: search, tone, entities, summaries and the interface itself, right-to-left included.', points: [['Native Arabic analysis', 'Spelling variants and names handled properly.'], ['Answers in your language', 'Around replies in the language you ask.'], ['Full RTL interface', 'Every screen designed for right-to-left.'], ['Mixed sources', 'Compare coverage across languages in one view.']] },
    coverage: { eyebrow: 'Why Mearsaad', title: 'Regional coverage that goes deep', lead: 'Beyond major international outlets, Mearsaad follows the local channels, radios, websites and pages that shape opinion in the region.', points: [['Local broadcast', 'Regional TV and radio stations transcribed.'], ['Local websites and pages', 'Sources added on request.'], ['Source health', 'Each source is checked continuously.'], ['Your own sources', 'Ask us to add the outlets you need.']] },
    support: { eyebrow: 'Why Mearsaad', title: 'A team at your side', lead: 'Around Expressions configures your workspace, trains your users and stays available when you need an analyst.', points: [['Guided set-up', 'Topics, sources and alerts configured with you.'], ['Training', 'Sessions for administrators and analysts.'], ['Responsive support', 'A direct contact for questions and requests.'], ['Analyst services', 'Custom reports and studies on demand.']] },
    security: { eyebrow: 'Security', title: 'Your data stays yours', lead: 'Every client organisation runs in its own isolated workspace. Access is personal, traceable and protected.', points: [['Isolated workspaces', 'Separate users, data and settings per organisation, with its own address.'], ['Strong authentication', 'Two-factor authentication and optional face verification.'], ['Audit log', 'A read-only record of every sensitive action.'], ['Copy protection', 'Watermarking, copy blocking and HTTPS everywhere, with daily backups.']] },
    help: { eyebrow: 'Resources', title: 'Help center', lead: 'Everything you need to use Mearsaad day to day, and a direct line to our team when you need more.', points: [['Getting started', 'Log in, set your language and find your dashboards.'], ['Searching', 'Boolean queries, filters and saved searches.'], ['Alerts and reports', 'Create watches and schedule exports.'], ['Contact support', 'Write to us from the platform or this site.']] },
    academy: { eyebrow: 'Resources', title: 'Mearsaad Academy', lead: 'Hands-on training sessions, on site or online, so your team is productive from the first week.', points: [['Onboarding', 'A first session to master the essentials.'], ['Analyst track', 'Advanced search, dashboards and AI.'], ['Administrator track', 'Users, roles, permissions and security.'], ['Certificates', 'Participation certificates for each session.']] },
    guides: { eyebrow: 'Resources', title: 'Practical guides', lead: 'Short, concrete guides written by our analysts to get more out of your monitoring.', points: [['Write a Boolean query', 'Combine AND, OR, NOT and exact phrases; add Arabic spelling variants of names.'], ['Set useful alerts', 'Start with a high threshold and lower it after a week of observation.'], ['Read tone correctly', 'Look at the trend and the articles behind it, not a single figure.'], ['Build a monthly report', 'Key figures, top stories, tone and a short written analysis.']] },
    glossary: { eyebrow: 'Resources', title: 'Media monitoring glossary', lead: 'The words you will meet in Mearsaad, explained simply.', points: [['Share of voice', 'Your part of the coverage compared with a group of peers.'], ['Tone', 'Whether coverage is positive, neutral or negative toward a subject.'], ['Spike', 'Coverage clearly above its usual level for the time of day.'], ['Watch', 'A saved query that runs continuously and can raise alerts.']] },
    about: { eyebrow: 'Company', title: 'Our story', lead: 'Around Expressions created Mearsaad (مرصاد, “the watchtower”) to give institutions, brands and newsrooms a clear view of the media that shape their environment.', points: [['Our mission', 'Turn the flow of media into decisions.'], ['Our approach', 'Technology and analysts working together.'], ['Our region', 'Built with Arabic and regional media at its core.'], ['Our name', 'MEDIA MINING & MONITORING SYSTEM (MMS) · منظومة الرصد والتحليل الإعلامي.']] },
    careers: { eyebrow: 'Company', title: 'Careers', lead: 'We look for analysts, engineers and media specialists who want to build the region’s reference monitoring platform.', points: [['Media analysts', 'Arabic, French and English media expertise.'], ['Engineers', 'Data, AI and web platforms.'], ['Trainers', 'Help clients get the most from Mearsaad.'], ['Spontaneous applications', 'Send us your profile through the contact form.']] },
    press: { eyebrow: 'Company', title: 'Press & media kit', lead: 'For journalists and partners: information about Mearsaad and Around Expressions, and our brand assets on request.', points: [['About Mearsaad', 'A media monitoring and intelligence platform by Around Expressions.'], ['Brand assets', 'Logos and visuals available on request.'], ['Interviews', 'Our team is available to talk about media trends.'], ['Press contact', 'Use the contact form and mention “Press”.']] },
    contact: { eyebrow: 'Company', title: 'Contact us', lead: 'Tell us what you need to follow. We will answer quickly and prepare a demonstration on your own subjects.', points: [['Demo on your topics', 'A live session prepared with your subjects and markets.'], ['Pricing', 'An offer adapted to your sources, users and services.'], ['Support', 'Existing clients can also write from the platform.'], ['Partnerships', 'Agencies and resellers are welcome.']] },
  },
  ui: { home: 'Home', related: 'Related', explore: 'Explore', back: 'Back to home', demoTitle: 'See Mearsaad on your own topics', demoText: 'We will prepare a live demonstration on your subjects and markets.', demo: 'Request a demo', login: 'Log in', open: 'Open menu', close: 'Close menu' },
  ask: {
    button: 'Ask Around',
    title: 'Around',
    subtitle: 'Mearsaad assistant',
    hello: 'Hello! I am Around. Ask me about Mearsaad: sources, languages, alerts, security or a demo.',
    placeholder: 'Ask a question…',
    send: 'Send',
    suggestions: 'Popular questions',
    fallback: 'I am not sure I understood. Our team can answer precisely during a demo on your own topics.',
    demo: 'Request a demo',
    readMore: 'Read more',
    disclaimer: 'Answers about Mearsaad only. Inside the platform, Around also answers from your own coverage.',
    qa: [
      { q: 'What does Mearsaad monitor?', a: 'Online news, print, podcasts, social networks, YouTube, forums, TV and radio, in one deduplicated feed analysed around the clock.', to: 'platform', keys: ['monitor', 'source', 'what', 'cover', 'tv', 'radio', 'social', 'news'] },
      { q: 'Which languages are supported?', a: 'Arabic, French and English are analysed natively, and the whole interface is available in all three, right-to-left included.', to: 'languages', keys: ['language', 'arabic', 'french', 'english', 'rtl'] },
      { q: 'How do alerts work?', a: 'You set watches on any query with thresholds. Mearsaad notifies by email or Telegram and can sound an on-screen activity alarm when coverage spikes.', to: 'alerts', keys: ['alert', 'alarm', 'notify', 'telegram', 'email', 'spike'] },
      { q: 'Is my data secure?', a: 'Each client has an isolated workspace with personal access, two-factor authentication, optional face verification, an audit log and copy protection.', to: 'security', keys: ['secure', 'security', 'data', 'privacy', 'safe', 'mfa'] },
      { q: 'What can the AI do?', a: 'Inside the platform, Around answers questions on your coverage with sources, writes summaries and daily briefings, and explains spikes and tone.', to: 'around', keys: ['ai', 'assistant', 'summary', 'briefing', 'around', 'gpt'] },
      { q: 'How do I get a demo?', a: 'Click “Request a demo” and leave your details. We prepare a live session on your own topics and markets.', to: 'contact', keys: ['demo', 'price', 'pricing', 'contact', 'trial', 'cost'] },
    ],
  },
}

/* ======================================================================== Français */

const fr: Mega = {
  menus: {
    product: {
      label: 'Produit',
      layout: 'intro',
      intros: [
        { to: 'platform', title: 'La plateforme Mearsaad', text: 'Veille et intelligence médias dans un seul espace : toutes les sources, toutes les langues, analysées en continu.', cta: 'Découvrir la plateforme', icon: 'layers' },
        { to: 'around', title: 'Around, assistant IA', text: 'Posez une question à votre couverture et obtenez en quelques secondes une réponse sourcée, une synthèse ou une note.', cta: 'Découvrir Around', icon: 'spark' },
      ],
      cols: [
        {
          heading: 'Fonctionnalités',
          items: [
            { to: 'monitoring', label: 'Veille médias', desc: 'Presse en ligne, presse écrite et podcasts dans un seul flux' },
            { to: 'social', label: 'Social listening', desc: 'Suivez les discussions sur les réseaux et forums' },
            { to: 'broadcast', label: 'Veille TV & radio', desc: 'Chaînes en direct, transcriptions et extraits' },
          ],
        },
        {
          items: [
            { to: 'radar', label: 'Radar intelligent', desc: 'Sujets émergents et signaux faibles repérés tôt' },
            { to: 'alerts', label: 'Alertes & alarme d’activité', desc: 'Pics et tonalité négative signalés aussitôt' },
            { to: 'watches', label: 'Veilles privées', desc: 'Une veille confidentielle pour les sujets sensibles' },
          ],
        },
      ],
      featured: { to: 'briefings', visual: 'reports', tag: 'Nouveau', title: 'Notes de synthèse IA quotidiennes', text: 'Un résumé écrit de ce qui a changé pendant la nuit, dans votre langue, dans chaque boîte mail avant la première réunion.', cta: 'En savoir plus' },
    },
    solutions: {
      label: 'Solutions',
      layout: 'columns',
      cols: [
        {
          heading: 'Par cas d’usage',
          items: [
            { to: 'reputation', label: 'Réputation & gestion de crise' },
            { to: 'intelligence', label: 'Veille stratégique & signaux faibles' },
            { to: 'pr', label: 'Relations presse & impact des campagnes' },
            { to: 'opinion', label: 'Suivi de l’opinion publique' },
            { to: 'benchmark', label: 'Benchmark & part de voix' },
          ],
        },
        {
          heading: 'Par type d’organisation',
          items: [
            { to: 'government', label: 'Institutions & administrations' },
            { to: 'enterprise', label: 'Entreprises & groupes' },
            { to: 'agencies', label: 'Agences de communication' },
            { to: 'newsrooms', label: 'Médias & rédactions' },
          ],
        },
        {
          heading: 'Par fonctionnalité',
          items: [
            { to: 'broadcast', label: 'Veille TV & radio' },
            { to: 'monitoring', label: 'Veille presse en ligne' },
            { to: 'social', label: 'Veille réseaux sociaux' },
            { to: 'around', label: 'Assistant IA Around' },
            { to: 'watches', label: 'Veilles privées' },
          ],
        },
      ],
      featured: { to: '#tour', visual: 'monitor', tag: 'Interactif', title: 'Visite guidée du produit', text: 'Voyez la plateforme en action : veille, audiovisuel, analyse, IA, alertes et rapports, étape par étape.', cta: 'Lancer la visite' },
    },
    why: {
      label: 'Pourquoi Mearsaad',
      layout: 'intro',
      intros: [{ to: 'why', title: 'Pourquoi Mearsaad', text: 'Conçu dans la région, pour les équipes dont les décisions dépendent des médias arabes, francophones et anglophones.', cta: 'Découvrir pourquoi Mearsaad', icon: 'star' }],
      cols: [
        {
          heading: 'Pourquoi les équipes nous choisissent',
          items: [
            { to: 'languages', label: 'L’arabe d’abord, vraiment multilingue', desc: 'Arabe, français et anglais analysés nativement, interface comprise' },
            { to: 'coverage', label: 'Une couverture régionale en profondeur', desc: 'Chaînes, radios, sites et pages locaux que d’autres ignorent' },
            { to: 'security', label: 'Une sécurité de niveau institutionnel', desc: 'Espaces isolés, double authentification et vérification faciale' },
            { to: 'support', label: 'Une équipe à vos côtés', desc: 'Mise en place, formation et analystes d’Around Expressions' },
          ],
        },
      ],
      featured: { to: 'security', visual: 'shield', tag: 'Confiance', title: 'Vos données restent les vôtres', text: 'Chaque client dispose de son propre espace isolé, avec accès nominatif, journal d’audit complet et protection anti-copie.', cta: 'Lire sur la sécurité' },
    },
    resources: {
      label: 'Ressources',
      layout: 'intro',
      intros: [
        { to: 'help', title: 'Centre d’aide', text: 'Réponses, modes d’emploi et assistance pour chaque utilisateur de Mearsaad.', cta: 'Visiter le centre d’aide', icon: 'headset' },
        { to: 'academy', title: 'Académie Mearsaad', text: 'Des formations pour rendre votre équipe opérationnelle dès la première semaine.', cta: 'Voir les formations', icon: 'users' },
      ],
      cols: [
        {
          items: [
            { to: 'guides', label: 'Guides pratiques' },
            { to: 'glossary', label: 'Glossaire de la veille' },
            { to: '#tour', label: 'Visite produit' },
            { to: 'contact', label: 'Parler à un expert' },
          ],
        },
      ],
      featured: { to: 'guides', visual: 'book', tag: 'Guide', title: 'Écrire une requête booléenne efficace', text: 'ET, OU, SAUF, expressions exactes et variantes d’orthographe arabe : des recherches qui attrapent tout, et rien d’autre.', cta: 'Lire le guide' },
    },
    company: {
      label: 'Entreprise',
      layout: 'compact',
      cols: [
        {
          items: [
            { to: 'about', label: 'Notre histoire' },
            { to: 'careers', label: 'Carrières' },
            { to: 'press', label: 'Presse & kit média' },
            { to: 'contact', label: 'Contact' },
          ],
        },
      ],
      featured: { to: 'about', visual: 'globe', tag: 'Around Expressions', title: 'Mearsaad, مرصاد', text: 'Le système de veille et d’analyse médiatique conçu par Around Expressions pour les institutions, les marques et les rédactions.', cta: 'Notre histoire' },
    },
  },
  pages: {
    platform: { eyebrow: 'Produit', title: 'Une seule plateforme pour tous les sujets qui comptent', lead: 'Mearsaad collecte presse en ligne, réseaux sociaux, télévision et radio en continu, les analyse par IA et donne à chaque équipe ses tableaux de bord, alertes et rapports.', points: [['Toutes les sources dans un flux', 'Sites, presse écrite, podcasts, réseaux sociaux, YouTube, TV et radio, dédoublonnés et interrogeables ensemble.'], ['Une analyse qui ne s’arrête jamais', 'Tonalité, entités, sujets et pics calculés en continu, pas en fin de mois.'], ['Un espace par client', 'Utilisateurs, données, tableaux et réglages isolés pour chaque organisation.'], ['Prêt dès le premier jour', 'Notre équipe configure avec vous sujets, sources et alertes.']] },
    around: { eyebrow: 'Assistant IA', title: 'Around : interrogez votre couverture, obtenez une réponse sourcée', lead: 'Around lit les articles, publications et transcriptions de votre espace et répond dans votre langue, avec des références consultables.', points: [['Des réponses fondées', 'Chaque réponse renvoie aux articles sur lesquels elle s’appuie.'], ['Synthèses et notes', 'Une semaine de couverture devient une note claire pour la direction.'], ['Des explications, pas seulement des chiffres', 'Demandez pourquoi un sujet monte ou pourquoi la tonalité se dégrade.'], ['Exports inclus', 'Envoyez une réponse vers un rapport, un PDF ou une présentation.']] },
    monitoring: { eyebrow: 'Fonctionnalité', title: 'La veille presse en ligne, sans le bruit', lead: 'Sites d’information, presse écrite et podcasts arrivent dans un flux unique, regroupés en histoires et interrogeables en recherche booléenne précise.', points: [['Recherche booléenne', 'ET, OU, SAUF, expressions exactes et variantes d’orthographe des noms arabes.'], ['Des histoires, pas des doublons', 'Les reprises sont regroupées : chaque sujet se lit une fois.'], ['Les filtres utiles', 'Thème, pays, type de média, tonalité et période en deux clics.'], ['Épingles et recherches enregistrées', 'Gardez et partagez la couverture sur laquelle travaille l’équipe.']] },
    social: { eyebrow: 'Fonctionnalité', title: 'Le social listening des conversations qui font l’opinion', lead: 'Suivez pages, comptes, chaînes YouTube, forums et commentaires à côté des médias traditionnels, avec la même analyse de tonalité et de sujets.', points: [['Réseaux et forums', 'Publications, commentaires et discussions publiques à côté de la presse.'], ['Réactions mesurées', 'Repérez les publications qui suscitent engagement et débat.'], ['La même analyse partout', 'Tonalité, entités et sujets calculés de la même façon pour chaque source.'], ['Pics signalés', 'Une activité inhabituelle sur une page ou un mot-dièse déclenche une alerte.']] },
    broadcast: { eyebrow: 'Fonctionnalité', title: 'Veille TV & radio, transcrite et interrogeable', lead: 'Suivez les chaînes en direct sur un mur unique, lisez les transcriptions automatiques et retrouvez la minute exacte où un nom a été prononcé.', points: [['Mur du direct', 'Plusieurs chaînes TV et radio sur un écran, son à la demande.'], ['Transcriptions automatiques', 'Cherchez dans la parole comme dans les articles.'], ['Extraits à partager', 'Découpez les minutes utiles et envoyez-les à l’équipe.'], ['Résumés d’émissions', 'Synthèses IA de chaque séquence.']] },
    radar: { eyebrow: 'Fonctionnalité', title: 'Le radar intelligent repère ce qui va compter', lead: 'Mearsaad compare chaque heure à son rythme habituel et fait remonter sujets émergents, personnalités en hausse et histoires reprises par de nombreux médias.', points: [['Sujets émergents', 'De nouveaux sujets détectés avant qu’ils fassent la une.'], ['Baromètre de l’humeur médiatique', 'La tonalité générale de la couverture, heure par heure.'], ['Histoires reprises partout', 'Voyez quand un sujet passe d’une source à beaucoup.'], ['Un clic vers les preuves', 'Chaque signal ouvre les articles qui le fondent.']] },
    alerts: { eyebrow: 'Fonctionnalité', title: 'Des alertes et une alarme d’activité impossibles à manquer', lead: 'Les veilles sur toute requête préviennent les bonnes personnes par e-mail ou Telegram, et l’alarme d’activité retentit à l’écran quand la couverture s’emballe.', points: [['Vos seuils', 'Volume, tonalité négative ou nouvelles sources : vous décidez de ce qui mérite une alerte.'], ['Alarme d’activité', 'Une alarme plein écran dans la salle de veille en cas d’activité inhabituelle.'], ['Suivi des alertes', 'Prise en charge, attribution et clôture, avec historique.'], ['E-mail et Telegram', 'Les notifications là où l’équipe travaille déjà.']] },
    briefings: { eyebrow: 'Nouveau', title: 'Des notes de synthèse IA prêtes avant la première réunion', lead: 'Chaque matin, Mearsaad rédige un court résumé de ce qui a changé sur vos sujets, avec les liens vers la couverture, et l’envoie à votre liste.', points: [['Écrit pour les décideurs', 'Faits clés, tonalité et points à surveiller, en quelques paragraphes.'], ['Dans votre langue', 'Arabe, français ou anglais, quelle que soit la langue des sources.'], ['Envoi programmé', 'Revues quotidiennes et notes hebdomadaires à l’heure choisie.'], ['Traçable', 'Chaque phrase renvoie à ses sources.']] },
    dashboards: { eyebrow: 'Fonctionnalité', title: 'Des tableaux de bord qui expliquent la couverture', lead: 'Composez vos tableaux par glisser-déposer : volume, tonalité, part de voix, personnalités, organisations, sources et régions.', points: [['Widgets par glisser-déposer', 'Une vue par équipe, sujet ou client.'], ['Comparaison de périodes', 'Cette semaine contre la précédente, ce mois contre le dernier.'], ['Partage en lecture seule', 'Un tableau vivant partagé par lien sécurisé.'], ['Carte et chronologie', 'Où et quand la couverture se produit.']] },
    reports: { eyebrow: 'Fonctionnalité', title: 'Des rapports professionnels en quelques minutes', lead: 'Sélectionnez les articles qui comptent, ajoutez votre analyse et exportez un rapport à vos couleurs, ou programmez-le pour vos destinataires.', points: [['Éditeur de rapport', 'Votre logo, vos couleurs, votre structure.'], ['Tous les formats', 'PDF, Word, PowerPoint et CSV.'], ['Envoi programmé', 'Quotidien, hebdomadaire ou mensuel, aux bonnes personnes.'], ['Rédaction assistée', 'Around propose des synthèses modifiables.']] },
    watches: { eyebrow: 'Fonctionnalité', title: 'Des veilles privées pour les sujets sensibles', lead: 'Créez une veille confidentielle, visible uniquement par les personnes choisies, séparée du reste de l’espace.', points: [['Visibilité restreinte', 'Seuls les membres désignés voient la veille et ses résultats.'], ['Toute la puissance', 'Sources, alertes, tableaux et IA comme partout ailleurs.'], ['Protection anti-copie', 'Filigrane et blocage de la copie sur les contenus sensibles.'], ['Traçabilité complète', 'Chaque accès est inscrit au journal d’audit.']] },
    aivis: { eyebrow: 'Fonctionnalité', title: 'Visibilité dans les IA : ce que disent les assistants de vous', lead: 'Posez aux assistants IA les questions de votre public et suivez dans le temps la place de votre organisation dans leurs réponses.', points: [['Vos questions', 'Définissez les requêtes qui comptent pour votre marque ou institution.'], ['Réponses conservées', 'Chaque réponse est gardée pour comparer dans le temps.'], ['Présence mesurée', 'Voyez si et comment vous êtes cité.'], ['Agir sur les écarts', 'Repérez les récits inexacts avant qu’ils s’installent.']] },
    api: { eyebrow: 'Fonctionnalité', title: 'Intégrations & API', lead: 'Faites entrer les données Mearsaad dans vos outils grâce à une API sécurisée et aux exports, ou intégrez un tableau de bord vivant.', points: [['API client', 'Accès programmatique à votre couverture avec une clé personnelle.'], ['Exports', 'CSV, PDF, Word et PowerPoint depuis toute vue.'], ['Tableaux partagés', 'Une vue vivante en lecture seule dans votre intranet.'], ['Notifications', 'E-mail et Telegram pour les alertes et les notes.']] },
    reputation: { eyebrow: 'Cas d’usage', title: 'Réputation & gestion de crise', lead: 'Détectez une crise dès sa première heure, comprenez d’où elle vient et suivez sa propagation jusqu’à ce qu’elle retombe.', points: [['Détection dès la première heure', 'Pics et tonalité négative déclenchent une alerte immédiate.'], ['Origine et propagation', 'Quel média a lancé le sujet, qui l’a repris.'], ['Cellule de crise partagée', 'Tout le monde suit le même tableau en direct.'], ['Rapport de retour d’expérience', 'Chronologie et couverture exportées en minutes.']] },
    intelligence: { eyebrow: 'Cas d’usage', title: 'Veille stratégique & signaux faibles', lead: 'Suivez concurrents, régulateurs, marchés et pays, et captez les signaux faibles qui annoncent le changement.', points: [['Radar intelligent', 'Sujets émergents et noms en hausse remontés automatiquement.'], ['Veilles thématiques', 'Une veille par marché, concurrent ou dossier.'], ['Synthèse IA', 'Around transforme des centaines d’articles en une note.'], ['Historique', 'Des mois de couverture pour comprendre une tendance.']] },
    pr: { eyebrow: 'Cas d’usage', title: 'Relations presse & impact des campagnes', lead: 'Mesurez la portée de chaque annonce, comparez-vous à vos pairs et prouvez la valeur de votre communication.', points: [['Chaque mention', 'Presse, réseaux, TV et radio autour de vos campagnes.'], ['Part de voix', 'Votre présence face à vos pairs sur toute période.'], ['Tonalité et messages', 'Vérifiez que vos messages clés passent.'], ['Rapports prêts à livrer', 'Exports à vos couleurs pour la direction ou vos clients.']] },
    opinion: { eyebrow: 'Cas d’usage', title: 'Suivi de l’opinion publique', lead: 'Comprenez ce dont le public débat, comment le sentiment évolue et quelles voix façonnent le débat.', points: [['Sujets de débat', 'Classés par volume et dynamique.'], ['Sentiment dans le temps', 'Courbes de tonalité par sujet, région ou source.'], ['Voix influentes', 'Les personnes et pages qui animent la conversation.'], ['Vue régionale', 'La couverture cartographiée par pays et par ville.']] },
    benchmark: { eyebrow: 'Cas d’usage', title: 'Benchmark & part de voix', lead: 'Comparez votre présence médiatique à celle de concurrents ou d’institutions comparables, par période, canal et tonalité.', points: [['Côte à côte', 'Plusieurs organisations comparées dans un tableau.'], ['Par canal', 'En ligne, réseaux, TV et radio séparément ou ensemble.'], ['Période après période', 'Les progrès mesurés semaine après semaine.'], ['Exportable', 'Des graphiques prêts pour vos présentations.']] },
    government: { eyebrow: 'Organisation', title: 'Pour les institutions & administrations', lead: 'Suivez le débat public, mesurez la portée de la communication officielle et informez la direction chaque matin, avec une sécurité de niveau institutionnel.', points: [['Notes du matin', 'Une revue écrite de ce qui a changé pendant la nuit.'], ['Veille audiovisuelle', 'TV et radio nationales et régionales, transcrites.'], ['Dossiers sensibles', 'Veilles privées à accès restreint.'], ['Sécurité souveraine', 'Espace isolé, double authentification et vérification faciale.']] },
    enterprise: { eyebrow: 'Organisation', title: 'Pour les entreprises & groupes', lead: 'Protégez votre marque, suivez vos marchés et donnez à chaque direction la vue médias dont elle a besoin.', points: [['Un espace, plusieurs équipes', 'Rôles et droits pour communication, stratégie et direction.'], ['Protection de la marque', 'Alertes de crise et suivi de tonalité.'], ['Intelligence de marché', 'Concurrents, régulateurs et partenaires suivis.'], ['Reporting', 'Rapports programmés pour les dirigeants.']] },
    agencies: { eyebrow: 'Organisation', title: 'Pour les agences de communication', lead: 'Suivez plusieurs clients, livrez des rapports à leurs couleurs et montrez des résultats qui justifient votre travail.', points: [['Une vue par client', 'Tableaux et veilles organisés par client.'], ['Rapports personnalisés', 'Le logo et les couleurs du client dans chaque export.'], ['Mesure des campagnes', 'Portée, tonalité et part de voix.'], ['Livraison plus rapide', 'L’IA rédige des synthèses que l’équipe affine.']] },
    newsrooms: { eyebrow: 'Organisation', title: 'Pour les médias & rédactions', lead: 'Surveillez la concurrence, trouvez les sources d’un sujet et suivez les antennes minute par minute.', points: [['Mur du direct', 'Les chaînes concurrentes suivies en direct.'], ['Transcriptions', 'Retrouvez une citation en quelques secondes.'], ['Suivi des sujets', 'Qui a couvert quoi, et quand.'], ['Alertes', 'Les sujets chauds signalés dès leur apparition.']] },
    why: { eyebrow: 'Pourquoi Mearsaad', title: 'Conçu pour les médias que vous suivez vraiment', lead: 'Mearsaad a été conçu par Around Expressions pour les équipes dont les décisions dépendent des médias arabes, francophones et anglophones, locaux et internationaux.', points: [['L’arabe d’abord', 'Une analyse linguistique pensée pour l’arabe et ses variantes.'], ['Couverture régionale profonde', 'Chaînes, radios et sites locaux.'], ['Sécurité dès la conception', 'Chaque client isolé, chaque action tracée.'], ['Des personnes derrière la plateforme', 'Analystes et formateurs à vos côtés.']] },
    languages: { eyebrow: 'Pourquoi Mearsaad', title: 'L’arabe d’abord, vraiment multilingue', lead: 'Arabe, français et anglais sont analysés nativement : recherche, tonalité, entités, synthèses et l’interface elle-même, de droite à gauche comprise.', points: [['Analyse native de l’arabe', 'Variantes d’orthographe et noms correctement gérés.'], ['Réponses dans votre langue', 'Around répond dans la langue de la question.'], ['Interface RTL complète', 'Chaque écran pensé pour la lecture de droite à gauche.'], ['Sources mélangées', 'Comparez la couverture entre langues dans une seule vue.']] },
    coverage: { eyebrow: 'Pourquoi Mearsaad', title: 'Une couverture régionale en profondeur', lead: 'Au-delà des grands médias internationaux, Mearsaad suit les chaînes, radios, sites et pages locaux qui font l’opinion dans la région.', points: [['Audiovisuel local', 'Télévisions et radios régionales transcrites.'], ['Sites et pages locaux', 'Des sources ajoutées sur demande.'], ['Santé des sources', 'Chaque source est vérifiée en continu.'], ['Vos propres sources', 'Demandez-nous d’ajouter les médias qu’il vous faut.']] },
    support: { eyebrow: 'Pourquoi Mearsaad', title: 'Une équipe à vos côtés', lead: 'Around Expressions configure votre espace, forme vos utilisateurs et reste disponible quand vous avez besoin d’un analyste.', points: [['Mise en place accompagnée', 'Sujets, sources et alertes configurés avec vous.'], ['Formation', 'Des sessions pour administrateurs et analystes.'], ['Assistance réactive', 'Un contact direct pour vos questions et demandes.'], ['Services d’analyse', 'Rapports et études sur mesure à la demande.']] },
    security: { eyebrow: 'Sécurité', title: 'Vos données restent les vôtres', lead: 'Chaque organisation cliente dispose de son propre espace isolé. Les accès sont nominatifs, tracés et protégés.', points: [['Espaces isolés', 'Utilisateurs, données et réglages séparés par organisation, avec sa propre adresse.'], ['Authentification forte', 'Double authentification et vérification faciale en option.'], ['Journal d’audit', 'Un registre en lecture seule de chaque action sensible.'], ['Protection anti-copie', 'Filigrane, blocage de la copie et HTTPS partout, avec sauvegardes quotidiennes.']] },
    help: { eyebrow: 'Ressources', title: 'Centre d’aide', lead: 'Tout pour utiliser Mearsaad au quotidien, et une ligne directe avec notre équipe quand il vous faut plus.', points: [['Premiers pas', 'Se connecter, choisir sa langue et trouver ses tableaux.'], ['Rechercher', 'Requêtes booléennes, filtres et recherches enregistrées.'], ['Alertes et rapports', 'Créer des veilles et programmer des exports.'], ['Contacter l’assistance', 'Écrivez-nous depuis la plateforme ou ce site.']] },
    academy: { eyebrow: 'Ressources', title: 'Académie Mearsaad', lead: 'Des formations pratiques, sur place ou à distance, pour une équipe opérationnelle dès la première semaine.', points: [['Prise en main', 'Une première session pour maîtriser l’essentiel.'], ['Parcours analyste', 'Recherche avancée, tableaux de bord et IA.'], ['Parcours administrateur', 'Utilisateurs, rôles, droits et sécurité.'], ['Attestations', 'Des certificats de participation pour chaque session.']] },
    guides: { eyebrow: 'Ressources', title: 'Guides pratiques', lead: 'Des guides courts et concrets, écrits par nos analystes, pour tirer le meilleur de votre veille.', points: [['Écrire une requête booléenne', 'Combinez ET, OU, SAUF et expressions exactes ; ajoutez les variantes d’orthographe arabe des noms.'], ['Régler des alertes utiles', 'Commencez avec un seuil élevé, puis abaissez-le après une semaine d’observation.'], ['Bien lire la tonalité', 'Regardez la tendance et les articles derrière, pas un chiffre isolé.'], ['Construire un rapport mensuel', 'Chiffres clés, sujets phares, tonalité et une courte analyse écrite.']] },
    glossary: { eyebrow: 'Ressources', title: 'Glossaire de la veille', lead: 'Les mots que vous croiserez dans Mearsaad, expliqués simplement.', points: [['Part de voix', 'Votre part de la couverture comparée à un groupe de pairs.'], ['Tonalité', 'Couverture positive, neutre ou négative à l’égard d’un sujet.'], ['Pic', 'Une couverture nettement au-dessus de son niveau habituel à cette heure.'], ['Veille', 'Une requête enregistrée qui tourne en continu et peut lever des alertes.']] },
    about: { eyebrow: 'Entreprise', title: 'Notre histoire', lead: 'Around Expressions a créé Mearsaad (مرصاد, « la tour de guet ») pour offrir aux institutions, aux marques et aux rédactions une vue claire des médias qui façonnent leur environnement.', points: [['Notre mission', 'Transformer le flux médiatique en décisions.'], ['Notre approche', 'La technologie et les analystes, ensemble.'], ['Notre région', 'Conçu avec les médias arabes et régionaux au cœur.'], ['Notre nom', 'MEDIA MINING & MONITORING SYSTEM (MMS) · منظومة الرصد والتحليل الإعلامي.']] },
    careers: { eyebrow: 'Entreprise', title: 'Carrières', lead: 'Nous recherchons analystes, ingénieurs et spécialistes des médias qui veulent construire la plateforme de veille de référence de la région.', points: [['Analystes médias', 'Expertise des médias arabes, francophones et anglophones.'], ['Ingénieurs', 'Données, IA et plateformes web.'], ['Formateurs', 'Aider nos clients à tirer le meilleur de Mearsaad.'], ['Candidatures spontanées', 'Envoyez votre profil via le formulaire de contact.']] },
    press: { eyebrow: 'Entreprise', title: 'Presse & kit média', lead: 'Pour les journalistes et partenaires : informations sur Mearsaad et Around Expressions, et éléments de marque sur demande.', points: [['À propos de Mearsaad', 'Une plateforme de veille et d’intelligence médias par Around Expressions.'], ['Éléments de marque', 'Logos et visuels disponibles sur demande.'], ['Interviews', 'Notre équipe peut parler des tendances médiatiques.'], ['Contact presse', 'Utilisez le formulaire de contact en précisant « Presse ».']] },
    contact: { eyebrow: 'Entreprise', title: 'Nous contacter', lead: 'Dites-nous ce que vous devez suivre. Nous répondons vite et préparons une démonstration sur vos propres sujets.', points: [['Démo sur vos sujets', 'Une session en direct préparée avec vos sujets et marchés.'], ['Tarifs', 'Une offre adaptée à vos sources, utilisateurs et services.'], ['Assistance', 'Les clients peuvent aussi écrire depuis la plateforme.'], ['Partenariats', 'Agences et revendeurs bienvenus.']] },
  },
  ui: { home: 'Accueil', related: 'À voir aussi', explore: 'Découvrir', back: 'Retour à l’accueil', demoTitle: 'Découvrez Mearsaad sur vos propres sujets', demoText: 'Nous préparons une démonstration en direct sur vos sujets et vos marchés.', demo: 'Demander une démo', login: 'Connexion', open: 'Ouvrir le menu', close: 'Fermer le menu' },
  ask: {
    button: 'Demander à Around',
    title: 'Around',
    subtitle: 'Assistant Mearsaad',
    hello: 'Bonjour ! Je suis Around. Posez-moi vos questions sur Mearsaad : sources, langues, alertes, sécurité ou démo.',
    placeholder: 'Posez une question…',
    send: 'Envoyer',
    suggestions: 'Questions fréquentes',
    fallback: 'Je ne suis pas sûr d’avoir compris. Notre équipe vous répondra précisément lors d’une démo sur vos sujets.',
    demo: 'Demander une démo',
    readMore: 'En savoir plus',
    disclaimer: 'Réponses sur Mearsaad uniquement. Dans la plateforme, Around répond aussi à partir de votre propre couverture.',
    qa: [
      { q: 'Que surveille Mearsaad ?', a: 'Presse en ligne, presse écrite, podcasts, réseaux sociaux, YouTube, forums, télévision et radio, dans un flux unique dédoublonné et analysé en continu.', to: 'platform', keys: ['surveill', 'source', 'quoi', 'couvr', 'tv', 'radio', 'réseau', 'presse'] },
      { q: 'Quelles langues sont prises en charge ?', a: 'L’arabe, le français et l’anglais sont analysés nativement, et toute l’interface existe dans les trois langues, de droite à gauche comprise.', to: 'languages', keys: ['langue', 'arabe', 'français', 'anglais', 'rtl'] },
      { q: 'Comment fonctionnent les alertes ?', a: 'Vous créez des veilles sur toute requête avec des seuils. Mearsaad prévient par e-mail ou Telegram et peut déclencher une alarme d’activité à l’écran en cas de pic.', to: 'alerts', keys: ['alerte', 'alarme', 'notif', 'telegram', 'mail', 'pic'] },
      { q: 'Mes données sont-elles protégées ?', a: 'Chaque client a un espace isolé avec accès nominatif, double authentification, vérification faciale en option, journal d’audit et protection anti-copie.', to: 'security', keys: ['sécur', 'secur', 'donnée', 'confidential', 'protég'] },
      { q: 'Que peut faire l’IA ?', a: 'Dans la plateforme, Around répond aux questions sur votre couverture avec les sources, rédige synthèses et notes quotidiennes, et explique pics et tonalité.', to: 'around', keys: ['ia', 'assistant', 'synthèse', 'note', 'around', 'intelligence'] },
      { q: 'Comment obtenir une démo ?', a: 'Cliquez sur « Demander une démo » et laissez vos coordonnées. Nous préparons une session en direct sur vos sujets et marchés.', to: 'contact', keys: ['démo', 'demo', 'prix', 'tarif', 'contact', 'essai', 'coût'] },
    ],
  },
}

/* ======================================================================== العربية */

const ar: Mega = {
  menus: {
    product: {
      label: 'المنتج',
      layout: 'intro',
      intros: [
        { to: 'platform', title: 'منصة مرصاد', text: 'الرصد والذكاء الإعلامي في مساحة واحدة: كل المصادر وكل اللغات، تُحلَّل باستمرار.', cta: 'اكتشف المنصة', icon: 'layers' },
        { to: 'around', title: 'Around، المساعد الذكي', text: 'اطرح سؤالًا على تغطيتك واحصل خلال ثوانٍ على إجابة موثقة بالمصادر أو ملخص أو موجز.', cta: 'تعرّف على Around', icon: 'spark' },
      ],
      cols: [
        {
          heading: 'الوظائف',
          items: [
            { to: 'monitoring', label: 'الرصد الإعلامي', desc: 'الصحافة الإلكترونية والمطبوعة والبودكاست في تدفق واحد' },
            { to: 'social', label: 'رصد شبكات التواصل', desc: 'تابع النقاشات على الشبكات والمنتديات' },
            { to: 'broadcast', label: 'رصد التلفزيون والإذاعة', desc: 'بث مباشر ونصوص مفرغة ومقاطع' },
          ],
        },
        {
          items: [
            { to: 'radar', label: 'الرادار الذكي', desc: 'المواضيع الناشئة والإشارات الضعيفة مبكرًا' },
            { to: 'alerts', label: 'التنبيهات وإنذار النشاط', desc: 'الذروات والنبرة السلبية فور حدوثها' },
            { to: 'watches', label: 'المتابعات الخاصة', desc: 'رصد سري للملفات الحساسة' },
          ],
        },
      ],
      featured: { to: 'briefings', visual: 'reports', tag: 'جديد', title: 'موجز يومي بالذكاء الاصطناعي', text: 'ملخص مكتوب لما تغيّر خلال الليل، بلغتك، في كل بريد قبل أول اجتماع.', cta: 'اعرف المزيد' },
    },
    solutions: {
      label: 'الحلول',
      layout: 'columns',
      cols: [
        {
          heading: 'حسب الاستخدام',
          items: [
            { to: 'reputation', label: 'إدارة السمعة والأزمات' },
            { to: 'intelligence', label: 'الرصد الاستراتيجي والإشارات الضعيفة' },
            { to: 'pr', label: 'العلاقات الإعلامية وأثر الحملات' },
            { to: 'opinion', label: 'متابعة الرأي العام' },
            { to: 'benchmark', label: 'المقارنة وحصة الحضور' },
          ],
        },
        {
          heading: 'حسب نوع المؤسسة',
          items: [
            { to: 'government', label: 'المؤسسات والهيئات الحكومية' },
            { to: 'enterprise', label: 'الشركات والمجموعات' },
            { to: 'agencies', label: 'وكالات الاتصال' },
            { to: 'newsrooms', label: 'وسائل الإعلام وغرف الأخبار' },
          ],
        },
        {
          heading: 'حسب الوظيفة',
          items: [
            { to: 'broadcast', label: 'رصد التلفزيون والإذاعة' },
            { to: 'monitoring', label: 'رصد الصحافة الإلكترونية' },
            { to: 'social', label: 'رصد شبكات التواصل' },
            { to: 'around', label: 'المساعد الذكي Around' },
            { to: 'watches', label: 'المتابعات الخاصة' },
          ],
        },
      ],
      featured: { to: '#tour', visual: 'monitor', tag: 'تفاعلي', title: 'جولة إرشادية في المنتج', text: 'شاهد المنصة أثناء العمل: الرصد والبث والتحليل والذكاء الاصطناعي والتنبيهات والتقارير خطوة بخطوة.', cta: 'ابدأ الجولة' },
    },
    why: {
      label: 'لماذا مرصاد',
      layout: 'intro',
      intros: [{ to: 'why', title: 'لماذا مرصاد', text: 'صُمّم في المنطقة، للفرق التي تعتمد قراراتها على الإعلام العربي والفرنسي والإنجليزي.', cta: 'اكتشف لماذا مرصاد', icon: 'star' }],
      cols: [
        {
          heading: 'لماذا تختارنا الفرق',
          items: [
            { to: 'languages', label: 'العربية أولًا، وتعدد لغوي حقيقي', desc: 'تحليل أصيل للعربية والفرنسية والإنجليزية، والواجهة كذلك' },
            { to: 'coverage', label: 'تغطية إقليمية معمّقة', desc: 'قنوات وإذاعات ومواقع وصفحات محلية يغفلها غيرنا' },
            { to: 'security', label: 'أمان بمستوى المؤسسات', desc: 'مساحات معزولة ومصادقة ثنائية وتحقق بالوجه' },
            { to: 'support', label: 'فريق إلى جانبك', desc: 'إعداد وتدريب ومحللون من Around Expressions' },
          ],
        },
      ],
      featured: { to: 'security', visual: 'shield', tag: 'ثقة', title: 'بياناتك تبقى ملكك', text: 'لكل عميل مساحة معزولة خاصة به، مع دخول شخصي وسجل تدقيق كامل وحماية من النسخ.', cta: 'اقرأ عن الأمان' },
    },
    resources: {
      label: 'الموارد',
      layout: 'intro',
      intros: [
        { to: 'help', title: 'مركز المساعدة', text: 'إجابات وأدلة استخدام ودعم لكل مستخدمي مرصاد.', cta: 'زيارة مركز المساعدة', icon: 'headset' },
        { to: 'academy', title: 'أكاديمية مرصاد', text: 'دورات تدريبية تجعل فريقك جاهزًا من الأسبوع الأول.', cta: 'عرض الدورات', icon: 'users' },
      ],
      cols: [
        {
          items: [
            { to: 'guides', label: 'أدلة عملية' },
            { to: 'glossary', label: 'مسرد مصطلحات الرصد' },
            { to: '#tour', label: 'جولة في المنتج' },
            { to: 'contact', label: 'تحدث إلى خبير' },
          ],
        },
      ],
      featured: { to: 'guides', visual: 'book', tag: 'دليل', title: 'اكتب استعلامًا منطقيًا فعّالًا', text: 'AND وOR وNOT والعبارات الدقيقة وصيغ كتابة الأسماء العربية: بحث يلتقط كل شيء، ولا شيء غيره.', cta: 'اقرأ الدليل' },
    },
    company: {
      label: 'الشركة',
      layout: 'compact',
      cols: [
        {
          items: [
            { to: 'about', label: 'قصتنا' },
            { to: 'careers', label: 'الوظائف' },
            { to: 'press', label: 'الصحافة والملف الإعلامي' },
            { to: 'contact', label: 'اتصل بنا' },
          ],
        },
      ],
      featured: { to: 'about', visual: 'globe', tag: 'Around Expressions', title: 'مرصاد، Mearsaad', text: 'منظومة الرصد والتحليل الإعلامي التي صممتها Around Expressions للمؤسسات والعلامات وغرف الأخبار.', cta: 'قصتنا' },
    },
  },
  pages: {
    platform: { eyebrow: 'المنتج', title: 'منصة واحدة لكل خبر يهمّك', lead: 'يجمع مرصاد الصحافة الإلكترونية وشبكات التواصل والتلفزيون والإذاعة على مدار الساعة، ويحللها بالذكاء الاصطناعي، ويمنح كل فريق لوحاته وتنبيهاته وتقاريره.', points: [['كل المصادر في تدفق واحد', 'مواقع وصحف وبودكاست وشبكات تواصل ويوتيوب وتلفزيون وإذاعة، بلا تكرار وقابلة للبحث معًا.'], ['تحليل لا يتوقف', 'النبرة والكيانات والمواضيع والذروات تُحسب باستمرار، لا في نهاية الشهر.'], ['مساحة لكل عميل', 'المستخدمون والبيانات واللوحات والإعدادات معزولة لكل مؤسسة.'], ['جاهز من اليوم الأول', 'يضبط فريقنا معك المواضيع والمصادر والتنبيهات.']] },
    around: { eyebrow: 'المساعد الذكي', title: 'Around: اسأل تغطيتك واحصل على إجابة موثقة', lead: 'يقرأ Around المقالات والمنشورات والنصوص المفرغة في مساحتك ويجيب بلغتك، مع مراجع يمكنك فتحها.', points: [['إجابات مستندة إلى المصادر', 'كل إجابة تشير إلى التغطية التي بُنيت عليها.'], ['ملخصات وموجزات', 'أسبوع من التغطية يصبح مذكرة واضحة لصناع القرار.'], ['تفسيرات لا أرقام فقط', 'اسأل لماذا يرتفع موضوع أو لماذا تحولت النبرة إلى سلبية.'], ['تصدير مدمج', 'أرسل الإجابة إلى تقرير أو ملف PDF أو عرض تقديمي.']] },
    monitoring: { eyebrow: 'وظيفة', title: 'رصد الصحافة الإلكترونية بلا ضجيج', lead: 'تصل مواقع الأخبار والصحف والبودكاست في تدفق واحد، مجمّعة في قصص وقابلة للبحث باستعلامات منطقية دقيقة.', points: [['بحث منطقي', 'AND وOR وNOT والعبارات الدقيقة وصيغ كتابة الأسماء العربية.'], ['قصص لا تكرار', 'تُجمع إعادات النشر لتقرأ كل خبر مرة واحدة.'], ['فلاتر مفيدة', 'الموضوع والبلد ونوع الوسيلة والنبرة والفترة بنقرتين.'], ['لوحات تثبيت وعمليات بحث محفوظة', 'احتفظ بالتغطية التي يعمل عليها فريقك وشاركها.']] },
    social: { eyebrow: 'وظيفة', title: 'رصد شبكات التواصل حيث يتشكل الرأي', lead: 'تابع الصفحات والحسابات وقنوات يوتيوب والمنتديات والتعليقات إلى جانب الإعلام التقليدي، بنفس تحليل النبرة والمواضيع.', points: [['شبكات ومنتديات', 'منشورات وتعليقات ونقاشات عامة إلى جانب الصحافة.'], ['قياس التفاعل', 'اعرف المنشورات التي تثير التفاعل والنقاش.'], ['تحليل موحد', 'النبرة والكيانات والمواضيع تُحسب بالطريقة نفسها لكل مصدر.'], ['رصد الذروات', 'نشاط غير معتاد على صفحة أو وسم يطلق تنبيهًا.']] },
    broadcast: { eyebrow: 'وظيفة', title: 'رصد التلفزيون والإذاعة، مفرّغًا وقابلًا للبحث', lead: 'تابع القنوات مباشرة على جدار واحد، واقرأ النصوص المفرغة آليًا، وجد الدقيقة التي ذُكر فيها اسم ما.', points: [['جدار البث المباشر', 'عدة قنوات تلفزيونية وإذاعية على شاشة واحدة، والصوت عند الطلب.'], ['تفريغ آلي', 'ابحث في الكلام المنطوق كما تبحث في المقالات.'], ['مقاطع للمشاركة', 'اقتطع الدقائق المهمة وأرسلها لفريقك.'], ['ملخصات البرامج', 'ملخص بالذكاء الاصطناعي لكل فقرة.']] },
    radar: { eyebrow: 'وظيفة', title: 'الرادار الذكي يلتقط ما سيصبح مهمًا', lead: 'يقارن مرصاد كل ساعة بإيقاعها المعتاد ويُبرز المواضيع الناشئة والأسماء الصاعدة والقصص التي تتناقلها وسائل كثيرة.', points: [['مواضيع ناشئة', 'مواضيع جديدة تُكتشف قبل أن تتصدر العناوين.'], ['مقياس المزاج الإعلامي', 'النبرة العامة للتغطية ساعة بساعة.'], ['قصص تتناقلها وسائل كثيرة', 'اعرف متى ينتقل خبر من مصدر إلى مصادر عديدة.'], ['نقرة إلى الدليل', 'كل إشارة تفتح المقالات التي تقف وراءها.']] },
    alerts: { eyebrow: 'وظيفة', title: 'تنبيهات وإنذار نشاط لا يمكن تفويته', lead: 'تُبلغ المتابعات على أي استعلام الأشخاص المعنيين بالبريد أو تيليغرام، ويدوّي إنذار النشاط على الشاشة عند ارتفاع التغطية.', points: [['عتبات تختارها', 'الحجم أو النبرة السلبية أو مصادر جديدة: أنت تقرر ما يستحق التنبيه.'], ['إنذار النشاط', 'إنذار بملء الشاشة في غرفة الرصد عند نشاط غير معتاد.'], ['متابعة التنبيهات', 'استلام وإسناد وإغلاق كل تنبيه مع سجل.'], ['البريد وتيليغرام', 'الإشعارات حيث يعمل فريقك.']] },
    briefings: { eyebrow: 'جديد', title: 'موجز يومي بالذكاء الاصطناعي جاهز قبل أول اجتماع', lead: 'كل صباح، يكتب مرصاد ملخصًا قصيرًا لما تغيّر في مواضيعك، مع روابط التغطية، ويرسله إلى قائمتك.', points: [['مكتوب لصناع القرار', 'الوقائع الأساسية والنبرة وما يجب مراقبته في فقرات قليلة.'], ['بلغتك', 'العربية أو الفرنسية أو الإنجليزية مهما كانت لغة المصادر.'], ['إرسال مجدول', 'مراجعات يومية وموجزات أسبوعية في الموعد الذي تختاره.'], ['قابل للتتبع', 'كل جملة تحيل إلى مصادرها.']] },
    dashboards: { eyebrow: 'وظيفة', title: 'لوحات قيادة تشرح التغطية', lead: 'ابنِ لوحاتك بالسحب والإفلات: الحجم والنبرة وحصة الحضور والشخصيات والمؤسسات والمصادر والمناطق.', points: [['عناصر بالسحب والإفلات', 'لوحة لكل فريق أو موضوع أو عميل.'], ['مقارنة الفترات', 'هذا الأسبوع مقابل الماضي، وهذا الشهر مقابل السابق.'], ['مشاركة للقراءة فقط', 'لوحة حية عبر رابط آمن.'], ['خريطة وخط زمني', 'أين ومتى تحدث التغطية.']] },
    reports: { eyebrow: 'وظيفة', title: 'تقارير احترافية في دقائق', lead: 'اختر الأخبار المهمة وأضف تحليلك وصدّر تقريرًا بهويتك، أو جدوله لأصحاب القرار.', points: [['محرر التقارير', 'شعارك وألوانك وهيكلك.'], ['كل الصيغ', 'PDF وWord وPowerPoint وCSV.'], ['إرسال مجدول', 'يومي أو أسبوعي أو شهري للأشخاص المعنيين.'], ['صياغة بمساعدة الذكاء الاصطناعي', 'يقترح Around ملخصات قابلة للتعديل.']] },
    watches: { eyebrow: 'وظيفة', title: 'متابعات خاصة للملفات الحساسة', lead: 'أنشئ رصدًا سريًا لا يراه إلا من تختارهم، منفصلًا عن بقية المساحة.', points: [['رؤية مقيّدة', 'لا يرى المتابعة ونتائجها إلا الأعضاء المحددون.'], ['القدرات نفسها', 'المصادر والتنبيهات واللوحات والذكاء الاصطناعي كما في كل مكان.'], ['حماية من النسخ', 'علامة مائية ومنع النسخ على المحتوى الحساس.'], ['تتبع كامل', 'كل دخول مسجل في سجل التدقيق.']] },
    aivis: { eyebrow: 'وظيفة', title: 'الحضور في إجابات الذكاء الاصطناعي', lead: 'اطرح على مساعدات الذكاء الاصطناعي الأسئلة التي يطرحها جمهورك وتابع مكانة مؤسستك في إجاباتها عبر الزمن.', points: [['أسئلتك', 'حدد الأسئلة المهمة لعلامتك أو مؤسستك.'], ['إجابات محفوظة', 'تُحفظ كل إجابة للمقارنة عبر الزمن.'], ['قياس الحضور', 'اعرف هل تُذكر وكيف.'], ['معالجة الفجوات', 'اكتشف الروايات غير الدقيقة قبل أن تترسخ.']] },
    api: { eyebrow: 'وظيفة', title: 'التكامل وواجهة البرمجة', lead: 'أدخل بيانات مرصاد إلى أدواتك عبر واجهة برمجة آمنة والتصدير، أو ادمج لوحة حية.', points: [['واجهة برمجة للعملاء', 'وصول برمجي إلى تغطيتك بمفتاح شخصي.'], ['التصدير', 'CSV وPDF وWord وPowerPoint من أي عرض.'], ['لوحات مشتركة', 'عرض حي للقراءة فقط داخل شبكتك الداخلية.'], ['الإشعارات', 'البريد وتيليغرام للتنبيهات والموجزات.']] },
    reputation: { eyebrow: 'حالة استخدام', title: 'إدارة السمعة والأزمات', lead: 'اكتشف الأزمة في ساعتها الأولى، وافهم مصدرها، وتابع انتشارها حتى تهدأ.', points: [['اكتشاف من الساعة الأولى', 'الذروات والنبرة السلبية تطلق تنبيهًا فوريًا.'], ['المصدر والانتشار', 'أي وسيلة أطلقت الخبر ومن تناقله.'], ['خلية أزمة مشتركة', 'الجميع يتابع اللوحة الحية نفسها.'], ['تقرير ما بعد الأزمة', 'تصدير الخط الزمني والتغطية في دقائق.']] },
    intelligence: { eyebrow: 'حالة استخدام', title: 'الرصد الاستراتيجي والإشارات الضعيفة', lead: 'تابع المنافسين والجهات التنظيمية والأسواق والدول، والتقط الإشارات الضعيفة التي تسبق التغيير.', points: [['الرادار الذكي', 'مواضيع ناشئة وأسماء صاعدة تظهر تلقائيًا.'], ['متابعات موضوعية', 'متابعة لكل سوق أو منافس أو ملف.'], ['تلخيص بالذكاء الاصطناعي', 'يحوّل Around مئات المقالات إلى موجز.'], ['أرشيف', 'أشهر من التغطية لفهم اتجاه ما.']] },
    pr: { eyebrow: 'حالة استخدام', title: 'العلاقات الإعلامية وأثر الحملات', lead: 'قِس مدى وصول كل إعلان، وقارن نفسك بنظرائك، وأثبت قيمة اتصالك.', points: [['كل إشارة', 'الصحافة والشبكات والتلفزيون والإذاعة حول حملاتك.'], ['حصة الحضور', 'حضورك مقابل نظرائك على أي فترة.'], ['النبرة والرسائل', 'تحقق من وصول رسائلك الأساسية.'], ['تقارير جاهزة للتسليم', 'صادرات بهويتك للإدارة أو للعملاء.']] },
    opinion: { eyebrow: 'حالة استخدام', title: 'متابعة الرأي العام', lead: 'افهم ما يناقشه الجمهور، وكيف تتطور المشاعر، وأي الأصوات تصنع النقاش.', points: [['مواضيع النقاش', 'مرتبة حسب الحجم والزخم.'], ['المشاعر عبر الزمن', 'منحنيات النبرة حسب الموضوع أو المنطقة أو المصدر.'], ['الأصوات المؤثرة', 'الأشخاص والصفحات التي تقود الحوار.'], ['رؤية جغرافية', 'التغطية على الخريطة حسب البلد والمدينة.']] },
    benchmark: { eyebrow: 'حالة استخدام', title: 'المقارنة وحصة الحضور', lead: 'قارن حضورك الإعلامي بالمنافسين أو المؤسسات المماثلة حسب الفترة والقناة والنبرة.', points: [['جنبًا إلى جنب', 'عدة مؤسسات في لوحة واحدة.'], ['حسب القناة', 'الإلكتروني والشبكات والتلفزيون والإذاعة منفصلة أو مجتمعة.'], ['فترة بعد فترة', 'التقدم مقاسًا أسبوعًا بعد أسبوع.'], ['قابل للتصدير', 'رسوم بيانية جاهزة لعروضك.']] },
    government: { eyebrow: 'المؤسسة', title: 'للمؤسسات والهيئات الحكومية', lead: 'تابع النقاش العام، وقِس مدى وصول الاتصال الرسمي، وأطلع القيادة كل صباح، بأمان بمستوى المؤسسات.', points: [['موجزات الصباح', 'مراجعة مكتوبة لما تغيّر خلال الليل.'], ['الرصد السمعي البصري', 'التلفزيون والإذاعة الوطنية والجهوية مفرّغة.'], ['ملفات حساسة', 'متابعات خاصة بدخول مقيّد.'], ['أمان سيادي', 'مساحة معزولة ومصادقة ثنائية وتحقق بالوجه.']] },
    enterprise: { eyebrow: 'المؤسسة', title: 'للشركات والمجموعات', lead: 'احمِ علامتك، وتابع أسواقك، وامنح كل إدارة الرؤية الإعلامية التي تحتاجها.', points: [['مساحة واحدة وفرق عديدة', 'أدوار وصلاحيات للاتصال والاستراتيجية والإدارة.'], ['حماية العلامة', 'تنبيهات الأزمات ومتابعة النبرة.'], ['ذكاء السوق', 'متابعة المنافسين والجهات التنظيمية والشركاء.'], ['التقارير', 'تقارير مجدولة للقيادات.']] },
    agencies: { eyebrow: 'المؤسسة', title: 'لوكالات الاتصال', lead: 'تابع عدة عملاء، وسلّم تقارير بهويتهم، واعرض نتائج تبرر عملك.', points: [['عرض لكل عميل', 'لوحات ومتابعات منظمة حسب العميل.'], ['تقارير مخصصة', 'شعار العميل وألوانه في كل تصدير.'], ['قياس الحملات', 'الوصول والنبرة وحصة الحضور.'], ['تسليم أسرع', 'يصوغ الذكاء الاصطناعي ملخصات يحسّنها فريقك.']] },
    newsrooms: { eyebrow: 'المؤسسة', title: 'لوسائل الإعلام وغرف الأخبار', lead: 'راقب المنافسين، وجد مصادر الخبر، وتابع البث دقيقة بدقيقة.', points: [['جدار البث المباشر', 'القنوات المنافسة مباشرة.'], ['النصوص المفرغة', 'جد اقتباسًا في ثوانٍ.'], ['تتبع القصص', 'من غطى ماذا ومتى.'], ['التنبيهات', 'المواضيع العاجلة فور ظهورها.']] },
    why: { eyebrow: 'لماذا مرصاد', title: 'صُمّم للإعلام الذي تتابعه فعلًا', lead: 'صممت Around Expressions منصة مرصاد للفرق التي تعتمد قراراتها على الإعلام العربي والفرنسي والإنجليزي، المحلي والدولي.', points: [['العربية أولًا', 'تحليل لغوي مصمم للعربية وصيغها المختلفة.'], ['تغطية إقليمية معمّقة', 'قنوات وإذاعات ومواقع محلية.'], ['الأمان منذ التصميم', 'كل عميل معزول وكل إجراء مسجل.'], ['أشخاص خلف المنصة', 'محللون ومدربون إلى جانبك.']] },
    languages: { eyebrow: 'لماذا مرصاد', title: 'العربية أولًا، وتعدد لغوي حقيقي', lead: 'تُحلَّل العربية والفرنسية والإنجليزية تحليلًا أصيلًا: البحث والنبرة والكيانات والملخصات والواجهة نفسها، من اليمين إلى اليسار.', points: [['تحليل أصيل للعربية', 'معالجة صحيحة لصيغ الكتابة والأسماء.'], ['إجابات بلغتك', 'يجيب Around بلغة السؤال.'], ['واجهة كاملة من اليمين إلى اليسار', 'كل شاشة مصممة للقراءة العربية.'], ['مصادر متعددة اللغات', 'قارن التغطية بين اللغات في عرض واحد.']] },
    coverage: { eyebrow: 'لماذا مرصاد', title: 'تغطية إقليمية معمّقة', lead: 'إلى جانب كبرى الوسائل الدولية، يتابع مرصاد القنوات والإذاعات والمواقع والصفحات المحلية التي تصنع الرأي في المنطقة.', points: [['البث المحلي', 'محطات تلفزيون وإذاعة جهوية مفرّغة.'], ['مواقع وصفحات محلية', 'مصادر تضاف عند الطلب.'], ['سلامة المصادر', 'كل مصدر يُفحص باستمرار.'], ['مصادرك الخاصة', 'اطلب منا إضافة الوسائل التي تحتاجها.']] },
    support: { eyebrow: 'لماذا مرصاد', title: 'فريق إلى جانبك', lead: 'تضبط Around Expressions مساحتك، وتدرب مستخدميك، وتبقى متاحة حين تحتاج إلى محلل.', points: [['إعداد مرافق', 'المواضيع والمصادر والتنبيهات تُضبط معك.'], ['التدريب', 'جلسات للمشرفين والمحللين.'], ['دعم سريع', 'جهة اتصال مباشرة لأسئلتك وطلباتك.'], ['خدمات التحليل', 'تقارير ودراسات مخصصة عند الطلب.']] },
    security: { eyebrow: 'الأمان', title: 'بياناتك تبقى ملكك', lead: 'لكل مؤسسة عميلة مساحة معزولة خاصة بها. الدخول شخصي ومسجل ومحمي.', points: [['مساحات معزولة', 'مستخدمون وبيانات وإعدادات منفصلة لكل مؤسسة، بعنوانها الخاص.'], ['مصادقة قوية', 'مصادقة ثنائية وتحقق اختياري بالوجه.'], ['سجل التدقيق', 'سجل للقراءة فقط لكل إجراء حساس.'], ['حماية من النسخ', 'علامة مائية ومنع النسخ وHTTPS في كل مكان، مع نسخ احتياطية يومية.']] },
    help: { eyebrow: 'الموارد', title: 'مركز المساعدة', lead: 'كل ما تحتاجه لاستخدام مرصاد يوميًا، وخط مباشر مع فريقنا عند الحاجة.', points: [['البداية', 'تسجيل الدخول واختيار اللغة والوصول إلى لوحاتك.'], ['البحث', 'الاستعلامات المنطقية والفلاتر وعمليات البحث المحفوظة.'], ['التنبيهات والتقارير', 'إنشاء المتابعات وجدولة التصدير.'], ['التواصل مع الدعم', 'راسلنا من المنصة أو من هذا الموقع.']] },
    academy: { eyebrow: 'الموارد', title: 'أكاديمية مرصاد', lead: 'دورات عملية حضوريًا أو عن بعد، لفريق جاهز من الأسبوع الأول.', points: [['الانطلاق', 'جلسة أولى لإتقان الأساسيات.'], ['مسار المحلل', 'البحث المتقدم واللوحات والذكاء الاصطناعي.'], ['مسار المشرف', 'المستخدمون والأدوار والصلاحيات والأمان.'], ['شهادات', 'شهادات مشاركة لكل جلسة.']] },
    guides: { eyebrow: 'الموارد', title: 'أدلة عملية', lead: 'أدلة قصيرة وملموسة يكتبها محللونا لتحقيق أقصى استفادة من الرصد.', points: [['كتابة استعلام منطقي', 'اجمع AND وOR وNOT والعبارات الدقيقة، وأضف صيغ كتابة الأسماء العربية.'], ['ضبط تنبيهات مفيدة', 'ابدأ بعتبة مرتفعة ثم اخفضها بعد أسبوع من الملاحظة.'], ['قراءة النبرة جيدًا', 'انظر إلى الاتجاه والمقالات خلفه، لا إلى رقم منفرد.'], ['بناء تقرير شهري', 'أرقام أساسية وأبرز القصص والنبرة وتحليل مكتوب قصير.']] },
    glossary: { eyebrow: 'الموارد', title: 'مسرد مصطلحات الرصد', lead: 'الكلمات التي ستصادفها في مرصاد، بشرح بسيط.', points: [['حصة الحضور', 'نصيبك من التغطية مقارنة بمجموعة من النظراء.'], ['النبرة', 'هل التغطية إيجابية أم محايدة أم سلبية تجاه موضوع ما.'], ['الذروة', 'تغطية أعلى بوضوح من مستواها المعتاد في هذا الوقت.'], ['المتابعة', 'استعلام محفوظ يعمل باستمرار ويمكنه إطلاق التنبيهات.']] },
    about: { eyebrow: 'الشركة', title: 'قصتنا', lead: 'أنشأت Around Expressions منصة مرصاد لتمنح المؤسسات والعلامات وغرف الأخبار رؤية واضحة للإعلام الذي يصنع بيئتها.', points: [['مهمتنا', 'تحويل التدفق الإعلامي إلى قرارات.'], ['نهجنا', 'التقنية والمحللون معًا.'], ['منطقتنا', 'صُممت والإعلام العربي والإقليمي في صميمها.'], ['اسمنا', 'منظومة الرصد والتحليل الإعلامي · MEDIA MINING & MONITORING SYSTEM (MMS).']] },
    careers: { eyebrow: 'الشركة', title: 'الوظائف', lead: 'نبحث عن محللين ومهندسين ومختصين في الإعلام يريدون بناء منصة الرصد المرجعية في المنطقة.', points: [['محللون إعلاميون', 'خبرة في الإعلام العربي والفرنسي والإنجليزي.'], ['مهندسون', 'البيانات والذكاء الاصطناعي ومنصات الويب.'], ['مدربون', 'مساعدة عملائنا على الاستفادة القصوى من مرصاد.'], ['ترشيحات تلقائية', 'أرسل ملفك عبر نموذج الاتصال.']] },
    press: { eyebrow: 'الشركة', title: 'الصحافة والملف الإعلامي', lead: 'للصحفيين والشركاء: معلومات عن مرصاد وAround Expressions، وعناصر الهوية عند الطلب.', points: [['عن مرصاد', 'منصة للرصد والذكاء الإعلامي من Around Expressions.'], ['عناصر الهوية', 'الشعارات والصور متاحة عند الطلب.'], ['مقابلات', 'فريقنا متاح للحديث عن اتجاهات الإعلام.'], ['التواصل الصحفي', 'استخدم نموذج الاتصال واذكر «صحافة».']] },
    contact: { eyebrow: 'الشركة', title: 'اتصل بنا', lead: 'أخبرنا بما تحتاج إلى متابعته. نجيب بسرعة ونعدّ عرضًا توضيحيًا على مواضيعك.', points: [['عرض على مواضيعك', 'جلسة مباشرة معدّة بمواضيعك وأسواقك.'], ['الأسعار', 'عرض يناسب مصادرك ومستخدميك وخدماتك.'], ['الدعم', 'يمكن للعملاء الكتابة من المنصة أيضًا.'], ['الشراكات', 'نرحب بالوكالات والموزعين.']] },
  },
  ui: { home: 'الرئيسية', related: 'اطّلع أيضًا', explore: 'اكتشف', back: 'العودة إلى الرئيسية', demoTitle: 'شاهد مرصاد على مواضيعك', demoText: 'نعدّ لك عرضًا مباشرًا على مواضيعك وأسواقك.', demo: 'اطلب عرضًا توضيحيًا', login: 'تسجيل الدخول', open: 'فتح القائمة', close: 'إغلاق القائمة' },
  ask: {
    button: 'اسأل Around',
    title: 'Around',
    subtitle: 'مساعد مرصاد',
    hello: 'مرحبًا! أنا Around. اسألني عن مرصاد: المصادر واللغات والتنبيهات والأمان أو العرض التوضيحي.',
    placeholder: 'اكتب سؤالك…',
    send: 'إرسال',
    suggestions: 'أسئلة شائعة',
    fallback: 'لست متأكدًا من أنني فهمت. سيجيبك فريقنا بدقة خلال عرض توضيحي على مواضيعك.',
    demo: 'اطلب عرضًا توضيحيًا',
    readMore: 'اعرف المزيد',
    disclaimer: 'إجابات عن مرصاد فقط. داخل المنصة، يجيب Around أيضًا انطلاقًا من تغطيتك.',
    qa: [
      { q: 'ماذا يرصد مرصاد؟', a: 'الصحافة الإلكترونية والمطبوعة والبودكاست وشبكات التواصل ويوتيوب والمنتديات والتلفزيون والإذاعة، في تدفق واحد بلا تكرار يُحلَّل باستمرار.', to: 'platform', keys: ['يرصد', 'مصادر', 'مصدر', 'تلفزيون', 'إذاعة', 'شبكات', 'صحافة', 'ماذا'] },
      { q: 'ما اللغات المدعومة؟', a: 'تُحلَّل العربية والفرنسية والإنجليزية تحليلًا أصيلًا، والواجهة كاملة باللغات الثلاث، من اليمين إلى اليسار.', to: 'languages', keys: ['لغة', 'لغات', 'عربية', 'فرنسية', 'إنجليزية'] },
      { q: 'كيف تعمل التنبيهات؟', a: 'تنشئ متابعات على أي استعلام بعتبات تختارها. يبلغك مرصاد بالبريد أو تيليغرام، ويمكنه إطلاق إنذار نشاط على الشاشة عند الذروة.', to: 'alerts', keys: ['تنبيه', 'تنبيهات', 'إنذار', 'تيليغرام', 'بريد', 'ذروة'] },
      { q: 'هل بياناتي آمنة؟', a: 'لكل عميل مساحة معزولة بدخول شخصي ومصادقة ثنائية وتحقق اختياري بالوجه وسجل تدقيق وحماية من النسخ.', to: 'security', keys: ['أمان', 'آمنة', 'بيانات', 'خصوصية', 'حماية'] },
      { q: 'ماذا يفعل الذكاء الاصطناعي؟', a: 'داخل المنصة، يجيب Around عن أسئلتك حول تغطيتك مع المصادر، ويكتب الملخصات والموجزات اليومية، ويفسر الذروات والنبرة.', to: 'around', keys: ['ذكاء', 'مساعد', 'ملخص', 'موجز', 'around'] },
      { q: 'كيف أحصل على عرض توضيحي؟', a: 'انقر على «اطلب عرضًا توضيحيًا» واترك بياناتك. نعدّ لك جلسة مباشرة على مواضيعك وأسواقك.', to: 'contact', keys: ['عرض', 'سعر', 'أسعار', 'اتصال', 'تجربة', 'تكلفة'] },
    ],
  },
}

export const MEGA: Record<LandingLang, Mega> = { en, fr, ar }
