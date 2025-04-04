import electron from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { app, BrowserWindow, nativeTheme, ipcMain, Tray, screen } = electron
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: electron.BrowserWindow | null = null
let tray: electron.Tray | null = null

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
    const position = getWindowPosition()
    mainWindow.setPosition(position.x, position.y)
    mainWindow.show()
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
    tray.setTitle('👁️')
  }

  tray.setToolTip('Vision Tasks')
  tray.on('click', toggleWindow)
}

function createWindow() {
  // Set theme to follow system
  nativeTheme.themeSource = 'system'

  // Create window
  mainWindow = new BrowserWindow({
    width: 400,
    height: 650,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    transparent: false,
    frame: false,
    roundedCorners: true,
    hasShadow: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false
  })

  // Update window appearance when system theme changes
  nativeTheme.on('updated', () => {
    if (mainWindow) {
      mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff')
    }
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

  // Hide window when it loses focus
  mainWindow.on('blur', () => {
    mainWindow?.hide()
  })

  // Load the content
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    const indexPath = join(__dirname, '../dist/index.html')
    mainWindow.loadFile(indexPath)
  }
}

// Handle window focus request from renderer
ipcMain.on('focus-window', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }
})

ipcMain.handle('take-screenshot', async (_event, url: string) => {
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


app.whenReady().then(createWindow)

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