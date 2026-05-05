const fs = require('fs')
const path = require('path')
const keyBy = require('lodash/keyBy')

const behaviors = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'zmk-behaviors.json')))
const behaviorsByCode = keyBy(behaviors, 'code')

class KeymapCodeParseError extends Error {
  constructor (message) {
    super(message)
    this.name = 'KeymapCodeParseError'
    this.errors = [message]
  }
}

function stripComments (text) {
  return text
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

function extractDefines (text) {
  const defines = []
  const cleaned = text.replace(/^[ \t]*#define[ \t]+(\w+)[ \t]+([^\n]+?)\s*$/gm, (_, name, val) => {
    defines.push({ name, value: val.trim() })
    return ''
  })
  return { cleaned, defines }
}

function expandDefines (text, defines) {
  const map = {}
  for (const d of defines) map[d.name] = d.value
  for (let pass = 0; pass < 6; pass++) {
    let changed = false
    for (const [k, v] of Object.entries(map)) {
      const re = new RegExp(`\\b${k}\\b`, 'g')
      const next = text.replace(re, v)
      if (next !== text) { text = next; changed = true }
    }
    if (!changed) break
  }
  return text
}

function findBalancedBlock (text, openIdx) {
  let depth = 1
  let i = openIdx + 1
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') depth--
    if (depth === 0) return { body: text.slice(openIdx + 1, i), endIdx: i + 1 }
    i++
  }
  throw new KeymapCodeParseError('Unbalanced braces')
}

function tokenizeBindings (text) {
  const tokens = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && /[\s,;]/.test(text[i])) i++
    if (i >= text.length) break
    const start = i
    if (text[i] === '&') {
      i++
      while (i < text.length && /[\w]/.test(text[i])) i++
      tokens.push(text.slice(start, i))
    } else if (/[\w]/.test(text[i])) {
      while (i < text.length && /[\w]/.test(text[i])) i++
      if (text[i] === '(') {
        let depth = 1
        i++
        while (i < text.length && depth > 0) {
          if (text[i] === '(') depth++
          else if (text[i] === ')') depth--
          i++
        }
      }
      tokens.push(text.slice(start, i))
    } else {
      i++
    }
  }
  return tokens
}

function groupBindings (tokens) {
  const bindings = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (!t.startsWith('&')) {
      i++
      continue
    }
    const behavior = behaviorsByCode[t]
    let entry = t
    let consumed = 0

    if (behavior && behavior.params) {
      for (let p = 0; p < behavior.params.length; p++) {
        const next = tokens[i + 1 + consumed]
        if (!next || next.startsWith('&')) break
        entry += ' ' + next
        consumed++
        if (behavior.params[p] === 'command' && Array.isArray(behavior.commands)) {
          const cmd = behavior.commands.find(c => c.code === next)
          if (cmd && Array.isArray(cmd.additionalParams)) {
            for (let q = 0; q < cmd.additionalParams.length; q++) {
              const more = tokens[i + 1 + consumed]
              if (!more || more.startsWith('&')) break
              entry += ' ' + more
              consumed++
            }
          }
        }
      }
    }

    bindings.push(entry)
    i += 1 + consumed
  }
  return bindings
}

function parseKeymapCode (rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new KeymapCodeParseError('Empty or invalid keymap text')
  }

  let text = stripComments(rawText)
  const ext = extractDefines(text)
  text = expandDefines(ext.cleaned, ext.defines)

  const keymapHeader = text.search(/keymap\s*\{/)
  if (keymapHeader === -1) throw new KeymapCodeParseError('No `keymap { ... }` block found')
  const openIdx = text.indexOf('{', keymapHeader)
  const { body: keymapBody } = findBalancedBlock(text, openIdx)

  const layers = []
  const layerHeaderRe = /(\w+)\s*\{/g
  let m
  while ((m = layerHeaderRe.exec(keymapBody)) !== null) {
    const layerName = m[1]
    if (layerName === 'compatible' || layerName === 'bindings') continue
    const layerOpen = keymapBody.indexOf('{', m.index)
    let block
    try {
      block = findBalancedBlock(keymapBody, layerOpen)
    } catch (_) {
      continue
    }
    layerHeaderRe.lastIndex = block.endIdx

    const bindMatch = block.body.match(/bindings\s*=\s*<([\s\S]*?)>\s*;/)
    if (!bindMatch) continue

    const tokens = tokenizeBindings(bindMatch[1])
    const bindings = groupBindings(tokens)
    if (bindings.length > 0) {
      layers.push({ name: layerName, bindings })
    }
  }

  if (layers.length === 0) {
    throw new KeymapCodeParseError('No layers with bindings parsed from keymap text')
  }

  return {
    keyboard: 'ergo_s1',
    keymap: 'imported',
    layout: 'LAYOUT',
    layer_names: layers.map(l => l.name),
    layers: layers.map(l => l.bindings),
    defines: ext.defines
  }
}

function extractDefinesOnly (rawText) {
  if (!rawText || typeof rawText !== 'string') return []
  const text = stripComments(rawText)
  return extractDefines(text).defines
}

module.exports = {
  parseKeymapCode,
  extractDefinesOnly,
  KeymapCodeParseError
}
