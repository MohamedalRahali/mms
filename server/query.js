import { normalize } from './watches.js'

/**
 * Recherche booléenne, comme chez Meltwater :
 *   ليبيا AND (نفط OR oil) NOT "سعر الصرف"
 * Opérateurs : AND / ET / &, OR / OU / أو / |, NOT / SAUF / - ; parenthèses ; "expression exacte".
 * Deux termes côte à côte valent AND. La comparaison ignore casse, diacritiques et variantes d'alef/ya/ta marbuta.
 */

const OPS = {
  and: /^(and|et|&&?)$/i,
  or: /^(or|ou|أو|\|\|?)$/i,
  not: /^(not|sauf)$/i,
}

function tokenize(input) {
  const tokens = []
  const re = /\s*(?:(\()|(\))|"([^"]*)"|«([^»]*)»|([^\s()"«»]+))/gy
  let m
  while ((m = re.exec(input))) {
    if (m[1]) tokens.push({ t: '(' })
    else if (m[2]) tokens.push({ t: ')' })
    else if (m[3] != null || m[4] != null) tokens.push({ t: 'term', v: m[3] ?? m[4] })
    else {
      const w = m[5]
      if (OPS.and.test(w)) tokens.push({ t: 'and' })
      else if (OPS.or.test(w)) tokens.push({ t: 'or' })
      else if (OPS.not.test(w)) tokens.push({ t: 'not' })
      else if (w.length > 1 && w[0] === '-') tokens.push({ t: 'not' }, { t: 'term', v: w.slice(1) })
      else tokens.push({ t: 'term', v: w.replace(/\*$/, '') })
    }
    if (re.lastIndex >= input.length) break
  }
  return tokens
}

/** Arbre de la requête, ou null si elle est vide ; lève une erreur si elle est mal formée */
export function parseQuery(input) {
  const tokens = tokenize(String(input || '').trim())
  let i = 0
  const peek = () => tokens[i]
  function or() {
    let left = and()
    while (peek()?.t === 'or') {
      i++
      left = { op: 'or', a: left, b: and() }
    }
    return left
  }
  function and() {
    let left = not()
    while (peek() && peek().t !== 'or' && peek().t !== ')') {
      if (peek().t === 'and') i++
      left = { op: 'and', a: left, b: not() }
    }
    return left
  }
  function not() {
    if (peek()?.t === 'not') {
      i++
      return { op: 'not', a: not() }
    }
    return atom()
  }
  function atom() {
    const tok = tokens[i++]
    if (!tok) throw new Error('incomplete')
    if (tok.t === '(') {
      const e = or()
      if (tokens[i++]?.t !== ')') throw new Error('parenthesis')
      return e
    }
    if (tok.t === 'term') return { op: 'term', v: normalize(tok.v) }
    throw new Error('unexpected')
  }
  if (!tokens.length) return null
  const tree = or()
  if (i < tokens.length) throw new Error('unexpected')
  return tree
}

function test(node, text) {
  switch (node.op) {
    case 'term':
      return !node.v || text.includes(node.v)
    case 'and':
      return test(node.a, text) && test(node.b, text)
    case 'or':
      return test(node.a, text) || test(node.b, text)
    case 'not':
      return !test(node.a, text)
  }
  return false
}

/** Fonction de test d'un texte déjà normalisé ; une requête mal formée est cherchée telle quelle */
export function compileQuery(input) {
  try {
    const tree = parseQuery(input)
    if (!tree) return null
    return (text) => test(tree, text)
  } catch {
    const v = normalize(input)
    return v ? (text) => text.includes(v) : null
  }
}

/** Erreur de syntaxe à afficher sous le champ de recherche, ou '' */
export function queryError(input) {
  try {
    parseQuery(input)
    return ''
  } catch (err) {
    return err.message
  }
}

// Texte normalisé de chaque fiche, gardé tant que la fiche ne change pas
const textCache = new WeakMap()
export function searchText(it) {
  let t = textCache.get(it)
  if (t == null) {
    // Transcription des émissions et podcasts, auteur et sujet des commentaires et messages de forum compris
    t = normalize(
      `${it.title} ${it.summary} ${it.origin} ${(it.people || []).join(' ')} ${(it.orgs || []).join(' ')} ${(it.places || []).join(' ')} ${it.transcription || ''} ${it.author || ''} ${it.thread?.topic || ''} ${it.parent?.title || ''}`,
    )
    textCache.set(it, t)
  }
  return t
}
