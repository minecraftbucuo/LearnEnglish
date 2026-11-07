import Store from 'electron-store'
import { app } from 'electron'
import type { AppSettings } from '@shared/types'

const DEFAULTS: AppSettings = {
  providers: [],
  activeProviderId: '',
  hotkeys: { lookup: 'Alt+Q', screenshot: 'Alt+X', main: 'Alt+E' },
  dailyNew: 20,
  hideOnBlur: true,
  autostart: false,
  promptCards: {}
}

const store = new Store<AppSettings>({ defaults: DEFAULTS })

export function getSettings(): AppSettings {
  const s = store.store
  const providers = Array.isArray(s.providers) ? s.providers : []
  // 兼容旧配置：火山方舟/智谱默认关闭深度思考（这两家的思考型模型首字延迟极高）
  for (const p of providers) {
    if (p.disableThinking === undefined) {
      p.disableThinking = /volces\.com|bigmodel\.cn/.test(p.baseURL)
    }
  }
  // 兼容旧配置：单词卡的「音标与释义」拆分为「音标」「释义」两张独立卡
  const wordCards = s.promptCards?.word
  if (wordCards) {
    const idx = wordCards.findIndex((c) => c.id === 'phonetic' && c.title !== '音标')
    if (idx >= 0) {
      const old = wordCards[idx]
      wordCards.splice(
        idx,
        1,
        { id: 'phonetic', title: '音标', content: '给出美式音标。', enabled: old.enabled },
        {
          id: 'definition',
          title: '释义',
          content: '标明词性并给简明中文释义（多个常用词性可并列）。',
          enabled: old.enabled
        }
      )
    }
  }
  return {
    ...DEFAULTS,
    ...s,
    hotkeys: { ...DEFAULTS.hotkeys, ...(s.hotkeys ?? {}) },
    promptCards: s.promptCards ?? {},
    providers
  }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const next: AppSettings = {
    ...current,
    ...patch,
    hotkeys: { ...current.hotkeys, ...(patch.hotkeys ?? {}) },
    promptCards: patch.promptCards ?? current.promptCards,
    providers: patch.providers ?? current.providers
  }
  store.set(next)
  applyAutostart(next)
  return next
}

export function applyAutostart(s: AppSettings = getSettings()): void {
  // 开发模式下不注册开机自启，避免影响日常系统状态
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: s.autostart })
  }
}

export function getActiveProvider(): AppSettings['providers'][number] | null {
  const s = getSettings()
  return s.providers.find((p) => p.id === s.activeProviderId) ?? s.providers[0] ?? null
}
