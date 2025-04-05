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

interface AnalysisJob {
  id: string
  websiteUrl: string
  analysisPrompt: string
  frequency: RecurringFrequency
  scheduledTime: string
  dayOfWeek?: DayOfWeek
  isRunning: boolean
  lastResult?: string
  lastRun?: Date
  notificationCriteria: string
  lastMatchedCriteria?: boolean
  lastTestResult?: {
    result: string
    matched?: boolean
    timestamp?: string
    screenshot?: string
  }
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
  const [jobs, setJobs] = useState<AnalysisJob[]>(() => {
    console.log('Loading jobs from localStorage'); // Essential log
    const savedJobsData = localStorage.getItem('analysisJobs')
    if (!savedJobsData) {
      console.log('No saved jobs found'); // Essential log
      return [];
    }
    
    // Parse the JSON and properly convert date strings back to Date objects
    try {
      const parsedData = JSON.parse(savedJobsData);
      
      // Check if we're using the new format (with timestamp) or old format
      let parsedJobs;
      if (parsedData.timestamp && Array.isArray(parsedData.jobs)) {
        console.log(`Loading jobs from new format, saved at: ${parsedData.timestamp}`);
        parsedJobs = parsedData.jobs;
      } else if (Array.isArray(parsedData)) {
        console.log('Loading jobs from old format');
        parsedJobs = parsedData;
      } else {
        console.error('Invalid job data in localStorage, unexpected format');
        return [];
      }
      
      const loadedJobs = parsedJobs.map((job: any) => {
        const loadedJob = {
          ...job,
          // Convert lastRun from string to Date object
          lastRun: job.lastRun ? new Date(job.lastRun) : undefined,
          // Also ensure lastTestResult timestamp is properly converted if it exists
          lastTestResult: job.lastTestResult ? {
            ...job.lastTestResult,
            timestamp: job.lastTestResult.timestamp ? job.lastTestResult.timestamp : undefined
          } : undefined
        };
        
        // Log complete job details for debugging
        console.log(`- Job ${loadedJob.id}: frequency=${loadedJob.frequency}, criteria=${loadedJob.notificationCriteria?.substring(0, 50)}`);
        
        return loadedJob;
      });
      
      // Log the loaded jobs for debugging
      console.log(`Loaded ${loadedJobs.length} jobs from localStorage`); // Essential log
      
      return loadedJobs;
    } catch (error) {
      console.error('Error parsing jobs from localStorage:', error);
      return [];
    }
  })
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

  const checkForMissedRuns = (job: AnalysisJob) => {
    if (!job.lastRun) return false;
    
    const now = new Date();
    const lastRun = new Date(job.lastRun);
    const intervalTimes: Record<RecurringFrequency, number> = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000
    };
    
    const interval = intervalTimes[job.frequency];
    const timeSinceLastRun = now.getTime() - lastRun.getTime();
    
