// IPC 通道名常量，主进程 / preload / 渲染进程统一引用，避免魔法字符串

export const CH = {
  // 主进程 -> 渲染进程 事件
  LOOKUP_START: 'lookup:start',
  LOOKUP_FAILED: 'lookup:failed',
  AI_CHUNK: 'ai:chunk',
  AI_DONE: 'ai:done',
  AI_ERROR: 'ai:error',
  OVERLAY_START: 'overlay:start',
  MAIN_NAVIGATE: 'main:navigate', // 主窗口切页（设置 / 生词本详情等）
  SETTINGS_CHANGED: 'settings:changed',

  // 渲染进程 -> 主进程 invoke
  AI_START: 'ai:start',
  AI_NESTED_LOOKUP: 'ai:nestedLookup', // 弹窗内双击单词：创建嵌套查询会话
  AI_FOLLOWUP: 'ai:followup',
  AI_ABORT: 'ai:abort',
  STAR_CURRENT: 'star:current',
  ENTRIES_LIST: 'entries:list',
  ENTRY_GET: 'entry:get',
  ENTRY_SET_NOTE: 'entry:setNote',
  ENTRY_TOGGLE_STAR: 'entry:toggleStar',
  ENTRY_TOGGLE_SUSPEND: 'entry:toggleSuspend',
  ENTRY_DELETE: 'entry:delete',
  ENTRY_IMAGE_DATA: 'entry:imageData',
  REVIEW_QUEUE: 'review:queue',
  REVIEW_ANSWER: 'review:answer',
  REVIEW_INTRODUCED: 'review:introduced',
  REVIEW_STATS: 'review:stats',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  PROVIDER_TEST: 'provider:test',
  SCREENSHOT_CONFIRM: 'screenshot:confirm',
  SCREENSHOT_CANCEL: 'screenshot:cancel',
  APP_OPEN_MAIN: 'app:openMain',
  APP_HIDE_POPUP: 'app:hidePopup',
  APP_QUIT: 'app:quit'
} as const
