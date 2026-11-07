import { ipcMain, app, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { CH } from '@shared/channels'
import type {
  AppSettings,
  EntriesFilter,
  ProviderConfig,
  Rating,
  ReviewMode
} from '@shared/types'
import {
  answer,
  addEntryChat,
  boldEntryTargets,
  deleteEntry,
  deleteEntryChat,
  getEntryById,
  getFreePracticeQueue,
  getReviewQueue,
  getReviewStats,
  listEntries,
  listEntryChats,
  markIntroduced,
  setNote,
  setSuspended,
  setStarred
} from './db'
import { getActiveProvider, getSettings, setSettings } from './settings'
import { streamChat, testProvider } from './ai'
import { getStorageInfo } from './storage'

// 进行中的追问流（chatId → 状态），用于推送增量与取消
const chatStreams = new Map<
  string,
  { entryId: number; question: string; controller: AbortController; sender: Electron.WebContents }
>()
import { registerShortcuts } from './shortcuts'
import { broadcast, hidePopup, setQuitting, showMainWindow } from './windows'
import {
  abortAi,
  abortRelookup,
  cancelScreenshot,
  confirmScreenshot,
  createNestedLookup,
  followUp,
  lookupTextFromRenderer,
  relookupEntry,
  runAi,
  starCurrent
} from './lookup'

export function registerIpc(): void {
  // ---- AI 查询 ----
  ipcMain.handle(CH.AI_START, (_e, lookupId: string, force?: boolean) => runAi(lookupId, force))
  ipcMain.handle(CH.AI_FOLLOWUP, (_e, lookupId: string, question: string) =>
    followUp(lookupId, question)
  )
  ipcMain.handle(CH.AI_ABORT, (_e, lookupId: string) => abortAi(lookupId))
  ipcMain.handle(CH.AI_NESTED_LOOKUP, (_e, text: string) => createNestedLookup(text))
  ipcMain.handle(CH.STAR_CURRENT, (_e, lookupId: string) => starCurrent(lookupId))

  // ---- 生词本 ----
  ipcMain.handle(CH.ENTRIES_LIST, (_e, filter: EntriesFilter) => listEntries(filter))
  ipcMain.handle(CH.ENTRY_GET, (_e, id: number) => getEntryById(id))
  ipcMain.handle(CH.ENTRY_SET_NOTE, (_e, id: number, note: string) => setNote(id, note))
  ipcMain.handle(CH.ENTRY_TOGGLE_STAR, (_e, id: number) => {
    const entry = getEntryById(id)
    if (!entry) return null
    return setStarred(id, !entry.isStarred)
  })
  ipcMain.handle(CH.ENTRY_TOGGLE_SUSPEND, (_e, id: number) => {
    const entry = getEntryById(id)
    if (!entry) return null
    return setSuspended(id, !entry.suspended)
  })
  ipcMain.handle(CH.ENTRY_DELETE, (_e, id: number) => deleteEntry(id))
  ipcMain.handle(CH.ENTRY_IMAGE_DATA, async (_e, id: number) => {
    const entry = getEntryById(id)
    if (!entry?.imagePath) return null
    try {
      const buf = await readFile(entry.imagePath)
      return `data:image/png;base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })
  ipcMain.handle(CH.ENTRY_BOLD_TARGETS, (_e, id: number) => boldEntryTargets(id))

  // ---- 追问（流式，边生成边推送） ----
  ipcMain.handle(
    CH.ENTRY_CHAT_ASK,
    async (e, entryId: number, question: string, chatId: string) => {
      const q = question.trim()
      if (!q) throw new Error('问题不能为空')
      const entry = getEntryById(entryId)
      if (!entry) throw new Error('词条不存在')
      const provider = getActiveProvider()
      if (!provider) throw new Error('尚未配置 AI 供应商，请打开设置页配置。')
      const context = entry.structured ? JSON.stringify(entry.structured).slice(0, 900) : '（无）'
      const controller = new AbortController()
      chatStreams.set(chatId, { entryId, question: q, controller, sender: e.sender })
      let full = ''
      try {
        for await (const delta of streamChat({
          provider,
          model: provider.chatModel,
          messages: [
            {
              role: 'system',
              content:
                `你是一位耐心的英语老师。用户正在学习词条「${entry.text}」，已有的讲解要点：${context}。` +
                '请针对用户的追问给出简短、准确的中文回答（不超过 150 字），直接回答，绝不反问。'
            },
            { role: 'user', content: q }
          ],
          signal: controller.signal
        })) {
          full += delta
          if (!e.sender.isDestroyed()) e.sender.send(CH.ENTRY_CHAT_CHUNK, { chatId, delta })
        }
        const pair = addEntryChat(entryId, q, full.trim() || '（模型未返回内容）')
        if (!e.sender.isDestroyed()) e.sender.send(CH.ENTRY_CHAT_DONE, { chatId, chat: pair })
      } catch (err) {
        const msg =
          err instanceof Error && err.name === 'AbortError'
            ? '已取消'
            : err instanceof Error
              ? err.message
              : String(err)
        if (!e.sender.isDestroyed()) e.sender.send(CH.ENTRY_CHAT_ERROR, { chatId, message: msg })
      } finally {
        chatStreams.delete(chatId)
      }
    }
  )
  ipcMain.handle(CH.ENTRY_CHAT_ABORT, (_e, chatId: string) => {
    chatStreams.get(chatId)?.controller.abort()
  })
  ipcMain.handle(CH.ENTRY_CHAT_LIST, (_e, entryId: number) => listEntryChats(entryId))
  ipcMain.handle(CH.ENTRY_CHAT_DELETE, (_e, id: number) => deleteEntryChat(id))

  // ---- 重新查询（生词本详情，流式推送回主窗口） ----
  ipcMain.handle(CH.ENTRY_RELOOKUP, (e, entryId: number, relookupId: string) =>
    relookupEntry(entryId, relookupId, e.sender)
  )
  ipcMain.handle(CH.ENTRY_RELOOKUP_ABORT, (_e, relookupId: string) => abortRelookup(relookupId))

  // ---- 复习 ----
  ipcMain.handle(CH.REVIEW_QUEUE, () => getReviewQueue(getSettings().dailyNew))
  ipcMain.handle(CH.REVIEW_FREE_QUEUE, () => getFreePracticeQueue())
  ipcMain.handle(
    CH.REVIEW_ANSWER,
    (_e, entryId: number, rating: Rating, mode: ReviewMode) => answer(entryId, rating, mode)
  )
  ipcMain.handle(CH.REVIEW_INTRODUCED, (_e, entryId: number) => markIntroduced(entryId))
  ipcMain.handle(CH.REVIEW_STATS, () => getReviewStats())

  // ---- 设置 ----
  ipcMain.handle(CH.SETTINGS_GET, () => getSettings())
  ipcMain.handle(CH.SETTINGS_SET, (_e, patch: Partial<AppSettings>) => {
    const next = setSettings(patch)
    // 仅快捷键变化时才重注册，避免频繁保存设置导致快捷键瞬间失效
    if (patch.hotkeys) registerShortcuts()
    broadcast(CH.SETTINGS_CHANGED, next)
    return next
  })
  ipcMain.handle(CH.PROVIDER_TEST, (_e, provider: ProviderConfig, useVision: boolean) =>
    testProvider(provider, useVision)
  )
  ipcMain.handle(CH.STORAGE_INFO, () => getStorageInfo())

  // ---- 截图 ----
  ipcMain.handle(
    CH.SCREENSHOT_CONFIRM,
    (_e, rect: { x: number; y: number; w: number; h: number }) => confirmScreenshot(rect)
  )
  ipcMain.handle(CH.SCREENSHOT_CANCEL, () => cancelScreenshot())

  // ---- 窗口 / 应用 ----
  ipcMain.handle(CH.APP_OPEN_MAIN, (_e, tab?: string) => showMainWindow(tab))
  ipcMain.handle(CH.APP_HIDE_POPUP, () => hidePopup())
  ipcMain.handle(CH.APP_LOOKUP_TEXT, (_e, text: string) => lookupTextFromRenderer(text))
  ipcMain.handle(CH.APP_OPEN_DATA_DIR, () => void shell.openPath(app.getPath('userData')))
  ipcMain.handle(CH.APP_QUIT, () => {
    setQuitting(true)
    app.quit()
  })
}
