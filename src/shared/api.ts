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
  StorageInfo,
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

/** 生词本详情重新查询：事件负载 */
export interface RelookupChunkPayload {
  relookupId: string
  delta: string
}
export interface RelookupDonePayload {
  relookupId: string
  entry: Entry // 已保存的词条（截图合并时 id 可能变化）
  markdown: string // 最终正文
}
export interface RelookupErrorPayload {
  relookupId: string
  message: string
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
  entryToggleStar(id: number): Promise<Entry | null>
  entryToggleSuspend(id: number): Promise<Entry | null>
  entryDelete(id: number): Promise<void>
  entryChatAsk(entryId: number, question: string, chatId: string): Promise<void>
  entryChatAbort(chatId: string): Promise<void>
  entryChatList(entryId: number): Promise<EntryChat[]>
  entryChatDelete(id: number): Promise<void>
  onChatChunk(cb: (p: { chatId: string; delta: string }) => void): Unsubscribe
  onChatDone(cb: (p: { chatId: string; chat: EntryChat }) => void): Unsubscribe
  onChatError(cb: (p: { chatId: string; message: string }) => void): Unsubscribe
  entryRelookup(entryId: number, relookupId: string): Promise<void>
  entryRelookupAbort(relookupId: string): Promise<void>
  onRelookupChunk(cb: (p: RelookupChunkPayload) => void): Unsubscribe
  onRelookupDone(cb: (p: RelookupDonePayload) => void): Unsubscribe
  onRelookupError(cb: (p: RelookupErrorPayload) => void): Unsubscribe

  // ---- 复习 ----
  reviewQueue(): Promise<ReviewQueue>
  practiceQueue(): Promise<ReviewCard[]>
  reviewAnswer(entryId: number, rating: Rating, mode: ReviewMode): Promise<ReviewState | null>
  reviewIntroduced(entryId: number): Promise<void>
  reviewStats(): Promise<ReviewStats>

  // ---- 设置 ----
  settingsGet(): Promise<AppSettings>
  settingsSet(patch: Partial<AppSettings>): Promise<AppSettings>
  providerTest(p: ProviderConfig, useVision?: boolean): Promise<ProviderTestResult>
  storageInfo(): Promise<StorageInfo>

  // ---- 截图 ----
  screenshotConfirm(rect: SelectionRect): Promise<void>
  screenshotCancel(): Promise<void>

  // ---- 窗口 ----
  openMain(tab?: string): Promise<void>
  hidePopup(): Promise<void>
  lookupText(text: string): Promise<void>
  openDataDir(): Promise<void>
  /** 用系统浏览器打开外部链接（主进程只放行 GitHub） */
  openExternal(url: string): Promise<void>
}
