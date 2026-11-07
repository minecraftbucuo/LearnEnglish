import { ipcMain, app } from 'electron'
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
  deleteEntry,
  getEntryById,
  getReviewQueue,
  getReviewStats,
  listEntries,
  markIntroduced,
  setNote,
  setSuspended,
  setStarred
} from './db'
import { getSettings, setSettings } from './settings'
import { testProvider } from './ai'
import { registerShortcuts } from './shortcuts'
import { broadcast, hidePopup, setQuitting, showMainWindow } from './windows'
import { abortAi, confirmScreenshot, followUp, runAi, starCurrent, cancelScreenshot } from './lookup'

export function registerIpc(): void {
  // ---- AI 查询 ----
  ipcMain.handle(CH.AI_START, (_e, lookupId: string, force?: boolean) => runAi(lookupId, force))
  ipcMain.handle(CH.AI_FOLLOWUP, (_e, lookupId: string, question: string) =>
    followUp(lookupId, question)
  )
  ipcMain.handle(CH.AI_ABORT, (_e, lookupId: string) => abortAi(lookupId))
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

  // ---- 复习 ----
  ipcMain.handle(CH.REVIEW_QUEUE, () => getReviewQueue(getSettings().dailyNew))
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
    registerShortcuts()
    broadcast(CH.SETTINGS_CHANGED, next)
    return next
  })
  ipcMain.handle(CH.PROVIDER_TEST, (_e, provider: ProviderConfig, useVision: boolean) =>
    testProvider(provider, useVision)
  )

  // ---- 截图 ----
  ipcMain.handle(
    CH.SCREENSHOT_CONFIRM,
    (_e, rect: { x: number; y: number; w: number; h: number }) => confirmScreenshot(rect)
  )
  ipcMain.handle(CH.SCREENSHOT_CANCEL, () => cancelScreenshot())

  // ---- 窗口 / 应用 ----
  ipcMain.handle(CH.APP_OPEN_MAIN, (_e, tab?: string) => showMainWindow(tab))
  ipcMain.handle(CH.APP_HIDE_POPUP, () => hidePopup())
  ipcMain.handle(CH.APP_QUIT, () => {
    setQuitting(true)
    app.quit()
  })
}
