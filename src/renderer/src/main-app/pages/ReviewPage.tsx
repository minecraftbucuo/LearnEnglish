import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReviewCard } from '@shared/types'
import { intervalPreview, isZhText, speak } from '../../utils'
import { EntryImage } from '../components/EntryImage'
import { EmText } from '../../components/EmText'

type Phase = 'idle' | 'session' | 'done'

export function ReviewPage(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [queue, setQueue] = useState<ReviewCard[]>([])
  const [idx, setIdx] = useState(0)
  const [result, setResult] = useState({ answered: 0, again: 0 })
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

  if (loading) return <Centered>加载中…</Centered>

  if (phase === 'idle' || phase === 'done') {
    const finished = phase === 'done'
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
        {finished && (
          <div className="text-center">
            <div className="text-4xl">{result.again === 0 ? '🎉' : '💪'}</div>
            <div className="mt-3 text-lg font-semibold text-zinc-100">本轮完成</div>
            <div className="mt-1 text-sm text-zinc-500">
              共复习 {result.answered} 张
              {result.again > 0 && <>，其中 {result.again} 张忘记（稍后会重现）</>}
            </div>
          </div>
        )}
        <div className="flex gap-4">
          <div className="w-36 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-center shadow-sm shadow-black/30">
            <div className="text-3xl font-bold text-teal-400">{dueCount}</div>
            <div className="mt-1 text-xs text-zinc-500">到期复习</div>
          </div>
          <div className="w-36 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-center shadow-sm shadow-black/30">
            <div className="text-3xl font-bold text-sky-400">{newRemaining}</div>
            <div className="mt-1 text-xs text-zinc-500">今日新卡</div>
          </div>
        </div>
        <button
          onClick={() => void start()}
          disabled={dueCount + newRemaining === 0}
          className="rounded-xl bg-teal-600 px-10 py-3 text-sm font-medium text-white shadow transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {finished ? '再来一轮' : '开始复习'}
        </button>
        {dueCount + newRemaining === 0 && (
          <div className="text-xs text-zinc-600">
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
  { rating: 1, label: '忘记', color: 'bg-red-600 hover:bg-red-500', key: '1' },
  { rating: 2, label: '困难', color: 'bg-orange-600 hover:bg-orange-500', key: '2' },
  { rating: 3, label: '良好', color: 'bg-teal-600 hover:bg-teal-500', key: '3' },
  { rating: 4, label: '简单', color: 'bg-sky-600 hover:bg-sky-500', key: '4' }
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
  const isZh = isZhText(entry.text)
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
      setTimeout(() => {
        setSpellingResult('none')
        void onAnswer(3, 'spelling')
      }, 650)
    } else {
      setSpellingResult('wrong')
      setFlipped(true)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-6 py-5">
      {/* 顶部进度 */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-teal-500 transition-all"
            style={{ width: `${(index / cards.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-xs text-zinc-500">
          {index + 1} / {cards.length}
        </span>
        {card.isNew && (
          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">新卡</span>
        )}
        {isZh && (
          <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">中→英</span>
        )}
        {entry.type === 'word' && !isZh && (
          <button
            onClick={() => setSpellingMode((v) => !v)}
            className={`shrink-0 rounded border px-2 py-0.5 text-[11px] transition ${
              spellingMode
                ? 'border-violet-500 bg-violet-600 text-white'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
            }`}
          >
            {spellingMode ? '拼写模式中' : '拼写模式'}
          </button>
        )}
      </div>

      {/* 卡片 */}
      <div
        className="flex min-h-0 flex-1 cursor-pointer flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-lg shadow-black/30"
        onClick={() => {
          if (!spellingMode) setFlipped((f) => !f)
        }}
      >
        <div className="flex flex-col items-center px-6 pb-4 pt-8">
          {spellingMode && !flipped ? (
            <>
              <div className="text-center text-xs text-zinc-500">看释义，默写英文</div>
              <div className="mt-3 select-text text-center text-xl font-medium text-zinc-100">
                {s?.pos && <span className="mr-1.5 text-teal-300">{s.pos}</span>}
                {answerText || '（暂无释义，请切换回识记模式）'}
              </div>
            </>
          ) : (
            <div className="select-text text-center text-2xl font-semibold text-zinc-100">
              {entry.text}
            </div>
          )}

          {spellingMode && spellingResult === 'none' && !flipped && (
            <div
              className="mt-6 flex w-full max-w-sm items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                value={spellingInput}
                onChange={(e) => setSpellingInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitSpelling()
                  e.stopPropagation()
                }}
                placeholder="输入英文后回车"
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-center text-lg text-zinc-100 outline-none focus:border-violet-500"
              />
              <button
                onClick={submitSpelling}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500"
              >
                检查
              </button>
            </div>
          )}
          {spellingResult === 'wrong' && (
            <div className="mt-3 text-center text-sm text-red-400">
              正确答案：<span className="font-semibold text-zinc-100">{entry.text}</span>
              <div className="mt-2 text-xs text-zinc-500">
                按空格继续（记为「忘记」，今天稍后会重现）
              </div>
            </div>
          )}
          {spellingResult === 'correct' && (
            <div className="mt-3 text-sm text-teal-400">✅ 拼写正确</div>
          )}

          {!spellingMode && !flipped && (
            <div className="mt-5 text-xs text-zinc-600">点击卡片或按空格显示答案</div>
          )}
        </div>

        {/* 背面内容 */}
        {flipped && (
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-zinc-800 px-6 py-4">
            <div className="mb-3 flex justify-center gap-2">
              {!isZh && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    speak(entry.text)
                  }}
                  className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                >
                  🔊 朗读
                </button>
              )}
            </div>
            {s ? (
              <div className="space-y-3">
                {s.equivalents && s.equivalents.length > 0 && (
                  <div className="space-y-2">
                    {s.equivalents.slice(0, 4).map((eq, i) => (
                      <div key={i} className="text-center">
                        <div>
                          <span className="text-[15px] font-semibold text-teal-300">
                            <EmText text={eq.en} boldClass="font-semibold" />
                          </span>
                          {eq.phonetic && <span className="ml-2 text-xs text-zinc-500">{eq.phonetic}</span>}
                          {eq.pos && <span className="ml-1.5 text-xs text-teal-500">{eq.pos}</span>}
                        </div>
                        {eq.note && (
                          <div className="text-xs text-zinc-400">
                            <EmText text={eq.note} boldClass="font-medium text-zinc-200" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {(s.phonetic || s.pos || s.definitionZh) && (
                  <div className="text-center">
                    {s.phonetic && <span className="mr-2 text-zinc-500">{s.phonetic}</span>}
                    {s.pos && <span className="mr-1 font-medium text-teal-300">{s.pos}</span>}
                    <span className="text-zinc-200">
                      <EmText text={s.definitionZh ?? ''} />
                    </span>
                  </div>
                )}
                {s.translation && (
                  <div className="select-text text-center text-[15px] text-zinc-200">
                    <EmText text={s.translation} />
                  </div>
                )}
                {s.examples && s.examples.length > 0 && (
                  <div className="rounded-xl bg-zinc-800/60 px-4 py-3">
                    {s.examples.slice(0, 2).map((ex, i) => (
                      <div key={i} className="mb-1.5 last:mb-0">
                        <div className="select-text text-[13px] text-zinc-300">
                          <EmText text={ex.en} />
                        </div>
                        <div className="text-xs text-zinc-500">
                          <EmText text={ex.zh} boldClass="font-medium" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {s.keyPoints && s.keyPoints.length > 0 && (
                  <div>
                    {s.keyPoints.slice(0, 4).map((k, i) => (
                      <div key={i} className="text-[13px] leading-6">
                        <span className="font-medium text-teal-300">
                          <EmText text={k.term} boldClass="font-medium" />
                        </span>
                        <span className="select-text text-zinc-400">
                          ：<EmText text={k.explanation} boldClass="font-medium text-zinc-200" />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {entry.note && (
                  <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200/80">
                    📝 {entry.note}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-zinc-600">
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
  return <div className="flex h-full items-center justify-center text-sm text-zinc-500">{children}</div>
}
