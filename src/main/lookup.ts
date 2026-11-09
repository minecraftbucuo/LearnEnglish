// 查询流程编排：快捷键触发 → 抓取选中文本/接收截图 → 弹窗 → AI 流式讲解 → 持久化
import { randomUUID } from 'node:crypto'
import { BrowserWindow, screen } from 'electron'
import { CH } from '@shared/channels'
import type { AiDonePayload, EntrySource, EntryType, StructuredData } from '@shared/types'
import type { NestedLookupResult } from '@shared/api'
import { getActiveProvider, getSettings } from './settings'
import { captureSelectedText } from './capture'
import { captureRegionByHwnd } from './screenshot'
import { streamChat, type ChatMessage, type ChatContentPart } from './ai'
import { buildLookupMessages, extractAiData, FOLLOWUP_GUIDE, isSingleWord, isZhShort } from './prompts'
import type { LookupKind } from './prompt-kinds'
import { isZhContent } from '@shared/text'
import {
  addEntryChat,
  findEntryByText,
  getEntryById,
  incrementLookupCount,
  saveStructured,
  setStarred,
  upsertLookup
} from './db'
import {
  broadcast,
  getOverlayWindow,
  getPopupWindow,
  hideOverlay,
  showOverlay,
  showPopupNearCursor
} from './windows'

interface LookupSession {
  id: string
  text: string
  kind: LookupKind
  source: EntrySource
  entryId: number | null
  isStarred: boolean
  messages: ChatMessage[]
  controller: AbortController | null
  streaming: boolean
  context?: string // 句中释义：嵌套查询所在的原句（有值时提示词要求结合上下文讲解）
}

const sessions = new Map<string, LookupSession>()

/** 句中释义的系统说明：让模型结合原句解释单词在句中的含义，而非孤立讲词 */
function contextGuide(word: string, context: string): string {
  return `用户正在阅读下面这句话，并双击选中了其中的「${word}」：
「${context}」
请结合上下文解释这个词/短语在句中的含义：它在句子里具体是什么意思、什么词性、与句中哪些词搭配，整句如何理解它；可以顺带对比它最常见的其他含义以帮助区分。无需套用完整的单词卡片结构，直接讲解即可。`
}

function popupSend(channel: string, payload: unknown): void {
  getPopupWindow()?.webContents.send(channel, payload)
}

// ---------- 触发入口 ----------

/** Alt+Q：抓取选中文本并查词（弹窗无焦点瞬现，抓取完成后聚焦并填充内容） */
export async function triggerLookup(): Promise<void> {
  // 应用内快捷查词：焦点在自家窗口时直接读渲染层选区，不走剪贴板（模拟的 Ctrl+C 也打不进自己）
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && BrowserWindow.getAllWindows().includes(focused)) {
    let selected = ''
    try {
      selected = String(
        await focused.webContents.executeJavaScript(
          "window.getSelection ? window.getSelection().toString() : ''"
        )
      ).trim()
    } catch {
      // 渲染层不可用，忽略
    }
    if (selected) {
      if (focused === getPopupWindow()) {
        // 弹窗内查词：追加嵌套卡片，不顶掉当前内容
        const nl = createNestedLookup(selected)
        popupSend(CH.LOOKUP_START, {
          lookupId: nl.lookupId,
          text: nl.text,
          source: 'selection',
          entryId: nl.entryId,
          isStarred: nl.isStarred,
          hasStructured: !!nl.cachedMarkdown,
          cachedMarkdown: nl.cachedMarkdown,
          noProvider: nl.noProvider,
          context: nl.context,
          nested: true
        })
      } else {
        startLookup({ text: selected, source: 'selection' })
      }
      return
    }
    if (focused === getPopupWindow()) focused.hide() // 无选中：相当于关闭弹窗
    return
  }

  const settings = getSettings()
  const noProvider = !settings.providers.length || !settings.activeProviderId
  const preId = randomUUID()

  if (process.platform !== 'win32') {
    // Linux 最小版：暂不做自动抓词（Windows 版靠 user32.dll 模拟 Ctrl+C，不可移植），
    // 直接弹出聚焦的查询窗，复用「未抓到 → 手动输入」链路进入手动查询模式
    showPopupNearCursor(true)
    popupSend(CH.LOOKUP_START, {
      lookupId: preId,
      text: '',
      source: 'selection',
      entryId: null,
      isStarred: false,
      hasStructured: false,
      noProvider,
      capturing: true
    })
    popupSend(CH.LOOKUP_FAILED, { lookupId: preId })
    return
  }

  // 先无焦点弹窗占位（不能抢焦点，否则模拟的 Ctrl+C 会打到弹窗上）
  showPopupNearCursor(false)
  popupSend(CH.LOOKUP_START, {
    lookupId: preId,
    text: '',
    source: 'selection',
    entryId: null,
    isStarred: false,
    hasStructured: false,
    noProvider,
    capturing: true
  })

  const cap = await captureSelectedText()
  if (!cap.ok) {
    popupSend(CH.LOOKUP_FAILED, { lookupId: preId })
    return
  }
  startLookup({ text: cap.text, source: 'selection' })
}

