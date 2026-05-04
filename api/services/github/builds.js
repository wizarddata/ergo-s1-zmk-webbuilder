const axios = require('axios')
const api = require('./api')
const { getToken } = require('./auth')

const WORKFLOW_FILE = 'build.yml'
const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 15 * 60 * 1000

async function dispatchWorkflow (repo, branch) {
  const dispatchedAt = new Date().toISOString()
  await api.request({
    url: `/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    method: 'POST',
    token: getToken(),
    data: { ref: branch }
  })
  return { dispatchedAt }
}

async function findLatestRun (repo, branch, dispatchedAt) {
  const sinceMs = new Date(dispatchedAt).getTime() - 5000
  const { data } = await api.request({
    url: `/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs`,
    token: getToken(),
    params: { branch, event: 'workflow_dispatch', per_page: 10 }
  })
  const candidates = (data.workflow_runs || []).filter(r => new Date(r.created_at).getTime() >= sinceMs)
  candidates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return candidates[0] || null
}

async function getRun (repo, runId) {
  const { data } = await api.request({
    url: `/repos/${repo}/actions/runs/${runId}`,
    token: getToken()
  })
  return data
}

async function getArtifacts (repo, runId) {
  const { data } = await api.request({
    url: `/repos/${repo}/actions/runs/${runId}/artifacts`,
    token: getToken()
  })
  return data.artifacts || []
}

async function downloadArtifactZip (repo, artifactId) {
  const url = `https://api.github.com/repos/${repo}/actions/artifacts/${artifactId}/zip`
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'arraybuffer',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/vnd.github.v3+json'
    },
    maxRedirects: 5
  })
  return Buffer.from(response.data)
}

async function waitForRun (repo, runId, onUpdate, { interval = POLL_INTERVAL_MS, timeout = POLL_TIMEOUT_MS } = {}) {
  const start = Date.now()
  let lastStatus = null
  while (Date.now() - start < timeout) {
    const run = await getRun(repo, runId)
    if (run.status !== lastStatus || run.conclusion) {
      lastStatus = run.status
      if (onUpdate) onUpdate({ status: run.status, conclusion: run.conclusion, htmlUrl: run.html_url })
    }
    if (run.status === 'completed') return run
    await new Promise(r => setTimeout(r, interval))
  }
  throw new Error(`Workflow run ${runId} did not complete within ${timeout}ms`)
}

async function findRunWithRetry (repo, branch, dispatchedAt, { tries = 12, interval = 2500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const run = await findLatestRun(repo, branch, dispatchedAt)
    if (run) return run
    await new Promise(r => setTimeout(r, interval))
  }
  throw new Error('Could not locate dispatched workflow run')
}

module.exports = {
  dispatchWorkflow,
  findLatestRun,
  findRunWithRetry,
  getRun,
  getArtifacts,
  downloadArtifactZip,
  waitForRun,
  WORKFLOW_FILE
}
