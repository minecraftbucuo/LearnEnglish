// 程序化生成应用图标（圆角渐变方块 + 白色字母 E），零依赖。
// 运行：node scripts/gen-icon.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

function crc32(buf) {
  if (!crc32.table) {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    crc32.table = t
  }
  let c = 0 ^ -1
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crc32.table[(c ^ buf[i]) & 0xff]
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
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// 字母 E 的四条横竖条（0..1 归一化坐标 [x0,y0,x1,y1]）
const BARS = [
  [0.328, 0.293, 0.707, 0.391], // 上横
  [0.328, 0.461, 0.672, 0.559], // 中横
  [0.328, 0.629, 0.707, 0.727], // 下横
  [0.328, 0.293, 0.426, 0.727] // 竖笔
]
const CORNER = 0.1875 // 圆角半径（归一化，= 96/512）

function inLetter(nx, ny) {
  return BARS.some(([x0, y0, x1, y1]) => nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1)
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4)
  // 2x2 超采样抗锯齿
  const offsets = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75]
  ]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, cnt = 0
      for (const [ox, oy] of offsets) {
        const nx = (x + ox) / size
        const ny = (y + oy) / size
        const dx = Math.max(Math.abs(nx - 0.5) - (0.5 - CORNER), 0)
        const dy = Math.max(Math.abs(ny - 0.5) - (0.5 - CORNER), 0)
        if (dx * dx + dy * dy > CORNER * CORNER) continue
        const t = (nx + ny) / 2
        let cr = 0x3b + (0x06 - 0x3b) * t
        let cg = 0x82 + (0xb6 - 0x82) * t
        let cb = 0xf6 + (0xd4 - 0xf6) * t
        if (inLetter(nx, ny)) {
          cr = 255
          cg = 255
          cb = 255
        }
        r += cr
        g += cg
        b += cb
        a += 255
        cnt++
      }
      const i = (y * size + x) * 4
      if (cnt > 0) {
        px[i] = Math.round(r / cnt)
        px[i + 1] = Math.round(g / cnt)
        px[i + 2] = Math.round(b / cnt)
        px[i + 3] = Math.round(a / cnt)
      }
    }
  }
  return encodePng(size, px)
}

const root = path.resolve(import.meta.dirname, '..')
mkdirSync(path.join(root, 'resources'), { recursive: true })
mkdirSync(path.join(root, 'build'), { recursive: true })
mkdirSync(path.join(root, 'src', 'main'), { recursive: true })

writeFileSync(path.join(root, 'resources', 'icon.png'), drawIcon(512))
writeFileSync(path.join(root, 'build', 'icon.png'), drawIcon(512))
const b32 = drawIcon(32).toString('base64')
writeFileSync(
  path.join(root, 'src', 'main', 'tray-icon.ts'),
  `// 由 scripts/gen-icon.mjs 自动生成，勿手改\nexport const TRAY_ICON_BASE64 = '${b32}'\n`
)
console.log('icons generated: resources/icon.png, build/icon.png, src/main/tray-icon.ts')
