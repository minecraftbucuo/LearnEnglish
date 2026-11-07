import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReviewCard } from '@shared/types'
import { intervalPreview, speak } from '../../utils'
import { EntryImage } from '../components/EntryImage'

type Phase = 'idle' | 'session' | 'done'

interface SessionResult {
  answered: number
  again: number
}

export function ReviewPage(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [queue, setQueue] = useState<ReviewCard[]>([])
  const [idx, setIdx] = useState(0)
  const [result, setResult] = useState<SessionResult>({ answered: 0, again: 0 })
  const [loading, setLoading] = useState(true)
  const [dueCount, setDueCount] = useState(0)
  const [newRemaining, setNewRemaining] = useState(0)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    const q = await window.api.reviewQueue()
    setDueCount(q.dueCount)
    setNewRemaining(q.newRemaining)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function start(): Promise<void> {
    const q = await window.api.reviewQueue()
    const cards = [...q.due, ...q.newCards]
    if (!cards.length) {
      await load()
      return
    }
    setQueue(cards)
    setIdx(0)
    setResult({ answered: 0, again: 0 })
    setPhase('session')
  }

  async function handleAnswer(rating: 1 | 2 | 3 | 4, mode: 'recall' | 'spelling'): Promise<void> {
    const card = queue[idx]
    if (!card) return
    await window.api.reviewAnswer(card.entry.id, rating, mode)
    setResult((r) => ({ answered: r.answered + 1, again: r.again + (rating === 1 ? 1 : 0) }))
    if (idx + 1 >= queue.length) {
      setPhase('done')
      await load()
    } else {
      setIdx((i) => i + 1)
    }
  }

  if (loading) {
    return <Centered>加载中…</Centered>
  }

  if (phase === 'idle' || phase === 'done') {
    const finished = phase === 'done'
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
        {finished && (
          <div className="text-center">
            <div className="text-4xl">{result.again === 0 ? '🎉' : '💪'}</div>
            <div className="mt-3 text-lg font-semibold text-slate-800">本轮完成</div>
            <div className="mt-1 text-sm text-slate-500">
              共复习 {result.answered} 张
              {result.again > 0 && <>，其中 {result.again} 张忘记（稍后会重现）</>}
            </div>
          </div>
        )}
        <div className="flex gap-4">
          <div className="w-36 rounded-2xl border border-slate-200 bg-white px-4 py-5 text-center shadow-sm">
            <div className="text-3xl font-bold text-teal-600">{dueCount}</div>
            <div className="mt-1 text-xs text-slate-500">到期复习</div>
          </div>
          <div className="w-36 rounded-2xl border border-slate-200 bg-white px-4 py-5 text-center shadow-sm">
            <div className="text-3xl font-bold text-blue-600">{newRemaining}</div>
            <div className="mt-1 text-xs text-slate-500">今日新卡</div>
          </div>
        </div>
        <button
          onClick={() => void start()}
          disabled={dueCount + newRemaining === 0}
          className="rounded-xl bg-teal-600 px-10 py-3 text-sm font-medium text-white shadow transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {finished ? '再来一轮' : '开始复习'}
        </button>
        {dueCount + newRemaining === 0 && (
          <div className="text-xs text-slate-400">
            今日任务已完成 ✅ 划重点的新词会在明天出现在这里
          </div>
        )}
      </div>
    )
  }

  return <ReviewSession cards={queue} index={idx} onAnswer={handleAnswer} />
}

// ---------- 复习会话 ----------

const RATINGS: { rating: 1 | 2 | 3 | 4; label: string; color: string; key: string }[] = [
  { rating: 1, label: '忘记', color: 'bg-red-500 hover:bg-red-600', key: '1' },
  { rating: 2, label: '困难', color: 'bg-orange-500 hover:bg-orange-600', key: '2' },
  { rating: 3, label: '良好', color: 'bg-teal-600 hover:bg-teal-700', key: '3' },
  { rating: 4, label: '简单', color: 'bg-sky-600 hover:bg-sky-700', key: '4' }
]

