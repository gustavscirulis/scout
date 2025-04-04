import { useState, useEffect, useRef, ChangeEvent } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card'
import { Separator } from './components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './components/ui/dialog'
import { 
  Gear, 
  Plus, 
  ChartLineUp, 
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
  const [jobs, setJobs] = useState<AnalysisJob[]>(() => {
    const savedJobs = localStorage.getItem('analysisJobs')
    return savedJobs ? JSON.parse(savedJobs) : []
  })
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '')
  const [showSettings, setShowSettings] = useState(false)
  const [showNewJobForm, setShowNewJobForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission)
  const [testResult, setTestResult] = useState<{result: string, matched?: boolean, timestamp?: Date} | null>(null)
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
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
  }, [])

  // Save jobs to localStorage
  useEffect(() => {
    localStorage.setItem('analysisJobs', JSON.stringify(jobs))
  }, [jobs])

  // Save API key to localStorage
  useEffect(() => {
    localStorage.setItem('apiKey', apiKey)
  }, [apiKey])

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

  return (
    <div className="mac-window">
      {/* Titlebar - macOS style */}
      <div className="mac-toolbar">
        <div style={{ width: "40px", height: "100%" }}>
          {(showNewJobForm || editingJobId) ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowNewJobForm(false);
                resetNewJobForm();
              }}
              title="Back"
            >
              <CaretLeft size={16} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <Gear size={16} />
            </Button>
          )}
        </div>
        
        <div className="mac-toolbar-title">
          {(showNewJobForm || editingJobId) ? 
            (editingJobId ? 'Edit Monitor' : 'New Monitor') : 
            'Vision Tasks'}
        </div>
        
        <div style={{ width: "40px", height: "100%" }}>
          {!showNewJobForm && !editingJobId ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowNewJobForm(true)}
              title="New Monitor"
            >
              <Plus size={16} />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                OpenAI API Key
              </label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSettings(false)}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main content */}
      <div className="mac-content">
        <div className="w-full space-y-6">

          {/* Jobs List */}
          <div className="space-y-4">
            {jobs.length === 0 && !showNewJobForm && !editingJobId && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6 mac-animate-in">
                <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-6">
                  <ChartLineUp size={36} className="text-primary/60" />
                </div>
                <h3 className="text-lg font-medium mb-2">No Monitors Yet</h3>
                <p className="text-muted-foreground text-sm max-w-md mb-8">
                  Create a monitor to get notified when something changes on a website.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left mb-8 max-w-xl">
                  <button 
                    onClick={() => {
                      setNewJob(prev => ({
                        ...prev,
                        notificationCriteria: 'iPhone 15 price drops below $799',
                        analysisPrompt: 'Analyze this webpage to determine if the iPhone 15 price is below $799.'
                      }));
                      setShowNewJobForm(true);
                    }}
                    className="bg-card border border-border/60 p-4 rounded-lg hover:bg-muted/30 transition-colors text-left flex items-start -webkit-app-region-no-drag shadow-sm"
                  >
                    <ShoppingBag size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-sm">Price Tracking</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        If iPhone 15 price drops below $799
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
                    className="bg-card border border-border/60 p-4 rounded-lg hover:bg-muted/30 transition-colors text-left flex items-start -webkit-app-region-no-drag shadow-sm"
                  >
                    <Ticket size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-sm">Availability</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        If concert tickets become available
                      </div>
                    </div>
                  </button>
                  
                  <button 
                    onClick={() => {
                      setNewJob(prev => ({
                        ...prev,
                        notificationCriteria: 'New job listings appear on the careers page',
                        analysisPrompt: 'Analyze this webpage to determine if new job listings have appeared.'
                      }));
                      setShowNewJobForm(true);
                    }}
                    className="bg-card border border-border/60 p-4 rounded-lg hover:bg-muted/30 transition-colors text-left flex items-start -webkit-app-region-no-drag shadow-sm"
                  >
                    <Briefcase size={18} className="text-primary mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-sm">Content Updates</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        If new job listings appear on the careers page
                      </div>
                    </div>
                  </button>
                </div>
                
                <Button 
                  onClick={() => setShowNewJobForm(true)}
                  className="rounded-full px-6"
                  size="lg"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Monitor
                </Button>
              </div>
            )}

            {/* When in edit mode or creating a new job, only show that form */}
            {editingJobId && jobs.find(job => job.id === editingJobId) ? (
              <div className="flex flex-col h-full relative">
                <div className="flex-1 overflow-auto">
                  <div className="space-y-6 px-8 pt-6">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Website URL</label>
                      <Input
                        type="url"
                        value={newJob.websiteUrl}
                        placeholder="https://example.com"
                        className="h-9 bg-card/60 border-border/60"
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewJob(prev => ({ ...prev, websiteUrl: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">Notify me when...</label>
                      <textarea
                        value={newJob.notificationCriteria || ''}
                        className="flex w-full rounded-md border border-border/60 bg-card/60 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[100px]"
                        placeholder="e.g., 'price of iPhone 15 drops below $899' or 'PS5 is back in stock'"
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
                        Describe what needs to be true for you to get notified. Try to be specific about what you're looking for.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Check Frequency</label>
                        <select
                          value={newJob.frequency}
                          className="flex h-9 w-full rounded-md border border-border/60 bg-card/60 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewJob(prev => ({ ...prev, frequency: e.target.value as RecurringFrequency }))}
                        >
                          <option value="hourly">Every Hour</option>
                          <option value="daily">Every Day</option>
                          <option value="weekly">Every Week</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Start Time</label>
                        <Input
                          type="time"
                          value={newJob.scheduledTime}
                          className="h-9 bg-card/60 border-border/60"
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewJob(prev => ({ ...prev, scheduledTime: e.target.value }))}
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
                            <div className="text-xs whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto rounded-md bg-background/50 p-3 font-mono border border-input/50">
                              {testResult.result}
                            </div>
                          </div>
                        )}
                        
                        {loading && (
                          <div className="p-4 bg-muted border border-input rounded-md flex items-center justify-center mac-animate-in">
                            <SpinnerGap className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent" />
                            <span className="text-sm">Running test...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between px-8 py-4 border-t bg-card/75 backdrop-blur-sm">
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => deleteJob(editingJobId)}
                      className="text-destructive hover:text-destructive border-border/60 bg-card/60"
                      size="sm"
                    >
                      <Trash size={14} className="mr-1.5" />
                      Delete
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => testJob(newJob)}
                      disabled={!newJob.websiteUrl || !newJob.notificationCriteria || loading}
                      className="border-border/60 bg-card/60"
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
            ) : !showNewJobForm ? (
              // When not in edit mode and not creating new job, show a Mac-style list
              <div className="pt-0.5 pb-6">
                <div className="mac-list mac-animate-in border-x-0 rounded-none">
                  {jobs.map((job, index) => (
                    <div 
                      key={job.id}
                      className="mac-list-row"
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
                            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse flex-shrink-0"></span>
                          )}
                          <h3 className="font-medium text-sm truncate" title={job.websiteUrl}>
                            {job.websiteUrl}
                          </h3>
                        </div>
                        
                        <div className="flex items-center mt-1 text-xs text-muted-foreground">
                          {job.lastRun && (
                            <span className="flex-shrink-0">
                              Checked {formatTimeAgo(new Date(job.lastRun))}
                            </span>
                          )}
                          
                          {job.lastRun && (
                            <span className="mx-1.5 text-muted-foreground/40">•</span>
                          )}
                          
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
            ) : null }

            {/* New Job Form (only shown when not editing any job) */}
            {showNewJobForm && !editingJobId && (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-auto">
                  <div className="space-y-6 px-8 pt-6">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Website URL</label>
                      <Input
                        type="url"
                        value={newJob.websiteUrl}
                        placeholder="https://example.com"
                        className="h-9 bg-card/60 border-border/60"
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewJob(prev => ({ ...prev, websiteUrl: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">Notify me when...</label>
                      <textarea
                        value={newJob.notificationCriteria || ''}
                        className="flex w-full rounded-md border border-border/60 bg-card/60 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[100px]"
                        placeholder="e.g., 'price of iPhone 15 drops below $899' or 'PS5 is back in stock'"
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
                        Describe what needs to be true for you to get notified. Try to be specific about what you're looking for.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Check Frequency</label>
                        <select
                          value={newJob.frequency}
                          className="flex h-9 w-full rounded-md border border-border/60 bg-card/60 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewJob(prev => ({ ...prev, frequency: e.target.value as RecurringFrequency }))}
                        >
                          <option value="hourly">Every Hour</option>
                          <option value="daily">Every Day</option>
                          <option value="weekly">Every Week</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Start Time</label>
                        <Input
                          type="time"
                          value={newJob.scheduledTime}
                          className="h-9 bg-card/60 border-border/60"
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewJob(prev => ({ ...prev, scheduledTime: e.target.value }))}
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
                            <div className="text-xs whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto rounded-md bg-background/50 p-3 font-mono border border-input/50">
                              {testResult.result}
                            </div>
                          </div>
                        )}
                        
                        {loading && (
                          <div className="p-4 bg-muted border border-input rounded-md flex items-center justify-center mac-animate-in">
                            <SpinnerGap className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent" />
                            <span className="text-sm">Running test...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between px-8 py-4 border-t bg-card/75 backdrop-blur-sm">
                  <Button
                    variant="outline"
                    onClick={() => testJob(newJob)}
                    disabled={!newJob.websiteUrl || !newJob.notificationCriteria || loading}
                    className="border-border/60 bg-card/60"
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
                    {editingJobId ? 'Save' : 'Create Monitor'}
                  </Button>
                </div>
              </div>
            )}

          </div>

          {/* Error message */}
          {error && (
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 mac-animate-in">
              <div className="bg-background/80 backdrop-blur-md border border-destructive/20 rounded-lg shadow-lg px-4 py-3 text-sm text-destructive flex items-center">
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
