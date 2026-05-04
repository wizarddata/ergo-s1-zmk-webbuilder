function env (key) {
  return process.env[key] || process.env[`REACT_APP_${key}`]
}

// When unset, use relative URLs (same-origin as the served React app).
export const apiBaseUrl = env('API_BASE_URL') || ''
export const appBaseUrl = env('APP_BASE_URL') || ''
