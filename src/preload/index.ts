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
  onOverlayStart: (cb) => subscribe(CH.OVERLAY_START, cb as never),
  onAiChunk: (cb) => subscribe(CH.AI_CHUNK, cb as never),
  onAiDone: (cb) => subscribe(CH.AI_DONE, cb as never),
  onAiError: (cb) => subscribe(CH.AI_ERROR, cb as never),
  onMainNavigate: (cb) => subscribe(CH.MAIN_NAVIGATE, cb as never),
  onSettingsChanged: (cb) => subscribe(CH.SETTINGS_CHANGED, cb as never),

  aiStart: (lookupId) => ipcRenderer.invoke(CH.AI_START, lookupId),
  aiFollowup: (lookupId, question) => ipcRenderer.invoke(CH.AI_FOLLOWUP, lookupId, question),
  aiAbort: (lookupId) => ipcRenderer.invoke(CH.AI_ABORT, lookupId),
  starCurrent: (lookupId) => ipcRenderer.invoke(CH.STAR_CURRENT, lookupId),

  entriesList: (filter) => ipcRenderer.invoke(CH.ENTRIES_LIST, filter),
  entryGet: (id) => ipcRenderer.invoke(CH.ENTRY_GET, id),
  entrySetNote: (id, note) => ipcRenderer.invoke(CH.ENTRY_SET_NOTE, id, note),
  entryToggleStar: (id) => ipcRenderer.invoke(CH.ENTRY_TOGGLE_STAR, id),
  entryToggleSuspend: (id) => ipcRenderer.invoke(CH.ENTRY_TOGGLE_SUSPEND, id),
  entryDelete: (id) => ipcRenderer.invoke(CH.ENTRY_DELETE, id),
  entryImageData: (id) => ipcRenderer.invoke(CH.ENTRY_IMAGE_DATA, id),

  reviewQueue: () => ipcRenderer.invoke(CH.REVIEW_QUEUE),
  reviewAnswer: (entryId, rating, mode) => ipcRenderer.invoke(CH.REVIEW_ANSWER, entryId, rating, mode),
  reviewIntroduced: (entryId) => ipcRenderer.invoke(CH.REVIEW_INTRODUCED, entryId),
  reviewStats: () => ipcRenderer.invoke(CH.REVIEW_STATS),

  settingsGet: () => ipcRenderer.invoke(CH.SETTINGS_GET),
  settingsSet: (patch) => ipcRenderer.invoke(CH.SETTINGS_SET, patch),
  providerTest: (p, useVision = false) => ipcRenderer.invoke(CH.PROVIDER_TEST, p, useVision),

  screenshotConfirm: (dataUrl) => ipcRenderer.invoke(CH.SCREENSHOT_CONFIRM, dataUrl),
  screenshotCancel: () => ipcRenderer.invoke(CH.SCREENSHOT_CANCEL),

  openMain: (tab) => ipcRenderer.invoke(CH.APP_OPEN_MAIN, tab),
  hidePopup: () => ipcRenderer.invoke(CH.APP_HIDE_POPUP),
  quit: () => ipcRenderer.invoke(CH.APP_QUIT)
}

contextBridge.exposeInMainWorld('api', api)
