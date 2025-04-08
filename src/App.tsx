import { useState, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Separator } from './components/ui/separator'
import { Checkbox } from './components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { validateApiKey } from './lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import signals from './lib/telemetry'
import { getSettings, updateSettings, Settings } from './lib/storage/settings'
import { VisionProvider, testAnalysis as visionTestAnalysis, runTaskAnalysis } from './lib/vision'
import { 
  Gear, 
  Plus, 
  Robot,
  ShoppingBag, 
  Ticket, 
  Briefcase, 
  CheckCircle, 
  XCircle, 
  WarningCircle,
  Trash,
  CaretLeft,
  CaretRight,
  Eye,
  ArrowClockwise,
  OpenAiLogo,
  Copy,
  Check
} from '@phosphor-icons/react'
import llamaIcon from './assets/llama@2x.png'
import './App.css'
import { TaskForm, JobFormData, RecurringFrequency, DayOfWeek } from './components/TaskForm'
import { 
  Task, 
  getAllTasks, 
  addTask, 
  updateTask, 
  deleteTask, 
  toggleTaskRunningState, 
  updateTaskResults, 
  TaskFormData,
  getTaskById
} from './lib/storage/tasks'
import { RadioGroup, RadioGroupItem } from './components/ui/radio-group'
import { cn } from './lib/utils'
import { useTheme } from './hooks/useTheme'

// Function to format time in a simple "ago" format
const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type NewJobFormData = JobFormData

