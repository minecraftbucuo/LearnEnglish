import { useEffect, useState } from 'react'
import type { ReviewStats } from '@shared/types'

export function StatsPage(): React.JSX.Element {
  const [stats, setStats] = useState<ReviewStats | null>(null)

  useEffect(() => {
    void window.api.reviewStats().then(setStats)
  }, [])

  if (!stats) return <div className="flex h-full items-center justify-center text-sm text-slate-400">加载中…</div>

  const maxUpcoming = Math.max(1, ...stats.upcoming.map((u) => u.count))

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <h1 className="mb-5 text-base font-semibold text-slate-800">学习统计</h1>

      <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">
        <StatCard value={stats.totalEntries} label="累计查询词条" />
        <StatCard value={stats.starred} label="划入重点" accent="text-amber-500" />
        <StatCard value={stats.dueNow} label="当前待复习" accent="text-teal-600" />
        <StatCard value={stats.reviewedToday} label="今日已复习" accent="text-sky-600" />
        <StatCard value={stats.mastered} label="已掌握 (≥21天)" accent="text-emerald-600" />
        <StatCard value={stats.streakDays} label="连续打卡 (天)" accent="text-orange-500" />
      </div>

      <h2 className="mb-3 mt-7 text-sm font-semibold text-slate-700">未来 7 天到期分布</h2>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex h-36 items-end gap-3">
          {stats.upcoming.map((u, i) => (
            <div key={u.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div className="text-xs font-medium text-slate-600">{u.count > 0 ? u.count : ''}</div>
              <div
                className={`w-full rounded-t-md transition-all ${
                  i === 0 ? 'bg-teal-500' : 'bg-teal-200 hover:bg-teal-300'
                }`}
                style={{ height: `${Math.max((u.count / maxUpcoming) * 100, u.count > 0 ? 6 : 2)}%` }}
                title={`${u.date}: ${u.count} 张到期`}
              />
              <div className="text-[11px] text-slate-400">
                {i === 0 ? '今天' : i === 1 ? '明天' : u.date.slice(5)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
        💡 间隔重复的原理：答得越顺，下次复习间隔拉得越长（1天 → 6天 → 15天 → 37天…）。
        想让某条内容更快变成长期记忆，复习时如实点「忘记」比硬撑「良好」更有效。
      </div>
    </div>
  )
}

function StatCard({
  value,
  label,
  accent = 'text-slate-800'
}: {
  value: number
  label: string
  accent?: string
}): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      <div className="mt-1 text-[11px] text-slate-500">{label}</div>
    </div>
  )
}
