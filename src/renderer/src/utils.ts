import type { ReviewState, StructuredData } from '@shared/types'
import { schedule } from '@shared/srs'
import { isZhContent } from '@shared/text'

/** 文本是否为中文（决定查词方向与朗读可用性） */
export function isZhText(text: string): boolean {
  return isZhContent(text)
}

/** 应用主题（html.light 类 + Tailwind 变量覆盖实现黑白切换） */
export function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.classList.toggle('light', theme === 'light')
}

/** 初始化时应用已保存的主题，并跟随设置变化 */
export function initTheme(): void {
  void window.api.settingsGet().then((s) => applyTheme(s.theme))
  window.api.onSettingsChanged((s) => applyTheme(s.theme))
}

/** 系统英文朗读 */
export function speak(text: string, rate = 1): void {
  if (!('speechSynthesis' in window) || !text.trim()) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = rate
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('en'))
  if (voice) u.voice = voice
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 字节数人性化显示 */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** 复习到期时间的人性化描述 */
export function fmtDue(state: ReviewState): string {
  if (state.reps === 0) return '新卡'
  const diffMs = new Date(state.dueAt).getTime() - Date.now()
  if (diffMs <= 0) return '现在'
  const mins = Math.round(diffMs / 60000)
  if (mins < 60) return `${mins} 分钟后`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} 小时后`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天后`
  return `${Math.round(days / 30)} 个月后`
}

/** 各评分档下一次间隔预览（评分按钮 tooltip） */
export function intervalPreview(state: ReviewState, rating: 1 | 2 | 3 | 4): string {
  const next = schedule(
    {
      ease: state?.ease ?? 2.5,
      intervalDays: state?.intervalDays ?? 0,
      reps: state?.reps ?? 0,
      lapses: state?.lapses ?? 0
    },
    rating
  )
  if (next.dueInMinutes < 1440) return `${next.dueInMinutes} 分钟后`
  const d = next.intervalDays
  return d < 30 ? `${d} 天后` : `${Math.round((d / 30) * 10) / 10} 个月后`
}

export function structuredSummary(s: StructuredData | null): string {
  if (!s) return ''
  const parts: string[] = []
  if (s.definitionZh) parts.push(s.definitionZh)
  if (s.translation) parts.push(s.translation)
  return parts.join('；')
}
