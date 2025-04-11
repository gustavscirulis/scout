import electron from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import Store from 'electron-store'
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import http from 'http'
import pkg from 'electron-updater'
import { exec } from 'child_process'
import { logger } from '../src/lib/utils/logger'
const { autoUpdater } = pkg

const { app, BrowserWindow, nativeTheme, ipcMain, Tray, screen, shell } = electron

// Constants for tray icon paths
let TRAY_ICON_PATH: string
let TRAY_SUCCESS_ICON_PATH: string

// Encryption key management
const getEncryptionKey = () => {
  // Generate a device-specific key using the machine ID
  // This ensures the encryption is tied to this specific device
  const machineId = crypto.createHash('sha256').update(os.hostname() + os.platform() + os.arch()).digest('hex')
  return crypto.createHash('sha256').update(machineId).digest()
}

// Encryption/decryption functions
const encrypt = (text: string): string => {
  if (!text) return ''
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Store IV and auth tag with the encrypted content
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex')
}

const decrypt = (encryptedText: string): string => {
  if (!encryptedText) return ''
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 3) return ''
    
    const iv = Buffer.from(parts[0], 'hex')
    const authTag = Buffer.from(parts[1], 'hex')
    const encrypted = Buffer.from(parts[2], 'hex')
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv)
    decipher.setAuthTag(authTag)
    return decipher.update(encrypted) + decipher.final('utf8')
  } catch (error) {
    logger.error('Decryption error', error as Error, { context: 'Encryption' })
    return ''
  }
}

