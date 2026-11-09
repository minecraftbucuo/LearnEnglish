<div align="center">
  <img src="docs/banner.svg" alt="LearnEnglish" width="100%" />

  [![version](https://img.shields.io/badge/version-0.1.7-14b8a6?style=flat-square&labelColor=09090b)](https://github.com/minecraftbucuo/LearnEnglish/releases/latest)
  [![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-38bdf8?style=flat-square&labelColor=09090b&logo=windows&logoColor=38bdf8)](#-下载安装)
  [![Linux](https://img.shields.io/badge/Linux-x64-fcc624?style=flat-square&labelColor=09090b&logo=linux&logoColor=black)](#-下载安装)
  [![Electron](https://img.shields.io/badge/Electron-37-8b5cf6?style=flat-square&labelColor=09090b&logo=electron&logoColor=a78bfa)](https://www.electronjs.org/)
  [![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&labelColor=09090b&logo=react&logoColor=61dafb)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&labelColor=09090b&logo=typescript&logoColor=3178c6)](https://www.typescriptlang.org/)
  [![SQLite](https://img.shields.io/badge/SQLite-WAL-f59e0b?style=flat-square&labelColor=09090b&logo=sqlite&logoColor=f59e0b)](https://sqlite.org/)

  **在任意应用里选中英文，按 `Alt+Q`，AI 帮你把单词和句子讲透 —— 然后用间隔重复，科学地记进脑子。**

  [下载安装](#-下载安装) · [功能亮点](#-功能亮点) · [默认快捷键](#-默认快捷键) · [使用说明](#-详细使用说明) · [本地开发](#-本地开发)
</div>

---

## 🔄 一次完整的学习闭环

1. **随手查** — 浏览网页、读 PDF、看字幕时选中英文，`Alt+Q` 即刻弹出 AI 讲解卡片，不打断当前工作
2. **一键划** — 觉得值得记，`Ctrl+S` 划入生词本，完整的音标、例句、辨析随之存档
3. **科学记** — SM-2 间隔重复算法安排每天该复习什么，识记 + 拼写两种出题，认不认识由你自己评定

## ✨ 功能亮点

### 🔍 全局快捷查词 — `Alt+Q`

任意应用中选中文本，按快捷键自动抓取并调 AI 讲解：

- **单词**：音标、词性释义、英文释义、双语例句、搭配与近义词辨析
- **句子**：中文翻译、逐词精讲、语法结构分析
- 弹窗内可继续追问，`Esc` 关闭，`Ctrl+S` 划入重点

> **平台差异**：Windows 下自动抓取选中文本；Linux（Wayland）下弹出查询窗后手动输入单词查询（Linux 下自动抓取与截图查询在后续版本支持）。

### 📷 截图查询 — `Alt+X`（仅 Windows）

框选屏幕任意区域，视觉模型 OCR 后按词/句格式讲解。PDF 里的、图片里的、视频字幕里的英文，都能查。

### 📚 生词本 — `Alt+E`

搜索、筛选（词/句/重点）、随手笔记、朗读、暂停复习。查过的每一个词，都有完整的讲解存档。

### 🎯 间隔重复复习

Anki 同款 SM-2 算法，学新词 + 巩固旧词：

- **识记复习**：看单词回忆释义，三档自评（认识 / 模糊 / 不认识），没记住的卡本轮队尾重现
- **拼写复习**：看释义默写单词，不会拼点「不会拼」直接看讲解并回队尾
- 例句挖空提示 · 每日新卡上限 · 连续打卡 · 学习统计

### ⚙️ 多模型适配

一套 OpenAI 兼容配置通吃主流服务：**智谱 / 豆包 / DeepSeek / Kimi / OpenAI** 预设，提示词可微调，快捷键可自定义。

## ⌨️ 默认快捷键

| 快捷键 | 作用 |
| :---: | :--- |
| `Alt+Q` | 划词查询 |
| `Alt+X` | 截图查询 |
| `Alt+E` | 打开生词本 |
| `Alt+W` | 找回上一个查词弹窗（误点关闭后一键恢复；弹窗在时按下无效果） |
| `Ctrl+S` | 划入重点（查询弹窗内） |
| `Esc` | 关闭弹窗 |

> 快捷键冲突或手感不好？全部可以在 **设置** 里改。

## 📖 详细使用说明

### 查词弹窗（Alt+Q）

**发起查询**

- 任意应用选中文本按 `Alt+Q`：自动抓取并弹出 AI 讲解。单词按单词模板讲（音标/释义/例句/助记/拓展），句子按句子模板讲（翻译/词汇精讲/语法结构），程序自动判断
- 没抓到选中文本（部分应用禁止读剪贴板）会自动转**手动模式**：直接输入单词或句子回车即查
- Linux 下暂不支持自动抓词，`Alt+Q` 直接弹出手动查询窗

**弹窗内操作**

- **双击正文中的单词** → 在下方追加该词的讲解卡片（不顶掉当前内容）；弹窗内选中文本再按 `Alt+Q` 效果相同
- **双击句子讲解里的单词** → 自动变为「句中释义」：结合原句解释该词在句中的含义、词性与搭配（卡片带橙色「句中」徽标）。若该词之前查过、命中缓存，点卡片右上角 🔄 按原句重新生成
- **点标题文字** → 修正查询文本：抓取偶尔缺字母（如 shed light 抓成 Shed ligh），AI 往往能猜对但记录是错的，点标题改正即可；之后的 🔄 重新生成会按修正后的文本完整重查（词/句类型也会自动重判）
- **追问**：底部输入框回车即提问，进入自由交流模式（不再套讲解模板）；问答同步到生词本该词条的「追问 AI」记录
- **嵌套卡片自带输入框**：和那个词单独交流，问答记录在该词自己的词条下
- `Ctrl+S` 划入重点，再按取消；每个嵌套卡有独立的 ⭐
- `Esc` 先收起最上方的嵌套卡，全部收完再按才是关闭弹窗
- 标题栏 🔊 朗读（英文）、🔄 重新生成当前讲解（重新调用 AI，查询次数 +1）
- 弹窗四边可拉伸调整大小，尺寸自动记忆

**缓存机制**

- 同一文本再次查询时直接显示上次的讲解（标有「⚡ 缓存」），不重复调 API；点 🔄 强制重查
- 句中释义针对具体句子生成，不写入词条缓存——同一个词在另一句话里双击会得到新的句中释义

**弹窗"消失"了？**

- 默认**失焦自动隐藏**（设置里可关）：点别处弹窗就藏起来，不是关闭。按 `Alt+W` 原样找回（位置、内容都在），正在显示时按无效果；此时再查新词会顶替旧内容
- `Esc` 或 ✕ 才是真正收起

### 截图查询（Alt+X，仅 Windows）

按 `Alt+X` 进入框选模式 → 拖框选中屏幕任意区域 → 自动 OCR 识别文字，之后与普通查询完全同一条链路。适合 PDF、图片、视频字幕里不好选中的文本。`Esc` 取消框选。

### 生词本（Alt+E）

**列表与筛选**

- 顶部搜索框同时搜词条文本与笔记内容
- 筛选维度：词/句类型、⭐重点、复习状态（未学 / 今日新学 / 已学）、时间（今天 / 近 7 天 / 近 30 天 / 指定某天）
- 弹窗里查了新词，列表与打开着的详情会实时刷新

**词条详情（右侧面板，宽度可拖拽记忆）**

- **点标题可修改文本**：修正抓取缺漏的字母，保存时自动重判词/句类型；若改正后的文本与已有词条重复会先询问
- 🔄 重新查询：按词条文本重新调用 AI 讲解（流式显示、可取消），计入查询次数
- ⭐ 划重点 / ⏸ 暂停（不进复习队列）/ 🗑 删除（连同复习进度）
- 内容分块：意思栏（音标/释义）、完整讲解全文、查询上下文、追问 AI
- 「追问 AI」区可在详情页直接向 AI 提问，问答成对保存、可单条删除——弹窗里的追问也汇总在这里

### 间隔重复复习

- 开始前选**识记**或**拼写**模式
- **识记**：看单词回忆意思，认识 / 模糊 / 不认识三档自评；没记住的卡本轮队尾重现，直到记住
- **拼写**：看释义默写单词（含例句挖空提示）；不会拼点「不会拼」直接看讲解并回队尾。句子不进拼写队列
- SM-2 算法安排每日任务，每天新学卡数量在设置里调整；含连续打卡与学习统计

### 设置

- **AI 供应商**：预设智谱 / 豆包 / DeepSeek / Kimi / OpenAI，任一 OpenAI 兼容服务均可；思考型模型（doubao-seed / glm-4.5+ 等）可勾选「关闭深度思考」，首字延迟可从 ~9s 降到 ~1s
- **提示词要求卡**：讲解内容按卡片拼装（音标 / 释义 / 例句 / 助记 / 拓展……），勾选启用、点内容直接编辑（失焦保存），可还原单组或全部默认；结构化输出约定由程序自动追加，随便改不会破坏划重点 / 复习功能
- **全局快捷键**：点击输入框后按下组合键即录入新键
- **失焦隐藏 / 开机自启 / 黑白主题**
- **数据与存储**：查看各文件占用，一键打开数据文件夹

## 🚀 下载安装

**Windows**

1. 前往 [**Releases**](https://github.com/minecraftbucuo/LearnEnglish/releases/latest) 下载 `LearnEnglish Setup x.x.x.exe`
2. 双击安装，可自选安装目录

**Linux（x64）**

1. 前往 [**Releases**](https://github.com/minecraftbucuo/LearnEnglish/releases/latest) 下载 `LearnEnglish-x.x.x-x64.AppImage`
2. `chmod +x LearnEnglish-*.AppImage` 加执行权限后直接运行（部分发行版需安装 libfuse2）

**通用**

3. 首次启动进入 **设置**，填入任一 OpenAI 兼容服务的 API Key
4. 在任意应用里选个单词，按 `Alt+Q` ✨

## 🛠 本地开发

```bash
git clone https://github.com/minecraftbucuo/LearnEnglish.git
cd LearnEnglish
pnpm install     # 安装依赖（自动对 better-sqlite3 做 Electron ABI 重编译）
pnpm dev         # 开发模式（主进程热重启 + 渲染进程 HMR）
pnpm typecheck   # 类型检查
pnpm build       # 构建产物
pnpm dist        # 打包：Windows 出 NSIS 安装包，Linux 出 AppImage（输出到 dist/）
```

要求：Node.js ≥ 20、pnpm ≥ 9；Windows 10/11 或 Linux x64（X11 / KDE Wayland）。

## 🧱 技术栈

| 类别 | 技术 |
| :--- | :--- |
| 桌面框架 | Electron 37 |
| 构建工具 | electron-vite |
| 界面 | React 19 + Tailwind CSS 4 |
| 语言 | TypeScript 5.9 |
| 本地存储 | better-sqlite3（SQLite / WAL，零服务依赖） |
| 系统能力 | koffi 调用 Win32 API（Windows 划词抓取与抓屏；Linux 划词暂走手动输入） |

## 📁 数据与隐私

| 内容 | Windows | Linux |
| :--- | :--- | :--- |
| 数据库 | `%APPDATA%\LearnEnglish\learn-english.db` | `~/.config/LearnEnglish/learn-english.db` |
| 配置与 API Key | `%APPDATA%\LearnEnglish\config.json` | `~/.config/LearnEnglish/config.json` |
| 界面偏好 | `%APPDATA%\LearnEnglish\ui-prefs.json` | `~/.config/LearnEnglish/ui-prefs.json` |

> AI API Key 仅保存在本机 `config.json`。除你配置的 AI 服务外，应用不会向任何服务器发送数据。

---

<div align="center">

如果这个工具帮你记住了几个单词，欢迎给个 ⭐ Star

</div>
