import { desktopCapturer, screen, type Display } from 'electron'

export interface ScreenCapture {
  dataUrl: string // PNG dataURL（物理像素分辨率）
  display: Display
  scaleFactor: number
}

/** 截取鼠标所在显示器（在覆盖层显示之前调用，避免把覆盖层截进去） */
export async function captureDisplayImage(): Promise<ScreenCapture> {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
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
  return { dataUrl: src.thumbnail.toDataURL(), display, scaleFactor }
}