// 覆盖层对应的显示器（确认框选时换算物理坐标用）
let overlayScaleFactor = 1

/** Alt+X：打开框选覆盖层（不预抓屏，覆盖层直接盖在活屏幕上） */
export async function triggerScreenshot(): Promise<void> {
  if (process.platform !== 'win32') return // Linux 暂不支持截图查询（GDI 抓屏不可移植）
  try {
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    overlayScaleFactor = display.scaleFactor
    await showOverlay(display, { scaleFactor: display.scaleFactor })
  } catch (err) {
    console.error('[lookup] screenshot failed:', err)
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 覆盖层确认框选结果：隐藏覆盖层 → 抓屏 → OCR 转文字 → 与普通查询完全同轨 */
export async function confirmScreenshot(rect: {
  x: number
  y: number
  w: number
  h: number
}): Promise<void> {
  hideOverlay()
  await sleep(90) // 等覆盖层从屏幕上消失，避免把自己截进去
  try {
    const overlay = getOverlayWindow()
    if (!overlay) throw new Error('覆盖层窗口不存在')
    const cap = captureRegionByHwnd(overlay.getNativeWindowHandle(), overlayScaleFactor, rect)

    // 先弹占位框（转文字期间），转出的文字就是普通查词的输入
    const settings = getSettings()
    const noProvider = !settings.providers.length || !settings.activeProviderId
    const preId = randomUUID()
    showPopupNearCursor(false)
    popupSend(CH.LOOKUP_START, {
      lookupId: preId,
      text: '',
      source: 'selection',
      entryId: null,
      isStarred: false,
      hasStructured: false,
      noProvider,
      capturing: true
    })

    const text = await transcribeImage(cap.dataUrl)
    if (!text) {
      popupSend(CH.LOOKUP_FAILED, { lookupId: preId })
      return
    }
    // 转出的文字按普通查询链路走
    startLookup({ text, source: 'selection' })
  } catch (err) {
    console.error('[lookup] 截图确认失败:', err)
  }
}

/** 截图 OCR：视觉模型把图里的文字抠出来，只返回文字本身（不讲解、不存图） */
async function transcribeImage(imageDataUrl: string): Promise<string> {
  const provider = getActiveProvider()
  if (!provider) return ''
  const parts: ChatContentPart[] = [
    { type: 'image_url', image_url: { url: imageDataUrl } },
    { type: 'text', text: '转录图中的文字。' }
  ]
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        '你是 OCR 引擎。把图片中的文字逐字转录出来：只输出文字本身，保持原有大小写、标点与换行，不要输出任何解释、标注或多余符号。图中没有文字时只输出空。'
    },
    { role: 'user', content: parts }
  ]
  const model = provider.visionModel || provider.chatModel
  let full = ''
  for await (const delta of streamChat({ provider, model, messages })) {
    full += delta
  }
  return full.trim()
}

