import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScreenCapturePayload } from '@shared/types'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export default function App(): React.JSX.Element {
  const [cap, setCap] = useState<ScreenCapturePayload | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [drag, setDrag] = useState<Rect | null>(null)
  const [busy, setBusy] = useState(false)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)
  const visibleRef = useRef<HTMLCanvasElement>(null)
  const capRef = useRef<ScreenCapturePayload | null>(null)

  const active = drag ?? rect
  const sf = cap?.scaleFactor ?? 1

  const cancel = useCallback((): void => {
    capRef.current = null
    setCap(null)
    setRect(null)
    setDrag(null)
    void window.api.screenshotCancel()
  }, [])

  const confirm = useCallback(async (): Promise<void> => {
    const r = rect
    const off = offscreenRef.current
    if (!r || !off || !capRef.current || busy) return
    setBusy(true)
    try {
      const c = capRef.current
      // 选区（CSS 逻辑像素）→ 源位图物理像素（叠加显示器矩形偏移）
      const sx = Math.round(c.rect.x + r.x * c.scaleFactor)
      const sy = Math.round(c.rect.y + r.y * c.scaleFactor)
      const sw = Math.max(1, Math.round(r.w * c.scaleFactor))
      const sh = Math.max(1, Math.round(r.h * c.scaleFactor))
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(off, sx, sy, sw, sh, 0, 0, sw, sh)
      const dataUrl = canvas.toDataURL('image/png')
      capRef.current = null
      setCap(null)
      setRect(null)
      setDrag(null)
      await window.api.screenshotConfirm(dataUrl)
    } finally {
      setBusy(false)
    }
  }, [rect, busy])

  useEffect(() => {
    const off = window.api.onOverlayStart((p) => {
      capRef.current = p
      setCap(p)
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

  // 位图到达后绘制到离屏 canvas（原始 RGBA → ImageData，无 PNG 解码开销）
  useEffect(() => {
    if (!cap) {
      offscreenRef.current = null
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = cap.width
    canvas.height = cap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const clamped = new Uint8ClampedArray(
      cap.buf.buffer as ArrayBuffer,
      cap.buf.byteOffset,
      cap.buf.byteLength
    )
    ctx.putImageData(new ImageData(clamped, cap.width, cap.height), 0, 0)
    offscreenRef.current = canvas
    // 同步绘制可见画布
    const vis = visibleRef.current
    if (vis) {
      vis.width = cap.rect.w
      vis.height = cap.rect.h
      const vctx = vis.getContext('2d')
      vctx?.drawImage(canvas, cap.rect.x, cap.rect.y, cap.rect.w, cap.rect.h, 0, 0, cap.rect.w, cap.rect.h)
    }
  }, [cap])

  // 选区/拖动变化时重绘可见画布（把选中区域变亮：先画原图再叠暗色遮罩挖洞）
  useEffect(() => {
    const vis = visibleRef.current
    if (!vis || !cap) return
    const off = offscreenRef.current
    if (!off) return
    vis.width = cap.rect.w
    vis.height = cap.rect.h
    const ctx = vis.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, vis.width, vis.height)
    ctx.drawImage(off, cap.rect.x, cap.rect.y, cap.rect.w, cap.rect.h, 0, 0, cap.rect.w, cap.rect.h)
    // 全屏暗色遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, vis.width, vis.height)
    // 选中区域重新画一遍原图（挖亮）
    if (active && active.w > 2 && active.h > 2) {
      const sx = cap.rect.x + active.x * cap.scaleFactor
      const sy = cap.rect.y + active.y * cap.scaleFactor
      const sw = Math.round(active.w * cap.scaleFactor)
      const sh = Math.round(active.h * cap.scaleFactor)
      ctx.drawImage(off, sx, sy, sw, sh, active.x, active.y, active.w, active.h)
    }
  }, [cap, active])

  function normDrag(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
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
        if (e.button !== 0 || busy || !cap) return
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
      {/* 屏幕画面 */}
      <canvas
        ref={visibleRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ display: cap ? 'block' : 'none' }}
      />

      {/* 选区边框 */}
      {active && active.w > 2 && (
        <div
          className="pointer-events-none absolute border border-cyan-400"
          style={{ left: active.x, top: active.y, width: active.w, height: active.h }}
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
      {cap && !hasSelection && !drag && (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-lg bg-black/70 px-4 py-2 text-sm text-white">
          拖拽框选要查询的英文区域，Enter 确认，Esc 取消
        </div>
      )}
    </div>
  )
}
