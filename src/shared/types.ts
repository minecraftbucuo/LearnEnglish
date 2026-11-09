// 主进程与渲染进程共享的类型定义

export type EntryType = 'word' | 'sentence'
export type EntrySource = 'selection' | 'manual'
export type Rating = 1 | 2 | 3 // 不认识 / 模糊 / 认识
/** 复习方式：识记（看词忆义）/ 拼写（看义写词）。同一条进度，只是出题形式不同 */
export type ReviewMode = 'recall' | 'spelling'

export interface StructuredData {
  type?: EntryType
  lang?: 'en' | 'zh' // zh = 中文查词（讲解的是英语对应表达）
  phonetic?: string
  pos?: string
  definitionZh?: string
  definitionEn?: string
  translation?: string
  equivalents?: { en: string; phonetic?: string; pos?: string; note?: string }[] // 中→英对应表达
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
  structured: StructuredData | null
  markdown: string | null // 最近一次 AI 讲解原文（缓存复用，避免重复调 API）
  note: string
  isStarred: boolean
  suspended: boolean
  lookupCount: number
  createdAt: string
  updatedAt: string
  review: ReviewState | null
}

/** 学习状态筛选：未学 / 今日新学 / 已学（仅重点词） */
export type ReviewWordStatus = 'new' | 'today' | 'learned'

export interface EntriesFilter {
  query?: string
  type?: EntryType | 'all'
  starredOnly?: boolean
  reviewStatus?: ReviewWordStatus
  createdFrom?: string // 本地日期 YYYY-MM-DD（含当天 0 点起）
  createdTo?: string // 本地日期 YYYY-MM-DD（含当天）
  limit?: number
  offset?: number
}

export interface ReviewCard {
  entry: Entry
  state: ReviewState
  isNew: boolean
}

/** 生词本里的追问（即笔记）：一对问答，可单条删除 */
export interface EntryChat {
  id: number
  entryId: number
  question: string
  answer: string
  createdAt: string
}

export interface ReviewQueue {
  due: ReviewCard[]
  newCards: ReviewCard[]
  newRemaining: number // 受每日新卡上限约束后今天还能学的新卡数
}

/** 单日答题活动（按自评档拆分） */
export interface DailyActivity {
  date: string // 本地日期 YYYY-MM-DD
  total: number
  known: number // 认识
  fuzzy: number // 模糊
  forgot: number // 不认识
}

export interface ReviewStats {
  totalEntries: number
  starred: number
  reviewedToday: number
  newToday: number
  streakDays: number
  mastered: number
  learned: number // 已接触过的识记卡数（巩固轮可选范围）
  daily: DailyActivity[] // 近 30 天每日答题（缺的天补 0）
  heatmap: { date: string; count: number }[] // 近 15 周每日答题次数
  buckets: { mastered: number; learning: number; fresh: number } // 掌握(≥21天)/巩固中(1~20天)/刚学(已引入)
  upcoming: { date: string; count: number }[] // 未来 7 天（本地日期）
}

export interface ProviderConfig {
  id: string
  name: string
  baseURL: string // 例如 https://open.bigmodel.cn/api/paas/v4
  apiKey: string
  chatModel: string // 例如 glm-4-flash
  visionModel?: string // 例如 glm-4v-flash（截图查询用）
  disableThinking?: boolean // 关闭深度思考（思考型模型如 doubao-seed/glm-4.5+ 首字延迟可从 ~9s 降到 ~1s）
}

export interface HotkeyConfig {
  lookup: string // 默认 Alt+Q
  screenshot: string // 默认 Alt+X
  main: string // 默认 Alt+E
  recover: string // 默认 Alt+W：找回上一个查词弹窗
}

/** 提示词要求卡：勾选启用，程序按顺序拼装为最终提示词 */
export interface PromptCard {
  id: string
  title: string // 非锁定卡会成为 "## 标题" 小节
  content: string // 大白话需求，程序负责排版
  enabled: boolean
  locked?: boolean // 角色卡：始终生效、不可删除
  inline?: boolean // 约束型卡：作为普通段落注入，不生成小节标题
}

export type PromptKindKey = 'word' | 'sentence' | 'zhWord' | 'zhSentence'
export type PromptCardSet = Partial<Record<PromptKindKey, PromptCard[]>>

export interface AppSettings {
  providers: ProviderConfig[]
  activeProviderId: string
  hotkeys: HotkeyConfig
  dailyNew: number
  hideOnBlur: boolean
  autostart: boolean
  theme: 'dark' | 'light'
  promptCards: PromptCardSet // 未设置的 kind 使用内置默认
}

export interface LookupStartPayload {
  lookupId: string
  text: string
  source: EntrySource
  entryId: number | null
  isStarred: boolean
  hasStructured: boolean
  noProvider: boolean // 未配置 AI 供应商
  capturing?: boolean // true = 正在抓取/识别文本（弹窗先显示占位状态）
  cachedMarkdown?: string | null // 命中缓存的历史讲解（有值则弹窗直接显示，不调 API）
  nested?: boolean // true = 弹窗内嵌套查询（追加卡片，不重置弹窗）
  context?: string | null // 嵌套查询的句子上下文（句中释义模式）
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

/** 本机数据占用情况 */
export interface StorageInfo {
  dataDir: string
  dbBytes: number
  dbWalBytes: number
  configBytes: number
}
