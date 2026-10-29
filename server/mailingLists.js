import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { splitRecipients } from './mailPolicy.js'

/**
 * Listes de diffusion (قوائم المراسلة) : groupes d'adresses nommés, communs à l'équipe, réutilisés dans les champs
 * « المرسَل إليهم » (veilles, rapports, rapport exécutif, recherches enregistrées). Seules les adresses des domaines
 * autorisés (console Super Admin) sont acceptées, comme pour tout envoi.
 * Stockage : data/mailing-lists.json.
 */

const MAX_LISTS = 50
const MAX_EMAILS = 50
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
let file = ''
let lists = []

export function initMailingLists(dataDir) {
  file = path.join(dataDir, 'mailing-lists.json')
  try {
    lists = JSON.parse(fs.readFileSync(file, 'utf8')).lists || []
  } catch {
    lists = []
  }
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ lists }, null, 2))
  fs.renameSync(tmp, file)
}

const fail = (code, status = 400) => Object.assign(new Error(code), { code, status })

/** Nom et adresses vérifiés : format, nombre, domaines autorisés ; doublons retirés */
export function cleanList(body = {}) {
  const name = String(body.name || '').trim().slice(0, 80)
  if (!name) throw fail('NO_NAME')
  const emails = [
    ...new Set(
      (Array.isArray(body.emails) ? body.emails : String(body.emails || '').split(/[\s,;،]+/))
        .map((e) => String(e).trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  if (!emails.length) throw fail('NO_EMAILS')
  if (emails.length > MAX_EMAILS) throw fail('TOO_MANY_EMAILS')
  if (emails.some((e) => !EMAIL_RE.test(e))) throw fail('BAD_EMAIL')
  if (splitRecipients(emails).blocked.length) throw fail('DOMAIN_BLOCKED')
  return { name, emails }
}

export const listMailingLists = () => lists.map((l) => ({ ...l }))

export function createMailingList(body, by = '') {
  if (lists.length >= MAX_LISTS) throw fail('TOO_MANY')
  const clean = cleanList(body)
  if (lists.some((l) => l.name === clean.name)) throw fail('NAME_TAKEN', 409)
  const list = { id: Math.random().toString(36).slice(2, 10), ...clean, createdBy: String(by).slice(0, 120), updatedAt: new Date().toISOString() }
  lists.push(list)
  save()
  return { ...list }
}

export function updateMailingList(id, body, by = '') {
  const list = lists.find((l) => l.id === id)
  if (!list) throw fail('NOT_FOUND', 404)
  const clean = cleanList(body)
  if (lists.some((l) => l.id !== id && l.name === clean.name)) throw fail('NAME_TAKEN', 409)
  Object.assign(list, clean, { updatedBy: String(by).slice(0, 120), updatedAt: new Date().toISOString() })
  save()
  return { ...list }
}

export function deleteMailingList(id) {
  const before = lists.length
  lists = lists.filter((l) => l.id !== id)
  if (lists.length === before) throw fail('NOT_FOUND', 404)
  save()
  return true
}

export function mountMailingLists(app, { audit = () => {} } = {}) {
  const wrap = (fn) => (req, res) => {
    try {
      res.json(fn(req))
    } catch (err) {
      res.status(err.status || 500).json({ error: err.code || 'FAILED' })
    }
  }
  app.get('/api/mailing-lists', wrap(() => ({ lists: listMailingLists() })))
  app.post(
    '/api/mailing-lists',
    express.json({ limit: '16kb' }),
    wrap((req) => {
      const list = createMailingList(req.body, req.user.email)
      audit(req, 'mailing_list_create', list.name, `${list.emails.length}`)
      return { list }
    }),
  )
  app.put(
    '/api/mailing-lists/:id',
    express.json({ limit: '16kb' }),
    wrap((req) => {
      const list = updateMailingList(req.params.id, req.body, req.user.email)
      audit(req, 'mailing_list_update', list.name, `${list.emails.length}`)
      return { list }
    }),
  )
  app.delete(
    '/api/mailing-lists/:id',
    wrap((req) => {
      deleteMailingList(req.params.id)
      audit(req, 'mailing_list_delete', req.params.id, '')
      return { ok: true }
    }),
  )
}
