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
import { Header } from './components/Header'
import { SettingsView } from './components/SettingsView'
import { WelcomeView } from './components/WelcomeView'
import { TaskList } from './components/TaskList'
import { useTaskManagement } from './hooks/useTaskManagement'

type NewJobFormData = JobFormData

function App() {
  const { theme } = useTheme()
  
  // Wrap with TooltipProvider at the app level for all tooltips
  const appWithTooltips = (appContent: React.ReactNode) => (
    <TooltipProvider delayDuration={1}>
      {appContent}
    </TooltipProvider>
  )

  // State declarations
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
  
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [checkingForUpdate, setCheckingForUpdate] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [llamaModelStatus, setLlamaModelStatus] = useState<{ installed: boolean; hasModel: boolean } | null>(null)
  const [checkingLlamaModel, setCheckingLlamaModel] = useState(false)
  const [copyStatus, setCopyStatus] = useState(false)

  // Load API key on app start
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const electron = window.require('electron')
        const storedApiKey = await electron.ipcRenderer.invoke('get-api-key')
        if (storedApiKey) {
          setApiKey(storedApiKey)
          setHasExistingKey(true)
        }
      } catch (error) {
        console.error('Failed to load API key:', error)
      }
    }
    
    loadApiKey()
  }, [])

  // Define runAnalysis function before using it in the hook
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

  // Initialize task management hook
  const { 
    tasks, 
    setTasks, 
    toggleTaskState, 
    removeTask, 
    createNewTask, 
    updateExistingTask, 
    stopTask, 
    checkTasksToRun 
  } = useTaskManagement(runAnalysis)

  // Update newJob when visionProvider changes
  useEffect(() => {
    setNewJob(prev => ({
      ...prev,
      visionProvider: settings.visionProvider
    }));
  }, [settings.visionProvider]);
  
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

  return appWithTooltips(
    <div className="flex flex-col h-full w-full">
      <Header
        showNewJobForm={showNewJobForm}
        editingJobId={editingJobId}
        settingsView={settingsView}
        apiKey={apiKey}
        onBack={() => {
          // Revert settings to their saved state when pressing back
          setSettings(tempSettings)
          setShowNewJobForm(false);
          setEditingJobId(null); // Clear editing mode
          setSettingsView(false);
        }}
        onSettings={() => setSettingsView(true)}
        onNewTask={() => setShowNewJobForm(true)}
        onDeleteTask={removeTask}
      />

      {/* Main content */}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden flex flex-col relative bg-background ${isTransitioning ? 'overflow-hidden' : ''}`}>
        <div className="w-full space-y-6 flex-grow flex flex-col">

          {/* Tasks List */}
          <div className="space-y-4">
            {(!apiKey || tasks.length === 0) && !showNewJobForm && !editingJobId && !settingsView && (
              <WelcomeView
                apiKey={apiKey}
                settingsView={settingsView}
                setSettingsView={setSettingsView}
                setShowNewJobForm={setShowNewJobForm}
                setNewJob={setNewJob}
                settings={settings}
                updateAvailable={updateAvailable}
                updateDownloaded={updateDownloaded}
                checkingForUpdate={checkingForUpdate}
                checkForUpdates={checkForUpdates}
                installUpdate={installUpdate}
              />
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
                    updateExistingTask(editingJobId, data);
                  }
                }}
              />
            ) : !showNewJobForm && settingsView ? (
              <SettingsView
                settings={settings}
                tempSettings={tempSettings}
                apiKey={apiKey}
                hasExistingKey={hasExistingKey}
                error={error}
                updateAvailable={updateAvailable}
                updateDownloaded={updateDownloaded}
                checkingForUpdate={checkingForUpdate}
                updateError={updateError}
                windowIsFloating={windowIsFloating}
                llamaModelStatus={llamaModelStatus}
                checkingLlamaModel={checkingLlamaModel}
                copyStatus={copyStatus}
                onSave={async () => {
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
                onBack={() => {
                  // Revert settings to their saved state when pressing back
                  setSettings(tempSettings)
                  setShowNewJobForm(false);
                  setEditingJobId(null); // Clear editing mode
                  setSettingsView(false);
                }}
                onApiKeyChange={(key) => setApiKey(key)}
                onSettingsChange={(newSettings) => setSettings(newSettings)}
                onWindowFloatingChange={(floating) => {
                  setWindowIsFloating(floating);
                  if (floating) {
                    localStorage.setItem('windowFloating', 'true');
                  } else {
                    localStorage.removeItem('windowFloating');
                  }
                  signals.toggleWindowFloating(floating);
                  try {
                    const electron = window.require('electron');
                    electron.ipcRenderer.send('toggle-window-floating', floating);
                  } catch (error) {
                    setError('Could not update window settings');
                    setWindowIsFloating(!floating);
                  }
                }}
                onCopyCommand={handleCopyCommand}
                onCheckUpdates={checkForUpdates}
                onInstallUpdate={installUpdate}
              />
            ) : !showNewJobForm && apiKey ? (
              // When not in edit mode, settings, or creating new task, and API key exists, show tasks list
              tasks.length > 0 && (
                <TaskList
                  tasks={tasks}
                  onTaskClick={startEditingTask}
                />
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
                    createNewTask(data, testResult);
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