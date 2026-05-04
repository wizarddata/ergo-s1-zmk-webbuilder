import { useState } from 'react'
import PropTypes from 'prop-types'

import github from './Pickers/Github/api'
import * as config from './config'
import Spinner from './Common/Spinner'

function BuildPanel ({ branch, layout, keymap, boards, disabled }) {
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState([])
  const [download, setDownload] = useState(null)
  const [error, setError] = useState(null)
  const [runUrl, setRunUrl] = useState(null)
  const [abort, setAbort] = useState(null)

  const log = (msg) => setEvents(e => [...e, msg])

  const start = () => {
    setRunning(true)
    setEvents([])
    setDownload(null)
    setError(null)
    setRunUrl(null)

    const handlers = {
      status: d => log(`[${d.phase}] ${d.message || d.status || ''}${d.conclusion ? ' (' + d.conclusion + ')' : ''}`),
      commit: d => log(`commit ${d.sha.slice(0, 7)}`),
      run: d => { setRunUrl(d.htmlUrl); log(`workflow run #${d.number} → ${d.htmlUrl}`) },
      done: d => {
        log(`✓ artifact ready (${(d.sizeBytes / 1024).toFixed(1)} KB)`)
        setDownload(`${config.apiBaseUrl}${d.downloadUrl}`)
        setRunning(false)
      },
      error: d => {
        setError(d.message || 'Build failed')
        setRunning(false)
      },
      end: () => setRunning(false)
    }

    const abortFn = github.buildStream(branch, { layout, keymap, boards, updateInfra: true }, handlers)
    setAbort(() => abortFn)
  }

  const cancel = () => {
    abort?.()
    setRunning(false)
    log('cancelled')
  }

  return (
    <div style={{
      border: '1px solid #444',
      borderRadius: 4,
      padding: 12,
      marginTop: 12,
      fontFamily: 'monospace',
      fontSize: 12
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {!running ? (
          <button disabled={disabled} onClick={start}>Build Firmware</button>
        ) : (
          <button onClick={cancel}>Cancel</button>
        )}
        {running && <Spinner />}
        {runUrl && <a href={runUrl} target="_blank" rel="noreferrer">view run</a>}
        {download && (
          <a href={download} download style={{ fontWeight: 'bold' }}>
            ⬇ Download firmware.zip
          </a>
        )}
      </div>

      {events.length > 0 && (
        <pre style={{ marginTop: 8, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
          {events.join('\n')}
        </pre>
      )}

      {error && (
        <div style={{ color: '#f55', marginTop: 8 }}>Error: {error}</div>
      )}
    </div>
  )
}

BuildPanel.propTypes = {
  branch: PropTypes.string.isRequired,
  layout: PropTypes.array.isRequired,
  keymap: PropTypes.object.isRequired,
  boards: PropTypes.arrayOf(PropTypes.string).isRequired,
  disabled: PropTypes.bool
}

export default BuildPanel
