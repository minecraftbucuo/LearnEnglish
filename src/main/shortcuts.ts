import { globalShortcut } from 'electron'
import { getSettings } from './settings'
import { triggerLookup, triggerScreenshot } from './lookup'
import { showMainWindow, restorePopup } from './windows'

export function registerShortcuts(): void {
  unregisterShortcuts()
  const { hotkeys } = getSettings()
  const map: Record<string, () => void> = {
    lookup: () => void triggerLookup(),
    screenshot: () => void triggerScreenshot(),
    main: () => showMainWindow(),
    recover: () => restorePopup()
  }
  for (const [action, key] of Object.entries(hotkeys)) {
    if (!key) continue
    if (action === 'screenshot' && process.platform !== 'win32') continue // Linux 暂不支持截图查询
    const fn = map[action]
    if (!fn) continue
    const ok = globalShortcut.register(key, fn)
    if (!ok) console.warn(`[shortcuts] 快捷键 ${key}（${action}）注册失败，可能被其他应用占用`)
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}
