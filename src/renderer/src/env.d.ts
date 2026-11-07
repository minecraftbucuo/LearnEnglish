/// <reference types="vite/client" />
import type { Api } from '@shared/api'

declare global {
  // 构建时由 electron.vite.config.ts 的 define 从 package.json 注入
  const __APP_VERSION__: string
  interface Window {
    api: Api
  }
}

export {}
