const { spawn } = require('child_process')

const config = require('../../config')

const SHA_RE = /^[0-9a-f]{40}$/i
const SHORT_SHA_RE = /^[0-9a-f]{7,40}$/i

function shortSha (sha) {
  return sha && SHORT_SHA_RE.test(sha) ? sha.slice(0, 7) : null
}

function lsRemote (gitUrl, ref) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['ls-remote', gitUrl, ref], { shell: false })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`git ls-remote exited ${code}: ${stderr.trim()}`))
      const line = stdout.split(/\r?\n/).find(l => l.trim())
      if (!line) return reject(new Error(`ref not found: ${ref}`))
      const sha = line.split(/\s+/)[0]
      if (!SHA_RE.test(sha)) return reject(new Error(`unexpected ls-remote output: ${line}`))
      resolve(sha.toLowerCase())
    })
  })
}

const cache = { sha: null, fetchedAt: 0 }
const CACHE_TTL_MS = 60_000

async function resolveLatestSha () {
  if (cache.sha && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { sha: cache.sha, cached: true, fetchedAt: cache.fetchedAt }
  }
  const sha = await lsRemote(config.ZMK_FORK_GIT_URL, config.ZMK_FORK_LATEST_BRANCH)
  cache.sha = sha
  cache.fetchedAt = Date.now()
  return { sha, cached: false, fetchedAt: cache.fetchedAt }
}

function describeOptions () {
  const pinned = {
    id: 'pinned',
    label: `Pinned (tested ${config.ZMK_FORK_REVISION_TESTED_DATE})`,
    sha: config.ZMK_FORK_REVISION.toLowerCase(),
    shortSha: shortSha(config.ZMK_FORK_REVISION),
    testedDate: config.ZMK_FORK_REVISION_TESTED_DATE,
    isDefault: true
  }
  const latest = {
    id: 'latest',
    label: `Latest ${config.ZMK_FORK_LATEST_BRANCH} (untested)`,
    branch: config.ZMK_FORK_LATEST_BRANCH,
    sha: null,
    shortSha: null,
    isDefault: false
  }
  return { pinned, latest }
}

async function listRevisions () {
  const opts = describeOptions()
  try {
    const { sha, fetchedAt, cached } = await resolveLatestSha()
    opts.latest.sha = sha
    opts.latest.shortSha = shortSha(sha)
    opts.latest.resolvedAt = fetchedAt
    opts.latest.cached = cached
  } catch (err) {
    opts.latest.error = err.message
  }
  return [opts.pinned, opts.latest]
}

async function resolveRequested (idOrSha) {
  const requested = (idOrSha || 'pinned').toString().trim()
  const opts = describeOptions()
  if (!requested || requested === 'pinned') {
    return { id: 'pinned', sha: opts.pinned.sha, shortSha: opts.pinned.shortSha, label: opts.pinned.label }
  }
  if (requested === 'latest') {
    const { sha } = await resolveLatestSha()
    return {
      id: 'latest',
      sha,
      shortSha: shortSha(sha),
      branch: config.ZMK_FORK_LATEST_BRANCH,
      label: `Latest ${config.ZMK_FORK_LATEST_BRANCH} @ ${shortSha(sha)}`
    }
  }
  if (SHA_RE.test(requested)) {
    return { id: 'sha', sha: requested.toLowerCase(), shortSha: shortSha(requested), label: `Custom ${shortSha(requested)}` }
  }
  throw new Error(`Unknown zmkRevision: ${requested}`)
}

module.exports = {
  listRevisions,
  resolveRequested,
  shortSha
}
