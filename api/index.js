const path = require('path')
const fs = require('fs')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const morgan = require('morgan')

const config = require('./config')
const applicationInit = require('./routes/application')
const keyboards = require('./routes/keyboards')

const app = express()

const { origin } = new URL(config.APP_BASE_URL)

app.use(bodyParser.json({ limit: '5mb' }))
app.use(cors({ origin }))

if (config.ENABLE_DEV_SERVER) {
  applicationInit(app)
}

app.use(morgan('dev'))
app.get('/health', (req, res) => res.sendStatus(200))

app.use(keyboards)
app.use(require('./routes/keymap'))
app.get('/server-config', (req, res) => res.json({ boards: config.BOARDS }))
app.use('/build', require('./routes/build'))

const buildDir = path.join(__dirname, '..', 'app', 'build')
if (!config.ENABLE_DEV_SERVER && fs.existsSync(buildDir)) {
  app.use(express.static(buildDir))
  app.get('*', (req, res) => res.sendFile(path.join(buildDir, 'index.html')))
}

module.exports = app
