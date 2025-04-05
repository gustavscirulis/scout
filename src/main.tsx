import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import signals from './lib/telemetry'

// Enable dark mode by default
document.documentElement.classList.add('dark')

// Track app initialization
signals.appStarted()

// Add app close tracking
window.addEventListener('beforeunload', () => {
  signals.appClosed()
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
