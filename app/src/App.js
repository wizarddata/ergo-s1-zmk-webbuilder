import '@fortawesome/fontawesome-free/css/all.css'
import keyBy from 'lodash/keyBy'
import { useCallback, useMemo, useState } from 'react'

import './App.css'
import { DefinitionsContext } from './providers'
import { loadKeycodes } from './keycodes'
import { loadBehaviours } from './api'
import KeyboardPicker from './Pickers/KeyboardPicker'
import Spinner from './Common/Spinner'
import Keyboard from './Keyboard/Keyboard'
import GitHubLink from './GitHubLink'
import Loader from './Common/Loader'
import BuildPanel from './BuildPanel'
import DefinesPanel from './DefinesPanel'
import { getKeyBoundingBox } from './key-units'
import github from './Pickers/Github/api'

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

function App () {
  const [definitions, setDefinitions] = useState(null)
  const [layout, setLayout] = useState(null)
  const [keymap, setKeymap] = useState(null)
  const [editingKeymap, setEditingKeymap] = useState(null)
  const [defines, setDefines] = useState([])
  const [saving, setSaving] = useState(false)
  const [context, setContext] = useState(null)
  const [boards, setBoards] = useState(['nice_nano'])
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
      const code = await github.generateKeymapCode(layout, editingKeymap || keymap, defines)
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
      const imported = await github.importKeymapText(text)
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

  const handleCommit = useMemo(() => async function () {
    if (!context?.branch) return
    setSaving(true)
    try {
      await github.commitChanges(context.branch, layout, editingKeymap || keymap, { boards, updateInfra: true, defines })
      if (editingKeymap) {
        setKeymap(editingKeymap)
        setEditingKeymap(null)
      }
    } finally {
      setSaving(false)
    }
  }, [context, layout, editingKeymap, keymap, boards, defines])

  const initialize = useMemo(() => async function () {
    const [keycodes, behaviours] = await Promise.all([loadKeycodes(), loadBehaviours()])
    keycodes.indexed = keyBy(keycodes, 'code')
    behaviours.indexed = keyBy(behaviours, 'code')
    setDefinitions({ keycodes, behaviours })
  }, [])

  const availableBoards = context?.serverConfig?.boards || []

  const toggleBoard = (id) => {
    setBoards(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id])
  }

  return (
    <>
      <Loader load={initialize}>
        <KeyboardPicker onSelect={handleKeyboardSelected} onContext={handleContext} />

        {availableBoards.length > 0 && (
          <fieldset style={{ margin: '8px 0', padding: 8 }}>
            <legend style={{ fontSize: 12 }}>Build targets</legend>
            {availableBoards.map(b => (
              <label key={b.id} style={{ display: 'inline-block', marginRight: 12, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={boards.includes(b.id)}
                  onChange={() => toggleBoard(b.id)}
                />
                {' '}{b.label}
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
            style={{ marginRight: 8 }}
          >
            Download .keymap
          </button>
          <button
            title="Commit keymap changes to GitHub fork"
            disabled={(!editingKeymap && defines.length === 0) || !context?.branch}
            onClick={handleCommit}
          >
            {saving ? 'Saving' : 'Commit Changes'}
            {saving && <Spinner />}
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

        {context?.branch && layout && (editingKeymap || keymap) && boards.length > 0 && (
          <BuildPanel
            branch={context.branch}
            layout={layout}
            keymap={editingKeymap || keymap}
            boards={boards}
            defines={defines}
            disabled={saving}
          />
        )}
      </Loader>
      <GitHubLink className="github-link" />
    </>
  )
}

export default App
