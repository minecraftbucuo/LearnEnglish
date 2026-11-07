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

export default function App(): React.JSX.Element {
  const [session, setSession] = useState<LookupStartPayload | null>(null)
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starred, setStarred] = useState(false)
  const [input, setInput] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [manual, setManual] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [stack, setStack] = useState<NestedCard[]>([])
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
        setStack([])
        if (p.capturing) {
          setCapturing(true)
          setFromCache(false)
          setBubbles([])
          setStreaming(false)
          return
        }
        setCapturing(false)
        setManual(false)
        setFromCache(false)
        setBubbles(
          p.noProvider ? [] : [{ role: 'user', content: p.source === 'image' ? '🖼️ 截图查询' : p.text }]
        )
        if (p.noProvider) {
          setStreaming(false)
        } else if (p.cachedMarkdown) {
          setStreaming(false)
          setFromCache(true)
          setBubbles((bs) => [...bs, { role: 'assistant', content: p.cachedMarkdown! }])
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
        setBubbles([])
        setManual(true)
      }),
      window.api.onAiChunk(({ lookupId, delta }: AiChunkPayload) => {
        if (lookupId === lookupIdRef.current) {
          setBubbles((bs) => {
            const last = bs[bs.length - 1]
            if (last?.role === 'assistant') {
              return [...bs.slice(0, -1), { role: 'assistant', content: last.content + delta }]
            }
            return [...bs, { role: 'assistant', content: delta }]
          })
        } else {
          setStack((cs) =>
            cs.map((c) =>
              c.lookupId === lookupId
                ? {
                    ...c,
                    bubbles:
                      c.bubbles.length > 0
                        ? [...c.bubbles.slice(0, -1), { ...c.bubbles[c.bubbles.length - 1], content: c.bubbles[c.bubbles.length - 1].content + delta }]
                        : [...c.bubbles, { role: 'assistant' as const, content: delta }]
                  }
                : c
            )
          )
        }
      }),
      window.api.onAiDone(({ lookupId, markdown }: AiDonePayload) => {
        const apply = (bs: Bubble[]): Bubble[] => {
          const last = bs[bs.length - 1]
          if (last?.role === 'assistant') {
            return [...bs.slice(0, -1), { role: 'assistant', content: markdown || last.content }]
          }
          return markdown ? [...bs, { role: 'assistant', content: markdown }] : bs
        }
        if (lookupId === lookupIdRef.current) {
          setStreaming(false)
          setBubbles(apply)
        } else {
          setStack((cs) =>
            cs.map((c) =>
              c.lookupId === lookupId ? { ...c, streaming: false, bubbles: apply(c.bubbles) } : c
            )
          )
        }
      }),
      window.api.onAiError(({ lookupId, message }: AiErrorPayload) => {
        if (lookupId === lookupIdRef.current) {
          setStreaming(false)
          setError(message)
        } else {
          setStack((cs) =>
            cs.map((c) => (c.lookupId === lookupId ? { ...c, streaming: false, error: message } : c))
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
  }, [bubbles, error, stack, capturing])

  // 快捷键：Esc 先弹出嵌套卡再关闭；Ctrl+S 划重点
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setStack((cs) => {
          if (cs.length > 0) {
            const last = cs[cs.length - 1]
            void window.api.aiAbort(last.lookupId)
            return cs.slice(0, -1)
          }
          void window.api.hidePopup()
          return cs
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
    setStack((cs) => [
      ...cs,
      {
        lookupId: n.lookupId,
        text: n.text,
        bubbles: fromCache ? [{ role: 'assistant', content: n.cachedMarkdown! }] : [],
        streaming: !fromCache && !n.noProvider,
        error: null,
        starred: n.isStarred,
        noProvider: n.noProvider,
        fromCache
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
    if (manual || !lookupIdRef.current || bubbles[bubbles.length - 1]?.role !== 'assistant') {
      setManual(false)
      await window.api.lookupText(q)
      return
    }
    const id = lookupIdRef.current
    setInput('')
    setBubbles((bs) => [...bs, { role: 'user', content: q }])
    setStreaming(true)
    await window.api.aiFollowup(id, q)
  }

  const manualMode = manual && !!session
  const title = manualMode
    ? '手动查询'
    : session
      ? session.source === 'image'
        ? '截图查询'
        : session.text
      : '查词'

  const isZh = !!session && !manualMode && session.source !== 'image' && isZhText(session.text)
  const badge = manualMode
    ? '手动'
    : session?.source === 'image'
      ? '图片'
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
                session?.source === 'image' || badge === '中→英' || badge === '手动'
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
          {!!session && session.source !== 'image' && !isZh && !manualMode && !!session.text && (
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

      {/* 截图预览 */}
      {session?.imageDataUrl && (
        <div className="border-b border-zinc-800 bg-zinc-900 px-3.5 py-2">
          <img
            src={session.imageDataUrl}
            alt="查询截图"
            className="max-h-28 w-auto rounded-md border border-zinc-700"
          />
        </div>
      )}

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

        {manualMode && bubbles.length === 0 && (
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

        {bubbles.map((b, i) =>
          b.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-xl rounded-br-sm bg-teal-600 px-3 py-1.5 text-[13px] text-white">
                {b.content}
              </div>
            </div>
          ) : (
            <div key={i}>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 shadow-sm shadow-black/30">
                <Md>{b.content}</Md>
                {streaming && i === bubbles.length - 1 && (
                  <span className="stream-cursor text-teal-400" />
                )}
              </div>
              {fromCache && i === bubbles.length - 1 && (
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
        )}

        {capturing && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-3 text-xs text-zinc-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-teal-400" />
            正在获取选中的文本…
          </div>
        )}

        {streaming && bubbles[bubbles.length - 1]?.role === 'user' && (
          <div className="text-xs text-zinc-500">正在讲解…</div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300">
            ⚠️ {error}
          </div>
        )}

        {/* 嵌套查询卡片（双击单词 / 弹窗内 Alt+Q 追加） */}
        {stack.map((card) => (
          <div
            key={card.lookupId}
            className="rounded-xl border border-teal-500/25 bg-zinc-900/60 shadow-sm shadow-black/30"
          >
            <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  isZhText(card.text) ? 'bg-violet-500/15 text-violet-300' : 'bg-teal-500/15 text-teal-300'
                }`}
              >
                {isZhText(card.text) ? '中→英' : '词'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-200">
                {card.text}
              </span>
              <button
                title="划入重点"
                onClick={() => {
                  void window.api.starCurrent(card.lookupId).then((r) => {
                    if (r.starred) {
                      setStack((cs) =>
                        cs.map((c) => (c.lookupId === card.lookupId ? { ...c, starred: true } : c))
                      )
                    }
                  })
                }}
                className={`rounded px-1 py-0.5 text-[11px] transition hover:bg-zinc-800 ${
                  card.starred ? 'text-amber-400' : 'text-zinc-500'
                }`}
              >
                {card.starred ? '⭐' : '☆'}
              </button>
              <button
                title="收起（Esc 也可）"
                onClick={() => {
                  void window.api.aiAbort(card.lookupId)
                  setStack((cs) => cs.filter((c) => c.lookupId !== card.lookupId))
                }}
                className="rounded px-1 py-0.5 text-[11px] text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            <div className="px-3.5 py-2.5">
              {card.noProvider ? (
                <div className="text-xs text-amber-300">尚未配置 AI 供应商</div>
              ) : (
                <>
                  {card.bubbles.map((b, i) => (
                    <div key={i} className="md-body">
                      <Md>{b.content}</Md>
                      {card.streaming && i === card.bubbles.length - 1 && (
                        <span className="stream-cursor text-teal-400" />
                      )}
                    </div>
                  ))}
                  {card.streaming && card.bubbles.length === 0 && (
                    <div className="text-xs text-zinc-500">正在讲解…</div>
                  )}
                  {card.fromCache && !card.streaming && (
                    <div className="mt-1 text-right text-[10px] text-zinc-600">⚡ 缓存</div>
                  )}
                  {card.error && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] leading-5 text-red-300">
                      ⚠️ {card.error}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
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
    setBubbles([{ role: 'user', content: session.source === 'image' ? '🖼️ 截图查询' : session.text }])
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
