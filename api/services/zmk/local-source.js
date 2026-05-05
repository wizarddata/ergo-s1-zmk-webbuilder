const fs = require('fs')
const path = require('path')
const { parseKeymap } = require('./keymap')
const { parseKeymapCode } = require('./parse-keymap-code')

const ZMK_PATH = process.env.ZMK_CONFIG_PATH || path.join(__dirname, '..', '..', '..', '..', 'zmk-config')

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

function loadLayout () {
  const infoPath = path.join(ZMK_PATH, 'config', 'info.json')
  const info = JSON.parse(fs.readFileSync(infoPath))
  const layouts = info.layouts || {}
  const key = layouts.default ? 'default' : Object.keys(layouts)[0]
  return layouts[key].layout
}

function findKeymapFile () {
  const files = fs.readdirSync(path.join(ZMK_PATH, 'config'))
  return files.find(file => file.endsWith('.keymap'))
}

function loadKeymap () {
  const configDir = path.join(ZMK_PATH, 'config')
  const jsonPath = path.join(configDir, 'keymap.json')
  if (fs.existsSync(jsonPath)) {
    return parseKeymap(JSON.parse(fs.readFileSync(jsonPath)))
  }
  const keymapFile = findKeymapFile()
  if (keymapFile) {
    const text = fs.readFileSync(path.join(configDir, keymapFile), 'utf8')
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
