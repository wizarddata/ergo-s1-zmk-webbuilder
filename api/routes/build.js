const { Router } = require('express')

const config = require('../config')
const { commitChanges } = require('../services/github')
const {
  dispatchWorkflow,
  findRunWithRetry,
  waitForRun,
  getArtifacts,
  downloadArtifactZip
} = require('../services/github/builds')

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

router.post('/:owner/:repo/:branch', async (req, res) => {
  const repo = `${req.params.owner}/${req.params.repo}`
  const { branch } = req.params
  const { keymap, layout, boards = ['nice_nano'], updateInfra = true } = req.body
  const send = sse(res)

  try {
    send('status', { phase: 'commit', message: 'Committing keymap to fork' })
    const sha = await commitChanges(repo, branch, layout, keymap, { boards, updateInfra })
    send('commit', { sha })

    send('status', { phase: 'dispatch', message: 'Dispatching GitHub Actions workflow' })
    const { dispatchedAt } = await dispatchWorkflow(repo, branch)

    send('status', { phase: 'locate', message: 'Locating workflow run' })
    const run = await findRunWithRetry(repo, branch, dispatchedAt)
    send('run', { id: run.id, htmlUrl: run.html_url, number: run.run_number })

    const completed = await waitForRun(repo, run.id, update => {
      send('status', { phase: 'build', ...update })
    })

    if (completed.conclusion !== 'success') {
      send('error', { message: `Build ${completed.conclusion}`, htmlUrl: completed.html_url })
      return res.end()
    }

    send('status', { phase: 'artifact', message: 'Fetching firmware artifact' })
    const artifacts = await getArtifacts(repo, run.id)
    const firmware = artifacts.find(a => a.name === 'firmware') || artifacts[0]
    if (!firmware) {
      send('error', { message: 'No artifacts found on completed run' })
      return res.end()
    }

    send('done', {
      runId: run.id,
      artifactId: firmware.id,
      artifactName: firmware.name,
      sizeBytes: firmware.size_in_bytes,
      downloadUrl: `/build/${req.params.owner}/${req.params.repo}/artifact/${firmware.id}`
    })
    res.end()
  } catch (err) {
    console.error('Build error', err.response?.data || err)
    try {
      send('error', { message: err.message || String(err), detail: err.response?.data })
      res.end()
    } catch (_) { /* response already closed */ }
  }
})

router.get('/:owner/:repo/artifact/:artifactId', async (req, res) => {
  const repo = `${req.params.owner}/${req.params.repo}`
  try {
    const buf = await downloadArtifactZip(repo, req.params.artifactId)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="ergo_s1_firmware_${req.params.artifactId}.zip"`)
    res.send(buf)
  } catch (err) {
    console.error('Artifact download error', err.response?.data || err)
    res.status(500).json({ error: err.message || String(err) })
  }
})

module.exports = router
