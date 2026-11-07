// 屏幕区域捕获（v3，Snipaste 式）：
// Alt+X 时不做全屏抓取——覆盖层直接盖在活屏幕上框选；
// 确认时才对选中的那一小块做 GDI BitBlt（毫秒级）并编码 PNG。
import koffi from 'koffi'
import { encodePngRGBA } from './png'

const SRCCOPY_CAPTUREBLT = 0x40cc0020 // SRCCOPY | CAPTUREBLT

interface Gdi {
  getDC: (hwnd: null) => unknown
  releaseDC: (hwnd: null, dc: unknown) => unknown
  getWindowRect: (hwnd: bigint, rect: Buffer) => number
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
}

let gdi: Gdi | null = null
try {
  const user32 = koffi.load('user32.dll')
  const gdi32 = koffi.load('gdi32.dll')
  gdi = {
    getDC: user32.func('void *__stdcall GetDC(void *hwnd)'),
    releaseDC: user32.func('int32 __stdcall ReleaseDC(void *hwnd, void *dc)'),
    getWindowRect: user32.func('int32 __stdcall GetWindowRect(uint64 hwnd, void *rect)'),
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
  console.error('[screenshot] GDI 绑定失败:', err)
}

export function isGdiReady(): boolean {
  return gdi !== null
}

/** BGRA → RGBA（按 32 位字交换 R/B） */
function bgraToRgba(buf: Buffer, pixels: number): void {
  const px = new Uint32Array(buf.buffer, buf.byteOffset, pixels)
  for (let i = 0; i < px.length; i++) {
    const v = px[i]
    px[i] = (v & 0xff00ff00) | ((v >>> 16) & 0xff) | ((v & 0xff) << 16)
  }
}

export interface RegionCapture {
  png: Buffer
  dataUrl: string
  width: number
  height: number
}

/**
 * 按物理屏幕坐标抓取一块区域。
 * 用覆盖层窗口自身的 GetWindowRect（物理坐标）做定位基准，避开混合 DPI 的坐标系换算问题。
 */
export function captureRegionByHwnd(
  hwndBuf: Buffer,
  sf: number,
  sel: { x: number; y: number; w: number; h: number }
): RegionCapture {
  if (!gdi) throw new Error('GDI 不可用')
  const rect = Buffer.alloc(16)
  const hwnd = hwndBuf.readBigUInt64LE(0)
  if (gdi.getWindowRect(hwnd, rect) === 0) throw new Error('GetWindowRect 失败')
  const winX = rect.readInt32LE(0)
  const winY = rect.readInt32LE(4)

  const t0 = Date.now()
  const w = Math.max(1, Math.min(Math.round(sel.w * sf), 8192))
  const h = Math.max(1, Math.min(Math.round(sel.h * sf), 8192))
  const sx = winX + Math.round(sel.x * sf)
  const sy = winY + Math.round(sel.y * sf)

  const hdc = gdi.getDC(null)
  const mem = gdi.createCompatibleDC(hdc)
  const bmp = gdi.createCompatibleBitmap(hdc, w, h)
  try {
    const old = gdi.selectObject(mem, bmp)
    try {
      if (gdi.bitBlt(mem, 0, 0, w, h, hdc, sx, sy, SRCCOPY_CAPTUREBLT) === 0) {
        throw new Error('BitBlt 失败')
      }
    } finally {
      gdi.selectObject(mem, old)
    }
    const bi = Buffer.alloc(40)
    bi.writeUInt32LE(40, 0)
    bi.writeInt32LE(w, 4)
    bi.writeInt32LE(-h, 8) // 负值 = 自上而下
    bi.writeUInt16LE(1, 12)
    bi.writeUInt16LE(32, 14)
    const buf = Buffer.allocUnsafe(w * h * 4)
    const lines = gdi.getDIBits(mem, bmp, 0, h, buf, bi, 0)
    if (lines !== h) throw new Error('GetDIBits 失败')
    bgraToRgba(buf, w * h)
    const png = encodePngRGBA(w, h, buf)
    console.log(`[screenshot] 区域 ${w}×${h} 抓取+编码 ${Date.now() - t0}ms`)
    return { png, dataUrl: `data:image/png;base64,${png.toString('base64')}`, width: w, height: h }
  } finally {
    gdi.deleteObject(bmp)
    gdi.deleteDC(mem)
    gdi.releaseDC(null, hdc)
  }
}
