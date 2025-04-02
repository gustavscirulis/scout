import { useState, useEffect, useRef } from 'react'
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
}

type NewJobFormData = Omit<AnalysisJob, 'id' | 'isRunning' | 'lastResult' | 'lastRun'>

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
  const [newJob, setNewJob] = useState<NewJobFormData>(() => ({
    websiteUrl: '',
    analysisPrompt: '',
    frequency: 'daily',
    scheduledTime: (() => {
      const now = new Date()
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    })()
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

  const addJob = (job: Omit<AnalysisJob, 'id' | 'isRunning' | 'lastResult' | 'lastRun'>) => {
    const newJob: AnalysisJob = {
      ...job,
      id: crypto.randomUUID(),
      isRunning: false
    }
    setJobs([...jobs, newJob])
    setShowNewJobForm(false)
  }

  const sendNotification = (job: AnalysisJob, result: string) => {
    if (notificationPermission === 'granted') {
      const notification = new Notification(`Analysis Complete: ${job.websiteUrl}`, {
        body: result.slice(0, 100) + (result.length > 100 ? '...' : ''),
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
                { type: "text", text: job.analysisPrompt },
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
          max_tokens: 500,
          temperature: 0.7
        })
      })

      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json().catch(() => ({}))
        throw new Error(errorData.error?.message || 'Failed to analyze website')
      }

      const data = await openaiResponse.json()
      const resultContent = data.choices[0].message.content
      
      setJobs(jobs.map(j => 
        j.id === job.id 
          ? { ...j, lastResult: resultContent, lastRun: new Date() }
          : j
      ))
      
      sendNotification(job, resultContent)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
      stopJob(job.id)
    } finally {
      setLoading(false)
    }
  }

  const testJob = async (job: NewJobFormData) => {
    const testJobData: AnalysisJob = {
      ...job,
      id: 'test',
      isRunning: false
    }
    setLoading(true)
    await runAnalysis(testJobData)
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#f6f6f7] dark:bg-[#1e1e1e] font-['SF_Pro_Display',-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Oxygen-Sans,Ubuntu,Cantarell,'Helvetica_Neue',sans-serif]">
      {/* Titlebar */}
      <div className="h-8 bg-[#f6f6f7]/80 dark:bg-[#2c2c2e]/80 backdrop-blur-xl border-b border-[#d1d1d6] dark:border-[#3a3a3c] drag-region flex items-center justify-between px-4">
        <div className="text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">Vision Tasks</div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-sm text-[#1d1d1f] dark:text-[#f5f5f7] hover:text-[#0071e3] dark:hover:text-[#0377e3] transition-colors"
        >
          Settings
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full p-6 space-y-6">
          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-white/50 dark:bg-[#2c2c2e]/50 backdrop-blur-xl rounded-xl border border-[#e5e5e5] dark:border-[#3a3a3c] p-6 space-y-4 shadow-sm">
              <h2 className="text-lg font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Settings</h2>
              <div>
                <label className="block text-sm font-medium mb-2 text-[#1d1d1f] dark:text-[#f5f5f7]">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-[#e5e5e5] dark:border-[#3a3a3c] bg-white/50 dark:bg-[#1c1c1e]/50 backdrop-blur-xl text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3] dark:focus:ring-[#0377e3] transition-all"
                  placeholder="sk-..."
                />
              </div>
            </div>
          )}

          {/* Jobs List */}
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Analysis Jobs</h2>
              <button
                onClick={() => setShowNewJobForm(true)}
                className="px-4 py-2 bg-[#0071e3] dark:bg-[#0377e3] text-white rounded-lg shadow-sm hover:bg-[#0077ed] dark:hover:bg-[#0384ff] transition-colors text-sm font-medium"
              >
                Add Job
              </button>
            </div>

            {jobs.length === 0 && !showNewJobForm && (
              <div className="text-center py-12 text-[#86868b] dark:text-[#86868b] bg-white/50 dark:bg-[#2c2c2e]/50 backdrop-blur-xl rounded-xl border border-[#e5e5e5] dark:border-[#3a3a3c]">
                <div className="text-3xl mb-3">📊</div>
                <div className="font-medium mb-1">No Analysis Jobs</div>
                <div className="text-sm">Click "Add Job" to create your first analysis task</div>
              </div>
            )}

            {jobs.map(job => (
              <div
                key={job.id}
                className="bg-white/50 dark:bg-[#2c2c2e]/50 backdrop-blur-xl rounded-xl border border-[#e5e5e5] dark:border-[#3a3a3c] p-6 space-y-4 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">{job.websiteUrl}</h3>
                    <p className="text-sm text-[#86868b] dark:text-[#86868b] mt-1">{job.analysisPrompt}</p>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => toggleJob(job.id)}
                      className={`px-4 py-2 rounded-lg shadow-sm text-white text-sm font-medium transition-all ${
                        job.isRunning
                          ? 'bg-[#e11d48] hover:bg-[#be123c]'
                          : 'bg-[#0071e3] dark:bg-[#0377e3] hover:bg-[#0077ed] dark:hover:bg-[#0384ff]'
                      }`}
                    >
                      {job.isRunning ? 'Stop' : 'Start'}
                    </button>
                    <button
                      onClick={() => deleteJob(job.id)}
                      className="px-4 py-2 text-[#e11d48] hover:bg-[#fee2e2] dark:hover:bg-[#3b2424] rounded-lg transition-colors text-sm font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                <div className="flex space-x-6 text-sm text-[#86868b] dark:text-[#86868b]">
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Every {job.frequency}
                  </span>
                  <span className="flex items-center">
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {job.scheduledTime}
                  </span>
                  {job.lastRun && (
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Last run: {new Date(job.lastRun).toLocaleString()}
                    </span>
                  )}
                </div>

                {job.lastResult && (
                  <div className="mt-3 p-4 bg-[#f6f6f7] dark:bg-[#1c1c1e] rounded-lg">
                    <div className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7] mb-2">Last Result</div>
                    <p className="text-[#1d1d1f] dark:text-[#f5f5f7] text-sm whitespace-pre-wrap leading-relaxed">{job.lastResult}</p>
                  </div>
                )}
              </div>
            ))}

            {/* New Job Form */}
            {showNewJobForm && (
              <div className="bg-white/50 dark:bg-[#2c2c2e]/50 backdrop-blur-xl rounded-xl border border-[#e5e5e5] dark:border-[#3a3a3c] p-6 space-y-5 shadow-sm">
                <h3 className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] text-lg">New Analysis Job</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-[#1d1d1f] dark:text-[#f5f5f7]">Website URL</label>
                    <input
                      type="url"
                      value={newJob.websiteUrl}
                      className="w-full px-4 py-2 rounded-lg border border-[#e5e5e5] dark:border-[#3a3a3c] bg-white/50 dark:bg-[#1c1c1e]/50 backdrop-blur-xl text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3] dark:focus:ring-[#0377e3] transition-all"
                      placeholder="https://example.com"
                      onChange={(e) => setNewJob(prev => ({ ...prev, websiteUrl: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-[#1d1d1f] dark:text-[#f5f5f7]">Analysis Prompt</label>
                    <textarea
                      value={newJob.analysisPrompt}
                      className="w-full px-4 py-2 rounded-lg border border-[#e5e5e5] dark:border-[#3a3a3c] bg-white/50 dark:bg-[#1c1c1e]/50 backdrop-blur-xl text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3] dark:focus:ring-[#0377e3] transition-all resize-none"
                      placeholder="What would you like to analyze about this website?"
                      rows={3}
                      onChange={(e) => setNewJob(prev => ({ ...prev, analysisPrompt: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-[#1d1d1f] dark:text-[#f5f5f7]">Frequency</label>
                    <select
                      value={newJob.frequency}
                      className="w-full px-4 py-2 rounded-lg border border-[#e5e5e5] dark:border-[#3a3a3c] bg-white/50 dark:bg-[#1c1c1e]/50 backdrop-blur-xl text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3] dark:focus:ring-[#0377e3] transition-all appearance-none"
                      onChange={(e) => setNewJob(prev => ({ ...prev, frequency: e.target.value as RecurringFrequency }))}
                    >
                      <option value="hourly">Every Hour</option>
                      <option value="daily">Every Day</option>
                      <option value="weekly">Every Week</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-[#1d1d1f] dark:text-[#f5f5f7]">Start Time</label>
                    <input
                      type="time"
                      value={newJob.scheduledTime}
                      className="w-full px-4 py-2 rounded-lg border border-[#e5e5e5] dark:border-[#3a3a3c] bg-white/50 dark:bg-[#1c1c1e]/50 backdrop-blur-xl text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3] dark:focus:ring-[#0377e3] transition-all"
                      onChange={(e) => setNewJob(prev => ({ ...prev, scheduledTime: e.target.value }))}
                    />
                  </div>

                  <div className="flex justify-end space-x-3 pt-2">
                    <button
                      onClick={() => setShowNewJobForm(false)}
                      className="px-4 py-2 text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-[#f5f5f7] dark:hover:bg-[#323233] rounded-lg transition-colors text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => testJob(newJob)}
                      disabled={!newJob.websiteUrl || !newJob.analysisPrompt || loading}
                      className="px-4 py-2 bg-[#f5f5f7] dark:bg-[#323233] text-[#1d1d1f] dark:text-[#f5f5f7] rounded-lg shadow-sm hover:bg-[#e5e5e5] dark:hover:bg-[#3a3a3c] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Testing...' : 'Test Job'}
                    </button>
                    <button
                      onClick={() => {
                        if (newJob.websiteUrl && newJob.analysisPrompt) {
                          addJob(newJob)
                        }
                      }}
                      disabled={!newJob.websiteUrl || !newJob.analysisPrompt || loading}
                      className="px-4 py-2 bg-[#0071e3] dark:bg-[#0377e3] text-white rounded-lg shadow-sm hover:bg-[#0077ed] dark:hover:bg-[#0384ff] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add Job
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="p-4 bg-[#fef1f1] dark:bg-[#3b2424] border border-[#e11d48] dark:border-[#ef4444] rounded-lg text-[#e11d48] dark:text-[#ef4444] text-sm font-medium shadow-sm">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
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
