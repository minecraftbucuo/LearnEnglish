import { useCallback, useEffect, useState } from 'react'
import type { SelectionRect } from '@shared/api'

// 覆盖层（v3）：不做任何预抓屏，直接盖在活屏幕上框选；
// 确认时把选区（CSS 像素）交给主进程，由主进程 GDI 抓那一小块区域。

export default function App(): React.JSX.Element {
  const [rect, setRect] = useState<SelectionRect | null>(null)
  const [drag, setDrag] = useState<SelectionRect | null>(null)
  const [busy, setBusy] = useState(false)

  const active = drag ?? rect

  const cancel = useCallback((): void => {
    setRect(null)
    setDrag(null)
    void window.api.screenshotCancel()
  }, [])

  const confirm = useCallback(async (): Promise<void> => {
    const r = rect
    if (!r || busy) return
    setBusy(true)
    try {
      await window.api.screenshotConfirm({
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.w),
        h: Math.round(r.h)
      })
    } finally {
      setBusy(false)
    }
  }, [rect, busy])

  useEffect(() => {
    const off = window.api.onOverlayStart(() => {
      setRect(null)
      setDrag(null)
      setBusy(false)
    })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        void confirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [cancel, confirm])

  function normDrag(a: { x: number; y: number }, b: { x: number; y: number }): SelectionRect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y)
    }
  }

  const hasSelection = !!active && active.w > 12 && active.h > 12

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ cursor: 'crosshair' }}
      onMouseDown={(e) => {
        if (e.button !== 0 || busy) return
        setRect(null)
        setDrag({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
      }}
      onMouseMove={(e) => {
        if (!drag) return
        setDrag((d) => (d ? normDrag({ x: d.x, y: d.y }, { x: e.clientX, y: e.clientY }) : d))
      }}
      onMouseUp={() => {
        if (drag && drag.w > 12 && drag.h > 12) setRect(drag)
        setDrag(null)
      }}
    >
      {/* 暗色遮罩：未框选时盖满全屏；框选后由选区的巨型 box-shadow 实现"挖亮" */}
      {!active && <div className="absolute inset-0 bg-black/35" />}
      {active && (
        <div
          className="pointer-events-none absolute border border-cyan-400"
          style={{
            left: active.x,
            top: active.y,
            width: Math.max(active.w, 0),
            height: Math.max(active.h, 0),
            boxShadow: '0 0 0 100000px rgba(0,0,0,0.35)'
          }}
        />
      )}

      {/* 尺寸提示 */}
      {active && active.w > 40 && (
        <div
          className="pointer-events-none absolute rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white"
          style={{ left: active.x, top: Math.max(active.y - 22, 4) }}
        >
          {Math.round(active.w)} × {Math.round(active.h)}
        </div>
      )}

      {/* 工具栏（阻断 mousedown 冒泡，避免点击按钮时清空选区） */}
      {hasSelection && (
        <div
          className="absolute z-10 flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/95 p-1 shadow-xl shadow-black/50"
          style={{
            left: Math.min(active!.x + Math.max(active!.w - 210, 8), window.innerWidth - 220),
            top: Math.min(active!.y + active!.h + 8, window.innerHeight - 44)
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => void confirm()}
            disabled={busy}
            className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-500 disabled:opacity-50"
          >
            ✅ 识别讲解 (Enter)
          </button>
          <button
            onClick={() => {
              setRect(null)
              setDrag(null)
            }}
            className="rounded-md px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            重选
          </button>
          <button
            onClick={cancel}
            className="rounded-md px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            取消 (Esc)
          </button>
        </div>
      )}

      {/* 提示条 */}
      {!active && (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-lg bg-black/70 px-4 py-2 text-sm text-white">
          拖拽框选要查询的英文区域，Enter 确认，Esc 取消
        </div>
      )}
    </div>
  )
}
