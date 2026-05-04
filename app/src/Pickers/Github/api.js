import axios from 'axios'
import EventEmitter from 'eventemitter3'

import * as config from '../../config'

class API extends EventEmitter {
  initialized = false
  serverConfig = null
  user = null
  fork = null

  async _request (options) {
    if (typeof options === 'string') options = { url: options }
    if (options.url.startsWith('/')) options.url = `${config.apiBaseUrl}${options.url}`
    options.headers = Object.assign({}, options.headers)
    return axios(options)
  }

  async loadConfig () {
    const { data } = await this._request('/github/config')
    this.serverConfig = data
    return data
  }

  async setup () {
    const { data } = await this._request('/github/setup')
    this.user = data.user
    this.fork = data.fork
    this.created = data.created
    return data
  }

  async init () {
    if (this.initialized) return
    await this.loadConfig()
    await this.setup()
    this.initialized = true
  }

  async fetchRepoBranches () {
    const { data } = await this._request(`/github/branches/${this.fork}`)
    return data
  }

  async fetchLayoutAndKeymap (branch) {
    const url = `/github/keyboard-files/${this.fork}?branch=${encodeURIComponent(branch)}`
    try {
      const { data } = await this._request(url)
      const defaultLayout = data.info.layouts.default || data.info.layouts[Object.keys(data.info.layouts)[0]]
      return {
        layout: defaultLayout.layout,
        keymap: data.keymap
      }
    } catch (err) {
      if (err.response?.status === 400) {
        this.emit('repo-validation-error', err.response.data)
      }
      throw err
    }
  }

  async commitChanges (branch, layout, keymap, opts = {}) {
    return this._request({
      url: `/github/keyboard-files/${this.fork}/${encodeURIComponent(branch)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { layout, keymap, ...opts }
    })
  }

  buildStream (branch, payload, handlers = {}) {
    const url = `${config.apiBaseUrl}/build/${this.fork}/${encodeURIComponent(branch)}`
    const controller = new AbortController()

    ;(async () => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        })
        if (!response.ok) {
          handlers.error?.({ message: `HTTP ${response.status}` })
          return
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let idx
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            const eventLine = chunk.split('\n').find(l => l.startsWith('event: '))
            const dataLine = chunk.split('\n').find(l => l.startsWith('data: '))
            if (!eventLine || !dataLine) continue
            const event = eventLine.slice(7).trim()
            const data = JSON.parse(dataLine.slice(6))
            handlers[event]?.(data)
          }
        }
        handlers.end?.()
      } catch (err) {
        if (err.name === 'AbortError') return
        handlers.error?.({ message: err.message || String(err) })
      }
    })()

    return () => controller.abort()
  }
}

export default new API()
