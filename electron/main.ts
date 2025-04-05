import electron from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import Store from 'electron-store'
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

const { app, BrowserWindow, nativeTheme, ipcMain, Tray, screen, shell } = electron

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
    console.error('Decryption error:', error)
    return ''
  }
}

// Setup electron-store for persistent data storage
const store = new Store({
  name: 'scout-data',
  defaults: {
    apiKey: null,
    tasks: []
  }
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: electron.BrowserWindow | null = null
let tray: electron.Tray | null = null
let windowFloating: boolean = false
let temporaryFloating: boolean = false

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
    console.error('Invalid task missing required fields:', task)
    throw new Error('Invalid task: missing required fields')
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
    lastRun: task.lastRun,
    notificationCriteria: task.notificationCriteria,
    lastMatchedCriteria: task.lastMatchedCriteria,
    lastTestResult: task.lastTestResult
  }
}

// Task management functions
const getAllTasks = (): Task[] => {
  try {
    const tasks = store.get('tasks') as Task[]
    return Array.isArray(tasks) ? tasks.map(t => validateTask(t)) : []
  } catch (error) {
    console.error('Error getting all tasks:', error)
    return []
  }
}

const saveAllTasks = (tasks: Task[]): void => {
  // Validate tasks before saving
  const validatedTasks = tasks.map(task => validateTask(task))
  store.set('tasks', validatedTasks)
}

const getTaskById = (taskId: string): Task | undefined => {
  try {
    const tasks = getAllTasks()
    return tasks.find(task => task.id === taskId)
  } catch (error) {
    console.error(`Error getting task by ID ${taskId}:`, error)
    return undefined
  }
}

const addTask = (task: Task): void => {
  try {
    const validatedTask = validateTask(task)
    const tasks = getAllTasks()
    tasks.push(validatedTask)
    saveAllTasks(tasks)
  } catch (error) {
    console.error('Error adding task:', error)
    throw error
  }
}

const updateTask = (updatedTask: Task): void => {
  try {
    const validatedTask = validateTask(updatedTask)
    const tasks = getAllTasks()
    const index = tasks.findIndex(task => task.id === validatedTask.id)
    
    if (index !== -1) {
      tasks[index] = validatedTask
      saveAllTasks(tasks)
    } else {
      console.error(`Task with ID ${validatedTask.id} not found for update`)
    }
  } catch (error) {
    console.error('Error updating task:', error)
    throw error
  }
}

const deleteTask = (taskId: string): void => {
  try {
    const tasks = getAllTasks()
    const updatedTasks = tasks.filter(task => task.id !== taskId)
    
    // Verify that a task was actually removed
    if (tasks.length === updatedTasks.length) {
      console.warn(`No task found with ID ${taskId} to delete`)
    }
    
    saveAllTasks(updatedTasks)
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

function createTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }

  try {
    // Create tray icon
    const iconPath = !app.isPackaged 
      ? join(process.cwd(), 'public', 'icon.png')
      : join(__dirname, '..', 'dist', 'icon.png')
    
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
    show: false,
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
    resizable: false,
    fullscreenable: false
  })

  // Send theme info to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('system-theme', {
      isDark: nativeTheme.shouldUseDarkColors
    })
  })

  // Hide dock icon
  if (app.dock) app.dock.hide()

  // Create the tray icon
  createTray()
  
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
  
  // Hide window when it loses focus (unless in permanent or temporary floating mode)
  mainWindow.on('blur', () => {
    // Force a small delay to ensure the windowFloating state is properly initialized
    setTimeout(() => {
      if (!windowFloating && !temporaryFloating) {
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
  
  // Make sure the window is positioned correctly before showing
  mainWindow.once('ready-to-show', () => {
    if (tray) {
      const position = getWindowPosition();
      mainWindow?.setPosition(position.x, position.y);
    }
    // Don't show initially - wait for tray click
  })
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
  addTask(task)
  return { success: true }
})

ipcMain.handle('update-task', (_event, task: Task) => {
  updateTask(task)
  return { success: true }
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

  await offscreenWindow.loadURL(url)
  await new Promise(resolve => setTimeout(resolve, 2000))

  const image = await offscreenWindow.webContents.capturePage()
  const pngBuffer = await image.toPNG()
  const base64Image = pngBuffer.toString('base64')
  const screenshot = `data:image/png;base64,${base64Image}`
  
  offscreenWindow.close()
  return screenshot
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

// Keep track of the latest temporary screenshot file
let latestScreenshotPath: string | null = null;

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


app.whenReady().then(createWindow)

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