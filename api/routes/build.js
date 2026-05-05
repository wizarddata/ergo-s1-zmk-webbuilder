const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { Router } = require('express')

const config = require('../config')
const cache = require('../services/zmk/west-cache')
const localBuild = require('../services/zmk/local-build')
const { generateKeymap } = require('../services/zmk/keymap')
const registry = require('../services/build-registry')
const revisions = require('../services/zmk/revisions')

const router = Router()

function sse (res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  return (event, data) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }
}

const VALID_SHIELDS = new Set(Object.keys(localBuild.SHIELD_DIRS))

router.get('/preflight', async (req, res) => {
  try {
    await cache.preflight()
    res.json({ ok: true, image: config.DOCKER_IMAGE, volume: cache.VOLUME, artifacts: config.ARTIFACTS_DIR })
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message })
  }
})

router.get('/zmk-revisions', async (req, res) => {
  try {
    const list = await revisions.listRevisions()
    res.json({ ok: true, revisions: list })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.post('/reset-cache', async (req, res) => {
  try {
    if (registry.isRunning()) {
      return res.status(409).json({ ok: false, error: 'build in progress' })
    }
    await cache.resetCache()
    res.json({ ok: true, volume: cache.VOLUME })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

router.get('/state', (req, res) => res.json(registry.state()))

router.get('/local/stream/:id', (req, res) => {
  const send = sse(res)
  const c = registry.current
  if (!c || c.id !== req.params.id) {
    send('error', { message: 'no such build', activeId: c?.id })
    return res.end()
  }
  for (const { event, data } of c.logs) send(event, data)
  if (!registry.isRunning()) {
    return res.end()
  }
  const onEvent = ({ event, data }) => send(event, data)
  registry.on('event', onEvent)
  const onEnd = () => {
    registry.off('event', onEvent)
    res.end()
  }
  registry.once('end', onEnd)
  res.on('close', () => {
    registry.off('event', onEvent)
    registry.off('end', onEnd)
  })
})

router.post('/local', async (req, res) => {
  const { board, shields, layout, keymap, defines = [], zmkRevision } = req.body || {}
  const send = sse(res)

  if (registry.isRunning()) {
    send('error', { message: 'build already running', existingId: registry.current.id })
    return res.end()
  }

  if (!board || !Array.isArray(shields) || shields.length === 0) {
    send('error', { message: 'board + shields[] required' })
    return res.end()
  }
  for (const s of shields) {
    if (!VALID_SHIELDS.has(s)) {
      send('error', { message: `Unknown shield: ${s}` })
      return res.end()
    }
  }
  if (!layout || !keymap) {
    send('error', { message: 'layout + keymap required' })
    return res.end()
  }

  let resolvedRev
  try {
    resolvedRev = await revisions.resolveRequested(zmkRevision)
  } catch (err) {
    send('error', { message: `revision resolve failed: ${err.message}` })
    return res.end()
  }

  const id = crypto.randomBytes(8).toString('hex') + '-' + Date.now()
  registry.start(id, { board, shields, revision: resolvedRev })
  send('attach', { id, revision: resolvedRev })
  for (const { event, data } of registry.current.logs) send(event, data)

  const onEvent = ({ event, data }) => send(event, data)
  registry.on('event', onEvent)
  res.on('close', () => registry.off('event', onEvent))

  const events = {
    phase: (name, extra = {}) => registry.push('status', { phase: name, ...extra }),
    log: (line) => registry.push('log', { line })
  }

  try {
    events.phase('prepare', { message: `Preflight + cache check (rev ${resolvedRev.shortSha})` })
    events.log(`Selected ZMK fork revision: ${resolvedRev.label} (${resolvedRev.sha})`)
    await cache.preflight()
    await cache.ensureImage(events)
    await cache.ensureCache(events, resolvedRev.sha)

    const keymapWithDefines = Object.assign({}, keymap, { defines })
    const generated = generateKeymap(layout, keymapWithDefines)
    const keymapText = generated.code

    const { id: buildId, outDir } = await localBuild.runBuilds(
      { board, shields, keymapText, id, revShort: resolvedRev.shortSha },
      events
    )

    events.phase('archive', { message: 'Build complete' })
    const files = fs.readdirSync(outDir).filter(f => f.endsWith('.uf2'))
    registry.push('done', {
      buildId,
      shields,
      files,
      revision: resolvedRev,
      downloadUrls: files.map(name => `/build/local/artifact/${buildId}/${name}`)
    })
  } catch (err) {
    console.error('Local build error', err)
    registry.push('error', { message: err.message || String(err), detail: err.stack })
  } finally {
    registry.off('event', onEvent)
    res.end()
  }
})

router.get('/local/artifact/:id/:name', (req, res) => {
  const { id, name } = req.params
  if (!name.endsWith('.uf2')) return res.status(400).json({ error: 'invalid artifact' })
  const filePath = localBuild.artifactPath(id, name)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' })
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(name)}"`)
  fs.createReadStream(filePath).pipe(res)
})

module.exports = router