export function cancelScreenshot(): void {
  hideOverlay()
}

// ---------- 会话 ----------

function createSession(p: {
  text: string
  source: EntrySource
}): { session: LookupSession; existing: ReturnType<typeof findEntryByText>; noProvider: boolean } {
  const settings = getSettings()
  const noProvider = !settings.providers.length || !settings.activeProviderId

  const kind: LookupKind = isZhContent(p.text)
    ? (isZhShort(p.text) ? 'zh_word' : 'zh_sentence')
    : isSingleWord(p.text)
      ? 'word'
      : 'sentence'

  const existing = p.text ? findEntryByText(p.text) : null
  const session: LookupSession = {
    id: randomUUID(),
    text: p.text,
    kind,
    source: p.source,
    entryId: existing?.id ?? null,
    isStarred: existing?.isStarred ?? false,
    messages: [],
    controller: null,
    streaming: false
  }
  sessions.set(session.id, session)
  // 会话数量上限，防泄漏
  if (sessions.size > 30) {
    const oldest = sessions.keys().next().value
    if (oldest) {
      sessions.get(oldest)?.controller?.abort()
      sessions.delete(oldest)
    }
  }
  return { session, existing, noProvider }
}

function startLookup(p: {
  text: string
  source: EntrySource
}): void {
  const { session, existing, noProvider } = createSession(p)
  showPopupNearCursor()
  popupSend(CH.LOOKUP_START, {
    lookupId: session.id,
    text: p.text,
    source: session.source,
    entryId: session.entryId,
    isStarred: session.isStarred,
    hasStructured: !!existing?.structured,
    cachedMarkdown: existing?.markdown ?? null,
    noProvider
  })
}

/** 弹窗内嵌套查询：创建会话但不重置弹窗 UI（弹窗以卡片形式追加展示）。
 * context 为嵌套查询所在的原句（句中释义模式）：双击句中单词时由弹窗传入 */
export function createNestedLookup(
  text: string,
  context?: string
): NestedLookupResult {
  const t = text.trim()
  if (!t || t.length > 200) throw new Error('无效查询文本')
  const ctx = context?.trim()
  const { session, existing, noProvider } = createSession({ text: t, source: 'selection' })
  if (ctx && ctx.length <= 2000) session.context = ctx
  return {
    lookupId: session.id,
    text: t,
    entryId: session.entryId,
    cachedMarkdown: existing?.markdown ?? null,
    isStarred: session.isStarred,
    noProvider,
    context: session.context ?? null
  }
}

