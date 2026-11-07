import { useEffect, useRef, useState } from 'react'
import iconUrl from '../assets/icon.png'
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
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem('le_sidebar_width'))
    return v >= 140 && v <= 300 ? v : 176
  })
  const draggingRef = useRef(false)
  const widthRef = useRef(sidebarWidth)

  useEffect(() => {
    const off = window.api.onMainNavigate((t) => {
      if (TABS.some((x) => x.key === t)) setTab(t as Tab)
    })
    return off
  }, [])

  // 侧边栏宽度拖拽（带记忆）
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return
      const w = Math.min(Math.max(e.clientX, 140), 300)
      widthRef.current = w
      setSidebarWidth(w)
    }
    const onUp = (): void => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('le_sidebar_width', String(widthRef.current))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">
      {/* 侧边栏 */}
      <aside
        className="flex shrink-0 flex-col border-r border-zinc-800 bg-zinc-900"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center gap-2 px-4 pb-3 pt-5">
          <img src={iconUrl} alt="LearnEnglish" className="h-8 w-8 rounded-lg" />
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
        <div className="px-4 pb-4 text-[11px] text-zinc-600">v${__APP_VERSION__} · 数据仅存本机</div>
      </aside>

      {/* 拖拽分隔条 */}
      <div
        className="w-1.5 shrink-0 cursor-col-resize bg-zinc-800/60 transition-colors hover:bg-teal-500/60"
        onMouseDown={(e) => {
          e.preventDefault()
          draggingRef.current = true
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        }}
      />

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
