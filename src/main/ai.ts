// OpenAI 兼容 Chat Completions 客户端（SSE 流式）
import type { ProviderConfig } from '@shared/types'

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatContentPart[]
}

export interface StreamOptions {
  provider: ProviderConfig
  model: string
  messages: ChatMessage[]
  signal?: AbortSignal
  temperature?: number
}

function trimBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, '')
}

/** 流式对话，逐段 yield 增量文本 */
export async function* streamChat(opts: StreamOptions): AsyncGenerator<string> {
  const url = `${trimBaseURL(opts.provider.baseURL)}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.provider.apiKey}`
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      temperature: opts.temperature ?? 0.2
    }),
    signal: opts.signal
  })

  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 500)
    let msg = `API 返回 ${res.status}`
    try {
      const j = JSON.parse(body)
      if (j.error?.message) msg += `：${j.error.message}`
      else if (j.message) msg += `：${j.message}`
      else msg += `：${body}`
    } catch {
      if (body) msg += `：${body}`
    }
    throw new Error(msg)
  }
  if (!res.body) throw new Error('API 未返回数据流')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload)
        if (j.error) throw new Error(j.error.message ?? 'API 流式返回错误')
        const delta: string | undefined = j.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch (err) {
        if (err instanceof Error && err.message !== 'Unexpected end of JSON input') {
          // JSON 解析失败可能是分块截断，忽略；明确的 API 错误向上抛
          if (!/JSON/.test(err.message)) throw err
        }
      }
    }
  }
}

/** 非流式连通性测试 */
export async function testProvider(
  provider: ProviderConfig,
  useVision = false
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const model = useVision ? provider.visionModel : provider.chatModel
  if (!model) return { ok: false, message: '未填写模型名' }
  const url = `${trimBaseURL(provider.baseURL)}/chat/completions`
  const started = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '请只回复两个字：成功' }],
        max_tokens: 16,
        temperature: 0
      }),
      signal: AbortSignal.timeout(20_000)
    })
    const latencyMs = Date.now() - started
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300)
      return { ok: false, message: `HTTP ${res.status}: ${body}` }
    }
    const j = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
      error?: { message?: string }
    }
    if (j.error) return { ok: false, message: j.error.message ?? 'API 错误' }
    const content = j.choices?.[0]?.message?.content ?? ''
    return { ok: true, message: `连接成功（${content.trim().slice(0, 20)}）`, latencyMs }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