/** 开始/重查：构建消息并流式请求。force=true 时丢弃历史重新生成（弹窗「重新生成」按钮） */
export async function runAi(lookupId: string, force = false): Promise<void> {
  const session = sessions.get(lookupId)
  if (!session) return
  const provider = getActiveProvider()
  if (!provider) {
    popupSend(CH.AI_ERROR, { lookupId, message: '尚未配置 AI 供应商，请打开设置页配置。' })
    return
  }
  const settings = getSettings()
  const kind = session.kind

  if (force || session.messages.length === 0 || session.messages[0]?.role !== 'system') {
    // 缓存态嵌套卡首问：会话里只有用户问题、无系统提示词 → 重建首答上下文并补回问题
    const last = session.messages[session.messages.length - 1]
    const pending = !force && last?.role === 'user' ? last : undefined
    session.kind = kind
    session.messages = buildLookupMessages(kind, session.text, settings.promptCards)
    // 句中释义：追加原句上下文说明（位于用户问题之前，仅首答构建时注入一次）
    if (session.context) session.messages.push({ role: 'system', content: contextGuide(session.text, session.context) })
    if (pending) session.messages.push(pending)
  }
  if (
    !force &&
    session.messages.some((m) => m.role === 'assistant') &&
    !session.messages.some((m) => m.role === 'system' && m.content === FOLLOWUP_GUIDE)
  ) {
    // 追问轮次：在最新用户问题前插入自由交流指引，解除首答的卡片结构与 AI_DATA 约束
    // （判定依据是已有 assistant 回答，而不是消息条数——句中释义会多带一条 context 系统消息）
    session.messages.splice(session.messages.length - 1, 0, {
      role: 'system',
      content: FOLLOWUP_GUIDE
    })
  }

  const model = provider.chatModel
  session.controller = new AbortController()
  session.streaming = true
  // 首次回答（非追问）才写入缓存；判定依据是会话里是否已有 assistant 回答，
  // 而不是消息条数（句中释义会多带一条 context 系统消息，按条数会把首答误判成追问）
  const isInitial = force || !session.messages.some((m) => m.role === 'assistant')
  let full = ''
  const t0 = Date.now()
  let firstChunk = 0
  try {
    for await (const delta of streamChat({
      provider,
      model,
      messages: session.messages,
      signal: session.controller.signal
    })) {
      if (!firstChunk) {
        firstChunk = Date.now()
        console.log(`[ai] 首字延迟 ${firstChunk - t0}ms (${provider.name}/${model})`)
      }
      full += delta
      popupSend(CH.AI_CHUNK, { lookupId, delta })
    }
  } catch (err) {
    session.streaming = false
    if (err instanceof Error && err.name === 'AbortError') {
      finishStream(session, full, isInitial, force)
      return
    }
    popupSend(CH.AI_ERROR, {
      lookupId,
      message: err instanceof Error ? err.message : String(err)
    })
    return
  }
  session.streaming = false
  console.log(
    `[ai] 完成 总耗时 ${Date.now() - t0}ms 输出 ${full.length} 字符 (${provider.name}/${model})`
  )
  finishStream(session, full, isInitial, force)
}

function finishStream(
  session: LookupSession,
  full: string,
  isInitial: boolean,
  regenerate = false
): void {
  const { markdown, data } = extractAiData(full)
  let structured: StructuredData | null = sanitizeStructured(data)
  // 追问轮次一般没有 AI_DATA；保留旧的结构化数据
  if (!data && session.messages.length > 2) structured = null

  const preExisting = session.entryId ? getEntryById(session.entryId) : null
  // 句中释义的正文是针对特定句子的解释，不作为词条的通用讲解缓存（下次双击同词应为新一轮句中释义）
  const cacheMarkdown = isInitial && !session.context
  let finalEntry = preExisting
  if (structured && markdown) {
    const type: EntryType =
      structured.type === 'word' || structured.type === 'sentence'
        ? structured.type
        : session.kind === 'word' || session.kind === 'zh_word'
          ? 'word'
          : 'sentence'
    finalEntry = finalEntry ?? upsertLookup({
      text: session.text || '（未识别出文本）',
      type,
      source: session.source
    })
    const saved = saveStructured(finalEntry.id, structured, cacheMarkdown ? markdown : undefined)
    if (saved) finalEntry = saved
    session.entryId = finalEntry.id
    session.isStarred = finalEntry.isStarred
  } else if (cacheMarkdown && finalEntry && markdown) {
    // 模型没输出结构化数据，但正文可用：仍缓存正文
    const saved = saveStructured(finalEntry.id, null, markdown)
    if (saved) finalEntry = saved
  } else if (!finalEntry && session.text) {
    finalEntry = upsertLookup({
      text: session.text,
      type: session.kind === 'word' || session.kind === 'zh_word' ? 'word' : 'sentence',
      source: session.source
    })
    session.entryId = finalEntry.id
  }

  // 记入会话历史（供追问）
  if (session.messages.length > 0 && markdown) {
    session.messages.push({ role: 'assistant', content: markdown })
  }

  // 追问轮次同步落库：弹窗里的提问与回答写入生词本的「追问 AI」记录（同一份对话，两端可见）
  if (!isInitial && markdown && session.entryId) {
    const last = [...session.messages].reverse().find((m) => m.role === 'user')
    // ChatMessage.content 类型上允许图片分片（仅截图 OCR 那次独立调用在用，不进会话），
    // 查询会话的用户消息实际恒为文本；此守卫只为满足类型检查
    const q = typeof last?.content === 'string' ? last.content : undefined
    if (q) addEntryChat(session.entryId, q, markdown)
  }

  // 重新生成也是一次真实查询：+1（本流内新建的词条已由 upsertLookup 计过）
  if (regenerate && preExisting && finalEntry) {
    finalEntry = incrementLookupCount(finalEntry.id) ?? finalEntry
  }

  // 词条可能新建/更新/追问追加：通知生词本等界面刷新
  broadcast(CH.ENTRIES_CHANGED)

  const payload: AiDonePayload = {
    lookupId: session.id,
    markdown,
    structured: structured ?? finalEntry?.structured ?? null,
    entryId: session.entryId
  }
  popupSend(CH.AI_DONE, payload)
}