// Setup electron-store for persistent data storage
const store = new Store({
  name: 'scout-data',
  defaults: {
    apiKey: null,
    tasks: [],
    settings: {
      visionProvider: 'openai'
    }
  }
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: electron.BrowserWindow | null = null
let tray: electron.Tray | null = null
let windowFloating: boolean = false
let temporaryFloating: boolean = false
let hasSuccessfulTasks: boolean = false

// Task type definition
interface Task {
  id: string
  websiteUrl: string
  analysisPrompt: string
  frequency: 'hourly' | 'daily' | 'weekly'
  scheduledTime: string
  dayOfWeek?: string
  isRunning: boolean
  lastResult?: string
  lastRun?: string
  nextScheduledRun?: string
  notificationCriteria: string
  lastMatchedCriteria?: boolean
  lastTestResult?: {
    result: string
    matched?: boolean
    timestamp?: string
    screenshot?: string
  }
}

// Ensure task has all required fields
const validateTask = (task: any): Task => {
  // Make sure the task has all required fields
  if (!task.id || !task.websiteUrl || !task.notificationCriteria || 
      !task.frequency || !task.scheduledTime) {
    logger.error('Invalid task missing required fields', undefined, { 
      context: 'Task Validation',
      data: { task }
    })
    throw new Error('Invalid task: missing required fields')
  }
  
  // Validate and convert dates
  let lastRun: string | undefined
  let nextScheduledRun: string | undefined
  
  if (task.lastRun) {
    try {
      lastRun = new Date(task.lastRun).toISOString()
    } catch (error) {
      logger.error('Invalid lastRun date format', undefined, {
        context: 'Task Validation',
        data: { taskId: task.id, lastRun: task.lastRun }
      })
      lastRun = undefined
    }
  }
  
  if (task.nextScheduledRun) {
    try {
      nextScheduledRun = new Date(task.nextScheduledRun).toISOString()
    } catch (error) {
      logger.error('Invalid nextScheduledRun date format', undefined, {
        context: 'Task Validation',
        data: { taskId: task.id, nextScheduledRun: task.nextScheduledRun }
      })
      nextScheduledRun = undefined
    }
  }
  
  return {
    id: task.id,
    websiteUrl: task.websiteUrl,
    analysisPrompt: task.analysisPrompt || '',
    frequency: task.frequency,
    scheduledTime: task.scheduledTime,
    dayOfWeek: task.dayOfWeek,
    isRunning: Boolean(task.isRunning),
    lastResult: task.lastResult,
    lastRun: lastRun,
    nextScheduledRun: nextScheduledRun,
    notificationCriteria: task.notificationCriteria,
    lastMatchedCriteria: task.lastMatchedCriteria,
    lastTestResult: task.lastTestResult
  }
}

// Task management functions
const getAllTasks = (): Task[] => {
  try {
    const tasks = store.get('tasks') as Task[]
    logger.log('Retrieved tasks', { 
      context: 'Electron Store',
      data: {
        totalTasks: tasks?.length || 0,
        tasks: tasks?.map(t => ({
          id: t.id,
          isRunning: t.isRunning,
          nextScheduledRun: t.nextScheduledRun
        })) || []
      }
    })
    if (!Array.isArray(tasks)) {
      logger.warn('Tasks in store is not an array, resetting to empty array', { context: 'Electron Store' })
      store.set('tasks', [])
      return []
    }
    return tasks.map(t => validateTask(t))
  } catch (error) {
    logger.error('Error getting all tasks', error as Error, { context: 'Electron Store' })
    return []
  }
}

const saveAllTasks = (tasks: Task[]): void => {
  try {
    // Validate all tasks before saving
    const validatedTasks = tasks.map(task => validateTask(task))
    store.set('tasks', validatedTasks)
  } catch (error) {
    logger.error('Error saving tasks', error as Error, { context: 'Task Storage' })
    throw error
  }
}

const getTaskById = (taskId: string): Task | undefined => {
  try {
    const tasks = getAllTasks()
    const task = tasks.find(task => task.id === taskId)
    return task ? validateTask(task) : undefined
  } catch (error) {
    logger.error(`Error getting task by ID ${taskId}`, error as Error, { context: 'Task Storage' })
    return undefined
  }
}

// Check if any tasks have matched their criteria
const checkForSuccessfulTasks = (): boolean => {
  const tasks = getAllTasks()
  const hasSuccess = tasks.some(task => 
    task.lastMatchedCriteria === true || task.lastTestResult?.matched === true
  )
  
  // Update tray icon if success state has changed
  if (hasSuccess !== hasSuccessfulTasks) {
    hasSuccessfulTasks = hasSuccess
    if (tray) {
      createTray(hasSuccessfulTasks)
    }
  }
  
  return hasSuccess
}

const addTask = (task: Task): Task => {
  try {
    const validatedTask = validateTask(task)
    const tasks = getAllTasks()
    
    // Check for duplicate ID
    if (tasks.some(t => t.id === validatedTask.id)) {
      throw new Error(`Task with ID ${validatedTask.id} already exists`)
    }
    
    tasks.push(validatedTask)
    saveAllTasks(tasks)
    
    // Check if we need to update the tray icon
    checkForSuccessfulTasks()
    
    return validatedTask
  } catch (error) {
    logger.error('Error adding task', error as Error, { context: 'Task Storage' })
    throw error
  }
}

const updateTask = (updatedTask: Task): Task => {
  try {
    const validatedTask = validateTask(updatedTask)
    const tasks = getAllTasks()
    const index = tasks.findIndex(task => task.id === validatedTask.id)
    
    if (index === -1) {
      throw new Error(`Task with ID ${validatedTask.id} not found for update`)
    }
    
    tasks[index] = validatedTask
    saveAllTasks(tasks)
    
    // Check if we need to update the tray icon
    checkForSuccessfulTasks()
    
    return validatedTask
  } catch (error) {
    logger.error('Error updating task', error as Error, { context: 'Task Storage' })
    throw error
  }
}

const deleteTask = (taskId: string): void => {
  try {
    const tasks = getAllTasks()
    const taskToDelete = tasks.find(task => task.id === taskId)
    
    if (!taskToDelete) {
      throw new Error(`Task with ID ${taskId} not found in storage`)
    }
    
    const updatedTasks = tasks.filter(task => task.id !== taskId)
    saveAllTasks(updatedTasks)
    
    // Verify the task was actually removed
    const tasksAfterDeletion = getAllTasks()
    if (tasksAfterDeletion.some(task => task.id === taskId)) {
      throw new Error('Task deletion failed')
    }
    
    // Check if we need to update the tray icon after deletion
    checkForSuccessfulTasks()
  } catch (error) {
    console.error(`Error deleting task ${taskId}:`, error)
    throw error
  }
}

function getWindowPosition() {
  if (!tray) return { x: 0, y: 0 }
  
  const windowBounds = mainWindow?.getBounds()
  const trayBounds = tray.getBounds()
  const screenBounds = screen.getPrimaryDisplay().bounds

  // Center window horizontally below the tray icon
  const x = Math.round(trayBounds.x + (trayBounds.width / 2) - ((windowBounds?.width || 0) / 2))
  
  // Position window 4 pixels vertically below the tray icon
  const y = Math.round(trayBounds.y + trayBounds.height + 4)

  // Ensure window is always within screen bounds
  return {
    x: Math.min(Math.max(x, 0), screenBounds.width - (windowBounds?.width || 0)),
    y: Math.min(Math.max(y, 0), screenBounds.height - (windowBounds?.height || 0))
  }
}

function toggleWindow() {
  if (!mainWindow) return
  
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    // Always position under the tray icon when toggling window visibility
    const position = getWindowPosition()
    mainWindow.setPosition(position.x, position.y)
    mainWindow.show()
    mainWindow.focus()
  }
}

function createTray(useSuccessIcon = false) {
  if (tray) {
    tray.destroy()
    tray = null
  }

  try {
    // Set up tray icon paths
    TRAY_ICON_PATH = !app.isPackaged 
      ? join(process.cwd(), 'public', 'tray@2x.png')
      : join(__dirname, '..', 'dist', 'tray@2x.png')
    
    TRAY_SUCCESS_ICON_PATH = !app.isPackaged 
      ? join(process.cwd(), 'public', 'tray_success@2x.png')
      : join(__dirname, '..', 'dist', 'tray_success@2x.png')
    
    // Use the appropriate icon based on task status
    const iconPath = useSuccessIcon ? TRAY_SUCCESS_ICON_PATH : TRAY_ICON_PATH
    
    const icon = electron.nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      throw new Error('Icon is empty')
    }
    
    tray = new Tray(icon)
  } catch (error) {
    console.error('Failed to create tray icon with image:', error)
    // Create a fallback tray icon with just text
    tray = new Tray(electron.nativeImage.createEmpty())
    tray.setTitle('🔍')
  }

  tray.setToolTip('Scout')
  tray.on('click', toggleWindow)
}

