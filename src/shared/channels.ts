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
  ENTRIES_CHANGED: 'entries:changed', // 词条有增删改（查询落库/划重点/手动操作），生词本等订阅刷新

  // 渲染进程 -> 主进程 invoke
  AI_START: 'ai:start',
  AI_NESTED_LOOKUP: 'ai:nestedLookup', // 弹窗内双击单词：创建嵌套查询会话
  AI_FOLLOWUP: 'ai:followup',
  AI_ABORT: 'ai:abort',
  STAR_CURRENT: 'star:current',
  ENTRIES_LIST: 'entries:list',
  ENTRY_GET: 'entry:get',
  ENTRY_TOGGLE_STAR: 'entry:toggleStar',
  ENTRY_TOGGLE_SUSPEND: 'entry:toggleSuspend',
  ENTRY_DELETE: 'entry:delete',
  ENTRY_UPDATE_TEXT: 'entry:updateText', // 修正词条文本（抓取缺漏字母时手动改正）
  ENTRY_CHAT_ASK: 'entry:chatAsk',
  ENTRY_CHAT_CHUNK: 'entry:chatChunk',
  ENTRY_CHAT_DONE: 'entry:chatDone',
  ENTRY_CHAT_ERROR: 'entry:chatError',
  ENTRY_CHAT_ABORT: 'entry:chatAbort',
  ENTRY_CHAT_LIST: 'entry:chatList',
  ENTRY_CHAT_DELETE: 'entry:chatDelete',
  ENTRY_RELOOKUP: 'entry:relookup', // 生词本详情：重新调用 AI 查询（流式回主窗口）
  ENTRY_RELOOKUP_CHUNK: 'entry:relookupChunk',
  ENTRY_RELOOKUP_DONE: 'entry:relookupDone',
  ENTRY_RELOOKUP_ERROR: 'entry:relookupError',
  ENTRY_RELOOKUP_ABORT: 'entry:relookupAbort',
  REVIEW_QUEUE: 'review:queue',
  REVIEW_PRACTICE_QUEUE: 'review:practiceQueue',
  REVIEW_ANSWER: 'review:answer',
  REVIEW_INTRODUCED: 'review:introduced',
  REVIEW_STATS: 'review:stats',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  PROVIDER_TEST: 'provider:test',
  STORAGE_INFO: 'storage:info',
  SCREENSHOT_CONFIRM: 'screenshot:confirm',
  SCREENSHOT_CANCEL: 'screenshot:cancel',
  APP_OPEN_MAIN: 'app:openMain',
  APP_HIDE_POPUP: 'app:hidePopup',
  APP_OPEN_DATA_DIR: 'app:openDataDir',
  APP_OPEN_EXTERNAL: 'app:openExternal',
  APP_LOOKUP_TEXT: 'app:lookupText',
} as const
