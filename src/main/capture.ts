// 选中文本捕获（v2）：
// 1. 注入前先合成"松开 Alt/Shift/Win"，避免快捷键修饰键污染 Ctrl+C（Alt+Q 按住时注入会变成 Ctrl+Alt+C）
// 2. 用 GetClipboardSequenceNumber 检测复制是否真的发生——不清空剪贴板、无需还原、不误读旧内容
import { clipboard, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import koffi from 'koffi'
import { getPopupWindow } from './windows'

const VK_SHIFT = 0x10
const VK_CONTROL = 0x11
const VK_MENU = 0x12 // Alt
const VK_LWIN = 0x5b
const VK_RWIN = 0x5c
const VK_C = 0x43
const KEYEVENTF_KEYUP = 0x0002
const INPUT_SIZE = 40 // x64 sizeof(INPUT)

type SendInputFn = (count: number, inputs: Buffer, size: number) => number

let sendInput: SendInputFn | null = null
let getClipboardSeq: (() => number) | null = null
try {
  const user32 = koffi.load('user32.dll')
  sendInput = user32.func(
    'uint32 __stdcall SendInput(uint32 count, void *inputs, int32 size)'
  ) as SendInputFn
  getClipboardSeq = user32.func('uint32 __stdcall GetClipboardSequenceNumber()') as () => number
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

/**
 * 一次 SendInput 批量注入：Shift↑ Alt↑ Win↑ Win↑ Ctrl↓ C↓ C↑ Ctrl↑
 * 先抬起修饰键，保证目标应用收到的是纯粹的 Ctrl+C
 */
function pressCtrlC(): boolean {
  if (!sendInput) return false
  try {
    const events: [number, number][] = [
      [VK_SHIFT, KEYEVENTF_KEYUP],
      [VK_MENU, KEYEVENTF_KEYUP],
      [VK_LWIN, KEYEVENTF_KEYUP],
      [VK_RWIN, KEYEVENTF_KEYUP],
      [VK_CONTROL, 0],
      [VK_C, 0],
      [VK_C, KEYEVENTF_KEYUP],
      [VK_CONTROL, KEYEVENTF_KEYUP]
    ]
    const buf = Buffer.alloc(INPUT_SIZE * events.length)
    events.forEach(([vk, flags], i) => keybdEvent(buf, i * INPUT_SIZE, vk, flags))
    const ret = sendInput(events.length, buf, INPUT_SIZE)
    if (ret !== events.length) {
      console.warn(`[capture] SendInput 返回 ${ret}/${events.length}（可能被 UIPI 拦截，目标窗口是管理员权限？）`)
      return false
    }
    return true
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
 * 通过剪贴板序列号判断复制是否生效：序列号没变 = 复制失败（没选中/被拦截），绝不误读旧内容。
 */
export async function captureSelectedText(): Promise<CaptureResult> {
  const t0 = Date.now()
  const seq0 = getClipboardSeq ? getClipboardSeq() : -1

  // 防呆：若我们的弹窗正持有焦点，先隐藏，保证 Ctrl+C 落在目标应用上
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && focused === getPopupWindow()) {
    focused.hide()
  }

  const injected = pressCtrlC()
  if (!injected) pressCtrlCPowerShell()

  let text = ''
  let copied = false
  const deadline = Date.now() + 600
  while (Date.now() < deadline) {
    await sleep(20)
    if (getClipboardSeq) {
      if (getClipboardSeq() === seq0) continue // 剪贴板没变 = 复制还没发生
      copied = true
      await sleep(15) // 等应用写完剪贴板
    } else {
      copied = true // 无序列号可用（理论不会发生），退化为盲读
    }
    text = clipboard.readText().trim()
    break
  }

  console.log(
    `[capture] ok=${!!text} copied=${copied} elapsed=${Date.now() - t0}ms len=${text.length}` +
      (copied && !text ? '（剪贴板更新了但不是文本）' : '')
  )
  return { ok: text.length > 0, text }
}
