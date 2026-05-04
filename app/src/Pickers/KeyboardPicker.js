import { useMemo } from 'react'
import PropTypes from 'prop-types'

import GithubPicker from './Github/Picker'

function KeyboardPicker ({ onSelect, onContext }) {
  const handleKeyboardSelected = useMemo(() => function (event) {
    const { layout, keymap, ...rest } = event
    const layerNames = keymap.layer_names || keymap.layers.map((_, i) => `Layer ${i}`)
    Object.assign(keymap, { layer_names: layerNames })
    onSelect({ source: 'github', layout, keymap, ...rest })
  }, [onSelect])

  return (
    <div>
      <GithubPicker onSelect={handleKeyboardSelected} onContext={onContext} />
    </div>
  )
}

KeyboardPicker.propTypes = {
  onSelect: PropTypes.func.isRequired,
  onContext: PropTypes.func
}

export default KeyboardPicker
