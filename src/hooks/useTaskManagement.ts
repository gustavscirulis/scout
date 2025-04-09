import { useEffect, useRef } from 'react'
import { Task, getAllTasks, addTask, updateTask, deleteTask, toggleTaskRunningState, updateTaskResults, getTaskById, TaskFormData } from '../lib/storage/tasks'
import { RecurringFrequency } from '../components/TaskForm'
import signals from '../lib/telemetry'
import { useStore } from '../lib/stores/useStore'

type RunAnalysisFunction = (task: Task) => Promise<void>

export const useTaskManagement = (runAnalysis: RunAnalysisFunction) => {
  const { 
    tasks, 
    setTasks, 
    setNewJob, 
    resetNewJobForm,
    setTestResult 
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
    next.setHours(hours, minutes, 0, 0)

    if (task.frequency === 'hourly') {
      if (next <= now) {
        next.setHours(next.getHours() + 1);
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
      
      if (updatedTask) {
        setTasks(tasks.map(t => t.id === taskId ? updatedTask : t))
      }
      return updatedTask
    } catch (error) {
      console.error(`Failed to update next run time for task ${taskId}:`, error)
      return null
    }
  }

  const startTaskPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current)
    }

    pollingInterval.current = setInterval(async () => {
      await checkTasksToRun()
    }, POLLING_INTERVAL)
  }

  const checkTasksToRun = async () => {
    try {
      const loadedTasks = await getAllTasks()
      setTasks(loadedTasks)
      
      const now = new Date()
      const runningTasks = loadedTasks.filter(t => t.isRunning)
      
      if (runningTasks.length === 0) return
      
      for (const task of runningTasks) {
        if (task.nextScheduledRun) {
          const nextRun = new Date(task.nextScheduledRun)
          if (nextRun <= now) {
            await runAnalysis(task)
            const nextRunTime = getNextRunTime(task)
            await updateTaskNextRunTime(task.id, nextRunTime)
          }
        } else if (checkForMissedRuns(task)) {
          await runAnalysis(task)
          const nextRunTime = getNextRunTime(task)
          await updateTaskNextRunTime(task.id, nextRunTime)
        }
      }
    } catch (error) {
      console.error('Failed to check tasks:', error)
    }
  }

  const stopTask = async (taskId: string) => {
    try {
      const updatedTask = await toggleTaskRunningState(taskId, false)
      if (updatedTask) {
        setTasks(tasks.map(t => t.id === taskId ? updatedTask : t))
      }
    } catch (error) {
      console.error(`Failed to stop task ${taskId}:`, error)
    }
  }

  const toggleTaskState = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return

      const updatedTask = await toggleTaskRunningState(taskId, !task.isRunning)
      if (updatedTask) {
        setTasks(tasks.map(t => t.id === taskId ? updatedTask : t))
        
        if (updatedTask.isRunning) {
          const nextRunTime = getNextRunTime(updatedTask)
          await updateTaskNextRunTime(taskId, nextRunTime)
        }
      }
    } catch (error) {
      console.error(`Failed to toggle task ${taskId}:`, error)
    }
  }

  const removeTask = async (taskId: string) => {
    try {
      await deleteTask(taskId)
      setTasks(tasks.filter(t => t.id !== taskId))
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const createNewTask = async (taskData: TaskFormData, testResult: any) => {
    try {
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
        nextScheduledRun: undefined,
        lastResult: testResult?.result,
        lastMatchedCriteria: testResult?.matched,
        lastTestResult: testResult ? {
          result: testResult.result,
          matched: testResult.matched,
          timestamp: testResult.timestamp?.toISOString(),
          screenshot: testResult.screenshot
        } : undefined
      }

      const savedTask = await addTask(newTask)
      setTasks([...tasks, savedTask])
      signals.taskCreated()

      const nextRunTime = getNextRunTime(savedTask)
      await updateTaskNextRunTime(savedTask.id, nextRunTime)
    } catch (error) {
      console.error('Failed to create new task:', error)
      throw error
    }
  }

  const updateExistingTask = async (taskId: string, taskData: TaskFormData) => {
    try {
      const task = await getTaskById(taskId)
      if (!task) return

      const updatedTask = await updateTask({
        ...taskData,
        id: taskId,
        isRunning: true
      })
      
      if (updatedTask) {
        setTasks(tasks.map(t => t.id === taskId ? updatedTask : t))
      }
    } catch (error) {
      console.error('Failed to update task:', error)
    }
  }

  // Load tasks from storage and check for tasks to run
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const loadedTasks = await getAllTasks()
        setTasks(loadedTasks)
        
        const promises = loadedTasks.map(async (task) => {
          if (task.isRunning) {
            if (checkForMissedRuns(task)) {
              await runAnalysis(task)
            }
            
            if (!task.nextScheduledRun) {
              const nextRun = getNextRunTime(task)
              await updateTaskNextRunTime(task.id, nextRun)
            }
          }
        })
        
        await Promise.all(promises)
        startTaskPolling()
      } catch (error) {
        console.error('Failed to load tasks:', error)
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