/** 追问 */
export async function followUp(lookupId: string, question: string): Promise<void> {
  const session = sessions.get(lookupId)
  if (!session || !question.trim()) return
  session.messages.push({ role: 'user', content: question.trim() })
  await runAi(lookupId)
}

export function abortAi(lookupId: string): void {
  sessions.get(lookupId)?.controller?.abort()
}

/** 弹窗内划重点/取消重点（toggle） */
export function starCurrent(
  lookupId: string
): { starred: boolean; entryId: number | null } {
  const session = sessions.get(lookupId)
  if (!session) return { starred: false, entryId: null }
  const text = session.text.trim()
  if (!text) return { starred: false, entryId: session.entryId }
  let entry = session.entryId ? getEntryById(session.entryId) : null
  if (!entry) {
    entry = upsertLookup({
      text,
      type: session.kind === 'sentence' || session.kind === 'zh_sentence' ? 'sentence' : 'word',
      source: session.source
    })
    session.entryId = entry.id
  }
  // toggle：已划重点则取消，否则划入
  const next = !session.isStarred
  const updated = setStarred(entry.id, next)
  session.isStarred = next
  broadcast(CH.ENTRIES_CHANGED)
  return { starred: session.isStarred, entryId: updated?.id ?? entry.id }
}

/** 弹窗手动输入查询（未抓到选中文本时的手动模式） */
export function lookupTextFromRenderer(text: string): void {
  const t = text.trim()
  if (!t || t.length > 500) return
  startLookup({ text: t, source: 'manual' })
}

export function unstarEntry(entryId: number): void {
  setStarred(entryId, false)
}

// ---------- 生词本重新查询 ----------

// 进行中的重新查询流（relookupId → 状态），增量推送到主窗口
const relookupStreams = new Map<string, { controller: AbortController; sender: Electron.WebContents }>()

