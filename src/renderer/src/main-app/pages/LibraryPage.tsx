import { useCallback, useEffect, useState } from 'react'
import type { EntriesFilter, Entry, EntrySource, EntryType } from '@shared/types'
import { fmtDateTime, isZhText, speak } from '../../utils'
import { EntryImage } from '../components/EntryImage'

type TypeFilter = EntryType | 'all'
type SourceFilter = EntrySource | 'all'

export function LibraryPage(): React.JSX.Element {
  const [entries, setEntries] = useState<Entry[]>([])
  const [selected, setSelected] = useState<Entry | null>(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [source, setSource] = useState<SourceFilter>('all')
  const [starredOnly, setStarredOnly] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    const filter: EntriesFilter = {
      query: query.trim() || undefined,
      type,
      source,
      starredOnly,
      limit: 300
    }
    setEntries(await window.api.entriesList(filter))
  }, [query, type, source, starredOnly])

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
            {(['all', 'selection', 'image'] as SourceFilter[]).map((s) => (
              <button key={s} className={chip(source === s)} onClick={() => setSource(s)}>
                {s === 'all' ? '全部来源' : s === 'selection' ? '选中查词' : '截图'}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-zinc-800" />
            <button className={chip(starredOnly)} onClick={() => setStarredOnly((v) => !v)}>
              ⭐ 重点
            </button>
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
                {e.source === 'image' && <span className="shrink-0 text-xs">🖼️</span>}
                {e.isStarred && <span className="shrink-0 text-xs">⭐</span>}
                {e.suspended && <span className="shrink-0 text-[10px] text-zinc-600">暂停</span>}
                <span className="shrink-0 text-[11px] text-zinc-600">×{e.lookupCount}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 详情区 */}
      {selected && (
        <EntryDetail entry={selected} onChanged={refreshSelected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

function EntryDetail({
  entry,
  onChanged,
  onClose
}: {
  entry: Entry
  onChanged: () => Promise<void> | void
  onClose: () => void
}): React.JSX.Element {
  const [note, setNote] = useState(entry.note)
  useEffect(() => setNote(entry.note), [entry.id, entry.note])

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
  async function saveNote(): Promise<void> {
    if (note !== entry.note) {
      await window.api.entrySetNote(entry.id, note)
      await onChanged()
    }
  }

  const s = entry.structured
  const isZh = isZhText(entry.text)
  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-2.5">
        <MiniAction
          onClick={() => void toggleStar()}
          active={entry.isStarred}
          className={entry.isStarred ? 'bg-amber-500/15 text-amber-300' : ''}
        >
          {entry.isStarred ? '⭐ 已划重点' : '☆ 划入重点'}
        </MiniAction>
        {!isZh && <MiniAction onClick={() => speak(entry.text)}>🔊 朗读</MiniAction>}
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
            {entry.source === 'image' && <span>· 🖼️ 截图</span>}
          </div>
        </div>

        {entry.review && (
          <div className="rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
            复习：已答 {entry.review.reps} 次 · 遗忘 {entry.review.lapses} 次 · 熟练度{' '}
            {entry.review.ease.toFixed(2)}
          </div>
        )}

        {entry.source === 'image' && <EntryImage entryId={entry.id} />}

        {s?.equivalents && s.equivalents.length > 0 && (
          <div>
            <SectionTitle>英语表达</SectionTitle>
            <div className="space-y-2.5">
              {s.equivalents.map((eq, i) => (
                <div key={i}>
                  <div className="text-[14px]">
                    <span className="font-semibold text-teal-300">{eq.en}</span>
                    {eq.phonetic && <span className="ml-2 text-xs text-zinc-500">{eq.phonetic}</span>}
                    {eq.pos && <span className="ml-1.5 text-xs text-teal-500">{eq.pos}</span>}
                  </div>
                  {eq.note && <div className="text-xs leading-5 text-zinc-400">{eq.note}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {s && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-800/40 px-3.5 py-3">
            {(s.phonetic || s.pos || s.definitionZh) && (
              <div className="mb-1.5 text-sm text-zinc-200">
                {s.phonetic && <span className="mr-2 text-zinc-500">{s.phonetic}</span>}
                {s.pos && <span className="mr-1 font-medium text-teal-300">{s.pos}</span>}
                <span>{s.definitionZh}</span>
              </div>
            )}
            {s.translation && <div className="text-sm text-zinc-200">{s.translation}</div>}
            {s.definitionEn && (
              <div className="mt-1 text-xs italic text-zinc-500">{s.definitionEn}</div>
            )}
          </div>
        )}

        {s?.examples && s.examples.length > 0 && (
          <div>
            <SectionTitle>例句</SectionTitle>
            <div className="space-y-2">
              {s.examples.map((ex, i) => (
                <div key={i} className="text-[13px] leading-6">
                  <div className="select-text text-zinc-200">{ex.en}</div>
                  <div className="text-zinc-500">{ex.zh}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {s?.keyPoints && s.keyPoints.length > 0 && (
          <div>
            <SectionTitle>词汇精讲</SectionTitle>
            <div className="space-y-1.5">
              {s.keyPoints.map((k, i) => (
                <div key={i} className="text-[13px] leading-6">
                  <span className="font-medium text-teal-300">{k.term}</span>
                  <span className="select-text text-zinc-400">：{k.explanation}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {s?.grammar && (
          <div>
            <SectionTitle>语法结构</SectionTitle>
            <div className="select-text text-[13px] leading-6 text-zinc-400">{s.grammar}</div>
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

        {entry.structured && (
          <details className="text-xs text-zinc-600">
            <summary className="cursor-pointer select-none hover:text-zinc-400">
              查看全部结构化字段
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-[11px] leading-5 text-zinc-400 ring-1 ring-zinc-800">
              {JSON.stringify(entry.structured, null, 2)}
            </pre>
          </details>
        )}

        <div>
          <SectionTitle>我的笔记</SectionTitle>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => void saveNote()}
            rows={3}
            placeholder="记录自己的理解、联想、易错点…（失焦自动保存）"
            className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2 text-[13px] leading-6 text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-teal-500"
          />
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
