import { useEffect, useState, useRef } from 'react'
import PropTypes from 'prop-types'

import { buildLocal, buildState, attachBuildStream, loadZmkRevisions } from './api'
import * as config from './config'
import Spinner from './Common/Spinner'

function describeRev (r) {
  if (!r) return ''
  if (r.shortSha) return `${r.label} [${r.shortSha}]`
  return r.label
}

function BuildPanel ({ board, shields, layout, keymap, defines, disabled }) {
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState([])
  const [downloads, setDownloads] = useState([])
  const [error, setError] = useState(null)
  const [revisions, setRevisions] = useState([])
  const [revisionId, setRevisionId] = useState('pinned')
  const [revLoadError, setRevLoadError] = useState(null)
  const [activeRev, setActiveRev] = useState(null)
  const abortRef = useRef(null)

  const log = (msg) => setEvents(e => [...e, msg])

  const buildHandlers = (onStreamId) => ({
    attach: d => {
      onStreamId?.(d.id)
      if (d.revision) setActiveRev(d.revision)
    },
    status: d => log(`[${d.phase}] ${d.message || ''}`),
    log: d => log(d.line),
    done: d => {
      if (d.revision) setActiveRev(d.revision)
      log(`✓ build complete (${d.files.length} file${d.files.length === 1 ? '' : 's'})`)
      setDownloads(d.downloadUrls.map((url, i) => ({
        url: `${config.apiBaseUrl}${url}`,
        name: d.files[i]
      })))
      setRunning(false)
    },
    error: d => {
      if (d.existingId) {
        log(`build already running, attaching to ${d.existingId}`)
        const abortFn = attachBuildStream(d.existingId, buildHandlers())
        abortRef.current = abortFn
        setRunning(true)
        return
      }
      setError(d.message || 'Build failed')
      setRunning(false)
    },
    end: () => setRunning(false)
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadZmkRevisions()
        if (cancelled) return
        const list = data.revisions || []
        setRevisions(list)
        const pinned = list.find(r => r.id === 'pinned')
        if (pinned) setRevisionId('pinned')
      } catch (err) {
        if (!cancelled) setRevLoadError(err.message || 'Could not load revisions')
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const state = await buildState()
        if (cancelled || state.idle) return
        setEvents([])
        setDownloads([])
        setError(null)
        if (state.revision) setActiveRev(state.revision)
        if (state.status === 'running') {
          setRunning(true)
          log(`reattached to running build ${state.id} (phase: ${state.phase})`)
          const abortFn = attachBuildStream(state.id, buildHandlers())
          abortRef.current = abortFn
        } else if (state.status === 'done' && state.result) {
          log(`previous build ${state.id} complete`)
          if (state.result.revision) setActiveRev(state.result.revision)
          setDownloads(state.result.downloadUrls.map((url, i) => ({
            url: `${config.apiBaseUrl}${url}`,
            name: state.result.files[i]
          })))
        } else if (state.status === 'error' && state.error) {
          setError(`previous build failed: ${state.error.message}`)
        }
      } catch (err) {
        // server unreachable — ignore
      }
    })()
    return () => {
      cancelled = true
      abortRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = () => {
    setRunning(true)
    setEvents([])
    setDownloads([])
    setError(null)
    setActiveRev(null)
    abortRef.current = buildLocal(
      { board, shields, layout, keymap, defines, zmkRevision: revisionId },
      buildHandlers()
    )
  }

  const detach = () => {
    abortRef.current?.()
    setRunning(false)
    log('detached (build keeps running on server)')
  }

  const selectedRev = revisions.find(r => r.id === revisionId)
  const latestRev = revisions.find(r => r.id === 'latest')

  return (
    <div style={{
      border: '1px solid #444',
      borderRadius: 4,
      padding: 12,
      marginTop: 12,
      fontFamily: 'monospace',
      fontSize: 12
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <label htmlFor="zmk-rev" style={{ fontSize: 12 }}>ZMK fork:</label>
        <select
          id="zmk-rev"
          value={revisionId}
          onChange={e => setRevisionId(e.target.value)}
          disabled={running || revisions.length === 0}
          style={{ fontSize: 12 }}
        >
          {revisions.length === 0 && <option value="pinned">Pinned (default)</option>}
          {revisions.map(r => (
            <option key={r.id} value={r.id} disabled={r.id === 'latest' && !!r.error}>
              {r.label}{r.shortSha ? ` — ${r.shortSha}` : ''}{r.error ? ' (offline)' : ''}
            </option>
          ))}
        </select>
        {selectedRev?.id === 'latest' && (
          <span style={{ fontSize: 11, color: '#fa6' }}>
            ⚠ untested — may fail to compile
          </span>
        )}
        {latestRev?.error && selectedRev?.id !== 'latest' && (
          <span style={{ fontSize: 11, color: '#888' }} title={latestRev.error}>
            (latest unreachable)
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {!running ? (
          <button disabled={disabled || shields.length === 0} onClick={start}>Build Firmware</button>
        ) : (
          <button onClick={detach} title="Stop watching the build (it keeps running on server)">Detach</button>
        )}
        {running && <Spinner />}
        {downloads.map(d => (
          <a key={d.name} href={d.url} download style={{ fontWeight: 'bold' }}>
            ⬇ {d.name}
          </a>
        ))}
      </div>

      {revLoadError && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#888' }}>
          Revision list error: {revLoadError} (using pinned default)
        </div>
      )}

      {activeRev && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#9c9' }}>
          Build using: {describeRev(activeRev)}
        </div>
      )}

      {events.length > 0 && (
        <pre style={{ marginTop: 8, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
          {[...events].reverse().join('\n')}
        </pre>
      )}

      {error && (
        <div style={{ color: '#f55', marginTop: 8 }}>Error: {error}</div>
      )}
    </div>
  )
}

BuildPanel.propTypes = {
  board: PropTypes.string.isRequired,
  shields: PropTypes.arrayOf(PropTypes.string).isRequired,
  layout: PropTypes.array.isRequired,
  keymap: PropTypes.object.isRequired,
  defines: PropTypes.array,
  disabled: PropTypes.bool
}

export default BuildPanel
