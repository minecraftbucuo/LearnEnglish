import { useEffect, useRef, useState } from 'react'
import type { AiDonePayload, LookupStartPayload } from '@shared/types'
import type { AiChunkPayload, AiErrorPayload, NestedLookupResult } from '@shared/api'
import { Md } from '../components/Md'
import { isZhText, speak } from '../utils'

interface Bubble {
  role: 'user' | 'assistant'
  content: string
}

/** 弹窗内双击/选词触发的嵌套查询卡片（追加在正文后，不顶掉当前内容） */
interface NestedCard {
  lookupId: string
  text: string
  bubbles: Bubble[] // 只有 assistant
  streaming: boolean
  error: string | null
  starred: boolean
  noProvider: boolean
  fromCache: boolean
}

/** 正文时间线：对话气泡与嵌套查询卡片按发生顺序混排 */
type Item =
  | { kind: 'bubble'; role: 'user' | 'assistant'; content: string }
  | { kind: 'nested'; card: NestedCard }

/** 最后一个对话气泡的下标（没有则 -1） */
function lastBubbleIndex(items: Item[]): number {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'bubble') return i
  return -1
}

/** 最后一个嵌套卡片的下标（没有则 -1） */
function lastNestedIndex(items: Item[]): number {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'nested') return i
  return -1
}

/** 把增量接到气泡列表最后一个 assistant 气泡上，没有则新开 */
function appendAssistantDelta(bubbles: Bubble[], delta: string): Bubble[] {
  const last = bubbles[bubbles.length - 1]
  if (last?.role === 'assistant')
    return [...bubbles.slice(0, -1), { ...last, content: last.content + delta }]
  return [...bubbles, { role: 'assistant', content: delta }]
}

/** 流结束：用最终 markdown 定格最后一个 assistant 气泡，没有则新开 */
function applyFinalMarkdown(bubbles: Bubble[], markdown: string): Bubble[] {
  const last = bubbles[bubbles.length - 1]
  if (last?.role === 'assistant')
    return [...bubbles.slice(0, -1), { role: 'assistant', content: markdown || last.content }]
  return markdown ? [...bubbles, { role: 'assistant', content: markdown }] : bubbles
}

