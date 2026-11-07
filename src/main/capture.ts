// 选中文本捕获：koffi 调 user32.SendInput 模拟 Ctrl+C，读取剪贴板后还原。
// koffi 加载失败时回退到 PowerShell SendKeys 方案（较慢，会打日志）。
import { clipboard, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import koffi from 'koffi'
import { getPopupWindow } from './windows'

const VK_CONTROL = 0x11
const VK_C = 0x43
const KEYEVENTF_KEYUP = 0x0002
// x64 下 sizeof(INPUT) = 40（type 4 + padding 4 + union 32）
const INPUT_SIZE = 40

type SendInputFn = (count: number, inputs: Buffer, size: number) => number

let sendInput: SendInputFn | null = null
try {
  const user32 = koffi.load('user32.dll')
  sendInput = user32.func(
    'uint32 __stdcall SendInput(uint32 count, void *inputs, int32 size)'
  ) as SendInputFn
  console.log('[capture] SendInput via koffi 已就绪')
} catch (err) {
  console.error('[capture] koffi 加载失败，将回退 PowerShell（较慢）:', err)
}

function keybdEvent(buf: Buffer, offset: number, vk: number, flags: number): void {
  buf.writeUInt32LE(1, offset) // INPUT_KEYBOARD
  buf.writeUInt16LE(vk, offset + 8) // wVk
  buf.writeUInt16LE(0, offset + 10) // wScan
  buf.writeUInt32LE(flags, offset + 12) // dwFlags
  buf.writeUInt32LE(0, offset + 16) // time
}

/** 通过 SendInput 发送 Ctrl+C（4 个事件：Ctrl↓ C↓ C↑ Ctrl↑） */
function pressCtrlCSendInput(): boolean {
  if (!sendInput) return false
  try {
    const buf = Buffer.alloc(INPUT_SIZE * 4)
    keybdEvent(buf, 0, VK_CONTROL, 0)
    keybdEvent(buf, 40, VK_C, 0)
    keybdEvent(buf, 80, VK_C, KEYEVENTF_KEYUP)
    keybdEvent(buf, 120, VK_CONTROL, KEYEVENTF_KEYUP)
    return sendInput(4, buf, INPUT_SIZE) === 4
  } catch (err) {
    console.error('[capture] SendInput 调用失败:', err)
    return false
  }
}

function pressCtrlCPowerShell(): void {
  const script =
    'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^c")'
  const ps = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, stdio: 'ignore' }
  )
  ps.unref()
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface CaptureResult {
  ok: boolean
  text: string
}

/**
 * 抓取当前前台应用中选中的文本。
 * 流程：隐藏自家弹窗 → 保存并清空剪贴板 → 模拟 Ctrl+C → 快速轮询 → 还原剪贴板。
 * 关键防呆：读到的文本必须与旧剪贴板内容不同，否则视为复制未生效（避免把历史复制内容当成选中文本）。
 */
export async function captureSelectedText(): Promise<CaptureResult> {
  const t0 = Date.now()
  // 若我们自己的窗口正持有焦点，先隐藏弹窗让焦点回到目标应用
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && focused === getPopupWindow()) {
    focused.hide()
  }

  const savedText = clipboard.readText()
  const savedImage = clipboard.readImage()
  const savedTextTrimmed = savedText.trim()

  clipboard.writeText('') // 清空以便检测复制是否成功
  if (!(sendInput && pressCtrlCSendInput())) pressCtrlCPowerShell()

  let text = ''
  const deadline = Date.now() + 450
  while (Date.now() < deadline) {
    await sleep(25)
    const current = clipboard.readText().trim()
    // 与旧内容相同 = 剪贴板管理器还原/复制未生效，不算抓到
    if (current && current !== savedTextTrimmed) {
      text = current
      break
    }
  }

  // 还原剪贴板（文本优先；仅有图片时还原图片）
  if (savedTextTrimmed) {
    clipboard.writeText(savedText)
  } else if (!savedImage.isEmpty()) {
    clipboard.writeImage(savedImage)
  } else {
    clipboard.clear()
  }

  console.log(
    `[capture] ok=${!!text} elapsed=${Date.now() - t0}ms len=${text.length}` +
      (savedTextTrimmed ? ' (已有剪贴板内容，已做比对)' : '')
  )
  return { ok: text.length > 0, text }
}
