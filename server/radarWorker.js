import { Worker, isMainThread, parentPort } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { emergingTopics, sentimentBarometer, smartAlerts, storyClusters } from './radar.js'

/**
 * Radar calculé en arrière-plan (thread séparé) : à chaque nouvelle version des données, les vues que l'interface
 * demande (sujets 6/24/72 h et 7 j, histoires 24/48 h et 7 j, baromètre 14 j, alertes) sont préparées sans bloquer
 * le serveur. Les routes /api/radar/* servent ce résultat ; une combinaison non préparée est calculée comme avant.
 */

// Mêmes clés que radarRoute (server/index.js) : chemin | flux | heures | jours
export const JOBS = [
  ...[6, 24, 72, 168].map((hours) => ({ path: '/emerging', hours, days: 0 })),
  ...[24, 48, 168].map((hours) => ({ path: '/stories', hours, days: 0 })),
  { path: '/sentiment', hours: 0, days: 14 },
  { path: '/alerts', hours: 0, days: 0 },
]

function compute(job, items) {
  if (job.path === '/emerging') return { topics: emergingTopics(items, { hours: job.hours || 24 }) }
  if (job.path === '/stories') return { stories: storyClusters(items, { hours: job.hours || 48 }) }
  if (job.path === '/sentiment') return sentimentBarometer(items, { days: job.days || 14 })
  return { alerts: smartAlerts(items) }
}

// Champs utilisés par le radar : on n'envoie pas le reste au thread
const FIELDS = ['id', 'flux', 'title', 'summary', 'category', 'date', 'origin', 'channel', 'media', 'url', 'tone', 'people', 'orgs', 'places', 'importance', 'lang', 'ly']
const slim = (it) => Object.fromEntries(FIELDS.filter((k) => it[k] !== undefined).map((k) => [k, it[k]]))

if (!isMainThread) {
  parentPort.on('message', ({ stamp, items }) => {
    const out = {}
    for (const job of JOBS) {
      try {
        out[`${job.path}|${job.hours}|${job.days}`] = compute(job, items)
      } catch (err) {
        out[`${job.path}|${job.hours}|${job.days}`] = { error: err.message }
      }
    }
    parentPort.postMessage({ stamp, out })
  })
}

/**
 * Lance le thread et la surveillance des données (main thread) ; renvoie lookup(path, hours, days, lastUpdate)
 * qui donne le résultat préparé pour cette version des données, ou null.
 */
export function startRadarWorker(getItems, { everyMs = 20_000 } = {}) {
  let worker = null
  let ready = { stamp: null, out: {} }
  let pending = null
  let failures = 0
  const spawn = () => {
    worker = new Worker(fileURLToPath(import.meta.url))
    worker.unref()
    worker.on('message', (msg) => {
      ready = msg
      pending = null
      failures = 0
    })
    worker.on('error', (err) => {
      console.error('Radar (arrière-plan) :', err.message)
      pending = null
      failures++
    })
    worker.on('exit', () => {
      worker = null
      pending = null
    })
  }
  const tick = () => {
    const { items, lastUpdate } = getItems()
    if (!lastUpdate || ready.stamp === lastUpdate || pending === lastUpdate || failures >= 3) return
    if (!worker) spawn()
    pending = lastUpdate
    worker.postMessage({ stamp: lastUpdate, items: items.map(slim) })
  }
  setTimeout(tick, 3_000).unref()
  setInterval(tick, everyMs).unref()
  return (path, hours, days, lastUpdate) => {
    if (ready.stamp !== lastUpdate) return null
    const hit = ready.out[`${path}|${hours}|${days}`]
    return hit && !hit.error ? hit : null
  }
}
