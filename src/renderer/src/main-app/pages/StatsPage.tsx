import { useEffect, useRef, useState } from 'react'
import type { DailyActivity, ReviewStats } from '@shared/types'

export function StatsPage(): React.JSX.Element {
  const [stats, setStats] = useState<ReviewStats | null>(null)

  useEffect(() => {
    void window.api.reviewStats().then(setStats)
  }, [])

  if (!stats)
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">加载中…</div>

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <h1 className="mb-5 text-base font-semibold text-zinc-100">学习统计</h1>

      {/* 核心指标 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <HeroCard icon="📚" value={stats.learned} label="已学单词" accent="text-teal-300" glow="from-teal-500/15" />
        <HeroCard icon="🔥" value={stats.streakDays} label="连续打卡（天）" accent="text-orange-300" glow="from-orange-500/15" />
        <HeroCard icon="🏆" value={stats.mastered} label="已掌握（≥21天）" accent="text-emerald-300" glow="from-emerald-500/15" />
        <HeroCard icon="⚡" value={stats.reviewedToday} label="今日复习" accent="text-sky-300" glow="from-sky-500/15" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 学习热力图 */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 xl:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-zinc-300">学习热力图</h2>
          <Heatmap cells={stats.heatmap} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
            <span>
              近一年 · 共 {stats.heatmap.reduce((a, c) => a + c.count, 0)} 次答题 · 累计查询{' '}
              {stats.totalEntries} 条 · 划重点 {stats.starred} 条
            </span>
            <span className="flex items-center gap-1.5">
              少
              {HEAT_PALETTE.map((c) => (
                <span key={c} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: c }} />
              ))}
              多
            </span>
          </div>
        </section>

        {/* 掌握度环形图 */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-300">掌握度分布</h2>
          <Donut buckets={stats.buckets} />
        </section>
      </div>

      {/* 近 30 天答题堆叠柱状图 */}
      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300">近 30 天答题</h2>
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <LegendDot color="bg-teal-500" label="认识" />
            <LegendDot color="bg-orange-500" label="模糊" />
            <LegendDot color="bg-red-500" label="不认识" />
          </div>
        </div>
        <StackedBars daily={stats.daily} />
      </section>

      {/* 未来 7 天到期分布 */}
      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-300">未来 7 天到期分布</h2>
        <UpcomingArea upcoming={stats.upcoming} />
      </section>

      <div className="mt-5 rounded-xl bg-zinc-900 px-4 py-3 text-xs leading-6 text-zinc-500 ring-1 ring-zinc-800">
        💡 间隔重复的原理：答得越顺，下次复习间隔拉得越长（1天 → 6天 → 15天 → 37天…）。
        想让某条内容更快变成长期记忆，复习时如实点「忘记」比硬撑「认识」更有效。
      </div>
    </div>
  )
}

// ---------- 核心指标卡 ----------

function HeroCard({
  icon,
  value,
  label,
  accent,
  glow
}: {
  icon: string
  value: number
  label: string
  accent: string
  glow: string
}): React.JSX.Element {
  return (
    <div
      className={`rounded-2xl border border-zinc-800 bg-gradient-to-br ${glow} to-transparent px-4 py-4 shadow-sm shadow-black/30 transition hover:border-zinc-700`}
    >
      <div className="text-xl">{icon}</div>
      <div className={`mt-2 text-3xl font-bold tabular-nums ${accent}`}>{value}</div>
      <div className="mt-1 text-[11px] text-zinc-500">{label}</div>
    </div>
  )
}

// ---------- 图表悬浮提示（原生 title 在 Electron/SVG 上不可靠，统一用自绘 tooltip） ----------

interface ChartTip {
  text: string
  left: number
  top: number
  below?: boolean
}

/** tooltip 约占高度（11px 文本 + 上下 padding + 边框） */
const TIP_H = 28

/** 把触发元素的顶部中心换算成相对容器坐标（默认显示在其上方，上方放不下翻到下方）。
 *  HTML 元素与 SVG 图形通用。容器是 overflow 滚动容器，出界会被裁剪，需按可视范围钳位 */
