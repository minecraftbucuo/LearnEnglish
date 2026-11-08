import { useEffect, useRef, useState } from 'react'
import iconUrl from '../assets/icon.png'
import type { ReviewWordStatus } from '@shared/types'
import { LibraryPage } from './pages/LibraryPage'
import { ReviewPage } from './pages/ReviewPage'
import { StatsPage } from './pages/StatsPage'
import { SettingsPage } from './pages/SettingsPage'

export type Tab = 'library' | 'review' | 'stats' | 'settings'

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'review', icon: '🎯', label: '学习' },
  { key: 'library', icon: '📚', label: '生词本' },
  { key: 'stats', icon: '📊', label: '统计' },
  { key: 'settings', icon: '⚙️', label: '设置' }
]

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('library')
  const [refreshKey, setRefreshKey] = useState(0)
  // 从学习页数据卡点进生词本时携带的学习状态筛选
  const [libraryStatus, setLibraryStatus] = useState<ReviewWordStatus | undefined>(undefined)
  const [aboutOpen, setAboutOpen] = useState(false)

  // 关于弹窗：Esc 关闭
  useEffect(() => {
    if (!aboutOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAboutOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aboutOpen])

  function openWords(status: ReviewWordStatus): void {
    setLibraryStatus(status)
    setTab('library')
    setRefreshKey((k) => k + 1)
  }
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
                if (t.key === 'library') setLibraryStatus(undefined)
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
        <button
          onClick={() => setAboutOpen(true)}
          title="关于"
          className="cursor-pointer px-4 pb-4 pt-1 text-left text-[11px] text-zinc-600 transition hover:text-zinc-300"
        >
          v{__APP_VERSION__} · 数据仅存本机
        </button>
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
        {tab === 'library' && <LibraryPage key={refreshKey} initialStatus={libraryStatus} />}
        {/* 学习页常驻挂载：切走再切回，进行中的会话不重置 */}
        <div className={`h-full ${tab === 'review' ? '' : 'hidden'}`}>
          <ReviewPage active={tab === 'review'} onOpenWords={openWords} />
        </div>
        {tab === 'stats' && <StatsPage key={refreshKey} />}
        {tab === 'settings' && <SettingsPage key={refreshKey} />}
      </main>

      {/* 关于弹窗：点背景或 Esc 关闭 */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setAboutOpen(false)}
        >
          <div
            className="w-80 rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-6 text-center shadow-xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={iconUrl} alt="LearnEnglish" className="mx-auto h-14 w-14 rounded-xl" />
            <div className="mt-3 text-base font-semibold text-zinc-100">LearnEnglish</div>
            <div className="mt-0.5 text-xs text-zinc-500">v{__APP_VERSION__}</div>
            <p className="mt-3 text-xs leading-5 text-zinc-400">
              快捷查词 + AI 讲解 + 间隔重复复习的英语学习工具
            </p>
            <div className="mt-3 text-[11px] text-zinc-600">数据仅存本机，不上传学习记录</div>
            <button
              onClick={() =>
                void window.api.openExternal('https://github.com/minecraftbucuo/LearnEnglish')
              }
              className="mt-5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 px-4 py-2 text-xs text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub 仓库
            </button>
            <button
              onClick={() => setAboutOpen(false)}
              className="mt-2 w-full cursor-pointer rounded-lg bg-zinc-800 px-4 py-2 text-xs text-zinc-300 transition hover:bg-zinc-700"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
