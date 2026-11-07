import { useCallback, useEffect, useRef, useState } from 'react'
import type { OverlayStartPayload } from '@shared/api'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export default function App(): React.JSX.Element {
  const [img, setImg] = useState<string | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [drag, setDrag] = useState<Rect | null>(null)
  const [busy, setBusy] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRefState = useRef<string | null>(null)

  const active = drag ?? rect

  const cancel = useCallback((): void => {
    imgRefState.current = null
    setImg(null)
    setRect(null)
    setDrag(null)
    void window.api.screenshotCancel()
  }, [])

  const confirm = useCallback(async (): Promise<void> => {
    const r = drag ?? rect
    const el = imgRef.current
    if (!r || !el || !imgRefState.current || busy) return
    setBusy(true)
    try {
      // 截图是物理像素，页面显示是逻辑像素，按比例换算裁剪区域
      const scale = el.naturalWidth / el.clientWidth
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(r.w * scale))
      canvas.height = Math.max(1, Math.round(r.h * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(el, r.x * scale, r.y * scale, r.w * scale, r.h * scale, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/png')
      imgRefState.current = null
      setImg(null)
      setRect(null)
      setDrag(null)
      await window.api.screenshotConfirm(dataUrl)
    } finally {
      setBusy(false)
    }
  }, [drag, rect, busy])

  useEffect(() => {
    const off = window.api.onOverlayStart(({ imageDataUrl }: OverlayStartPayload) => {
      imgRefState.current = imageDataUrl
      setImg(imageDataUrl)
      setRect(null)
      setDrag(null)
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

  function normDrag(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y)
    }
  }

  const hasSelection = (drag && drag.w > 12 && drag.h > 12) || (rect && rect.w > 12 && rect.h > 12)

  return (
    <div
      ref={containerRef}
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
      {img && (
        <img
          ref={imgRef}
          src={img}
          alt="屏幕截图"
          className="pointer-events-none absolute inset-0 h-full w-full"
          draggable={false}
        />
      )}

      {/* 遮罩：选中区域用 box-shadow 挖亮 */}
      {img && (
        <div
          className="pointer-events-none absolute border border-cyan-400"
          style={
            active && (active.w > 0 || active.h > 0)
              ? {
                  left: active.x,
                  top: active.y,
                  width: active.w,
                  height: active.h,
                  boxShadow: '0 0 0 100000px rgba(0,0,0,0.32)',
                  background: 'transparent'
                }
              : { inset: 0, background: 'rgba(0,0,0,0.32)' }
          }
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

      {/* 工具栏 */}
      {hasSelection && (
        <div
          className="absolute z-10 flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/95 p-1 shadow-xl shadow-black/50"
          style={{
            left: Math.min(
              (drag ?? rect)!.x + Math.max((drag ?? rect)!.w - 210, 8),
              window.innerWidth - 220
            ),
            top: Math.min((drag ?? rect)!.y + (drag ?? rect)!.h + 8, window.innerHeight - 44)
          }}
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
      {img && !hasSelection && (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-lg bg-black/70 px-4 py-2 text-sm text-white">
          拖拽框选要查询的英文区域，Esc 取消
        </div>
      )}
    </div>
  )
}
