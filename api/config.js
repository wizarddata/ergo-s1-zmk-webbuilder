const process = require('process')
require('dotenv/config')

const PORT = process.env.PORT || 8080
const ENABLE_DEV_SERVER = process.env.ENABLE_DEV_SERVER
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`

const GITHUB_PAT = process.env.GITHUB_PAT
const UPSTREAM_REPO = process.env.UPSTREAM_REPO || 'arcanemachine/ergo-s-1-zmk-config'
const UPSTREAM_BRANCH = process.env.UPSTREAM_BRANCH || 'master'
const ZMK_FORK_REPO = process.env.ZMK_FORK_REPO || 'arcanemachine/zmk-ergo-s-1'
const ZMK_FORK_REVISION = process.env.ZMK_FORK_REVISION || 'main'
const FORK_BRANCH = process.env.FORK_BRANCH || 'master'

const BOARDS = [
  { id: 'nice_nano', label: 'nice_nano (OSE)', shieldLeft: 'ergo_s1_oe_left', shieldRight: 'ergo_s1_oe_right' },
  { id: 'nrf52840dk_nrf52840', label: 'nrf52840dk (prototype)', shieldLeft: 'ergo_s1_left', shieldRight: 'ergo_s1_right' }
]

module.exports = {
  PORT,
  ENABLE_DEV_SERVER,
  APP_BASE_URL,
  GITHUB_PAT,
  UPSTREAM_REPO,
  UPSTREAM_BRANCH,
  ZMK_FORK_REPO,
  ZMK_FORK_REVISION,
  FORK_BRANCH,
  BOARDS
}
