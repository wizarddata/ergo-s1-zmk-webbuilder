const { EventEmitter } = require('events')

const MAX_LOGS = 5000

class BuildRegistry extends EventEmitter {
  constructor () {
    super()
    this.current = null
  }

  start (id, params) {
    this.current = {
      id,
      params: {
        board: params?.board,
        shields: params?.shields,
        revision: params?.revision || null
      },
      startedAt: Date.now(),
      finishedAt: null,
      status: 'running',
      phase: 'prepare',
      logs: [],
      result: null,
      error: null
    }
    return this.current
  }

  push (event, data) {
    if (!this.current) return
    if (event === 'status' && data?.phase) this.current.phase = data.phase
    this.current.logs.push({ event, data })
    if (this.current.logs.length > MAX_LOGS) this.current.logs.shift()
    if (event === 'done') {
      this.current.status = 'done'
      this.current.result = data
      this.current.finishedAt = Date.now()
    } else if (event === 'error') {
      this.current.status = 'error'
      this.current.error = data
      this.current.finishedAt = Date.now()
    }
    this.emit('event', { event, data })
    if (event === 'done' || event === 'error') this.emit('end')
  }

  isRunning () {
    return this.current?.status === 'running'
  }

  state () {
    if (!this.current) return { idle: true }
    const c = this.current
    return {
      idle: false,
      id: c.id,
      status: c.status,
      phase: c.phase,
      startedAt: c.startedAt,
      finishedAt: c.finishedAt,
      board: c.params.board,
      shields: c.params.shields,
      revision: c.params.revision,
      result: c.result,
      error: c.error
    }
  }
}

module.exports = new BuildRegistry()
