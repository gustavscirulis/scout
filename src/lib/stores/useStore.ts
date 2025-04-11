import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Task } from '../storage/tasks'
import { Settings } from '../storage/settings'
import { DayOfWeek, RecurringFrequency, JobFormData } from '../../components/TaskForm'
import { getAllTasks } from '../storage/tasks'

interface AppState {
  // API Key State
  apiKey: string
  hasExistingKey: boolean
  setApiKey: (key: string) => void
  setHasExistingKey: (hasKey: boolean) => void

  // Settings State
  settings: Settings
  tempSettings: Settings
  setSettings: (settings: Settings) => void
  setTempSettings: (settings: Settings) => void

  // Tasks State
  tasks: Task[]
  isLoadingTasks: boolean
  error: string | null
  syncTasks: () => Promise<void>
  setTasks: (tasks: Task[]) => void
  setError: (error: string | null) => void

  // UI State
  settingsView: boolean
  showNewJobForm: boolean
  editingJobId: string | null
  loading: boolean
  testResult: { result: string; matched?: boolean; timestamp?: Date; screenshot?: string } | null
  setSettingsView: (show: boolean) => void
  setShowNewJobForm: (show: boolean) => void
  setEditingJobId: (id: string | null) => void
  setLoading: (loading: boolean) => void
  setTestResult: (result: { result: string; matched?: boolean; timestamp?: Date; screenshot?: string } | null) => void

  // New Job Form State
  newJob: JobFormData
  setNewJob: (job: JobFormData) => void
  resetNewJobForm: () => void

  // State refresh
  refreshState: () => Promise<void>
}

const defaultSettings: Settings = {
  visionProvider: 'openai',
  theme: 'light',
  checkForUpdates: true,
  launchAtStartup: false,
  notificationsEnabled: true,
  notificationSoundEnabled: true,
  notificationDuration: 5,
  notificationPosition: 'bottom-right',
  windowFloating: false,
  maxScreenshotHeight: 5000
}

const defaultNewJob: JobFormData = {
  websiteUrl: '',
  notificationCriteria: '',
  analysisPrompt: '',
  frequency: 'daily' as RecurringFrequency,
  scheduledTime: (() => {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  })(),
  dayOfWeek: 'mon' as DayOfWeek,
  visionProvider: 'openai'
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // API Key State
      apiKey: '',
      hasExistingKey: false,
      setApiKey: async (key: string) => {
        try {
          const electron = window.require('electron')
          await electron.ipcRenderer.invoke('save-api-key', key)
          await get().refreshState() // Refresh entire state after API key change
        } catch (error) {
          console.error('Failed to save API key:', error)
          set({ error: error instanceof Error ? error.message : 'Failed to save API key' })
        }
      },
      setHasExistingKey: (hasKey: boolean) => set({ hasExistingKey: hasKey }),

      // Settings State
      settings: defaultSettings,
      tempSettings: defaultSettings,
      setSettings: async (settings: Settings) => {
        try {
          const electron = window.require('electron')
          await electron.ipcRenderer.invoke('update-settings', settings)
          await get().refreshState() // Refresh entire state after settings change
        } catch (error) {
          console.error('Failed to update settings:', error)
          set({ error: error instanceof Error ? error.message : 'Failed to update settings' })
        }
      },
      setTempSettings: (settings: Settings) => set({ tempSettings: settings }),

      // Tasks State
      tasks: [],
      isLoadingTasks: false,
      error: null,
      syncTasks: async () => {
        try {
          set({ isLoadingTasks: true, error: null })
          const tasks = await getAllTasks()
          set({ tasks, isLoadingTasks: false })
        } catch (error) {
          console.error('Failed to sync tasks:', error)
          set({ 
            error: error instanceof Error ? error.message : 'Failed to sync tasks',
            isLoadingTasks: false 
          })
        }
      },
      setTasks: (tasks: Task[]) => set({ tasks }),
      setError: (error: string | null) => set({ error }),

      // UI State
      settingsView: false,
      showNewJobForm: false,
      editingJobId: null,
      loading: false,
      testResult: null,
      setSettingsView: async (show: boolean) => {
        set({ settingsView: show })
        if (!show) {
          await get().refreshState() // Refresh state when leaving settings view
        }
      },
      setShowNewJobForm: async (show: boolean) => {
        set({ showNewJobForm: show })
        if (!show) {
          await get().refreshState() // Refresh state when leaving new job form
        }
      },
      setEditingJobId: async (id: string | null) => {
        set({ editingJobId: id })
        if (!id) {
          await get().refreshState() // Refresh state when leaving edit mode
        }
      },
      setLoading: (loading: boolean) => set({ loading }),
      setTestResult: (result: { result: string; matched?: boolean; timestamp?: Date; screenshot?: string } | null) => 
        set({ testResult: result }),

      // New Job Form State
      newJob: defaultNewJob,
      setNewJob: (job: JobFormData) => set({ newJob: job }),
      resetNewJobForm: () => set({ newJob: defaultNewJob }),

      // State refresh
      refreshState: async () => {
        try {
          const electron = window.require('electron')
          
          // Sync settings
          const settings = await electron.ipcRenderer.invoke('get-settings')
          
          // Sync API key
          const apiKey = await electron.ipcRenderer.invoke('get-api-key')
          
          // Sync tasks
          const tasks = await getAllTasks()
          
          // Update all state at once
          set({
            settings,
            apiKey,
            hasExistingKey: !!apiKey,
            tasks,
            error: null
          })
        } catch (error) {
          console.error('Failed to refresh state:', error)
          set({ error: error instanceof Error ? error.message : 'Failed to refresh state' })
        }
      }
    }),
    {
      name: 'scout-ui-state',
      partialize: (state) => ({
        settings: state.settings,
        apiKey: state.apiKey,
        hasExistingKey: state.hasExistingKey
      })
    }
  )
) 