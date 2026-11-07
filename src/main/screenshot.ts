// 屏幕捕获（v2）：
// 首选 GDI BitBlt 直抓（Snipaste 同类方案，~30-50ms），失败时回退 desktopCapturer。
// 输出原始 RGBA 像素（不编码 PNG），经结构化克隆传给渲染层用 canvas 直接绘制。
import koffi from 'koffi'
import { desktopCapturer, screen, type Display } from 'electron'
import type { ScreenCapturePayload } from '@shared/types'

// ---------- GDI 绑定 ----------

const SM_XVIRTUALSCREEN = 76
const SM_YVIRTUALSCREEN = 77
const SM_CXVIRTUALSCREEN = 78
const SM_CYVIRTUALSCREEN = 79
const SRCCOPY_CAPTUREBLT = 0x40cc0020 // SRCCOPY | CAPTUREBLT

interface Gdi {
  getDC: (hwnd: null) => unknown
  createCompatibleDC: (dc: unknown) => unknown
  createCompatibleBitmap: (dc: unknown, w: number, h: number) => unknown
  selectObject: (dc: unknown, obj: unknown) => unknown
  bitBlt: (
    dst: unknown,
    x: number,
    y: number,
    w: number,
    h: number,
    src: unknown,
    sx: number,
    sy: number,
    rop: number
  ) => number
  getDIBits: (
    dc: unknown,
    bmp: unknown,
    start: number,
    lines: number,
    bits: Buffer,
    bi: Buffer,
    usage: number
  ) => number
  deleteObject: (obj: unknown) => number
  deleteDC: (dc: unknown) => number
  releaseDC: (hwnd: null, dc: unknown) => number
  getSystemMetrics: (index: number) => number
}

let gdi: Gdi | null = null
try {
  const user32 = koffi.load('user32.dll')
  const gdi32 = koffi.load('gdi32.dll')
  gdi = {
    getDC: user32.func('void *__stdcall GetDC(void *hwnd)'),
    releaseDC: user32.func('int32 __stdcall ReleaseDC(void *hwnd, void *dc)'),
    getSystemMetrics: user32.func('int32 __stdcall GetSystemMetrics(int32 index)'),
    createCompatibleDC: gdi32.func('void *__stdcall CreateCompatibleDC(void *dc)'),
    createCompatibleBitmap: gdi32.func('void *__stdcall CreateCompatibleBitmap(void *dc, int32 w, int32 h)'),
    selectObject: gdi32.func('void *__stdcall SelectObject(void *dc, void *obj)'),
    bitBlt: gdi32.func(
      'int32 __stdcall BitBlt(void *dst, int32 x, int32 y, int32 w, int32 h, void *src, int32 sx, int32 sy, uint32 rop)'
    ),
    getDIBits: gdi32.func(
      'int32 __stdcall GetDIBits(void *dc, void *bmp, uint32 start, uint32 lines, void *bits, void *bi, uint32 usage)'
    ),
    deleteObject: gdi32.func('int32 __stdcall DeleteObject(void *obj)'),
    deleteDC: gdi32.func('int32 __stdcall DeleteDC(void *dc)')
  }
  console.log('[screenshot] GDI 直抓已就绪')
} catch (err) {
  console.error('[screenshot] GDI 绑定失败，将使用 desktopCapturer:', err)
}

/** BGRA → RGBA（按 32 位字交换 R/B，速度快） */
function bgraToRgba(buf: Buffer, pixels: number): void {
  const px = new Uint32Array(buf.buffer, buf.byteOffset, pixels)
  for (let i = 0; i < px.length; i++) {
    const v = px[i]
    px[i] = (v & 0xff00ff00) | ((v >>> 16) & 0xff) | ((v & 0xff) << 16)
  }
}

