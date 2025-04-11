import { useState, useEffect, useRef, useMemo } from 'react'
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
import { AnalysisService } from './lib/services/analysis'
import { useUpdates } from './hooks/useUpdates'
import { useStore } from './lib/stores/useStore'

type NewJobFormData = JobFormData

function App() {
  const { theme } = useTheme()
  const { 
    updateAvailable,
    updateDownloaded,
    checkingForUpdate,
    checkForUpdates,
    installUpdate
  } = useUpdates()
  
  // Get state and actions from our store
  const {
    apiKey,
    hasExistingKey,
    settings,
    tempSettings,
    tasks,
    settingsView,
    showNewJobForm,
    editingJobId,
    loading,
    error,
    testResult,
    newJob,
    setApiKey,
    setHasExistingKey,
    setSettings,
    setTempSettings,
    setTasks,
    setSettingsView,
    setShowNewJobForm,
    setEditingJobId,
    setLoading,
    setError,
    setTestResult,
    setNewJob,
    resetNewJobForm
  } = useStore()

  // Wrap with TooltipProvider at the app level for all tooltips
  const appWithTooltips = (appContent: React.ReactNode) => (
    <TooltipProvider delayDuration={1}>
      {appContent}
    </TooltipProvider>
  )

  const [windowIsFloating, setWindowIsFloating] = useState<boolean>(() => 
    !!localStorage.getItem('windowFloating')
  )
  
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [llamaModelStatus, setLlamaModelStatus] = useState<{ installed: boolean; hasModel: boolean } | null>(null)
  const [checkingLlamaModel, setCheckingLlamaModel] = useState(false)
  const [copyStatus, setCopyStatus] = useState(false)
  const [previousLlamaStatus, setPreviousLlamaStatus] = useState<{ installed: boolean; hasModel: boolean } | null>(null)

  // Initialize analysis service
  const analysisService = useMemo(() => new AnalysisService(apiKey), [apiKey])

  // Add keyboard shortcut handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle cmd+, for settings
      if (e.key === ',' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSettingsView(true);
        return;
      }

      // Handle cmd+n for new task
      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (apiKey) { // Only allow new task if API key is set
          setShowNewJobForm(true);
        }
        return;
      }

      // Handle escape key
      if (e.key === 'Escape') {
        e.preventDefault();
        
        if (settingsView) {
          // Revert settings to their saved state when pressing back
          setSettings(tempSettings);
          setSettingsView(false);
        } else if (!showNewJobForm && !editingJobId) {
          // Close window when on tasks list or welcome screen
          try {
            const electron = window.require('electron');
            electron.ipcRenderer.send('close-window');
          } catch (error) {
            // Silent fail if electron is not available in dev mode
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [apiKey, setSettingsView, setShowNewJobForm, settingsView, setSettings, tempSettings, showNewJobForm, editingJobId]);

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
    try {
      await analysisService.runAnalysis(task, settings)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An unknown error occurred')
    }
  }

  // Initialize task management hook
  const { 
    toggleTaskState, 
    removeTask, 
    createNewTask, 
    updateExistingTask, 
    stopTask, 
    checkTasksToRun 
  } = useTaskManagement(runAnalysis)

  // Track settings view for telemetry
  useEffect(() => {
    if (settingsView) {
      // No longer tracking settings opened
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
  
  useEffect(() => {
    // Always trigger the transition state when any view changes
    setIsTransitioning(true)
    // Remove transitioning class after animation completes to allow normal scrolling
    const timer = setTimeout(() => {
      setIsTransitioning(false)
    }, 250) // Animation duration (200ms) + small buffer
    
    return () => clearTimeout(timer)
  }, [showNewJobForm, editingJobId, settingsView])

  // Add effect to handle window focus
  useEffect(() => {
    try {
      const electron = window.require('electron');
      
      // Listen for window focus events
      electron.ipcRenderer.on('window-focus', () => {
        // Re-apply temporary floating state when window regains focus
        if (showNewJobForm || editingJobId) {
          electron.ipcRenderer.send('set-temporary-floating', true);
        }
      });
      
      return () => {
        electron.ipcRenderer.removeAllListeners('window-focus');
      };
    } catch (error) {
      // Silent fail if electron is not available in dev mode
    }
  }, [showNewJobForm, editingJobId]);

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

    // Check model status when Llama is selected or when in settings view
    if (settings.visionProvider === 'llama' || settingsView) {
      checkModel()
      
      // Set up polling if model is not fully ready (either not installed or model not available)
      if (!llamaModelStatus?.installed || !llamaModelStatus?.hasModel) {
        const pollInterval = setInterval(() => {
          checkModel()
        }, 5000) // Check every 5 seconds
        
        // Clean up interval when component unmounts or conditions change
        return () => clearInterval(pollInterval)
      }
    } else {
      setLlamaModelStatus(null)
    }
  }, [settings.visionProvider, llamaModelStatus?.installed, llamaModelStatus?.hasModel, settingsView])

  // Update previous status when Llama status changes
  useEffect(() => {
    if (settings.visionProvider === 'llama') {
      setPreviousLlamaStatus(llamaModelStatus)
    } else {
      setPreviousLlamaStatus(null)
    }
  }, [settings.visionProvider, llamaModelStatus])

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

  const startEditingTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      setNewJob({
        websiteUrl: task.websiteUrl,
        notificationCriteria: task.notificationCriteria,
        analysisPrompt: task.analysisPrompt,
        frequency: task.frequency,
        scheduledTime: task.scheduledTime,
        dayOfWeek: task.dayOfWeek,
        visionProvider: settings.visionProvider
      })
      setEditingJobId(taskId)
      setTestResult(null) // Clear any existing test result when switching tasks
    }
  }

  const testAnalysis = async (taskData: JobFormData) => {
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

  const syncTasks = async () => {
    const loadedTasks = await getAllTasks();
    setTasks(loadedTasks);
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
          // Reset the new job form
          resetNewJobForm();
        }}
        onSettings={() => setSettingsView(true)}
        onNewTask={() => {
          resetNewJobForm(); // Reset the form data
          setTestResult(null); // Clear any existing test results
          setShowNewJobForm(true); // Show the new task form
        }}
        onDeleteTask={(taskId) => {
          removeTask(taskId).then(() => {
            setEditingJobId(null);
          });
        }}
      />

      {/* Main content */}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden flex flex-col relative bg-background ${isTransitioning ? 'overflow-hidden' : ''}`}>
        <div className="w-full space-y-6 flex-grow flex flex-col">

          {/* Tasks List */}
          <div className="space-y-4">
            {!showNewJobForm && !editingJobId && !settingsView && (
              <>
                {/* Show WelcomeView when there are no tasks, regardless of AI configuration */}
                {tasks.length === 0 && (
                  <WelcomeView
                    apiKey={apiKey}
                    settingsView={settingsView}
                    setSettingsView={setSettingsView}
                    setShowNewJobForm={setShowNewJobForm}
                    setNewJob={setNewJob}
                    setTestResult={setTestResult}
                    settings={settings}
                    updateAvailable={updateAvailable}
                    updateDownloaded={updateDownloaded}
                    checkingForUpdate={checkingForUpdate}
                    checkForUpdates={checkForUpdates}
                    installUpdate={installUpdate}
                    llamaModelStatus={llamaModelStatus}
                  />
                )}

                {/* Show TaskList when there are tasks */}
                {tasks.length > 0 && (
                  <TaskList
                    tasks={tasks}
                    onTaskClick={async (taskId) => {
                      // Refresh tasks before starting edit
                      await syncTasks();
                      startEditingTask(taskId);
                    }}
                  />
                )}
              </>
            )}

            {/* When in edit mode or creating a new task, only show that form */}
            {editingJobId && tasks.find(task => task.id === editingJobId) ? (
              <TaskForm
                formData={newJob}
                testResult={testResult}
                loading={loading}
                onFormChange={setNewJob}
                onTest={testAnalysis}
                onSave={async (data) => {
                  if (data.websiteUrl && data.notificationCriteria) {
                    await updateExistingTask(editingJobId, data);
                    // Refresh tasks after update
                    await syncTasks();
                    setEditingJobId(null); // Clear editing mode
                    resetNewJobForm(); // Reset the form
                  }
                }}
                onBack={async () => {
                  // Refresh tasks before going back
                  await syncTasks();
                  setEditingJobId(null); // Clear editing mode
                  resetNewJobForm(); // Reset the form
                }}
                task={tasks.find(task => task.id === editingJobId)}
              />
            ) : !showNewJobForm && settingsView ? (
              <SettingsView
                settings={settings}
                tempSettings={tempSettings}
                apiKey={apiKey}
                hasExistingKey={hasExistingKey}
                error={error}
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
                  // Reset the new job form
                  resetNewJobForm();
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
              />
            ) : null }

            {/* New Task Form (only shown when not editing any task) */}
            {showNewJobForm && !editingJobId && (
              <TaskForm
                formData={newJob}
                testResult={testResult}
                loading={loading}
                onFormChange={setNewJob}
                onTest={testAnalysis}
                onSave={async (data) => {
                  if (data.websiteUrl && data.notificationCriteria) {
                    await createNewTask(data, testResult);
                    // Refresh tasks after creation
                    await syncTasks();
                    // First reset the form
                    resetNewJobForm();
                    // Then hide the form
                    setShowNewJobForm(false);
                    // Clear any editing mode
                    setEditingJobId(null);
                  }
                }}
                onBack={async () => {
                  // Refresh tasks before going back
                  await syncTasks();
                  setShowNewJobForm(false);
                  resetNewJobForm();
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