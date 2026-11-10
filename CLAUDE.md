# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库概览

LearnEnglish：Electron 划词查词 + 间隔重复背单词桌面应用（Windows / Linux x64）。用户交流、提交信息、注释一律用中文。

## 常用命令

```bash
pnpm dev         # 开发模式（主进程热重启 + 渲染层 HMR）
pnpm typecheck   # 类型检查（node + web 两个 tsconfig）——改完代码必须先跑这个再谈"完成"
pnpm build       # 构建
pnpm dist        # 打包：Windows 出 NSIS，Linux 出 AppImage（输出 dist/）
```

没有测试框架，验证靠 `pnpm typecheck` + 用户手动跑 `pnpm dev` 实测。

## 架构大图

四层结构（electron-vite）：

- `src/main/` — 主进程。**lookup.ts 是核心编排器**：快捷键触发 → 抓词/截图 OCR → 弹窗 → AI 流式讲解 → 落库。会话存在 `sessions` Map（lookupId → 消息/上下文/状态，上限 30 个防泄漏）
- `src/renderer/src/popup/` — 查词弹窗 UI；`main-app/` — 主窗口（生词本/复习/设置）；`overlay/` — 截图框选层
- `src/preload/` — 唯一的 IPC 桥，类型定义在 `src/shared/api.ts` 的 `Api` 接口
- `src/shared/` — channels.ts（IPC 通道名）、types.ts、api.ts、prompt-cards.ts（默认提示词要求卡）

关键链路与约定：

- **弹窗是单例 BrowserWindow**（windows.ts）：关闭/失焦只是 `hide()`，内容留在渲染层；每次查询 `LOOKUP_START` 重置渲染层 UI——"只记一个、新查询顶替旧内容"就是靠单例天然实现的，Alt+W 找回 = 重新 show
- **嵌套查询**（弹窗内双击单词）：`createNestedLookup` 建独立会话，渲染层以卡片追加不重置弹窗；带 `context`（原句）时走「句中释义」
- **提示词**（prompts.ts）：用户可编辑的要求卡（设置页，存 settings）+ 程序强制追加的 `AI_DATA` JSON 输出约定拼成 system prompt。解析靠 `extractAiData`，结构化数据经 `sanitizeStructured` 清洗后落库
- **词/句类型**判定：`isZhContent` / `isZhShort`（shared/text、prompts.ts）。词条文本被修改时必须重算类型
- **数据库**（db.ts，better-sqlite3）：entries + review（SM-2）+ entry_chats。`upsertLookup` 按文本去重并 +1 次数

## 业务语义（用户定过的规则，不要"顺手优化"掉）

- **首答/追问判定**：按"会话里是否已有 assistant 回答"，**不能按消息条数**——句中释义会多带一条 context 系统消息，按条数会把首答误判成追问（这是修过的 bug）
- **句中释义正文不写词条缓存**：它针对特定句子，同词在另一句要重新生成；通用结构化释义照常落库
- **重新生成 = 一次真实查询**：查询次数 +1
- **缓存命中不调 API**：同文本重复查询直接显示上次讲解（标"⚡ 缓存"）
- **`updated_at` 只随真实 AI 查询更新**：划重点/暂停/改文本等操作不动时间戳
- **Windows 专属能力**（user32 抓词、GDI 抓屏）不可移植：Linux 划词降级为弹窗手动输入，截图查询禁用（`process.platform !== 'win32'` 分支）

## 工作模式（与用户协作的固定流程）

1. **先弄清意图再动手**：用户常先描述现象（"是不是 bug？"）——先排查给结论，不要上来就改代码。改 UI 交互前有歧义就问一次（如"双击句中单词用什么触发新模式"）
2. **改完必须 `pnpm typecheck`**，通过后才报告完成；实测由用户做，等用户确认（"没问题"）再提交
3. **不主动 commit**：等用户明确说"提交"。提交信息格式沿用 git log：`feat:|fix:|docs:|chore:|refactor: 中文标题`，正文说明动机与关键行为（为什么 + 是什么），不写空话
4. **发版流程**（用户说"发版/发布 x.y.z"时）：
   - `npm version patch --no-git-tag-version` 升 [package.json](package.json)，同步改 README 顶部版本徽章
   - 提交 `chore: bump version x.y.z`
   - `git tag -a vX.Y.Z`，**说明里写全自上个 tag 以来的所有更新**（新功能/修复/文档分类列出）
   - push master + push tag；tag 触发 CI（.github/workflows/release.yml）双平台打包并创建 **GitHub Draft Release**（electron-builder 默认 releaseType: draft），由用户手动 Publish——这是有意设计，别改成自动发布
5. **文档同步**：README 有「详细使用说明」一节，改用户可感知的行为（快捷键/交互/缓存语义）要同步更新；顶部快捷键表也要加
6. **主进程能做的不进渲染层**：结构化清洗、类型判定、落库时机都在 main；preload 只透传
