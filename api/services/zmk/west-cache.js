const { spawn } = require('child_process')

const config = require('../../config')

const VOLUME = config.BUILD_CACHE_VOLUME

function spawnLogged (cmd, args, opts, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, shell: false })
    let buf = ''
    const flush = (chunk) => {
      buf += chunk
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '')
        buf = buf.slice(idx + 1)
        if (line) onLine?.(line)
      }
    }
    child.stdout.on('data', d => flush(d.toString()))
    child.stderr.on('data', d => flush(d.toString()))
    child.on('error', reject)
    child.on('close', code => {
      if (buf) onLine?.(buf)
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

function dockerRunArgs (cmd, extraVolumes = []) {
  const volArgs = []
  volArgs.push('-v', `${VOLUME}:/workspace`)
  for (const v of extraVolumes) volArgs.push('-v', v)
  return [
    'run', '--rm',
    ...volArgs,
    '-w', '/workspace',
    config.DOCKER_IMAGE,
    'sh', '-c', cmd
  ]
}

async function ensureVolume (onLog) {
  await spawnLogged('docker', ['volume', 'create', VOLUME], {}, () => {})
  onLog?.(`Volume ${VOLUME} ready`)
}

async function inspectCacheState () {
  const out = []
  try {
    await spawnLogged('docker', dockerRunArgs(
      'test -d /workspace/zmk && echo HAS_ZMK; test -d /workspace/zmk/.west && echo HAS_WEST; test -d /workspace/zmk/zephyr && echo HAS_ZEPHYR; true'
    ), {}, line => out.push(line))
  } catch (e) {
    return { hasZmk: false, hasWest: false, hasZephyr: false }
  }
  return {
    hasZmk: out.includes('HAS_ZMK'),
    hasWest: out.includes('HAS_WEST'),
    hasZephyr: out.includes('HAS_ZEPHYR')
  }
}

async function cloneZmk (onLog) {
  onLog?.(`Fetching ${config.ZMK_FORK_GIT_URL}@${config.ZMK_FORK_REVISION} into volume`)
  // init+fetch handles both branch names and explicit commit SHAs (we pin a SHA by default).
  const cmd = [
    'mkdir -p /workspace/zmk',
    'cd /workspace/zmk',
    'git init -q',
    `git remote add origin ${config.ZMK_FORK_GIT_URL}`,
    `git fetch --depth 1 origin ${config.ZMK_FORK_REVISION}`,
    'git checkout -q FETCH_HEAD'
  ].join(' && ')
  await spawnLogged('docker', dockerRunArgs(cmd), {}, onLog)
}

async function westInitUpdate (onLog) {
  onLog?.('Running west init + west update (one-time, ~5–10 min)')
  await spawnLogged('docker', dockerRunArgs(
    'cd /workspace/zmk && (test -d .west || west init -l app) && west update --narrow -o=--depth=1 && west zephyr-export'
  ), {}, onLog)
}

async function ensureCache (events) {
  const onLog = msg => events?.log?.(msg)
  await ensureVolume(onLog)
  const state = await inspectCacheState()

  if (!state.hasZmk) {
    events?.phase?.('cache:clone')
    await cloneZmk(onLog)
  }
  if (!state.hasWest || !state.hasZephyr) {
    events?.phase?.('cache:update')
    await westInitUpdate(onLog)
  }
  events?.phase?.('cache:ready')
}

async function ensureImage (events) {
  const onLog = msg => events?.log?.(msg)
  try {
    await spawnLogged('docker', ['image', 'inspect', config.DOCKER_IMAGE], {}, () => {})
    return
  } catch (_) { /* not present */ }
  events?.phase?.('image:pull')
  onLog?.(`Pulling ${config.DOCKER_IMAGE}`)
  await spawnLogged('docker', ['pull', config.DOCKER_IMAGE], {}, onLog)
}

async function preflight () {
  await spawnLogged('docker', ['version', '--format', '{{.Server.Version}}'], {}, () => {})
}

async function resetCache () {
  await spawnLogged('docker', ['volume', 'rm', '-f', VOLUME], {}, () => {})
}

module.exports = {
  VOLUME,
  ensureCache,
  ensureImage,
  preflight,
  resetCache,
  spawnLogged,
  dockerRunArgs
}
