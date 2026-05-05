const path = require('path')
const os = require('os')
const process = require('process')
require('dotenv/config')

const PORT = process.env.PORT || 8090
const ENABLE_DEV_SERVER = process.env.ENABLE_DEV_SERVER
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`

const ZMK_FORK_GIT_URL = process.env.ZMK_FORK_GIT_URL || 'https://github.com/arcanemachine/zmk-ergo-s-1.git'
const ZMK_FORK_REVISION = process.env.ZMK_FORK_REVISION || 'main'
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
  DOCKER_IMAGE,
  BUILD_CACHE_VOLUME,
  ARTIFACTS_DIR,
  BOARDS
}
