# LearnEnglish

Windows 桌面英语学习工具：**全局快捷键查词 → AI 讲解 → 一键划重点 → 间隔重复复习**，数据全部保存在本机。

## 功能

- **快捷查词** `Alt+Q`：在任意应用中选中文本，按快捷键自动抓取并调 AI 讲解
  - 单词：音标、词性释义、英文释义、例句（带翻译）、搭配与近义词辨析
  - 句子：中文翻译、逐词精讲、语法结构分析
  - 弹窗内可继续追问；`Esc` 关闭；`Ctrl+S` 划入重点
- **截图查询** `Alt+X`：框选屏幕任意区域，视觉模型 OCR 后按词/句格式讲解
- **生词本** `Alt+E`：搜索、筛选（词/句/来源/重点）、笔记、朗读、暂停复习
- **复习**（Anki 同款 SM-2 间隔重复）：卡片翻转 + 四档自评（忘记/困难/良好/简单）、每日新卡上限、拼写默写模式、连续打卡与统计
- **设置**：多套 OpenAI 兼容 API 配置（智谱 / 豆包 / DeepSeek / Kimi / OpenAI 预设）、快捷键自定义、提示词微调

## 开发

```bash
pnpm install     # 安装依赖（自动对 better-sqlite3 做 Electron ABI 重编译）
pnpm dev         # 开发模式（主进程热重启 + 渲染进程 HMR）
pnpm typecheck   # 类型检查
pnpm build       # 构建产物
pnpm dist        # 打包 NSIS 安装包（输出到 dist/）
```

要求：Node.js ≥ 20、pnpm ≥ 9。

## 技术栈

Electron 37 + electron-vite + React 19 + TypeScript + Tailwind CSS 4 + better-sqlite3（SQLite/WAL）+ koffi（Win32 SendInput 模拟 Ctrl+C 抓取选中文本）。

## 数据位置

- 数据库：`%APPDATA%\LearnEnglish\learn-english.db`
- 截图与配置：`%APPDATA%\LearnEnglish\`（`images/`、`config.json`）

AI API Key 仅保存在本机 `config.json`，不会上传。
