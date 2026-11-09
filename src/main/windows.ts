import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, screen, app } from 'electron'
import Store from 'electron-store'
import { CH } from '@shared/channels'
import { getSettings } from './settings'

// UI 偏好（弹窗尺寸等），独立于应用设置存储
const uiPrefs = new Store<Record<string, number>>({ name: 'ui-prefs' })

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
  // 必须显式转 file:// URL：loadURL 吃无协议路径时，Windows 靠盘符魔法能解析，Linux 直接 ERR_INVALID_URL（表现为整窗黑屏）
  return pathToFileURL(join(__dirname, `../renderer/${page}`)).toString()
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
  // 渲染层报错转发到主进程日志（渲染层崩溃表现为整窗黑屏，没有这行就没法排查）
  mainWindow.webContents.on('console-message', (e) => {
    if (e.level === 'warning' || e.level === 'error')
      console.log(`[renderer:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`)
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
  // Wayland（尤其 Nvidia）下隐藏窗口首次 show 的首帧可能不提交（整窗黑屏），强制补一帧重绘
  if (process.platform !== 'win32') win.webContents.invalidate()
}

// ---------- 查词弹窗 ----------

export function createPopupWindow(): BrowserWindow {
  popupWindow = new BrowserWindow({
    width: Number(uiPrefs.get('popupW')) || 480,
    height: Number(uiPrefs.get('popupH')) || 620,
    minWidth: 360,
    minHeight: 420,
    show: false,
    frame: false,
    resizable: true, // 无边框窗口支持边缘拉伸
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#111113',
    webPreferences: webPrefs
  })
  popupWindow.setAlwaysOnTop(true, 'screen-saver')
  // 尺寸记忆：防抖保存，重启后沿用
  let resizeTimer: NodeJS.Timeout | null = null
  popupWindow.on('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      if (!popupWindow || popupWindow.isDestroyed()) return
      const [w, h] = popupWindow.getSize()
      uiPrefs.set('popupW', w)
      uiPrefs.set('popupH', h)
    }, 500)
  })
  popupWindow.on('blur', () => {
    if (getSettings().hideOnBlur) hidePopup()
  })
  void popupWindow.loadURL(rendererUrl('popup.html'))
  return popupWindow
}

export function showPopupNearCursor(focused = true): BrowserWindow {
  if (!popupWindow || popupWindow.isDestroyed()) createPopupWindow()
  const win = popupWindow!
  const p = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(p)
  const wa = display.workArea
  const [w, h] = win.getSize()
  const x = Math.min(Math.max(p.x - Math.round(w / 2), wa.x + 8), wa.x + wa.width - w - 8)
  const y = Math.min(Math.max(p.y + 24, wa.y + 8), wa.y + wa.height - h - 8)
  win.setPosition(x, y)
  if (focused) {
    win.show()
    win.focus()
  } else {
    // 无焦点显示：抓取选中文本期间不能抢走目标应用的焦点
    win.showInactive()
  }
  return win
}

export function hidePopup(): void {
  if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) {
    popupWindow.hide()
  }
}

/** Alt+W：找回上一个查词弹窗。
 * 弹窗是单例且关闭只是 hide()，渲染层内容仍在，重新 show 即可还原；
 * 只保留最近一次查询的内容（新查询会重置弹窗 UI，天然顶替旧的）。
 * 弹窗不存在（本次会话还没查过词）或正在显示时不做任何事。 */
export function restorePopup(): void {
  if (!popupWindow || popupWindow.isDestroyed()) return
  if (popupWindow.isVisible()) return
  popupWindow.show()
  popupWindow.focus()
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

export async function showOverlay(
  display: Electron.Display,
  payload: unknown
): Promise<void> {
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
  win.webContents.send(CH.OVERLAY_START, payload)
  win.show()
  win.focus()
}

export function hideOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    overlayWindow.hide()
  }
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null
}

// ---------- 广播 ----------

export function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}
