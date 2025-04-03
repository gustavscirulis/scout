import { useState, useEffect, useRef, ChangeEvent } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card'
import { Separator } from './components/ui/separator'
import './App.css'

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
  const [testResult, setTestResult] = useState<{result: string, matched?: boolean} | null>(null)
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
  };
  
  const addJob = (job: Omit<AnalysisJob, 'id' | 'isRunning' | 'lastResult' | 'lastRun'>) => {
    const newJob: AnalysisJob = {
      ...job,
      id: crypto.randomUUID(),
      isRunning: false
    }
    setJobs([...jobs, newJob])
    setShowNewJobForm(false)
    resetNewJobForm()
  }

  const sendNotification = (job: AnalysisJob, analysis: string, relevantData?: string) => {
    if (notificationPermission === 'granted') {
      const title = `Alert: ${job.websiteUrl}`;
      
      // Create a notification body that includes the condition and relevant data
      let body = `Condition met: "${job.notificationCriteria}"`;
      
      if (relevantData) {
        body += `\n\nData: ${relevantData}`;
      }
      
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
  "analysis": "A brief analysis of what you see on the page related to the condition...",
  "criteriaMatched": true/false,
  "criteriaEvaluation": "Explanation of how you evaluated the criteria and why it matched or didn't match",
  "relevantData": "Any specific data points that are relevant (e.g., prices, availability status, etc.)"
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
        
        // Format the result to display relevant information
        const formattedResult = [
          `${parsedResult.analysis}`,
          '',
          `Relevant Data: ${parsedResult.relevantData || 'None'}`,
          '',
          `Evaluation: ${parsedResult.criteriaEvaluation}`,
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
          sendNotification(job, parsedResult.analysis, parsedResult.relevantData);
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
  "analysis": "A brief analysis of what you see on the page related to the condition...",
  "criteriaMatched": true/false,
  "criteriaEvaluation": "Explanation of how you evaluated the criteria and why it matched or didn't match",
  "relevantData": "Any specific data points that are relevant (e.g., prices, availability status, etc.)"
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
        
        // Format the result to display relevant information
        const formattedResult = [
          `${parsedResult.analysis}`,
          '',
          `Relevant Data: ${parsedResult.relevantData || 'None'}`,
          '',
          `Evaluation: ${parsedResult.criteriaEvaluation}`,
          '',
          criteriaMatched ? '✅ Condition matched!' : '❌ Condition not matched'
        ].join('\n');
        
        setTestResult({
          result: formattedResult,
          matched: criteriaMatched
        });
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
      <div className="mac-toolbar flex items-center justify-between px-4 border-b">
        <div className="text-sm font-bold">Vision Tasks</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowSettings(!showSettings)}
          className="no-drag"
        >
          {showSettings ? "Hide Settings" : "Settings"}
        </Button>
      </div>

      {/* Main content */}
      <div className="mac-content">
        <div className="w-full max-w-3xl mx-auto p-6 space-y-6">
          {/* Settings Panel */}
          {showSettings && (
            <Card className="mac-animate-in">
              <CardHeader>
                <CardTitle>Settings</CardTitle>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          )}

          {/* Jobs List */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Website Monitors</h2>
              <Button
                onClick={() => setShowNewJobForm(true)}
                size="sm"
              >
                + New Monitor
              </Button>
            </div>

            {jobs.length === 0 && !showNewJobForm && (
              <Card className="mac-animate-in text-center py-8">
                <CardContent>
                  <div className="text-4xl mb-4">🔍</div>
                  <CardTitle className="mb-3">Get notified when something changes on a website</CardTitle>
                  <CardDescription className="max-w-md mx-auto mb-6">
                    Monitor product prices, stock availability, content changes, or anything else visible on a website. 
                    We'll alert you when your specified conditions are met.
                  </CardDescription>
                  <Button
                    onClick={() => setShowNewJobForm(true)}
                    size="lg"
                  >
                    + Create Your First Monitor
                  </Button>
                </CardContent>
              </Card>
            )}

            {jobs.map(job => (
              <Card key={job.id} className="mac-animate-in">
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center">
                        <h3 className="font-semibold text-base">{job.websiteUrl}</h3>
                        {job.isRunning && (
                          <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                        )}
                      </div>
                      
                      <div className="mt-4">
                        <div className="flex items-start">
                          <span className="flex-shrink-0 mt-0.5">
                            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                          </span>
                          <div className="ml-2.5">
                            <div className="text-sm text-muted-foreground font-medium mb-1">Notify when:</div>
                            <div className="text-sm">{job.notificationCriteria}</div>
                            {job.lastMatchedCriteria !== undefined && (
                              <div className={`mt-2 flex items-center ${job.lastMatchedCriteria ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                                {job.lastMatchedCriteria ? (
                                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                                <span className="text-sm font-medium">
                                  {job.lastMatchedCriteria ? 'Condition matched on last check' : 'Condition not matched on last check'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => toggleJob(job.id)}
                        variant={job.isRunning ? "destructive" : "default"}
                        size="sm"
                      >
                        {job.isRunning ? 'Stop' : 'Start'}
                      </Button>
                      <Button
                        onClick={() => deleteJob(job.id)}
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Every {job.frequency} at {job.scheduledTime}
                    </span>
                    {job.lastRun && (
                      <span className="flex items-center">
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Last check: {new Date(job.lastRun).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {job.lastResult && (
                    <div className="mt-4 p-4 bg-muted rounded-md">
                      <div className="font-medium text-sm mb-2">Last Result</div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.lastResult}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* New Job Form */}
            {showNewJobForm && (
              <Card className="mac-animate-in">
                <CardHeader>
                  <CardTitle>Create New Monitor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Website URL</label>
                    <Input
                      type="url"
                      value={newJob.websiteUrl}
                      placeholder="https://example.com"
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setNewJob(prev => ({ ...prev, websiteUrl: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notify me when...</label>
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
                    <p className="text-sm text-muted-foreground">
                      Describe what needs to be true for you to get notified. Try to be specific about what you're looking for.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Check Frequency</label>
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

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Start Time</label>
                      <Input
                        type="time"
                        value={newJob.scheduledTime}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewJob(prev => ({ ...prev, scheduledTime: e.target.value }))}
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowNewJobForm(false);
                      resetNewJobForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => testJob(newJob)}
                    disabled={!newJob.websiteUrl || !newJob.notificationCriteria || loading}
                  >
                    {loading ? 'Running Test...' : 'Test Now'}
                  </Button>
                  <Button
                    onClick={() => {
                      if (newJob.websiteUrl && newJob.notificationCriteria) {
                        addJob(newJob)
                        setTestResult(null)
                      }
                    }}
                    disabled={!newJob.websiteUrl || !newJob.notificationCriteria || loading}
                  >
                    Create Monitor
                  </Button>
                </CardFooter>
              </Card>
            )}

            {/* Test Results */}
            {testResult && (
              <Card className={`mac-animate-in ${
                testResult.matched === true 
                  ? 'bg-green-50/50 dark:bg-green-900/20'
                  : testResult.matched === false
                    ? 'bg-muted/50'
                    : 'bg-destructive/10'
              }`}>
                <CardContent className="pt-6">
                  <div className="flex items-center mb-3">
                    <span className="flex-shrink-0">
                      {testResult.matched === true ? (
                        <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : testResult.matched === false ? (
                        <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </span>
                    <span className="ml-2 text-base font-medium">
                      {testResult.matched === true
                        ? 'Condition matched! You would be notified.'
                        : testResult.matched === false
                          ? 'Condition not matched. No notification would be sent.'
                          : 'Error running test'}
                    </span>
                  </div>
                  <div className="mt-2 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto rounded-md bg-background/50 p-4 font-mono text-muted-foreground">
                    {testResult.result}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Error message */}
          {error && (
            <Card className="mac-animate-in bg-destructive/10">
              <CardContent className="py-3 text-sm text-destructive flex items-center">
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
