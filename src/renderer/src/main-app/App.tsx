import { useEffect, useState } from 'react'
import { LibraryPage } from './pages/LibraryPage'
import { ReviewPage } from './pages/ReviewPage'
import { StatsPage } from './pages/StatsPage'
import { SettingsPage } from './pages/SettingsPage'

export type Tab = 'library' | 'review' | 'stats' | 'settings'

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'review', icon: '🎯', label: '复习' },
  { key: 'library', icon: '📚', label: '生词本' },
  { key: 'stats', icon: '📊', label: '统计' },
  { key: 'settings', icon: '⚙️', label: '设置' }
]

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('library')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const off = window.api.onMainNavigate((t) => {
      if (TABS.some((x) => x.key === t)) setTab(t as Tab)
    })
    // 主窗口内双击单词直接查（英文 1-2 个词 / 中文 ≤64 字符；跳过输入框等控件）
    const onDblClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable]')) return
      const sel = window.getSelection()?.toString().trim() ?? ''
      if (!sel || sel.length > 64) return
      const isZh = /[\u4e00-\u9fff]/.test(sel)
      if (!isZh && sel.split(/\s+/).length > 2) return
      void window.api.lookupText(sel)
    }
    window.addEventListener('dblclick', onDblClick)
    return () => {
      off()
      window.removeEventListener('dblclick', onDblClick)
    }
  }, [])

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">
      {/* 侧边栏 */}
      <aside className="flex w-44 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2 px-4 pb-3 pt-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-teal-500 text-sm font-bold text-white">
            E
          </div>
          <div className="text-sm font-semibold text-zinc-100">LearnEnglish</div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-2.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key)
                setRefreshKey((k) => k + 1)
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                tab === t.key
                  ? 'bg-teal-500/10 font-medium text-teal-300'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="px-4 pb-4 text-[11px] text-zinc-600">v0.1.0 · 数据仅存本机</div>
      </aside>

      {/* 内容区 */}
      <main className="min-w-0 flex-1 overflow-hidden">
        {tab === 'library' && <LibraryPage key={refreshKey} />}
        {tab === 'review' && <ReviewPage key={refreshKey} />}
        {tab === 'stats' && <StatsPage key={refreshKey} />}
        {tab === 'settings' && <SettingsPage key={refreshKey} />}
      </main>
    </div>
  )
}