function createWindow() {
  // Set theme to follow system
  nativeTheme.themeSource = 'system'

  // Create window
  mainWindow = new BrowserWindow({
    width: 350,
    height: 634,
    show: false, // Don't show initially
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    backgroundColor: '#00000000', // Fully transparent
    vibrancy: 'under-window',
    visualEffectState: 'active',
    transparent: true,
    frame: false,
    roundedCorners: true,
    hasShadow: true,
    skipTaskbar: true,
    resizable: true,
    minWidth: 350,
    maxWidth: 350,
    minHeight: 400,
    fullscreenable: false
  })

  // Handle window close event
  mainWindow.on('close', (event) => {
    // Prevent the window from actually closing
    event.preventDefault()
    // Just hide it instead
    mainWindow?.hide()
  })

  // Send theme info to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('system-theme', {
      isDark: nativeTheme.shouldUseDarkColors
    })
  })

  // Hide dock icon
  if (app.dock) app.dock.hide()

  // Check for successful tasks on startup
  hasSuccessfulTasks = checkForSuccessfulTasks()
  
  // Create the tray icon with the appropriate state
  createTray(hasSuccessfulTasks)
  
  // Position the window under the tray icon on first launch
  if (tray) {
    const position = getWindowPosition();
    mainWindow.setPosition(position.x, position.y);
  }

  // Check local storage setting in renderer and request initial value
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.executeJavaScript(`
      // Get window floating preference from localStorage
      const isFloating = !!localStorage.getItem('windowFloating');
      
      // Send the value back to main process
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('init-window-floating', isFloating);
      
      // Return a placeholder value for the executeJavaScript promise
      true;
    `).catch(() => {});
  });
  
  // Initialize window floating state as a variable accessible in the module scope
  windowFloating = false;
  
  // Hide window when it loses focus (unless in permanent floating mode)
  mainWindow.on('blur', () => {
    // Force a small delay to ensure the windowFloating state is properly initialized
    setTimeout(() => {
      if (!windowFloating) {
        mainWindow?.hide();
      }
    }, 50);
  })

  // Load the content
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    const indexPath = join(__dirname, '../dist/index.html')
    mainWindow.loadFile(indexPath)
  }
  
  // Show window only after content is loaded and positioned correctly
  mainWindow.once('ready-to-show', () => {
    if (tray) {
      const position = getWindowPosition();
      mainWindow?.setPosition(position.x, position.y);
    }
    mainWindow?.show();
  })

  // Add window focus handler
  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('window-focus');
  });
}

