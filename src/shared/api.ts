// preload 暴露给渲染进程的 window.api 类型定义
import type {
  AiDonePayload,
  AppSettings,
  EntriesFilter,
  Entry,
  EntryChat,
  LookupStartPayload,
  ProviderConfig,
  ProviderTestResult,
  Rating,
  ReviewCard,
  ReviewMode,
  ReviewQueue,
  ReviewState,
  ReviewStats
} from './types'

export interface AiChunkPayload {
  lookupId: string
  delta: string
}

export interface AiErrorPayload {
  lookupId: string
  message: string
}

export interface LookupFailedPayload {
  lookupId: string
}

export interface OverlayStartPayload {
  scaleFactor: number
}

export interface SelectionRect {
  x: number
  y: number
  w: number
  h: number
}

/** 弹窗内双击查词：创建嵌套会话的结果 */
export interface NestedLookupResult {
  lookupId: string
  text: string
  cachedMarkdown: string | null
  isStarred: boolean
  noProvider: boolean
}

type Unsubscribe = () => void

export interface Api {
  // ---- 事件订阅 ----
  onLookupStart(cb: (p: LookupStartPayload) => void): Unsubscribe
  onLookupFailed(cb: (p: LookupFailedPayload) => void): Unsubscribe
  onOverlayStart(cb: (p: OverlayStartPayload) => void): Unsubscribe
  onAiChunk(cb: (p: AiChunkPayload) => void): Unsubscribe
  onAiDone(cb: (p: AiDonePayload) => void): Unsubscribe
  onAiError(cb: (p: AiErrorPayload) => void): Unsubscribe
  onMainNavigate(cb: (tab: string) => void): Unsubscribe
  onSettingsChanged(cb: (s: AppSettings) => void): Unsubscribe

  // ---- AI 查询 ----
  aiStart(lookupId: string, force?: boolean): Promise<void>
  nestedLookup(text: string): Promise<NestedLookupResult>
  aiFollowup(lookupId: string, question: string): Promise<void>
  aiAbort(lookupId: string): Promise<void>
  starCurrent(lookupId: string): Promise<{ starred: boolean; entryId: number | null }>

  // ---- 生词本 ----
  entriesList(filter?: EntriesFilter): Promise<Entry[]>
  entryGet(id: number): Promise<Entry | null>
  entrySetNote(id: number, note: string): Promise<Entry | null>
  entryToggleStar(id: number): Promise<Entry | null>
  entryToggleSuspend(id: number): Promise<Entry | null>
  entryDelete(id: number): Promise<void>
  entryImageData(id: number): Promise<string | null>
  entryBoldTargets(id: number): Promise<Entry | null>
  entryChatAsk(entryId: number, question: string): Promise<EntryChat>
  entryChatList(entryId: number): Promise<EntryChat[]>
  entryChatDelete(id: number): Promise<void>

  // ---- 复习 ----
  reviewQueue(): Promise<ReviewQueue>
  freeQueue(): Promise<ReviewCard[]>
  reviewAnswer(entryId: number, rating: Rating, mode: ReviewMode): Promise<ReviewState | null>
  reviewIntroduced(entryId: number): Promise<void>
  reviewStats(): Promise<ReviewStats>

  // ---- 设置 ----
  settingsGet(): Promise<AppSettings>
  settingsSet(patch: Partial<AppSettings>): Promise<AppSettings>
  providerTest(p: ProviderConfig, useVision?: boolean): Promise<ProviderTestResult>

  // ---- 截图 ----
  screenshotConfirm(rect: SelectionRect): Promise<void>
  screenshotCancel(): Promise<void>

  // ---- 窗口 ----
  openMain(tab?: string): Promise<void>
  hidePopup(): Promise<void>
  quit(): Promise<void>
}
