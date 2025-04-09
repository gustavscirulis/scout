import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import signals from './lib/telemetry'

// Enable dark mode by default
document.documentElement.classList.add('dark')

// Track app initialization
signals.appStarted()

// Track timezone
signals.timezoneDetected(Intl.DateTimeFormat().resolvedOptions().timeZone)

// Add app close tracking
window.addEventListener('beforeunload', () => {
  // No longer tracking app close
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
