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
import github from './Pickers/Github/api'

function App () {
  const [definitions, setDefinitions] = useState(null)
  const [layout, setLayout] = useState(null)
  const [keymap, setKeymap] = useState(null)
  const [editingKeymap, setEditingKeymap] = useState(null)
  const [saving, setSaving] = useState(false)
  const [context, setContext] = useState(null)
  const [boards, setBoards] = useState(['nice_nano'])

  const handleContext = useCallback((ctx) => {
    setContext(prev => ({ ...prev, ...ctx }))
  }, [])

  const handleKeyboardSelected = useCallback((event) => {
    const { layout, keymap } = event
    setLayout(layout)
    setKeymap(keymap)
    setEditingKeymap(null)
  }, [])

  const handleUpdateKeymap = useCallback((next) => setEditingKeymap(next), [])

  const handleCommit = useMemo(() => async function () {
    if (!context?.branch) return
    setSaving(true)
    try {
      await github.commitChanges(context.branch, layout, editingKeymap, { boards, updateInfra: true })
      setKeymap(editingKeymap)
      setEditingKeymap(null)
    } finally {
      setSaving(false)
    }
  }, [context, layout, editingKeymap, boards])

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
          <button
            title="Commit keymap changes to GitHub fork"
            disabled={!editingKeymap || !context?.branch}
            onClick={handleCommit}
          >
            {saving ? 'Saving' : 'Commit Changes'}
            {saving && <Spinner />}
          </button>
        </div>

        <DefinitionsContext.Provider value={definitions}>
          {layout && keymap && (
            <Keyboard
              layout={layout}
              keymap={editingKeymap || keymap}
              onUpdate={handleUpdateKeymap}
            />
          )}
        </DefinitionsContext.Provider>

        {context?.branch && layout && (editingKeymap || keymap) && boards.length > 0 && (
          <BuildPanel
            branch={context.branch}
            layout={layout}
            keymap={editingKeymap || keymap}
            boards={boards}
            disabled={saving}
          />
        )}
      </Loader>
      <GitHubLink className="github-link" />
    </>
  )
}

export default App
