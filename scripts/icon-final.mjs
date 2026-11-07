// 最终图标：Lucide book-open 基础上定制（左页 A / 右页 文 = 学英语），文A翻译图标做备选
// 用法：node scripts/icon-final.mjs   （输出到 icon-previews/）
import { deflateSync } from 'node:zlib'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'

let crcTable = null
function crc32(buf) {
  if (!crcTable) {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    crcTable = t
  }
  let c = 0 ^ -1
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff]
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const SIZE = 1024
const CORNER = 0.22

function inBg(nx, ny) {
  const dx = Math.max(Math.abs(nx - 0.5) - (0.5 - CORNER), 0)
  const dy = Math.max(Math.abs(ny - 0.5) - (0.5 - CORNER), 0)
  return dx * dx + dy * dy <= CORNER * CORNER
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mix = (c1, c2, t) => c1.map((v, i) => v * (1 - t) + c2[i] * t)

function background(fromHex, toHex) {
  const from = hex(fromHex)
  const to = hex(toHex)
  const px = Buffer.alloc(SIZE * SIZE * 4)
  const offsets = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75]
  ]
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0, g = 0, b = 0, a = 0, cnt = 0
      for (const [ox, oy] of offsets) {
        const nx = (x + ox) / SIZE
        const ny = (y + oy) / SIZE
        if (!inBg(nx, ny)) continue
        const c = mix(from, to, Math.min(1, Math.max(0, (nx * 0.7071 + ny * 0.7071 - 0.3) / 0.9)))
        r += c[0]
        g += c[1]
        b += c[2]
        a += 255
        cnt++
      }
      const i = (y * SIZE + x) * 4
      if (cnt > 0) {
        px[i] = Math.round(r / cnt)
        px[i + 1] = Math.round(g / cnt)
        px[i + 2] = Math.round(b / cnt)
        px[i + 3] = Math.round(a / cnt)
      }
    }
  }
  return px
}

function rasterizeSvg(svgText, width) {
  const resvg = new Resvg(svgText, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true }
  })
  const img = resvg.render()
  return { width: img.width, height: img.height, pixels: img.pixels }
}

function composite(bg, fg, offsetX, offsetY) {
  for (let y = 0; y < fg.height; y++) {
    for (let x = 0; x < fg.width; x++) {
      const fi = (y * fg.width + x) * 4
      const a = fg.pixels[fi + 3] / 255
      if (a <= 0) continue
      const bx = offsetX + x
      const by = offsetY + y
      if (bx < 0 || by < 0 || bx >= SIZE || by >= SIZE) continue
      const bi = (by * SIZE + bx) * 4
      bg[bi] = Math.round(fg.pixels[fi] * a + bg[bi] * (1 - a))
      bg[bi + 1] = Math.round(fg.pixels[fi + 1] * a + bg[bi + 1] * (1 - a))
      bg[bi + 2] = Math.round(fg.pixels[fi + 2] * a + bg[bi + 2] * (1 - a))
      bg[bi + 3] = Math.max(bg[bi + 3], fg.pixels[fi + 3])
    }
  }
}

/** 从 lucide-static 的 SVG 里取出内部内容（可能有 XML 声明头与多行属性，需定位 <svg 标签） */
function innerOf(svgPath) {
  const s = readFileSync(svgPath, 'utf8')
  const start = s.indexOf('<svg')
  const openEnd = s.indexOf('>', start)
  const end = s.lastIndexOf('</svg>')
  return s.slice(openEnd + 1, end)
}

const outDir = path.resolve(import.meta.dirname, '..', 'icon-previews')
mkdirSync(outDir, { recursive: true })

const BG = ['#0EA5E9', '#14B8A6']
const bookOpenInner = innerOf('node_modules/lucide-static/icons/book-open.svg')

// 主推：打开的书 + 左页 A / 右页 文（中英对照 = 学英语）
const bookLingual = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
${bookOpenInner}
<text x="7.1" y="11.6" font-size="5" font-weight="700" fill="#ffffff" stroke="none" text-anchor="middle" font-family="Arial, sans-serif">A</text>
<text x="16.9" y="11.6" font-size="5" font-weight="700" fill="#ffffff" stroke="none" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif">文</text>
</svg>`

// 备选：Lucide 官方「文A 翻译」图标
const languagesSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
${innerOf('node_modules/lucide-static/icons/languages.svg')}
</svg>`

const CANDIDATES = [
  { name: 'final-book-lingual', svg: bookLingual },
  { name: 'final-languages', svg: languagesSvg }
]

for (const cand of CANDIDATES) {
  const bg = background(BG[0], BG[1])
  const fgWidth = Math.round(SIZE * 0.6)
  const fg = rasterizeSvg(cand.svg, fgWidth)
  composite(bg, fg, Math.round((SIZE - fg.width) / 2), Math.round((SIZE - fg.height) / 2))
  writeFileSync(path.join(outDir, `icon-${cand.name}.png`), encodePng(SIZE, bg))
  console.log(`generated icon-${cand.name}.png`)
}

/** 定稿图标（book-lingual）的 RGBA 像素，供 icon-apply.mjs 生成应用/托盘图标 */
export function renderFinalIcon() {
  const bg = background(BG[0], BG[1])
  const fgWidth = Math.round(SIZE * 0.6)
  const fg = rasterizeSvg(bookLingual, fgWidth)
  composite(bg, fg, Math.round((SIZE - fg.width) / 2), Math.round((SIZE - fg.height) / 2))
  return { size: SIZE, px: bg }
}
export { encodePng }
