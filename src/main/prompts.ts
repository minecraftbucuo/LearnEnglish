// 查询提示词模板（词 / 句 / 图）
import type { PromptOverrides } from '@shared/types'
import type { ChatMessage, ChatContentPart } from './ai'

const AI_DATA_RULE = `最后，你必须另起一行追加一个 HTML 注释形式的 JSON 数据块，格式严格如下（必须为合法 JSON、单行、双引号）：
<!--AI_DATA {...}-->
JSON 字段见各模板末尾示例。除该注释外，不要输出任何其他多余内容，不要把 JSON 写在代码块里。`

const WORD_PROMPT = `你是一位耐心、专业的英语老师，面向中国学生。用户会给你一个英语单词或短语，请用中文讲解。

严格按照以下 Markdown 结构输出（内容真实、简洁，总正文不超过 350 字；例句不算在内）：

## 音标与释义
- **音标**：/美音音标/
- **词性与释义**：adj. 一丝不苟的；极其仔细的（多个常用词性可并列）

## 英文释义
一句简明的英文释义。

## 例句
1. 例句中用 **粗体** 标出目标词。
   对应中文翻译。
2. （再来一个不同语境的例句）

## 拓展
- **搭配**：最常用的 1-3 个搭配
- **近义词辨析**：与最易混词的简要区别（若无必要可整节省略）

${AI_DATA_RULE}
词的 JSON 示例：
<!--AI_DATA {"type":"word","phonetic":"/məˈtɪkjələs/","pos":"adj.","definitionZh":"一丝不苟的；极其仔细的","examples":[{"en":"The preparations were meticulous.","zh":"准备工作一丝不苟。"}]}-->`

const SENTENCE_PROMPT = `你是一位耐心、专业的英语老师，面向中国学生。用户会给你一个英语句子或段落，请用中文讲解。

严格按照以下 Markdown 结构输出：

## 翻译
忠实且地道的中文翻译（段落可分句翻译）。

## 词汇精讲
- **word**（词性）：该词在本句中的含义、用法或搭配说明

挑选 3-6 个最值得讲的词或短语；若整句都很简单，可以少讲，但不能为空。

## 语法结构
分析主谓宾、从句、时态或特殊句式，2-3 句话说清；简单句则简要说明句子成分。

${AI_DATA_RULE}
句子的 JSON 示例：
<!--AI_DATA {"type":"sentence","translation":"...","keyPoints":[{"term":"...","explanation":"..."}],"grammar":"..."}-->`

const IMAGE_PROMPT = `这是一张包含英文文本的屏幕截图。请：
1. 先逐字转录图中全部英文内容（保持原文大小写与标点）。
2. 判断内容是一个单词/短语，还是句子/段落。
3. 按对应的模板结构讲解（单词用词模板、句子用句模板）。

${AI_DATA_RULE}
JSON 中额外加 "sourceText" 字段存放你转录的原文，type 按你判断的填写：
<!--AI_DATA {"type":"word","sourceText":"...","phonetic":"...","pos":"...","definitionZh":"...","examples":[...]}-->`

export type LookupKind = 'word' | 'sentence' | 'image'

export function buildLookupMessages(
  kind: LookupKind,
  text: string,
  imageDataUrl?: string | null,
  overrides?: PromptOverrides
): ChatMessage[] {
  const systemPrompt =
    kind === 'word'
      ? (overrides?.word?.trim() || WORD_PROMPT)
      : kind === 'sentence'
        ? (overrides?.sentence?.trim() || SENTENCE_PROMPT)
        : (overrides?.image?.trim() || IMAGE_PROMPT)

  const sys: ChatMessage = { role: 'system', content: systemPrompt }

  if (kind === 'image' && imageDataUrl) {
    const parts: ChatContentPart[] = [
      { type: 'image_url', image_url: { url: imageDataUrl } },
      { type: 'text', text: '请讲解这张图片中的英文内容。' }
    ]
    return [sys, { role: 'user', content: parts }]
  }
  return [sys, { role: 'user', content: text }]
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
