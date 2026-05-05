import '@fortawesome/fontawesome-free/css/all.css'
import keyBy from 'lodash/keyBy'
import { useCallback, useMemo, useState } from 'react'

import './App.css'
import { DefinitionsContext } from './providers'
import { loadKeycodes } from './keycodes'
import { loadBehaviours, importKeymapText, generateKeymapCode } from './api'
import KeyboardPicker from './Pickers/KeyboardPicker'
import Keyboard from './Keyboard/Keyboard'
import Loader from './Common/Loader'
import BuildPanel from './BuildPanel'
import DefinesPanel from './DefinesPanel'
import { getKeyBoundingBox } from './key-units'

function computeBbox (layout) {
  if (!layout) return null
  return layout.map(k => getKeyBoundingBox(
    { x: k.x, y: k.y },
    { u: k.u || k.w || 1, h: k.h || 1 },
    { x: k.rx, y: k.ry, a: k.r }
  )).reduce(({ x, y }, { max }) => ({
    x: Math.max(x, max.x),
    y: Math.max(y, max.y)
  }), { x: 0, y: 0 })
}

function shieldsFor (board, sides) {
  const map = {
    nice_nano: { left: 'ergo_s1_oe_left', right: 'ergo_s1_oe_right' },
    nrf52840dk_nrf52840: { left: 'ergo_s1_left', right: 'ergo_s1_right' }
  }
  const lookup = map[board] || map.nice_nano
  return sides.map(s => lookup[s]).filter(Boolean)
}

function App () {
  const [definitions, setDefinitions] = useState(null)
  const [layout, setLayout] = useState(null)
  const [keymap, setKeymap] = useState(null)
  const [editingKeymap, setEditingKeymap] = useState(null)
  const [defines, setDefines] = useState([])
  const [context, setContext] = useState(null)
  const [board, setBoard] = useState('nice_nano')
  const [sides, setSides] = useState(['left', 'right'])
  const [importError, setImportError] = useState(null)

  const handleContext = useCallback((ctx) => {
    setContext(prev => ({ ...prev, ...ctx }))
  }, [])

  const handleKeyboardSelected = useCallback((event) => {
    const { layout, keymap, defines } = event
    setLayout(layout)
    setKeymap(keymap)
    setEditingKeymap(null)
    setDefines(defines || [])
  }, [])

  const handleUpdateKeymap = useCallback((next) => setEditingKeymap(next), [])
  const handleDefinesChange = useCallback((next) => setDefines(next), [])

  const handleDownload = useCallback(async () => {
    if (!layout || !(editingKeymap || keymap)) return
    try {
      const code = await generateKeymapCode(layout, editingKeymap || keymap, defines)
      const blob = new Blob([code], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ergo_s1_oe.keymap'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setImportError('Generate failed: ' + (err.response?.data?.error || err.message))
    }
  }, [layout, editingKeymap, keymap, defines])

  const handleImport = useCallback(async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportError(null)
    try {
      const text = await file.text()
      const imported = await importKeymapText(text)
      const layerNames = imported.layer_names || imported.layers.map((_, i) => `Layer ${i}`)
      Object.assign(imported, { layer_names: layerNames })
      setKeymap(imported)
      setEditingKeymap(imported)
      if (Array.isArray(imported.defines)) setDefines(imported.defines)
    } catch (err) {
      const errs = err.response?.data?.errors
      setImportError(errs ? errs.join('; ') : (err.message || 'Import failed'))
    }
  }, [])

  const initialize = useMemo(() => async function () {
    const [keycodes, behaviours] = await Promise.all([loadKeycodes(), loadBehaviours()])
    keycodes.indexed = keyBy(keycodes, 'code')
    behaviours.indexed = keyBy(behaviours, 'code')
    setDefinitions({ keycodes, behaviours })
  }, [])

  const availableBoards = context?.serverConfig?.boards || []

  const toggleSide = (s) => {
    setSides(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const shields = shieldsFor(board, sides)

  return (
    <>
      <Loader load={initialize}>
        <KeyboardPicker onSelect={handleKeyboardSelected} onContext={handleContext} />

        {availableBoards.length > 0 && (
          <fieldset style={{ margin: '8px 0', padding: 8 }}>
            <legend style={{ fontSize: 12 }}>Build target</legend>
            <select
              value={board}
              onChange={e => setBoard(e.target.value)}
              style={{ marginRight: 12 }}
            >
              {availableBoards.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
            {['left', 'right'].map(s => (
              <label key={s} style={{ display: 'inline-block', marginRight: 12, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={sides.includes(s)}
                  onChange={() => toggleSide(s)}
                />
                {' '}{s}
              </label>
            ))}
          </fieldset>
        )}

        <div id="actions">
          <label
            title="Upload an existing .keymap file to overwrite the editor state"
            style={{ cursor: 'pointer', marginRight: 8, padding: '5px 10px', background: '#2a2a2a', border: '1px solid #444', borderRadius: 4, fontSize: 14 }}
          >
            Upload .keymap
            <input type="file" accept=".keymap,text/plain" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button
            title="Download generated .keymap file"
            disabled={!layout || !(editingKeymap || keymap)}
            onClick={handleDownload}
          >
            Download .keymap
          </button>
        </div>
        {importError && (
          <div style={{ color: '#f55', margin: '8px 0', fontSize: 13 }}>
            Import error: {importError}
          </div>
        )}

        <DefinitionsContext.Provider value={definitions}>
          {layout && keymap && (() => {
            const bbox = computeBbox(layout)
            const wrapperWidth = bbox ? bbox.x + 80 : undefined
            return (
              <div style={{
                width: wrapperWidth ? `${wrapperWidth}px` : undefined,
                margin: '0 auto'
              }}>
                <Keyboard
                  layout={layout}
                  keymap={editingKeymap || keymap}
                  onUpdate={handleUpdateKeymap}
                />
              </div>
            )
          })()}
        </DefinitionsContext.Provider>

        {layout && keymap && (
          <DefinesPanel defines={defines} onChange={handleDefinesChange} />
        )}

        {layout && (editingKeymap || keymap) && shields.length > 0 && (
          <BuildPanel
            board={board}
            shields={shields}
            layout={layout}
            keymap={editingKeymap || keymap}
            defines={defines}
          />
        )}
      </Loader>
    </>
  )
}

export default App
