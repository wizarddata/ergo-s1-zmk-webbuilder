const linkHeader = require('http-link-header')
const api = require('./api')
const { getToken } = require('./auth')
const config = require('../../config')

async function getAuthenticatedUser () {
  const { data } = await api.request({ url: '/user', token: getToken() })
  return data
}

async function repoExists (fullName) {
  try {
    await api.request({ url: `/repos/${fullName}`, token: getToken() })
    return true
  } catch (err) {
    if (err.response?.status === 404) return false
    throw err
  }
}

async function forkRepo (upstream) {
  const { data } = await api.request({
    url: `/repos/${upstream}/forks`,
    method: 'POST',
    token: getToken(),
    data: { default_branch_only: false }
  })
  return data
}

async function waitForFork (fullName, { timeoutMs = 60000, intervalMs = 2000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await repoExists(fullName)) return true
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error(`Fork ${fullName} did not become available within ${timeoutMs}ms`)
}

async function ensureFork () {
  const user = await getAuthenticatedUser()
  const upstream = config.UPSTREAM_REPO
  const forkFullName = `${user.login}/${upstream.split('/')[1]}`

  if (await repoExists(forkFullName)) {
    return { user, fork: forkFullName, created: false }
  }

  await forkRepo(upstream)
  await waitForFork(forkFullName)
  return { user, fork: forkFullName, created: true }
}

async function fetchRepoBranches (repo) {
  const branches = []
  let url = `/repos/${repo}/branches`
  while (url) {
    const { headers, data } = await api.request({ url, token: getToken() })
    const paging = linkHeader.parse(headers.link || '')
    branches.push(...data)
    url = paging.get('rel', 'next')?.[0]?.uri
  }
  return branches
}

module.exports = {
  getAuthenticatedUser,
  repoExists,
  forkRepo,
  waitForFork,
  ensureFork,
  fetchRepoBranches
}