function anchorTip(e: React.MouseEvent, wrap: HTMLDivElement | null, text: string): ChartTip | null {
  if (!wrap) return null
  const r = e.currentTarget.getBoundingClientRect()
  const wr = wrap.getBoundingClientRect()
  const sl = wrap.scrollLeft
  const center = r.left - wr.left + r.width / 2 + sl
  const left = Math.min(Math.max(center, sl + 56), Math.max(sl + wr.width - 56, sl + 56))
  // 上方放不下且下方有足够空间（如热力图首行）→ 翻到下方
  if (r.top - wr.top - 6 < TIP_H && wr.bottom - r.bottom > TIP_H) {
    return { text, left, top: r.bottom - wr.top + 6, below: true }
  }
  return { text, left, top: r.top - wr.top - 6 }
}

function ChartTipBox({ tip }: { tip: ChartTip | null }): React.JSX.Element | null {
  if (!tip) return null
  return (
    <div
      className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 shadow-lg shadow-black/40"
      style={{
        left: tip.left,
        top: tip.top,
        transform: tip.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
      }}
    >
      {tip.text}
    </div>
  )
}

// ---------- 热力图（GitHub 暗色配色，列=周，行=周一~周日） ----------

const HEAT_PALETTE = ['#27272a', '#0e4429', '#006d32', '#26a641', '#39d353']

function heatLevel(count: number): number {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 9) return 3
  return 4
}