function ReviewSession({
  cards,
  index,
  onAnswer
}: {
  cards: ReviewCard[]
  index: number
  onAnswer: (rating: 1 | 2 | 3 | 4, mode: 'recall' | 'spelling') => Promise<void>
}): React.JSX.Element {
  const card = cards[index]
  const [flipped, setFlipped] = useState(false)
  const [spellingMode, setSpellingMode] = useState(false)
  const [spellingInput, setSpellingInput] = useState('')
  const [spellingResult, setSpellingResult] = useState<'none' | 'correct' | 'wrong'>('none')
  const inputRef = useRef<HTMLInputElement>(null)

  // 新卡首次展示时计入今日新卡配额
  useEffect(() => {
    if (card?.isNew) void window.api.reviewIntroduced(card.entry.id)
  }, [card])

  useEffect(() => {
    setFlipped(false)
    setSpellingMode(false)
    setSpellingInput('')
    setSpellingResult('none')
  }, [index])

  const entry = card.entry
  const s = entry.structured
  const answerText = s?.definitionZh || s?.translation || ''

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === ' ' && !spellingMode) {
        e.preventDefault()
        setFlipped((f) => !f)
        return
      }
      // 拼写答错后：空格/回车确认继续（按「忘记」记录）
      if (spellingMode && spellingResult === 'wrong' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setSpellingResult('none')
        void onAnswer(1, 'spelling')
        return
      }
      if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        void onAnswer(Number(e.key) as 1 | 2 | 3 | 4, 'recall')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flipped, spellingMode, spellingResult, onAnswer])

  function submitSpelling(): void {
    if (spellingResult !== 'none' || !answerText) return
    const ok =
      spellingInput.trim().toLowerCase().replace(/\s+/g, ' ') ===
      entry.text.trim().toLowerCase().replace(/\s+/g, ' ')
    if (ok) {
      setSpellingResult('correct')
      // 拼写对按「良好」，稍作停顿再进下一张
      setTimeout(() => {
        setSpellingResult('none')
        void onAnswer(3, 'spelling')
      }, 650)
    } else {
      // 答错：先展示正确答案，用户按空格继续
      setSpellingResult('wrong')
      setFlipped(true)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-6 py-5">
      {/* 顶部进度 */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-teal-500 transition-all"
            style={{ width: `${(index / cards.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-xs text-slate-500">
          {index + 1} / {cards.length}
        </span>
        {card.isNew && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">新卡</span>}
        {entry.type === 'word' && (
          <button
            onClick={() => setSpellingMode((v) => !v)}
            className={`shrink-0 rounded px-2 py-0.5 text-[11px] transition ${
              spellingMode ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {spellingMode ? '拼写模式中' : '拼写模式'}
          </button>
        )}
      </div>

      {/* 卡片 */}
      <div
        className="flex min-h-0 flex-1 cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white shadow-sm"
        onClick={() => {
          if (!spellingMode) setFlipped((f) => !f)
        }}
      >
        {/* 正面 / 背面上半部 */}
        <div className="flex flex-col items-center px-6 pb-4 pt-8">
          {spellingMode && !flipped ? (
            <>
              <div className="text-center text-xs text-slate-400">看释义，默写英文</div>
              <div className="mt-3 select-text text-center text-xl font-medium text-slate-800">
                {s?.pos && <span className="mr-1.5 text-teal-700">{s.pos}</span>}
                {answerText || '（暂无释义，请切换回识记模式）'}
              </div>
            </>
          ) : (
            <div className="select-text text-center text-2xl font-semibold text-slate-800">{entry.text}</div>
          )}

          {spellingMode && spellingResult === 'none' && !flipped && (
            <div className="mt-6 flex w-full max-w-sm items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                autoFocus
                value={spellingInput}
                onChange={(e) => setSpellingInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSpelling()
                  e.stopPropagation()
                }}
                placeholder="输入英文后回车"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center text-lg outline-none focus:border-violet-400"
              />
              <button
                onClick={submitSpelling}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-700"
              >
                检查
              </button>
            </div>
          )}
          {spellingResult === 'wrong' && (
            <div className="mt-3 text-center text-sm text-red-500">
              正确答案：<span className="font-semibold text-slate-800">{entry.text}</span>
              <div className="mt-2 text-xs text-slate-400">按空格继续（记为「忘记」，今天稍后会重现）</div>
            </div>
          )}
          {spellingResult === 'correct' && <div className="mt-3 text-sm text-teal-600">✅ 拼写正确</div>}

          {!spellingMode && !flipped && (
            <div className="mt-5 text-xs text-slate-400">点击卡片或按空格显示答案</div>
          )}
        </div>

        {/* 背面内容 */}
        {flipped && (
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 px-6 py-4">
            <div className="mb-3 flex justify-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  speak(entry.text)
                }}
                className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200"
              >
                🔊 朗读
              </button>
            </div>
            {s ? (
              <div className="space-y-3">
                {(s.phonetic || s.pos || s.definitionZh) && (
                  <div className="text-center">
                    {s.phonetic && <span className="mr-2 text-slate-400">{s.phonetic}</span>}
                    {s.pos && <span className="mr-1 font-medium text-teal-700">{s.pos}</span>}
                    <span className="text-slate-700">{s.definitionZh}</span>
                  </div>
                )}
                {s.translation && (
                  <div className="select-text text-center text-[15px] text-slate-700">{s.translation}</div>
                )}
                {s.examples && s.examples.length > 0 && (
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    {s.examples.slice(0, 2).map((ex, i) => (
                      <div key={i} className="mb-1.5 last:mb-0">
                        <div className="select-text text-[13px] text-slate-700">{ex.en}</div>
                        <div className="text-xs text-slate-500">{ex.zh}</div>
                      </div>
                    ))}
                  </div>
                )}
                {s.keyPoints && s.keyPoints.length > 0 && (
                  <div>
                    {s.keyPoints.slice(0, 4).map((k, i) => (
                      <div key={i} className="text-[13px] leading-6">
                        <span className="font-medium text-teal-700">{k.term}</span>
                        <span className="select-text text-slate-600">：{k.explanation}</span>
                      </div>
                    ))}
                  </div>
                )}
                {entry.note && (
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                    📝 {entry.note}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-slate-400">
                这条重点还没有结构化讲解，去生词本查看详情或重新查询。
              </div>
            )}
          </div>
        )}
      </div>

      {/* 评分区 */}
      {flipped && spellingResult === 'none' && (
        <div className="mt-4 flex justify-center gap-2.5">
          {RATINGS.map((r) => (
            <button
              key={r.rating}
              onClick={() => void onAnswer(r.rating, 'recall')}
              title={`下次间隔：${intervalPreview(card.state, r.rating)}`}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-sm transition ${r.color}`}
            >
              <span className="rounded bg-white/25 px-1.5 text-xs">{r.key}</span>
              {r.label}
            </button>
          ))}
        </div>
      )}

      {entry.source === 'image' && (
        <div className="mt-3 flex justify-center">
          <EntryImage entryId={entry.id} />
        </div>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="flex h-full items-center justify-center text-sm text-slate-400">{children}</div>
}
