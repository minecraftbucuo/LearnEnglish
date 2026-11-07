// 本机数据占用统计（数据库 / 配置）
import { statSync } from 'node:fs'
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

export function getStorageInfo(): StorageInfo {
  const userData = app.getPath('userData')
  return {
    dataDir: userData,
    dbBytes: fileOrZero(path.join(userData, 'learn-english.db')),
    dbWalBytes:
      fileOrZero(path.join(userData, 'learn-english.db-wal')) +
      fileOrZero(path.join(userData, 'learn-english.db-shm')),
    configBytes:
      fileOrZero(path.join(userData, 'config.json')) +
      fileOrZero(path.join(userData, 'ui-prefs.json'))
  }
}
