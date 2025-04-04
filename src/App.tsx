import { useState, useEffect, useRef, ChangeEvent } from 'react'
import confetti from 'canvas-confetti'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card'
import { Separator } from './components/ui/separator'
import { Checkbox } from './components/ui/checkbox'
import { validateApiKey, validateUrl } from './lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { TimeInput } from './components/ui/time-input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import { 
  Gear, 
  Plus, 
  Robot,
  ShoppingBag, 
  Ticket, 
  Briefcase, 
  Bell, 
  CheckCircle, 
  XCircle, 
  WarningCircle,
  Trash,
  SpinnerGap,
  CaretLeft,
  CaretRight
} from '@phosphor-icons/react'
import './App.css'

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

type RecurringFrequency = 'hourly' | 'daily' | 'weekly'

interface AnalysisJob {
  id: string
  websiteUrl: string
  analysisPrompt: string
  frequency: RecurringFrequency
  scheduledTime: string
  isRunning: boolean
  lastResult?: string
  lastRun?: Date
  notificationCriteria?: string
  lastMatchedCriteria?: boolean
}

type NewJobFormData = Omit<AnalysisJob, 'id' | 'isRunning' | 'lastResult' | 'lastRun' | 'lastMatchedCriteria'>

// Add type for the job form
interface JobForm {
  websiteUrl: string;
  notificationCriteria: string;
  frequency: RecurringFrequency;
  scheduledTime: string;
  analysisPrompt: string;
}

