import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Task } from '../storage/tasks'
import { Settings } from '../storage/settings'
import { DayOfWeek, RecurringFrequency, JobFormData } from '../../components/TaskForm'

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
  setTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  updateTask: (taskId: string, task: Partial<Task>) => void
  deleteTask: (taskId: string) => void

  // UI State
  settingsView: boolean
  showNewJobForm: boolean
  editingJobId: string | null
  loading: boolean
  error: string
  testResult: { result: string; matched?: boolean; timestamp?: Date; screenshot?: string } | null
  setSettingsView: (show: boolean) => void
  setShowNewJobForm: (show: boolean) => void
  setEditingJobId: (id: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
  setTestResult: (result: { result: string; matched?: boolean; timestamp?: Date; screenshot?: string } | null) => void

  // New Job Form State
  newJob: JobFormData
  setNewJob: (job: JobFormData) => void
  resetNewJobForm: () => void
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
  windowFloating: false
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
    (set) => ({
      // API Key State
      apiKey: '',
      hasExistingKey: false,
      setApiKey: (key: string) => set({ apiKey: key }),
      setHasExistingKey: (hasKey: boolean) => set({ hasExistingKey: hasKey }),

      // Settings State
      settings: defaultSettings,
      tempSettings: defaultSettings,
      setSettings: (settings: Settings) => set({ settings }),
      setTempSettings: (settings: Settings) => set({ tempSettings: settings }),

      // Tasks State
      tasks: [],
      setTasks: (tasks: Task[]) => set({ tasks }),
      addTask: (task: Task) => set((state) => ({ tasks: [...state.tasks, task] })),
      updateTask: (taskId: string, task: Partial<Task>) => set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...task } : t))
      })),
      deleteTask: (taskId: string) => set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== taskId)
      })),

      // UI State
      settingsView: false,
      showNewJobForm: false,
      editingJobId: null,
      loading: false,
      error: '',
      testResult: null,
      setSettingsView: (show: boolean) => set({ settingsView: show }),
      setShowNewJobForm: (show: boolean) => set({ showNewJobForm: show }),
      setEditingJobId: (id: string | null) => set({ editingJobId: id }),
      setLoading: (loading: boolean) => set({ loading }),
      setError: (error: string) => set({ error }),
      setTestResult: (result: { result: string; matched?: boolean; timestamp?: Date; screenshot?: string } | null) => set({ testResult: result }),

      // New Job Form State
      newJob: defaultNewJob,
      setNewJob: (job: JobFormData) => set({ newJob: job }),
      resetNewJobForm: () => set({ newJob: defaultNewJob })
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        settings: state.settings,
        tasks: state.tasks,
        apiKey: state.apiKey,
        hasExistingKey: state.hasExistingKey
      })
    }
  )
) 