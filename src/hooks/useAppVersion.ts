import { useState, useEffect } from 'react'

export const useAppVersion = () => {
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    try {
      const electron = window.require('electron')
      
      // Check if app is packaged
      const isPackaged = electron.ipcRenderer.sendSync('is-app-packaged')
      
      if (isPackaged) {
        // In production, get version from electron
        electron.ipcRenderer.invoke('get-app-version')
          .then((version: string) => {
            setVersion(version)
          })
      } else {
        // In development, get version from package.json
        setVersion('Development') // Development version
      }
    } catch (error) {
      // Silent fail if electron is not available
    }
  }, [])

  return version
} 