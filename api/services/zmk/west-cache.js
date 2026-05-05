const { spawn } = require('child_process')

const config = require('../../config')

const VOLUME = config.BUILD_CACHE_VOLUME
const STAMP_PATH = '/workspace/.cached-rev'

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
      [
        'test -d /workspace/zmk && echo HAS_ZMK',
        'test -d /workspace/zmk/.west && echo HAS_WEST',
        'test -d /workspace/zmk/zephyr && echo HAS_ZEPHYR',
        `if [ -f ${STAMP_PATH} ]; then echo "STAMP=$(cat ${STAMP_PATH})"; fi`,
        'if [ -d /workspace/zmk/.git ]; then echo "HEAD=$(git -C /workspace/zmk rev-parse HEAD 2>/dev/null || echo unknown)"; fi',
        'true'
      ].join('; ')
    ), {}, line => out.push(line))
  } catch (e) {
    return { hasZmk: false, hasWest: false, hasZephyr: false, stampedRev: null, headRev: null }
  }
  const stampLine = out.find(l => l.startsWith('STAMP='))
  const headLine = out.find(l => l.startsWith('HEAD='))
  return {
    hasZmk: out.includes('HAS_ZMK'),
    hasWest: out.includes('HAS_WEST'),
    hasZephyr: out.includes('HAS_ZEPHYR'),
    stampedRev: stampLine ? stampLine.slice('STAMP='.length).trim() : null,
    headRev: headLine ? headLine.slice('HEAD='.length).trim() : null
  }
}

async function fetchAndCheckout (revision, onLog) {
  onLog?.(`Fetching ${config.ZMK_FORK_GIT_URL}@${revision} into volume`)
  // init+fetch handles both branch names and explicit commit SHAs.
  // -f on checkout in case any local files changed (keymap copies during build).
  const cmd = [
    'mkdir -p /workspace/zmk',
    'cd /workspace/zmk',
    '(test -d .git || git init -q)',
    `(git remote get-url origin >/dev/null 2>&1 || git remote add origin ${config.ZMK_FORK_GIT_URL})`,
    `git fetch --depth 1 origin ${revision}`,
    'git checkout -q -f FETCH_HEAD',
    'git reset --hard FETCH_HEAD'
  ].join(' && ')
  await spawnLogged('docker', dockerRunArgs(cmd), {}, onLog)
}

async function westInitUpdate (onLog) {
  onLog?.('Running west init + west update (one-time / on rev change, ~5–10 min)')
  await spawnLogged('docker', dockerRunArgs(
    'cd /workspace/zmk && (test -d .west || west init -l app) && west update --narrow -o=--depth=1 && west zephyr-export'
  ), {}, onLog)
}

async function writeStamp (revision, onLog) {
  await spawnLogged('docker', dockerRunArgs(
    `printf '%s' "${revision}" > ${STAMP_PATH}`
  ), {}, onLog)
}

async function clearAppBuildDirs (onLog) {
  // Build dirs are under /workspace/zmk/app/build/<board>-<shield>[-<rev7>].
  // After a rev change, CMake state from prior rev can be incompatible. Wipe.
  onLog?.('Clearing prior CMake build dirs (rev changed)')
  await spawnLogged('docker', dockerRunArgs(
    'rm -rf /workspace/zmk/app/build || true'
  ), {}, onLog)
}

/**
 * Ensure the cached ZMK fork checkout matches `revision` and west deps are present.
 * Pass an explicit 40-char SHA (resolved by the caller) for deterministic stamping.
 * Falls back to config.ZMK_FORK_REVISION when omitted.
 */
async function ensureCache (events, revision) {
  const targetRev = (revision || config.ZMK_FORK_REVISION).toLowerCase()
  const onLog = msg => events?.log?.(msg)
  await ensureVolume(onLog)
  const state = await inspectCacheState()

  const stamped = (state.stampedRev || '').toLowerCase()
  const head = (state.headRev || '').toLowerCase()
  const matches = state.hasZmk && (stamped === targetRev || head === targetRev)

  if (!state.hasZmk) {
    events?.phase?.('cache:clone', { revision: targetRev })
    await fetchAndCheckout(targetRev, onLog)
    await writeStamp(targetRev, onLog)
  } else if (!matches) {
    events?.phase?.('cache:switch', { from: stamped || head || 'unknown', to: targetRev })
    onLog?.(`Switching cached ZMK fork from ${stamped || head || 'unknown'} to ${targetRev}`)
    await fetchAndCheckout(targetRev, onLog)
    await clearAppBuildDirs(onLog)
    await writeStamp(targetRev, onLog)
  } else {
    onLog?.(`ZMK fork cache already at ${targetRev}`)
  }

  if (!state.hasWest || !state.hasZephyr || !matches) {
    events?.phase?.('cache:update', { revision: targetRev })
    await westInitUpdate(onLog)
  }
  events?.phase?.('cache:ready', { revision: targetRev })
  return { revision: targetRev }
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
