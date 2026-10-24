import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

/**
 * Clés d'API configurées, pour la page Administration : seulement présente / absente, jamais la valeur.
 * MMS lit son propre environnement ; la veille Libye, son fichier ../veille-libye/.env.
 */

// Les alertes vont par paire : bot Telegram + discussion, compte SMTP + mot de passe
const MMS_KEYS = [['ANTHROPIC_API_KEY'], ['GEMINI_API_KEY'], ['OPENAI_API_KEY'], ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'], ['SMTP_USER', 'SMTP_PASS']]

// Mêmes clés que la commande « libye cles » du collecteur ; certaines vont par paire
const LIBYE_KEYS = [
  ['ANTHROPIC_API_KEY'],
  ['X_BEARER_TOKEN'],
  ['APIFY_TOKEN'],
  ['OPENAI_API_KEY'],
  ['NEWSAPI_AI_KEY'],
  ['YOUTUBE_API_KEY'],
  ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH'],
  ['BLUESKY_APP_PASSWORD', 'BLUESKY_HANDLE'],
  ['REDDIT_CLIENT_SECRET', 'REDDIT_CLIENT_ID'],
  ['PROXY_URL'],
]

export function keyStatus(root) {
  const mms = MMS_KEYS.map(([name, ...pair]) => ({ name, set: [name, ...pair].every((k) => Boolean(process.env[k])) }))
  let libye = null
  try {
    const env = dotenv.parse(fs.readFileSync(path.resolve(root, '../veille-libye/.env')))
    // Comme le lanceur « libye » : la clé Claude vient de /opt/mms/.env, sauf si la veille définit la sienne
    if (!('ANTHROPIC_API_KEY' in env)) env.ANTHROPIC_API_KEY = readEnv(path.join(root, '.env')).ANTHROPIC_API_KEY || ''
    libye = LIBYE_KEYS.map(([name, ...pair]) => ({ name, set: [name, ...pair].every((k) => Boolean(env[k])) }))
    libye[0].budget = Number(env.LIBYE_CLAUDE_BUDGET_JOUR || 5)
  } catch {
    /* veille Libye absente de ce serveur */
  }
  return { mms, libye }
}

function readEnv(file) {
  try {
    return dotenv.parse(fs.readFileSync(file))
  } catch {
    return {}
  }
}
