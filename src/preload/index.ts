import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '@shared/channels'
import type { Api } from '@shared/api'

function subscribe(channel: string, cb: (...args: unknown[]) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  onLookupStart: (cb) => subscribe(CH.LOOKUP_START, cb as never),
  onLookupFailed: (cb) => subscribe(CH.LOOKUP_FAILED, cb as never),
  onOverlayStart: (cb) => subscribe(CH.OVERLAY_START, cb as never),
  onAiChunk: (cb) => subscribe(CH.AI_CHUNK, cb as never),
  onAiDone: (cb) => subscribe(CH.AI_DONE, cb as never),
  onAiError: (cb) => subscribe(CH.AI_ERROR, cb as never),
  onMainNavigate: (cb) => subscribe(CH.MAIN_NAVIGATE, cb as never),
  onSettingsChanged: (cb) => subscribe(CH.SETTINGS_CHANGED, cb as never),
  onEntriesChanged: (cb) => subscribe(CH.ENTRIES_CHANGED, cb as never),

  aiStart: (lookupId, force = false) => ipcRenderer.invoke(CH.AI_START, lookupId, force),
  nestedLookup: (text, context) => ipcRenderer.invoke(CH.AI_NESTED_LOOKUP, text, context),
  updateLookupText: (lookupId, text, force = false) =>
    ipcRenderer.invoke(CH.AI_LOOKUP_UPDATE_TEXT, lookupId, text, force),
  aiFollowup: (lookupId, question) => ipcRenderer.invoke(CH.AI_FOLLOWUP, lookupId, question),
  aiAbort: (lookupId) => ipcRenderer.invoke(CH.AI_ABORT, lookupId),
  starCurrent: (lookupId) => ipcRenderer.invoke(CH.STAR_CURRENT, lookupId),

  entriesList: (filter) => ipcRenderer.invoke(CH.ENTRIES_LIST, filter),
  entryGet: (id) => ipcRenderer.invoke(CH.ENTRY_GET, id),
  entryToggleStar: (id) => ipcRenderer.invoke(CH.ENTRY_TOGGLE_STAR, id),
  entryToggleSuspend: (id) => ipcRenderer.invoke(CH.ENTRY_TOGGLE_SUSPEND, id),
  entryDelete: (id) => ipcRenderer.invoke(CH.ENTRY_DELETE, id),
  entryUpdateText: (id, text, force = false) =>
    ipcRenderer.invoke(CH.ENTRY_UPDATE_TEXT, id, text, force),
  entryChatAsk: (entryId, question, chatId) =>
    ipcRenderer.invoke(CH.ENTRY_CHAT_ASK, entryId, question, chatId),
  entryChatAbort: (chatId) => ipcRenderer.invoke(CH.ENTRY_CHAT_ABORT, chatId),
  entryChatList: (entryId) => ipcRenderer.invoke(CH.ENTRY_CHAT_LIST, entryId),
  entryChatDelete: (id) => ipcRenderer.invoke(CH.ENTRY_CHAT_DELETE, id),
  onChatChunk: (cb) => subscribe(CH.ENTRY_CHAT_CHUNK, cb as never),
  onChatDone: (cb) => subscribe(CH.ENTRY_CHAT_DONE, cb as never),
  onChatError: (cb) => subscribe(CH.ENTRY_CHAT_ERROR, cb as never),
  entryRelookup: (entryId, relookupId) =>
    ipcRenderer.invoke(CH.ENTRY_RELOOKUP, entryId, relookupId),
  entryRelookupAbort: (relookupId) => ipcRenderer.invoke(CH.ENTRY_RELOOKUP_ABORT, relookupId),
  onRelookupChunk: (cb) => subscribe(CH.ENTRY_RELOOKUP_CHUNK, cb as never),
  onRelookupDone: (cb) => subscribe(CH.ENTRY_RELOOKUP_DONE, cb as never),
  onRelookupError: (cb) => subscribe(CH.ENTRY_RELOOKUP_ERROR, cb as never),

  reviewQueue: () => ipcRenderer.invoke(CH.REVIEW_QUEUE),
  practiceQueue: () => ipcRenderer.invoke(CH.REVIEW_PRACTICE_QUEUE),
  reviewAnswer: (entryId, rating, mode) => ipcRenderer.invoke(CH.REVIEW_ANSWER, entryId, rating, mode),
  reviewIntroduced: (entryId) => ipcRenderer.invoke(CH.REVIEW_INTRODUCED, entryId),
  reviewStats: () => ipcRenderer.invoke(CH.REVIEW_STATS),

  settingsGet: () => ipcRenderer.invoke(CH.SETTINGS_GET),
  settingsSet: (patch) => ipcRenderer.invoke(CH.SETTINGS_SET, patch),
  providerTest: (p, useVision = false) => ipcRenderer.invoke(CH.PROVIDER_TEST, p, useVision),
  storageInfo: () => ipcRenderer.invoke(CH.STORAGE_INFO),

  screenshotConfirm: (dataUrl) => ipcRenderer.invoke(CH.SCREENSHOT_CONFIRM, dataUrl),
  screenshotCancel: () => ipcRenderer.invoke(CH.SCREENSHOT_CANCEL),

  openMain: (tab) => ipcRenderer.invoke(CH.APP_OPEN_MAIN, tab),
  hidePopup: () => ipcRenderer.invoke(CH.APP_HIDE_POPUP),
  lookupText: (text) => ipcRenderer.invoke(CH.APP_LOOKUP_TEXT, text),
  openDataDir: () => ipcRenderer.invoke(CH.APP_OPEN_DATA_DIR),
  openExternal: (url) => ipcRenderer.invoke(CH.APP_OPEN_EXTERNAL, url),
}

contextBridge.exposeInMainWorld('api', api)
