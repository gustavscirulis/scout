import { DayOfWeek, RecurringFrequency } from '../../components/TaskForm'

export interface Task {
  id: string
  websiteUrl: string
  analysisPrompt: string
  frequency: RecurringFrequency
  scheduledTime: string
  dayOfWeek?: DayOfWeek
  isRunning: boolean
  lastResult?: string
  lastRun?: Date
  nextScheduledRun?: Date
  notificationCriteria: string
  lastMatchedCriteria?: boolean
  lastTestResult?: {
    result: string
    matched?: boolean
    timestamp?: string
    screenshot?: string
  }
}

export interface TaskFormData {
  websiteUrl: string
  analysisPrompt: string
  frequency: RecurringFrequency
  scheduledTime: string
  dayOfWeek?: DayOfWeek
  notificationCriteria: string
}

// Convert Date objects to strings for storage
const serializeTask = (task: Task): any => {
  return {
    ...task,
    lastRun: task.lastRun ? task.lastRun.toISOString() : undefined,
    nextScheduledRun: task.nextScheduledRun ? task.nextScheduledRun.toISOString() : undefined
  }
}

// Convert timestamp strings to Date objects
const deserializeTask = (task: any): Task => {
  return {
    ...task,
    lastRun: task.lastRun ? new Date(task.lastRun) : undefined,
    nextScheduledRun: task.nextScheduledRun ? new Date(task.nextScheduledRun) : undefined
  }
}

// Get all tasks from the electron store
export const getAllTasks = async (): Promise<Task[]> => {
  try {
    const electron = window.require('electron')
    const tasks = await electron.ipcRenderer.invoke('get-all-tasks')
    return Array.isArray(tasks) ? tasks.map(deserializeTask) : []
  } catch (error) {
    console.error('Failed to get tasks:', error)
    return []
  }
}

// Get a single task by ID
export const getTaskById = async (taskId: string): Promise<Task | null> => {
  try {
    const electron = window.require('electron')
    const task = await electron.ipcRenderer.invoke('get-task', taskId)
    return task ? deserializeTask(task) : null
  } catch (error) {
    console.error(`Failed to get task ${taskId}:`, error)
    return null
  }
}

// Add a new task
export const addTask = async (taskData: TaskFormData): Promise<Task> => {
  try {
    const electron = window.require('electron')
    const task: Task = {
      ...taskData,
      id: crypto.randomUUID(),
      isRunning: true,
    }
    await electron.ipcRenderer.invoke('add-task', serializeTask(task))
    return task
  } catch (error) {
    console.error('Failed to add task:', error)
    throw new Error('Failed to add task')
  }
}

// Update an existing task
export const updateTask = async (task: Task): Promise<Task> => {
  try {
    const electron = window.require('electron')
    await electron.ipcRenderer.invoke('update-task', serializeTask(task))
    return task
  } catch (error) {
    console.error(`Failed to update task ${task.id}:`, error)
    throw new Error('Failed to update task')
  }
}

// Delete a task
export const deleteTask = async (taskId: string): Promise<void> => {
  try {
    const electron = window.require('electron')
    await electron.ipcRenderer.invoke('delete-task', taskId)
  } catch (error) {
    console.error(`Failed to delete task ${taskId}:`, error)
    throw new Error('Failed to delete task')
  }
}

// Update task run results
export const updateTaskResults = async (
  taskId: string, 
  results: {
    lastResult?: string,
    lastRun?: Date,
    nextScheduledRun?: Date,
    lastMatchedCriteria?: boolean,
    lastTestResult?: {
      result: string,
      matched?: boolean,
      timestamp?: string,
      screenshot?: string
    }
  }
): Promise<Task | null> => {
  try {
    // First get the current task
    const task = await getTaskById(taskId)
    if (!task) return null

    // Update with new results, making sure to preserve all existing properties
    const updatedTask: Task = {
      ...task,
      lastResult: results.lastResult !== undefined ? results.lastResult : task.lastResult,
      lastRun: results.lastRun !== undefined ? results.lastRun : task.lastRun,
      nextScheduledRun: results.nextScheduledRun !== undefined ? results.nextScheduledRun : task.nextScheduledRun,
      lastMatchedCriteria: results.lastMatchedCriteria !== undefined ? results.lastMatchedCriteria : task.lastMatchedCriteria,
      lastTestResult: results.lastTestResult ? {
        ...task.lastTestResult,
        ...results.lastTestResult
      } : task.lastTestResult
    }
    
    // Double check that critical properties are preserved
    if (!updatedTask.websiteUrl || !updatedTask.notificationCriteria || updatedTask.id !== taskId) {
      console.error(`Critical task properties missing in update. ID: ${taskId}`)
      return null
    }
    
    // Save the updated task
    await updateTask(updatedTask)
    return updatedTask
  } catch (error) {
    console.error(`Failed to update task results for ${taskId}:`, error)
    return null
  }
}

// Toggle task running state
export const toggleTaskRunningState = async (taskId: string, isRunning: boolean): Promise<Task | null> => {
  try {
    const task = await getTaskById(taskId)
    if (!task) {
      console.error(`Task with ID ${taskId} not found when toggling running state`)
      return null
    }

    // Make a clean update, preserving all existing properties
    const updatedTask: Task = {
      ...task,
      id: task.id,
      websiteUrl: task.websiteUrl,
      analysisPrompt: task.analysisPrompt,
      frequency: task.frequency,
      scheduledTime: task.scheduledTime,
      dayOfWeek: task.dayOfWeek,
      notificationCriteria: task.notificationCriteria,
      lastResult: task.lastResult,
      lastRun: task.lastRun,
      lastMatchedCriteria: task.lastMatchedCriteria,
      lastTestResult: task.lastTestResult,
      isRunning: isRunning
    }

    // Double check that critical properties are preserved
    if (!updatedTask.websiteUrl || !updatedTask.notificationCriteria || updatedTask.id !== taskId) {
      console.error(`Critical task properties missing when toggling state for task ${taskId}`)
      return null
    }

    await updateTask(updatedTask)
    return updatedTask 
  } catch (error) {
    console.error(`Failed to toggle task state for ${taskId}:`, error)
    return null
  }
}

// Export default methods
export default {
  getAllTasks,
  getTaskById,
  addTask,
  updateTask,
  deleteTask,
  updateTaskResults,
  toggleTaskRunningState
}