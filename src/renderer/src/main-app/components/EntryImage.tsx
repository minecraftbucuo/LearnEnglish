import { useEffect, useState } from 'react'

/** 生词本详情中的截图缩略图（通过 IPC 读取 dataURL，绕过 CSP 对 file:// 的限制） */
export function EntryImage({ entryId }: { entryId: number }): React.JSX.Element | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void window.api.entryImageData(entryId).then((d) => {
      if (alive) setSrc(d)
    })
    return () => {
      alive = false
    }
  }, [entryId])
  if (!src) return null
  return (
    <div>
      <div className="mb-1.5 mt-1 text-xs font-semibold text-zinc-500">来源截图</div>
      <img src={src} alt="来源截图" className="max-h-56 w-auto rounded-lg border border-zinc-800" />
    </div>
  )
}
