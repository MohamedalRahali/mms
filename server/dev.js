import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Lance le serveur MMS et le relance dès qu'un fichier de server/ ou .env change.
 * On compare les dates de modification chaque seconde : les notifications du système
 * n'arrivent pas quand les fichiers sont modifiés depuis un dossier partagé.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const watched = () => [
  ...fs.readdirSync(path.join(root, 'server')).filter((f) => f.endsWith('.js')).map((f) => path.join(root, 'server', f)),
  path.join(root, '.env'),
]

function snapshot() {
  return watched()
    .map((f) => {
      try {
        return `${f}:${fs.statSync(f).mtimeMs}`
      } catch {
        return `${f}:absent`
      }
    })
    .join('|')
}

let child = null
function start() {
  child = spawn(process.execPath, [path.join(root, 'server', 'index.js')], { stdio: 'inherit', cwd: root })
}

let last = snapshot()
start()
setInterval(() => {
  const now = snapshot()
  if (now === last) return
  last = now
  console.log('Fichier modifié : redémarrage du serveur MMS…')
  child.once('exit', start)
  child.kill()
}, 1000)
