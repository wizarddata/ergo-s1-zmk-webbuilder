#!/usr/bin/env node
// Refresh bundled default keymap + layout from arcanemachine/ergo-s-1-zmk-config
const fs = require('fs')
const path = require('path')
const https = require('https')

const REPO = process.env.UPSTREAM_DEFAULTS_REPO || 'arcanemachine/ergo-s-1-zmk-config'
const REVISION = process.env.UPSTREAM_DEFAULTS_REV || 'master'
const FILES = ['info.json', 'ergo_s1_oe.keymap']
const DEST = path.join(__dirname, '..', 'api', 'services', 'zmk', 'data', 'defaults')

function fetch (url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ergo-s1-builder' } }, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return fetch(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

;(async () => {
  fs.mkdirSync(DEST, { recursive: true })
  for (const f of FILES) {
    const url = `https://raw.githubusercontent.com/${REPO}/${REVISION}/config/${f}`
    process.stdout.write(`fetching ${f}... `)
    const buf = await fetch(url)
    fs.writeFileSync(path.join(DEST, f), buf)
    console.log(`${buf.length} bytes`)
  }
  console.log(`✓ defaults synced from ${REPO}@${REVISION}`)
})().catch(err => {
  console.error(err.message)
  process.exit(1)
})
