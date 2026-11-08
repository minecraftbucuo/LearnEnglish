import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  Rating,
  ReviewCard,
  ReviewMode,
  ReviewQueue,
  ReviewStats,
  ReviewWordStatus
} from '@shared/types'
import { isZhText, speak } from '../../utils'
import { EmText } from '../../components/EmText'
import { Md } from '../../components/Md'

type Phase = 'idle' | 'session' | 'done'

/**
 * 会话内卡片（默默背单词式）：
 * - need：还需答对「认识」的次数，初始 1，上限 2——点「忘记」设为 2，点「模糊」设为 1，
 *   点「认识」减 1，减到 0 才算本轮过关；否则回队尾排队
 * - answered：本局是否已作答过（计划只认第一次真实作答，之后的重现不再写排期）
 * - relearn：答过「模糊/忘记」重现时显示「重学」徽章
 */
type SessionCard = ReviewCard & { need?: number; answered?: boolean; relearn?: boolean }

export function ReviewPage({
  active,
  onOpenWords
}: {
  active: boolean
  onOpenWords: (status: ReviewWordStatus) => void
}): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [mode, setMode] = useState<ReviewMode>('recall')
  // 复习/巩固不写排期（学过就练，随时可练）
  const [practice, setPractice] = useState(false)
  const [doneCount, setDoneCount] = useState<number | null>(null)
  const [queue, setQueue] = useState<SessionCard[]>([])
  const [idx, setIdx] = useState(0)
  const [result, setResult] = useState({ answered: 0, revealed: 0 })
  // 本局点过「模糊/忘记」的卡（按词条去重，用来报「没记住几张」）
  const [slippedIds, setSlippedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [queueInfo, setQueueInfo] = useState<ReviewQueue | null>(null)
  const [stats, setStats] = useState<ReviewStats | null>(null)
  // 会话内作答的并发防护（ref 读到的一定是最新 phase，供异步回调判断）
  const answeringRef = useRef(false)
  const phaseRef = useRef<Phase>('idle')

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    const [q, s] = await Promise.all([window.api.reviewQueue(), window.api.reviewStats()])
    setQueueInfo(q)
    setStats(s)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // 从其他页切回来：空闲状态刷新数据；会话进行中不打断
  useEffect(() => {
    if (active && (phase === 'idle' || phase === 'done')) void load()
  }, [active])

  function resetSession(cards: SessionCard[]): void {
    setQueue(cards)
    setIdx(0)
    setResult({ answered: 0, revealed: 0 })
    setSlippedIds(new Set())
  }

  /** 学新词：今日额度内的新卡，第一次作答写入排期 */
  async function startStudy(): Promise<void> {
    const q = await window.api.reviewQueue()
    if (!q.newCards.length) {
      await load()
      return
    }
    setMode('recall')
    setPractice(false)
    setDoneCount(null)
    resetSession(q.newCards)
    setPhase('session')
  }

  /** 复习（= 巩固）：已学过的词再过一遍，识记或拼写形式出题；不写排期，随时可练 */
  async function startReview(m: ReviewMode): Promise<void> {
    const cards = (await window.api.practiceQueue()).map((c) => ({
      ...c,
      need: undefined,
      answered: undefined,
      relearn: undefined
    }))
    if (!cards.length) return
    setMode(m)
    setPractice(true)
    setDoneCount(null)
    resetSession(cards)
    setPhase('session')
  }

  async function handleAnswer(rating: Rating, answerMode: ReviewMode): Promise<void> {
    const card = queue[idx]
    // 防重入：连点/键盘鼠标齐按只算一次；已退出本轮（如拼写过卡的定时器晚到）不再计分
    if (!card || answeringRef.current || phaseRef.current !== 'session') return
    answeringRef.current = true
    try {
      // 计划只认第一次真实作答（那时记忆水平是真实的）；复习轮一律不写排期
      if (!card.answered && !practice) {
        await window.api.reviewAnswer(card.entry.id, rating, answerMode)
      }
      // 等待写库期间退出了本轮，后面不再推进
      if (phaseRef.current !== 'session') return
      // 还需认识次数：初始 1；认识 -1（到 0 出局）；模糊设 1；忘记设 2（上限，防无限循环）
      const need = card.need ?? 1
      const nextNeed = rating === 3 ? need - 1 : rating === 2 ? 1 : 2
      setResult((r) => ({ ...r, answered: r.answered + 1 }))
      if (rating !== 3) {
        setSlippedIds((ids) => new Set(ids).add(card.entry.id))
      }
      const reappend = nextNeed > 0
      if (reappend) {
        setQueue((qs) => [
          ...qs,
          { ...card, need: nextNeed, answered: true, relearn: rating !== 3, isNew: false }
        ])
      }
      // queue.length 是追加前的旧值：最后一张要重现时得把刚追加的算上，否则会话提前结束
      if (idx + 1 >= queue.length + (reappend ? 1 : 0)) {
        if (practice) {
          setDoneCount(result.answered + 1)
          setPhase('idle')
        } else {
          setPhase('done')
        }
        await load()
      } else {
        setIdx((i) => i + 1)
      }
    } finally {
      answeringRef.current = false
    }
  }

  function handleReveal(): void {
    setResult((r) => ({ ...r, revealed: r.revealed + 1 }))
  }

  if (loading) return <Centered>加载中…</Centered>

  if (phase === 'idle' || phase === 'done') {
    const finished = phase === 'done'
    const newRemaining = queueInfo?.newRemaining ?? 0
    const learned = stats?.learned ?? 0
    return (
      <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
        {finished && (
          <div className="text-center">
            <div className="text-4xl">{slippedIds.size === 0 ? '🎉' : '💪'}</div>
            <div className="mt-3 text-lg font-semibold text-zinc-100">本轮完成</div>
            <div className="mt-1 text-sm text-zinc-500">
              复习了 {result.answered} 张{slippedIds.size > 0 && <>，没记住 {slippedIds.size} 张</>}
              {mode === 'spelling' && result.revealed > 0 && <>，看了 {result.revealed} 次答案</>}
            </div>
          </div>
        )}
        {doneCount !== null && (
          <div className="rounded-lg bg-violet-500/10 px-4 py-2 text-xs text-violet-300">
            刚复习完 {doneCount} 张
          </div>
        )}
        <div className="flex gap-4">
          <button
            onClick={() => onOpenWords('new')}
            title="查看未学的新词"
            className="w-36 cursor-pointer rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-center shadow-sm shadow-black/30 transition hover:border-sky-500/60 hover:bg-zinc-800/60"
          >
            <div className="text-3xl font-bold text-sky-400">{newRemaining}</div>
            <div className="mt-1 text-xs text-zinc-500">可学新词</div>
          </button>
          <button
            onClick={() => onOpenWords('today')}
            title="查看今天新学的词"
            className="w-36 cursor-pointer rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-center shadow-sm shadow-black/30 transition hover:border-zinc-600 hover:bg-zinc-800/60"
          >
            <div className="text-3xl font-bold text-zinc-200">{stats?.newToday ?? 0}</div>
            <div className="mt-1 text-xs text-zinc-500">今日已学</div>
          </button>
          <button
            onClick={() => onOpenWords('learned')}
            title="查看所有已学的词"
            className="w-36 cursor-pointer rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-center shadow-sm shadow-black/30 transition hover:border-teal-500/60 hover:bg-zinc-800/60"
          >
            <div className="text-3xl font-bold text-teal-400">{learned}</div>
            <div className="mt-1 text-xs text-zinc-500">已学单词</div>
          </button>
        </div>
        <div className="flex flex-col items-center gap-8">
          {/* 学习：今日额度内的新词，第一次作答写入排期；学完即止 */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => void startStudy()}
              disabled={newRemaining === 0}
              title="学今天额度内的新词"
              className="rounded-xl bg-sky-600 px-10 py-3 text-sm font-medium text-white shadow transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              📖 学习新词{newRemaining > 0 && <span className="ml-1.5 opacity-80">{newRemaining}</span>}
            </button>
            {newRemaining === 0 && learned > 0 && (
              <div className="text-xs text-zinc-500">今日单词已学完 ✅</div>
            )}
          </div>
          {/* 复习：学过之后出现，已学的词再过一遍，不写排期，随时可练 */}
          {learned > 0 && (
            <div className="flex flex-col items-center gap-2.5">
              <div className="text-xs text-zinc-500">复习</div>
              <button
                onClick={() => void startReview('recall')}
                title="看单词，回忆释义"
                className="rounded-xl bg-teal-600 px-10 py-3 text-sm font-medium text-white shadow transition hover:bg-teal-500"
              >
                📖 识记复习
              </button>
              <button
                onClick={() => void startReview('spelling')}
                title="看释义，默写单词"
                className="rounded-xl bg-violet-600 px-10 py-3 text-sm font-medium text-white shadow transition hover:bg-violet-500"
              >
                ⌨️ 拼写复习
              </button>
            </div>
          )}
        </div>
        {learned === 0 && (stats?.starred ?? 0) === 0 && (
          <div className="max-w-md text-center text-xs leading-6 text-zinc-500">
            去查几个词并按 ⭐ 划入重点，就能开始积累单词。
          </div>
        )}
      </div>
    )
  }

  return (
    <ReviewSession
      cards={queue}
      index={idx}
      mode={mode}
      practice={practice}
      onAnswer={handleAnswer}
      onReveal={handleReveal}
      onExit={() => {
        setPhase('idle')
        void load()
      }}
    />
  )
}

