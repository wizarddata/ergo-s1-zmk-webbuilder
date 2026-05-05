const fs = require('fs')
const path = require('path')
const { parseKeymap } = require('./keymap')
const { parseKeymapCode } = require('./parse-keymap-code')

const DEFAULTS_DIR = path.join(__dirname, 'data', 'defaults')
const ZMK_CONFIG_PATH = process.env.ZMK_CONFIG_PATH

const EMPTY_KEYMAP = {
  keyboard: 'unknown',
  keymap: 'unknown',
  layout: 'unknown',
  layer_names: ['default'],
  layers: [[]]
}

function loadBehaviors () {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'zmk-behaviors.json')))
}

function loadKeycodes () {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'zmk-keycodes.json')))
}

function configDir () {
  if (ZMK_CONFIG_PATH) return path.join(ZMK_CONFIG_PATH, 'config')
  return DEFAULTS_DIR
}

function loadLayout () {
  const infoPath = path.join(configDir(), 'info.json')
  const info = JSON.parse(fs.readFileSync(infoPath))
  const layouts = info.layouts || {}
  const key = layouts.default ? 'default' : Object.keys(layouts)[0]
  return layouts[key].layout
}

function findKeymapFile (dir) {
  const files = fs.readdirSync(dir)
  return files.find(file => file.endsWith('.keymap'))
}

function loadKeymap () {
  const dir = configDir()
  const jsonPath = path.join(dir, 'keymap.json')
  if (fs.existsSync(jsonPath)) {
    return parseKeymap(JSON.parse(fs.readFileSync(jsonPath)))
  }
  const keymapFile = findKeymapFile(dir)
  if (keymapFile) {
    const text = fs.readFileSync(path.join(dir, keymapFile), 'utf8')
    try {
      return parseKeymap(parseKeymapCode(text))
    } catch (err) {
      console.warn(`Failed to parse ${keymapFile}: ${err.message}`)
    }
  }
  return parseKeymap(EMPTY_KEYMAP)
}

module.exports = {
  loadBehaviors,
  loadKeycodes,
  loadLayout,
  loadKeymap
}