function App() {
  const { theme } = useTheme()
  
  // Wrap with TooltipProvider at the app level for all tooltips
  const appWithTooltips = (appContent: React.ReactNode) => (
    <TooltipProvider delayDuration={1}>
      {appContent}
    </TooltipProvider>
  )

  const [tasks, setTasks] = useState<Task[]>([])
  const [apiKey, setApiKey] = useState('')
  const [hasExistingKey, setHasExistingKey] = useState(false)
  const [settingsView, setSettingsView] = useState(false)
  const [showNewJobForm, setShowNewJobForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission)
  const [testResult, setTestResult] = useState<{result: string, matched?: boolean, timestamp?: Date, screenshot?: string} | null>(null)
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [windowIsFloating, setWindowIsFloating] = useState<boolean>(() => 
    !!localStorage.getItem('windowFloating')
  )
  const [settings, setSettings] = useState<Settings>({
    visionProvider: 'openai',
    theme: theme,
    checkForUpdates: true,
    launchAtStartup: false,
    notificationsEnabled: true,
    notificationSoundEnabled: true,
    notificationDuration: 5,
    notificationPosition: 'bottom-right',
    windowFloating: false
  });
  
  const [tempSettings, setTempSettings] = useState<Settings>({
    visionProvider: 'openai',
    theme: theme,
    checkForUpdates: true,
    launchAtStartup: false,
    notificationsEnabled: true,
    notificationSoundEnabled: true,
    notificationDuration: 5,
    notificationPosition: 'bottom-right',
    windowFloating: false
  });
  
  const [newJob, setNewJob] = useState<NewJobFormData>(() => ({
    websiteUrl: '',
    notificationCriteria: '',
    analysisPrompt: '',
    frequency: 'daily',
    scheduledTime: (() => {
      const now = new Date()
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    })(),
    dayOfWeek: 'mon',
    visionProvider: settings.visionProvider
  }));
  
  // Update newJob when visionProvider changes
  useEffect(() => {
    setNewJob(prev => ({
      ...prev,
      visionProvider: settings.visionProvider
    }));
  }, [settings.visionProvider]);
  
  // Store job polling interval
  const pollingInterval = useRef<NodeJS.Timeout | null>(null)
  
  // Constant for polling frequency (check every minute)
  const POLLING_INTERVAL = 60 * 1000
  
  const checkForMissedRuns = (task: Task) => {
    if (!task.lastRun) return false;
    
    const now = new Date();
    const lastRun = new Date(task.lastRun);
    const intervalTimes: Record<RecurringFrequency, number> = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000
    };
    
    const interval = intervalTimes[task.frequency];
    const timeSinceLastRun = now.getTime() - lastRun.getTime();
    
    // If more than one interval has passed since the last run
    return timeSinceLastRun > interval;
  };

  // Load tasks from storage and check for tasks to run
  useEffect(() => {
    const loadTasks = async () => {
      try {
        console.log('[Scheduler] Loading tasks')
        const loadedTasks = await getAllTasks()
        console.log(`[Scheduler] Loaded ${loadedTasks.length} tasks`)
        setTasks(loadedTasks)
        
        // Process running tasks for missed runs and scheduling
        const promises = loadedTasks.map(async (task) => {
          if (task.isRunning) {
            console.log(`[Scheduler] Processing running task ${task.id}`)
            
            // Check if task has missed its scheduled run
            if (checkForMissedRuns(task)) {
              console.log(`[Scheduler] Task ${task.id} missed a run, executing now`)
              await runAnalysis(task)
            }
            
            // Calculate next run time if not already set
            if (!task.nextScheduledRun) {
              console.log(`[Scheduler] Setting next run time for task ${task.id}`)
              const nextRun = getNextRunTime(task)
              await updateTaskNextRunTime(task.id, nextRun)
            } else {
              console.log(`[Scheduler] Task ${task.id} next run already scheduled for ${new Date(task.nextScheduledRun).toLocaleString()}`)
            }
          }
        })
        
        // Wait for all task processing to complete
        await Promise.all(promises)
        
        // Start the polling mechanism
        console.log('[Scheduler] All tasks processed, starting polling mechanism')
        startTaskPolling()
      } catch (error) {
        console.error('[Scheduler] Failed to load tasks:', error)
      }
    }
    
    loadTasks()
    
    // Cleanup polling on unmount
    return () => {
      if (pollingInterval.current) {
        console.log('[Scheduler] Cleaning up polling interval on unmount')
        clearInterval(pollingInterval.current)
      }
    }
  }, [])

  // Set up electron IPC event listeners and window settings
  useEffect(() => {
    // Set up electron IPC event listeners
    try {
      const electron = window.require('electron');
      
      // Set up an event listener for floating window updates from main process
      electron.ipcRenderer.on('window-floating-updated', (_event: any, value: boolean) => {
        setWindowIsFloating(value);
      });
      
      // Set up an event listener for temporary floating mode
      electron.ipcRenderer.on('temporary-floating-updated', (_event: any, _value: boolean) => {
        // No longer using temporaryFloating state
      });
      
      // Set window floating preference on startup
      if (windowIsFloating) {
        electron.ipcRenderer.send('toggle-window-floating', true);
      }
      
      // Request tray icon update on startup
      electron.ipcRenderer.invoke('update-tray-icon').catch((err: Error) => {
        console.error('Failed to update tray icon on startup:', err)
      });
      
      return () => {
        // Clean up listeners when component unmounts
        electron.ipcRenderer.removeAllListeners('window-floating-updated');
        electron.ipcRenderer.removeAllListeners('temporary-floating-updated');
      };
    } catch (error) {
      // Silent fail if electron is not available in dev mode
    }
  }, [])

  // Load API key from electron-store when the app starts
  useEffect(() => {
    try {
      const electron = window.require('electron');
      
      // Load the API key on component mount
      const loadApiKey = async () => {
        try {
          const storedApiKey = await electron.ipcRenderer.invoke('get-api-key');
          if (storedApiKey) {
            setApiKey(storedApiKey);
            setHasExistingKey(true);
            
            // Check if we have any tasks that need to be started
            const tasksToStart = tasks.filter(task => !task.isRunning);
            
            if (tasksToStart.length > 0) {
              tasksToStart.forEach(task => {
                toggleTaskState(task.id);
              });
            }
          }
        } catch (error) {
          console.error('Failed to load API key:', error);
        }
      };
      
      loadApiKey();
    } catch (error) {
      // Silent fail if electron is not available in dev mode
      console.log('Electron not available, API key persistence disabled');
    }
  // Disable dependency array to run only once when component mounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Handle view transitions by managing overflow during transitions
  const [isTransitioning, setIsTransitioning] = useState(false)
  
  // Track if user just added an API key for celebration
  const [showConfetti, setShowConfetti] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  
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
  const [checkingForUpdate, setCheckingForUpdate] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  
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
  
  // Listen for update error messages
  useEffect(() => {
    try {
      const electron = window.require('electron')
      
      // Listen for update error events
      electron.ipcRenderer.on('update-error', () => {
        setUpdateError('error')
        setCheckingForUpdate(false)
      })
      
      // Listen for update-not-available event to reset checking state
      electron.ipcRenderer.on('update-not-available', () => {
        setCheckingForUpdate(false)
      })
      
      // Listen for update-available to reset checking state
      electron.ipcRenderer.on('update-available', () => {
        setCheckingForUpdate(false)
      })
      
      return () => {
        electron.ipcRenderer.removeAllListeners('update-error')
        electron.ipcRenderer.removeAllListeners('update-not-available')
        electron.ipcRenderer.removeAllListeners('update-available')
      }
    } catch (error) {
      // Silent fail if electron is not available
    }
  }, [])
  
  // Track settings view for telemetry
  useEffect(() => {
    if (settingsView) {
      signals.settingsOpened()
    }
  }, [settingsView])
  
  // Load settings on app start
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loadedSettings = await getSettings()
        setSettings(loadedSettings)
        setTempSettings(loadedSettings)
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
    }
    
    loadSettings()
  }, [])
  
  // Launch confetti when showConfetti state changes
  useEffect(() => {
    if (showConfetti) {
      const end = Date.now() + 800; // Very brief celebration
      
      // Create a confetti celebration
      const frame = () => {
        // Position at the bottom center of the screen
        const origin = { x: 0.5, y: 0.9 };
          
        confetti({
          particleCount: 12,
          angle: 90, // Straight up
          spread: 60,
          origin,
          colors: ['#4285F4', '#34A853', '#FBBC05', '#EA4335'], // Colorful confetti
          gravity: 0.8,
          scalar: 0.9 // Slightly smaller particles
        });
        
        if (Date.now() < end) {
          requestAnimationFrame(frame);
        } else {
          setShowConfetti(false);
        }
      };
      
      frame();
    }
  }, [showConfetti])
  
  useEffect(() => {
    // Always trigger the transition state when any view changes
    setIsTransitioning(true)
    // Remove transitioning class after animation completes to allow normal scrolling
    const timer = setTimeout(() => {
      setIsTransitioning(false)
    }, 250) // Animation duration (200ms) + small buffer
    
    // Enable temporary floating mode when editing or creating a new job
    try {
      const electron = window.require('electron');
      if (showNewJobForm || editingJobId) {
        electron.ipcRenderer.send('set-temporary-floating', true);
      } else {
        electron.ipcRenderer.send('set-temporary-floating', false);
      }
    } catch (error) {
      // Silent fail if electron is not available in dev mode
    }
    
    return () => clearTimeout(timer)
  }, [showNewJobForm, editingJobId, settingsView])

  const getNextRunTime = (task: Task) => {
    console.log(`[Scheduler] Calculating next run time for task ${task.id} (${task.frequency} at ${task.scheduledTime})`)
    
    const [hours, minutes] = task.scheduledTime.split(':').map(Number)
    const now = new Date()
    const next = new Date()
    next.setHours(hours, minutes, 0, 0)

    if (task.frequency === 'hourly') {
      if (next <= now) {
        next.setHours(next.getHours() + 1);
        console.log(`[Scheduler] Hourly task ${task.id} scheduled for next hour: ${next.toLocaleString()}`)
      } else {
        console.log(`[Scheduler] Hourly task ${task.id} scheduled for this hour: ${next.toLocaleString()}`)
      }
    } else if (task.frequency === 'daily') {
      if (next <= now) {
        next.setDate(next.getDate() + 1)
        console.log(`[Scheduler] Daily task ${task.id} scheduled for tomorrow: ${next.toLocaleString()}`)
      } else {
        console.log(`[Scheduler] Daily task ${task.id} scheduled for today: ${next.toLocaleString()}`)
      }
    } else if (task.frequency === 'weekly') {
      // Handle day of week for weekly jobs
      const dayMap: Record<string, number> = {
        mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0
      }
      const targetDay = dayMap[task.dayOfWeek || 'mon']
      const currentDay = now.getDay() // 0 = Sunday, 1 = Monday, etc.
      
      let daysToAdd = targetDay - currentDay
      if (daysToAdd < 0) daysToAdd += 7 // Wrap around to next week
      
      // If it's the same day but time has passed, or it's exactly now, go to next week
      if (daysToAdd === 0 && next <= now) daysToAdd = 7
      
      next.setDate(next.getDate() + daysToAdd)
      console.log(`[Scheduler] Weekly task ${task.id} scheduled for ${next.toLocaleString()} (${task.dayOfWeek} at ${task.scheduledTime})`)
    }

    console.log(`[Scheduler] Task ${task.id} next run time set to: ${next.toLocaleString()}`)
    return next
  }
  
  // Update the next scheduled run time for a task
  const updateTaskNextRunTime = async (taskId: string, nextRun: Date): Promise<Task | null> => {
    try {
      console.log(`[Scheduler] updateTaskNextRunTime called for task ${taskId}, next run: ${nextRun.toLocaleString()}`)
      
      const task = await getTaskById(taskId)
      if (!task) {
        console.error(`[Scheduler] Task ${taskId} not found when updating next run time`)
        return null
      }
      
      const updatedTask: Task = {
        ...task,
        nextScheduledRun: nextRun
      }
      
      console.log(`[Scheduler] Saving task ${taskId} with next run time: ${nextRun.toLocaleString()}`)
      await updateTask(updatedTask)
      
      // Update local state
      setTasks(prevTasks => 
        prevTasks.map(t => t.id === taskId ? updatedTask : t)
      )
      
      console.log(`[Scheduler] Task ${taskId} next run time updated successfully`)
      return updatedTask
    } catch (error) {
      console.error(`[Scheduler] Failed to update next run time for task ${taskId}:`, error)
      return null
    }
  }
  
  // Start the task polling mechanism
  const startTaskPolling = () => {
    console.log('[Scheduler] Starting task polling')
    
    // Clear any existing polling interval
    if (pollingInterval.current) {
      console.log('[Scheduler] Clearing existing polling interval')
      clearInterval(pollingInterval.current)
    }
    
    // Create a polling interval that checks every minute
    pollingInterval.current = setInterval(() => {
      console.log('[Scheduler] Polling interval triggered')
      checkTasksToRun()
    }, POLLING_INTERVAL)
    
    // Run immediately on start
    console.log('[Scheduler] Running initial task check')
    checkTasksToRun()
  }
  
  // Check for any tasks that need to run
  const checkTasksToRun = async () => {
    try {
      // First, reload tasks from storage to ensure we have the latest data
      console.log(`[Scheduler] Reloading tasks from storage before checking`)
      const loadedTasks = await getAllTasks()
      console.log(`[Scheduler] Reloaded ${loadedTasks.length} tasks from storage`)
      
      // Dump task details for debugging
      loadedTasks.forEach(task => {
        console.log(`[Scheduler] Task ${task.id} details:`)
        console.log(`  isRunning: ${task.isRunning}`)
        console.log(`  scheduledTime: ${task.scheduledTime}`)
        console.log(`  frequency: ${task.frequency}`)
        console.log(`  nextScheduledRun: ${task.nextScheduledRun ? new Date(task.nextScheduledRun).toLocaleString() : 'not set'}`)
      })
      
      // Update our state with the fresh data
      setTasks(loadedTasks)
      
      const now = new Date()
      console.log(`[Scheduler] Checking tasks at ${now.toLocaleTimeString()}`)
      
      // Log all running tasks and their next scheduled runs
      const runningTasks = loadedTasks.filter(t => t.isRunning)
      console.log(`[Scheduler] There are ${runningTasks.length} running tasks of ${loadedTasks.length} total tasks`)
      
      if (runningTasks.length === 0) {
        console.log(`[Scheduler] No running tasks to check`)
        return
      }
      
      for (const task of runningTasks) {
        console.log(`[Scheduler] Processing task ${task.id}, isRunning=${task.isRunning}`)
        
        // If no nextScheduledRun is set, we need to calculate it first
        if (!task.nextScheduledRun) {
          console.log(`[Scheduler] Task ${task.id} has no next run time, calculating it now`)
          const nextRun = getNextRunTime(task)
          await updateTaskNextRunTime(task.id, nextRun)
          
          // Update our local copy of the task with the new nextScheduledRun time
          task.nextScheduledRun = nextRun
        }
        
        // Now check if it's time to run
        const nextRun = new Date(task.nextScheduledRun)
        const timeToRun = nextRun.getTime() - now.getTime()
        
        console.log(`[Scheduler] Task ${task.id} next run: ${nextRun.toLocaleString()} (in ${Math.floor(timeToRun/1000/60)} minutes ${Math.floor(timeToRun/1000) % 60} seconds)`)
        
        // Check if it's time to run (or past time)
        if (nextRun <= now) {
          console.log(`[Scheduler] TIME TO RUN task ${task.id} - scheduled: ${nextRun.toLocaleString()}, now: ${now.toLocaleString()}`)
          console.log(`[Scheduler] =================================================`)
          console.log(`[Scheduler] EXECUTING TASK ${task.id} NOW`)
          console.log(`[Scheduler] =================================================`)
          
          try {
            // Run the task
            await runAnalysis(task)
            console.log(`[Scheduler] Task ${task.id} completed successfully`)
          } catch (error) {
            console.error(`[Scheduler] Error running task ${task.id}:`, error)
          } finally {
            // Always calculate and set the next run time, even if the run failed
            // This prevents continuous retries of a failing task
            console.log(`[Scheduler] Calculating next run time after task execution`)
            const newNextRun = getNextRunTime(task)
            await updateTaskNextRunTime(task.id, newNextRun)
          }
        } else {
          console.log(`[Scheduler] Task ${task.id} not yet due to run`)
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error in checkTasksToRun:', error)
    }
  }

  const stopTask = async (taskId: string) => {
    try {
      await toggleTaskRunningState(taskId, false)
      setTasks(tasks.map(task => 
        task.id === taskId ? { ...task, isRunning: false } : task
      ))
    } catch (error) {
      console.error('Failed to stop task:', error)
    }
  }

  const toggleTaskState = async (taskId: string) => {
    console.log(`[Scheduler] Toggling task state for ${taskId}`)
    const task = tasks.find(t => t.id === taskId)
    
    if (!task) {
      console.error(`[Scheduler] Task ${taskId} not found for toggle`)
      return
    }

    if (task.isRunning) {
      console.log(`[Scheduler] Stopping running task ${taskId}`)
      await stopTask(taskId)
      // Track stopping a task
      signals.taskStopped()
    } else {
      try {
        console.log(`[Scheduler] Starting task ${taskId}`)
        
        // Set the task to running state
        await toggleTaskRunningState(taskId, true)
        
        // Update local state
        setTasks(tasks.map(t => 
          t.id === taskId ? { ...t, isRunning: true } : t
        ))
        
        // Track starting a task
        signals.taskStarted()
        
        // Calculate next run time and update
        console.log(`[Scheduler] Calculating initial next run time for task ${taskId}`)
        const nextRun = getNextRunTime(task)
        await updateTaskNextRunTime(taskId, nextRun)
        
        // Check if it needs to run immediately
        console.log(`[Scheduler] Checking if task ${taskId} needs to run immediately`)
        await checkTasksToRun()
      } catch (error) {
        console.error(`[Scheduler] Failed to start task ${taskId}:`, error)
      }
    }
  }

  const removeTask = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      // If task is running, stop it first
      if (task && task.isRunning) {
        await stopTask(taskId)
      }
      
      // Delete the task from storage
      await deleteTask(taskId)
      
      // Track task deletion with telemetry
      signals.taskDeleted()
      
      // Update local state *after* successful deletion
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId))
      
      // Clear form and reset editing mode
      resetNewJobForm()
      setEditingJobId(null)
      setShowNewJobForm(false)
      
      // Update tray icon after deletion in case we removed a successful task
      try {
        const electron = window.require('electron');
        electron.ipcRenderer.invoke('update-tray-icon').catch((err: Error) => {
          console.error('Failed to update tray icon after task deletion:', err)
        });
      } catch (error) {
        // Silent fail if electron is not available in dev mode
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const resetNewJobForm = () => {
    setNewJob({
      websiteUrl: '',
      notificationCriteria: '',
      analysisPrompt: '',
      frequency: 'daily',
      scheduledTime: (() => {
        const now = new Date()
        return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
      })(),
      dayOfWeek: 'mon',
      visionProvider: settings.visionProvider
    });
    setTestResult(null);
  };
  
  // Clear test results when criteria changes since they're no longer valid
  useEffect(() => {
    // Only handle test results for the currently edited task
    if (editingJobId && testResult && !loading) {
      const task = tasks.find(t => t.id === editingJobId);
      
      if (task && task.notificationCriteria !== newJob.notificationCriteria) {
        const isNewTestResult = testResult.timestamp && 
          (new Date().getTime() - testResult.timestamp.getTime()) < 5000;
        
        if (!isNewTestResult) {
          setTestResult(null);
        }
      }
    }
  }, [newJob.notificationCriteria, editingJobId, testResult, tasks, loading]);
  
  // Update polling when tasks change
  useEffect(() => {
    // If there are running tasks, make sure polling is active
    const hasRunningTasks = tasks.some(task => task.isRunning)
    
    if (hasRunningTasks && !pollingInterval.current) {
      startTaskPolling()
    }
  }, [tasks]);
  
  const startEditingTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setEditingJobId(taskId);
      setNewJob({
        websiteUrl: task.websiteUrl,
        notificationCriteria: task.notificationCriteria,
        analysisPrompt: task.analysisPrompt,
        frequency: task.frequency,
        scheduledTime: task.scheduledTime,
        dayOfWeek: task.dayOfWeek || 'mon',
        visionProvider: settings.visionProvider
      });
    }
  };
  
  const updateExistingTask = async (updatedTaskData: TaskFormData) => {
    if (!editingJobId) return;
    
    try {
      console.log(`[Scheduler] Updating task ${editingJobId} with new settings`)
      
      // Find the task being edited
      const task = tasks.find(t => t.id === editingJobId);
      if (!task) {
        console.error(`[Scheduler] Task ${editingJobId} not found for updating`)
        return;
      }
      
      // Check if the task is currently running
      const wasRunning = task.isRunning;
      console.log(`[Scheduler] Task ${editingJobId} was running: ${wasRunning}`)
      
      // If it was running, stop it first
      if (wasRunning) {
        await stopTask(editingJobId);
      }
      
      // Check if criteria changed
      const criteriaChanged = task.notificationCriteria !== updatedTaskData.notificationCriteria;
      
      // Log schedule changes
      const scheduleChanged = 
        task.frequency !== updatedTaskData.frequency ||
        task.scheduledTime !== updatedTaskData.scheduledTime ||
        task.dayOfWeek !== updatedTaskData.dayOfWeek;
        
      if (scheduleChanged) {
        console.log(`[Scheduler] Task ${editingJobId} schedule changed:`)
        console.log(`[Scheduler] - Frequency: ${task.frequency} -> ${updatedTaskData.frequency}`)
        console.log(`[Scheduler] - Time: ${task.scheduledTime} -> ${updatedTaskData.scheduledTime}`)
        console.log(`[Scheduler] - Day: ${task.dayOfWeek} -> ${updatedTaskData.dayOfWeek}`)
      }
      
      // Update the task with new data
      const updatedTask: Task = {
        ...task,
        websiteUrl: updatedTaskData.websiteUrl,
        analysisPrompt: updatedTaskData.analysisPrompt,
        frequency: updatedTaskData.frequency,
        scheduledTime: updatedTaskData.scheduledTime,
        dayOfWeek: updatedTaskData.dayOfWeek,
        notificationCriteria: updatedTaskData.notificationCriteria,
        // Clear lastResult and lastMatchedCriteria if criteria changed
        lastResult: criteriaChanged ? undefined : task.lastResult,
        lastMatchedCriteria: criteriaChanged ? undefined : task.lastMatchedCriteria,
        lastTestResult: criteriaChanged ? undefined : task.lastTestResult,
        // Reset next scheduled run time since schedule changed
        nextScheduledRun: undefined
      };
      
      console.log(`[Scheduler] Saving updated task ${editingJobId} to storage`)
      // Save to storage
      await updateTask(updatedTask);
      
      // Track task update with telemetry
      signals.taskEdited(updatedTask.frequency);
      
      // Update local state
      setTasks(tasks.map(t => t.id === editingJobId ? updatedTask : t));
      
      // If it was running, restart it with the new settings
      if (wasRunning) {
        console.log(`[Scheduler] Restarting task ${editingJobId} after update`)
        await toggleTaskRunningState(editingJobId, true);
      } else {
        console.log(`[Scheduler] Task ${editingJobId} was not running, leaving it stopped after update`)
      }
      
      // Clear form and editing mode
      setEditingJobId(null);
      resetNewJobForm();
      
      // Update tray icon if criteria might have changed
      try {
        const electron = window.require('electron');
        electron.ipcRenderer.invoke('update-tray-icon').catch((err: Error) => {
          console.error('Failed to update tray icon after task update:', err)
        });
      } catch (error) {
        // Silent fail if electron is not available in dev mode
      }
    } catch (error) {
      console.error('Failed to update task:', error);
      setError('Failed to update task');
    }
  };
  
  const createNewTask = async (taskData: TaskFormData) => {
    try {
      // Include test result if available
      const newTaskData: TaskFormData & {
        lastTestResult?: {
          result: string;
          matched?: boolean;
          timestamp?: string;
          screenshot?: string;
        };
        lastResult?: string;
        lastRun?: Date;
        lastMatchedCriteria?: boolean;
      } = {
        ...taskData
      };
      
      if (testResult) {
        newTaskData.lastTestResult = {
          result: testResult.result,
          matched: testResult.matched,
          timestamp: testResult.timestamp?.toISOString(),
          screenshot: testResult.screenshot
        };
        
        // Also set these fields based on the test result
        newTaskData.lastResult = testResult.result;
        newTaskData.lastRun = testResult.timestamp;
        newTaskData.lastMatchedCriteria = testResult.matched;
      }
      
      // Add task to storage
      const newTask = await addTask(newTaskData);
      console.log(`[Scheduler] Created new task ${newTask.id}, isRunning=${newTask.isRunning}`)
      
      // Track task creation with telemetry
      signals.taskCreated(taskData.frequency);
      
      // Update local state
      setTasks(prevTasks => {
        console.log(`[Scheduler] Updating tasks state with new task ${newTask.id}`)
        return [...prevTasks, newTask]
      });
      
      // Calculate next run time and set it
      console.log(`[Scheduler] Setting initial next run time for new task ${newTask.id}`)
      const nextRun = getNextRunTime(newTask)
      await updateTaskNextRunTime(newTask.id, nextRun);
      
      // Make sure tasks get checked again after adding
      console.log(`[Scheduler] Checking tasks after creating new task ${newTask.id}`)
      await checkTasksToRun();
      
      // Request notification permission when a task is added
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        try {
          const permission = await Notification.requestPermission();
          setNotificationPermission(permission);
          if (permission === 'denied') {
            console.warn('Notification permission denied. Some features will be limited.');
          }
        } catch (error) {
          console.error('Error requesting notification permission:', error);
        }
      }
      
      // Close form and reset
      setShowNewJobForm(false);
      resetNewJobForm();
      
      // Update tray icon if a new task was added with a matched condition
      if (testResult?.matched) {
        try {
          const electron = window.require('electron');
          electron.ipcRenderer.invoke('update-tray-icon').catch((err: Error) => {
            console.error('Failed to update tray icon after task creation:', err)
          });
        } catch (error) {
          // Silent fail if electron is not available in dev mode
        }
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      setError('Failed to create task');
    }
  }

  const sendNotification = (task: Task, analysis: string) => {
    if (notificationPermission === 'granted') {
      // Extract just the domain from the URL
      const urlObj = new URL(task.websiteUrl.startsWith('http') ? task.websiteUrl : `http://${task.websiteUrl}`);
      const domain = urlObj.hostname;
      
      const title = `${domain} matched your condition`;
      
      // Create a notification body that just includes the rationale (analysis)
      let body = analysis;
      if (analysis && analysis.length > 100) {
        body = analysis.slice(0, 100) + '...';
      }
      
      // Create notification that will persist until explicitly dismissed
      const notification = new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        requireInteraction: true, // Prevents auto-closing
        silent: false,
        tag: `analysis-${task.id}`,
        // The timeoutType property is not standard but supported in some implementations
        // @ts-ignore
        timeoutType: 'never'
      })

      // When notification is clicked, just focus the window but don't close the notification
      // This allows the user to see it until they explicitly dismiss it
      notification.onclick = () => {
        const { ipcRenderer } = window.require('electron')
        ipcRenderer.send('focus-window')
        // Not closing the notification here so it persists until user dismisses it
      }
    }
  }

  const runAnalysis = async (task: Task) => {
    console.log(`[Analysis] ========================================`)
    console.log(`[Analysis] STARTING ANALYSIS FOR TASK ${task.id}`)
    console.log(`[Analysis] ========================================`)
    console.log(`[Analysis] Website URL: ${task.websiteUrl}`)
    console.log(`[Analysis] Prompt: ${task.analysisPrompt}`)
    console.log(`[Analysis] Criteria: ${task.notificationCriteria}`)
    console.log(`[Analysis] Provider: ${settings.visionProvider}`)
    
    // Get the API key if OpenAI is being used and not already loaded
    if (settings.visionProvider === 'openai' && !apiKey) {
      try {
        console.log('[Analysis] No API key in state, trying to load from storage')
        const electron = window.require('electron')
        const storedApiKey = await electron.ipcRenderer.invoke('get-api-key')
        if (storedApiKey) {
          console.log('[Analysis] Found stored API key')
          setApiKey(storedApiKey)
        } else {
          console.error('[Analysis] No API key available')
          setError('Please set your OpenAI API key in settings')
          return
        }
      } catch (error) {
        console.error('[Analysis] Error loading API key:', error)
        setError('Failed to load API key')
        return
      }
    }
    
    // Re-check API key after potential loading if using OpenAI
    let currentApiKey = ''
    if (settings.visionProvider === 'openai') {
      currentApiKey = apiKey || await window.require('electron').ipcRenderer.invoke('get-api-key')
      
      if (!currentApiKey) {
        console.error('[Analysis] No API key available after loading attempt')
        setError('Please set your OpenAI API key in settings')
        return
      }
      
      // Validate API key
      console.log('[Analysis] Validating API key')
      const validation = validateApiKey(currentApiKey)
      if (!validation.isValid) {
        console.error('[Analysis] Invalid API key:', validation.message)
        setError(validation.message || 'Invalid API key')
        return
      }
      
      console.log(`[Analysis] API key validated for task ${task.id}, proceeding with analysis`)
    }

    try {
      console.log(`[Analysis] Starting analysis execution for task ${task.id}`)
      setLoading(true)
      setError('')
      
      // Track analysis start
      signals.analysisRun()

      // Use the new task analysis function from the vision module
      const analysisResult = await runTaskAnalysis(settings.visionProvider, currentApiKey, task)
      console.log(`[Analysis] Analysis completed with result:`, analysisResult)
      
      // Format the result and create timestamp
      const formattedResult = analysisResult.result
      const criteriaMatched = analysisResult.matched
      const now = new Date()
      
      // Create lastTestResult-compatible object for scheduled runs
      const resultData = {
        result: formattedResult,
        matched: criteriaMatched,
        timestamp: now.toISOString(),
        screenshot: analysisResult.screenshot
      }
      
      console.log(`[Analysis] Updating task ${task.id} with results`)
      // Update the task with results
      const updatedTask = await updateTaskResults(task.id, {
        lastResult: formattedResult,
        lastRun: now,
        lastMatchedCriteria: criteriaMatched,
        lastTestResult: resultData
      })
      
      if (updatedTask) {
        console.log(`[Analysis] Task ${task.id} updated successfully with results`)
        
        // Update local state using functional update to avoid stale state
        setTasks(prevTasks => {
          // Double check the task still exists in our local state
          const taskExists = prevTasks.some(t => t.id === task.id)
          if (!taskExists) {
            // If it doesn't exist anymore, add it back
            console.log(`[Analysis] Task ${task.id} not found in state, adding it`)
            return [...prevTasks, updatedTask]
          }
          // Otherwise update it
          console.log(`[Analysis] Updating task ${task.id} in state`)
          return prevTasks.map(t => t.id === task.id ? updatedTask : t)
        })
        
        // Only send notification if criteria matched
        if (criteriaMatched === true) {
          console.log(`[Analysis] Criteria matched for task ${task.id}, sending notification`)
          sendNotification(updatedTask, formattedResult)
        } else {
          console.log(`[Analysis] Criteria not matched for task ${task.id}, no notification`)
        }
        
        // Update tray icon if criteria matched state changed
        try {
          console.log(`[Analysis] Updating tray icon for task ${task.id}`)
          const electron = window.require('electron')
          electron.ipcRenderer.invoke('update-tray-icon').catch((err: Error) => {
            console.error('[Analysis] Failed to update tray icon:', err)
          })
        } catch (error) {
          console.error('[Analysis] Error updating tray icon:', error)
          // Silent fail if electron is not available in dev mode
        }
        
        // Track successful analysis with telemetry
        signals.analysisRun(true)
      } else {
        // Log error if we couldn't update the task
        console.error(`[Analysis] Failed to update task results for ${task.id}`)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred'
      console.error(`[Analysis] Error in analysis:`, err)
      setError(errorMessage)
      
      // Track analysis failure with telemetry
      signals.analysisRun(false)
      
      // Also save the error in the task's result
      const now = new Date()
      console.log(`[Analysis] Creating error record for task ${task.id}: ${errorMessage}`)
      const errorResultData = {
        result: errorMessage,
        timestamp: now.toISOString()
      }
      
      console.log(`[Analysis] Updating task ${task.id} with error`)
      // Update task with error
      const updatedTask = await updateTaskResults(task.id, {
        lastResult: errorMessage,
        lastRun: now,
        lastTestResult: errorResultData
      })
      
      if (updatedTask) {
        console.log(`[Analysis] Task ${task.id} updated with error`)
        // Update using functional update to avoid stale state
        setTasks(prevTasks => {
          const taskExists = prevTasks.some(t => t.id === task.id)
          if (!taskExists) {
            return [...prevTasks, updatedTask]
          }
          return prevTasks.map(t => t.id === task.id ? updatedTask : t)
        })
      } else {
        console.error(`[Analysis] Failed to update task with global error for ${task.id}`)
      }
    } finally {
      console.log(`[Analysis] Analysis for task ${task.id} completed`)
      setLoading(false)
    }
  }

  const testAnalysis = async (taskData: TaskFormData) => {
    // Clear any existing test result when starting a new test
    setTestResult(null);
    setLoading(true);
    
    if (settings.visionProvider === 'openai') {
      if (!apiKey) {
        setError('Please set your OpenAI API key in settings');
        setLoading(false);
        return;
      }
      
      const validation = validateApiKey(apiKey);
      if (!validation.isValid) {
        setError(validation.message || 'Invalid API key');
        setLoading(false);
        return;
      }
    }
    
    try {
      const result = await visionTestAnalysis(
        settings.visionProvider,
        apiKey,
        taskData.websiteUrl, 
        taskData.notificationCriteria
      );
      
      // Only set the test result in state, don't persist it to storage
      setTestResult(result);
      
      // Don't update the task in storage - that should only happen on save
    } catch (error) {
      setError('Failed to run test analysis');
    } finally {
      setLoading(false);
    }
  };

  const [llamaModelStatus, setLlamaModelStatus] = useState<{ installed: boolean; hasModel: boolean } | null>(null)
  const [checkingLlamaModel, setCheckingLlamaModel] = useState(false)

  // Check Llama model status when provider is set to llama
  useEffect(() => {
    const checkModel = async () => {
      setCheckingLlamaModel(true)
      try {
        const electron = window.require('electron')
        const status = await electron.ipcRenderer.invoke('check-llama-model')
        setLlamaModelStatus(status)
      } catch (error) {
        console.error('Failed to check Llama model:', error)
        setLlamaModelStatus({ installed: false, hasModel: false })
      } finally {
        setCheckingLlamaModel(false)
      }
    }

    // Only check model status when settings are opened and Llama is selected
    if (settingsView && settings.visionProvider === 'llama') {
      checkModel()
      
      // Set up polling if model is not installed
      if (!llamaModelStatus?.installed) {
        const pollInterval = setInterval(() => {
          checkModel()
        }, 5000) // Check every 5 seconds
        
        // Clean up interval when component unmounts or conditions change
        return () => clearInterval(pollInterval)
      }
    } else {
      setLlamaModelStatus(null)
    }
  }, [settings.visionProvider, settingsView, llamaModelStatus?.installed])

  const [copyStatus, setCopyStatus] = useState(false)

  // Add this function to handle copy with animation
  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText('ollama pull llama3.2-vision')
      setCopyStatus(true)
      setTimeout(() => setCopyStatus(false), 1000)
    } catch (error) {
      console.error('Failed to copy command:', error)
    }
  }

  return appWithTooltips(
    <div className="flex flex-col h-full w-full">
      {/* Titlebar - macOS style */}
      <div className="h-12 -webkit-app-region-drag w-full flex items-center border-b bg-header">
        <div className="flex items-center w-12 pl-2">
          {(showNewJobForm || editingJobId || settingsView) ? (
            <Button
              variant="headerIcon"
              size="icon"
              onClick={() => {
                // Revert settings to their saved state when pressing back
                setSettings(tempSettings)
                setShowNewJobForm(false);
                setEditingJobId(null); // Clear editing mode
                setSettingsView(false);
              }}
              title="Back"
              className="-webkit-app-region-no-drag"
            >
              <CaretLeft size={16} />
            </Button>
          ) : (
            <Button
              variant="headerIcon"
              size="icon"
              onClick={() => setSettingsView(true)}
              title="Settings"
              className="-webkit-app-region-no-drag"
            >
              <Gear size={16} />
            </Button>
          )}
        </div>
        
        <div className="font-semibold text-sm -webkit-app-region-drag text-muted-foreground text-center flex-1">
          {(showNewJobForm || editingJobId) ? 
            (editingJobId ? 'Edit Task' : 'New Task') : 
            (settingsView ? 'Settings' : 'Scout')}
        </div>
        
        <div className="flex items-center justify-end w-12 pr-2">
          {!showNewJobForm && !editingJobId && !settingsView ? (
            apiKey ? (
              <Button
                variant="headerIcon"
                size="icon"
                onClick={() => setShowNewJobForm(true)}
                title="New Task"
                className="-webkit-app-region-no-drag"
              >
                <Plus size={16} />
              </Button>
            ) : (
              <div></div> // Empty div when no API key
            )
          ) : editingJobId ? (
            <Button
              variant="headerIcon"
              size="icon"
              onClick={() => removeTask(editingJobId)}
              title="Delete"
              className="-webkit-app-region-no-drag"
            >
              <Trash size={16} />
            </Button>
          ) : (
            <div></div> // Empty div to maintain layout
          )}
        </div>
      </div>


      {/* Main content */}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden flex flex-col relative bg-background ${isTransitioning ? 'overflow-hidden' : ''}`}>
        <div className="w-full space-y-6 flex-grow flex flex-col">

          {/* Tasks List */}
          <div className="space-y-4">
            {(!apiKey || tasks.length === 0) && !showNewJobForm && !editingJobId && !settingsView && (
              <div className="flex flex-col items-center justify-center py-7 text-center px-6 animate-in">
                <div className="w-28 h-28 flex items-center justify-center mb-4">
                  <img src="app_icon.png" alt="Scout" className="w-full h-full object-contain" />
                </div>
                {!apiKey ? (
                  <>
                    <h3 className="text-lg font-medium mb-2">Welcome to Scout!</h3>
                    <div className="max-w-xl mx-auto mb-8">
                      <p className="text-muted-foreground text-sm text-center">
                      Scout uses AI to detect website changes.<br />Get started by adding your OpenAI API key.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium mb-2">Set Up a Task</h3>
                    <div className="max-w-xl mx-auto mb-8">
                      <p className="text-muted-foreground text-sm text-center">
                        Get notified when something changes on a website you care about.
                      </p>
                    </div>
                  </>
                )}
                
                {!apiKey ? (
                  <>
                    <div className="w-full overflow-hidden border rounded-lg shadow-sm opacity-70 -webkit-app-region-no-drag mb-8">
                      <div className="bg-accent p-4 text-left flex items-start border-b">
                        <ShoppingBag size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">Price drops</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            e.g. price goes below certain target
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-accent p-4 text-left flex items-start border-b">
                        <Ticket size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">Back in stock</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            e.g. concert tickets become available
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-accent p-4 text-left flex items-start">
                        <Briefcase size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">New content</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            e.g. certain job listing is posted
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="max-w-xl mx-auto">
                      <Button 
                        onClick={() => {
                          setSettingsView(true);
                          // Focus on API key input after component renders
                          setTimeout(() => {
                            const apiKeyInput = document.getElementById("apiKey");
                            if (apiKeyInput) {
                              apiKeyInput.focus();
                            }
                          }, 0);
                        }}
                        className="rounded-full px-6"
                        size="lg"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add API Key
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-full overflow-hidden border rounded-lg shadow-sm -webkit-app-region-no-drag mb-8">
                      <button 
                        onClick={() => {
                          setNewJob(prev => ({
                            ...prev,
                            notificationCriteria: 'product price drops below target price',
                            analysisPrompt: 'Analyze this webpage to determine if the product price has dropped below the target price.',
                            visionProvider: settings.visionProvider
                          }));
                          setShowNewJobForm(true);
                        }}
                        className="w-full bg-accent p-4 hover:bg-muted/30 transition-colors text-left flex items-start border-b"
                      >
                        <ShoppingBag size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">Price drops</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            e.g. price goes below certain target
                          </div>
                        </div>
                      </button>
                      
                      <button 
                        onClick={() => {
                          setNewJob(prev => ({
                            ...prev,
                            notificationCriteria: 'Concert tickets are available for purchase',
                            analysisPrompt: 'Analyze this webpage to determine if concert tickets are available for purchase.',
                            visionProvider: settings.visionProvider
                          }));
                          setShowNewJobForm(true);
                        }}
                        className="w-full bg-accent p-4 hover:bg-muted/30 transition-colors text-left flex items-start border-b"
                      >
                        <Ticket size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">Back in stock</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            e.g. concert tickets become available
                          </div>
                        </div>
                      </button>
                      
                      <button 
                        onClick={() => {
                          setNewJob(prev => ({
                            ...prev,
                            notificationCriteria: '[job] posting is available',
                            analysisPrompt: 'Analyze this webpage to determine if new job listings have appeared.',
                            visionProvider: settings.visionProvider
                          }));
                          setShowNewJobForm(true);
                        }}
                        className="w-full bg-accent p-4 hover:bg-muted/30 transition-colors text-left flex items-start"
                      >
                        <Briefcase size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">New content</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            e.g. certain job listing is posted
                          </div>
                        </div>
                      </button>
                    </div>
                    
                    <div className="max-w-xl mx-auto">
                      <Button 
                        onClick={() => setShowNewJobForm(true)}
                        className="rounded-full px-6"
                        size="lg"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create Task
                      </Button>
                    </div>
                    
                    {/* Update UI */}
                    {(updateAvailable || updateDownloaded) && (
                      <div className="mt-4 text-center">
                        <Button
                          variant={updateDownloaded ? "default" : "outline"}
                          size="sm"
                          onClick={updateDownloaded ? installUpdate : checkForUpdates}
                          className="text-xs"
                          disabled={checkingForUpdate}
                        >
                          <ArrowClockwise className={`mr-1 h-3 w-3 ${checkingForUpdate ? 'animate-spin' : ''}`} />
                          {checkingForUpdate
                            ? "Checking..."
                            : updateDownloaded 
                              ? "Install update" 
                              : "Download update"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* When in edit mode or creating a new task, only show that form */}
            {editingJobId && tasks.find(task => task.id === editingJobId) ? (
              <TaskForm
                formData={newJob}
                testResult={testResult}
                loading={loading}
                onFormChange={setNewJob}
                onTest={testAnalysis}
                onSave={(data) => {
                  if (data.websiteUrl && data.notificationCriteria) {
                    updateExistingTask(data);
                  }
                }}
              />
            ) : !showNewJobForm && settingsView ? (
              // Settings view (shown in place of task list)
              <div className="flex flex-col h-full min-h-[calc(100vh-3rem)] animate-in">
                <div className="flex-1 overflow-auto">
                  <div className="px-8 pt-6 space-y-8">
                    {/* Vision Provider section */}
                    <fieldset className="space-y-3">
                      <legend className="text-sm font-medium">AI Model</legend>
                      
                      <RadioGroup
                        value={settings.visionProvider}
                        onValueChange={(value: string) => {
                          const newProvider = value as VisionProvider
                          setSettings({
                            ...settings,
                            visionProvider: newProvider
                          })
                        }}
                        className="grid grid-cols-2 gap-3"
                      >
                        <RadioGroupItem
                          value="llama"
                          className={cn(
                            "relative group ring-[1px] ring-border rounded-lg py-4 px-4 text-start h-auto w-auto",
                            "hover:bg-accent hover:text-accent-foreground",
                            "data-[state=checked]:ring-2 data-[state=checked]:ring-primary"
                          )}
                        >
                          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 h-5 w-5 rounded-full bg-background flex items-center justify-center group-data-[state=unchecked]:hidden">
                            <CheckCircle 
                              className="h-5 w-5 text-primary fill-primary stroke-background" 
                              weight="fill"
                            />
                          </div>
                          <div className="flex items-center gap-2 mb-2.5">
                            <img 
                              src={llamaIcon} 
                              alt="Llama" 
                              className="h-4 w-4 text-muted-foreground dark:filter dark:brightness-0 dark:invert opacity-70" 
                            />
                          </div>
                          <span className="font-semibold tracking-tight">Llama 3.2</span>
                          <p className="text-xs text-muted-foreground mt-1">Free but slower and less accurate</p>
                        </RadioGroupItem>

                        <RadioGroupItem
                          value="openai"
                          className={cn(
                            "relative group ring-[1px] ring-border rounded-lg py-4 px-4 text-start h-auto w-auto",
                            "hover:bg-accent hover:text-accent-foreground",
                            "data-[state=checked]:ring-2 data-[state=checked]:ring-primary"
                          )}
                        >
                          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 h-5 w-5 rounded-full bg-background flex items-center justify-center group-data-[state=unchecked]:hidden">
                            <CheckCircle 
                              className="h-5 w-5 text-primary fill-primary stroke-background" 
                              weight="fill"
                            />
                          </div>
                          <div className="flex items-center gap-2 mb-2.5">
                            <OpenAiLogo className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="font-semibold tracking-tight">GPT-4o</span>
                          <p className="text-xs text-muted-foreground mt-1">Fast and accurate but paid</p>
                        </RadioGroupItem>
                      </RadioGroup>
                      
                      {settings.visionProvider === 'llama' && (
                        <div className="space-y-3 -mt-1">
                          {checkingLlamaModel ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <ArrowClockwise className="h-3.5 w-3.5 animate-spin" />
                              Checking for Llama model...
                            </div>
                          ) : llamaModelStatus && (
                            <div className="space-y-2">
                              {!llamaModelStatus.installed ? (
                                <div className="rounded-md px-3 py-1.5 bg-destructive/10 border border-destructive/20 dark:bg-destructive/20">
                                  <p className="text-[0.8rem] font-medium text-destructive dark:text-destructive-foreground flex items-center">
                                    <WarningCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" weight="fill" />
                                    Install Ollama to use Llama 3.2
                                  </p>
                                  <div className="mt-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-xs h-7"
                                      onClick={() => {
                                        try {
                                          const { shell } = window.require('electron');
                                          shell.openExternal('https://ollama.com/download');
                                        } catch (error) {
                                          window.open('https://ollama.com/download', '_blank');
                                        }
                                      }}
                                    >
                                      Download Ollama
                                    </Button>
                                  </div>
                                </div>
                              ) : !llamaModelStatus.hasModel ? (
                                <div className="rounded-md px-3 py-1.5 bg-destructive/10 border border-destructive/20 dark:bg-destructive/20">
                                  <p className="text-[0.8rem] font-medium text-destructive dark:text-destructive-foreground flex items-center">
                                    <WarningCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" weight="fill" />
                                    Required model is not installed
                                  </p>
                                  <div className="mt-2 flex items-center gap-2">
                                    <code className="text-[0.8rem] bg-destructive/10 px-2 py-1 rounded">ollama pull llama3.2-vision</code>
                                    <TooltipProvider>
                                      <Tooltip open={copyStatus}>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 hover:bg-destructive/10"
                                            onClick={handleCopyCommand}
                                          >
                                            {copyStatus ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Command copied</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                  <p className="text-[0.8rem] text-muted-foreground/90 mt-2">
                                    Run this command in your terminal to install llama3.2-vision.
                                  </p>
                                </div>
                              ) : (
                                <div className="rounded-md px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 dark:bg-emerald-500/20">
                                  <p className="text-[0.8rem] font-medium text-emerald-500 dark:text-emerald-500 flex items-center">
                                    <CheckCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" weight="fill" />
                                    Llama is ready for use
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </fieldset>
                    
                    {/* API Key section - only show for OpenAI */}
                    {settings.visionProvider === 'openai' && (
                      <>
                        <fieldset className="space-y-3">
                          <div className="flex flex-col">
                            <label htmlFor="apiKey" className="text-sm font-medium mb-1.5">
                              OpenAI API Key
                            </label>
                            <Input
                              id="apiKey"
                              type="password"
                              value={apiKey}
                              onChange={(e) => {
                                const newApiKey = e.target.value;
                                setApiKey(newApiKey);
                                
                                // Clear any previous error when user is typing
                                if (error && error.includes('API key')) {
                                  setError('');
                                }
                              }}
                              placeholder="sk-..."
                              autoComplete="off"
                            />
                            {((apiKey && !validateApiKey(apiKey).isValid) || 
                              (error && error.startsWith('_API_KEY_'))) && (
                              <div className="mt-2 rounded-md px-3 py-1.5 bg-destructive/10 border border-destructive/20 dark:bg-destructive/20">
                                <p className="text-[0.8rem] font-medium text-destructive dark:text-destructive-foreground flex items-center">
                                  <WarningCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" weight="fill" />
                                  {error && error.startsWith('_API_KEY_') 
                                    ? error.replace('_API_KEY_', '') 
                                    : 'Please enter a valid OpenAI API key. Make sure it starts with "sk-" and is at least 50 characters long.'}
                                </p>
                              </div>
                            )}
                            
                            {!apiKey && hasExistingKey && (
                              <p className="text-[0.8rem] text-muted-foreground mt-2">
                                Saving with an empty field will remove your API key.
                              </p>
                            )}
                            <p className="text-[0.8rem] text-muted-foreground mt-2">
                              Get your API key from <a 
                                href="#" 
                                onClick={(e) => {
                                  e.preventDefault();
                                  try {
                                    const { shell } = window.require('electron');
                                    shell.openExternal('https://platform.openai.com/api-keys');
                                  } catch (error) {
                                    window.open('https://platform.openai.com/api-keys', '_blank');
                                  }
                                }}
                                className="text-primary hover:underline"
                              >here</a>. Stored locally only.
                            </p>
                          </div>
                        </fieldset>
                      </>
                    )}
                    
                    {/* Updates section */}
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Updates</legend>
                      
                      <Button
                        variant={updateDownloaded ? "default" : "outline"}
                        size="sm"
                        onClick={updateDownloaded ? installUpdate : checkForUpdates}
                        className="text-xs h-8 w-full justify-center"
                        disabled={checkingForUpdate}
                      >
                        <ArrowClockwise className={`mr-1.5 h-3.5 w-3.5 ${checkingForUpdate ? 'animate-spin' : ''}`} />
                        {checkingForUpdate
                          ? "Checking for updates..."
                          : updateDownloaded 
                            ? "Install update now" 
                            : updateAvailable 
                              ? "Download available update"
                              : "Check for updates"}
                      </Button>
                      
                      {updateError && (
                        <p className="text-xs text-destructive mt-2">
                          Unable to check for updates
                        </p>
                      )}
                    </fieldset>
                    
                    {(() => {
                      // Check if app is in development mode
                      try {
                        const electron = window.require('electron');
                        
                        // Get the packaged state from the electron remote
                        const isPackaged = electron.ipcRenderer.sendSync('is-app-packaged');
                        if (!isPackaged) {
                          return (
                            <>
                              <fieldset className="space-y-3">
                                <legend className="text-sm font-medium">Window Options</legend>
                                
                                <div className="items-top flex space-x-2">
                                  <Checkbox
                                    id="windowFloating"
                                    checked={windowIsFloating}
                                    onCheckedChange={(checked) => {
                                      const isChecked = !!checked;
                                      
                                      // Update state for immediate UI feedback
                                      setWindowIsFloating(isChecked);
                                      
                                      // Update localStorage
                                      if (isChecked) {
                                        localStorage.setItem('windowFloating', 'true');
                                      } else {
                                        localStorage.removeItem('windowFloating');
                                      }
                                      
                                      // Track window floating toggle in telemetry
                                      signals.toggleWindowFloating(isChecked);
                                      
                                      // Send IPC message to main process
                                      try {
                                        const electron = window.require('electron');
                                        electron.ipcRenderer.send('toggle-window-floating', isChecked);
                                      } catch (error) {
                                        setError('Could not update window settings');
                                        
                                        // Revert state on error
                                        setWindowIsFloating(!isChecked);
                                      }
                                    }}
                                  />
                                  <div className="grid gap-1.5 leading-none">
                                    <label
                                      htmlFor="windowFloating"
                                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                      Keep window floating
                                    </label>
                                    <p className="text-sm text-muted-foreground">
                                      Window will stay open when clicking elsewhere
                                    </p>
                                  </div>
                                </div>
                              </fieldset>
                            </>
                          );
                        }
                        
                        return null;
                      } catch (error) {
                        // Silent fail if electron is not available
                        return null;
                      }
                    })()}
                    
                  </div>
                </div>
                <div className="sticky bottom-0 left-0 right-0 border-t border-border/60 h-12 px-2 flex justify-center items-center gap-3 bg-header">
                  <Button
                    variant="default"
                    onClick={async () => {
                      // Check if we need to refresh hasExistingKey
                      try {
                        const electron = window.require('electron');
                        const existingKey = await electron.ipcRenderer.invoke('get-api-key');
                        setHasExistingKey(!!existingKey);
                      } catch (error) {
                        // Fallback for dev mode
                        console.log('Electron not available, using localStorage fallback');
                      }

                      let hasError = false;
                      
                      // Allow empty API key (to delete it), but validate if one is provided
                      if (apiKey) {
                        // Validate API key before saving
                        const validation = validateApiKey(apiKey);
                        if (!validation.isValid) {
                          // Use the special prefix for API key errors to avoid floating toast
                          setError('_API_KEY_' + (validation.message || 'Invalid API key'));
                          hasError = true;
                        }
                      }
                      
                      // Only proceed if there are no errors
                      if (!hasError) {
                        try {
                          const electron = window.require('electron');
                          const lastSavedKey = await electron.ipcRenderer.invoke('get-api-key') || '';
                          
                          // If clearing the API key
                          if (!apiKey && lastSavedKey) {
                            // Remove API key from storage using IPC
                            await electron.ipcRenderer.invoke('delete-api-key');
                            setHasExistingKey(false);
                            
                            // Stop all running tasks
                            const updatedTasks = await Promise.all(
                              tasks.map(async task => {
                                if (task.isRunning) {
                                  await stopTask(task.id);
                                }
                                return { ...task, isRunning: false };
                              })
                            );
                            setTasks(updatedTasks);
                            
                            // Close settings and show the welcome screen
                            setSettingsView(false);
                            return;
                          } 
                          // If updating with a new key
                          else if (apiKey && apiKey !== lastSavedKey) {
                            // Only show confetti if this is the first time adding an API key
                            // AND there are no saved tasks yet
                            if (!lastSavedKey && !hasExistingKey && tasks.length === 0) {
                              setShowConfetti(true);
                            }
                            
                            // Save new API key using IPC
                            await electron.ipcRenderer.invoke('save-api-key', apiKey);
                            setHasExistingKey(true);
                            
                            // Track API key saving in telemetry
                            signals.apiKeySaved();
                            
                            // Start all tasks when adding a new API key
                            setTimeout(async () => {
                              const updatedTasks = await Promise.all(
                                tasks.map(async task => {
                                  // Update the task to be running
                                  const updatedTask = await toggleTaskRunningState(task.id, true);
                                  if (updatedTask) {
                                    return updatedTask;
                                  }
                                  return task;
                                })
                              );
                              setTasks(updatedTasks);
                              
                              // Update tray icon after starting all tasks
                              try {
                                electron.ipcRenderer.invoke('update-tray-icon').catch((err: Error) => {
                                  console.error('Failed to update tray icon after starting all tasks:', err)
                                });
                              } catch (error) {
                                // Silent fail if electron is not available in dev mode
                              }
                            }, 50);
                          }

                          // Save the vision provider setting
                          await updateSettings(settings);
                          setTempSettings(settings);
                          
                          setSettingsView(false)
                        } catch (error) {
                          console.error('Failed to save settings:', error);
                          setError('Failed to save settings');
                        }
                      }
                    }}
                    className="h-8 w-24"
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : !showNewJobForm && apiKey ? (
              // When not in edit mode, settings, or creating new task, and API key exists, show tasks list
              tasks.length > 0 && (
                <div className="pb-6">
                  <div className="rounded-lg overflow-hidden animate-in border-x-0 rounded-none">
                    {[...tasks].reverse().map((task, index) => (
                      <div 
                        key={task.id}
                        className={`flex items-center px-5 py-5 border-b border-border/50 hover:bg-accent transition-colors ${index === 0 ? 'border-t-0' : ''}`}
                        onClick={(e) => {
                          // Only trigger if not clicking on buttons
                          if (!(e.target as HTMLElement).closest('button')) {
                            startEditingTask(task.id);
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center">
                            {task.isRunning && (
                              <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${(task.lastMatchedCriteria || task.lastTestResult?.matched)
                                ? 'bg-emerald-500 dark:bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.7)]' 
                                : 'bg-[#007AFF] dark:bg-[#007AFF] shadow-[0_0_4px_rgba(0,122,255,0.7)]'} 
                                animate-[subtle-pulse_1.5s_ease-in-out_infinite,scale_1.5s_ease-in-out_infinite] flex-shrink-0 origin-center`}></span>
                            )}
                            <h3 className="font-medium text-sm truncate" title={task.websiteUrl}>
                              {task.websiteUrl}
                            </h3>
                          </div>
                          
                          <div className="flex items-center mt-1 text-xs text-muted-foreground">
                          <div className="w-[7px] flex-shrink-0 mr-1"></div>
                          <span 
                            className="flex-shrink-0 cursor-default" 
                            title={task.lastRun ? `Checked ${formatTimeAgo(new Date(task.lastRun))}` : "Waiting for first check"}
                          >
                            {task.frequency === 'hourly' ? 'Hourly' : 
                             task.frequency === 'daily' ? `Daily at ${task.scheduledTime}` : 
                             task.frequency === 'weekly' ? `Weekly on ${task.dayOfWeek || 'Mon'} at ${task.scheduledTime}` : ''}
                          </span>
                            
                            <span className="mx-1.5 text-muted-foreground/40">•</span>
                            
                            {/* Display matched state from either regular run or test run */}
                            {(task.lastMatchedCriteria || task.lastTestResult?.matched) ? (
                              <span className="truncate" title={task.notificationCriteria}>
                                Matched: {task.notificationCriteria}
                              </span>
                            ) : (
                              <span className="truncate" title={task.notificationCriteria}>
                                {task.notificationCriteria}
                              </span>
                            )}
                            
                          </div>
                        </div>
                        
                        <div className="flex items-center ml-4 mr-0">
                          <CaretRight className="text-muted-foreground/70 flex-shrink-0" size={16} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : null }

            {/* New Task Form (only shown when not editing any task) */}
            {showNewJobForm && !editingJobId && (
              <TaskForm
                formData={newJob}
                testResult={testResult}
                loading={loading}
                onFormChange={setNewJob}
                onTest={testAnalysis}
                onSave={(data) => {
                  if (data.websiteUrl && data.notificationCriteria) {
                    createNewTask(data);
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App