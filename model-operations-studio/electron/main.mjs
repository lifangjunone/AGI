import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'

const isDev = !app.isPackaged

async function createWindow() {
  if (!isDev) {
    process.env.MODELOPS_RUNTIME_DIR = path.join(app.getPath('userData'), 'runtime')
    await import('../server/control-plane.mjs')
  }

  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#111512',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  await window.loadURL(isDev ? 'http://127.0.0.1:4320' : 'http://127.0.0.1:4319')
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})
