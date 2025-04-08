// Available settings keys and default values
const defaultSettings = {
  visionProvider: 'openai' as 'openai' | 'llama'
}

export interface Settings {
  visionProvider: 'openai' | 'llama';
  theme: 'dark' | 'light';
  checkForUpdates: boolean;
  launchAtStartup: boolean;
  notificationsEnabled: boolean;
  notificationSoundEnabled: boolean;
  notificationDuration: number;
  notificationPosition: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left';
  windowFloating: boolean;
}

// Get all settings from electron store
export const getSettings = async (): Promise<Settings> => {
  try {
    const electron = window.require('electron')
    const storedSettings = await electron.ipcRenderer.invoke('get-settings')
    return { ...defaultSettings, ...storedSettings }
  } catch (error) {
    console.error('Failed to get settings:', error)
    return { ...defaultSettings }
  }
}

// Update settings in electron store
export const updateSettings = async (settings: Partial<Settings>): Promise<Settings> => {
  try {
    const electron = window.require('electron')
    const currentSettings = await getSettings()
    const updatedSettings = { ...currentSettings, ...settings }
    await electron.ipcRenderer.invoke('update-settings', updatedSettings)
    return updatedSettings
  } catch (error) {
    console.error('Failed to update settings:', error)
    throw new Error('Failed to update settings')
  }
}
