const { Router } = require('express')

const config = require('../config')
const {
  ensureFork,
  fetchRepoBranches,
  fetchKeyboardFiles,
  commitChanges,
  MissingRepoFile
} = require('../services/github')
const { parseKeymap, validateKeymapJson, KeymapValidationError, generateKeymap } = require('../services/zmk/keymap')
const { validateInfoJson, InfoValidationError } = require('../services/zmk/layout')
const { parseKeymapCode, KeymapCodeParseError } = require('../services/zmk/parse-keymap-code')

const router = Router()

const handleError = (err, req, res, next) => {
  if (err.response?.status === 401) {
    console.error('GitHub auth failed', err.response.data)
    return res.status(401).json({ error: 'GitHub PAT invalid or insufficient scopes (needs repo + workflow)' })
  }
  const message = err.response ? `[${err.response.status}] ${JSON.stringify(err.response.data)}` : (err.message || err)
  console.error(message, err.stack)
  res.status(500).json({ error: String(err.message || err) })
}

router.get('/config', (req, res) => {
  res.json({
    upstream: config.UPSTREAM_REPO,
    upstreamBranch: config.UPSTREAM_BRANCH,
    forkBranch: config.FORK_BRANCH,
    zmkFork: config.ZMK_FORK_REPO,
    zmkRevision: config.ZMK_FORK_REVISION,
    boards: config.BOARDS
  })
})

router.get('/setup', async (req, res, next) => {
  try {
    const result = await ensureFork()
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.get('/branches/:owner/:repo', async (req, res, next) => {
  try {
    const branches = await fetchRepoBranches(`${req.params.owner}/${req.params.repo}`)
    res.json(branches)
  } catch (err) {
    next(err)
  }
})

router.get('/keyboard-files/:owner/:repo', async (req, res, next) => {
  const repo = `${req.params.owner}/${req.params.repo}`
  const branch = req.query.branch || config.FORK_BRANCH
  try {
    const { info, keymap, defines } = await fetchKeyboardFiles(repo, branch)
    validateInfoJson(info)
    validateKeymapJson(keymap)
    res.json({ info, keymap: parseKeymap(keymap), defines })
  } catch (err) {
    if (err instanceof MissingRepoFile) {
      return res.status(400).json({ name: err.constructor.name, path: err.path, errors: err.errors })
    }
    if (err instanceof InfoValidationError || err instanceof KeymapValidationError) {
      return res.status(400).json({ name: err.name, errors: err.errors })
    }
    next(err)
  }
})

router.post('/import-keymap', (req, res) => {
  const { text } = req.body
  try {
    const json = parseKeymapCode(text)
    validateKeymapJson(json)
    res.json({ keymap: parseKeymap(json) })
  } catch (err) {
    if (err instanceof KeymapCodeParseError || err instanceof KeymapValidationError) {
      return res.status(400).json({ name: err.name, errors: err.errors })
    }
    console.error('import-keymap error', err)
    res.status(500).json({ error: err.message || String(err) })
  }
})

router.post('/generate-keymap', (req, res, next) => {
  try {
    const { layout, keymap, defines = [] } = req.body
    if (!layout || !keymap) {
      return res.status(400).json({ error: 'layout and keymap required' })
    }
    const keymapWithDefines = Object.assign({}, keymap, { defines })
    const generated = generateKeymap(layout, keymapWithDefines)
    res.type('text/plain').send(generated.code)
  } catch (err) {
    next(err)
  }
})

router.post('/keyboard-files/:owner/:repo/:branch', async (req, res, next) => {
  const repo = `${req.params.owner}/${req.params.repo}`
  const { branch } = req.params
  const { keymap, layout, boards = ['nice_nano'], updateInfra = false, defines = [] } = req.body
  try {
    const sha = await commitChanges(repo, branch, layout, keymap, { boards, updateInfra, defines })
    res.json({ sha })
  } catch (err) {
    next(err)
  }
})

router.use(handleError)
module.exports = router