// Handle window focus request from renderer
ipcMain.on('focus-window', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    // Position window under tray icon when showing from notification
    if (tray && !mainWindow.isVisible()) {
      const position = getWindowPosition()
      mainWindow.setPosition(position.x, position.y)
    }
    mainWindow.show()
    mainWindow.focus()
  }
})

// Handle window close request from renderer
ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
})

// Handle quit request from renderer
ipcMain.on('quit-app', () => {
  app.quit()
})

// Handle initial window floating setting from renderer
ipcMain.on('init-window-floating', (_event, floating: boolean) => {
  windowFloating = floating;
})

// Handle toggling window floating mode
ipcMain.on('toggle-window-floating', (_event, floating: boolean) => {
  // Update the global state
  windowFloating = floating;
  
  // If the window is currently hidden and we're enabling floating, show it
  if (floating && mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
  }
  
  // Provide feedback to the renderer process
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('window-floating-updated', windowFloating);
  }
})

// Handle temporary floating mode for form editing
ipcMain.on('set-temporary-floating', (_event, floating: boolean) => {
  // Update the temporary floating state
  temporaryFloating = floating;
  
  // Set the window to stay on top when in temporary floating mode
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(floating, 'floating');
  }
  
  // Provide feedback to the renderer process
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('temporary-floating-updated', temporaryFloating);
  }
})

// IPC handlers for tasks
ipcMain.handle('get-all-tasks', () => {
  return getAllTasks()
})

ipcMain.handle('get-task', (_event, taskId: string) => {
  return getTaskById(taskId)
})

ipcMain.handle('add-task', (_event, task: Task) => {
  const addedTask = addTask(task)
  return { success: true, task: addedTask }
})

ipcMain.handle('update-task', (_event, task: Task) => {
  const updatedTask = updateTask(task)
  return { success: true, task: updatedTask }
})

ipcMain.handle('delete-task', (_event, taskId: string) => {
  deleteTask(taskId)
  return { success: true }
})

ipcMain.handle('take-screenshot', async (_event, url: string) => {
  // Clean up previous screenshot file if it exists before taking a new one
  if (latestScreenshotPath && fs.existsSync(latestScreenshotPath)) {
    try {
      fs.unlinkSync(latestScreenshotPath);
      latestScreenshotPath = null;
    } catch (err) {
      console.error('Failed to delete previous screenshot during capture:', err);
    }
  }

  const offscreenWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    webPreferences: {
      offscreen: true
    }
  })
  
  // Set user agent separately
  offscreenWindow.webContents.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36')
  
  // Set extra HTTP headers to avoid bot detection
  offscreenWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*'] },
    (details, callback) => {
      details.requestHeaders['Accept-Language'] = 'en-US,en;q=0.9'
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  try {
    logger.log(`Attempting to capture ${url}`, { context: 'Screenshot' })
    
    // Set a load timeout in case the page hangs
    const loadPromise = offscreenWindow.loadURL(url)
    
    // Wait for page to load with proper timeout handling
    await Promise.race([
      loadPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Page load timeout')), 15000))
    ])
    
    logger.log('Page loaded successfully', { context: 'Screenshot' })
    
    // Allow time for page content to render
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Get the full height of the page
    const fullHeight = await offscreenWindow.webContents.executeJavaScript(`
      Math.max(
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight,
        document.documentElement.clientHeight
      )
    `)

    // Get max height from settings
    const settings = store.get('settings') || { maxScreenshotHeight: 5000 }
    const maxHeight = settings.maxScreenshotHeight || 5000
    const height = Math.min(fullHeight, maxHeight)

    logger.log(`Setting window size to 1920x${height}`, { context: 'Screenshot' })
    
    // Resize window to match height (with max limit)
    offscreenWindow.setSize(1920, height)

    // Wait a moment for resize to take effect
    await new Promise(resolve => setTimeout(resolve, 500))

    logger.log('Capturing page', { context: 'Screenshot' })
    const image = await offscreenWindow.webContents.capturePage()
    const pngBuffer = await image.toPNG()
    const base64Image = pngBuffer.toString('base64')
    const screenshot = `data:image/png;base64,${base64Image}`
    
    logger.log('Successfully captured and encoded image', { context: 'Screenshot' })
    return screenshot
  } catch (error) {
    logger.error('Error during capture', error as Error, { context: 'Screenshot' })
    throw error
  } finally {
    offscreenWindow.close()
  }
})

