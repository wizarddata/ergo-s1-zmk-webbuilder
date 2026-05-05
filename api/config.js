const path = require('path')
const os = require('os')
const process = require('process')
require('dotenv/config')

const PORT = process.env.PORT || 8090
const ENABLE_DEV_SERVER = process.env.ENABLE_DEV_SERVER
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`

const ZMK_FORK_GIT_URL = process.env.ZMK_FORK_GIT_URL || 'https://github.com/arcanemachine/zmk-ergo-s-1.git'
// Pinned, code-managed. "Tested" guarantee depends on this being a vetted SHA, so
// it is intentionally NOT overridable from .env — bump in code when re-validated.
// Bump procedure: edit SHA + TESTED_DATE here, run `npm run reset-cache`, retest.
const ZMK_FORK_REVISION = 'f195533d3aeef918f6a81d13e3e4cab17ed9929e'
const ZMK_FORK_REVISION_TESTED_DATE = '2026-05-05'
const ZMK_FORK_LATEST_BRANCH = process.env.ZMK_FORK_LATEST_BRANCH || 'main'
const DOCKER_IMAGE = process.env.DOCKER_IMAGE || 'zmkfirmware/zmk-dev-arm:4.1-branch'

const BUILD_CACHE_VOLUME = process.env.BUILD_CACHE_VOLUME || 'ergo-s1-cache'

function defaultArtifactsDir () {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'ergo-s1-builder', 'artifacts')
  }
  return path.join(os.homedir(), '.cache', 'ergo-s1-builder', 'artifacts')
}
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || defaultArtifactsDir()

const BOARDS = [
  { id: 'nice_nano', label: 'nice_nano (OSE)', shieldLeft: 'ergo_s1_oe_left', shieldRight: 'ergo_s1_oe_right' },
  { id: 'nrf52840dk_nrf52840', label: 'nrf52840dk (prototype)', shieldLeft: 'ergo_s1_left', shieldRight: 'ergo_s1_right' }
]

module.exports = {
  PORT,
  ENABLE_DEV_SERVER,
  APP_BASE_URL,
  ZMK_FORK_GIT_URL,
  ZMK_FORK_REVISION,
  ZMK_FORK_REVISION_TESTED_DATE,
  ZMK_FORK_LATEST_BRANCH,
  DOCKER_IMAGE,
  BUILD_CACHE_VOLUME,
  ARTIFACTS_DIR,
  BOARDS
}
