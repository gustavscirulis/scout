import { useState, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Separator } from './components/ui/separator'
import { Checkbox } from './components/ui/checkbox'
import { validateApiKey } from './lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
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
  Moon,
  Sun,
  Eye
} from '@phosphor-icons/react'
import './App.css'
import { TaskForm, JobFormData, RecurringFrequency, DayOfWeek } from './components/TaskForm'
import { Task, getAllTasks, addTask, updateTask, deleteTask, toggleTaskRunningState, updateTaskResults, TaskFormData } from './lib/storage/tasks'

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

// Function to check if the user prefers dark mode
const getSystemThemePreference = (): 'dark' | 'light' => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light' // Default to light if media queries not supported
}

// Function to update the document with the theme class
const updateThemeClass = (theme: 'dark' | 'light') => {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

function App() {
  // Theme state with initial value from system preference
  const [theme, setTheme] = useState<'dark' | 'light'>(getSystemThemePreference)
  
  // Update theme when system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    // Set initial theme
    updateThemeClass(getSystemThemePreference())
    
    // Add listener for changes
    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? 'dark' : 'light'
      setTheme(newTheme)
      updateThemeClass(newTheme)
    }
    
    // Modern browsers
    mediaQuery.addEventListener('change', handleChange)
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])
  
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
  const [newJob, setNewJob] = useState<NewJobFormData>(() => ({
    websiteUrl: '',
    analysisPrompt: '',
    frequency: 'daily',
    scheduledTime: (() => {
      const now = new Date()
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    })(),
    dayOfWeek: 'mon',
    notificationCriteria: ''
  }))
  
  // Store job intervals
  const intervals = useRef<Record<string, { interval: NodeJS.Timeout | null, timeout: NodeJS.Timeout | null }>>({})

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

  // Load tasks from storage and check for missed runs on startup
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const loadedTasks = await getAllTasks()
        setTasks(loadedTasks)
        
        // Check for missed runs for running tasks
        loadedTasks.forEach(task => {
          if (task.isRunning && checkForMissedRuns(task)) {
            runAnalysis(task)
          }
        })
      } catch (error) {
        console.error('Failed to load tasks:', error)
      }
    }
    
    loadTasks()
  }, [])

  // Request notification permission immediately on app launch
  useEffect(() => {
    const requestNotificationPermission = async () => {
      try {
        const permission = await Notification.requestPermission()
        setNotificationPermission(permission)
        if (permission === 'denied') {
          console.warn('Notification permission denied. Some features will be limited.')
        }
      } catch (error) {
        console.error('Error requesting notification permission:', error)
      }
    }
    requestNotificationPermission()
    
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

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(intervals.current).forEach(({ interval, timeout }) => {
        if (interval) clearInterval(interval)
        if (timeout) clearTimeout(timeout)
      })
    }
  }, [])

  const getNextRunTime = (task: Task) => {
    const [hours, minutes] = task.scheduledTime.split(':').map(Number)
    const now = new Date()
    const next = new Date()
    next.setHours(hours, minutes, 0, 0)

    if (task.frequency === 'hourly') {
      if (next <= now) {
        next.setHours(next.getHours() + 1);
      }
    } else if (task.frequency === 'daily') {
      if (next <= now) next.setDate(next.getDate() + 1)
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
    }

    return next
  }

  const scheduleTask = (task: Task) => {
    const nextRun = getNextRunTime(task)
    const delay = nextRun.getTime() - Date.now()

    if (intervals.current[task.id]?.timeout) {
      clearTimeout(intervals.current[task.id].timeout!)
    }

    const intervalTimes: Record<RecurringFrequency, number> = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000
    }

    intervals.current[task.id] = {
      interval: null,
      timeout: setTimeout(() => {
        runAnalysis(task)
        
        // Setup recurring interval
        const interval = setInterval(async () => {
          try {
            // Get the latest task data from storage
            const currentTask = await getTaskById(task.id)
            
            if (currentTask?.isRunning) {
              // Make sure our local state is updated with the latest task data
              setTasks(prevTasks => {
                const taskExists = prevTasks.some(t => t.id === currentTask.id)
                if (!taskExists) {
                  return [...prevTasks, currentTask]
                }
                return prevTasks.map(t => t.id === currentTask.id ? currentTask : t)
              })
              
              runAnalysis(currentTask)
            } else if (currentTask) {
              // Task exists but is not running
              clearInterval(interval)
              delete intervals.current[task.id]
              
              // Make sure our local state reflects that the task is not running
              setTasks(prevTasks => 
                prevTasks.map(t => t.id === currentTask.id ? currentTask : t)
              )
            } else {
              // Task doesn't exist anymore
              clearInterval(interval)
              delete intervals.current[task.id]
              
              // Remove the task from our local state if it's gone from storage
              setTasks(prevTasks => prevTasks.filter(t => t.id !== task.id))
            }
          } catch (error) {
            console.error(`Error in task interval for ${task.id}:`, error)
          }
        }, intervalTimes[task.frequency])
        
        intervals.current[task.id].interval = interval
      }, delay)
    }
  }

  const stopTask = async (taskId: string) => {
    if (intervals.current[taskId]) {
      if (intervals.current[taskId].interval) clearInterval(intervals.current[taskId].interval)
      if (intervals.current[taskId].timeout) clearTimeout(intervals.current[taskId].timeout)
      delete intervals.current[taskId]
    }

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
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    if (task.isRunning) {
      await stopTask(taskId)
    } else {
      try {
        await toggleTaskRunningState(taskId, true)
        setTasks(tasks.map(t => 
          t.id === taskId ? { ...t, isRunning: true } : t
        ))
        
        const updatedTask = { ...task, isRunning: true }
        scheduleTask(updatedTask)
      } catch (error) {
        console.error('Failed to start task:', error)
      }
    }
  }

  const removeTask = async (taskId: string) => {
    try {
      // First stop the task if it's running
      if (intervals.current[taskId]) {
        if (intervals.current[taskId].interval) clearInterval(intervals.current[taskId].interval)
        if (intervals.current[taskId].timeout) clearTimeout(intervals.current[taskId].timeout)
        delete intervals.current[taskId]
      }
      
      // Delete the task from storage
      await deleteTask(taskId)
      
      // Update local state *after* successful deletion
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId))
      
      // Clear form and reset editing mode
      resetNewJobForm()
      setEditingJobId(null)
      setShowNewJobForm(false)
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const resetNewJobForm = () => {
    setNewJob({
      websiteUrl: '',
      analysisPrompt: '',
      frequency: 'daily',
      scheduledTime: (() => {
        const now = new Date()
        return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
      })(),
      dayOfWeek: 'mon',
      notificationCriteria: ''
    });
    setTestResult(null);
    setEditingJobId(null);
  };
  
  // Clear test results when criteria changes since they're no longer valid
  useEffect(() => {
    if (editingJobId && testResult) {
      const task = tasks.find(t => t.id === editingJobId);
      // If we're editing a task and the criteria in form doesn't match task criteria 
      // and there are test results, clear them as they're no longer valid
      if (task && task.notificationCriteria !== newJob.notificationCriteria) {
        setTestResult(null);
      }
    }
  }, [newJob.notificationCriteria, editingJobId, testResult, tasks]);
  
  // Clean up any tasks that might have been deleted but still have timers
  useEffect(() => {
    // Get all currently valid task IDs
    const validTaskIds = new Set(tasks.map(task => task.id));
    
    // Clean up any timer for tasks that no longer exist
    Object.keys(intervals.current).forEach(taskId => {
      if (!validTaskIds.has(taskId)) {
        console.log(`Cleaning up timer for deleted task: ${taskId}`);
        if (intervals.current[taskId].interval) clearInterval(intervals.current[taskId].interval);
        if (intervals.current[taskId].timeout) clearTimeout(intervals.current[taskId].timeout);
        delete intervals.current[taskId];
      }
    });
  }, [tasks]);
  
  const startEditingTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Set form data from the existing task
    setNewJob({
      websiteUrl: task.websiteUrl,
      analysisPrompt: task.analysisPrompt,
      frequency: task.frequency,
      scheduledTime: task.scheduledTime,
      dayOfWeek: task.dayOfWeek || 'mon',
      notificationCriteria: task.notificationCriteria || ''
    });
    
    // Set editing mode, but make sure showNewJobForm is false
    // to prevent both forms from being visible
    setEditingJobId(taskId);
    setShowNewJobForm(false);
    
    // First check if there's a last test result available
    if (task.lastTestResult) {
      setTestResult({
        result: task.lastTestResult.result,
        matched: task.lastTestResult.matched,
        timestamp: task.lastTestResult.timestamp ? new Date(task.lastTestResult.timestamp) : undefined,
        screenshot: task.lastTestResult.screenshot
      });
    } 
    // If no test result, but there's a last scheduled run result, use that instead
    else if (task.lastResult) {
      setTestResult({
        result: task.lastResult,
        matched: task.lastMatchedCriteria,
        timestamp: task.lastRun,
        screenshot: undefined // We don't store screenshots for scheduled runs
      });
    } 
    else {
      // Clear any previous test results if no saved result exists
      setTestResult(null);
    }
  };
  
  const updateExistingTask = async (updatedTaskData: TaskFormData) => {
    if (!editingJobId) return;
    
    try {
      // Find the task being edited
      const task = tasks.find(t => t.id === editingJobId);
      if (!task) return;
      
      // Check if the task is currently running
      const wasRunning = task.isRunning;
      
      // If it was running, stop it first
      if (wasRunning) {
        await stopTask(editingJobId);
      }
      
      // Check if criteria changed
      const criteriaChanged = task.notificationCriteria !== updatedTaskData.notificationCriteria;
      
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
        lastTestResult: criteriaChanged ? undefined : task.lastTestResult
      };
      
      // Save to storage
      await updateTask(updatedTask);
      
      // Update local state
      setTasks(tasks.map(t => t.id === editingJobId ? updatedTask : t));
      
      // If it was running, restart it with the new settings
      if (wasRunning) {
        const freshTask = { ...updatedTask, isRunning: true };
        await toggleTaskRunningState(editingJobId, true);
        scheduleTask(freshTask);
      }
      
      // Clear form and editing mode
      setEditingJobId(null);
      resetNewJobForm();
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
      
      // Update local state
      setTasks([...tasks, newTask]);
      
      // Schedule the task
      scheduleTask(newTask);
      
      // Close form and reset
      setShowNewJobForm(false);
      resetNewJobForm();
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
      
      const title = `${domain} Matched Your Condition`;
      
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
    if (!apiKey) {
      setError('Please set your OpenAI API key in settings')
      return
    }
    
    // Validate API key
    const validation = validateApiKey(apiKey);
    if (!validation.isValid) {
      setError(validation.message || 'Invalid API key')
      return
    }

    try {
      setLoading(true)
      setError('')

      const { ipcRenderer } = window.require('electron')
      // Ensure URL has protocol prefix for the screenshot function
      const websiteUrl = (!task.websiteUrl.startsWith('http://') && !task.websiteUrl.startsWith('https://')) 
        ? `http://${task.websiteUrl}` 
        : task.websiteUrl
      const screenshot = await ipcRenderer.invoke('take-screenshot', websiteUrl)

      // Construct a focused prompt that directly evaluates the notification criteria
      const promptText = `Analyze this webpage and determine if the following condition is true: "${task.notificationCriteria}"

Return your response in this JSON format:
{
  "analysis": "A clear, concise summary of what you see on the page related to the condition",
  "criteriaMatched": true/false
}`;
      
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                {
                  type: "image_url",
                  image_url: {
                    url: screenshot,
                    detail: "high"
                  }
                }
              ]
            }
          ],
          max_tokens: 1000,
          temperature: 0.7,
          response_format: { type: "json_object" }
        })
      })

      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Failed to analyze website')
      }

      const data = await openaiResponse.json()
      const resultContent = data.choices[0].message.content
      
      let parsedResult;
      let criteriaMatched: boolean | undefined = undefined;
      
      try {
        parsedResult = JSON.parse(resultContent);
        criteriaMatched = parsedResult.criteriaMatched;
        
        // Format the result to just show the analysis
        const formattedResult = parsedResult.analysis;
        const now = new Date();
        
        // Create lastTestResult-compatible object for scheduled runs
        const resultData = {
          result: formattedResult,
          matched: criteriaMatched,
          timestamp: now.toISOString(),
          screenshot: screenshot
        };
        
        // Update the task with results
        const updatedTask = await updateTaskResults(task.id, {
          lastResult: formattedResult,
          lastRun: now,
          lastMatchedCriteria: criteriaMatched,
          lastTestResult: resultData
        });
        
        if (updatedTask) {
          // Update local state using functional update to avoid stale state
          setTasks(prevTasks => {
            // Double check the task still exists in our local state
            const taskExists = prevTasks.some(t => t.id === task.id)
            if (!taskExists) {
              // If it doesn't exist anymore, add it back
              return [...prevTasks, updatedTask]
            }
            // Otherwise update it
            return prevTasks.map(t => t.id === task.id ? updatedTask : t)
          });
          
          // Only send notification if criteria matched
          if (criteriaMatched === true) {
            sendNotification(updatedTask, parsedResult.analysis);
          }
        } else {
          // Log error if we couldn't update the task
          console.error(`Failed to update task results for ${task.id}`);
        }
      } catch (error) {
        console.error("Failed to parse response:", error);
        const now = new Date();
        const errorResult = `Error parsing response: ${resultContent.slice(0, 200)}...`;
        
        // Create error result data
        const errorResultData = {
          result: errorResult,
          timestamp: now.toISOString(),
          screenshot: screenshot
        };
        
        // Update task with error result
        const updatedTask = await updateTaskResults(task.id, {
          lastResult: errorResult,
          lastRun: now,
          lastTestResult: errorResultData
        });
        
        if (updatedTask) {
          // Update using functional update to avoid stale state
          setTasks(prevTasks => {
            const taskExists = prevTasks.some(t => t.id === task.id)
            if (!taskExists) {
              return [...prevTasks, updatedTask]
            }
            return prevTasks.map(t => t.id === task.id ? updatedTask : t)
          });
        } else {
          console.error(`Failed to update task error results for ${task.id}`);
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMessage);
      
      // Also save the error in the task's result
      const now = new Date();
      const errorResultData = {
        result: errorMessage,
        timestamp: now.toISOString()
      };
      
      // Update task with error
      const updatedTask = await updateTaskResults(task.id, {
        lastResult: errorMessage,
        lastRun: now,
        lastTestResult: errorResultData
      });
      
      if (updatedTask) {
        // Update using functional update to avoid stale state
        setTasks(prevTasks => {
          const taskExists = prevTasks.some(t => t.id === task.id)
          if (!taskExists) {
            return [...prevTasks, updatedTask]
          }
          return prevTasks.map(t => t.id === task.id ? updatedTask : t)
        });
      } else {
        console.error(`Failed to update task with global error for ${task.id}`);
      }
    } finally {
      setLoading(false);
    }
  }

  const testAnalysis = async (taskData: TaskFormData) => {
    setLoading(true)
    setTestResult(null)
    
    // Validate API key before testing
    if (!apiKey) {
      setError('Please set your OpenAI API key in settings')
      setLoading(false)
      return
    }
    
    // Validate API key format
    const validation = validateApiKey(apiKey);
    if (!validation.isValid) {
      setError(validation.message || 'Invalid API key')
      setLoading(false)
      return
    }
    
    try {
      const { ipcRenderer } = window.require('electron')
      // Ensure URL has protocol prefix for the screenshot function
      const websiteUrl = (!taskData.websiteUrl.startsWith('http://') && !taskData.websiteUrl.startsWith('https://')) 
        ? `http://${taskData.websiteUrl}` 
        : taskData.websiteUrl
      const screenshot = await ipcRenderer.invoke('take-screenshot', websiteUrl)
      
      const promptText = `Analyze this webpage and determine if the following condition is true: "${taskData.notificationCriteria}"

Return your response in this JSON format:
{
  "analysis": "A clear, concise summary of what you see on the page related to the condition",
  "criteriaMatched": true/false
}`;
      
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                {
                  type: "image_url",
                  image_url: {
                    url: screenshot,
                    detail: "high"
                  }
                }
              ]
            }
          ],
          max_tokens: 1000,
          temperature: 0.7,
          response_format: { type: "json_object" }
        })
      })

      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Failed to analyze website')
      }

      const data = await openaiResponse.json()
      const resultContent = data.choices[0].message.content
      
      try {
        const parsedResult = JSON.parse(resultContent);
        const criteriaMatched = parsedResult.criteriaMatched;
        
        // Format the result to just show the analysis
        const formattedResult = parsedResult.analysis;
        
        const now = new Date();
        const testResultData = {
          result: formattedResult,
          matched: criteriaMatched,
          timestamp: now.toISOString(),
          screenshot: screenshot
        };
        
        setTestResult({
          result: formattedResult,
          matched: criteriaMatched,
          timestamp: now,
          screenshot: screenshot
        });
        
        // If we're testing an existing task, update its lastRun timestamp and test results
        if (editingJobId) {
          const updatedTask = await updateTaskResults(editingJobId, {
            lastRun: now,
            lastTestResult: testResultData
          });
          
          if (updatedTask) {
            setTasks(tasks.map(t => t.id === editingJobId ? updatedTask : t));
          }
        }
      } catch (error) {
        console.error("Failed to parse response:", error);
        const errorResult = {
          result: `Error parsing response: ${resultContent.slice(0, 200)}...`,
          timestamp: new Date().toISOString()
        };
        
        setTestResult({
          result: errorResult.result,
          timestamp: new Date()
        });
        
        // Still save the error result if editing an existing task
        if (editingJobId) {
          const updatedTask = await updateTaskResults(editingJobId, {
            lastTestResult: errorResult
          });
          
          if (updatedTask) {
            setTasks(tasks.map(t => t.id === editingJobId ? updatedTask : t));
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMessage);
      const errorResult = {
        result: errorMessage,
        timestamp: new Date().toISOString()
      };
      
      setTestResult({
        result: errorMessage,
        timestamp: new Date()
      });
      
      // Save error result if editing an existing task
      if (editingJobId) {
        const updatedTask = await updateTaskResults(editingJobId, {
          lastTestResult: errorResult
        });
        
        if (updatedTask) {
          setTasks(tasks.map(t => t.id === editingJobId ? updatedTask : t));
        }
      }
    } finally {
      setLoading(false)
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
                setShowNewJobForm(false);
                resetNewJobForm();
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
              <div className="flex flex-col items-center justify-center py-10 text-center px-6 animate-in">
                <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-8">
                  <div className="relative">
                    <Eye size={36} className="text-primary/30" />
                    <div className="absolute w-3.5 h-3.5 rounded-full shadow-[0_0_6px_rgba(0,185,246,0.7)]" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', borderWidth: '2.5px', borderStyle: 'solid', borderColor: '#00B9F6' }}></div>
                  </div>
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
                      <div className="bg-card p-4 text-left flex items-start border-b">
                        <ShoppingBag size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">Price Drops</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            e.g. price goes below certain target
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-card p-4 text-left flex items-start border-b">
                        <Ticket size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">Back in Stock</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            e.g. concert tickets become available
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-card p-4 text-left flex items-start">
                        <Briefcase size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">New Content</div>
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
                            analysisPrompt: 'Analyze this webpage to determine if the product price has dropped below the target price.'
                          }));
                          setShowNewJobForm(true);
                        }}
                        className="w-full bg-card p-4 hover:bg-muted/30 transition-colors text-left flex items-start border-b"
                      >
                        <ShoppingBag size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">Price Drops</div>
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
                            analysisPrompt: 'Analyze this webpage to determine if concert tickets are available for purchase.'
                          }));
                          setShowNewJobForm(true);
                        }}
                        className="w-full bg-card p-4 hover:bg-muted/30 transition-colors text-left flex items-start border-b"
                      >
                        <Ticket size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">Back in Stock</div>
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
                            analysisPrompt: 'Analyze this webpage to determine if new job listings have appeared.'
                          }));
                          setShowNewJobForm(true);
                        }}
                        className="w-full bg-card p-4 hover:bg-muted/30 transition-colors text-left flex items-start"
                      >
                        <Briefcase size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">New Content</div>
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
                  <div className="px-8 pt-6 space-y-6">
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
                                : validateApiKey(apiKey).message}
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
                    
                    <Separator />
                    
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
                    
                    <Separator />
                    
                    <fieldset className="space-y-3">
                      <legend className="text-sm font-medium">Appearance</legend>
                      <div className="text-sm text-muted-foreground mb-2">
                        Dark mode follows your system settings automatically
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background">
                          {theme === 'dark' ? (
                            <Moon size={20} weight="fill" className="text-foreground" />
                          ) : (
                            <Sun size={20} weight="fill" className="text-foreground" />
                          )}
                        </div>
                        <div className="text-sm">
                          {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                        </div>
                      </div>
                    </fieldset>
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
                            
                            // Start all tasks when adding a new API key
                            setTimeout(async () => {
                              const updatedTasks = await Promise.all(
                                tasks.map(async task => {
                                  // Clear any existing interval for this task
                                  if (intervals.current[task.id]) {
                                    if (intervals.current[task.id].interval) {
                                      clearInterval(intervals.current[task.id].interval);
                                    }
                                    if (intervals.current[task.id].timeout) {
                                      clearTimeout(intervals.current[task.id].timeout);
                                    }
                                  }
                                  
                                  // Update the task to be running
                                  const updatedTask = await toggleTaskRunningState(task.id, true);
                                  if (updatedTask) {
                                    // Schedule the task to run
                                    scheduleTask(updatedTask);
                                    return updatedTask;
                                  }
                                  return task;
                                })
                              );
                              setTasks(updatedTasks);
                            }, 50);
                          }
                        } catch (error) {
                          console.error('Failed to save/delete API key:', error);
                          setError('Failed to save API key settings');
                        }
                        
                        setSettingsView(false)
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
                              <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${task.lastMatchedCriteria 
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
                            
                            {task.lastMatchedCriteria ? (
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