// API Key management handlers
ipcMain.handle('get-api-key', () => {
  const encryptedKey = store.get('apiKey') as string
  return encryptedKey ? decrypt(encryptedKey) : null
})

ipcMain.handle('save-api-key', (_event, apiKey) => {
  if (!apiKey) {
    store.delete('apiKey')
  } else {
    const encryptedKey = encrypt(apiKey)
    store.set('apiKey', encryptedKey)
  }
  return true
})

ipcMain.handle('delete-api-key', () => {
  store.delete('apiKey')
  return true
})

// Handle request to update tray icon
ipcMain.handle('update-tray-icon', () => {
  hasSuccessfulTasks = checkForSuccessfulTasks()
  return { success: true, hasSuccessfulTasks }
})

// Keep track of the latest temporary screenshot file
let latestScreenshotPath: string | null = null;

// IPC handlers
ipcMain.handle('is-app-packaged', () => {
  return app.isPackaged
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// Handle opening images in preview window
ipcMain.handle('open-image-preview', async (_event, dataUrl: string) => {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return { success: false, error: 'Invalid image data' }
  }

  try {
    // Convert data URL to file
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Create temp file directory if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'scout-app');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Clean up previous screenshot if it exists
    if (latestScreenshotPath && fs.existsSync(latestScreenshotPath)) {
      try {
        fs.unlinkSync(latestScreenshotPath);
      } catch (err) {
        console.error('Failed to delete previous screenshot:', err);
      }
    }
    
    // Create new screenshot file
    const tempFilePath = path.join(tempDir, `screenshot-${Date.now()}.png`);
    fs.writeFileSync(tempFilePath, imageBuffer);
    
    // Update the latest screenshot path
    latestScreenshotPath = tempFilePath;

    // Open with the system's default app
    shell.openPath(tempFilePath);
    return { success: true };
  } catch (error) {
    console.error('Error opening image:', error);
    return { success: false, error: String(error) };
  }
})

// Handle saving a temporary screenshot for Ollama
ipcMain.handle('save-temp-screenshot', async (_event, dataUrl: string) => {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    throw new Error('Invalid image data')
  }

  try {
    // Convert data URL to file
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Create temp file directory if it doesn't exist
    const tempDir = path.join(os.tmpdir(), 'scout-app');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Create new screenshot file
    const tempFilePath = path.join(tempDir, `ollama-${Date.now()}.png`);
    fs.writeFileSync(tempFilePath, imageBuffer);
    
    return tempFilePath;
  } catch (error) {
    console.error('Error saving temporary screenshot:', error);
    throw error;
  }
})

// Handle deleting a temporary file
ipcMain.handle('delete-temp-file', async (_event, filePath: string) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: 'File not found' }
  }

  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error deleting temporary file:', error);
    return { success: false, error: String(error) };
  }
})

// Run Ollama with image
ipcMain.handle('run-ollama', async (_event, params: { model: string, prompt: string, imagePath: string }) => {
  const { model, prompt, imagePath } = params
  
  try {
    const result = await new Promise<string>((resolve, reject) => {
      try {
        // Read the image file as a base64 string
        const imageBuffer = fs.readFileSync(imagePath)
        const base64Image = imageBuffer.toString('base64')
        
        logger.log(`Sending request to API with image from ${imagePath}`, { context: 'Ollama' })
        
        // Create the HTTP request to Ollama API (correct endpoint is /api/generate)
        const requestData = JSON.stringify({
          model: model,
          prompt: prompt,
          images: [base64Image],
          stream: false
        })
        
        const options = {
          hostname: '127.0.0.1',
          port: 11434,
          path: '/api/generate',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestData)
          }
        }
        
        const req = http.request(options, (res) => {
          let data = ''
          
          res.on('data', (chunk) => {
            data += chunk
          })
          
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                logger.error(`API returned status code ${res.statusCode}`, undefined, { 
                  context: 'Ollama',
                  data: { response: data }
                })
                reject(new Error(`Ollama API returned status code ${res.statusCode}: ${data}`))
                return
              }
              
              logger.log(`Received response from API: ${data.substring(0, 100)}...`, { context: 'Ollama' })
              const response = JSON.parse(data)
              if (response.response) {
                resolve(response.response)
              } else {
                logger.error('No response field in API result', undefined, { 
                  context: 'Ollama',
                  data: { response: data }
                })
                reject(new Error('No response field in Ollama API result'))
              }
            } catch (error) {
              logger.error('Failed to parse response', error as Error, { 
                context: 'Ollama',
                data: { response: data }
              })
              reject(new Error(`Failed to parse Ollama response: ${error}`))
            }
          })
        })
        
        req.on('error', (error) => {
          logger.error('API request failed', error as Error, { context: 'Ollama' })
          reject(new Error(`Ollama API request failed: ${error.message}`))
        })
        
        req.write(requestData)
        req.end()
      } catch (error) {
        logger.error('Error preparing request', error as Error, { context: 'Ollama' })
        reject(new Error(`Error preparing Ollama request: ${error}`))
      }
    })
    
    return result
  } catch (error) {
    logger.error('Error running Ollama', error as Error, { context: 'Ollama' })
    throw error
  }
})

