const { Router } = require('express')

const { parseKeymap, validateKeymapJson, KeymapValidationError, generateKeymap } = require('../services/zmk/keymap')
const { parseKeymapCode, KeymapCodeParseError } = require('../services/zmk/parse-keymap-code')

const router = Router()

router.post('/import-keymap', (req, res) => {
  const { text } = req.body || {}
  try {
    const json = parseKeymapCode(text)
    validateKeymapJson(json)
    res.json({ keymap: parseKeymap(json) })
  } catch (err) {
    if (err instanceof KeymapCodeParseError || err instanceof KeymapValidationError) {
      return res.status(400).json({ name: err.name, errors: err.errors })
    }
    console.error('import-keymap error', err)
    res.status(500).json({ error: err.message || String(err) })
  }
})

router.post('/generate-keymap', (req, res) => {
  try {
    const { layout, keymap, defines = [] } = req.body || {}
    if (!layout || !keymap) {
      return res.status(400).json({ error: 'layout and keymap required' })
    }
    const keymapWithDefines = Object.assign({}, keymap, { defines })
    const generated = generateKeymap(layout, keymapWithDefines)
    res.type('text/plain').send(generated.code)
  } catch (err) {
    console.error('generate-keymap error', err)
    res.status(500).json({ error: err.message || String(err) })
  }
})

module.exports = router
