// 本机数据占用统计（数据库 / 截图 / 配置）
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { StorageInfo } from '@shared/types'

function fileOrZero(p: string): number {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}

function dirStats(dir: string): { bytes: number; count: number } {
  let bytes = 0
  let count = 0
  if (!existsSync(dir)) return { bytes, count }
  for (const name of readdirSync(dir)) {
    try {
      bytes += statSync(path.join(dir, name)).size
      count++
    } catch {
      // 忽略读取失败的文件
    }
  }
  return { bytes, count }
}

export function getStorageInfo(): StorageInfo {
  const userData = app.getPath('userData')
  const img = dirStats(path.join(userData, 'images'))
  return {
    dataDir: userData,
    dbBytes: fileOrZero(path.join(userData, 'learn-english.db')),
    dbWalBytes:
      fileOrZero(path.join(userData, 'learn-english.db-wal')) +
      fileOrZero(path.join(userData, 'learn-english.db-shm')),
    imageCount: img.count,
    imageBytes: img.bytes,
    configBytes:
      fileOrZero(path.join(userData, 'config.json')) +
      fileOrZero(path.join(userData, 'ui-prefs.json'))
  }
}