    // If more than one interval has passed since the last run
    return timeSinceLastRun > interval;
  };

  // Check for missed runs on startup and when jobs are resumed
  useEffect(() => {
    jobs.forEach(job => {
      if (job.isRunning && checkForMissedRuns(job)) {
        // Run the analysis immediately for missed jobs
        runAnalysis(job);
      }
    });
  }, [jobs]);

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

  // Save jobs to localStorage
  useEffect(() => {
    console.log(`Saving ${jobs.length} jobs to localStorage`); // Essential log
    
    // Log all jobs being saved for debugging
    jobs.forEach((job, index) => {
      console.log(`Job ${index}: ${job.id}, criteria: ${job.notificationCriteria?.substring(0, 50)}`);
    });
    
    // CRITICAL: Before saving, make a deep clone to avoid stale data issues
    const jobsToSave = jobs.map(job => {
      // Create a fresh deep copy of each job
      const jobCopy = {
        ...job,
        // Convert Date objects to ISO strings for proper serialization
        lastRun: job.lastRun ? job.lastRun.toISOString() : undefined
      };
      
      // CRITICAL FIX: Save a separate copy of the notification criteria to ensure it's not lost
      // This is a hack to deal with potential race conditions in React state management
      if (!jobCopy.notificationCriteria) {
        // Try to recover from localStorage if it's missing
        try {
          const savedData = localStorage.getItem('analysisJobs');
          if (savedData) {
            const parsedData = JSON.parse(savedData);
            if (parsedData.timestamp && Array.isArray(parsedData.jobs)) {
              const savedJob = parsedData.jobs.find((j: any) => j.id === job.id);
              if (savedJob && savedJob.notificationCriteria) {
                console.log(`Recovered missing criteria from localStorage: "${savedJob.notificationCriteria}"`);
                jobCopy.notificationCriteria = savedJob.notificationCriteria;
              }
            }
          }
        } catch (e) {
          console.error("Error recovering criteria from localStorage", e);
        }
      }
      
      // Double check we have criteria
      if (!jobCopy.notificationCriteria) {
        console.error(`ERROR: Job ${jobCopy.id} has no criteria before saving to localStorage!`);
      }
      
      // Log the job being saved
      console.log(`Saving job ${jobCopy.id}, condition: "${jobCopy.notificationCriteria?.substring(0, 30)}"`);
      
      return jobCopy;
    });
    
    // Add a timestamp for debugging
    const saveData = {
      timestamp: new Date().toISOString(),
      jobs: jobsToSave
    };
    
    // Save to localStorage with a timestamp for debugging
    localStorage.setItem('analysisJobs', JSON.stringify(saveData));
    
    // ADDITIONAL BACKUP: Store the criteria separately for each job to help recovery
    // This ensures we have a backup if the main storage gets corrupted
    jobs.forEach(job => {
      if (job.notificationCriteria) {
        localStorage.setItem(`job_criteria_${job.id}`, job.notificationCriteria);
      }
    });
  }, [jobs])

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
            
            // Check if we have any jobs that need to be started
            const jobsToStart = jobs.filter(job => !job.isRunning);
            
            if (jobsToStart.length > 0) {
              jobsToStart.forEach(job => {
                toggleJob(job.id);
              });
            }
            
            // Add auto-recovery safety check - check local storage vs. loaded jobs
            try {
              const savedJobsData = localStorage.getItem('analysisJobs');
              if (savedJobsData) {
                // Parse the data, handling both new and old formats
                const parsedData = JSON.parse(savedJobsData);
                let savedJobs;
                
                // Handle different formats
                if (parsedData.timestamp && Array.isArray(parsedData.jobs)) {
                  console.log(`Loading jobs from new format during recovery, saved at ${parsedData.timestamp}`);
                  savedJobs = parsedData.jobs;
                } else if (Array.isArray(parsedData)) {
                  console.log('Loading jobs from old format during recovery');
                  savedJobs = parsedData;
                } else {
                  console.error('Invalid localStorage format during recovery');
                  return;
                }
                
                // Compare number of jobs in localStorage vs. loaded state
                if (savedJobs.length !== jobs.length) {
                  console.log(`Job count mismatch: localStorage=${savedJobs.length}, state=${jobs.length}`);
                  // This indicates a possible bug - let's try to recover by loading from localStorage
                  if (savedJobs.length > jobs.length) {
                    console.log(`Recovering ${savedJobs.length - jobs.length} jobs from localStorage`);
                    // Convert any string dates to Date objects
                    const recoveredJobs = savedJobs.map((job: any) => ({
                      ...job,
                      lastRun: job.lastRun ? new Date(job.lastRun) : undefined
                    }));
                    
                    // Update the jobs state with the recovered jobs
                    setJobs(recoveredJobs);
                  }
                }
              }
            } catch (e) {
              console.error('Error during job recovery check:', e);
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

  const getNextRunTime = (job: AnalysisJob) => {
    const [hours, minutes] = job.scheduledTime.split(':').map(Number)
    const now = new Date()
    const next = new Date()
    next.setHours(hours, minutes, 0, 0)

    if (job.frequency === 'hourly') {
      if (next <= now) {
        next.setHours(next.getHours() + 1);
      }
    } else if (job.frequency === 'daily') {
      if (next <= now) next.setDate(next.getDate() + 1)
    } else if (job.frequency === 'weekly') {
      // Handle day of week for weekly jobs
      const dayMap: Record<string, number> = {
        mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0
      }
      const targetDay = dayMap[job.dayOfWeek || 'mon']
      const currentDay = now.getDay() // 0 = Sunday, 1 = Monday, etc.
      
      let daysToAdd = targetDay - currentDay
      if (daysToAdd < 0) daysToAdd += 7 // Wrap around to next week
      
      // If it's the same day but time has passed, or it's exactly now, go to next week
      if (daysToAdd === 0 && next <= now) daysToAdd = 7
      
      next.setDate(next.getDate() + daysToAdd)
    }

    return next
  }

  const scheduleJob = (job: AnalysisJob) => {
    console.log(`Scheduling job ${job.id} with frequency ${job.frequency}`); // Essential log
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
        
        console.log(`Setting up interval for job ${job.id} (${job.frequency})`); // Essential log
        
        // SUPER CRITICAL FIX: We need to use the useRef reference to the latest jobs state
        // because the closure captures a snapshot of the jobs array at this point
        const interval = setInterval(() => {
          console.log(`Running scheduled task ${job.id}`); // Essential log
          
          // Use a React hook getter call to get the latest jobs state
          // This is crucial to prevent stale closures
          const getLatestJobs = () => {
            let latestJobs: AnalysisJob[] = [];
            
            // We need to get the fresh jobs state from localStorage as a fallback
            try {
              const savedJobsData = localStorage.getItem('analysisJobs');
              if (savedJobsData) {
                // Parse the data, handling both new and old formats
                const parsedData = JSON.parse(savedJobsData);
                let parsedJobs;
                
                // Handle different formats
                if (parsedData.timestamp && Array.isArray(parsedData.jobs)) {
                  console.log(`Loading jobs from new format in interval, saved at ${parsedData.timestamp}`);
                  parsedJobs = parsedData.jobs;
                } else if (Array.isArray(parsedData)) {
                  console.log('Loading jobs from old format in interval');
                  parsedJobs = parsedData;
                } else {
                  console.error('Invalid localStorage format in interval');
                  return jobs; // Return current jobs if localStorage format is invalid
                }
                
                // Convert dates
                latestJobs = parsedJobs.map((job: any) => ({
                  ...job,
                  lastRun: job.lastRun ? new Date(job.lastRun) : undefined
                }));
              }
            } catch (e) {
              console.error('Error getting fresh jobs from localStorage', e);
            }
            
            // Also try to get the jobs from the current state
            // If there's a mismatch, log it
            if (jobs.length !== latestJobs.length) {
              console.warn(`Jobs state mismatch! State: ${jobs.length}, localStorage: ${latestJobs.length}`);
            }
            
            // Prefer the larger array to avoid data loss
            return jobs.length >= latestJobs.length ? jobs : latestJobs;
          };
          
          // Get the latest jobs
          const currentJobs = getLatestJobs();
          console.log(`Current jobs count: ${currentJobs.length}`);
          
          // Find the job in the latest jobs array
          const currentJob = currentJobs.find(j => j.id === job.id);
          
          if (currentJob) {
            console.log(`Found job ${job.id} in fresh state, isRunning=${currentJob.isRunning}`);
            if (currentJob.isRunning) {
              runAnalysis(currentJob);
            } else {
              console.log(`Job ${job.id} is no longer running, skipping`); // Essential log
            }
          } else {
            console.log(`Job ${job.id} not found in state or localStorage, clearing interval`); // Essential log
            // If the job doesn't exist anymore, clear the interval
            clearInterval(interval);
          }
        }, intervalTimes[job.frequency])
        intervals.current[job.id].interval = interval
      }, delay)
    }
  }

  const stopJob = (jobId: string) => {
    console.log(`Stopping job ${jobId}`); // Essential log
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
    console.log(`Deleting job ${jobId}`); // Essential log
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
      dayOfWeek: 'mon',
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
      dayOfWeek: job.dayOfWeek || 'mon',
      notificationCriteria: job.notificationCriteria || ''
    });
    
    // Set editing mode, but make sure showNewJobForm is false
    // to prevent both forms from being visible
    setEditingJobId(jobId);
    setShowNewJobForm(false);
    
    // First check if there's a last test result available
    if (job.lastTestResult) {
      setTestResult({
        result: job.lastTestResult.result,
        matched: job.lastTestResult.matched,
        timestamp: job.lastTestResult.timestamp ? new Date(job.lastTestResult.timestamp) : undefined,
        screenshot: job.lastTestResult.screenshot
      });
      
      // Log for debugging
      console.log('Found lastTestResult:', job.lastTestResult);
    } 
    // If no test result, but there's a last scheduled run result, use that instead
    else if (job.lastResult) {
      setTestResult({
        result: job.lastResult,
        matched: job.lastMatchedCriteria,
        timestamp: job.lastRun,
        screenshot: undefined // We don't store screenshots for scheduled runs
      });
      
      // Log for debugging
      console.log('Using lastResult:', job.lastResult, 'lastRun:', job.lastRun);
    } 
    else {
      // Clear any previous test results if no saved result exists
      setTestResult(null);
      console.log('No result found for job:', job.id);
    }
  };
  
  const updateJob = (updatedJob: NewJobFormData) => {
    if (!editingJobId) return;
    
    // Find the job being edited
    const job = jobs.find(j => j.id === editingJobId);
    if (!job) return;
    
    // CRITICAL: Before updating, save the updated notification criteria to our backup storage
    console.log(`Saving criteria to backup: "${updatedJob.notificationCriteria}"`);
    localStorage.setItem(`job_criteria_${editingJobId}`, updatedJob.notificationCriteria);
    
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
            dayOfWeek: updatedJob.dayOfWeek,
            notificationCriteria: updatedJob.notificationCriteria 
          } 
        : j
    );
    
    // Log the updated job for debugging
    const jobAfterUpdate = updatedJobs.find(j => j.id === editingJobId);
    if (jobAfterUpdate) {
      console.log(`Job after update: criteria = "${jobAfterUpdate.notificationCriteria}"`);
    }
    
    // Set the jobs state
    setJobs(updatedJobs);
    
    // Force an immediate save to localStorage for the updated job
    const jobsToSave = updatedJobs.map(job => ({
      ...job,
      lastRun: job.lastRun ? job.lastRun.toISOString() : undefined
    }));
    
    // Immediately save to localStorage to avoid race conditions
    const saveData = {
      timestamp: new Date().toISOString(),
      jobs: jobsToSave
    };
    
    // Save to both main storage and backup
    localStorage.setItem('analysisJobs', JSON.stringify(saveData));
    
    // If it was running, restart it with the new settings
    if (wasRunning) {
      // IMPORTANT: Wait a bit for the state update to complete before restarting
      setTimeout(() => {
        const freshJob = updatedJobs.find(j => j.id === editingJobId);
        if (freshJob) {
          console.log(`Restarting job with criteria: "${freshJob.notificationCriteria}"`);
          scheduleJob(freshJob);
        }
      }, 100);
    }
    
    // Clear form and editing mode
    setEditingJobId(null);
    resetNewJobForm();
  };
  
  const addJob = (job: JobFormData) => {
    // Create the new job with test result if available
    const newJob: AnalysisJob = {
      ...job,
      id: crypto.randomUUID(),
      isRunning: true, // Set to true by default
      // Include test result if available
      ...(testResult && {
        lastTestResult: {
          result: testResult.result,
          matched: testResult.matched,
          timestamp: testResult.timestamp?.toISOString(),
          screenshot: testResult.screenshot
        },
        // Also set these fields based on the test result
        lastResult: testResult.result,
        lastRun: testResult.timestamp,
        lastMatchedCriteria: testResult.matched
      })
    }
    
    // CRITICAL FIX: Add job to state first and ensure it's fully updated before scheduling
    // To avoid race conditions, we need to ensure the job is in the state before scheduling it
    const updatedJobs = [...jobs, newJob];
    
    console.log(`Adding new job ${newJob.id} to jobs array`);
    console.log(`Jobs before adding: ${jobs.length}, after adding: ${updatedJobs.length}`);
    
    // Update the jobs state
    setJobs(updatedJobs);
    
    // Use a short timeout to ensure state has updated before scheduling
    // This is a workaround since useState doesn't have a callback function
    setTimeout(() => {
      console.log(`Running delayed schedule for job ${newJob.id}`);
      scheduleJob(newJob);
    }, 100);
    
    // Close form and reset
    setShowNewJobForm(false)
    resetNewJobForm()
  }

  const sendNotification = (job: AnalysisJob, analysis: string) => {
    // CRITICAL DEBUG INFO - Let's see what notification criteria is coming in
    console.log(`Sending notification for job ${job.id}`);
    console.log(`Notification criteria: "${job.notificationCriteria}"`);
    
    if (notificationPermission === 'granted') {
      console.log(`Notification permission granted, creating notification`);
      
      // Extract just the domain from the URL
      const urlObj = new URL(job.websiteUrl.startsWith('http') ? job.websiteUrl : `http://${job.websiteUrl}`);
      const domain = urlObj.hostname;
      
      const title = `${domain} matched your condition: ${job.notificationCriteria}`;
      
      // Create a notification body that just includes the rationale (analysis)
      let body = analysis;
      if (analysis && analysis.length > 100) {
        body = analysis.slice(0, 100) + '...';
      }
      
      console.log(`Notification title: ${title}`);
      console.log(`Notification body: ${body.substring(0, 50)}...`);
      
      // Create notification that will persist until explicitly dismissed
      const notification = new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        requireInteraction: true, // Prevents auto-closing
        silent: false,
        tag: `analysis-${job.id}`,
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

  const runAnalysis = async (job: AnalysisJob) => {
    console.log(`Starting analysis for job ${job.id} (${job.frequency})`); // Essential log
    
    // CRITICAL: Check if this job still exists in jobs state before proceeding
    // If it's not in state yet, try to load from localStorage as a backup
    let jobExists = jobs.some(j => j.id === job.id);
    
    if (!jobExists) {
      console.log(`Job ${job.id} not found in current state, checking localStorage...`);
      try {
        const savedJobs = localStorage.getItem('analysisJobs');
        if (savedJobs) {
          const parsedJobs = JSON.parse(savedJobs);
          jobExists = parsedJobs.some((j: any) => j.id === job.id);
          if (jobExists) {
            console.log(`Job ${job.id} found in localStorage`);
          }
        }
      } catch (e) {
        console.error('Error checking localStorage for job', e);
      }
    } else {
      console.log(`Job ${job.id} found in current state`);
    }
    
    // Even if we can't find the job in state or localStorage,
    // we'll still proceed with the analysis since we have the job object
    // This is a safety measure to ensure jobs don't disappear
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
      const websiteUrl = (!job.websiteUrl.startsWith('http://') && !job.websiteUrl.startsWith('https://')) 
        ? `http://${job.websiteUrl}` 
        : job.websiteUrl
      const screenshot = await ipcRenderer.invoke('take-screenshot', websiteUrl)

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
        
        console.log(`Analysis successful for job ${job.id}, matched=${criteriaMatched}`); // Essential log
        
        // THIS IS CRITICAL: Get a fresh copy of the jobs array before updating
        // The closure may have a stale version of the jobs array
        // We need to get the latest jobs from state
        console.log(`Current jobs length before update: ${jobs.length}`); // Debug job count
        
        // Create a deep copy of the current job from the current array
        const currentJobIndex = jobs.findIndex(j => j.id === job.id);
        console.log(`Job index in array: ${currentJobIndex}`); // Debug job index
        
        // If the job is not found in the current state, we need to add it
        if (currentJobIndex === -1) {
          console.log(`Job ${job.id} not found in current state, attempting to add it`);
          
          // First check if it exists in localStorage
          try {
            const savedJobsData = localStorage.getItem('analysisJobs');
            if (savedJobsData) {
              // Parse the data, handling both new and old formats
              const parsedData = JSON.parse(savedJobsData);
              let parsedJobs;
              
              // Handle different formats
              if (parsedData.timestamp && Array.isArray(parsedData.jobs)) {
                console.log(`Loading job from new format, saved at ${parsedData.timestamp}`);
                parsedJobs = parsedData.jobs;
              } else if (Array.isArray(parsedData)) {
                console.log('Loading job from old format');
                parsedJobs = parsedData;
              } else {
                console.error('Invalid localStorage format');
                return;
              }
              
              // Find the job by ID
              const savedJob = parsedJobs.find((j: any) => j.id === job.id);
              
              if (savedJob) {
                console.log(`Job ${job.id} found in localStorage, will add to state`);
                
                // Convert dates in the saved job
                if (savedJob.lastRun) {
                  savedJob.lastRun = new Date(savedJob.lastRun);
                }
                
                // Create a copy with our new data
                const updatedJob = { 
                  ...savedJob, 
                  lastResult: formattedResult,
                  lastRun: now,
                  lastMatchedCriteria: criteriaMatched,
                  lastTestResult: resultData,
                  isRunning: true,
                  // CRITICAL: Explicitly preserve notification criteria
                  notificationCriteria: savedJob.notificationCriteria
                };
                
                console.log(`Preserved criteria in success recovery: "${savedJob.notificationCriteria}"`);
                
                // Verify the criteria is preserved in the updatedJob
                console.log(`Updated job criteria: "${updatedJob.notificationCriteria}"`);
                
                // Add an explicit check for edge cases
                if (!updatedJob.notificationCriteria || updatedJob.notificationCriteria === "undefined") {
                  console.error("Critical error: criteria is undefined or empty in recovered job");
                  
                  // Force the criteria from the original job as a fallback
                  updatedJob.notificationCriteria = job.notificationCriteria || savedJob.notificationCriteria || "Unknown criteria";
                  console.log(`Forced criteria to: "${updatedJob.notificationCriteria}"`);
                }
                
                // Add the updated job to our current array
                const updatedJobs = [...jobs, updatedJob];
                setJobs(updatedJobs);
                
                console.log(`Job ${job.id} recovered and updated`);
                
                // Check if we should send a notification for the recovered job
                if (criteriaMatched === true) {
                  console.log(`Criteria matched for recovered job ${job.id}, sending notification`);
                  console.log(`Recovered job criteria: "${updatedJob.notificationCriteria}"`);
                  
                  // One final safety check
                  if (!updatedJob.notificationCriteria || updatedJob.notificationCriteria === "undefined") {
                    console.error("CRITICAL ERROR: Recovered job criteria missing");
                    
                    // Force a fresh copy with the correct criteria
                    const freshJob = {
                      ...updatedJob,
                      notificationCriteria: job.notificationCriteria || savedJob.notificationCriteria || "Unknown criteria"
                    };
                    
                    console.log(`Forced recovered job criteria: "${freshJob.notificationCriteria}"`);
                    sendNotification(freshJob, parsedResult.analysis);
                  } else {
                    // Send notification with the verified job data
                    sendNotification(updatedJob, parsedResult.analysis);
                  }
                } else {
                  console.log(`Criteria not matched for recovered job ${job.id}, no notification sent`);
                }
                
                return;
              }
            }
          } catch (e) {
            console.error('Error recovering job from localStorage', e);
          }
          
          // If we got here, we couldn't find the job anywhere - we'll simply keep using the
          // original job object but won't update state since we can't find it there
          console.error(`ERROR: Job ${job.id} not found in state or localStorage!`);
          return;
        }
        
        // Make a fresh copy of the current jobs array
        const latestJobs = [...jobs];
        
        // Update the specific job in the fresh array
        // MOST CRITICAL FIX! The notification criteria is getting reverted somewhere
        // Log the current notification criteria for debugging
        console.log(`Before update: notification criteria = "${latestJobs[currentJobIndex].notificationCriteria}"`);
        
        // Get the criteria from localStorage as well for comparison
        let storedCriteria = "";
        try {
          const savedJobsData = localStorage.getItem('analysisJobs');
          if (savedJobsData) {
            const parsedData = JSON.parse(savedJobsData);
            if (parsedData.timestamp && Array.isArray(parsedData.jobs)) {
              const storedJob = parsedData.jobs.find((j: any) => j.id === job.id);
              if (storedJob) {
                storedCriteria = storedJob.notificationCriteria;
                console.log(`Stored criteria in localStorage: "${storedCriteria}"`);
              }
            } else if (Array.isArray(parsedData)) {
              const storedJob = parsedData.find((j: any) => j.id === job.id);
              if (storedJob) {
                storedCriteria = storedJob.notificationCriteria;
                console.log(`Stored criteria in localStorage (old format): "${storedCriteria}"`);
              }
            }
          }
        } catch (e) {
          console.error("Error reading localStorage for criteria comparison", e);
        }
        
        // Update the job with explicit preservation of notification criteria
        latestJobs[currentJobIndex] = { 
          ...latestJobs[currentJobIndex], 
          lastResult: formattedResult,
          lastRun: now,
          lastMatchedCriteria: criteriaMatched,
          lastTestResult: resultData, // Store full result data including screenshot
          isRunning: true, // Explicitly ensure job stays running
          // CRITICAL - ensure we preserve the current notification criteria
          // This is the field that's being lost during updates
          // Try multiple fallbacks to ensure we get the right criteria
          notificationCriteria: storedCriteria || 
                             localStorage.getItem(`job_criteria_${job.id}`) || 
                             latestJobs[currentJobIndex].notificationCriteria
        };
        
        // Debug log for the notification criteria
        console.log(`Job criteria preserved: ${latestJobs[currentJobIndex].notificationCriteria}`);
        
        console.log(`New jobs array length: ${latestJobs.length}`); // Debug new array length
        
        // Log the updated job for critical debugging
        console.log(`Job updated: ${latestJobs[currentJobIndex].id}, isRunning=${latestJobs[currentJobIndex].isRunning}`);
        
        // Set the state with our freshly created array
        setJobs(latestJobs);
        
        // Only send notification if criteria matched
        if (criteriaMatched === true) {
          console.log(`Criteria matched, sending notification for job ${job.id}`);
          
          // Get the freshly updated job from the array to ensure it has the latest data
          const updatedJobForNotification = latestJobs[currentJobIndex];
          
          // Double-check we have the updated job before sending notification
          if (updatedJobForNotification) {
            console.log(`Using updated job data for notification: ${updatedJobForNotification.id}`);
            console.log(`Latest job criteria: "${updatedJobForNotification.notificationCriteria}"`);
            
            // One final safety check to make sure we're using the correct criteria
            if (!updatedJobForNotification.notificationCriteria || 
                updatedJobForNotification.notificationCriteria === "undefined") {
              
              console.error("CRITICAL ERROR: Job criteria missing before notification");
              
              // Force a fresh copy with the correct criteria
              const freshJob = {
                ...updatedJobForNotification,
                notificationCriteria: job.notificationCriteria || "Unknown criteria"
              };
              
              console.log(`Forced job criteria for notification: "${freshJob.notificationCriteria}"`);
              sendNotification(freshJob, parsedResult.analysis);
            } else {
              // Send notification with the verified job data
              sendNotification(updatedJobForNotification, parsedResult.analysis);
            }
          } else {
            // Fallback to original job if we somehow can't find the updated one
            console.log(`Falling back to original job for notification: ${job.id}`);
            console.log(`Original job criteria: "${job.notificationCriteria}"`);
            sendNotification(job, parsedResult.analysis);
          }
        } else {
          console.log(`Criteria not matched for job ${job.id}, no notification sent`);
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
        
        console.log(`Parse error for job ${job.id}, but keeping it running`); // Essential log
        
        // THIS IS CRITICAL: Get a fresh copy of the jobs array before updating
        // The closure may have a stale version of the jobs array
        console.log(`Current jobs length before parse error update: ${jobs.length}`); // Debug job count
        
        // Create a deep copy of the current job from the current array
        const currentJobIndex = jobs.findIndex(j => j.id === job.id);
        console.log(`Job index in array (parse error): ${currentJobIndex}`); // Debug job index
        
        if (currentJobIndex === -1) {
          console.log(`Job ${job.id} not found during parse error, attempting to recover it`);
          
          try {
            // First try to find it in localStorage
            const savedJobsData = localStorage.getItem('analysisJobs');
            if (savedJobsData) {
              // Parse the data, handling both new and old formats
              const parsedData = JSON.parse(savedJobsData);
              let parsedJobs;
              
              // Handle different formats
              if (parsedData.timestamp && Array.isArray(parsedData.jobs)) {
                console.log(`Loading job from new format during parse error, saved at ${parsedData.timestamp}`);
                parsedJobs = parsedData.jobs;
              } else if (Array.isArray(parsedData)) {
                console.log('Loading job from old format during parse error');
                parsedJobs = parsedData;
              } else {
                console.error('Invalid localStorage format during parse error');
                return;
              }
              
              // Find the job by ID
              const savedJob = parsedJobs.find((j: any) => j.id === job.id);
              
              if (savedJob) {
                console.log(`Job ${job.id} found in localStorage, recovering it`);
                
                // Convert dates
                if (savedJob.lastRun) {
                  savedJob.lastRun = new Date(savedJob.lastRun);
                }
                
                // Update the job with the error information
                const updatedJob = {
                  ...savedJob,
                  lastResult: errorResult,
                  lastRun: now,
                  lastTestResult: errorResultData,
                  isRunning: true,
                  // CRITICAL: Explicitly preserve notification criteria
                  notificationCriteria: savedJob.notificationCriteria
                };
                
                console.log(`Preserved criteria in parse error recovery: ${savedJob.notificationCriteria}`);
                
                // Add the updated job to the current jobs array
                const updatedJobs = [...jobs, updatedJob];
                setJobs(updatedJobs);
                
                console.log(`Job ${job.id} recovered and updated after parse error`);
                return;
              }
            }
          } catch (e) {
            console.error('Error recovering job from localStorage during parse error', e);
          }
          
          console.error(`ERROR: Job ${job.id} not found in state or localStorage during parse error!`);
          return;
        }
        
        // Make a fresh copy of the current jobs array
        const latestJobs = [...jobs];
        
        // Update the specific job in the fresh array
        latestJobs[currentJobIndex] = { 
          ...latestJobs[currentJobIndex], 
          lastResult: errorResult,
          lastRun: now,
          lastTestResult: errorResultData,
          isRunning: true, // Explicitly ensure job stays running
          // CRITICAL - ensure we preserve the current notification criteria
          // This is the field that's being lost during updates
          notificationCriteria: latestJobs[currentJobIndex].notificationCriteria
        };
        
        // Debug log for the notification criteria
        console.log(`Job criteria preserved in parse error: ${latestJobs[currentJobIndex].notificationCriteria}`);
        
        console.log(`New jobs array length after parse error: ${latestJobs.length}`); // Debug new array length
        console.log(`Job updated after parse error: ${latestJobs[currentJobIndex].id}, isRunning=${latestJobs[currentJobIndex].isRunning}`);
        
        // Set the state with our freshly created array
        setJobs(latestJobs);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMessage);
      
      // Also save the error in the job's result
      const now = new Date();
      const errorResultData = {
        result: errorMessage,
        timestamp: now.toISOString()
      };
      
      console.log(`Error during analysis for job ${job.id}, but keeping it running: ${errorMessage}`); // Essential log
      
      // THIS IS CRITICAL: Get a fresh copy of the jobs array before updating after an error
      // The closure may have a stale version of the jobs array
      console.log(`Current jobs length before error update: ${jobs.length}`); // Debug job count
      
      // Create a deep copy of the current job from the current array
      const currentJobIndex = jobs.findIndex(j => j.id === job.id);
      console.log(`Job index in array (error): ${currentJobIndex}`); // Debug job index
      
      if (currentJobIndex === -1) {
        console.log(`Job ${job.id} not found during error handling, attempting to recover it`);
        
        try {
          // First try to find it in localStorage
          const savedJobsData = localStorage.getItem('analysisJobs');
          if (savedJobsData) {
            // Parse the data, handling both new and old formats
            const parsedData = JSON.parse(savedJobsData);
            let parsedJobs;
            
            // Handle different formats
            if (parsedData.timestamp && Array.isArray(parsedData.jobs)) {
              console.log(`Loading job from new format during error handling, saved at ${parsedData.timestamp}`);
              parsedJobs = parsedData.jobs;
            } else if (Array.isArray(parsedData)) {
              console.log('Loading job from old format during error handling');
              parsedJobs = parsedData;
            } else {
              console.error('Invalid localStorage format during error handling');
              return;
            }
            
            // Find the job by ID
            const savedJob = parsedJobs.find((j: any) => j.id === job.id);
            
            if (savedJob) {
              console.log(`Job ${job.id} found in localStorage, recovering it`);
              
              // Convert dates
              if (savedJob.lastRun) {
                savedJob.lastRun = new Date(savedJob.lastRun);
              }
              
              // Update the job with the error information
              const updatedJob = {
                ...savedJob,
                lastResult: errorMessage,
                lastRun: now,
                lastTestResult: errorResultData,
                isRunning: true,
                // CRITICAL: Explicitly preserve notification criteria
                notificationCriteria: savedJob.notificationCriteria
              };
              
              console.log(`Preserved criteria in error recovery: ${savedJob.notificationCriteria}`);
              
              // Add the updated job to the current jobs array
              const updatedJobs = [...jobs, updatedJob];
              setJobs(updatedJobs);
              
              console.log(`Job ${job.id} recovered and updated after error`);
              return;
            }
          }
        } catch (e) {
          console.error('Error recovering job from localStorage during error handling', e);
        }
        
        console.error(`ERROR: Job ${job.id} not found in state or localStorage during error!`);
        return;
      }
      
      // Make a fresh copy of the current jobs array
      const latestJobs = [...jobs];
      
      // Update the specific job in the fresh array
      latestJobs[currentJobIndex] = { 
        ...latestJobs[currentJobIndex], 
        lastResult: errorMessage,
        lastRun: now,
        lastTestResult: errorResultData,
        isRunning: true, // Explicitly ensure job stays running
        // CRITICAL - ensure we preserve the current notification criteria
        // This is the field that's being lost during updates
        notificationCriteria: latestJobs[currentJobIndex].notificationCriteria
      };
      
      // Debug log for the notification criteria
      console.log(`Job criteria preserved in error handler: ${latestJobs[currentJobIndex].notificationCriteria}`);
      
      console.log(`New jobs array length after error: ${latestJobs.length}`); // Debug new array length
      console.log(`Job updated after error: ${latestJobs[currentJobIndex].id}, isRunning=${latestJobs[currentJobIndex].isRunning}`);
      
      // Set the state with our freshly created array
      setJobs(latestJobs);
      
      // For temporary API errors etc., don't even stop the job
      // The job will continue running at its scheduled intervals
      // This prevents job disappearance when there are temporary errors
    } finally {
      console.log(`Analysis finished for job ${job.id}`); // Essential log
      setLoading(false);
    }
  }

  const testJob = async (job: NewJobFormData) => {
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
    
    // Set up for testing
    
    try {
      // Create a modified version of runAnalysis that returns the result instead of updating jobs
      const { ipcRenderer } = window.require('electron')
      // Ensure URL has protocol prefix for the screenshot function
      const websiteUrl = (!job.websiteUrl.startsWith('http://') && !job.websiteUrl.startsWith('https://')) 
        ? `http://${job.websiteUrl}` 
        : job.websiteUrl
      const screenshot = await ipcRenderer.invoke('take-screenshot', websiteUrl)
      
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
        
        // If we're testing an existing job, update its lastRun timestamp and test results
        if (editingJobId) {
          setJobs(jobs.map(j => 
            j.id === editingJobId 
              ? { 
                  ...j, 
                  lastRun: now,
                  lastTestResult: testResultData
                }
              : j
          ));
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
        
        // Still save the error result if editing an existing job
        if (editingJobId) {
          setJobs(jobs.map(j => 
            j.id === editingJobId 
              ? { 
                  ...j,
                  lastTestResult: errorResult
                }
              : j
          ));
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
      
      // Save error result if editing an existing job
      if (editingJobId) {
        setJobs(jobs.map(j => 
          j.id === editingJobId 
            ? { 
                ...j,
                lastTestResult: errorResult
              }
            : j
        ));
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
              onClick={() => deleteJob(editingJobId)}
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

          {/* Jobs List */}
          <div className="space-y-4">
            {(!apiKey || jobs.length === 0) && !showNewJobForm && !editingJobId && !settingsView && (
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

            {/* When in edit mode or creating a new job, only show that form */}
            {editingJobId && jobs.find(job => job.id === editingJobId) ? (
              <TaskForm
                formData={newJob}
                testResult={testResult}
                loading={loading}
                onFormChange={setNewJob}
                onTest={testJob}
                onSave={(data) => {
                  if (data.websiteUrl && data.notificationCriteria) {
                    updateJob(data);
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
                            
                            // Close settings and show the welcome screen
                            setSettingsView(false);
                            return;
                          } 
                          // If updating with a new key
                          else if (apiKey && apiKey !== lastSavedKey) {
                            // Only show confetti if this is the first time adding an API key
                            // AND there are no saved tasks yet
                            if (!lastSavedKey && !hasExistingKey && jobs.length === 0) {
                              setShowConfetti(true);
                            }
                            
                            // Save new API key using IPC
                            await electron.ipcRenderer.invoke('save-api-key', apiKey);
                            setHasExistingKey(true);
                            
                            // Immediately restart ALL jobs when adding a new API key
                            // Use a timeout to ensure this happens after state updates
                            setTimeout(() => {
                              // First update all jobs state to running
                              setJobs(prevJobs => {
                                const updatedJobs = prevJobs.map(job => ({
                                  ...job,
                                  isRunning: true
                                }));
                                
                                // Schedule each job after state update
                                updatedJobs.forEach(job => {
                                  // First stop any existing job to clear intervals
                                  if (intervals.current[job.id]) {
                                    if (intervals.current[job.id].interval) clearInterval(intervals.current[job.id].interval);
                                    if (intervals.current[job.id].timeout) clearTimeout(intervals.current[job.id].timeout);
                                  }
                                  // Then schedule the job
                                  scheduleJob(job);
                                });
                                
                                return updatedJobs;
                              });
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
              // When not in edit mode, settings, or creating new job, and API key exists, show a Mac-style list
              jobs.length > 0 && (
                <div className="pb-6">
                  <div className="rounded-lg overflow-hidden animate-in border-x-0 rounded-none">
                    {[...jobs].reverse().map((job, index) => (
                      <div 
                        key={job.id}
                        className={`flex items-center px-5 py-5 border-b border-border/50 hover:bg-accent transition-colors ${index === 0 ? 'border-t-0' : ''}`}
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
                              <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${job.lastMatchedCriteria 
                                ? 'bg-emerald-500 dark:bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.7)]' 
                                : 'bg-[#007AFF] dark:bg-[#007AFF] shadow-[0_0_4px_rgba(0,122,255,0.7)]'} 
                                animate-[subtle-pulse_1.5s_ease-in-out_infinite,scale_1.5s_ease-in-out_infinite] flex-shrink-0 origin-center`}></span>
                            )}
                            <h3 className="font-medium text-sm truncate" title={job.websiteUrl}>
                              {job.websiteUrl}
                            </h3>
                          </div>
                          
                          <div className="flex items-center mt-1 text-xs text-muted-foreground">
                          <div className="w-[7px] flex-shrink-0 mr-1"></div>
                          <span 
                            className="flex-shrink-0 cursor-default" 
                            title={job.lastRun ? `Checked ${formatTimeAgo(new Date(job.lastRun))}` : "Waiting for first check"}
                          >
                            {job.frequency === 'hourly' ? 'Hourly' : 
                             job.frequency === 'daily' ? `Daily at ${job.scheduledTime}` : 
                             job.frequency === 'weekly' ? `Weekly on ${job.dayOfWeek || 'Mon'} at ${job.scheduledTime}` : ''}
                          </span>
                            
                            <span className="mx-1.5 text-muted-foreground/40">•</span>
                            
                            {job.lastMatchedCriteria ? (
                              <span className="truncate" title={job.notificationCriteria}>
                                Matched: {job.notificationCriteria}
                              </span>
                            ) : (
                              <span className="truncate" title={job.notificationCriteria}>
                                {job.notificationCriteria}
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

            {/* New Job Form (only shown when not editing any job) */}
            {showNewJobForm && !editingJobId && (
              <TaskForm
                formData={newJob}
                testResult={testResult}
                loading={loading}
                onFormChange={setNewJob}
                onTest={testJob}
                onSave={(data) => {
                  if (data.websiteUrl && data.notificationCriteria) {
                    addJob(data);
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