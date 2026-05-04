const config = require('../../config')

function getToken () {
  if (!config.GITHUB_PAT) {
    throw new Error('GITHUB_PAT is not set in environment. Create one with `repo` and `workflow` scopes.')
  }
  return config.GITHUB_PAT
}

module.exports = {
  getToken
}
