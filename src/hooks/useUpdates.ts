import { useState, useEffect } from 'react'

export const useUpdates = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [checkingForUpdate, setCheckingForUpdate] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  // Listen for update availability messages from main process
  useEffect(() => {
    try {
      const electron = window.require('electron')
      
      // Listen for update events from main process
      electron.ipcRenderer.on('update-available', () => {
        setUpdateAvailable(true)
      })
      
      electron.ipcRenderer.on('update-downloaded', () => {
        setUpdateDownloaded(true)
      })
      
      return () => {
        electron.ipcRenderer.removeAllListeners('update-available')
        electron.ipcRenderer.removeAllListeners('update-downloaded')
      }
    } catch (error) {
      // Silent fail if electron is not available
    }
  }, [])
  
  // Handle checking for updates
  const checkForUpdates = () => {
    try {
      setCheckingForUpdate(true)
      setUpdateError(null)
      const electron = window.require('electron')
      electron.ipcRenderer.invoke('check-for-updates')
        .finally(() => {
          // Set a timeout to reset checking state, in case no response is received
          setTimeout(() => setCheckingForUpdate(false), 5000)
        })
    } catch (error) {
      // Silent fail if electron is not available
      setCheckingForUpdate(false)
    }
  }
  
  // Handle installing updates
  const installUpdate = () => {
    try {
      const electron = window.require('electron')
      electron.ipcRenderer.invoke('install-update')
    } catch (error) {
      // Silent fail if electron is not available
    }
  }

  return {
    updateAvailable,
    updateDownloaded,
    checkingForUpdate,
    updateError,
    checkForUpdates,
    installUpdate
  }
} 