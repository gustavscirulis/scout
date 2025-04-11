import { Task, updateTaskResults } from '../storage/tasks'
import { validateApiKey } from '../utils'
import signals from '../telemetry'
import { runTaskAnalysis, VisionProvider } from '../vision'
import { sendNotification } from './notification'
import { logger } from '../utils/logger'

export class AnalysisService {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async runAnalysis(task: Task, settings: { visionProvider: VisionProvider }): Promise<void> {
    logger.log('========================================', { context: 'Analysis' })
    logger.log(`STARTING ANALYSIS FOR TASK ${task.id}`, { context: 'Analysis' })
    logger.log('========================================', { context: 'Analysis' })
    logger.log(`Website URL: ${task.websiteUrl}`, { context: 'Analysis' })
    logger.log(`Prompt: ${task.analysisPrompt}`, { context: 'Analysis' })
    logger.log(`Criteria: ${task.notificationCriteria}`, { context: 'Analysis' })
    logger.log(`Provider: ${settings.visionProvider}`, { context: 'Analysis' })
    
    // Get current API key
    let currentApiKey = this.apiKey

    if (settings.visionProvider === 'openai') {
      try {
        currentApiKey = this.apiKey || await window.require('electron').ipcRenderer.invoke('get-api-key')
        
        if (!currentApiKey) {
          logger.error('No API key available after loading attempt', undefined, { context: 'Analysis' })
          throw new Error('Please set your OpenAI API key in settings')
        }
        
        // Validate API key
        logger.log('Validating API key', { context: 'Analysis' })
        const validation = validateApiKey(currentApiKey)
        if (!validation.isValid) {
          logger.error(`Invalid API key: ${validation.message}`, undefined, { context: 'Analysis' })
          throw new Error(validation.message || 'Invalid API key')
        }
        
        logger.log(`API key validated for task ${task.id}, proceeding with analysis`, { context: 'Analysis' })
      } catch (error) {
        logger.error('Error during API key validation', error as Error, { context: 'Analysis' })
        throw error
      }
    }

    try {
      logger.log(`Starting analysis execution for task ${task.id}`, { context: 'Analysis' })
      
      // Use the new task analysis function from the vision module
      const analysisResult = await runTaskAnalysis(settings.visionProvider, currentApiKey, task)
      logger.log(`Analysis completed with result: ${analysisResult}`, { context: 'Analysis' })
      
      if (analysisResult.error) {
        logger.error(`Task ${task.id} failed with error: ${analysisResult.error}`, undefined, { context: 'Analysis' })
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
      
      logger.log(`Updating task ${task.id} with results`, { context: 'Analysis' })
      // Update the task with results
      const updatedTask = await updateTaskResults(task.id, {
        lastResult: formattedResult,
        lastRun: now,
        lastMatchedCriteria: criteriaMatched,
        lastTestResult: resultData
      })

      if (!updatedTask) {
        logger.error(`Failed to update task ${task.id} with results`, undefined, { context: 'Analysis' })
        throw new Error('Failed to update task results')
      }

      logger.log(`Successfully updated task ${task.id}`, { context: 'Analysis' })
      
      // Only send notification if criteria matched
      if (criteriaMatched === true) {
        logger.log(`Criteria matched for task ${task.id}, sending notification`, { context: 'Analysis' })
        sendNotification(updatedTask, formattedResult)
      } else {
        logger.log(`Criteria not matched for task ${task.id}, no notification`, { context: 'Analysis' })
      }
      
      // Update tray icon if criteria matched state changed
      try {
        logger.log(`Updating tray icon for task ${task.id}`, { context: 'Analysis' })
        const electron = window.require('electron')
        electron.ipcRenderer.invoke('update-tray-icon').catch((err: Error) => {
          logger.error('Failed to update tray icon', err, { context: 'Analysis' })
        })
      } catch (error) {
        logger.error('Error updating tray icon', error as Error, { context: 'Analysis' })
        // Silent fail if electron is not available in dev mode
      }
      
      // Track successful analysis with telemetry
      // No longer tracking analysis run
    } catch (error) {
      logger.error(`Error during task execution for ${task.id}`, error as Error, { context: 'Analysis' })
      throw error
    }
  }
} 