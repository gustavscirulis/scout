import { useState, useEffect, useRef } from 'react'
import './App.css'

type RecurringFrequency = 'none' | 'hourly' | 'daily' | 'weekly'

function App() {
  const [websiteUrl, setWebsiteUrl] = useState(() => localStorage.getItem('websiteUrl') || '')
  const [analysisPrompt, setAnalysisPrompt] = useState(() => localStorage.getItem('analysisPrompt') || '')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('apiKey') || '')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission)
  const [frequency, setFrequency] = useState<RecurringFrequency>('none')
  const [scheduledTime, setScheduledTime] = useState(() => {
    const now = new Date()
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  })
  const [isRunning, setIsRunning] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

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

  // Save values to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('websiteUrl', websiteUrl)
    localStorage.setItem('analysisPrompt', analysisPrompt)
    localStorage.setItem('apiKey', apiKey)
  }, [websiteUrl, analysisPrompt, apiKey])

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const getNextRunTime = () => {
    const [hours, minutes] = scheduledTime.split(':').map(Number)
    const now = new Date()
    const next = new Date()
    next.setHours(hours, minutes, 0, 0)

    if (frequency === 'hourly') {
      if (next <= now) {
        next.setHours(next.getHours() + 1)
      }
    } else if (frequency === 'daily') {
      if (next <= now) {
        next.setDate(next.getDate() + 1)
      }
    } else if (frequency === 'weekly') {
      if (next <= now) {
        next.setDate(next.getDate() + 7)
      }
    }

    return next
  }

  const scheduleNextRun = () => {
    const nextRun = getNextRunTime()
    const delay = nextRun.getTime() - Date.now()

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      handleAnalysis()
      
      // Schedule next run based on frequency
      if (frequency === 'hourly') {
        intervalRef.current = setInterval(handleAnalysis, 60 * 60 * 1000)
      } else if (frequency === 'daily') {
        intervalRef.current = setInterval(handleAnalysis, 24 * 60 * 60 * 1000)
      } else if (frequency === 'weekly') {
        intervalRef.current = setInterval(handleAnalysis, 7 * 24 * 60 * 60 * 1000)
      }
    }, delay)
  }

  const startRecurringAnalysis = () => {
    setIsRunning(true)
    if (frequency === 'none') {
      handleAnalysis()
    } else {
      scheduleNextRun()
    }
  }

  const stopRecurringAnalysis = () => {
    setIsRunning(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const handleStartStop = () => {
    if (isRunning) {
      stopRecurringAnalysis()
    } else {
      startRecurringAnalysis()
    }
  }

  const sendNotification = (result: string) => {
    if (notificationPermission === 'granted') {
      // First close any existing notifications with the same tag
      const notification = new Notification('Analysis Complete', {
        body: result.slice(0, 100) + (result.length > 100 ? '...' : ''),
        icon: '/favicon.ico',
        requireInteraction: true,
        silent: false,
        tag: 'analysis-result'
      })

      notification.onclick = () => {
        // Bring window to front when notification is clicked
        const { ipcRenderer } = window.require('electron')
        ipcRenderer.send('focus-window')
        notification.close()
      }
    } else if (notificationPermission === 'denied') {
      console.warn('Notifications are blocked. Please enable them in your system settings.')
    }
  }

  const handleAnalysis = async () => {
    try {
      setLoading(true)
      setError('')

      // Take screenshot using Electron
      const { ipcRenderer } = window.require('electron')
      const screenshot = await ipcRenderer.invoke('take-screenshot', websiteUrl)

      // Call OpenAI Vision API
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
                { 
                  type: "text", 
                  text: analysisPrompt 
                },
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
      setResponse(resultContent)
      sendNotification(resultContent)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#f5f5f5] dark:bg-[#1e1e1e]">
      {/* Titlebar */}
      <div className="h-8 bg-[#e7e7e7] dark:bg-[#323233] drag-region" />

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full p-6 space-y-6">
          {/* Input Section */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-[#1d1d1f] dark:text-[#f5f5f7]">Website URL</label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[#d2d2d7] dark:border-[#424245] bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3] dark:focus:ring-[#0377e3]"
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-[#1d1d1f] dark:text-[#f5f5f7]">Analysis Prompt</label>
              <textarea
                value={analysisPrompt}
                onChange={(e) => setAnalysisPrompt(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[#d2d2d7] dark:border-[#424245] bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3] dark:focus:ring-[#0377e3]"
                placeholder="What would you like to analyze about this website?"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-[#1d1d1f] dark:text-[#f5f5f7]">OpenAI API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[#d2d2d7] dark:border-[#424245] bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3] dark:focus:ring-[#0377e3]"
                placeholder="sk-..."
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-[#1d1d1f] dark:text-[#f5f5f7]">
                  Analysis Frequency
                </label>
                <select
                  value={frequency}
                  onChange={(e) => {
                    const newFrequency = e.target.value as RecurringFrequency
                    setFrequency(newFrequency)
                    if (isRunning) {
                      stopRecurringAnalysis()
                    }
                  }}
                  className="w-full px-3 py-2 rounded-md border border-[#d2d2d7] dark:border-[#424245] bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3] dark:focus:ring-[#0377e3]"
                >
                  <option value="none">Run Once</option>
                  <option value="hourly">Every Hour</option>
                  <option value="daily">Every Day</option>
                  <option value="weekly">Every Week</option>
                </select>
              </div>

              {frequency !== 'none' && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-[#1d1d1f] dark:text-[#f5f5f7]">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => {
                      setScheduledTime(e.target.value)
                      if (isRunning) {
                        stopRecurringAnalysis()
                        startRecurringAnalysis()
                      }
                    }}
                    className="w-full px-3 py-2 rounded-md border border-[#d2d2d7] dark:border-[#424245] bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3] dark:focus:ring-[#0377e3]"
                  />
                </div>
              )}
            </div>

            <button
              className={`w-full px-4 py-2 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isRunning 
                  ? 'bg-[#e11d48] hover:bg-[#be123c]' 
                  : 'bg-[#0071e3] dark:bg-[#0377e3] hover:bg-[#0077ed] dark:hover:bg-[#0384ff]'
              }`}
              onClick={handleStartStop}
              disabled={loading || !websiteUrl || !analysisPrompt || !apiKey}
            >
              {loading ? 'Analyzing...' : isRunning ? 'Stop Analysis' : 'Start Analysis'}
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-[#fef1f1] dark:bg-[#3b2424] border border-[#e11d48] dark:border-[#ef4444] rounded-md text-[#e11d48] dark:text-[#ef4444] text-sm">
              {error}
            </div>
          )}

          {/* Results Section */}
          {response && (
            <div className="bg-white dark:bg-[#2c2c2e] rounded-md border border-[#d2d2d7] dark:border-[#424245] overflow-hidden">
              <div className="sticky top-0 px-4 py-3 bg-[#f5f5f7] dark:bg-[#323233] border-b border-[#d2d2d7] dark:border-[#424245]">
                <h3 className="font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">Analysis Result</h3>
              </div>
              <div className="p-4">
                <p className="whitespace-pre-wrap text-[#1d1d1f] dark:text-[#f5f5f7] text-sm leading-relaxed">{response}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
