import electron from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import isDev from 'electron-is-dev';
import { nativeImage } from 'electron';
const { app, BrowserWindow, Tray, nativeTheme, screen } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let tray = null;
let mainWindow = null;
function getWindowPosition() {
    if (!tray)
        return { x: 0, y: 0 };
    const trayBounds = tray.getBounds();
    const windowBounds = mainWindow?.getBounds() || { width: 350, height: 530 };
    // Center window horizontally below the tray icon
    const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));
    const y = Math.round(trayBounds.y + trayBounds.height);
    return { x, y };
}
function showWindow() {
    if (!mainWindow)
        return;
    const position = getWindowPosition();
    mainWindow.setPosition(position.x, position.y, false);
    mainWindow.show();
}
function createWindow() {
    // Hide dock icon
    app.dock.hide();
    // Force dark mode
    nativeTheme.themeSource = 'dark';
    // Create tray icon first
    const icon = nativeImage.createFromPath(join(__dirname, '../public/icon.png'));
    if (icon.isEmpty()) {
        const defaultIcon = nativeImage.createEmpty();
        const size = { width: 16, height: 16 };
        defaultIcon.addRepresentation({
            width: size.width,
            height: size.height,
            buffer: Buffer.alloc(size.width * size.height * 4, 255)
        });
        tray = new Tray(defaultIcon);
    }
    else {
        tray = new Tray(icon);
    }
    tray.setToolTip('Vision Tasks');
    // Create window but don't show it yet
    mainWindow = new BrowserWindow({
        width: 350,
        height: 530,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        show: false,
        frame: false,
        backgroundColor: '#0a0a0a',
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: -100, y: -100 },
        vibrancy: 'under-window',
        visualEffectState: 'active',
        transparent: true,
    });
    // Load the content
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173').then(() => {
            if (mainWindow && isDev) {
                mainWindow.webContents.openDevTools({ mode: 'detach' });
            }
        });
    }
    else {
        mainWindow.loadFile(join(__dirname, '../dist/index.html'));
    }
    // Toggle window on tray click
    tray.on('click', () => {
        if (!mainWindow)
            return;
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        }
        else {
            showWindow();
        }
    });
    // Update position when screen changes
    screen.on('display-metrics-changed', () => {
        if (mainWindow?.isVisible()) {
            const position = getWindowPosition();
            mainWindow.setPosition(position.x, position.y, false);
        }
    });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
//# sourceMappingURL=main.js.map