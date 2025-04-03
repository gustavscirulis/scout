import { useState, useEffect, useRef, ChangeEvent } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card'
import { Separator } from './components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './components/ui/dialog'
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
    setJobs(jobs.filter(job => job.id !== jobId))
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
      {/* Titlebar */}
      <div className="mac-toolbar w-full flex items-center justify-between py-2 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowSettings(true)}
          className="no-drag ml-2"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </Button>
        <div className="flex-1"></div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowNewJobForm(true)}
          className="no-drag mr-2"
          title="New Monitor"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14"/>
            <path d="M5 12h14"/>
          </svg>
        </Button>
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
        <div className="w-full max-w-3xl mx-auto p-6 space-y-6">

          {/* Jobs List */}
          <div className="space-y-4">
            {jobs.length === 0 && !showNewJobForm && !editingJobId && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                    <path d="M12 20V10"></path>
                    <path d="M18 20V4"></path>
                    <path d="M6 20v-4"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-medium mb-1">No monitors yet</h3>
                <p className="text-muted-foreground text-sm max-w-md mb-4">
                  Create a monitor to get notified when something changes on a website.
                </p>
                <Button 
                  onClick={() => setShowNewJobForm(true)}
                  variant="outline"
                >
                  Create your first monitor
                </Button>
              </div>
            )}

            {/* When in edit mode, only show the job being edited */}
            {editingJobId ? (
              // Find and display only the job being edited
              jobs.filter(job => job.id === editingJobId).map(job => (
                <Card key={job.id} className="mac-animate-in relative">
                  <button 
                    onClick={() => deleteJob(job.id)}
                    className="absolute top-3 right-4 w-6 h-6 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive no-drag"
                    title="Delete Monitor"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18"></path>
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    </svg>
                  </button>
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-lg">Edit Monitor</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 px-4 pt-0">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Website URL</label>
                      <Input
                        type="url"
                        value={newJob.websiteUrl}
                        placeholder="https://example.com"
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewJob(prev => ({ ...prev, websiteUrl: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Notify me when...</label>
                      <textarea
                        value={newJob.notificationCriteria || ''}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[100px]"
                        placeholder="e.g., 'price of iPhone 15 drops below $899' or 'PS5 is back in stock'"
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                          // Store the notification criteria directly
                          const criteria = e.target.value;
                          // Generate an analysis prompt behind the scenes
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
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Describe what needs to be true for you to get notified. Try to be specific about what you're looking for.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Check Frequency</label>
                        <select
                          value={newJob.frequency}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewJob(prev => ({ ...prev, frequency: e.target.value as RecurringFrequency }))}
                        >
                          <option value="hourly">Every Hour</option>
                          <option value="daily">Every Day</option>
                          <option value="weekly">Every Week</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-1.5 block">Start Time</label>
                        <Input
                          type="time"
                          value={newJob.scheduledTime}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewJob(prev => ({ ...prev, scheduledTime: e.target.value }))}
                        />
                      </div>
                    </div>
                    
                  </CardContent>
                  <CardFooter className="flex justify-between p-4 pt-4">
                    <div>
                      <Button
                        variant="outline"
                        onClick={() => resetNewJobForm()}
                      >
                        Cancel
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => testJob(newJob)}
                        disabled={!newJob.websiteUrl || !newJob.notificationCriteria || loading}
                      >
                        {loading ? 'Testing...' : 'Test'}
                      </Button>
                      <Button
                        onClick={() => {
                          if (newJob.websiteUrl && newJob.notificationCriteria) {
                            updateJob(newJob);
                            setTestResult(null);
                          }
                        }}
                        disabled={!newJob.websiteUrl || !newJob.notificationCriteria || loading}
                      >
                        Save
                      </Button>
                    </div>
                  </CardFooter>
                  
                  {/* Test Results */}
                  {(testResult || loading) && (
                    <div className="p-4">
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
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              ) : testResult.matched === false ? (
                                <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
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
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent mr-2"></div>
                          <span className="text-sm">Running test...</span>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ))
            ) : (
              // When not in edit mode, show all job cards
              jobs.map(job => (
                <Card 
                  key={job.id} 
                  className="mac-animate-in cursor-pointer hover:shadow-md transition-all relative"
                  onClick={(e) => {
                    // Only trigger if not clicking on buttons
                    if (!(e.target as HTMLElement).closest('button')) {
                      startEditingJob(job.id);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="mb-3">
                      <div className="flex items-center">
                        {job.isRunning && (
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0"></span>
                        )}
                        <h3 className="font-semibold text-base truncate max-w-[300px]" title={job.websiteUrl}>
                          {job.websiteUrl}
                        </h3>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Every {job.frequency} at {job.scheduledTime}
                        {job.lastRun && (
                          <>
                            <span className="mx-1.5">•</span>
                            Last check: {formatTimeAgo(new Date(job.lastRun))}
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="bg-muted/40 rounded-md p-3 mb-3">
                      <div className="flex items-start">
                        <span className="flex-shrink-0 mt-0.5">
                          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                        </span>
                        <div className="ml-2.5 w-full">
                          <div className="text-xs text-muted-foreground font-medium mb-1">Notify when:</div>
                          <div className="text-sm font-medium">{job.notificationCriteria}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-end items-center">
                      {job.lastMatchedCriteria !== undefined && (
                        <div className={`flex items-center ${job.lastMatchedCriteria ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                          {job.lastMatchedCriteria ? (
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          <span className="text-xs font-medium">
                            {job.lastMatchedCriteria ? 'Matched' : 'Not matched'}
                          </span>
                        </div>
                      )}
                    </div>

                    {job.lastResult && (
                      <div className="mt-3 p-4 bg-background rounded-md border border-input text-xs text-muted-foreground whitespace-pre-wrap max-h-20 overflow-y-auto">
                        {job.lastResult}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}

            {/* New Job Form (only shown when not editing any job) */}
            {showNewJobForm && !editingJobId && (
              <Card className="mac-animate-in">
                <CardHeader className="px-4 py-3">
                  <CardTitle className="text-lg">Create New Monitor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5 px-4 pt-0">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Website URL</label>
                    <Input
                      type="url"
                      value={newJob.websiteUrl}
                      placeholder="https://example.com"
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setNewJob(prev => ({ ...prev, websiteUrl: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Notify me when...</label>
                    <textarea
                      value={newJob.notificationCriteria || ''}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[100px]"
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
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Describe what needs to be true for you to get notified. Try to be specific about what you're looking for.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Check Frequency</label>
                      <select
                        value={newJob.frequency}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewJob(prev => ({ ...prev, frequency: e.target.value as RecurringFrequency }))}
                      >
                        <option value="hourly">Every Hour</option>
                        <option value="daily">Every Day</option>
                        <option value="weekly">Every Week</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Start Time</label>
                      <Input
                        type="time"
                        value={newJob.scheduledTime}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewJob(prev => ({ ...prev, scheduledTime: e.target.value }))}
                      />
                    </div>
                  </div>
                  
                </CardContent>
                <CardFooter className="flex justify-between p-4 pt-4">
                  <div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowNewJobForm(false);
                        resetNewJobForm();
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => testJob(newJob)}
                      disabled={!newJob.websiteUrl || !newJob.notificationCriteria || loading}
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
                    >
                      Create Monitor
                    </Button>
                  </div>
                </CardFooter>
                
                {/* Test Results */}
                {(testResult || loading) && (
                  <div className="p-4">
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
                              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : testResult.matched === false ? (
                              <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
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
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent mr-2"></div>
                        <span className="text-sm">Running test...</span>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

          </div>

          {/* Error message */}
          {error && (
            <Card className="mac-animate-in bg-destructive/10">
              <CardContent className="p-4 text-sm text-destructive flex items-center">
                <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
