import { app, Menu, Tray, nativeImage } from 'electron'
import { TRAY_ICON_BASE64 } from './tray-icon'
import { triggerLookup, triggerScreenshot } from './lookup'
import { showMainWindow } from './windows'
import { setQuitting } from './windows'

let tray: Tray | null = null

export function initTray(): void {
  const icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_BASE64, 'base64'))
  tray = new Tray(icon)
  tray.setToolTip('LearnEnglish — 快捷查词')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '查词 (Alt+Q)', click: () => void triggerLookup() },
      { label: '截图查询 (Alt+X)', click: () => void triggerScreenshot() },
      { label: '打开主窗口 (Alt+E)', click: () => showMainWindow() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          setQuitting(true)
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', () => showMainWindow())
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
