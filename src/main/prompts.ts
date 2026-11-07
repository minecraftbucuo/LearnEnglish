// 查询提示词组装：默认模板在 src/shared/default-prompts.ts（设置页可覆盖）
import type { PromptOverrides } from '@shared/types'
import { DEFAULT_PROMPTS } from '@shared/default-prompts'
import type { ChatMessage, ChatContentPart } from './ai'

export type LookupKind = 'word' | 'sentence' | 'zh_word' | 'zh_sentence' | 'image'

export function buildLookupMessages(
  kind: LookupKind,
  text: string,
  imageDataUrl?: string | null,
  overrides?: PromptOverrides
): ChatMessage[] {
  const systemPrompt =
    kind === 'word'
      ? (overrides?.word?.trim() || DEFAULT_PROMPTS.word)
      : kind === 'sentence'
        ? (overrides?.sentence?.trim() || DEFAULT_PROMPTS.sentence)
        : kind === 'zh_word'
          ? (overrides?.zhWord?.trim() || DEFAULT_PROMPTS.zhWord)
          : kind === 'zh_sentence'
            ? (overrides?.zhSentence?.trim() || DEFAULT_PROMPTS.zhSentence)
            : (overrides?.image?.trim() || DEFAULT_PROMPTS.image)

  const sys: ChatMessage = { role: 'system', content: systemPrompt }

  if (kind === 'image' && imageDataUrl) {
    const parts: ChatContentPart[] = [
      { type: 'image_url', image_url: { url: imageDataUrl } },
      { type: 'text', text: '请按系统指令讲解这张图片中的文本内容。' }
    ]
    return [sys, { role: 'user', content: parts }]
  }
  // 用户消息明确"这是要查的词条"，避免模型把词条内容误解为指令（如查"中文""翻译"）
  const wrapped =
    kind === 'word'
      ? `请讲解这个英语单词或短语：「${text}」`
      : kind === 'sentence'
        ? `请讲解这个英语句子：\n${text}`
        : kind === 'zh_word'
          ? `请给出「${text}」的地道英语表达`
          : `请把下面的中文翻译成地道的英语并讲解关键表达：\n${text}`
  return [sys, { role: 'user', content: wrapped }]
}

/** 从 AI 回复中剥离并解析 AI_DATA JSON 注释 */
export function extractAiData(
  markdown: string
): { markdown: string; data: Record<string, unknown> | null } {
  const marker = '<!--AI_DATA'
  const idx = markdown.lastIndexOf(marker)
  if (idx < 0) return { markdown: markdown.trim(), data: null }
  const visible = markdown.slice(0, idx).trim()
  const rest = markdown.slice(idx + marker.length)
  const end = rest.indexOf('-->')
  const jsonStr = (end >= 0 ? rest.slice(0, end) : rest).trim()
  try {
    return { markdown: visible, data: JSON.parse(jsonStr) as Record<string, unknown> }
  } catch {
    return { markdown: visible, data: null }
  }
}

/** 粗判：单词 or 句子 */
export function isSingleWord(text: string): boolean {
  const t = text.trim()
  if (t.length > 32) return false
  return !/\s/.test(t) || /^[A-Za-z'-]+ [A-Za-z'-]+$/.test(t)
  // "give up" 这类两词短语按单词（短语）讲解
}

/** 中文查词：短且无句读 → 词语/成语，否则按句子翻译 */
export function isZhShort(text: string): boolean {
  const t = text.trim()
  return t.length <= 12 && !/[。！？；，、,.!?;]/.test(t)
}