// ---------- 复习会话 ----------

// 自评三档（默默背单词式）：认识 / 模糊 / 不认识，展示顺序与按键一致
const SELF_RATINGS: { rating: Rating; label: string; color: string; key: string }[] = [
  { rating: 3, label: '认识', color: 'bg-teal-600 hover:bg-teal-500', key: '1' },
  { rating: 2, label: '模糊', color: 'bg-orange-600 hover:bg-orange-500', key: '2' },
  { rating: 1, label: '不认识', color: 'bg-red-600 hover:bg-red-500', key: '3' }
]

/** 把例句里的目标词（含常见屈折变化）挖空成 ＿＿＿；找不到目标词时返回原文不挖 */
function blankExample(exEn: string, word: string): { text: string; blanked: boolean } {
  const plain = exEn.replace(/\*\*/g, '')
  const w = word.trim()
  if (!w || w.length > 40) return { text: plain, blanked: false }
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b(${esc}(?:s|es|ed|d|ing)?)\\b`, 'i')
  if (!re.test(plain)) return { text: plain, blanked: false }
  const text = plain.replace(new RegExp(`\\b(${esc}(?:s|es|ed|d|ing)?)\\b`, 'gi'), '＿＿＿')
  return { text, blanked: true }
}

function ReviewSession({
  cards,
  index,
  mode,
  practice,
  onAnswer,
  onReveal,
  onExit
}: {
  cards: SessionCard[]
  index: number
  mode: ReviewMode
  practice: boolean
  onAnswer: (rating: Rating, mode: ReviewMode) => Promise<void>
  onReveal: () => void
  onExit: () => void
}): React.JSX.Element {
  const card = cards[index]
  const [flipped, setFlipped] = useState(false)
  const [spellingInput, setSpellingInput] = useState('')
  const [spellingStatus, setSpellingStatus] = useState<'typing' | 'correct' | 'wrong' | 'revealed'>(
    'typing'
  )
  const inputRef = useRef<HTMLInputElement>(null)

  // 新卡首次展示时计入今日新卡配额（巩固轮不算）
  useEffect(() => {
    if (card?.isNew && !practice) void window.api.reviewIntroduced(card.entry.id)
  }, [card, practice])

  useEffect(() => {
    setFlipped(false)
    setSpellingInput('')
    setSpellingStatus('typing')
  }, [index])

  const entry = card.entry
  const s = entry.structured
  const isZh = isZhText(entry.text)
  const answerText = s?.definitionZh || s?.translation || ''
  // 默默背单词式提示：例句挖空目标词
  const blank = s?.examples?.length ? blankExample(s.examples[0].en, entry.text) : null
  // 拼写只对「有释义的英文单词」生效；句子/中文词/无释义卡自动按识记翻面处理
  const spellingEligible = entry.type === 'word' && !isZh && !!answerText
  const spelling = mode === 'spelling' && spellingEligible

  // 拼写输入框：换卡后自动聚焦
  useEffect(() => {
    if (spelling && spellingStatus === 'typing') inputRef.current?.focus()
  }, [spelling, spellingStatus, index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // 空格翻面仅识记模式（拼写模式的空格是输入内容）
      if (e.key === ' ' && mode === 'recall') {
        e.preventDefault()
        setFlipped((f) => !f)
        return
      }
      // 揭示后：数字键自评（认识/模糊/不认识）
      const grading = mode === 'recall' ? flipped : spellingStatus === 'revealed'
      if (grading && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        void onAnswer(Number(e.key) as Rating, mode)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, flipped, spellingStatus, onAnswer])

  /** 忽略大小写、连续空白与末尾标点后比较 */
  function normalize(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,!?;:、。！？；：，]+$/g, '')
  }

  function submitSpelling(): void {
    if (spellingStatus !== 'typing' && spellingStatus !== 'wrong') return
    const ok = normalize(spellingInput) === normalize(entry.text) && spellingInput.trim() !== ''
    if (ok) {
      setSpellingStatus('correct')
      setTimeout(() => {
        setSpellingStatus('typing')
        void onAnswer(3, 'spelling')
      }, 650)
    } else {
      setSpellingStatus('wrong')
      // 保留内容并全选，方便直接改
      inputRef.current?.select()
    }
  }

  function revealAnswer(): void {
    setSpellingStatus('revealed')
    onReveal()
  }

  const showBack = mode === 'recall' ? flipped : spellingStatus === 'revealed'
  const grading = mode === 'recall' ? flipped : spellingStatus === 'revealed'
  const showInput = spelling && (spellingStatus === 'typing' || spellingStatus === 'wrong')

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-6 py-5">
      {/* 顶部进度 */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={onExit}
          className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100"
          title="退出本轮"
        >
          ← 返回
        </button>
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
        {card.relearn && (
          <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300">重学</span>
        )}
        {isZh && (
          <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">中→英</span>
        )}
      </div>

      {/* 卡片 */}
      <div
        className="flex min-h-0 flex-1 cursor-pointer flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-lg shadow-black/30"
        onClick={() => {
          if (mode === 'recall') setFlipped((f) => !f)
        }}
      >
        <div className="flex flex-col items-center px-6 pb-4 pt-8">
          {spelling && !showBack ? (
            <>
              <div className="text-center text-xs text-zinc-500">看释义，默写英文</div>
              <div className="mt-3 select-text text-center text-xl font-medium text-zinc-100">
                {s?.pos && <span className="mr-1.5 text-teal-300">{s.pos}</span>}
                {answerText}
              </div>
              {blank?.blanked && (
                <div className="mx-auto mt-4 max-w-md select-text text-center text-[13px] leading-6 text-zinc-400">
                  {blank.text}
                </div>
              )}
              {showInput && (
                <div
                  className="mt-6 flex w-full max-w-sm items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    ref={inputRef}
                    autoFocus
                    value={spellingInput}
                    onChange={(e) => {
                      setSpellingInput(e.target.value)
                      if (spellingStatus === 'wrong') setSpellingStatus('typing')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitSpelling()
                      if (e.key === 'Escape') revealAnswer()
                      e.stopPropagation()
                    }}
                    placeholder="输入英文后回车"
                    className={`min-w-0 flex-1 rounded-lg border bg-zinc-800 px-3 py-2 text-center text-lg text-zinc-100 outline-none transition ${
                      spellingStatus === 'wrong'
                        ? 'border-red-500/60'
                        : 'border-zinc-700 focus:border-violet-500'
                    }`}
                  />
                  <button
                    onClick={submitSpelling}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500"
                  >
                    检查
                  </button>
                </div>
              )}
              {spellingStatus === 'wrong' && (
                <div className="mt-3 flex items-center gap-3 text-center text-sm text-red-400">
                  <span>不对，再想想（回车重试，Esc 显示答案）</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      revealAnswer()
                    }}
                    className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                  >
                    显示答案
                  </button>
                </div>
              )}
              {spellingStatus === 'correct' && (
                <div className="mt-3 text-sm text-teal-400">✅ 拼写正确</div>
              )}
            </>
          ) : (
            <>
              <div className="select-text text-center text-2xl font-semibold text-zinc-100">
                {showBack && spelling ? `答案：${entry.text}` : entry.text}
              </div>
              {mode === 'recall' && !flipped && (
                <>
                  {(s?.phonetic || s?.pos) && (
                    <div className="mt-2 select-text text-sm text-zinc-500">
                      {s?.phonetic && <span className="mr-2">{s.phonetic}</span>}
                      {s?.pos && <span className="text-teal-500">{s.pos}</span>}
                    </div>
                  )}
                  {blank?.blanked && (
                    <div className="mx-auto mt-5 max-w-md select-text text-center text-[13px] leading-6 text-zinc-400">
                      {blank.text}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {mode === 'recall' && !flipped && (
            <div className="mt-5 text-xs text-zinc-600">点击卡片或按空格显示答案</div>
          )}
          {spelling && spellingStatus === 'typing' && (
            <div className="mt-5 text-xs text-zinc-600">输入后回车检查；不会就按 Esc 显示答案</div>
          )}
        </div>

        {/* 背面内容 */}
        {showBack && (
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
            {entry.markdown ? (
              /* 和查询弹窗同一份完整讲解 */
              <Md>{entry.markdown}</Md>
            ) : s ? (
              <div className="space-y-3">
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
                    {s.keyPoints.map((k, i) => (
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
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-zinc-600">
                这条重点还没有讲解，去生词本查看详情或重新查询。
              </div>
            )}
            {entry.note && (
              <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200/80">
                📝 {entry.note}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 自评区（默默背单词式三档） */}
      {grading && (
        <div className="mt-4 flex justify-center gap-2.5">
          {SELF_RATINGS.map((r) => (
            <button
              key={r.rating}
              onClick={() => void onAnswer(r.rating, mode)}
              className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-medium text-white shadow-sm transition ${r.color}`}
            >
              <span className="rounded bg-white/25 px-1.5 text-xs">{r.key}</span>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="flex h-full items-center justify-center text-sm text-zinc-500">{children}</div>
}