export default function App(): React.JSX.Element {
  const [session, setSession] = useState<LookupStartPayload | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starred, setStarred] = useState(false)
  const [input, setInput] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [manual, setManual] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const lookupIdRef = useRef<string | null>(null) // 根会话

  useEffect(() => {
    const offs = [
      window.api.onLookupStart((p) => {
        // 嵌套查询（Alt+Q 在弹窗内选词）：追加卡片，不重置当前内容
        if (p.nested) {
          pushNestedCard({
            lookupId: p.lookupId,
            text: p.text,
            cachedMarkdown: p.cachedMarkdown ?? null,
            isStarred: p.isStarred,
            noProvider: p.noProvider
          })
          return
        }
        lookupIdRef.current = p.lookupId
        setSession(p)
        setError(null)
        setStarred(p.isStarred)
        setInput('')
        if (p.capturing) {
          setCapturing(true)
          setFromCache(false)
          setItems([])
          setStreaming(false)
          return
        }
        setCapturing(false)
        setManual(false)
        setFromCache(false)
        setItems(p.noProvider ? [] : [{ kind: 'bubble', role: 'user', content: p.text }])
        if (p.noProvider) {
          setStreaming(false)
        } else if (p.cachedMarkdown) {
          setStreaming(false)
          setFromCache(true)
          setItems((xs) => [...xs, { kind: 'bubble', role: 'assistant', content: p.cachedMarkdown! }])
        } else {
          setStreaming(true)
          void window.api.aiStart(p.lookupId)
        }
      }),
      window.api.onLookupFailed(({ lookupId }) => {
        if (lookupId !== lookupIdRef.current) return
        // 没抓到选中文本 → 转为手动查询模式（自己输入单词查询）
        setCapturing(false)
        setStreaming(false)
        setFromCache(false)
        setItems([])
        setManual(true)
      }),
      window.api.onAiChunk(({ lookupId, delta }: AiChunkPayload) => {
        if (lookupId === lookupIdRef.current) {
          setItems((xs) => {
            const idx = lastBubbleIndex(xs)
            const last = idx >= 0 ? xs[idx] : undefined
            if (last?.kind === 'bubble' && last.role === 'assistant') {
              return [
                ...xs.slice(0, idx),
                { ...last, content: last.content + delta },
                ...xs.slice(idx + 1)
              ]
            }
            return [...xs, { kind: 'bubble', role: 'assistant', content: delta }]
          })
        } else {
          setItems((xs) =>
            xs.map((x) =>
              x.kind === 'nested' && x.card.lookupId === lookupId
                ? { ...x, card: { ...x.card, bubbles: appendAssistantDelta(x.card.bubbles, delta) } }
                : x
            )
          )
        }
      }),
      window.api.onAiDone(({ lookupId, markdown }: AiDonePayload) => {
        if (lookupId === lookupIdRef.current) {
          setStreaming(false)
          setItems((xs) => {
            const idx = lastBubbleIndex(xs)
            const last = idx >= 0 ? xs[idx] : undefined
            if (last?.kind === 'bubble' && last.role === 'assistant') {
              return [
                ...xs.slice(0, idx),
                { ...last, content: markdown || last.content },
                ...xs.slice(idx + 1)
              ]
            }
            return markdown ? [...xs, { kind: 'bubble', role: 'assistant', content: markdown }] : xs
          })
        } else {
          setItems((xs) =>
            xs.map((x) =>
              x.kind === 'nested' && x.card.lookupId === lookupId
                ? {
                    ...x,
                    card: { ...x.card, streaming: false, bubbles: applyFinalMarkdown(x.card.bubbles, markdown) }
                  }
                : x
            )
          )
        }
      }),
      window.api.onAiError(({ lookupId, message }: AiErrorPayload) => {
        if (lookupId === lookupIdRef.current) {
          setStreaming(false)
          setError(message)
        } else {
          setItems((xs) =>
            xs.map((x) =>
              x.kind === 'nested' && x.card.lookupId === lookupId
                ? { ...x, card: { ...x.card, streaming: false, error: message } }
                : x
            )
          )
        }
      })
    ]
    return () => offs.forEach((f) => f())
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items, error, capturing])

  // 快捷键：Esc 先弹出嵌套卡再关闭；Ctrl+S 划重点
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setItems((xs) => {
          const idx = lastNestedIndex(xs)
          if (idx >= 0) {
            const it = xs[idx]
            if (it.kind === 'nested') void window.api.aiAbort(it.card.lookupId)
            return xs.slice(0, idx)
          }
          void window.api.hidePopup()
          return xs
        })
      } else if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        void star()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function star(): Promise<void> {
    const id = lookupIdRef.current
    if (!id || streaming) return
    // toggle：划入重点 ⇄ 取消重点
    const r = await window.api.starCurrent(id)
    setStarred(r.starred)
  }

  /** 弹窗内双击单词 → 嵌套查询卡片 */
  function pushNestedCard(n: {
    lookupId: string
    text: string
    cachedMarkdown: string | null
    isStarred: boolean
    noProvider: boolean
  }): void {
    const fromCache = !!n.cachedMarkdown
    setItems((xs) => [
      ...xs,
      {
        kind: 'nested' as const,
        card: {
          lookupId: n.lookupId,
          text: n.text,
          bubbles: fromCache ? [{ role: 'assistant', content: n.cachedMarkdown! }] : [],
          streaming: !fromCache && !n.noProvider,
          error: null,
          starred: n.isStarred,
          noProvider: n.noProvider,
          fromCache
        }
      }
    ])
    if (!fromCache && !n.noProvider) void window.api.aiStart(n.lookupId)
  }

  async function dblClickLookup(): Promise<void> {
    const sel = window.getSelection()?.toString().trim() ?? ''
    if (!sel || sel.length > 48) return
    const isZh = isZhText(sel)
    if (!isZh && sel.split(/\s+/).length > 2) return
    try {
      const n: NestedLookupResult = await window.api.nestedLookup(sel)
      pushNestedCard(n)
    } catch {
      // 无效文本，忽略
    }
  }

  async function send(): Promise<void> {
    const q = input.trim()
    if (!q || streaming) return
    // 手动查询模式：无会话/空文本时，输入即为发起查询
    const lastBubble = [...items].reverse().find((x) => x.kind === 'bubble')
    if (manual || !lookupIdRef.current || lastBubble?.role !== 'assistant') {
      setManual(false)
      await window.api.lookupText(q)
      return
    }
    const id = lookupIdRef.current
    setInput('')
    setItems((xs) => [...xs, { kind: 'bubble', role: 'user', content: q }])
    setStreaming(true)
    await window.api.aiFollowup(id, q)
  }

  const manualMode = manual && !!session
  const lastItem = items[items.length - 1]
  const lastBubbleIdx = lastBubbleIndex(items)
  const title = manualMode ? '手动查询' : session ? session.text : '查词'

  const isZh = !!session && !manualMode && isZhText(session.text)
  const badge = manualMode
    ? '手动'
    : isZh
      ? '中→英'
      : (session?.text.trim().split(/\s+/).length ?? 1) > 1
        ? '句子'
        : '单词'

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* 标题栏（可拖动） */}
      <header className="app-drag flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5">
        <span className="text-base">📖</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                badge === '中→英' || badge === '手动'
                  ? 'bg-violet-500/15 text-violet-300'
                  : badge === '单词'
                    ? 'bg-teal-500/15 text-teal-300'
                    : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {badge}
            </span>
            <span className="truncate text-[13px] font-medium text-zinc-200" title={title}>
              {title || '查词'}
            </span>
          </div>
        </div>
        <div className="app-no-drag flex items-center gap-0.5">
          {!!session && !isZh && !manualMode && !!session.text && (
            <IconBtn title="朗读" onClick={() => session && speak(session.text)}>
              🔊
            </IconBtn>
          )}
          {!manualMode && session?.text && (
            <IconBtn
              title={starred ? '取消重点 (Ctrl+S)' : '划入重点 (Ctrl+S)'}
              onClick={() => void star()}
              active={starred}
            >
              {starred ? '⭐' : '☆'}
            </IconBtn>
          )}
          {!manualMode && session?.text && (
            <IconBtn
              title="重新生成讲解（重新调用 AI）"
              onClick={() => void regenerate()}
              busy={streaming || capturing}
            >
              🔄
            </IconBtn>
          )}
          <IconBtn title="打开主窗口" onClick={() => void window.api.openMain()}>
            📚
          </IconBtn>
          <IconBtn title="设置" onClick={() => void window.api.openMain('settings')}>
            ⚙️
          </IconBtn>
          <IconBtn title="关闭 (Esc)" onClick={() => void window.api.hidePopup()}>
            ✕
          </IconBtn>
        </div>
      </header>

      {/* 正文（双击单词即可在下方追加该词的讲解卡片） */}
      <div
        ref={bodyRef}
        className="min-h-0 flex-1 select-text space-y-3 overflow-y-auto px-3.5 py-3"
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement
          if (target.closest('button, input, textarea, a')) return
          void dblClickLookup()
        }}
      >
        {!session && <Empty text="在任意应用中选中文本，按 Alt+Q 即可查询" />}

        {manualMode && items.length === 0 && (
          <Empty text="输入要查询的单词或句子，在下方回车即可" />
        )}

        {session?.noProvider && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <div className="mb-2 font-medium">尚未配置 AI 供应商</div>
            <div className="mb-3 text-xs leading-5 text-amber-200/70">
              填入任意 OpenAI 兼容 API（智谱 / 豆包 / DeepSeek / Kimi / OpenAI 均可）即可开始查词。
            </div>
            <button
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-zinc-950 transition hover:bg-amber-400"
              onClick={() => void window.api.openMain('settings')}
            >
              前往设置
            </button>
          </div>
        )}

        {/* 时间线：对话气泡与嵌套查询卡片按发生顺序混排 */}
        {items.map((it, i) =>
          it.kind === 'bubble' ? (
            it.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-xl rounded-br-sm bg-teal-600 px-3 py-1.5 text-[13px] text-white">
                  {it.content}
                </div>
              </div>
            ) : (
              <div key={i}>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 shadow-sm shadow-black/30">
                  <Md>{it.content}</Md>
                  {streaming && i === lastBubbleIdx && (
                    <span className="stream-cursor text-teal-400" />
                  )}
                </div>
                {fromCache && i === lastBubbleIdx && (
                  <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] text-zinc-500">
                    <span>⚡ 已用上次查询的缓存</span>
                    <button
                      onClick={() => void regenerate()}
                      className="rounded px-1.5 py-0.5 text-teal-400 transition hover:bg-zinc-800"
                    >
                      🔄 重新生成
                    </button>
                  </div>
                )}
              </div>
            )
          ) : (
            /* 嵌套查询卡片（双击单词 / 弹窗内 Alt+Q 追加） */
            <div
              key={it.card.lookupId}
              className="rounded-xl border border-teal-500/25 bg-zinc-900/60 shadow-sm shadow-black/30"
            >
              <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    isZhText(it.card.text)
                      ? 'bg-violet-500/15 text-violet-300'
                      : 'bg-teal-500/15 text-teal-300'
                  }`}
                >
                  {isZhText(it.card.text) ? '中→英' : '词'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-200">
                  {it.card.text}
                </span>
                <button
                  title="划入重点"
                  onClick={() => {
                    void window.api.starCurrent(it.card.lookupId).then((r) => {
                      if (r.starred) {
                        setItems((xs) =>
                          xs.map((x) =>
                            x.kind === 'nested' && x.card.lookupId === it.card.lookupId
                              ? { ...x, card: { ...x.card, starred: true } }
                              : x
                          )
                        )
                      }
                    })
                  }}
                  className={`rounded px-1 py-0.5 text-[11px] transition hover:bg-zinc-800 ${
                    it.card.starred ? 'text-amber-400' : 'text-zinc-500'
                  }`}
                >
                  {it.card.starred ? '⭐' : '☆'}
                </button>
                <button
                  title="收起（Esc 也可）"
                  onClick={() => {
                    void window.api.aiAbort(it.card.lookupId)
                    setItems((xs) =>
                      xs.filter(
                        (x) => !(x.kind === 'nested' && x.card.lookupId === it.card.lookupId)
                      )
                    )
                  }}
                  className="rounded px-1 py-0.5 text-[11px] text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                >
                  ✕
                </button>
              </div>
              <div className="px-3.5 py-2.5">
                {it.card.noProvider ? (
                  <div className="text-xs text-amber-300">尚未配置 AI 供应商</div>
                ) : (
                  <>
                    {it.card.bubbles.map((b, j) => (
                      <div key={j} className="md-body">
                        <Md>{b.content}</Md>
                        {it.card.streaming && j === it.card.bubbles.length - 1 && (
                          <span className="stream-cursor text-teal-400" />
                        )}
                      </div>
                    ))}
                    {it.card.streaming && it.card.bubbles.length === 0 && (
                      <div className="text-xs text-zinc-500">正在讲解…</div>
                    )}
                    {it.card.fromCache && !it.card.streaming && (
                      <div className="mt-1 text-right text-[10px] text-zinc-600">⚡ 缓存</div>
                    )}
                    {it.card.error && (
                      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] leading-5 text-red-300">
                        ⚠️ {it.card.error}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        )}

        {capturing && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-3 text-xs text-zinc-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-teal-400" />
            正在获取选中的文本…
          </div>
        )}

        {streaming && lastItem?.kind === 'bubble' && lastItem.role === 'user' && (
          <div className="text-xs text-zinc-500">正在讲解…</div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* 追问输入（针对当前主查询） */}
      <footer className="border-t border-zinc-800 bg-zinc-900 p-2.5">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send()
            }}
            placeholder={
              manualMode
                ? '输入要查询的单词或句子，回车'
                : streaming
                  ? '讲解中…'
                  : '继续追问，回车发送（双击单词可插入讲解卡片）'
            }
            disabled={streaming || (!manualMode && (!session || session.noProvider))}
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-[13px] text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-teal-500 focus:bg-zinc-800 disabled:opacity-50"
          />
          <button
            onClick={() => void send()}
            disabled={streaming || !input.trim() || (!manualMode && (!session || session.noProvider))}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-teal-500 disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </footer>
    </div>
  )

  async function regenerate(): Promise<void> {
    const id = lookupIdRef.current
    if (!id || streaming || !session) return
    setFromCache(false)
    setItems([{ kind: 'bubble', role: 'user', content: session.text }])
    setStreaming(true)
    await window.api.aiStart(id, true)
  }
}

function IconBtn({
  children,
  title,
  onClick,
  active,
  busy
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  active?: boolean
  busy?: boolean
}): React.JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={busy}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-[13px] transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'text-amber-400' : 'text-zinc-400'
      }`}
    >
      {children}
    </button>
  )
}

function Empty({ text }: { text: string }): React.JSX.Element {
  return <div className="pt-16 text-center text-xs text-zinc-500">{text}</div>
}
