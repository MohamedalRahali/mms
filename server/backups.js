import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

/**
 * Sauvegarde quotidienne des données de MMS (audit produit v4, note de sécurité) : comptes, droits, veilles,
 * tableaux, portail, journaux d'audit… dans data/backups/mms-data-AAAA-MM-JJ.tgz, 14 jours gardés.
 * Exclus : les exports de la veille (data/libye, reconstruits par le collecteur), l'audio, les sauvegardes elles-mêmes.
 * Le dossier data/ n'est jamais touché par les mises en ligne (install-vps.sh l'exclut), les archives y restent.
 * Copie hors serveur : à prévoir côté hébergeur (sauvegarde automatique OVH) — voir la note de sécurité.
 */

const KEEP = 14
let dir = ''
let last = null

export function backupStatus() {
  try {
    const files = fs
      .readdirSync(path.join(dir, 'backups'))
      .filter((f) => /^mms-data-\d{4}-\d{2}-\d{2}\.tgz$/.test(f))
      .sort()
    const newest = files[files.length - 1]
    return { count: files.length, newest: newest || '', size: newest ? fs.statSync(path.join(dir, 'backups', newest)).size : 0, last }
  } catch {
    return { count: 0, newest: '', size: 0, last }
  }
}

export function runBackup(now = new Date()) {
  return new Promise((resolve) => {
    const out = path.join(dir, 'backups')
    fs.mkdirSync(out, { recursive: true, mode: 0o700 })
    const file = path.join(out, `mms-data-${now.toISOString().slice(0, 10)}.tgz`)
    const args = ['-czf', file, '--exclude=./backups', '--exclude=./libye', '--exclude=*.mp3', '--exclude=*.m4a', '--exclude=*.wav', '--exclude=*.ogg', '--exclude=*.tmp', '-C', dir, '.']
    const p = spawn('tar', args, { stdio: 'ignore' })
    p.on('error', (err) => {
      last = { at: now.toISOString(), ok: false, error: err.message }
      resolve(last)
    })
    p.on('close', (code) => {
      // tar renvoie 1 quand un fichier change pendant la lecture (journal en cours d'écriture) : archive valable
      last = { at: now.toISOString(), ok: code === 0 || code === 1, code }
      try {
        const old = fs
          .readdirSync(out)
          .filter((f) => /^mms-data-\d{4}-\d{2}-\d{2}\.tgz$/.test(f))
          .sort()
        for (const f of old.slice(0, Math.max(old.length - KEEP, 0))) fs.unlinkSync(path.join(out, f))
        fs.chmodSync(file, 0o600)
      } catch {
        /* rotation au prochain passage */
      }
      resolve(last)
    })
  })
}

export function startBackups(dataDir) {
  dir = dataDir
  if (process.env.MMS_BACKUPS === '0') return
  // 10 minutes après le démarrage (pas pendant les mises en ligne successives), puis toutes les 24 heures
  setTimeout(() => runBackup().catch(() => {}), 10 * 60_000).unref()
  setInterval(() => runBackup().catch(() => {}), 24 * 3600_000).unref()
}
