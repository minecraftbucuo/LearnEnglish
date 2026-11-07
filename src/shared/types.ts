// 主进程与渲染进程共享的类型定义

export type EntryType = 'word' | 'sentence'
export type EntrySource = 'selection' | 'image' | 'manual'
export type Rating = 1 | 2 | 3 | 4 // 忘记 / 困难 / 良好 / 简单
export type ReviewMode = 'recall' | 'spelling'

export interface StructuredData {
  type?: EntryType
  phonetic?: string
  pos?: string
  definitionZh?: string
  definitionEn?: string
  translation?: string
  examples?: { en: string; zh: string }[]
  keyPoints?: { term: string; explanation: string }[]
  grammar?: string
  sourceText?: string // 截图 OCR 转录原文
}

export interface ReviewState {
  entryId: number
  ease: number
  intervalDays: number
  dueAt: string // ISO
  reps: number
  lapses: number
  introducedAt: string | null // 新卡首次展示时间（计入当日新卡配额）
  lastReviewedAt: string | null
}

export interface Entry {
  id: number
  type: EntryType
  text: string
  context: string | null
  source: EntrySource
  imagePath: string | null
  structured: StructuredData | null
  note: string
  isStarred: boolean
  suspended: boolean
  lookupCount: number
  createdAt: string
  updatedAt: string
  review: ReviewState | null
}

export interface EntriesFilter {
  query?: string
  type?: EntryType | 'all'
  source?: EntrySource | 'all'
  starredOnly?: boolean
  limit?: number
  offset?: number
}

export interface ReviewCard {
  entry: Entry
  state: ReviewState
  isNew: boolean
}

export interface ReviewQueue {
  due: ReviewCard[]
  newCards: ReviewCard[]
  dueCount: number
  newRemaining: number // 受每日新卡上限约束后今天还能学的新卡数
}

export interface ReviewStats {
  totalEntries: number
  starred: number
  dueNow: number
  reviewedToday: number
  newToday: number
  streakDays: number
  mastered: number
  upcoming: { date: string; count: number }[] // 未来 7 天（本地日期）
}

export interface ProviderConfig {
  id: string
  name: string
  baseURL: string // 例如 https://open.bigmodel.cn/api/paas/v4
  apiKey: string
  chatModel: string // 例如 glm-4-flash
  visionModel?: string // 例如 glm-4v-flash（截图查询用）
}

export interface HotkeyConfig {
  lookup: string // 默认 Alt+Q
  screenshot: string // 默认 Alt+X
  main: string // 默认 Alt+E
}

export interface PromptOverrides {
  word?: string
  sentence?: string
  image?: string
}

export interface AppSettings {
  providers: ProviderConfig[]
  activeProviderId: string
  hotkeys: HotkeyConfig
  dailyNew: number
  hideOnBlur: boolean
  autostart: boolean
  prompts: PromptOverrides
}

export interface LookupStartPayload {
  lookupId: string
  text: string // 选中文本；截图查询时为 ''
  source: EntrySource
  imagePath: string | null
  imageDataUrl: string | null // 弹窗内展示截图用
  entryId: number | null
  isStarred: boolean
  hasStructured: boolean
  noProvider: boolean // 未配置 AI 供应商
  capturing?: boolean // true = 正在抓取选中文本（弹窗先显示占位状态）
}

/** 截图覆盖层数据：原始 RGBA 位图 + 当前显示器在位图中的物理矩形 */
export interface ScreenCapturePayload {
  buf: Uint8Array
  width: number
  height: number
  rect: { x: number; y: number; w: number; h: number }
  scaleFactor: number
}

export interface AiDonePayload {
  lookupId: string
  markdown: string // 已剥离 AI_DATA 的最终正文
  structured: StructuredData | null
  entryId: number | null
}

export interface ProviderTestResult {
  ok: boolean
  message: string
  latencyMs?: number
}
