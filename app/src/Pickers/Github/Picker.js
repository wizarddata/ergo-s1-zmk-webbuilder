import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import github from './api'
import ValidationErrors from './ValidationErrors'
import Selector from '../../Common/Selector'
import Spinner from '../../Common/Spinner'

function GithubPicker ({ onSelect, onContext }) {
  const [state, setState] = useState({
    initialized: false,
    initError: null,
    branches: [],
    branch: null,
    loading: false,
    loadError: null
  })

  const { initialized, initError, branches, branch, loading, loadError } = state

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await github.init()
        const branches = await github.fetchRepoBranches()
        const defaultBranch = github.serverConfig.forkBranch
        const chosen = branches.find(b => b.name === defaultBranch) || branches[0]
        if (cancelled) return
        setState(s => ({
          ...s,
          initialized: true,
          branches,
          branch: chosen?.name || defaultBranch
        }))
        onContext?.({
          fork: github.fork,
          user: github.user,
          serverConfig: github.serverConfig,
          branch: chosen?.name || defaultBranch
        })
      } catch (err) {
        const msg = err.response?.data?.error || err.message || String(err)
        setState(s => ({ ...s, initError: msg }))
      }
    })()
    return () => { cancelled = true }
  }, [onContext])

  useEffect(() => {
    if (!initialized || !branch) return
    setState(s => ({ ...s, loading: true, loadError: null }))
    ;(async () => {
      try {
        const { layout, keymap } = await github.fetchLayoutAndKeymap(branch)
        setState(s => ({ ...s, loading: false }))
        onSelect({ source: 'github', github: { repository: github.fork, branch }, layout, keymap })
        onContext?.({ branch, fork: github.fork, user: github.user, serverConfig: github.serverConfig })
      } catch (err) {
        const msg = err.response?.data?.error || err.message || String(err)
        setState(s => ({ ...s, loading: false, loadError: { name: 'LoadError', errors: [msg] } }))
      }
    })()
  }, [initialized, branch, onSelect, onContext])

  if (initError) {
    return <ValidationErrors title="Setup error" errors={[initError]} onDismiss={() => window.location.reload()} />
  }
  if (!initialized) return <Spinner />

  return (
    <>
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Fork: <code>{github.fork}</code>
      </div>
      <Selector
        id="branch"
        label="Branch"
        value={branch}
        choices={branches.map(b => ({ id: b.name, name: b.name }))}
        onUpdate={name => setState(s => ({ ...s, branch: name }))}
      />
      {loading && <Spinner />}
      {loadError && (
        <ValidationErrors
          title={loadError.name}
          errors={loadError.errors}
          onDismiss={() => setState(s => ({ ...s, loadError: null }))}
        />
      )}
    </>
  )
}

GithubPicker.propTypes = {
  onSelect: PropTypes.func.isRequired,
  onContext: PropTypes.func
}

export default GithubPicker
