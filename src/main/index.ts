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
