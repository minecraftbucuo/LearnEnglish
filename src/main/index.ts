import { app } from 'electron'
import { initDb } from './db'
import { getSettings } from './settings'
import { registerIpc } from './ipc'
import { registerShortcuts, unregisterShortcuts } from './shortcuts'
import {
  createMainWindow,
  createOverlayWindow,
  createPopupWindow,
  setQuitting,
  showMainWindow
} from './windows'
import { initTray, destroyTray } from './tray'

app.setAppUserModelId('com.learnenglish.desktop')
// 禁用 GPU 加速：纯 2D 界面用软件渲染足够，避免远程桌面/虚拟机/老驱动下
// CSS/SVG 滤镜触发合成器崩溃把整个窗口渲成黑屏。
// 仅 Windows 禁用；Linux（尤其 Nvidia + Wayland）下软件渲染本身就是整窗黑屏，必须保留 GPU
if (process.platform === 'win32') app.disableHardwareAcceleration()

// 单实例：再次启动时唤起主窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(() => {
    initDb()
    registerIpc()
    createMainWindow()
    createPopupWindow()
    createOverlayWindow()
    initTray()
    registerShortcuts()

    // 首次使用（未配置 AI）时打开设置页引导
    const s = getSettings()
    if (!s.providers.length) showMainWindow('settings')

    app.on('activate', () => showMainWindow())
  })

  app.on('before-quit', () => setQuitting(true))
  app.on('will-quit', () => unregisterShortcuts())
  app.on('quit', () => destroyTray())

  // 托盘常驻：关掉所有窗口也不退出
  app.on('window-all-closed', () => {
    // no-op：保持托盘常驻；退出请通过托盘菜单
  })
}
