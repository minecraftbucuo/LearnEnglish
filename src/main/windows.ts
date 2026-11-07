import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, screen, app } from 'electron'
import { CH } from '@shared/channels'
import { getSettings } from './settings'

let mainWindow: BrowserWindow | null = null
let popupWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let quitting = false
let overlayReady: (() => void) | null = null

export function setQuitting(v: boolean): void {
  quitting = v
}

function isDev(): boolean {
  return !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']
}

function rendererUrl(page: string): string {
  if (isDev()) return `${process.env['ELECTRON_RENDERER_URL']}/${page}`
  return join(__dirname, `../renderer/${page}`)
}

function preloadPath(): string {
  // ESM 模式下 electron-vite 输出 .mjs；兜底 .js
  const mjs = join(__dirname, '../preload/index.mjs')
  if (existsSync(mjs)) return mjs
  return join(__dirname, '../preload/index.js')
}

const webPrefs = {
  preload: preloadPath(),
  sandbox: false, // ESM preload 需要关闭 sandbox
  contextIsolation: true,
  nodeIntegration: false
} as const

// ---------- 主窗口 ----------

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1060,
    height: 700,
    minWidth: 880,
    minHeight: 600,
    show: false,
    title: 'LearnEnglish',
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: webPrefs
  })
  mainWindow.on('close', (e) => {
    // 托盘常驻：点关闭只隐藏
    if (!quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  void mainWindow.loadURL(rendererUrl('index.html'))
  return mainWindow
}

export function showMainWindow(tab?: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow()
  const win = mainWindow!
  if (tab) win.webContents.send(CH.MAIN_NAVIGATE, tab)
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

// ---------- 查词弹窗 ----------

export function createPopupWindow(): BrowserWindow {
  popupWindow = new BrowserWindow({
    width: 480,
    height: 620,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#111113',
    webPreferences: webPrefs
  })
  popupWindow.setAlwaysOnTop(true, 'screen-saver')
  popupWindow.on('blur', () => {
    if (getSettings().hideOnBlur) hidePopup()
  })
  void popupWindow.loadURL(rendererUrl('popup.html'))
  return popupWindow
}

export function showPopupNearCursor(): BrowserWindow {
  if (!popupWindow || popupWindow.isDestroyed()) createPopupWindow()
  const win = popupWindow!
  const p = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(p)
  const wa = display.workArea
  const [w, h] = win.getSize()
  const x = Math.min(Math.max(p.x - Math.round(w / 2), wa.x + 8), wa.x + wa.width - w - 8)
  const y = Math.min(Math.max(p.y + 24, wa.y + 8), wa.y + wa.height - h - 8)
  win.setPosition(x, y)
  win.show()
  win.focus()
  return win
}

export function hidePopup(): void {
  if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) {
    popupWindow.hide()
  }
}

export function getPopupWindow(): BrowserWindow | null {
  return popupWindow && !popupWindow.isDestroyed() ? popupWindow : null
}

// ---------- 截图覆盖层 ----------

export function createOverlayWindow(): BrowserWindow {
  overlayWindow = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    enableLargerThanScreen: true,
    backgroundColor: '#00000000',
    webPreferences: webPrefs
  })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  void overlayWindow.loadURL(rendererUrl('overlay.html'))
  overlayWindow.webContents.once('did-finish-load', () => overlayReady?.())
  return overlayWindow
}

export async function showOverlay(display: Electron.Display, imageDataUrl: string): Promise<void> {
  if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow()
  const win = overlayWindow!
  if (win.isVisible()) return
  // 等待覆盖层页面就绪（首次启动后立刻截图的场景）
  if (!overlayReady) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000)
      overlayReady = () => {
        clearTimeout(timer)
        overlayReady = null
        resolve()
      }
      if (!win.webContents.isLoading()) overlayReady?.()
    })
  }
  win.setBounds(display.bounds)
  win.webContents.send(CH.OVERLAY_START, { imageDataUrl })
  win.show()
  win.focus()
}

export function hideOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    overlayWindow.hide()
  }
}

// ---------- 广播 ----------

export function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}