function App() {
  // Wrap with TooltipProvider at the app level for all tooltips
  const appWithTooltips = (appContent: React.ReactNode) => (
    <TooltipProvider delayDuration={1}>
      {appContent}
    </TooltipProvider>
  )
  const [jobs, setJobs] = useState<AnalysisJob[]>(() => {
    const savedJobs = localStorage.getItem('analysisJobs')
    return savedJobs ? JSON.parse(savedJobs) : []
  })
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '')
  const [settingsView, setSettingsView] = useState(false)
  const [showNewJobForm, setShowNewJobForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission)
  const [testResult, setTestResult] = useState<{result: string, matched?: boolean, timestamp?: Date} | null>(null)
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [windowIsFloating, setWindowIsFloating] = useState<boolean>(() => 
    !!localStorage.getItem('windowFloating')
  )
  const [temporaryFloating, setTemporaryFloating] = useState<boolean>(false)
  const [newJob, setNewJob] = useState<NewJobFormData>(() => ({
    websiteUrl: '',
    analysisPrompt: '',
    frequency: 'daily',
    scheduledTime: (() => {
      const now = new Date()
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    })(),
    notificationCriteria: ''
  }))
  const [urlError, setUrlError] = useState<string | null>(null)
  
  // Store job intervals
  const intervals = useRef<Record<string, { interval: NodeJS.Timeout | null, timeout: NodeJS.Timeout | null }>>({})

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
      electron.ipcRenderer.on('temporary-floating-updated', (_event: any, value: boolean) => {
        setTemporaryFloating(value);
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

  // Save jobs to localStorage
  useEffect(() => {
    localStorage.setItem('analysisJobs', JSON.stringify(jobs))
  }, [jobs])

  // Save API key to localStorage - only when explicitly saved via the Save button
  // We DON'T want to automatically save on every apiKey state change
  // This is handled manually in the settings save button click handler
  
  // Handle view transitions by managing the mac-transitioning class
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

  const getNextRunTime = (job: AnalysisJob) => {
    const [hours, minutes] = job.scheduledTime.split(':').map(Number)
    const now = new Date()
    const next = new Date()
    next.setHours(hours, minutes, 0, 0)

    if (job.frequency === 'hourly') {
      if (next <= now) next.setHours(next.getHours() + 1)
    } else if (job.frequency === 'daily') {
      if (next <= now) next.setDate(next.getDate() + 1)
    } else if (job.frequency === 'weekly') {
      if (next <= now) next.setDate(next.getDate() + 7)
    }

    return next
  }

  const scheduleJob = (job: AnalysisJob) => {
    const nextRun = getNextRunTime(job)
    const delay = nextRun.getTime() - Date.now()

    if (intervals.current[job.id]?.timeout) {
      clearTimeout(intervals.current[job.id].timeout!)
    }

    const intervalTimes: Record<RecurringFrequency, number> = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000
    }

    intervals.current[job.id] = {
      interval: null,
      timeout: setTimeout(() => {
        runAnalysis(job)
        
        const interval = setInterval(() => runAnalysis(job), intervalTimes[job.frequency])
        intervals.current[job.id].interval = interval
      }, delay)
    }
  }

  const stopJob = (jobId: string) => {
    if (intervals.current[jobId]) {
      if (intervals.current[jobId].interval) clearInterval(intervals.current[jobId].interval)
      if (intervals.current[jobId].timeout) clearTimeout(intervals.current[jobId].timeout)
      delete intervals.current[jobId]
    }

    setJobs(jobs.map(job => 
      job.id === jobId ? { ...job, isRunning: false } : job
    ))
  }

  const toggleJob = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return

    if (job.isRunning) {
      stopJob(jobId)
    } else {
      setJobs(jobs.map(j => 
        j.id === jobId ? { ...j, isRunning: true } : j
      ))
      scheduleJob(job)
    }
  }

  const deleteJob = (jobId: string) => {
    stopJob(jobId)
    
    // Update the jobs array
    const updatedJobs = jobs.filter(job => job.id !== jobId)
    setJobs(updatedJobs)
    
    // If we're deleting the last job, or the job we're currently editing,
    // exit edit mode to show the empty state
    if (updatedJobs.length === 0 || jobId === editingJobId) {
      resetNewJobForm()
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
      notificationCriteria: ''
    });
    setTestResult(null);
    setEditingJobId(null);
    setUrlError(null);
  };
  
  const startEditingJob = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    
    // Set form data from the existing job
    setNewJob({
      websiteUrl: job.websiteUrl,
      analysisPrompt: job.analysisPrompt,
      frequency: job.frequency,
      scheduledTime: job.scheduledTime,
      notificationCriteria: job.notificationCriteria || ''
    });
    
    // Set editing mode, but make sure showNewJobForm is false
    // to prevent both forms from being visible
    setEditingJobId(jobId);
    setShowNewJobForm(false);
    
    // Clear any previous test results
    setTestResult(null);
  };
  
  const updateJob = (updatedJob: NewJobFormData) => {
    if (!editingJobId) return;
    
    // Validate URL before updating the job
    const urlValidation = validateUrl(updatedJob.websiteUrl);
    if (!urlValidation.isValid) {
      setUrlError(urlValidation.message || 'Invalid URL');
      return;
    }
    
    // Find the job being edited
    const job = jobs.find(j => j.id === editingJobId);
    if (!job) return;
    
    // Check if the job is currently running
    const wasRunning = job.isRunning;
    
    // If it was running, stop it first
    if (wasRunning) {
      stopJob(editingJobId);
    }
    
    // Update the job with new data
    const updatedJobs = jobs.map(j => 
      j.id === editingJobId 
        ? { 
            ...j, 
            websiteUrl: updatedJob.websiteUrl,
            analysisPrompt: updatedJob.analysisPrompt,
            frequency: updatedJob.frequency,
            scheduledTime: updatedJob.scheduledTime,
            notificationCriteria: updatedJob.notificationCriteria 
          } 
        : j
    );
    
    setJobs(updatedJobs);
    
    // If it was running, restart it with the new settings
    if (wasRunning) {
      const updatedJob = updatedJobs.find(j => j.id === editingJobId);
      if (updatedJob) {
        scheduleJob(updatedJob);
      }
    }
    
    // Clear form and editing mode
    setEditingJobId(null);
    resetNewJobForm();
  };
  
  const addJob = (job: Omit<AnalysisJob, 'id' | 'isRunning' | 'lastResult' | 'lastRun'>) => {
    // Validate URL before adding the job
    const urlValidation = validateUrl(job.websiteUrl);
    if (!urlValidation.isValid) {
      setUrlError(urlValidation.message || 'Invalid URL');
      return;
    }
    
    const newJob: AnalysisJob = {
      ...job,
      id: crypto.randomUUID(),
      isRunning: true // Set to true by default
    }
    
    // Add job to state
    const updatedJobs = [...jobs, newJob];
    setJobs(updatedJobs)
    
    // Schedule the job to run
    scheduleJob(newJob)
    
    // Close form and reset
    setShowNewJobForm(false)
    resetNewJobForm()
  }

  const sendNotification = (job: AnalysisJob, analysis: string) => {
    if (notificationPermission === 'granted') {
      const title = `Alert: ${job.websiteUrl}`;
      
      // Create a notification body that includes the condition and analysis
      let body = `Condition met: "${job.notificationCriteria}"`;
      
      if (analysis) {
        const briefAnalysis = analysis.length > 100 ? analysis.slice(0, 100) + '...' : analysis;
        body += `\n\n${briefAnalysis}`;
      }
      
      const notification = new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        requireInteraction: true,
        silent: false,
        tag: `analysis-${job.id}`
      })

      notification.onclick = () => {
        const { ipcRenderer } = window.require('electron')
        ipcRenderer.send('focus-window')
        notification.close()
      }
    }
  }

  const runAnalysis = async (job: AnalysisJob) => {
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
      const screenshot = await ipcRenderer.invoke('take-screenshot', job.websiteUrl)

      // Construct a focused prompt that directly evaluates the notification criteria
      const promptText = `Analyze this webpage and determine if the following condition is true: "${job.notificationCriteria}"

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
        
        // Format the result to display simplified information
        const formattedResult = [
          `${parsedResult.analysis}`,
          '',
          criteriaMatched ? '✅ Condition matched!' : '❌ Condition not matched'
        ].join('\n');
        
        setJobs(jobs.map(j => 
          j.id === job.id 
            ? { 
                ...j, 
                lastResult: formattedResult,
                lastRun: new Date(),
                lastMatchedCriteria: criteriaMatched
              }
            : j
        ));
        
        // Only send notification if criteria matched
        if (criteriaMatched === true) {
          sendNotification(job, parsedResult.analysis);
        }
      } catch (error) {
        console.error("Failed to parse response:", error);
        setJobs(jobs.map(j => 
          j.id === job.id 
            ? { 
                ...j, 
                lastResult: `Error parsing response: ${resultContent.slice(0, 200)}...`,
                lastRun: new Date()
              }
            : j
        ));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
      stopJob(job.id)
    } finally {
      setLoading(false)
    }
  }

  const testJob = async (job: NewJobFormData) => {
    setLoading(true)
    setTestResult(null)
    
    // Validate URL before testing
    const urlValidation = validateUrl(job.websiteUrl);
    if (!urlValidation.isValid) {
      setUrlError(urlValidation.message || 'Invalid URL');
      setLoading(false);
      return;
    }
    
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
    
    const testJobData: AnalysisJob = {
      ...job,
      id: 'test',
      isRunning: false
    }
    
    try {
      // Create a modified version of runAnalysis that returns the result instead of updating jobs
      const { ipcRenderer } = window.require('electron')
      const screenshot = await ipcRenderer.invoke('take-screenshot', job.websiteUrl)
      
      const promptText = `Analyze this webpage and determine if the following condition is true: "${job.notificationCriteria}"

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
        
        // Format the result to display simplified information
        const formattedResult = [
          `${parsedResult.analysis}`,
          '',
          criteriaMatched ? '✅ Condition matched!' : '❌ Condition not matched'
        ].join('\n');
        
        const now = new Date();
        setTestResult({
          result: formattedResult,
          matched: criteriaMatched,
          timestamp: now
        });
        
        // If we're testing an existing job, update its lastRun timestamp too
        if (editingJobId) {
          setJobs(jobs.map(j => 
            j.id === editingJobId 
              ? { ...j, lastRun: now }
              : j
          ));
        }
      } catch (error) {
        console.error("Failed to parse response:", error);
        setTestResult({
          result: `Error parsing response: ${resultContent.slice(0, 200)}...`
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setTestResult({
        result: err instanceof Error ? err.message : 'An unknown error occurred'
      });
    } finally {
      setLoading(false)
    }
  }

  return appWithTooltips(
    <div className="mac-window">
      {/* Titlebar - macOS style */}
      <div className="mac-toolbar">
        <div style={{ width: "40px", height: "100%" }}>
          {(showNewJobForm || editingJobId || settingsView) ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowNewJobForm(false);
                resetNewJobForm();
                setSettingsView(false);
              }}
              title="Back"
            >
              <CaretLeft size={16} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsView(true)}
              title="Settings"
            >
              <Gear size={16} />
            </Button>
          )}
        </div>
        
        <div className="mac-toolbar-title text-muted-foreground/60">
          {(showNewJobForm || editingJobId) ? 
            (editingJobId ? 'Edit Task' : 'New Task') : 
            (settingsView ? 'Settings' : 'Scout')}
        </div>
        
        <div style={{ width: "40px", height: "100%" }}>
          {!showNewJobForm && !editingJobId && !settingsView ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => apiKey ? setShowNewJobForm(true) : setSettingsView(true)}
              title={apiKey ? "New Task" : "Add API Key"}
            >
              {apiKey ? <Plus size={16} /> : <Plus size={16} />}
            </Button>
          ) : settingsView ? (
            <div></div> // Empty div to maintain layout
          ) : null}
        </div>
      </div>


      {/* Main content */}
      <div className={`mac-content ${isTransitioning ? 'mac-transitioning' : ''}`}>
        <div className="w-full space-y-6 flex-grow flex flex-col">

          {/* Jobs List */}
          <div className="space-y-4">
            {jobs.length === 0 && !showNewJobForm && !editingJobId && !settingsView && (
              <div className="flex flex-col items-center justify-center py-8 text-center px-8 mac-animate-in">
                <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-6">
                  <Robot size={36} className="text-primary/60" />
                </div>
                {!apiKey ? (
                  <>
                    <h3 className="text-lg font-medium mb-2">Welcome to Scout!</h3>
                    <div className="max-w-xl mx-auto mb-6">
                      <p className="text-muted-foreground text-sm text-center">
                        Scout uses AI vision to analyze websites and notify you of changes. Add your OpenAI API key to get started.
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-left mb-8 w-full">
                      <div className="bg-background border p-4 rounded-lg opacity-70 text-left flex items-start -webkit-app-region-no-drag shadow-sm">
                        <ShoppingBag size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">Price Drops</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            e.g. price goes below certain target
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-background border p-4 rounded-lg opacity-70 text-left flex items-start -webkit-app-region-no-drag shadow-sm">
                        <Ticket size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">Back in Stock</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            e.g. concert tickets become available
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-background border p-4 rounded-lg opacity-70 text-left flex items-start -webkit-app-region-no-drag shadow-sm">
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-left mb-8 w-full">
                      <button 
                        onClick={() => {
                          setNewJob(prev => ({
                            ...prev,
                            notificationCriteria: 'product price drops below target price',
                            analysisPrompt: 'Analyze this webpage to determine if the product price has dropped below the target price.'
                          }));
                          setShowNewJobForm(true);
                        }}
                        className="bg-background border p-4 rounded-lg hover:bg-muted/30 transition-colors text-left flex items-start -webkit-app-region-no-drag shadow-sm"
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
                        className="bg-background border p-4 rounded-lg hover:bg-muted/30 transition-colors text-left flex items-start -webkit-app-region-no-drag shadow-sm"
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
                        className="bg-background border p-4 rounded-lg hover:bg-muted/30 transition-colors text-left flex items-start -webkit-app-region-no-drag shadow-sm"
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

            {/* When in edit mode or creating a new job, only show that form */}
            {editingJobId && jobs.find(job => job.id === editingJobId) ? (
              <div className="flex flex-col h-full min-h-[calc(100vh-3rem)]">
                <div className="flex-1 overflow-auto">
                  <div className="space-y-6 px-8 pt-6">
                    <div>
                      <label className="text-sm font-medium mb-2 block">URL to Monitor</label>
                      <Input
                        type="url"
                        value={newJob.websiteUrl}
                        placeholder="https://example.com"
                        className={`h-9 ${urlError ? 'border-destructive' : ''}`}
                        autoFocus
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const url = e.target.value;
                          setNewJob(prev => ({ ...prev, websiteUrl: url }));
                          
                          // Clear error when user is typing
                          if (urlError) setUrlError(null);
                        }}
                        onBlur={() => {
                          if (newJob.websiteUrl) {
                            const validation = validateUrl(newJob.websiteUrl);
                            if (!validation.isValid) {
                              setUrlError(validation.message || 'Invalid URL');
                            } else {
                              setUrlError(null);
                            }
                          }
                        }}
                      />
                      {urlError && (
                        <div className="mt-2 rounded-md px-3 py-1.5 bg-destructive/10 border border-destructive/20 dark:bg-destructive/20">
                          <p className="text-[0.8rem] font-medium text-destructive dark:text-destructive-foreground flex items-center">
                            <WarningCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" weight="fill" />
                            {urlError}
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">Notify Me When...</label>
                      <textarea
                        value={newJob.notificationCriteria || ''}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[100px]"
                        placeholder="e.g., 'product price drops below target price' or 'PS5 is back in stock'"
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                          const criteria = e.target.value;
                          const analysisPrompt = criteria ? 
                            `Analyze this webpage to determine if the following is true: "${criteria}". Check elements like prices, availability, text content, and other visible information.` : 
                            '';
                          
                          setNewJob(prev => ({ 
                            ...prev, 
                            notificationCriteria: criteria,
                            analysisPrompt: analysisPrompt
                          }));
                        }}
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Describe what about the webpage needs to be true for you to get notified.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Check Frequency</label>
                        <Select
                          value={newJob.frequency}
                          onValueChange={(value) => setNewJob(prev => ({ ...prev, frequency: value as RecurringFrequency }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hourly">Every Hour</SelectItem>
                            <SelectItem value="daily">Every Day</SelectItem>
                            <SelectItem value="weekly">Every Week</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Start Time</label>
                        <TimeInput
                          value={newJob.scheduledTime}
                          onChange={(time) => setNewJob(prev => ({ ...prev, scheduledTime: time }))}
                          className="h-9"
                        />
                      </div>
                    </div>
                    
                    {/* Test Results */}
                    {(testResult || loading) && (
                      <div className="py-4">
                        {testResult && (
                          <div className={`rounded-md border p-4 w-full ${
                            testResult.matched === true 
                              ? 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800'
                              : testResult.matched === false
                                ? 'bg-muted border-muted-foreground/20'
                                : 'bg-destructive/10 border-destructive/30'
                          } mac-animate-in`}>
                            <div className="flex items-center mb-2">
                              <span className="flex-shrink-0">
                                {testResult.matched === true ? (
                                  <CheckCircle className="w-5 h-5 text-green-600" weight="fill" />
                                ) : testResult.matched === false ? (
                                  <XCircle className="w-5 h-5 text-muted-foreground" weight="fill" />
                                ) : (
                                  <WarningCircle className="w-5 h-5 text-destructive" weight="fill" />
                                )}
                              </span>
                              <div className="ml-2 flex flex-col">
                                <span className="text-sm font-medium">
                                  {testResult.matched === true
                                    ? 'Notification would trigger'
                                    : testResult.matched === false
                                      ? 'Notification would not send'
                                      : 'Error running test'}
                                </span>
                              </div>
                            </div>
                            <div className="text-xs whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto rounded-md bg-background p-3 font-mono border border-input">
                              {testResult.result}
                            </div>
                          </div>
                        )}
                        
                        {loading && (
                          <div className="p-4 bg-muted border rounded-md flex items-center justify-center mac-animate-in">
                            <SpinnerGap className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent" />
                            <span className="text-sm">Running test...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="sticky bottom-0 left-0 right-0 border-t border-border/60 px-8 py-4 flex justify-between items-center">
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={() => deleteJob(editingJobId)}
                      size="sm"
                    >
                      <Trash size={14} className="mr-1.5" />
                      Delete
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => testJob(newJob)}
                      disabled={!newJob.websiteUrl || !newJob.notificationCriteria || loading}
                      size="sm"
                    >
                      {loading ? 'Testing...' : 'Test'}
                    </Button>
                  </div>
                  <Button
                    onClick={() => {
                      if (newJob.websiteUrl && newJob.notificationCriteria) {
                        updateJob(newJob)
                      }
                    }}
                    disabled={!newJob.websiteUrl || !newJob.notificationCriteria || loading}
                    size="sm"
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : !showNewJobForm && settingsView ? (
              // Settings view (shown in place of task list)
              <div className="flex flex-col h-full min-h-[calc(100vh-3rem)] mac-animate-in">
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
                        
                        {!apiKey && localStorage.getItem('lastSavedApiKey') && (
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
                  </div>
                </div>
                <div className="sticky bottom-0 left-0 right-0 border-t border-border/60 px-8 py-4 flex justify-end">
                  <Button 
                    type="button" 
                    onClick={() => {
                      // Check if this is first-time setup with an empty key
                      const hasExistingKey = !!localStorage.getItem('lastSavedApiKey');
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
                        const lastSavedKey = localStorage.getItem('lastSavedApiKey') || '';
                        
                        // If clearing the API key
                        if (!apiKey && lastSavedKey) {
                          // Remove API key from storage
                          localStorage.removeItem('apiKey');
                          localStorage.removeItem('lastSavedApiKey');
                          
                          // Pause all running jobs
                          const updatedJobs = jobs.map(job => {
                            // Stop any interval/timeout for this job
                            if (job.isRunning) {
                              stopJob(job.id);
                            }
                            // Mark all jobs as not running but preserve other state
                            return { ...job, isRunning: false };
                          });
                          setJobs(updatedJobs);
                          
                          // Don't immediately close settings - keep it open to show api key is needed
                          return;
                        } 
                        // If updating with a new key
                        else if (apiKey && apiKey !== lastSavedKey) {
                          // Trigger confetti for new valid API key
                          setShowConfetti(true);
                          
                          // Save new API key
                          localStorage.setItem('apiKey', apiKey);
                          localStorage.setItem('lastSavedApiKey', apiKey);
                          
                          // If this is adding a key after not having one, restart jobs that were running
                          if (!lastSavedKey) {
                            // Resume all jobs that were running before
                            jobs.forEach(job => {
                              // Schedule each job (which will automatically set isRunning to true)
                              // Only if it was already set up previously (had a lastRun)
                              if (job.lastRun) {
                                toggleJob(job.id);
                              }
                            });
                          }
                        }
                        
                        setSettingsView(false)
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : !showNewJobForm ? (
              // When not in edit mode, settings, or creating new job, show a Mac-style list
              jobs.length > 0 && (
                <div className="pb-6">
                  <div className="mac-list mac-animate-in border-x-0 rounded-none">
                    {jobs.map((job, index) => (
                      <div 
                        key={job.id}
                        className={`mac-list-row ${index === 0 ? 'border-t-0' : ''}`}
                        onClick={(e) => {
                          // Only trigger if not clicking on buttons
                          if (!(e.target as HTMLElement).closest('button')) {
                            startEditingJob(job.id);
                          }
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center">
                            {job.isRunning && (
                              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500 animate-[pulse_1s_ease-in-out_infinite] flex-shrink-0"></span>
                            )}
                            <h3 className="font-medium text-sm truncate" title={job.websiteUrl}>
                              {job.websiteUrl}
                            </h3>
                          </div>
                          
                          <div className="flex items-center mt-1 text-xs text-muted-foreground">
                          <Tooltip delayDuration={200}>
                              <TooltipTrigger asChild>
                                <span className="flex-shrink-0 cursor-default">
                                  {job.frequency === 'hourly' ? 'Hourly' : 
                                   job.frequency === 'daily' ? 'Daily' : 
                                   job.frequency === 'weekly' ? 'Weekly' : ''} at {job.scheduledTime}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {job.lastRun ? `Checked ${formatTimeAgo(new Date(job.lastRun))}` : "Waiting for first check"}
                              </TooltipContent>
                            </Tooltip>
                            
                            <span className="mx-1.5 text-muted-foreground/40">•</span>
                            
                            <span className="truncate" title={job.notificationCriteria}>
                              {job.notificationCriteria}
                            </span>
                            
                            {job.lastMatchedCriteria !== undefined && (
                              <span className="ml-auto flex-shrink-0">
                                <span className={job.lastMatchedCriteria ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                                  {job.lastMatchedCriteria ? (
                                    <span className="flex items-center">
                                      <CheckCircle className="w-3 h-3 mr-0.5" weight="fill" />
                                      <span>Matched</span>
                                    </span>
                                  ) : (
                                    <span className="flex items-center">
                                      <XCircle className="w-3 h-3 mr-0.5" weight="fill" />
                                      <span>Not matched</span>
                                    </span>
                                  )}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center ml-4">
                          <CaretRight className="text-muted-foreground/40 flex-shrink-0" size={16} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : null }

            {/* New Job Form (only shown when not editing any job) */}
            {showNewJobForm && !editingJobId && (
              <div className="flex flex-col h-full min-h-[calc(100vh-3rem)]">
                <div className="flex-1 overflow-auto">
                  <div className="space-y-6 px-8 pt-6">
                    <div>
                      <label className="text-sm font-medium mb-2 block">URL to Monitor</label>
                      <Input
                        type="url"
                        value={newJob.websiteUrl}
                        placeholder="https://example.com"
                        className={`h-9 ${urlError ? 'border-destructive' : ''}`}
                        autoFocus
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const url = e.target.value;
                          setNewJob(prev => ({ ...prev, websiteUrl: url }));
                          
                          // Clear error when user is typing
                          if (urlError) setUrlError(null);
                        }}
                        onBlur={() => {
                          if (newJob.websiteUrl) {
                            const validation = validateUrl(newJob.websiteUrl);
                            if (!validation.isValid) {
                              setUrlError(validation.message || 'Invalid URL');
                            } else {
                              setUrlError(null);
                            }
                          }
                        }}
                      />
                      {urlError && (
                        <div className="mt-2 rounded-md px-3 py-1.5 bg-destructive/10 border border-destructive/20 dark:bg-destructive/20">
                          <p className="text-[0.8rem] font-medium text-destructive dark:text-destructive-foreground flex items-center">
                            <WarningCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" weight="fill" />
                            {urlError}
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">Notify me when...</label>
                      <textarea
                        value={newJob.notificationCriteria || ''}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[100px]"
                        placeholder="e.g., 'Dyson V15 drops below $650' or 'Coldplay tickets are in stock'"
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                          const criteria = e.target.value;
                          const analysisPrompt = criteria ? 
                            `Analyze this webpage to determine if the following is true: "${criteria}". Check elements like prices, availability, text content, and other visible information.` : 
                            '';
                          
                          setNewJob(prev => ({ 
                            ...prev, 
                            notificationCriteria: criteria,
                            analysisPrompt: analysisPrompt
                          }));
                        }}
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                      Describe what about the webpage needs to be true for you to get notified.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Check Frequency</label>
                        <Select
                          value={newJob.frequency}
                          onValueChange={(value) => setNewJob(prev => ({ ...prev, frequency: value as RecurringFrequency }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hourly">Every Hour</SelectItem>
                            <SelectItem value="daily">Every Day</SelectItem>
                            <SelectItem value="weekly">Every Week</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Start Time</label>
                        <TimeInput
                          value={newJob.scheduledTime}
                          onChange={(time) => setNewJob(prev => ({ ...prev, scheduledTime: time }))}
                          className="h-9"
                        />
                      </div>
                    </div>

                    {/* Test Results */}
                    {(testResult || loading) && (
                      <div className="py-4">
                        {testResult && (
                          <div className={`rounded-md border p-4 w-full ${
                            testResult.matched === true 
                              ? 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800'
                              : testResult.matched === false
                                ? 'bg-muted border-muted-foreground/20'
                                : 'bg-destructive/10 border-destructive/30'
                          } mac-animate-in`}>
                            <div className="flex items-center mb-2">
                              <span className="flex-shrink-0">
                                {testResult.matched === true ? (
                                  <CheckCircle className="w-5 h-5 text-green-600" weight="fill" />
                                ) : testResult.matched === false ? (
                                  <XCircle className="w-5 h-5 text-muted-foreground" weight="fill" />
                                ) : (
                                  <WarningCircle className="w-5 h-5 text-destructive" weight="fill" />
                                )}
                              </span>
                              <div className="ml-2 flex flex-col">
                                <span className="text-sm font-medium">
                                  {testResult.matched === true
                                    ? 'Condition matched! Notification would trigger.'
                                    : testResult.matched === false
                                      ? 'Condition not matched. No notification would be sent.'
                                      : 'Error running test'}
                                </span>
                                {testResult.timestamp && (
                                  <span className="text-xs text-muted-foreground">
                                    Tested: {testResult.timestamp.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-xs whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto rounded-md bg-background p-3 font-mono border border-input">
                              {testResult.result}
                            </div>
                          </div>
                        )}
                        
                        {loading && (
                          <div className="p-4 bg-muted border rounded-md flex items-center justify-center mac-animate-in">
                            <SpinnerGap className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent" />
                            <span className="text-sm">Running test...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="sticky bottom-0 left-0 right-0 border-t border-border/60 px-8 py-4 flex justify-between items-center">
                  <Button
                    variant="outline"
                    onClick={() => testJob(newJob)}
                    disabled={!newJob.websiteUrl || !newJob.notificationCriteria || loading}
                    className=""
                    size="sm"
                  >
                    {loading ? 'Testing...' : 'Test'}
                  </Button>
                  <Button
                    onClick={() => {
                      if (newJob.websiteUrl && newJob.notificationCriteria) {
                        if (editingJobId) {
                          updateJob(newJob)
                        } else {
                          addJob(newJob)
                        }
                        setTestResult(null)
                      }
                    }}
                    disabled={!newJob.websiteUrl || !newJob.notificationCriteria || loading}
                    size="sm"
                  >
                    {editingJobId ? 'Save' : 'Create Task'}
                  </Button>
                </div>
              </div>
            )}

          </div>

          {/* Error message - Don't show API key errors in the toast */}
          {error && !error.startsWith('_API_KEY_') && error !== '_API_KEY_REQUIRED_' && (
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 mac-animate-in">
              <div className="bg-background/80 backdrop-blur-md border border-destructive/20 rounded-lg shadow-lg px-4 py-3 text-sm text-destructive dark:text-destructive-foreground flex items-center">
                <WarningCircle className="w-4 h-4 mr-2 flex-shrink-0" weight="fill" />
                {error}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
