import electron from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { app, BrowserWindow, nativeTheme, ipcMain, Tray, screen } = electron
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: electron.BrowserWindow | null = null
let tray: electron.Tray | null = null
let windowFloating: boolean = false

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
  
  // Hide window when it loses focus (unless in floating mode)
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