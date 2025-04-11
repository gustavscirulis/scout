import { useEffect, useRef } from 'react'
import { Task, getAllTasks, addTask, updateTask, deleteTask, toggleTaskRunningState, updateTaskResults, getTaskById, TaskFormData } from '../lib/storage/tasks'
import { RecurringFrequency } from '../components/TaskForm'
import signals from '../lib/telemetry'
import { useStore } from '../lib/stores/useStore'

type RunAnalysisFunction = (task: Task) => Promise<void>

export const useTaskManagement = (runAnalysis: RunAnalysisFunction) => {
  const { 
    tasks, 
    syncTasks,
    setNewJob, 
    resetNewJobForm,
    setTestResult,
    setError
  } = useStore()
  const pollingInterval = useRef<NodeJS.Timeout | null>(null)
  const POLLING_INTERVAL = 60 * 1000 // check every minute

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
    
    return timeSinceLastRun > interval;
  };

  const getNextRunTime = (task: Task) => {
    const [hours, minutes] = task.scheduledTime.split(':').map(Number)
    const now = new Date()
    const next = new Date()
    
    // Set the time in the local timezone
    next.setHours(hours, minutes, 0, 0)

    if (task.frequency === 'hourly') {
      if (next <= now) {
        next.setHours(next.getHours() + 1)
      }
    } else if (task.frequency === 'daily') {
      if (next <= now) {
        next.setDate(next.getDate() + 1)
      }
    } else if (task.frequency === 'weekly') {
      const dayMap: Record<string, number> = {
        mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0
      }
      const targetDay = dayMap[task.dayOfWeek || 'mon']
      const currentDay = now.getDay()
      
      let daysToAdd = targetDay - currentDay
      if (daysToAdd < 0) daysToAdd += 7
      
      if (daysToAdd === 0 && next <= now) daysToAdd = 7
      
      next.setDate(next.getDate() + daysToAdd)
    }

    return next
  }

  const updateTaskNextRunTime = async (taskId: string, nextRun: Date): Promise<Task | null> => {
    try {
      const task = await getTaskById(taskId)
      if (!task) return null
      
      const updatedTask = await updateTask({
        ...task,
        nextScheduledRun: nextRun
      })
      
      await syncTasks()
      return updatedTask
    } catch (error) {
      console.error(`Failed to update next run time for task ${taskId}:`, error)
      setError(error instanceof Error ? error.message : 'Failed to update task')
      return null
    }
  }

  const startTaskPolling = () => {
    console.log('[Task Polling] Starting polling with interval:', POLLING_INTERVAL, 'ms')
    if (pollingInterval.current) {
      console.log('[Task Polling] Clearing existing polling interval')
      clearInterval(pollingInterval.current)
    }
    pollingInterval.current = setInterval(checkTasksToRun, POLLING_INTERVAL)
    console.log('[Task Polling] Polling started successfully')
  }

  const checkTasksToRun = async () => {
    try {
      console.log('[Task Polling] Checking for tasks to run at', new Date().toISOString())
      
      // First sync tasks and wait for the state to update
      await syncTasks()
      
      // Get the latest state after sync
      const currentTasks = useStore.getState().tasks
      
      console.log('[Task Polling] Current tasks state:', {
        totalTasks: currentTasks.length,
        tasks: currentTasks.map(t => ({
          id: t.id,
          isRunning: t.isRunning,
          frequency: t.frequency,
          nextScheduledRun: t.nextScheduledRun,
          lastRun: t.lastRun
        }))
      })
      
      const now = new Date()
      const runningTasks = currentTasks.filter(t => t.isRunning)
      
      if (runningTasks.length === 0) {
        console.log('[Task Polling] No running tasks found')
        return
      }
      
      console.log(`[Task Polling] Found ${runningTasks.length} running tasks`)
      
      for (const task of runningTasks) {
        console.log(`[Task Polling] Checking task ${task.id}:`, {
          frequency: task.frequency,
          nextScheduledRun: task.nextScheduledRun,
          lastRun: task.lastRun,
          isRunning: task.isRunning,
          currentTime: now.toISOString()
        })
        
        if (task.nextScheduledRun) {
          const nextRun = new Date(task.nextScheduledRun)
          console.log(`[Task Polling] Task ${task.id} next run time:`, {
            nextRun: nextRun.toISOString(),
            currentTime: now.toISOString(),
            timeDifference: nextRun.getTime() - now.getTime()
          })
          
          if (nextRun.getTime() <= now.getTime()) {
            console.log(`[Task Polling] Task ${task.id} is due to run (scheduled for ${nextRun.toISOString()})`)
            await runAnalysis(task)
            const nextRunTime = getNextRunTime(task)
            await updateTaskNextRunTime(task.id, nextRunTime)
          } else {
            console.log(`[Task Polling] Task ${task.id} not due yet (next run: ${nextRun.toISOString()})`)
          }
        } else if (checkForMissedRuns(task)) {
          console.log(`[Task Polling] Task ${task.id} has missed runs, running now`)
          await runAnalysis(task)
          const nextRunTime = getNextRunTime(task)
          await updateTaskNextRunTime(task.id, nextRunTime)
        } else {
          console.log(`[Task Polling] Task ${task.id} has no next run time and no missed runs`)
        }
      }
    } catch (error) {
      console.error('[Task Polling] Failed to check tasks:', error)
      setError(error instanceof Error ? error.message : 'Failed to check tasks')
    }
  }

  const stopTask = async (taskId: string) => {
    try {
      const updatedTask = await toggleTaskRunningState(taskId, false)
      if (updatedTask) {
        await syncTasks()
      }
    } catch (error) {
      console.error(`Failed to stop task ${taskId}:`, error)
      setError(error instanceof Error ? error.message : 'Failed to stop task')
    }
  }

  const toggleTaskState = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      const updatedTask = await toggleTaskRunningState(taskId, !task.isRunning)
      if (updatedTask) {
        await syncTasks()
        
        if (updatedTask.isRunning) {
          const nextRunTime = getNextRunTime(updatedTask)
          await updateTaskNextRunTime(taskId, nextRunTime)
          await syncTasks() // Refresh state after updating next run time
        }
      }
    } catch (error) {
      console.error(`Failed to toggle task ${taskId}:`, error)
      setError(error instanceof Error ? error.message : 'Failed to toggle task')
    }
  }

  const removeTask = async (taskId: string) => {
    try {
      await deleteTask(taskId)
      await syncTasks()
    } catch (error) {
      console.error('Failed to delete task:', error)
      setError(error instanceof Error ? error.message : 'Failed to delete task')
      throw error
    }
  }

  const createNewTask = async (taskData: TaskFormData, testResult: any) => {
    try {
      const nextRunTime = getNextRunTime({
        ...taskData,
        id: '', // temporary ID for calculation
        isRunning: true,
        lastRun: undefined,
        nextScheduledRun: undefined,
        lastResult: undefined,
        lastMatchedCriteria: undefined,
        lastTestResult: undefined
      })

      console.log('[Task Creation] Creating new task with next run time:', {
        nextRunTime: nextRunTime.toISOString(),
        taskData
      })

      const newTask: Task = {
        id: self.crypto.randomUUID(),
        websiteUrl: taskData.websiteUrl,
        notificationCriteria: taskData.notificationCriteria,
        analysisPrompt: taskData.analysisPrompt,
        frequency: taskData.frequency,
        scheduledTime: taskData.scheduledTime,
        dayOfWeek: taskData.dayOfWeek,
        isRunning: true,
        lastRun: undefined,
        nextScheduledRun: nextRunTime,
        lastResult: testResult?.result,
        lastMatchedCriteria: testResult?.matched,
        lastTestResult: testResult ? {
          result: testResult.result,
          matched: testResult.matched,
          timestamp: testResult.timestamp?.toISOString(),
          screenshot: testResult.screenshot
        } : undefined
      }

      console.log('[Task Creation] New task created:', {
        id: newTask.id,
        isRunning: newTask.isRunning,
        nextScheduledRun: newTask.nextScheduledRun
      })

      const savedTask = await addTask(newTask)
      console.log('[Task Creation] Task saved to storage:', {
        id: savedTask.id,
        isRunning: savedTask.isRunning,
        nextScheduledRun: savedTask.nextScheduledRun
      })

      await syncTasks()
      signals.taskCreated()
    } catch (error) {
      console.error('Failed to create new task:', error)
      setError(error instanceof Error ? error.message : 'Failed to create task')
      throw error
    }
  }

  const updateExistingTask = async (taskId: string, taskData: TaskFormData) => {
    try {
      const task = await getTaskById(taskId)
      if (!task) {
        console.error(`Task with ID ${taskId} not found for update`)
        return
      }

      console.log('[Task Update] Updating task:', {
        id: taskId,
        currentState: {
          isRunning: task.isRunning,
          nextScheduledRun: task.nextScheduledRun
        },
        newData: taskData
      })

      // Calculate next run time based on the new task data
      const nextRunTime = getNextRunTime({
        ...taskData,
        id: taskId,
        isRunning: task.isRunning, // Preserve the current running state
        lastRun: task.lastRun,
        nextScheduledRun: undefined
      })

      // Create updated task with preserved state
      const updatedTask = await updateTask({
        ...taskData,
        id: taskId,
        isRunning: task.isRunning, // Preserve the current running state
        lastRun: task.lastRun,
        nextScheduledRun: nextRunTime,
        lastResult: undefined, // Clear previous results when criteria changes
        lastMatchedCriteria: undefined, // Clear previous match state
        lastTestResult: undefined // Clear previous test results
      })
      
      if (updatedTask) {
        console.log('[Task Update] Task updated successfully:', {
          id: taskId,
          isRunning: updatedTask.isRunning,
          nextScheduledRun: updatedTask.nextScheduledRun
        })
        await syncTasks()
      }
    } catch (error) {
      console.error('Failed to update task:', error)
      setError(error instanceof Error ? error.message : 'Failed to update task')
    }
  }

  // Load tasks from storage and check for tasks to run
  useEffect(() => {
    const loadTasks = async () => {
      try {
        console.log('[Task Loading] Starting initial task load')
        await syncTasks()
        
        console.log('[Task Loading] Current tasks after sync:', {
          totalTasks: tasks.length,
          tasks: tasks.map(t => ({
            id: t.id,
            isRunning: t.isRunning,
            nextScheduledRun: t.nextScheduledRun
          }))
        })
        
        const promises = tasks.map(async (task) => {
          if (task.isRunning) {
            if (checkForMissedRuns(task)) {
              console.log(`[Task Loading] Task ${task.id} has missed runs, running now`)
              await runAnalysis(task)
            }
            
            if (!task.nextScheduledRun) {
              console.log(`[Task Loading] Task ${task.id} has no next run time, calculating next run`)
              const nextRun = getNextRunTime(task)
              await updateTaskNextRunTime(task.id, nextRun)
            }
          }
        })
        
        await Promise.all(promises)
        startTaskPolling()
      } catch (error) {
        console.error('Failed to load tasks:', error)
        setError(error instanceof Error ? error.message : 'Failed to load tasks')
      }
    }
    
    loadTasks()
    
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current)
      }
    }
  }, [])

  return {
    toggleTaskState,
    removeTask,
    createNewTask,
    updateExistingTask,
    stopTask,
    checkTasksToRun
  }
} 