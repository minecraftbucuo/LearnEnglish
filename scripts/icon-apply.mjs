// 把定稿图标（icon-final.mjs 的 book-lingual 设计）应用到应用：
//   build/icon.png + resources/icon.png（1024，electron-builder 用）
//   src/main/tray-icon.ts（32px 托盘图标 base64）
// 用法：node scripts/icon-apply.mjs
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { renderFinalIcon, encodePng } from './icon-final.mjs'

const { size, px } = renderFinalIcon()

// 应用图标 1024px
const iconPng = encodePng(size, px)
const root = path.resolve(import.meta.dirname, '..')
writeFileSync(path.join(root, 'build', 'icon.png'), iconPng)
writeFileSync(path.join(root, 'resources', 'icon.png'), iconPng)

// 托盘图标 32px（盒式平均降采样）
const T = 32
const block = size / T
const tray = Buffer.alloc(T * T * 4)
for (let ty = 0; ty < T; ty++) {
  for (let tx = 0; tx < T; tx++) {
    let r = 0, g = 0, b = 0, a = 0
    const x0 = Math.floor(tx * block)
    const y0 = Math.floor(ty * block)
    const x1 = Math.floor((tx + 1) * block)
    const y1 = Math.floor((ty + 1) * block)
    let n = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * size + x) * 4
        r += px[i]
        g += px[i + 1]
        b += px[i + 2]
        a += px[i + 3]
        n++
      }
    }
    const ti = (ty * T + tx) * 4
    tray[ti] = Math.round(r / n)
    tray[ti + 1] = Math.round(g / n)
    tray[ti + 2] = Math.round(b / n)
    tray[ti + 3] = Math.round(a / n)
  }
}
const b32 = encodePng(T, tray).toString('base64')
writeFileSync(
  path.join(root, 'src', 'main', 'tray-icon.ts'),
  `// 由 scripts/icon-apply.mjs 自动生成（源：icon-final.mjs 的 book-lingual 设计），勿手改\nexport const TRAY_ICON_BASE64 = '${b32}'\n`
)
console.log('applied: build/icon.png, resources/icon.png, src/main/tray-icon.ts')
