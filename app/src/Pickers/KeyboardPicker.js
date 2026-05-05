import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { loadLayout, loadKeymap, loadServerConfig } from '../api'
import Spinner from '../Common/Spinner'

function KeyboardPicker ({ onSelect, onContext }) {
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [layoutInfo, keymap, serverConfig] = await Promise.all([
          loadLayout(),
          loadKeymap(),
          loadServerConfig()
        ])
        if (cancelled) return
        const layout = layoutInfo.layouts?.default?.layout || layoutInfo.layout || layoutInfo
        const layerNames = keymap.layer_names || keymap.layers.map((_, i) => `Layer ${i}`)
        Object.assign(keymap, { layer_names: layerNames })
        const defines = Array.isArray(keymap.defines) ? keymap.defines : []
        onContext?.({ serverConfig })
        onSelect({ source: 'local', layout, keymap, defines })
        setLoaded(true)
      } catch (err) {
        setError(err.message || String(err))
      }
    })()
    return () => { cancelled = true }
  }, [onSelect, onContext])

  if (error) {
    return <div style={{ color: '#f55' }}>Failed to load default keymap: {error}</div>
  }
  if (!loaded) return <Spinner />
  return null
}

KeyboardPicker.propTypes = {
  onSelect: PropTypes.func.isRequired,
  onContext: PropTypes.func
}

export default KeyboardPicker
