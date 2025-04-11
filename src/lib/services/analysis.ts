import { Task, updateTaskResults } from '../storage/tasks'
import { validateApiKey } from '../utils'
import signals from '../telemetry'
import { runTaskAnalysis, VisionProvider } from '../vision'
import { sendNotification } from './notification'

export class AnalysisService {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async runAnalysis(task: Task, settings: { visionProvider: VisionProvider }): Promise<void> {
    console.log(`[Analysis] ========================================`)
    console.log(`[Analysis] STARTING ANALYSIS FOR TASK ${task.id}`)
    console.log(`[Analysis] ========================================`)
    console.log(`[Analysis] Website URL: ${task.websiteUrl}`)
    console.log(`[Analysis] Prompt: ${task.analysisPrompt}`)
    console.log(`[Analysis] Criteria: ${task.notificationCriteria}`)
    console.log(`[Analysis] Provider: ${settings.visionProvider}`)
    
    // Get current API key
    let currentApiKey = this.apiKey

    if (settings.visionProvider === 'openai') {
      try {
        currentApiKey = this.apiKey || await window.require('electron').ipcRenderer.invoke('get-api-key')
        
        if (!currentApiKey) {
          console.error('[Analysis] No API key available after loading attempt')
          throw new Error('Please set your OpenAI API key in settings')
        }
        
        // Validate API key
        console.log('[Analysis] Validating API key')
        const validation = validateApiKey(currentApiKey)
        if (!validation.isValid) {
          console.error('[Analysis] Invalid API key:', validation.message)
          throw new Error(validation.message || 'Invalid API key')
        }
        
        console.log(`[Analysis] API key validated for task ${task.id}, proceeding with analysis`)
      } catch (error) {
        console.error('[Analysis] Error during API key validation:', error)
        throw error
      }
    }

    try {
      console.log(`[Analysis] Starting analysis execution for task ${task.id}`)
      
      // Use the new task analysis function from the vision module
      const analysisResult = await runTaskAnalysis(settings.visionProvider, currentApiKey, task)
      console.log(`[Analysis] Analysis completed with result:`, analysisResult)
      
      if (analysisResult.error) {
        console.error(`[Analysis] Task ${task.id} failed with error:`, analysisResult.error)
        throw new Error(analysisResult.error)
      }
      
      // Format the result and create timestamp
      const formattedResult = analysisResult.result
      const criteriaMatched = analysisResult.matched
      const now = new Date()
      
      // Create lastTestResult-compatible object for scheduled runs
      const resultData = {
        result: formattedResult,
        matched: criteriaMatched,
        timestamp: now.toISOString(),
        screenshot: analysisResult.screenshot
      }
      
      console.log(`[Analysis] Updating task ${task.id} with results`)
      // Update the task with results
      const updatedTask = await updateTaskResults(task.id, {
        lastResult: formattedResult,
        lastRun: now,
        lastMatchedCriteria: criteriaMatched,
        lastTestResult: resultData
      })

      if (!updatedTask) {
        console.error(`[Analysis] Failed to update task ${task.id} with results`)
        throw new Error('Failed to update task results')
      }

      console.log(`[Analysis] Successfully updated task ${task.id}`)
      
      // Only send notification if criteria matched
      if (criteriaMatched === true) {
        console.log(`[Analysis] Criteria matched for task ${task.id}, sending notification`)
        sendNotification(updatedTask, formattedResult)
      } else {
        console.log(`[Analysis] Criteria not matched for task ${task.id}, no notification`)
      }
      
      // Update tray icon if criteria matched state changed
      try {
        console.log(`[Analysis] Updating tray icon for task ${task.id}`)
        const electron = window.require('electron')
        electron.ipcRenderer.invoke('update-tray-icon').catch((err: Error) => {
          console.error('[Analysis] Failed to update tray icon:', err)
        })
      } catch (error) {
        console.error('[Analysis] Error updating tray icon:', error)
        // Silent fail if electron is not available in dev mode
      }
      
      // Track successful analysis with telemetry
      // No longer tracking analysis run
    } catch (error) {
      console.error(`[Analysis] Error during task execution for ${task.id}:`, error)
      throw error
    }
  }
} 