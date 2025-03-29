import electron from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import isDev from 'electron-is-dev'
import { nativeImage } from 'electron'

const { app, BrowserWindow, Tray } = electron
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let tray: electron.Tray | null = null
let mainWindow: electron.BrowserWindow | null = null

function createWindow() {
  // Hide dock icon
  app.dock.hide()

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: false, // Don't show window initially
    frame: false, // Remove window frame
  })

  // Create a default icon
  const icon = nativeImage.createFromPath(join(__dirname, '../public/icon.png'))
  if (icon.isEmpty()) {
    // If custom icon not found, create a simple 16x16 icon
    const defaultIcon = nativeImage.createEmpty()
    const size = { width: 16, height: 16 }
    defaultIcon.addRepresentation({
      width: size.width,
      height: size.height,
      buffer: Buffer.alloc(size.width * size.height * 4, 255) // Create a white square
    })
    tray = new Tray(defaultIcon)
  } else {
    tray = new Tray(icon)
  }
  
  tray.setToolTip('Vision Tasks')

  // Toggle window visibility on tray click
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
    }
  })

  // Position window below the tray icon when shown
  mainWindow.on('show', () => {
    const trayPos = tray.getBounds()
    const windowPos = mainWindow.getBounds()
    const x = Math.round(trayPos.x + (trayPos.width / 2) - (windowPos.width / 2))
    const y = Math.round(trayPos.y + trayPos.height)
    mainWindow.setPosition(x, y, false)
  })

  // Load the local URL for development or the local file for production
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

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