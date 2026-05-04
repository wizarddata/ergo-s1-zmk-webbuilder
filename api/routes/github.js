const { Router } = require('express')

const config = require('../config')
const {
  ensureFork,
  fetchRepoBranches,
  fetchKeyboardFiles,
  commitChanges,
  MissingRepoFile
} = require('../services/github')
const { parseKeymap, validateKeymapJson, KeymapValidationError } = require('../services/zmk/keymap')
const { validateInfoJson, InfoValidationError } = require('../services/zmk/layout')

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
    const { info, keymap } = await fetchKeyboardFiles(repo, branch)
    validateInfoJson(info)
    validateKeymapJson(keymap)
    res.json({ info, keymap: parseKeymap(keymap) })
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

router.post('/keyboard-files/:owner/:repo/:branch', async (req, res, next) => {
  const repo = `${req.params.owner}/${req.params.repo}`
  const { branch } = req.params
  const { keymap, layout, boards = ['nice_nano'], updateInfra = false } = req.body
  try {
    const sha = await commitChanges(repo, branch, layout, keymap, { boards, updateInfra })
    res.json({ sha })
  } catch (err) {
    next(err)
  }
})

router.use(handleError)
module.exports = router
