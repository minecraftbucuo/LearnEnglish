import { useEffect, useRef, useState } from 'react'
import type { AiDonePayload, LookupStartPayload } from '@shared/types'
import type { AiChunkPayload, AiErrorPayload } from '@shared/api'
import { Md } from '../components/Md'
import { speak } from '../utils'

interface Bubble {
  role: 'user' | 'assistant'
  content: string
}

export default function App(): React.JSX.Element {
  const [session, setSession] = useState<LookupStartPayload | null>(null)
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starred, setStarred] = useState(false)
  const [input, setInput] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const lookupIdRef = useRef<string | null>(null)

  useEffect(() => {
    const offs = [
      window.api.onLookupStart((p) => {
        lookupIdRef.current = p.lookupId
        setSession(p)
        setError(null)
        setStarred(p.isStarred)
        setInput('')
        setBubbles(
          p.noProvider ? [] : [{ role: 'user', content: p.source === 'image' ? '🖼️ 截图查询' : p.text }]
        )
        if (p.noProvider) {
          setStreaming(false)
        } else {
          setStreaming(true)
          void window.api.aiStart(p.lookupId)
        }
      }),
      window.api.onAiChunk(({ lookupId, delta }: AiChunkPayload) => {
        if (lookupId !== lookupIdRef.current) return
        setBubbles((bs) => {
          const last = bs[bs.length - 1]
          if (last?.role === 'assistant') {
            return [...bs.slice(0, -1), { role: 'assistant', content: last.content + delta }]
          }
          return [...bs, { role: 'assistant', content: delta }]
        })
      }),
      window.api.onAiDone(({ lookupId, markdown }: AiDonePayload) => {
        if (lookupId !== lookupIdRef.current) return
        setStreaming(false)
        setBubbles((bs) => {
          const last = bs[bs.length - 1]
          if (last?.role === 'assistant') {
            return [...bs.slice(0, -1), { role: 'assistant', content: markdown || last.content }]
          }
          return markdown ? [...bs, { role: 'assistant', content: markdown }] : bs
        })
      }),
      window.api.onAiError(({ lookupId, message }: AiErrorPayload) => {
        if (lookupId !== lookupIdRef.current) return
        setStreaming(false)
        setError(message)
      })
    ]
    return () => offs.forEach((f) => f())
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [bubbles, error])

  // 快捷键：Esc 关闭、Ctrl+S 划重点
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        void window.api.hidePopup()
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
    if (!id || starred) return
    const r = await window.api.starCurrent(id)
    if (r.starred) setStarred(true)
  }

  async function send(): Promise<void> {
    const q = input.trim()
    const id = lookupIdRef.current
    if (!q || streaming || !id) return
    setInput('')
    setBubbles((bs) => [...bs, { role: 'user', content: q }])
    setStreaming(true)
    await window.api.aiFollowup(id, q)
  }

  const title = session
    ? session.source === 'image'
      ? '截图查询'
      : session.text
    : '查词'

  const badge =
    session?.source === 'image' ? '图片' : (session?.text.trim().split(/\s+/).length ?? 1) > 1 ? '句子' : '单词'

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-800">
      {/* 标题栏（可拖动） */}
      <header className="app-drag flex items-center gap-2 border-b border-slate-200 bg-white/80 px-3.5 py-2.5 backdrop-blur">
        <span className="text-base">📖</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                session?.source === 'image'
                  ? 'bg-violet-100 text-violet-700'
                  : badge === '单词'
                    ? 'bg-teal-100 text-teal-700'
                    : 'bg-amber-100 text-amber-700'
              }`}
            >
              {badge}
            </span>
            <span className="truncate text-[13px] font-medium text-slate-700" title={title}>
              {title || '查词'}
            </span>
          </div>
        </div>
        <div className="app-no-drag flex items-center gap-0.5">
          {session?.source !== 'image' && (
            <IconBtn title="朗读" onClick={() => session && speak(session.text)}>
              🔊
            </IconBtn>
          )}
          <IconBtn title="划入重点 (Ctrl+S)" onClick={() => void star()} active={starred}>
            {starred ? '⭐' : '☆'}
          </IconBtn>
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
        <div className="border-b border-slate-200 bg-white px-3.5 py-2">
          <img
            src={session.imageDataUrl}
            alt="查询截图"
            className="max-h-28 w-auto rounded-md border border-slate-200"
          />
        </div>
      )}

      {/* 正文 */}
      <div ref={bodyRef} className="min-h-0 flex-1 select-text space-y-3 overflow-y-auto px-3.5 py-3">
        {!session && <Empty text="在任意应用中选中文本，按 Alt+Q 即可查询" />}

        {session?.noProvider && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <div className="mb-2 font-medium">尚未配置 AI 供应商</div>
            <div className="mb-3 text-xs leading-5 text-amber-700">
              填入任意 OpenAI 兼容 API（智谱 / 豆包 / DeepSeek / Kimi / OpenAI 均可）即可开始查词。
            </div>
            <button
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
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
            <div key={i} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
              <Md>{b.content}</Md>
              {streaming && i === bubbles.length - 1 && (
                <span className="stream-cursor text-teal-500" />
              )}
            </div>
          )
        )}

        {streaming && bubbles[bubbles.length - 1]?.role === 'user' && (
          <div className="text-xs text-slate-400">正在讲解…</div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* 追问输入 */}
      <footer className="border-t border-slate-200 bg-white p-2.5">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send()
            }}
            placeholder={streaming ? '讲解中…' : '继续追问，回车发送'}
            disabled={streaming || !session || session.noProvider}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] outline-none transition focus:border-teal-400 focus:bg-white disabled:opacity-50"
          />
          <button
            onClick={() => void send()}
            disabled={streaming || !input.trim()}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-teal-700 disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </footer>
    </div>
  )
}

function IconBtn({
  children,
  title,
  onClick,
  active
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  active?: boolean
}): React.JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-[13px] transition hover:bg-slate-100 ${
        active ? 'text-amber-500' : 'text-slate-500'
      }`}
    >
      {children}
    </button>
  )
}

function Empty({ text }: { text: string }): React.JSX.Element {
  return <div className="pt-16 text-center text-xs text-slate-400">{text}</div>
}