function captureWithGDI(display: Display): ScreenCapturePayload {
  if (!gdi) throw new Error('GDI 不可用')
  const vx = gdi.getSystemMetrics(SM_XVIRTUALSCREEN)
  const vy = gdi.getSystemMetrics(SM_YVIRTUALSCREEN)
  const vw = gdi.getSystemMetrics(SM_CXVIRTUALSCREEN)
  const vh = gdi.getSystemMetrics(SM_CYVIRTUALSCREEN)
  if (vw <= 0 || vh <= 0 || vw > 16384 || vh > 16384) throw new Error('虚拟屏幕尺寸异常')

  const t0 = Date.now()
  const hdc = gdi.getDC(null)
  const mem = gdi.createCompatibleDC(hdc)
  const bmp = gdi.createCompatibleBitmap(hdc, vw, vh)
  let ok = false
  try {
    const old = gdi.selectObject(mem, bmp)
    try {
      ok = gdi.bitBlt(mem, 0, 0, vw, vh, hdc, vx, vy, SRCCOPY_CAPTUREBLT) !== 0
    } finally {
      gdi.selectObject(mem, old)
    }
    if (!ok) throw new Error('BitBlt 失败')

    // 32 位 top-down DIB
    const bi = Buffer.alloc(40)
    bi.writeUInt32LE(40, 0) // biSize
    bi.writeInt32LE(vw, 4) // biWidth
    bi.writeInt32LE(-vh, 8) // biHeight 负值 = 自上而下
    bi.writeUInt16LE(1, 12) // biPlanes
    bi.writeUInt16LE(32, 14) // biBitCount
    bi.writeUInt32LE(0, 16) // BI_RGB
    const buf = Buffer.allocUnsafe(vw * vh * 4)
    const lines = gdi.getDIBits(mem, bmp, 0, vh, buf, bi, 0)
    if (lines !== vh) throw new Error('GetDIBits 失败')
    bgraToRgba(buf, vw * vh)

    // 当前显示器在虚拟位图中的物理矩形（DIP 原点对齐 + 缩放换算）
    const displays = screen.getAllDisplays()
    const originX = Math.min(...displays.map((d) => d.bounds.x))
    const originY = Math.min(...displays.map((d) => d.bounds.y))
    const sf = display.scaleFactor
    const rect = {
      x: Math.round((display.bounds.x - originX) * sf),
      y: Math.round((display.bounds.y - originY) * sf),
      w: Math.round(display.bounds.width * sf),
      h: Math.round(display.bounds.height * sf)
    }
    if (
      rect.w <= 0 ||
      rect.h <= 0 ||
      rect.x < 0 ||
      rect.y < 0 ||
      rect.x + rect.w > vw ||
      rect.y + rect.h > vh
    ) {
      throw new Error('显示器矩形越界（混合 DPI？）')
    }

    console.log(`[screenshot] GDI ${vw}×${vh} 抓取 ${Date.now() - t0}ms`)
    return { buf: new Uint8Array(buf.buffer, buf.byteOffset, vw * vh * 4), width: vw, height: vh, rect, scaleFactor: sf }
  } finally {
    gdi.deleteObject(bmp)
    gdi.deleteDC(mem)
    gdi.releaseDC(null, hdc)
  }
}

async function captureWithDesktopCapturer(display: Display): Promise<ScreenCapturePayload> {
  const t0 = Date.now()
  const { size, scaleFactor } = display
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(size.width * scaleFactor),
      height: Math.round(size.height * scaleFactor)
    }
  })
  const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!src) throw new Error('无法获取屏幕画面')
  const img = src.thumbnail
  const { width, height } = img.getSize()
  const buf = Buffer.from(img.toBitmap()) // BGRA
  bgraToRgba(buf, width * height)
  console.log(`[screenshot] desktopCapturer ${width}×${height} 抓取 ${Date.now() - t0}ms`)
  return {
    buf: new Uint8Array(buf.buffer, buf.byteOffset, width * height * 4),
    width,
    height,
    rect: { x: 0, y: 0, w: width, h: height },
    scaleFactor
  }
}

export interface ScreenCapture {
  payload: ScreenCapturePayload
  display: Display
}

/** 截取鼠标所在显示器（在覆盖层显示之前调用，避免把覆盖层截进去） */
export async function captureDisplayImage(): Promise<ScreenCapture> {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  try {
    return { payload: captureWithGDI(display), display }
  } catch (err) {
    console.error('[screenshot] GDI 失败，回退 desktopCapturer:', err)
    return { payload: await captureWithDesktopCapturer(display), display }
  }
}
