// 查询流程编排：快捷键触发 → 抓取选中文本/接收截图 → 弹窗 → AI 流式讲解 → 持久化
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, screen } from 'electron'
import { CH } from '@shared/channels'
import type { AiDonePayload, EntrySource, EntryType, StructuredData } from '@shared/types'
import { getActiveProvider, getSettings } from './settings'
import { captureSelectedText } from './capture'
import { captureRegionByHwnd } from './screenshot'
import { streamChat, type ChatMessage } from './ai'
import { buildLookupMessages, extractAiData, isSingleWord, isZhShort } from './prompts'
import type { LookupKind } from './prompt-kinds'
import { isZhContent } from '@shared/text'
import { findEntryByText, getEntryById, saveStructured, setStarred, upsertLookup } from './db'
import {
  getOverlayWindow,
  getPopupWindow,
  hideOverlay,
  showOverlay,
  showPopupNearCursor
} from './windows'

interface LookupSession {
  id: string
  text: string // 截图查询初始为 ''，AI 转录后回填
  kind: LookupKind
  source: EntrySource
  imagePath: string | null
  imageDataUrl: string | null // 截图查询时给视觉模型的 dataURL
  entryId: number | null
  isStarred: boolean
  messages: ChatMessage[]
  controller: AbortController | null
  streaming: boolean
}

const sessions = new Map<string, LookupSession>()

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
          imagePath: null,
          imageDataUrl: null,
          entryId: nl.entryId,
          isStarred: nl.isStarred,
          hasStructured: !!nl.cachedMarkdown,
          cachedMarkdown: nl.cachedMarkdown,
          noProvider: nl.noProvider,
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

  // 先无焦点弹窗占位（不能抢焦点，否则模拟的 Ctrl+C 会打到弹窗上）
  showPopupNearCursor(false)
  popupSend(CH.LOOKUP_START, {
    lookupId: preId,
    text: '',
    source: 'selection',
    imagePath: null,
    imageDataUrl: null,
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

/** 覆盖层确认框选结果：隐藏覆盖层 → 等屏幕恢复 → GDI 抓选中区域 → PNG → 进入图片查询 */
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

    const dir = path.join(app.getPath('userData'), 'images')
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${Date.now()}.png`)
    writeFileSync(file, cap.png)
    startLookup({ text: '', source: 'image', imagePath: file, imageDataUrl: cap.dataUrl })
  } catch (err) {
    console.error('[lookup] 截图确认失败:', err)
  }
}

export function cancelScreenshot(): void {
  hideOverlay()
}

// ---------- 会话 ----------

function createSession(p: {
  text: string
  source: EntrySource
  imagePath?: string | null
  imageDataUrl?: string | null
}): { session: LookupSession; existing: ReturnType<typeof findEntryByText>; noProvider: boolean } {
  const settings = getSettings()
  const noProvider = !settings.providers.length || !settings.activeProviderId

  const kind: LookupKind = p.source === 'image'
    ? 'image'
    : isZhContent(p.text)
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
    imagePath: p.imagePath ?? null,
    imageDataUrl: p.imageDataUrl ?? null,
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
  imagePath?: string | null
  imageDataUrl?: string | null
}): void {
  const { session, existing, noProvider } = createSession(p)
  showPopupNearCursor()
  popupSend(CH.LOOKUP_START, {
    lookupId: session.id,
    text: p.source === 'image' ? '' : p.text,
    source: session.source,
    imagePath: session.imagePath,
    imageDataUrl: session.imageDataUrl,
    entryId: session.entryId,
    isStarred: session.isStarred,
    hasStructured: !!existing?.structured,
    cachedMarkdown: existing?.markdown ?? null,
    noProvider
  })
}

/** 弹窗内嵌套查询：创建会话但不重置弹窗 UI（弹窗以卡片形式追加展示） */
export function createNestedLookup(
  text: string
): { lookupId: string; text: string; entryId: number | null; cachedMarkdown: string | null; isStarred: boolean; noProvider: boolean } {
  const t = text.trim()
  if (!t || t.length > 200) throw new Error('无效查询文本')
  const { session, existing, noProvider } = createSession({ text: t, source: 'selection' })
  return {
    lookupId: session.id,
    text: t,
    entryId: session.entryId,
    cachedMarkdown: existing?.markdown ?? null,
    isStarred: session.isStarred,
    noProvider
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

  if (force || session.messages.length === 0) {
    session.kind = kind
    session.messages = buildLookupMessages(
      kind,
      session.text,
      session.imageDataUrl,
      settings.promptCards
    )
  }

  const model = kind === 'image' ? (provider.visionModel || provider.chatModel) : provider.chatModel
  session.controller = new AbortController()
  session.streaming = true
  // 首次回答（非追问）才写入缓存
  const isInitial = force || session.messages.length <= 2
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
      finishStream(session, full, isInitial)
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
  finishStream(session, full, isInitial)
}

function finishStream(session: LookupSession, full: string, isInitial: boolean): void {
  const { markdown, data } = extractAiData(full)
  let structured: StructuredData | null = sanitizeStructured(data)
  // 追问轮次一般没有 AI_DATA；保留旧的结构化数据
  if (!data && session.messages.length > 2) structured = null

  let finalEntry = session.entryId ? getEntryById(session.entryId) : null
  if (structured && markdown) {
    // 截图查询：用转录原文回填 text
    if (session.source === 'image' && structured.sourceText && !session.text) {
      session.text = structured.sourceText
    }
    const type: EntryType =
      structured.type === 'word' || structured.type === 'sentence'
        ? structured.type
        : session.kind === 'word' || session.kind === 'zh_word'
          ? 'word'
          : 'sentence'
    finalEntry = finalEntry ?? upsertLookup({
      text: session.text || '（未识别出文本）',
      type,
      source: session.source,
      imagePath: session.imagePath
    })
    const saved = saveStructured(finalEntry.id, structured, isInitial ? markdown : undefined)
    if (saved) finalEntry = saved
    session.entryId = finalEntry.id
    session.isStarred = finalEntry.isStarred
  } else if (isInitial && finalEntry && markdown) {
    // 模型没输出结构化数据，但正文可用：仍缓存正文
    const saved = saveStructured(finalEntry.id, null, markdown)
    if (saved) finalEntry = saved
  } else if (!finalEntry && session.text) {
    finalEntry = upsertLookup({
      text: session.text,
      type: session.kind === 'word' || session.kind === 'zh_word' ? 'word' : 'sentence',
      source: session.source,
      imagePath: session.imagePath
    })
    session.entryId = finalEntry.id
  }

  // 记入会话历史（供追问）
  if (session.messages.length > 0 && markdown) {
    session.messages.push({ role: 'assistant', content: markdown })
  }

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

/** 弹窗内划重点 */
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
      source: session.source,
      imagePath: session.imagePath
    })
    session.entryId = entry.id
  }
  const updated = setStarred(entry.id, true)
  session.isStarred = true
  return { starred: true, entryId: updated?.id ?? entry.id }
}

export function unstarEntry(entryId: number): void {
  setStarred(entryId, false)
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
