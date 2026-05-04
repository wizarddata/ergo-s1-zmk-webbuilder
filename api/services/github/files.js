const api = require('./api')
const { getToken } = require('./auth')
const zmk = require('../zmk')
const config = require('../../config')

const MODE_FILE = '100644'

class MissingRepoFile extends Error {
  constructor (path) {
    super()
    this.name = 'MissingRepoFile'
    this.path = path
    this.errors = [`Missing file ${path}`]
  }
}

async function fetchFile (repo, path, { branch = null, raw = false } = {}) {
  const url = `/repos/${repo}/contents/${path}`
  const params = branch ? { ref: branch } : {}
  const headers = { Accept: raw ? 'application/vnd.github.v3.raw' : 'application/json' }
  try {
    return await api.request({ url, headers, params, token: getToken() })
  } catch (err) {
    if (err.response?.status === 404) throw new MissingRepoFile(path)
    throw err
  }
}

async function fetchKeyboardFiles (repo, branch) {
  const { data: info } = await fetchFile(repo, 'config/info.json', { raw: true, branch })
  const keymap = await fetchKeymap(repo, branch)
  const originalCodeKeymap = await findCodeKeymap(repo, branch)
  return { info, keymap, originalCodeKeymap }
}

async function fetchKeymap (repo, branch) {
  try {
    const { data } = await fetchFile(repo, 'config/keymap.json', { raw: true, branch })
    return data
  } catch (err) {
    if (err instanceof MissingRepoFile) {
      return {
        keyboard: 'unknown',
        keymap: 'unknown',
        layout: 'unknown',
        layer_names: ['default'],
        layers: [[]]
      }
    }
    throw err
  }
}

async function findCodeKeymap (repo, branch) {
  const { data: directory } = await fetchFile(repo, 'config', { branch })
  const file = directory.find(f => f.name.toLowerCase().endsWith('.keymap'))
  if (!file) throw new MissingRepoFile('config/*.keymap')
  return file
}

async function findCodeKeymapTemplate (repo, branch) {
  const { data: directory } = await fetchFile(repo, 'config', { branch })
  const tpl = directory.find(f => f.name.toLowerCase().endsWith('.keymap.template'))
  if (!tpl) return null
  const { data: content } = await fetchFile(repo, tpl.path, { branch, raw: true })
  return content
}

async function getRefSha (repo, branch) {
  const { data } = await api.request({
    url: `/repos/${repo}/commits/${branch}`,
    token: getToken()
  })
  return { sha: data.sha, treeSha: data.commit.tree.sha }
}

async function commitFiles (repo, branch, files, message = 'Update from ErgoS1 ZMK Builder') {
  const { sha, treeSha } = await getRefSha(repo, branch)

  const { data: { sha: newTreeSha } } = await api.request({
    url: `/repos/${repo}/git/trees`,
    method: 'POST',
    token: getToken(),
    data: {
      base_tree: treeSha,
      tree: files.map(f => ({
        path: f.path,
        mode: MODE_FILE,
        type: 'blob',
        content: f.content
      }))
    }
  })

  const { data: { sha: newCommitSha } } = await api.request({
    url: `/repos/${repo}/git/commits`,
    method: 'POST',
    token: getToken(),
    data: { tree: newTreeSha, message, parents: [sha] }
  })

  await api.request({
    url: `/repos/${repo}/git/refs/heads/${branch}`,
    method: 'PATCH',
    token: getToken(),
    data: { sha: newCommitSha }
  })

  return newCommitSha
}

function buildBuildYaml (boardIds) {
  const boards = config.BOARDS.filter(b => boardIds.includes(b.id))
  const include = boards.flatMap(b => [
    `  - board: ${b.id}\n    shield: ${b.shieldLeft}`,
    `  - board: ${b.id}\n    shield: ${b.shieldRight}`
  ]).join('\n')
  return `---\ninclude:\n${include}\n`
}

function buildWestYml () {
  const [owner, name] = config.ZMK_FORK_REPO.split('/')
  return `manifest:
  remotes:
    - name: ${owner}
      url-base: https://github.com/${owner}
  projects:
    - name: ${name}
      remote: ${owner}
      revision: ${config.ZMK_FORK_REVISION}
      import: app/west.yml
  self:
    path: config
`
}

async function commitChanges (repo, branch, layout, keymap, opts = {}) {
  const { boards = ['nice_nano'], updateInfra = false } = opts
  const template = await findCodeKeymapTemplate(repo, branch)
  const generated = zmk.generateKeymap(layout, keymap, template)
  const original = await findCodeKeymap(repo, branch)

  const files = [
    { path: original.path, content: generated.code },
    { path: 'config/keymap.json', content: generated.json }
  ]

  if (updateInfra) {
    files.push({ path: 'config/west.yml', content: buildWestYml() })
    files.push({ path: 'build.yaml', content: buildBuildYaml(boards) })
  }

  return await commitFiles(repo, branch, files, 'Update keymap from ErgoS1 ZMK Builder')
}

module.exports = {
  MissingRepoFile,
  fetchKeyboardFiles,
  findCodeKeymap,
  commitChanges,
  commitFiles,
  buildWestYml,
  buildBuildYaml,
  fetchFile
}