// Settings handlers
ipcMain.handle('get-settings', () => {
  return store.get('settings') || { visionProvider: 'openai' }
})

ipcMain.handle('update-settings', (_event, settings: { visionProvider: string }) => {
  store.set('settings', settings)
  return settings
})


// Setup auto-updater
function setupAutoUpdater() {
  // Only check for updates in production mode
  if (process.env.NODE_ENV === 'production') {
    // Configure for GitHub
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'gustavscirulis',
      repo: 'scout'
    })

    // Check for updates silently on startup
    autoUpdater.checkForUpdatesAndNotify()

    // Setup update events
    autoUpdater.on('update-available', () => {
      if (mainWindow) {
        mainWindow.webContents.send('update-available')
      }
    })

    autoUpdater.on('update-downloaded', () => {
      if (mainWindow) {
        mainWindow.webContents.send('update-downloaded')
      }
    })
  }
}

// IPC handlers for updates
ipcMain.handle('check-for-updates', async () => {
  try {
    const checkResult = await autoUpdater.checkForUpdatesAndNotify()
    return { 
      success: true,
      updateAvailable: !!checkResult?.updateInfo
    }
  } catch (error) {
    if (mainWindow) {
      mainWindow.webContents.send('update-error')
    }
    return { 
      success: false
    }
  }
})

ipcMain.handle('install-update', () => {
  try {
    autoUpdater.quitAndInstall(false, true)
    return { success: true }
  } catch (error) {
    return { 
      success: false
    }
  }
})

// Check for Llama model
ipcMain.handle('check-llama-model', async () => {
  try {
    // On macOS, check the default installation path
    const ollamaPath = '/usr/local/bin/ollama'
    
    await new Promise<void>((resolve, reject) => {
      execFile(ollamaPath, ['--version'], (error) => {
        if (error) {
          console.error('Ollama not found at default path:', error)
          reject(new Error('Ollama not found'))
        } else {
          resolve()
        }
      })
    })

    // Then check if the model is installed using the absolute path
    const result = await new Promise<string>((resolve, reject) => {
      execFile(ollamaPath, ['list'], (error: Error | null, stdout: string) => {
        if (error) {
          console.error('Failed to list Ollama models:', error)
          reject(error)
        } else {
          resolve(stdout)
        }
      })
    })

    // Check if llama3.2-vision:latest is in the list
    const hasModel = result.includes('llama3.2-vision:latest')
    return { 
      installed: true,
      hasModel
    }
  } catch (error) {
    console.error('Error checking Llama model:', error)
    return { 
      installed: false,
      hasModel: false
    }
  }
})

// Handle OpenAI API calls
ipcMain.handle('call-openai-api', async (_event, params: { 
  apiKey: string, 
  prompt: string, 
  screenshot: string 
}) => {
  const { apiKey, prompt, screenshot } = params;
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
              { type: "text", text: prompt },
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
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || 'Failed to analyze website');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
});

app.whenReady().then(() => {
  createWindow()
  setupAutoUpdater()
  
  // Add Cmd+Q handler for macOS
  if (process.platform === 'darwin') {
    app.on('before-quit', (event) => {
      // Allow the quit to proceed
      event.preventDefault()
      app.quit()
    })
  }
})

// Clean up any screenshot when app quits
app.on('before-quit', () => {
  if (latestScreenshotPath && fs.existsSync(latestScreenshotPath)) {
    try {
      fs.unlinkSync(latestScreenshotPath);
      latestScreenshotPath = null;
    } catch (err) {
      console.error('Failed to delete screenshot on app quit:', err);
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})