import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'

const STORAGE_KEY = 'definesPanelPos'
const MIN_HEIGHT = 120
const DEFAULT_HEIGHT_RATIO = 0.42

const toggleStyle = {
  background: '#2a2a2a',
  color: '#ddd',
  border: '1px solid #555',
  borderRadius: 6,
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'monospace',
  boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
}

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '6px 8px',
  borderBottom: '1px solid #444',
  background: '#1a1a1a',
  cursor: 'move',
  userSelect: 'none'
}

const listStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: 6
}

const resizeHandleStyle = {
  height: 8,
  cursor: 'ns-resize',
  background: 'linear-gradient(to bottom, transparent, #444)',
  borderTop: '1px solid #444',
  flex: '0 0 auto'
}

function defaultPos () {
  return {
    top: 80,
    left: window.innerWidth - 380,
    height: Math.max(MIN_HEIGHT, Math.round(window.innerHeight * DEFAULT_HEIGHT_RATIO))
  }
}

function loadPos () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultPos()
    const p = JSON.parse(raw)
    const d = defaultPos()
    return {
      top: typeof p.top === 'number' ? p.top : d.top,
      left: typeof p.left === 'number' ? p.left : d.left,
      height: typeof p.height === 'number' ? p.height : d.height
    }
  } catch (e) {
    return defaultPos()
  }
}

function DefinesPanel ({ defines, onChange }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(loadPos)
  const dragRef = useRef(null)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)) } catch (e) {}
  }, [pos])

  useEffect(() => {
    function onMove (e) {
      const d = dragRef.current
      if (!d) return
      if (d.mode === 'pending') {
        const dx = e.clientX - d.startX
        const dy = e.clientY - d.startY
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          d.mode = 'move'
        } else {
          return
        }
      }
      if (d.mode === 'move') {
        const left = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - d.offsetX))
        const top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - d.offsetY))
        setPos(p => ({ ...p, top, left }))
      } else if (d.mode === 'resize') {
        const maxH = Math.max(MIN_HEIGHT, window.innerHeight - d.startTop - 12)
        const next = Math.max(MIN_HEIGHT, Math.min(maxH, d.startHeight + (e.clientY - d.startY)))
        setPos(p => ({ ...p, height: next }))
      }
    }
    function onUp () {
      const d = dragRef.current
      if (d && d.mode === 'pending') {
        setOpen(o => !o)
      }
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startDrag = useCallback((e) => {
    e.preventDefault()
    dragRef.current = {
      mode: 'pending',
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - pos.left,
      offsetY: e.clientY - pos.top
    }
  }, [pos])

  const startResize = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      mode: 'resize',
      startY: e.clientY,
      startHeight: pos.height,
      startTop: pos.top
    }
  }, [pos])

  const update = useCallback((idx, patch) => {
    onChange(defines.map((d, i) => i === idx ? { ...d, ...patch } : d))
  }, [defines, onChange])

  const add = useCallback(() => {
    onChange([...defines, { name: '', value: '' }])
  }, [defines, onChange])

  const remove = useCallback((idx) => {
    onChange(defines.filter((_, i) => i !== idx))
  }, [defines, onChange])

  const containerStyle = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    zIndex: 50,
    fontFamily: 'monospace',
    fontSize: 12
  }

  const panelStyle = {
    width: 360,
    height: pos.height,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(20, 20, 20, 0.96)',
    border: '1px solid #555',
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    overflow: 'hidden'
  }

  if (!open) {
    return (
      <div style={containerStyle}>
        <div
          onMouseDown={startDrag}
          title="Click to expand, drag to move"
          style={{ ...toggleStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span style={{ opacity: 0.6 }}>⋮⋮</span>
          <span>#define ({defines.length})</span>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={panelStyle}>
        <div style={headerStyle} onMouseDown={startDrag} title="Click to collapse, drag to move">
          <strong style={{ color: '#ccc' }}>
            <span style={{ opacity: 0.6, marginRight: 6 }}>⋮⋮</span>
            #define macros ({defines.length})
          </strong>
          <div style={{ display: 'flex', gap: 6 }} onMouseDown={e => e.stopPropagation()}>
            <button onClick={add} style={{ fontSize: 11, padding: '2px 6px' }}>+ add</button>
          </div>
        </div>
        <div style={listStyle}>
          {defines.length === 0 && (
            <div style={{ opacity: 0.6, fontSize: 11, padding: 4 }}>None. Add or upload a .keymap.</div>
          )}
          {defines.map((d, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
              <input
                value={d.name}
                onChange={e => update(idx, { name: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })}
                placeholder="NAME"
                style={{ width: 90, fontFamily: 'monospace', fontSize: 11, padding: 2 }}
              />
              <input
                value={d.value}
                onChange={e => update(idx, { value: e.target.value })}
                placeholder="VALUE"
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, padding: 2, minWidth: 0 }}
              />
              <button onClick={() => remove(idx)} style={{ fontSize: 11, padding: '2px 6px' }} title="Remove">×</button>
            </div>
          ))}
        </div>
        <div style={resizeHandleStyle} onMouseDown={startResize} title="Drag to resize" />
      </div>
    </div>
  )
}

DefinesPanel.propTypes = {
  defines: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired
  })).isRequired,
  onChange: PropTypes.func.isRequired
}

export default DefinesPanel
