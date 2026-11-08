import { useCallback, useEffect, useRef, useState } from 'react'
import type { EntriesFilter, Entry, EntryChat, EntryType, ReviewWordStatus } from '@shared/types'
import { fmtDateTime, isZhText, speak } from '../../utils'
import { EmText } from '../../components/EmText'
import { Md } from '../../components/Md'

type TypeFilter = EntryType | 'all'

export function LibraryPage({
  initialStatus
}: {
  initialStatus?: ReviewWordStatus
}): React.JSX.Element {
  const [entries, setEntries] = useState<Entry[]>([])
  const [selected, setSelected] = useState<Entry | null>(null)
  const [detailWidth, setDetailWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem('le_detail_width'))
    return v >= 300 && v <= 760 ? v : 400
  })
  const draggingRef = useRef(false)
  const widthRef = useRef(detailWidth)

  // 详情面板宽度拖拽（带记忆）
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return
      const max = Math.min(760, window.innerWidth - 340)
      const w = Math.min(Math.max(window.innerWidth - e.clientX, 300), max)
      widthRef.current = w
      setDetailWidth(w)
    }
    const onUp = (): void => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('le_detail_width', String(widthRef.current))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [starredOnly, setStarredOnly] = useState(false)
  const [status, setStatus] = useState<ReviewWordStatus | null>(initialStatus ?? null)
  // 时间筛选：预设区间或指定某一天（本地日期 YYYY-MM-DD）
  const [datePreset, setDatePreset] = useState<'today' | '7d' | '30d' | 'day' | null>(null)
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({})

  const dayStr = (d: Date): string => {
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  function setDate(preset: 'today' | '7d' | '30d' | 'day', day?: string): void {
    if (preset === 'day' && day) {
      setDatePreset('day')
      setDateRange({ from: day, to: day })
      return
    }
    if (datePreset === preset) {
      setDatePreset(null)
      setDateRange({})
      return
    }
    const now = new Date()
    if (preset === 'today') {
      setDateRange({ from: dayStr(now), to: dayStr(now) })
    } else {
      const from = new Date(now)
      from.setDate(now.getDate() - (preset === '7d' ? 6 : 29))
      setDateRange({ from: dayStr(from), to: dayStr(now) })
    }
    setDatePreset(preset)
  }

  function clearDate(): void {
    setDatePreset(null)
    setDateRange({})
  }

  const load = useCallback(async (): Promise<void> => {
    const filter: EntriesFilter = {
      query: query.trim() || undefined,
      type,
      starredOnly,
      reviewStatus: status ?? undefined,
      createdFrom: dateRange.from,
      createdTo: dateRange.to,
      limit: 300
    }
    setEntries(await window.api.entriesList(filter))
  }, [query, type, starredOnly, status, dateRange])

  useEffect(() => {
    void load()
  }, [load])

  async function refreshSelected(): Promise<void> {
    if (!selected) return
    const fresh = await window.api.entryGet(selected.id)
    setSelected(fresh)
    await load()
  }

  const chip = (active: boolean): string =>
    `rounded-full px-2.5 py-1 text-xs transition border ${
      active
        ? 'border-teal-500 bg-teal-500/15 text-teal-300'
        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
    }`

  return (
    <div className="flex h-full">
      {/* 列表区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="space-y-2.5 border-b border-zinc-800 bg-zinc-900/60 px-5 py-3.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索单词、句子或笔记…"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-teal-500"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'word', 'sentence'] as TypeFilter[]).map((t) => (
              <button key={t} className={chip(type === t)} onClick={() => setType(t)}>
                {t === 'all' ? '全部' : t === 'word' ? '单词' : '句子'}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-zinc-800" />
            <button className={chip(starredOnly)} onClick={() => setStarredOnly((v) => !v)}>
              ⭐ 重点
            </button>
            <span className="mx-1 h-4 w-px bg-zinc-800" />
            {(
              [
                { key: 'new', label: '未学' },
                { key: 'today', label: '今日新学' },
                { key: 'learned', label: '已学' }
              ] as { key: ReviewWordStatus; label: string }[]
            ).map((s) => (
              <button
                key={s.key}
                className={chip(status === s.key)}
                onClick={() => setStatus(status === s.key ? null : s.key)}
              >
                {s.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-zinc-800" />
            <button className={chip(datePreset === 'today')} onClick={() => setDate('today')}>
              今天
            </button>
            <button className={chip(datePreset === '7d')} onClick={() => setDate('7d')}>
              近7天
            </button>
            <button className={chip(datePreset === '30d')} onClick={() => setDate('30d')}>
              近30天
            </button>
            <input
              type="date"
              value={datePreset === 'day' ? (dateRange.from ?? '') : ''}
              onChange={(e) => {
                if (e.target.value) setDate('day', e.target.value)
              }}
              title="按某一天筛选"
              className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 outline-none transition [color-scheme:dark] hover:border-zinc-700 focus:border-teal-500"
            />
            {datePreset && (
              <button
                onClick={clearDate}
                title="清除时间筛选"
                className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
              >
                ✕
              </button>
            )}
            <span className="ml-auto text-xs text-zinc-600">{entries.length} 条</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {entries.length === 0 && (
            <div className="pt-24 text-center text-sm text-zinc-600">
              还没有查询记录。在任意应用中选中文本按 Alt+Q 查询，或按 Alt+X 截图查询。
            </div>
          )}
          <div className="space-y-1.5">
            {entries.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition ${
                  selected?.id === e.id
                    ? 'border-teal-500/50 bg-teal-500/10'
                    : 'border-zinc-800/60 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/60'
                }`}
              >
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                    e.type === 'word'
                      ? 'bg-teal-500/15 text-teal-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {e.type === 'word' ? '词' : '句'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{e.text}</span>
                {e.isStarred && <span className="shrink-0 text-xs">⭐</span>}
                {e.suspended && <span className="shrink-0 text-[10px] text-zinc-600">暂停</span>}
                <span className="shrink-0 text-[11px] text-zinc-600">×{e.lookupCount}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 拖拽分隔条 + 详情区 */}
      {selected && (
        <div
          className="w-1.5 shrink-0 cursor-col-resize bg-zinc-800/60 transition-colors hover:bg-teal-500/60"
          onMouseDown={(e) => {
            e.preventDefault()
            draggingRef.current = true
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
          }}
        />
      )}
      {selected && (
        <EntryDetail
          entry={selected}
          width={detailWidth}
          onChanged={refreshSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function EntryDetail({
  entry,
  width,
  onChanged,
  onClose
}: {
  entry: Entry
  width: number
  onChanged: () => Promise<void> | void
  onClose: () => void
}): React.JSX.Element {
  const [chats, setChats] = useState<EntryChat[]>([])
  const [chatQ, setChatQ] = useState('')
  const [pending, setPending] = useState<{
    chatId: string
    entryId: number
    question: string
    answer: string
    error: string | null
  } | null>(null)
  const [relookup, setRelookup] = useState<{
    relookupId: string
    answer: string
    error: string | null
  } | null>(null)
  const entryIdRef = useRef(entry.id)
  const onChangedRef = useRef(onChanged)

  useEffect(() => {
    onChangedRef.current = onChanged
  })

  useEffect(() => {
    void window.api.entryChatList(entry.id).then(setChats)
    entryIdRef.current = entry.id
    setPending(null) // 切换词条：进行中的流继续在后台完成并存库
    setRelookup(null)
  }, [entry.id])

  useEffect(() => {
    const offs = [
      window.api.onChatChunk(({ chatId, delta }) => {
        setPending((p) =>
          p && p.chatId === chatId ? { ...p, answer: p.answer + delta } : p
        )
      }),
      window.api.onChatDone(({ chatId, chat }) => {
        setPending((p) => (p && p.chatId === chatId ? null : p))
        // 只追加到当前正在查看的词条；否则已存库，切回时自然加载
        if (chat.entryId === entryIdRef.current) setChats((cs) => [...cs, chat])
      }),
      window.api.onChatError(({ chatId, message }) => {
        setPending((p) => (p && p.chatId === chatId ? { ...p, error: message } : p))
      }),
      window.api.onRelookupChunk(({ relookupId, delta }) => {
        setRelookup((r) =>
          r && r.relookupId === relookupId ? { ...r, answer: r.answer + delta } : r
        )
      }),
      window.api.onRelookupDone(({ relookupId, entry: updated }) => {
        setRelookup((r) => (r && r.relookupId === relookupId ? null : r))
        // 只就地刷新当前查看的词条；截图合并等场景 id 已变，切回时自然加载
        if (updated.id === entryIdRef.current) void onChangedRef.current()
      }),
      window.api.onRelookupError(({ relookupId, message }) => {
        setRelookup((r) =>
          r && r.relookupId === relookupId ? { ...r, error: message } : r
        )
      })
    ]
    return () => offs.forEach((f) => f())
  }, [])

  async function toggleStar(): Promise<void> {
    await window.api.entryToggleStar(entry.id)
    await onChanged()
  }
  async function toggleSuspend(): Promise<void> {
    await window.api.entryToggleSuspend(entry.id)
    await onChanged()
  }
  async function remove(): Promise<void> {
    if (!window.confirm(`确定删除「${entry.text.slice(0, 30)}」吗？复习进度也会一并删除。`)) return
    await window.api.entryDelete(entry.id)
    onClose()
    await onChanged()
  }
  async function ask(): Promise<void> {
    const q = chatQ.trim()
    if (!q || pending) return
    const chatId = crypto.randomUUID()
    setPending({ chatId, entryId: entry.id, question: q, answer: '', error: null })
    setChatQ('')
    await window.api.entryChatAsk(entry.id, q, chatId)
  }
  async function delChat(id: number): Promise<void> {
    await window.api.entryChatDelete(id)
    setChats((cs) => cs.filter((c) => c.id !== id))
  }
  /** 重新调用 AI 查询：流式显示在下方卡片，完成后覆盖讲解缓存并刷新词条 */
  async function requery(): Promise<void> {
    if (relookup && !relookup.error) return
    const relookupId = crypto.randomUUID()
    setRelookup({ relookupId, answer: '', error: null })
    await window.api.entryRelookup(entry.id, relookupId)
  }

  const s = entry.structured
  const isZh = isZhText(entry.text)
  // 中→英查询的释义都在 equivalents（完整讲解里），意思栏可能一项都没有，此时不渲染空壳
  const hasMeaning = !!(s?.phonetic || s?.pos || s?.definitionZh || s?.translation || s?.definitionEn)
  return (
    <aside
      className="flex shrink-0 flex-col border-l border-zinc-800 bg-zinc-900"
      style={{ width }}
    >
      <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-2.5">
        <MiniAction
          onClick={() => void toggleStar()}
          active={entry.isStarred}
          className={entry.isStarred ? 'bg-amber-500/15 text-amber-300' : ''}
        >
          {entry.isStarred ? '⭐ 已划重点' : '☆ 划入重点'}
        </MiniAction>
        {!isZh && <MiniAction onClick={() => speak(entry.text)}>🔊 朗读</MiniAction>}
        <MiniAction
          onClick={() => void requery()}
          title="重新调用 AI 查询，更新讲解内容"
        >
          {relookup && !relookup.error ? '⏳ 查询中…' : '🔄 重新查询'}
        </MiniAction>
        <div className="flex-1" />
        <MiniAction onClick={() => void toggleSuspend()} title="暂停后不进入复习队列">
          {entry.suspended ? '▶️ 恢复复习' : '⏸ 暂停'}
        </MiniAction>
        <MiniAction danger onClick={() => void remove()}>
          🗑
        </MiniAction>
        <button
          onClick={onClose}
          className="rounded-md px-1.5 py-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div>
          <div className="select-text text-lg font-semibold text-zinc-100">{entry.text}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
            <span>{entry.type === 'word' ? '单词/短语' : '句子/段落'}</span>
            <span>·</span>
            <span>查询 {entry.lookupCount} 次</span>
            <span>·</span>
            <span>{fmtDateTime(entry.updatedAt)}</span>
          </div>
        </div>

        {entry.review && (
          <div className="rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
            复习：已答 {entry.review.reps} 次 · 遗忘 {entry.review.lapses} 次 · 熟练度{' '}
            {entry.review.ease.toFixed(2)}
          </div>
        )}

        {relookup && (
          <div className="rounded-xl border border-teal-500/25 bg-zinc-900/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-teal-300">
                {relookup.error ? '⚠️ 重新查询失败' : '🔄 重新查询中…'}
              </span>
              <div className="flex-1" />
              <button
                title={relookup.error ? '关闭' : '取消'}
                onClick={() => {
                  if (!relookup.error) void window.api.entryRelookupAbort(relookup.relookupId)
                  setRelookup(null)
                }}
                className="shrink-0 text-zinc-600 transition hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            {relookup.error ? (
              <div className="mt-1 text-[11px] leading-5 text-red-300">{relookup.error}</div>
            ) : relookup.answer ? (
              <div className="mt-1 select-text">
                <Md>{relookup.answer}</Md>
                <span className="stream-cursor text-teal-400" />
              </div>
            ) : (
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
                思考中…
              </div>
            )}
          </div>
        )}

        {hasMeaning && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 px-3.5 py-3">
            <div className="mb-1.5 text-sm text-zinc-200">
              {s.phonetic && <span className="mr-2 text-zinc-500">{s.phonetic}</span>}
              {s.pos && <span className="mr-1 font-medium text-teal-300">{s.pos}</span>}
              <span>
                <EmText text={s.definitionZh ?? ''} />
              </span>
            </div>
            {s.translation && (
              <div className="text-sm text-zinc-200">
                <EmText text={s.translation} />
              </div>
            )}
            {s.definitionEn && (
              <div className="mt-1 text-xs italic text-zinc-500">{s.definitionEn}</div>
            )}
          </div>
        )}

        {entry.markdown && (
          <div>
            <SectionTitle>📖 完整讲解</SectionTitle>
            <div className="select-text text-[13px] leading-6 text-zinc-200">
              <Md>{entry.markdown}</Md>
            </div>
          </div>
        )}

        {entry.context && (
          <div>
            <SectionTitle>查询上下文</SectionTitle>
            <div className="select-text rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200/80">
              {entry.context}
            </div>
          </div>
        )}

        <div>
          <SectionTitle>追问 AI</SectionTitle>
          <div className="space-y-2">
            {chats.length === 0 && (
              <div className="text-xs leading-5 text-zinc-600">
                还没有追问。问点细节（搭配、辨析、例句仿写……），问答会记录在这里，可单条删除。
              </div>
            )}
            {chats.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 select-text text-[12px] leading-5 text-teal-300">
                    问：{c.question}
                  </div>
                  <button
                    title="删除这条问答"
                    onClick={() => void delChat(c.id)}
                    className="shrink-0 text-zinc-600 transition hover:text-red-400"
                  >
                    🗑
                  </button>
                </div>
                <div className="mt-1 select-text">
                  <Md>{c.answer}</Md>
                </div>
              </div>
            ))}
          </div>
          {/* 进行中的追问：点击即出现，流式填充 */}
          {pending && pending.entryId === entry.id && (
            <div className="rounded-xl border border-teal-500/25 bg-zinc-900/60 px-3 py-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 select-text text-[12px] leading-5 text-teal-300">
                  问：{pending.question}
                </div>
                {pending.error ? (
                  <button
                    title="关闭"
                    onClick={() => setPending(null)}
                    className="shrink-0 text-zinc-600 transition hover:text-zinc-300"
                  >
                    ✕
                  </button>
                ) : (
                  <button
                    title="取消"
                    onClick={() => {
                      void window.api.entryChatAbort(pending.chatId)
                      setPending(null)
                    }}
                    className="shrink-0 text-zinc-600 transition hover:text-zinc-300"
                  >
                    ✕
                  </button>
                )}
              </div>
              {pending.error ? (
                <div className="mt-1 text-[11px] leading-5 text-red-300">⚠️ {pending.error}</div>
              ) : pending.answer ? (
                <div className="mt-1 select-text">
                  <Md>{pending.answer}</Md>
                  <span className="stream-cursor text-teal-400" />
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
                  思考中…
                </div>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <input
              value={chatQ}
              onChange={(e) => setChatQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void ask()
              }}
              disabled={!!pending}
              placeholder={pending ? '回答中…' : '问点细节，回车发送'}
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-1.5 text-[13px] text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-teal-500"
            />
            <button
              onClick={() => void ask()}
              disabled={!!pending || !chatQ.trim()}
              className="shrink-0 rounded-lg bg-teal-600 px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-teal-500 disabled:opacity-40"
            >
              提问
            </button>
          </div>
        </div>

      </div>
    </aside>
  )
}

function MiniAction({
  children,
  onClick,
  danger,
  active,
  className = '',
  title
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
  active?: boolean
  className?: string
  title?: string
}): React.JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs transition ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : active
            ? className
            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="mb-1.5 mt-1 text-xs font-semibold text-zinc-500">{children}</div>
}