function Heatmap({ cells }: { cells: { date: string; count: number }[] }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<ChartTip | null>(null)
  // 列距（格子 + 间距）随卡片宽度自适应：宽了格子变大撑满，窄到极限（13px）才出现横向滚动并默认定位最右
  const [pitch, setPitch] = useState(13)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const GUTTER = 18 // 左侧星期标签列的宽度
    const compute = (): void => {
      const avail = el.clientWidth - GUTTER
      setPitch(Math.max(13, Math.min(16, Math.floor(avail / colsCount))))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cell = pitch - 3

  // 出现横向滚动时默认贴最右（最近几个月才有用的信息）：挂载、列距变化、窗口宽窄变化都会重新贴右
  // （窗口变宽时浏览器会把滚动位置归零，变窄回来自动恢复贴右）
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const toRight = (): void => {
      if (el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth - el.clientWidth
    }
    toRight()
    const ro = new ResizeObserver(toRight)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pitch])

  const dayStr = (d: Date): string => {
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
  const countByDate = new Map(cells.map((c) => [c.date, c.count]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // 从一年前对齐到周一，按周分列
  const start = new Date(today)
  start.setDate(start.getDate() - 364)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))

  const cols: ({ date: string; count: number } | null)[][] = []
  const cursor = new Date(start)
  while (cursor <= today) {
    const col: ({ date: string; count: number } | null)[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor)
      d.setDate(cursor.getDate() + i)
      if (d > today) col.push(null)
      else {
        const ds = dayStr(d)
        col.push({ date: ds, count: countByDate.get(ds) ?? 0 })
      }
    }
    cols.push(col)
    cursor.setDate(cursor.getDate() + 7)
  }
  const colsCount = cols.length

  // 月份标签：某列首日月份与上一列不同时标注
  const monthLabels = cols.map((col, i) => {
    const d = new Date(col[0]!.date + 'T00:00:00')
    const prev = i > 0 ? new Date(cols[i - 1]![0]!.date + 'T00:00:00') : null
    return !prev || d.getMonth() !== prev.getMonth() ? `${d.getMonth() + 1}月` : ''
  })

  // 月份标签绝对定位在格子上方，不参与列布局（否则文字宽度会把列撑得忽宽忽窄）

  // 标签可见性（GitHub 式）：和上一个已显示的标签至少隔 26px，且右边留出标签自身宽度，放不下就不显示
  const MIN_LABEL_GAP = 26
  const LABEL_W = 28
  let lastLabelLeft = -MIN_LABEL_GAP
  const visibleLabels = cols
    .map((_, i) => ({ i, text: monthLabels[i] }))
    .filter(({ i, text }) => {
      if (!text) return false
      const left = i * pitch
      if (left - lastLabelLeft < MIN_LABEL_GAP) return false
      if (left + LABEL_W > colsCount * pitch) return false
      lastLabelLeft = left
      return true
    })

  return (
    <div ref={wrapRef} className="relative overflow-x-auto pb-1" onMouseLeave={() => setTip(null)}>
      <ChartTipBox tip={tip} />
      <div className="flex gap-1.5">
        {/* 星期标签（周一/三/五） */}
        <div className="flex shrink-0 flex-col gap-[3px] pt-4">
          {['一', '', '三', '', '五', '', ''].map((w, i) => (
            <div
              key={i}
              className="text-[9px] text-zinc-600"
              style={{ height: cell, lineHeight: `${cell}px` }}
            >
              {w}
            </div>
          ))}
        </div>
        <div className="relative shrink-0 pt-4" style={{ width: colsCount * pitch }}>
          {/* 月份标签：绝对定位在第 i 列上方，放不下/会重叠的跳过 */}
          <div className="absolute inset-x-0 top-0 h-4 overflow-hidden">
            {visibleLabels.map(({ i, text }) => (
              <span
                key={i}
                className="absolute whitespace-nowrap text-[10px] leading-4 text-zinc-500"
                style={{ left: i * pitch }}
              >
                {text}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {cols.map((col, ci) => (
              <div key={ci} className="flex shrink-0 flex-col gap-[3px]" style={{ width: cell }}>
                {col.map((cellItem, ri) =>
                  cellItem ? (
                    <div
                      key={ri}
                      onMouseEnter={(e) =>
                        setTip(
                          anchorTip(
                            e,
                            wrapRef.current,
                            `${cellItem.date.slice(5).replace('-', '月')}日 · ${cellItem.count} 次`
                          )
                        )
                      }
                      className={`shrink-0 rounded-[2px] hover:ring-1 hover:ring-zinc-300 ${
                        cellItem.date === dayStr(today) ? 'ring-1 ring-zinc-300/70' : ''
                      }`}
                      style={{
                        width: cell,
                        height: cell,
                        background: HEAT_PALETTE[heatLevel(cellItem.count)]
                      }}
                    />
                  ) : (
                    <div key={ri} className="shrink-0" style={{ width: cell, height: cell }} />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- 掌握度环形图 ----------

function Donut({
  buckets
}: {
  buckets: { mastered: number; learning: number; fresh: number }
}): React.JSX.Element {
  const total = buckets.mastered + buckets.learning + buckets.fresh
  const segs = [
    { v: buckets.mastered, color: '#34d399', label: '已掌握（≥21天）' },
    { v: buckets.learning, color: '#2dd4bf', label: '巩固中（1~20天）' },
    { v: buckets.fresh, color: '#38bdf8', label: '刚学（未毕业）' }
  ]
  const C = 2 * Math.PI * 44
  // 预计算每段弧长与起点偏移（顺时针接力排布）
  let acc = 0
  const arcs = segs.map((s) => {
    const len = total > 0 ? (s.v / total) * C : 0
    const arc = { color: s.color, len, offset: -acc }
    acc += len
    return arc
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[132px] w-[132px]">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r="44" fill="none" stroke="#27272a" strokeWidth="12" />
          {arcs.map(
            (a, i) =>
              segs[i].v > 0 && (
                <circle
                  key={segs[i].label}
                  cx="60"
                  cy="60"
                  r="44"
                  fill="none"
                  stroke={a.color}
                  strokeWidth="12"
                  strokeDasharray={`${a.len} ${C - a.len}`}
                  strokeDashoffset={a.offset}
                />
              )
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold tabular-nums text-zinc-100">{total}</div>
          <div className="text-[10px] text-zinc-500">已学单词</div>
        </div>
      </div>
      <div className="w-full space-y-1.5">
        {segs.map((s) => (
          <div key={s.label} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-zinc-400">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tabular-nums text-zinc-200">
              {s.v}
              {total > 0 && <span className="ml-1 text-zinc-600">{Math.round((s.v / total) * 100)}%</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- 近 30 天堆叠柱状图 ----------

function LegendDot({ color, label }: { color: string; label: string }): React.JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  )
}

function StackedBars({ daily }: { daily: DailyActivity[] }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<ChartTip | null>(null)
  const max = Math.max(1, ...daily.map((d) => d.total))
  const pct = (v: number): string => `${(v / max) * 100}%`
  return (
    <div ref={wrapRef} className="relative" onMouseLeave={() => setTip(null)}>
      <ChartTipBox tip={tip} />
      <div className="flex h-44 items-end gap-[3px]">
        {daily.map((d, i) => (
          <div
            key={d.date}
            onMouseEnter={(e) =>
              setTip(
                anchorTip(
                  e,
                  wrapRef.current,
                  `${d.date.slice(5)} · 共 ${d.total} 次（认识 ${d.known} / 模糊 ${d.fuzzy} / 不认识 ${d.forgot}）`
                )
              )
            }
            className="flex min-w-0 flex-1 cursor-default flex-col items-center gap-1"
          >
            <div className="flex h-40 w-full flex-col justify-end overflow-hidden rounded-md bg-zinc-800/40 transition hover:bg-zinc-800">
              <div className="w-full bg-red-500/80" style={{ height: pct(d.forgot) }} />
              <div className="w-full bg-orange-500/80" style={{ height: pct(d.fuzzy) }} />
              <div className="w-full bg-teal-500/90" style={{ height: pct(d.known) }} />
            </div>
            <div className="h-4 text-[10px] leading-4 text-zinc-600">
              {i === daily.length - 1 ? '今天' : i % 5 === 0 ? d.date.slice(5) : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- 未来 7 天到期（平滑面积图） ----------

/** Catmull-Rom 转贝塞尔，把折点连成平滑曲线 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x} ${p2.y}`
  }
  return d
}

function UpcomingArea({
  upcoming
}: {
  upcoming: { date: string; count: number }[]
}): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<ChartTip | null>(null)
  const W = 720
  const H = 180
  const padL = 34
  const padR = 34
  const top = 36
  const bottom = 44
  const max = Math.max(1, ...upcoming.map((u) => u.count))
  const innerW = W - padL - padR
  const baseline = H - bottom
  const pts = upcoming.map((u, i) => ({
    x: padL + (innerW * i) / Math.max(1, upcoming.length - 1),
    y: top + (1 - u.count / max) * (baseline - top),
    count: u.count,
    date: u.date
  }))
  const line = smoothPath(pts)
  const area = `${line} L ${pts[pts.length - 1].x} ${baseline} L ${pts[0].x} ${baseline} Z`
  const midY = top + (baseline - top) / 2

  return (
    <div ref={wrapRef} className="relative" onMouseLeave={() => setTip(null)}>
      <ChartTipBox tip={tip} />
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full">
        <defs>
          <linearGradient id="upcomingArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 参考网格 */}
        <line x1={padL} y1={baseline} x2={W - padR} y2={baseline} stroke="#3f3f46" strokeWidth="1" />
        <line
          x1={padL}
          y1={midY}
          x2={W - padR}
          y2={midY}
          stroke="#3f3f46"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.6"
        />
        <text x={padL - 8} y={midY + 4} textAnchor="end" fontSize="10" fill="#71717a">
          {Math.round(max / 2)}
        </text>
        <text x={padL - 8} y={top + 4} textAnchor="end" fontSize="10" fill="#71717a">
          {max}
        </text>
        {/* 面积 + 发光曲线（底层宽描边模拟光晕，不用 GPU 滤镜） */}
        <path d={area} fill="url(#upcomingArea)" />
        <path
          d={line}
          fill="none"
          stroke="#2dd4bf"
          strokeOpacity="0.35"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path d={line} fill="none" stroke="#2dd4bf" strokeWidth="2.5" strokeLinecap="round" />
        {/* 数据点与标注 */}
        {pts.map((p, i) => (
          <g key={p.date}>
            {/* 透明放大热区，方便悬停 */}
            <circle
              cx={p.x}
              cy={p.y}
              r="12"
              fill="transparent"
              onMouseEnter={(e) =>
                setTip(anchorTip(e, wrapRef.current, `${p.date.slice(5)} · ${p.count} 张到期`))
              }
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={i === 0 ? 5 : 4}
              fill={i === 0 ? '#5eead4' : '#18181b'}
              stroke="#2dd4bf"
              strokeWidth="2"
            />
            {p.count > 0 && (
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill="#d4d4d8">
                {p.count}
              </text>
            )}
            <text x={p.x} y={baseline + 18} textAnchor="middle" fontSize="10" fill="#71717a">
              {i === 0 ? '今天' : i === 1 ? '明天' : p.date.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
