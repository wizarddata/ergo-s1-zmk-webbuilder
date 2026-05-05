const path = require('path')
const fs = require('fs')
const fsp = require('fs/promises')
const crypto = require('crypto')

const config = require('../../config')
const cache = require('./west-cache')

const SHIELD_DIRS = {
  ergo_s1_oe_left: 'ergo_s1_oe',
  ergo_s1_oe_right: 'ergo_s1_oe',
  ergo_s1_left: 'ergo_s1',
  ergo_s1_right: 'ergo_s1'
}

const SHIELD_KEYMAPS = {
  ergo_s1_oe_left: 'ergo_s1_oe.keymap',
  ergo_s1_oe_right: 'ergo_s1_oe.keymap',
  ergo_s1_left: 'ergo_s1.keymap',
  ergo_s1_right: 'ergo_s1.keymap'
}

function buildId () {
  return crypto.randomBytes(8).toString('hex') + '-' + Date.now()
}

function revSegment (revShort) {
  return revShort && /^[0-9a-f]{4,40}$/i.test(revShort) ? revShort.slice(0, 7) : 'unknown'
}

async function buildOne ({ shield, board, keymapText, ioDir, revShort }, events) {
  const onLog = msg => events?.log?.(msg)
  events?.phase?.(`build:${shield}`)

  const shieldDir = SHIELD_DIRS[shield]
  const keymapName = SHIELD_KEYMAPS[shield]
  if (!shieldDir) throw new Error(`Unknown shield: ${shield}`)

  await fsp.writeFile(path.join(ioDir, 'keymap'), keymapText, 'utf8')

  const buildSubdir = `build/${board}-${shield}-${revSegment(revShort)}`
  const containerCmd = [
    `cp /io/keymap /workspace/zmk/app/boards/shields/${shieldDir}/${keymapName}`,
    'cd /workspace/zmk/app',
    `west build -d ${buildSubdir} -b ${board} -- -DSHIELD=${shield} -DZMK_CONFIG=/workspace/zmk/app/boards/shields/${shieldDir}`,
    `cp /workspace/zmk/app/${buildSubdir}/zephyr/zmk.uf2 /io/${shield}.uf2`
  ].join(' && ')

  onLog(`docker: ${containerCmd}`)
  await cache.spawnLogged('docker', cache.dockerRunArgs(containerCmd, [`${ioDir}:/io`]), {}, onLog)

  const uf2HostPath = path.join(ioDir, `${shield}.uf2`)
  if (!fs.existsSync(uf2HostPath)) {
    throw new Error(`Build finished but ${uf2HostPath} missing`)
  }
  return uf2HostPath
}

async function runBuilds ({ board, shields, keymapText, id, revShort }, events) {
  await fsp.mkdir(config.ARTIFACTS_DIR, { recursive: true })
  if (!id) id = buildId()
  const ioDir = path.join(config.ARTIFACTS_DIR, id)
  await fsp.mkdir(ioDir, { recursive: true })

  for (const shield of shields) {
    const uf2 = await buildOne({ shield, board, keymapText, ioDir, revShort }, events)
    events?.log?.(`Output: ${uf2}`)
  }

  return { id, outDir: ioDir }
}

function artifactPath (id, name) {
  const safeId = path.basename(id)
  const safeName = path.basename(name)
  return path.join(config.ARTIFACTS_DIR, safeId, safeName)
}

async function listArtifact (id) {
  const safeId = path.basename(id)
  const dir = path.join(config.ARTIFACTS_DIR, safeId)
  if (!fs.existsSync(dir)) return null
  const files = (await fsp.readdir(dir)).filter(f => f.endsWith('.uf2'))
  return { dir, files }
}

module.exports = {
  runBuilds,
  artifactPath,
  listArtifact,
  SHIELD_DIRS,
  SHIELD_KEYMAPS
}
