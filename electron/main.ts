import electron from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import isDev from 'electron-is-dev'

const { app, BrowserWindow, nativeTheme, ipcMain } = electron
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: electron.BrowserWindow | null = null

function createWindow() {
  // Force dark mode
  nativeTheme.themeSource = 'system'

  // Create window
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    minWidth: 600,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    backgroundColor: '#f5f5f5',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 },
    vibrancy: 'under-window',
    visualEffectState: 'active'
  })

  // Load the content
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

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