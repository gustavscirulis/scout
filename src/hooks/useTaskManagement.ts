import { useEffect, useRef } from 'react'
import { Task, getAllTasks, addTask, updateTask, deleteTask, toggleTaskRunningState, updateTaskResults, getTaskById, TaskFormData } from '../lib/storage/tasks'
import { RecurringFrequency } from '../components/TaskForm'
import signals from '../lib/telemetry'
import { useStore } from '../lib/stores/useStore'

type RunAnalysisFunction = (task: Task) => Promise<void>

export const useTaskManagement = (runAnalysis: RunAnalysisFunction) => {
  const { tasks, setTasks } = useStore()
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
    console.log(`[Scheduler] Calculating next run time for task ${task.id} (${task.frequency} at ${task.scheduledTime})`)
    
    const [hours, minutes] = task.scheduledTime.split(':').map(Number)
    const now = new Date()
    const next = new Date()
    next.setHours(hours, minutes, 0, 0)

    if (task.frequency === 'hourly') {
      if (next <= now) {
        next.setHours(next.getHours() + 1);
        console.log(`[Scheduler] Hourly task ${task.id} scheduled for next hour: ${next.toLocaleString()}`)
      } else {
        console.log(`[Scheduler] Hourly task ${task.id} scheduled for this hour: ${next.toLocaleString()}`)
      }
    } else if (task.frequency === 'daily') {
      if (next <= now) {
        next.setDate(next.getDate() + 1)
        console.log(`[Scheduler] Daily task ${task.id} scheduled for tomorrow: ${next.toLocaleString()}`)
      } else {
        console.log(`[Scheduler] Daily task ${task.id} scheduled for today: ${next.toLocaleString()}`)
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
      console.log(`[Scheduler] Weekly task ${task.id} scheduled for ${next.toLocaleString()} (${task.dayOfWeek} at ${task.scheduledTime})`)
    }

    console.log(`[Scheduler] Task ${task.id} next run time set to: ${next.toLocaleString()}`)
    return next
  }

  const updateTaskNextRunTime = async (taskId: string, nextRun: Date): Promise<Task | null> => {
    try {
      console.log(`[Scheduler] updateTaskNextRunTime called for task ${taskId}, next run: ${nextRun.toLocaleString()}`)
      
      const task = await getTaskById(taskId)
      if (!task) {
        console.error(`[Scheduler] Task ${taskId} not found when updating next run time`)
        return null
      }
      
      const updatedTask: Task = {
        ...task,
        nextScheduledRun: nextRun
      }
      
      console.log(`[Scheduler] Saving task ${taskId} with next run time: ${nextRun.toLocaleString()}`)
      await updateTask(updatedTask)
      
      setTasks(tasks.map(t => t.id === taskId ? updatedTask : t))
      
      console.log(`[Scheduler] Task ${taskId} next run time updated successfully`)
      return updatedTask
    } catch (error) {
      console.error(`[Scheduler] Failed to update next run time for task ${taskId}:`, error)
      return null
    }
  }

  const startTaskPolling = () => {
    console.log('[Scheduler] Starting task polling')
    
    if (pollingInterval.current) {
      console.log('[Scheduler] Clearing existing polling interval')
      clearInterval(pollingInterval.current)
    }
    
    pollingInterval.current = setInterval(() => {
      console.log('[Scheduler] Polling interval triggered')
      checkTasksToRun()
    }, POLLING_INTERVAL)
    
    console.log('[Scheduler] Running initial task check')
    checkTasksToRun()
  }

  const checkTasksToRun = async () => {
    try {
      console.log(`[Scheduler] Reloading tasks from storage before checking`)
      const loadedTasks = await getAllTasks()
      console.log(`[Scheduler] Reloaded ${loadedTasks.length} tasks from storage`)
      
      loadedTasks.forEach(task => {
        console.log(`[Scheduler] Task ${task.id} details:`)
        console.log(`  isRunning: ${task.isRunning}`)
        console.log(`  scheduledTime: ${task.scheduledTime}`)
        console.log(`  frequency: ${task.frequency}`)
        console.log(`  nextScheduledRun: ${task.nextScheduledRun ? new Date(task.nextScheduledRun).toLocaleString() : 'not set'}`)
      })
      
      setTasks(loadedTasks)
      
      const now = new Date()
      console.log(`[Scheduler] Checking tasks at ${now.toLocaleTimeString()}`)
      
      const runningTasks = loadedTasks.filter(t => t.isRunning)
      console.log(`[Scheduler] There are ${runningTasks.length} running tasks of ${loadedTasks.length} total tasks`)
      
      if (runningTasks.length === 0) {
        console.log(`[Scheduler] No running tasks to check`)
        return
      }
      
      for (const task of runningTasks) {
        console.log(`[Scheduler] Processing task ${task.id}, isRunning=${task.isRunning}`)
        
        if (!task.nextScheduledRun) {
          console.log(`[Scheduler] Task ${task.id} has no next run time, calculating it now`)
          const nextRun = getNextRunTime(task)
          await updateTaskNextRunTime(task.id, nextRun)
          task.nextScheduledRun = nextRun
        }
        
        const nextRun = new Date(task.nextScheduledRun)
        const timeToRun = nextRun.getTime() - now.getTime()
        
        console.log(`[Scheduler] Task ${task.id} next run: ${nextRun.toLocaleString()} (in ${Math.floor(timeToRun/1000/60)} minutes ${Math.floor(timeToRun/1000) % 60} seconds)`)
        
        if (nextRun <= now) {
          console.log(`[Scheduler] TIME TO RUN task ${task.id} - scheduled: ${nextRun.toLocaleString()}, now: ${now.toLocaleString()}`)
          console.log(`[Scheduler] =================================================`)
          console.log(`[Scheduler] EXECUTING TASK ${task.id} NOW`)
          console.log(`[Scheduler] =================================================`)
          
          try {
            await runAnalysis(task)
            console.log(`[Scheduler] Task ${task.id} completed successfully`)
          } catch (error) {
            console.error(`[Scheduler] Error running task ${task.id}:`, error)
          } finally {
            console.log(`[Scheduler] Calculating next run time after task execution`)
            const newNextRun = getNextRunTime(task)
            await updateTaskNextRunTime(task.id, newNextRun)
          }
        } else {
          console.log(`[Scheduler] Task ${task.id} not yet due to run`)
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error in checkTasksToRun:', error)
    }
  }

  const stopTask = async (taskId: string) => {
    try {
      await toggleTaskRunningState(taskId, false)
      setTasks(tasks.map(task => 
        task.id === taskId ? { ...task, isRunning: false } : task
      ))
    } catch (error) {
      console.error('Failed to stop task:', error)
    }
  }

  const toggleTaskState = async (taskId: string) => {
    console.log(`[Scheduler] Toggling task state for ${taskId}`)
    const task = tasks.find(t => t.id === taskId)
    
    if (!task) {
      console.error(`[Scheduler] Task ${taskId} not found for toggle`)
      return
    }

    if (task.isRunning) {
      console.log(`[Scheduler] Stopping running task ${taskId}`)
      await stopTask(taskId)
      signals.taskStopped()
    } else {
      try {
        console.log(`[Scheduler] Starting task ${taskId}`)
        
        await toggleTaskRunningState(taskId, true)
        
        setTasks(tasks.map(t => 
          t.id === taskId ? { ...t, isRunning: true } : t
        ))
        
        signals.taskStarted()
        
        console.log(`[Scheduler] Calculating initial next run time for task ${taskId}`)
        const nextRun = getNextRunTime(task)
        await updateTaskNextRunTime(taskId, nextRun)
        
        console.log(`[Scheduler] Checking if task ${taskId} needs to run immediately`)
        await checkTasksToRun()
      } catch (error) {
        console.error(`[Scheduler] Failed to start task ${taskId}:`, error)
      }
    }
  }

  const removeTask = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      if (task && task.isRunning) {
        await stopTask(taskId)
      }
      
      await deleteTask(taskId)
      signals.taskDeleted()
      
      setTasks(tasks.filter(task => task.id !== taskId))
      
      try {
        const electron = window.require('electron');
        electron.ipcRenderer.invoke('update-tray-icon').catch((err: Error) => {
          console.error('Failed to update tray icon after task deletion:', err)
        });
      } catch (error) {
        // Silent fail if electron is not available in dev mode
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const createNewTask = async (taskData: TaskFormData, testResult: any) => {
    try {
      const newTaskData: TaskFormData & {
        lastTestResult?: {
          result: string;
          matched?: boolean;
          timestamp?: string;
          screenshot?: string;
        };
        lastResult?: string;
        lastRun?: Date;
        lastMatchedCriteria?: boolean;
      } = {
        ...taskData
      };
      
      if (testResult) {
        newTaskData.lastTestResult = {
          result: testResult.result,
          matched: testResult.matched,
          timestamp: testResult.timestamp?.toISOString(),
          screenshot: testResult.screenshot
        };
        
        newTaskData.lastResult = testResult.result;
        newTaskData.lastRun = testResult.timestamp;
        newTaskData.lastMatchedCriteria = testResult.matched;
      }
      
      const newTask = await addTask(newTaskData);
      console.log(`[Scheduler] Created new task ${newTask.id}, isRunning=${newTask.isRunning}`)
      
      signals.taskCreated(taskData.frequency);
      
      setTasks([...tasks, newTask]);
      
      console.log(`[Scheduler] Setting initial next run time for new task ${newTask.id}`)
      const nextRun = getNextRunTime(newTask)
      await updateTaskNextRunTime(newTask.id, nextRun);
      
      console.log(`[Scheduler] Checking tasks after creating new task ${newTask.id}`)
      await checkTasksToRun();
      
      if (testResult?.matched) {
        try {
          const electron = window.require('electron');
          electron.ipcRenderer.invoke('update-tray-icon').catch((err: Error) => {
            console.error('Failed to update tray icon after task creation:', err)
          });
        } catch (error) {
          // Silent fail if electron is not available in dev mode
        }
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      throw error;
    }
  }

  const updateExistingTask = async (taskId: string, updatedTaskData: TaskFormData) => {
    try {
      console.log(`[Scheduler] Updating task ${taskId} with new settings`)
      
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        console.error(`[Scheduler] Task ${taskId} not found for updating`)
        return;
      }
      
      const wasRunning = task.isRunning;
      console.log(`[Scheduler] Task ${taskId} was running: ${wasRunning}`)
      
      if (wasRunning) {
        await stopTask(taskId);
      }
      
      const criteriaChanged = task.notificationCriteria !== updatedTaskData.notificationCriteria;
      
      const scheduleChanged = 
        task.frequency !== updatedTaskData.frequency ||
        task.scheduledTime !== updatedTaskData.scheduledTime ||
        task.dayOfWeek !== updatedTaskData.dayOfWeek;
        
      if (scheduleChanged) {
        console.log(`[Scheduler] Task ${taskId} schedule changed:`)
        console.log(`[Scheduler] - Frequency: ${task.frequency} -> ${updatedTaskData.frequency}`)
        console.log(`[Scheduler] - Time: ${task.scheduledTime} -> ${updatedTaskData.scheduledTime}`)
        console.log(`[Scheduler] - Day: ${task.dayOfWeek} -> ${updatedTaskData.dayOfWeek}`)
      }
      
      const updatedTask: Task = {
        ...task,
        websiteUrl: updatedTaskData.websiteUrl,
        analysisPrompt: updatedTaskData.analysisPrompt,
        frequency: updatedTaskData.frequency,
        scheduledTime: updatedTaskData.scheduledTime,
        dayOfWeek: updatedTaskData.dayOfWeek,
        notificationCriteria: updatedTaskData.notificationCriteria,
        lastResult: criteriaChanged ? undefined : task.lastResult,
        lastMatchedCriteria: criteriaChanged ? undefined : task.lastMatchedCriteria,
        lastTestResult: criteriaChanged ? undefined : task.lastTestResult,
        nextScheduledRun: undefined
      };
      
      console.log(`[Scheduler] Saving updated task ${taskId} to storage`)
      await updateTask(updatedTask);
      
      signals.taskEdited(updatedTask.frequency);
      
      setTasks(tasks.map(t => t.id === taskId ? updatedTask : t));
      
      if (wasRunning) {
        console.log(`[Scheduler] Restarting task ${taskId} after update`)
        await toggleTaskRunningState(taskId, true);
      } else {
        console.log(`[Scheduler] Task ${taskId} was not running, leaving it stopped after update`)
      }
      
      try {
        const electron = window.require('electron');
        electron.ipcRenderer.invoke('update-tray-icon').catch((err: Error) => {
          console.error('Failed to update tray icon after task update:', err)
        });
      } catch (error) {
        // Silent fail if electron is not available in dev mode
      }
    } catch (error) {
      console.error('Failed to update task:', error);
      throw error;
    }
  }

  // Load tasks from storage and check for tasks to run
  useEffect(() => {
    const loadTasks = async () => {
      try {
        console.log('[Scheduler] Loading tasks')
        const loadedTasks = await getAllTasks()
        console.log(`[Scheduler] Loaded ${loadedTasks.length} tasks`)
        setTasks(loadedTasks)
        
        const promises = loadedTasks.map(async (task) => {
          if (task.isRunning) {
            console.log(`[Scheduler] Processing running task ${task.id}`)
            
            if (checkForMissedRuns(task)) {
              console.log(`[Scheduler] Task ${task.id} missed a run, executing now`)
              await runAnalysis(task)
            }
            
            if (!task.nextScheduledRun) {
              console.log(`[Scheduler] Setting next run time for task ${task.id}`)
              const nextRun = getNextRunTime(task)
              await updateTaskNextRunTime(task.id, nextRun)
            } else {
              console.log(`[Scheduler] Task ${task.id} next run already scheduled for ${new Date(task.nextScheduledRun).toLocaleString()}`)
            }
          }
        })
        
        await Promise.all(promises)
        
        console.log('[Scheduler] All tasks processed, starting polling mechanism')
        startTaskPolling()
      } catch (error) {
        console.error('[Scheduler] Failed to load tasks:', error)
      }
    }
    
    loadTasks()
    
    return () => {
      if (pollingInterval.current) {
        console.log('[Scheduler] Cleaning up polling interval on unmount')
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