const { Router } = require('express')
const zmk = require('../services/zmk')

const router = Router()

router.get('/behaviors', (req, res) => res.json(zmk.loadBehaviors()))
router.get('/keycodes', (req, res) => res.json(zmk.loadKeycodes()))
router.get('/layout', (req, res) => res.json(zmk.loadLayout()))
router.get('/keymap', (req, res) => res.json(zmk.loadKeymap()))

module.exports = router
