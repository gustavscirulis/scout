import { Task } from '../storage/tasks'
import { getAnalysisPrompt } from '../prompts'

export type VisionProvider = 'openai' | 'llama'

// Common interface for vision results
export interface VisionResult {
  analysis: string
  criteriaMatched: boolean
}

// Setup image analysis with OpenAI
async function analyzeWithOpenAI(
  apiKey: string,
  screenshot: string,
  notificationCriteria: string
): Promise<VisionResult> {
  // Construct a focused prompt that directly evaluates the notification criteria
  const promptText = getAnalysisPrompt(notificationCriteria) + `

Return your response in this JSON format:
{
  "analysis": "A clear, concise summary of what you see on the page related to the condition",
  "criteriaMatched": true/false
}`;
  
  const { ipcRenderer } = window.require('electron');
  
  try {
    const resultContent = await ipcRenderer.invoke('call-openai-api', {
      apiKey,
      prompt: promptText,
      screenshot
    });
    
    return JSON.parse(resultContent);
  } catch (error) {
    throw new Error(`Failed to analyze with OpenAI: ${error}`);
  }
}

// Setup image analysis with Llama via Ollama
async function analyzeWithLlama(
  screenshot: string,
  notificationCriteria: string
): Promise<VisionResult> {
  // Create a temporary file for the screenshot
  const { ipcRenderer } = window.require('electron')
  const tempFilePath = await ipcRenderer.invoke('save-temp-screenshot', screenshot)
  
  // Construct a focused prompt that directly evaluates the notification criteria
  const promptText = getAnalysisPrompt(notificationCriteria) + `

Return your response in this JSON format:
{
  "analysis": "A clear, concise summary of what you see on the page related to the condition",
  "criteriaMatched": true/false
}`;
  
  try {
    // Call Ollama via IPC - using llama3.2-vision
    const result = await ipcRenderer.invoke('run-ollama', {
      model: 'llama3.2-vision',  // Using Llama 3.2 vision model for multimodal support
      prompt: promptText,
      imagePath: tempFilePath
    })
    
    console.log('Llama raw response:', result)
    
    try {
      // Try to parse the response as JSON directly
      try {
        return JSON.parse(result)
      } catch (error) {
        // If direct parsing fails, try to extract JSON using regex
        const jsonMatch = result.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const extractedJson = jsonMatch[0]
          console.log('Extracted JSON from Llama response:', extractedJson)
          return JSON.parse(extractedJson)
        }
        
        // If that fails too, create a minimal response
        console.log('Fallback: creating synthetic result from Llama text response')
        return {
          analysis: result.substring(0, 500), // Use the raw text as analysis
          criteriaMatched: result.toLowerCase().includes('true') && 
                          !result.toLowerCase().includes('false') // Simple heuristic
        }
      }
    } catch (error) {
      console.error('Failed to parse Llama response:', error)
      throw new Error(`Failed to parse Llama response: ${error}`)
    }
  } finally {
    // Clean up temporary file
    ipcRenderer.invoke('delete-temp-file', tempFilePath).catch(console.error)
  }
}

// Helper function to clean up analysis text
function cleanAnalysisText(result: VisionResult): VisionResult {
  if (!result.analysis) return result;
  
  // Just remove any extra quotes that might be in the response
  // but keep the full text otherwise
  const analysis = result.analysis.trim().replace(/^["']|["']$/g, '');
  
  return {
    ...result,
    analysis: analysis
  };
}

// Function to analyze an image based on selected provider
export async function analyzeImage(
  provider: VisionProvider,
  apiKey: string,
  screenshot: string,
  notificationCriteria: string
): Promise<VisionResult> {
  let result;
  if (provider === 'openai') {
    result = await analyzeWithOpenAI(apiKey, screenshot, notificationCriteria);
  } else {
    result = await analyzeWithLlama(screenshot, notificationCriteria);
  }
  
  // Just clean up the text slightly (remove extra quotes) but show full response
  return cleanAnalysisText(result);
}

// Function to test analysis of a task
export async function testAnalysis(
  provider: VisionProvider, 
  apiKey: string,
  websiteUrl: string,
  notificationCriteria: string
): Promise<{
  result: string;
  matched?: boolean;
  timestamp: Date;
  screenshot?: string;
}> {
  const { ipcRenderer } = window.require('electron')
  // Ensure URL has protocol prefix for the screenshot function
  const normalizedUrl = (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) 
    ? `http://${websiteUrl}` 
    : websiteUrl

  let screenshot
  try {
    screenshot = await ipcRenderer.invoke('take-screenshot', normalizedUrl)
  } catch (error) {
    console.error('Screenshot failed:', error)
    throw new Error(`Could not capture screenshot from ${normalizedUrl}. Please check if the website is accessible.`)
  }
  
  try {
    const result = await analyzeImage(provider, apiKey, screenshot, notificationCriteria)
    
    return {
      result: result.analysis,
      matched: result.criteriaMatched,
      timestamp: new Date(),
      screenshot
    }
  } catch (error) {
    throw error
  }
}

// Function to execute full analysis for a scheduled task
export async function runTaskAnalysis(
  provider: VisionProvider,
  apiKey: string,
  task: Task
): Promise<{
  result: string;
  matched?: boolean;
  timestamp: Date;
  screenshot?: string;
}> {
  const { ipcRenderer } = window.require('electron')
  // Ensure URL has protocol prefix
  const websiteUrl = (!task.websiteUrl.startsWith('http://') && !task.websiteUrl.startsWith('https://')) 
    ? `http://${task.websiteUrl}` 
    : task.websiteUrl
  
  let screenshot
  try {
    screenshot = await ipcRenderer.invoke('take-screenshot', websiteUrl)
  } catch (error) {
    throw new Error(`Could not capture screenshot from ${websiteUrl}. Please check if the website is accessible.`)
  }

  try {
    const result = await analyzeImage(provider, apiKey, screenshot, task.notificationCriteria)
    
    return {
      result: result.analysis,
      matched: result.criteriaMatched,
      timestamp: new Date(),
      screenshot
    }
  } catch (error) {
    throw error
  }
}
