import * as config from './config'

export function healthcheck () {
  return fetch(`${config.apiBaseUrl}/health`)
}

export function loadBehaviours () {
  return fetch(`${config.apiBaseUrl}/behaviors`).then(r => r.json())
}

export function loadKeycodes () {
  return fetch(`${config.apiBaseUrl}/keycodes`).then(r => r.json())
}

export function loadKeymap () {
  return fetch(`${config.apiBaseUrl}/keymap`).then(r => r.json())
}

export function loadLayout () {
  return fetch(`${config.apiBaseUrl}/layout`).then(r => r.json())
}

export function loadServerConfig () {
  return fetch(`${config.apiBaseUrl}/server-config`).then(r => r.json())
}

export async function importKeymapText (text) {
  const res = await fetch(`${config.apiBaseUrl}/import-keymap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.response = { status: res.status, data }
    throw err
  }
  const data = await res.json()
  return data.keymap
}

export async function generateKeymapCode (layout, keymap, defines = []) {
  const res = await fetch(`${config.apiBaseUrl}/generate-keymap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout, keymap, defines })
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.error || `HTTP ${res.status}`)
    err.response = { status: res.status, data }
    throw err
  }
  return await res.text()
}

export async function preflight () {
  const res = await fetch(`${config.apiBaseUrl}/build/preflight`)
  return res.json()
}

export async function buildState () {
  const res = await fetch(`${config.apiBaseUrl}/build/state`)
  return res.json()
}

async function consumeSse (response, handlers) {
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
}

export function buildLocal (payload, handlers = {}) {
  const controller = new AbortController()
  ;(async () => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/build/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
      await consumeSse(response, handlers)
    } catch (err) {
      if (err.name === 'AbortError') return
      handlers.error?.({ message: err.message || String(err) })
    }
  })()
  return () => controller.abort()
}

export function attachBuildStream (id, handlers = {}) {
  const controller = new AbortController()
  ;(async () => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/build/local/stream/${encodeURIComponent(id)}`, {
        signal: controller.signal
      })
      await consumeSse(response, handlers)
    } catch (err) {
      if (err.name === 'AbortError') return
      handlers.error?.({ message: err.message || String(err) })
    }
  })()
  return () => controller.abort()
}
