import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReviewCard, ReviewStats } from '@shared/types'
import { intervalPreview, isZhText, speak } from '../../utils'
import { EmText } from '../../components/EmText'

type Phase = 'idle' | 'session' | 'done'
type ReviewSessionMode = 'recall' | 'spelling'

/** 会话内卡片：答「忘记」的卡会在队尾重现，relearn 用于标记「重学」徽章 */
type SessionCard = ReviewCard & { relearn?: boolean }

const MODE_STORAGE_KEY = 'le_review_mode'

export function ReviewPage(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [mode, setMode] = useState<ReviewSessionMode>(() =>
    localStorage.getItem(MODE_STORAGE_KEY) === 'spelling' ? 'spelling' : 'recall'
  )
  const [freePractice, setFreePractice] = useState(false)
  const [freeDoneCount, setFreeDoneCount] = useState<number | null>(null)
  const [queue, setQueue] = useState<SessionCard[]>([])
  const [idx, setIdx] = useState(0)
  const [result, setResult] = useState({ answered: 0, again: 0, revealed: 0 })
  const [loading, setLoading] = useState(true)
  const [dueCount, setDueCount] = useState(0)
  const [newRemaining, setNewRemaining] = useState(0)
  const [stats, setStats] = useState<ReviewStats | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    const q = await window.api.reviewQueue()
    setDueCount(q.dueCount)
    setNewRemaining(q.newRemaining)
    setStats(await window.api.reviewStats())
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function chooseMode(m: ReviewSessionMode): void {
    setMode(m)
    localStorage.setItem(MODE_STORAGE_KEY, m)
  }

  async function start(): Promise<void> {
    const q = await window.api.reviewQueue()
    const cards = [...q.due, ...q.newCards]
    if (!cards.length) {
      await load()
      return
    }
    setQueue(cards)
    setIdx(0)
    setResult({ answered: 0, again: 0, revealed: 0 })
    setFreePractice(false)
    setFreeDoneCount(null)
    setPhase('session')
  }

  async function startFree(): Promise<void> {
    const cards = await window.api.freeQueue()
    if (!cards.length) return
    setQueue(cards)
    setIdx(0)
    setResult({ answered: 0, again: 0, revealed: 0 })
    setFreePractice(true)
    setFreeDoneCount(null)
    setPhase('session')
  }

  async function handleAnswer(
    rating: 1 | 2 | 3 | 4,
    answerMode: 'recall' | 'spelling'
  ): Promise<void> {
    const card = queue[idx]
    if (!card) return
    // 自由练习不计入调度与统计
    if (!freePractice) await window.api.reviewAnswer(card.entry.id, rating, answerMode)
    setResult((r) => ({ ...r, answered: r.answered + 1, again: r.again + (rating === 1 ? 1 : 0) }))
    // 答「忘记」：本轮队尾重现，学对才算完
    if (rating === 1) setQueue((qs) => [...qs, { ...card, isNew: false, relearn: true }])
    if (idx + 1 >= queue.length) {
      if (freePractice) {
        setFreeDoneCount(result.answered + 1)
        setPhase('idle')
        await load()
      } else {
        setPhase('done')
        await load()
      }
    } else {
      setIdx((i) => i + 1)
    }
  }

  function handleReveal(): void {
    setResult((r) => ({ ...r, revealed: r.revealed + 1 }))
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
              共复习 {result.answered} 张，其中 {result.again} 张不认识（稍后会重现）
              {mode === 'spelling' && result.revealed > 0 && <>，{result.revealed} 张点了显示答案</>}
            </div>
          </div>
        )}
        {freeDoneCount !== null && (
          <div className="rounded-lg bg-violet-500/10 px-4 py-2 text-xs text-violet-300">
            刚完成自由练习 {freeDoneCount} 张（不计入复习进度，不影响排期）
          </div>
        )}
        <div className="flex gap-4">
          <div className="w-36 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-center shadow-sm shadow-black/30">
            <div className="text-3xl font-bold text-teal-400">{dueCount}</div>
            <div className="mt-1 text-xs text-zinc-500">到期复习</div>
          </div>
          <div className="w-36 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-center shadow-sm shadow-black/30">
            <div className="text-3xl font-bold text-sky-400">{newRemaining}</div>
            <div className="mt-1 text-xs text-zinc-500">可学新卡（剩余）</div>
          </div>
          <div className="w-36 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-center shadow-sm shadow-black/30">
            <div className="text-3xl font-bold text-zinc-200">{stats?.newToday ?? 0}</div>
            <div className="mt-1 text-xs text-zinc-500">今日已学新卡</div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          {/* 模式选择：整轮统一，单词不会先露脸 */}
          <div className="flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">
            {(
              [
                { key: 'recall', label: '📖 识记', desc: '看单词回忆释义' },
                { key: 'spelling', label: '⌨️ 拼写', desc: '看释义默写单词' }
              ] as { key: ReviewSessionMode; label: string; desc: string }[]
            ).map((m) => (
              <button
                key={m.key}
                onClick={() => chooseMode(m.key)}
                title={m.desc}
                className={`rounded-lg px-5 py-1.5 text-sm transition ${
                  mode === m.key
                    ? 'bg-teal-600 font-medium text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => void start()}
            disabled={dueCount + newRemaining === 0}
            className="rounded-xl bg-teal-600 px-10 py-3 text-sm font-medium text-white shadow transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {finished ? '再来一轮' : '开始复习'}
          </button>
          <button
            onClick={() => void startFree()}
            disabled={(stats?.starred ?? 0) === 0}
            className="rounded-lg border border-violet-500/40 px-5 py-1.5 text-xs text-violet-300 transition hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            title="随机抽取全部重点卡片练习，不改变复习排期"
          >
            🎲 自由练习 · 随机 {stats?.starred ?? 0} 张（不计入进度）
          </button>
        </div>
        {dueCount + newRemaining === 0 && (
          <div className="max-w-md text-center text-xs leading-6 text-zinc-500">
            {(stats?.newToday ?? 0) > 0 || (stats?.reviewedToday ?? 0) > 0 ? (
              <>
                今日任务已完成 ✅ 共复习 {stats?.reviewedToday ?? 0} 张。
                点了「不认识」的卡 <b className="text-zinc-300">10 分钟后</b>会自动重现；
                认识的卡从明天起按间隔出现。
              </>
            ) : (
              <>划重点的新词会在明天出现在这里。去查几个词并按 ⭐ 划入重点，就能开始积累卡片。</>
            )}
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
      onAnswer={handleAnswer}
      onReveal={handleReveal}
    />
  )
}

// ---------- 复习会话 ----------

// 自评三档（默默背单词式）：认识 / 模糊 / 不认识，映射到 SRS 的 3/2/1，展示顺序与按键一致
const SELF_RATINGS: { rating: 1 | 2 | 3; label: string; color: string; key: string }[] = [
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
  onAnswer,
  onReveal
}: {
  cards: SessionCard[]
  index: number
  mode: ReviewSessionMode
  onAnswer: (rating: 1 | 2 | 3 | 4, mode: ReviewSessionMode) => Promise<void>
  onReveal: () => void
}): React.JSX.Element {
  const card = cards[index]
  const [flipped, setFlipped] = useState(false)
  const [spellingInput, setSpellingInput] = useState('')
  const [spellingStatus, setSpellingStatus] = useState<'typing' | 'correct' | 'wrong' | 'revealed'>(
    'typing'
  )
  const inputRef = useRef<HTMLInputElement>(null)

  // 新卡首次展示时计入今日新卡配额
  useEffect(() => {
    if (card?.isNew) void window.api.reviewIntroduced(card.entry.id)
  }, [card])

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
        void onAnswer(Number(e.key) as 1 | 2 | 3, mode)
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

      {/* 自评区（默默背单词式三档） */}
      {grading && (
        <div className="mt-4 flex justify-center gap-2.5">
          {SELF_RATINGS.map((r) => (
            <button
              key={r.rating}
              onClick={() => void onAnswer(r.rating, mode)}
              title={`下次间隔：${intervalPreview(card.state, r.rating)}`}
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