function relookupSend(sender: Electron.WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

/** 生词本详情「重新查询」：按词条内容重建提示词，流式回主窗口，完成后覆盖讲解缓存 */
export async function relookupEntry(
  entryId: number,
  relookupId: string,
  sender: Electron.WebContents
): Promise<void> {
  const entry = getEntryById(entryId)
  if (!entry) {
    relookupSend(sender, CH.ENTRY_RELOOKUP_ERROR, { relookupId, message: '词条不存在' })
    return
  }
  const provider = getActiveProvider()
  if (!provider) {
    relookupSend(sender, CH.ENTRY_RELOOKUP_ERROR, {
      relookupId,
      message: '尚未配置 AI 供应商，请打开设置页配置。'
    })
    return
  }

  // 重建查询类型：按词条语言与类型（截图词条落库就是普通文本词条，不再有原图）
  const zh = isZhContent(entry.text)
  const kind: LookupKind =
    entry.type === 'word' ? (zh ? 'zh_word' : 'word') : zh ? 'zh_sentence' : 'sentence'

  const settings = getSettings()
  const model = provider.chatModel
  const controller = new AbortController()
  relookupStreams.set(relookupId, { controller, sender })
  let full = ''
  let firstChunk = 0
  const t0 = Date.now()
  try {
    for await (const delta of streamChat({
      provider,
      model,
      messages: buildLookupMessages(kind, entry.text, settings.promptCards),
      signal: controller.signal
    })) {
      if (!firstChunk) {
        firstChunk = Date.now()
        console.log(`[ai] 首字延迟 ${firstChunk - t0}ms (${provider.name}/${model})`)
      }
      full += delta
      relookupSend(sender, CH.ENTRY_RELOOKUP_CHUNK, { relookupId, delta })
    }
  } catch (err) {
    relookupSend(sender, CH.ENTRY_RELOOKUP_ERROR, {
      relookupId,
      message:
        err instanceof Error && err.name === 'AbortError'
          ? '已取消'
          : err instanceof Error
            ? err.message
            : String(err)
    })
    return
  } finally {
    relookupStreams.delete(relookupId)
  }
  console.log(
    `[ai] 完成 总耗时 ${Date.now() - t0}ms 输出 ${full.length} 字符 (${provider.name}/${model})`
  )

  const { markdown, data } = extractAiData(full)
  const saved = saveStructured(entryId, sanitizeStructured(data), markdown)
  if (!saved) {
    relookupSend(sender, CH.ENTRY_RELOOKUP_ERROR, { relookupId, message: '词条已被删除' })
    return
  }
  // 重查就是一次真实查询：讲解覆盖为最新结果，查词次数 +1
  const refreshed = incrementLookupCount(saved.id) ?? saved
  broadcast(CH.ENTRIES_CHANGED)
  relookupSend(sender, CH.ENTRY_RELOOKUP_DONE, {
    relookupId,
    entry: refreshed,
    markdown
  })
}

export function abortRelookup(relookupId: string): void {
  relookupStreams.get(relookupId)?.controller.abort()
}

function sanitizeStructured(data: Record<string, unknown> | null): StructuredData | null {
  if (!data || typeof data !== 'object') return null
  const s: StructuredData = {}
  if (typeof data.type === 'string') s.type = data.type as EntryType
  if (data.lang === 'zh' || data.lang === 'en') s.lang = data.lang
  for (const k of ['phonetic', 'pos', 'definitionZh', 'definitionEn', 'translation', 'grammar', 'sourceText'] as const) {
    if (typeof data[k] === 'string') s[k] = data[k] as string
  }
  if (Array.isArray(data.equivalents)) {
    s.equivalents = (data.equivalents as unknown[])
      .filter(
        (e): e is { en: string; phonetic?: string; pos?: string; note?: string } =>
          !!e && typeof e === 'object' && typeof (e as { en?: unknown }).en === 'string'
      )
      .map((e) => ({
        en: String(e.en),
        phonetic: typeof e.phonetic === 'string' ? e.phonetic : undefined,
        pos: typeof e.pos === 'string' ? e.pos : undefined,
        note: typeof e.note === 'string' ? e.note : undefined
      }))
      .slice(0, 5)
  }
  if (Array.isArray(data.examples)) {
    s.examples = (data.examples as unknown[])
      .filter(
        (e): e is { en: string; zh: string } =>
          !!e && typeof e === 'object' && typeof (e as { en?: unknown }).en === 'string'
      )
      .map((e) => ({ en: String(e.en), zh: typeof e.zh === 'string' ? e.zh : '' }))
      .slice(0, 5)
  }
  if (Array.isArray(data.keyPoints)) {
    s.keyPoints = (data.keyPoints as unknown[])
      .filter(
        (k): k is { term: string; explanation: string } =>
          !!k && typeof k === 'object' && typeof (k as { term?: unknown }).term === 'string'
      )
      .map((k) => ({
        term: String(k.term),
        explanation: typeof k.explanation === 'string' ? k.explanation : ''
      }))
      .slice(0, 8)
  }
  return Object.keys(s).length ? s : null
}
