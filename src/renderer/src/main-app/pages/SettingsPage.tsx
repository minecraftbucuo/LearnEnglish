import { useEffect, useState } from 'react'
import type {
  AppSettings,
  PromptCard,
  PromptCardSet,
  PromptKindKey,
  ProviderConfig,
  ProviderTestResult,
  StorageInfo
} from '@shared/types'
import { DEFAULT_PROMPT_CARDS, PROMPT_KIND_LABELS } from '@shared/prompt-cards'
import { fmtBytes } from '../../utils'

const PRESETS: {
  name: string
  baseURL: string
  chatModel: string
  visionModel: string
  disableThinking?: boolean
}[] = [
  {
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    chatModel: 'glm-5.2',
    visionModel: 'glm-4.5v'
  },
  {
    name: '火山方舟',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    chatModel: 'doubao-seed-2.0-mini',
    visionModel: '',
    disableThinking: true
  },
  {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    chatModel: 'deepseek-flash',
    visionModel: ''
  },
  {
    name: 'Moonshot Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    chatModel: 'kimi-k3.1-pro',
    visionModel: 'kimi-k3.1-pro'
  },
  {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    chatModel: 'gpt-6-astra',
    visionModel: 'gpt-6-astra'
  }
]

const PROMPT_KINDS = Object.keys(PROMPT_KIND_LABELS) as PromptKindKey[]

export function SettingsPage(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [storage, setStorage] = useState<StorageInfo | null>(null)

  useEffect(() => {
    void window.api.settingsGet().then(setSettings)
    void window.api.storageInfo().then(setStorage)
  }, [])

  if (!settings)
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">加载中…</div>

  async function save(patch: Partial<AppSettings>): Promise<void> {
    const next = await window.api.settingsSet(patch)
    setSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-base font-semibold text-zinc-100">设置</h1>
          {saved && (
            <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs text-teal-300">
              已保存 ✓
            </span>
          )}
        </div>

        {/* 单列居中，标准设置页布局 */}
        <div className="mx-auto max-w-3xl space-y-4">
        {/* AI 供应商 */}
        <Section
          title="AI 供应商"
          desc="任何 OpenAI 兼容 API 均可。文字查询用「对话模型」，截图查询用「视觉模型」（可留空则禁用截图查询）。"
        >
          <ProviderList
            providers={settings.providers}
            activeId={settings.activeProviderId}
            onChange={(providers, activeProviderId) => void save({ providers, activeProviderId })}
          />
        </Section>

        {/* 快捷键 */}
        <Section
          title="全局快捷键"
          desc="点击输入框后按下组合键即可录新。与系统/其他软件冲突时注册会失败，换一个即可。"
        >
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['lookup', '查词（抓取选中文本）'],
                ['screenshot', '截图查询'],
                ['main', '打开主窗口'],
                ['recover', '找回查词弹窗']
              ] as const
            ).map(([key, label]) => (
              <HotkeyInput
                key={key}
                label={label}
                value={settings.hotkeys[key]}
                onChange={(combo) => void save({ hotkeys: { ...settings.hotkeys, [key]: combo } })}
              />
            ))}
          </div>
        </Section>

        {/* 数据与存储 */}
        <Section title="数据与存储" desc="全部数据仅保存在本机：SQLite 数据库 + 配置文件。">
          <div className="space-y-1.5 text-sm text-zinc-300">
            <StorageRow
              label="数据库"
              detail="词条 / 复习进度 / 追问记录"
              value={fmtBytes((storage?.dbBytes ?? 0) + (storage?.dbWalBytes ?? 0))}
            />
            <StorageRow
              label="配置文件"
              detail="AI 配置 / 快捷键 / 主题"
              value={fmtBytes(storage?.configBytes ?? 0)}
            />
            <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2.5">
              <span className="text-xs text-zinc-500">合计</span>
              <span className="text-sm font-semibold text-zinc-100">
                {fmtBytes(
                  (storage?.dbBytes ?? 0) +
                    (storage?.dbWalBytes ?? 0) +
                    (storage?.configBytes ?? 0)
                )}
              </span>
            </div>
          </div>
          <button
            onClick={() => void window.api.openDataDir()}
            className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-teal-500 hover:text-teal-300"
          >
            📂 打开数据文件夹
          </button>
        </Section>

        {/* 外观 */}
        <Section title="外观" desc="黑色主题省电护眼，白色主题适合明亮环境。切换即时生效。">
          <div className="flex gap-2">
            {(
              [
                ['dark', '⬛ 黑色'],
                ['light', '⬜ 白色']
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => void save({ theme: value })}
                className={`rounded-lg border px-4 py-1.5 text-sm transition ${
                  settings.theme === value
                    ? 'border-teal-500 bg-teal-500/15 text-teal-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* 复习偏好 */}
        <Section title="复习偏好">
          <label className="flex items-center gap-3 text-sm text-zinc-300">
            每日新卡上限
            <input
              type="number"
              min={1}
              max={200}
              value={settings.dailyNew}
              onChange={(e) => void save({ dailyNew: Math.max(1, Number(e.target.value) || 20) })}
              className="w-20 rounded-lg border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-teal-500"
            />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.hideOnBlur}
              onChange={(e) => void save({ hideOnBlur: e.target.checked })}
              className="h-4 w-4 accent-teal-500"
            />
            查词弹窗失焦后自动隐藏
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={settings.autostart}
              onChange={(e) => void save({ autostart: e.target.checked })}
              className="h-4 w-4 accent-teal-500"
            />
            开机自启（仅安装版生效）
          </label>
        </Section>

        {/* 提示词组装 */}
        <PromptCardsSection settings={settings} save={save} />
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  desc,
  children
}: {
  title: string
  desc?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm shadow-black/30">
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      {desc && <p className="mb-3 mt-1 text-xs leading-5 text-zinc-500">{desc}</p>}
      <div className={desc ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

// ---------- 供应商管理 ----------

function ProviderList({
  providers,
  activeId,
  onChange
}: {
  providers: ProviderConfig[]
  activeId: string
  onChange: (providers: ProviderConfig[], activeId: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState<ProviderConfig | null>(null)
  const [testResult, setTestResult] = useState<Record<string, ProviderTestResult>>({})

  function commit(p: ProviderConfig): void {
    const exists = providers.some((x) => x.id === p.id)
    const next = exists ? providers.map((x) => (x.id === p.id ? p : x)) : [...providers, p]
    const nextActive = activeId || (next.length ? next[0].id : '')
    onChange(next, nextActive)
    setEditing(null)
  }

  function activate(id: string): void {
    onChange(providers, id)
  }

  function remove(id: string): void {
    const next = providers.filter((x) => x.id !== id)
    onChange(next, activeId === id ? (next[0]?.id ?? '') : activeId)
  }

  async function test(p: ProviderConfig, useVision: boolean): Promise<void> {
    const key = p.id + (useVision ? '_v' : '')
    setTestResult((m) => ({ ...m, [key]: { ok: true, message: '测试中…' } }))
    const r = await window.api.providerTest(p, useVision)
    setTestResult((m) => ({ ...m, [key]: r }))
  }

  return (
    <div className="space-y-2.5">
      {providers.length === 0 && !editing && (
        <div className="rounded-xl border border-dashed border-zinc-700 px-4 py-6 text-center text-xs text-zinc-500">
          还没有配置。点击下方「添加供应商」，选一个预设再填入 API Key 即可。
        </div>
      )}

      {providers.map((p) => {
        const active = p.id === activeId
        return (
          <div
            key={p.id}
            className={`rounded-xl border px-4 py-3 transition ${
              active ? 'border-teal-500/50 bg-teal-500/5' : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => activate(p.id)}
                className={`h-4 w-4 shrink-0 rounded-full border-2 transition ${
                  active ? 'border-teal-400 bg-teal-400' : 'border-zinc-600 hover:border-teal-400'
                }`}
                title={active ? '当前使用' : '设为默认'}
              />
              <span className="text-sm font-medium text-zinc-100">{p.name}</span>
              <span className="text-xs text-zinc-500">{p.chatModel}</span>
              {p.visionModel && (
                <span className="rounded bg-violet-500/15 px-1.5 text-[10px] text-violet-300">
                  👁 {p.visionModel}
                </span>
              )}
              <div className="flex-1" />
              <MiniBtn onClick={() => void test(p, false)}>测试文字</MiniBtn>
              {p.visionModel && <MiniBtn onClick={() => void test(p, true)}>测试视觉</MiniBtn>}
              <MiniBtn onClick={() => setEditing({ ...p })}>编辑</MiniBtn>
              <MiniBtn danger onClick={() => remove(p.id)}>
                删除
              </MiniBtn>
            </div>
            {(testResult[p.id] || testResult[`${p.id}_v`]) && (
              <div
                className={`mt-2 rounded-md px-2.5 py-1 text-xs ${
                  (testResult[p.id] ?? testResult[`${p.id}_v`]).ok
                    ? 'bg-teal-500/10 text-teal-300'
                    : 'bg-red-500/10 text-red-300'
                }`}
              >
                {testResult[p.id] && <span>文字：{testResult[p.id].message} </span>}
                {testResult[`${p.id}_v`] && <span>视觉：{testResult[`${p.id}_v`].message}</span>}
              </div>
            )}
          </div>
        )
      })}

      {editing ? (
        <ProviderForm
          initial={{ disableThinking: false, ...editing }}
          onCancel={() => setEditing(null)}
          onCommit={commit}
        />
      ) : (
        <button
          onClick={() =>
            setEditing({
              id: `p_${Date.now().toString(36)}`,
              name: '',
              baseURL: '',
              apiKey: '',
              chatModel: '',
              visionModel: ''
            })
          }
          className="rounded-lg border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-teal-500 hover:text-teal-300"
        >
          ＋ 添加供应商
        </button>
      )}
    </div>
  )
}

function ProviderForm({
  initial,
  onCommit,
  onCancel
}: {
  initial: ProviderConfig
  onCommit: (p: ProviderConfig) => void
  onCancel: () => void
}): React.JSX.Element {
  const [p, setP] = useState<ProviderConfig>(initial)
  const set = (patch: Partial<ProviderConfig>): void => setP((x) => ({ ...x, ...patch }))
  const valid = p.name.trim() && p.baseURL.trim() && p.apiKey.trim() && p.chatModel.trim()

  return (
    <div className="space-y-3 rounded-xl border border-teal-500/40 bg-teal-500/5 p-4">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((pre) => (
          <button
            key={pre.name}
            onClick={() =>
              set({ name: pre.name, baseURL: pre.baseURL, chatModel: pre.chatModel, visionModel: pre.visionModel })
            }
            className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 transition hover:border-teal-500 hover:text-teal-300"
          >
            {pre.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="名称">
          <input
            value={p.name}
            onChange={(e) => set({ name: e.target.value })}
            className={inputCls}
            placeholder="如：智谱"
          />
        </Field>
        <Field label="API Key">
          <input
            type="password"
            value={p.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
            className={inputCls}
            placeholder="sk-…"
          />
        </Field>
        <Field label="Base URL">
          <input
            value={p.baseURL}
            onChange={(e) => set({ baseURL: e.target.value })}
            className={inputCls}
            placeholder="https://…/v4"
          />
        </Field>
        <Field label="对话模型（查词）">
          <input
            value={p.chatModel}
            onChange={(e) => set({ chatModel: e.target.value })}
            className={inputCls}
            placeholder="glm-4-flash"
          />
        </Field>
        <Field label="视觉模型（截图查询，可留空）">
          <input
            value={p.visionModel ?? ''}
            onChange={(e) => set({ visionModel: e.target.value })}
            className={inputCls}
            placeholder="glm-4v-flash"
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={!!p.disableThinking}
          onChange={(e) => set({ disableThinking: e.target.checked })}
          className="h-4 w-4 accent-teal-500"
        />
        禁用深度思考（火山方舟 doubao-seed / 智谱 glm-4.5+ 等思考型模型建议开启，首字延迟可从 ~9s 降到 ~1s；不支持该参数的服务商会自动回退）
      </label>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
        >
          取消
        </button>
        <button
          disabled={!valid}
          onClick={() => onCommit(p)}
          className="rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-teal-500 disabled:opacity-40"
        >
          保存
        </button>
      </div>
    </div>
  )
}

// ---------- 快捷键录入 ----------

function HotkeyInput({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (combo: string) => void
}): React.JSX.Element {
  const [capturing, setCapturing] = useState(false)

  function onKeyDown(e: React.KeyboardEvent): void {
    if (!capturing) return
    e.preventDefault()
    if (e.key === 'Escape') {
      setCapturing(false)
      return
    }
    if (e.key === 'Backspace') {
      onChange('')
      setCapturing(false)
      return
    }
    const key = e.key
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return
    const parts: string[] = []
    if (e.ctrlKey) parts.push('CommandOrControl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    if (e.metaKey) parts.push('Super')
    let main = key.length === 1 ? key.toUpperCase() : key
    if (main === ' ') main = 'Space'
    if (parts.length === 0) return // 必须带修饰键
    onChange([...parts, main].join('+'))
    setCapturing(false)
  }

  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-500">{label}</span>
      <input
        readOnly
        value={capturing ? '按下组合键… (Esc 取消)' : value || '未设置'}
        onFocus={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
        onKeyDown={onKeyDown}
        className={`w-full cursor-pointer rounded-lg border px-3 py-1.5 text-sm outline-none transition ${
          capturing
            ? 'border-teal-500 bg-teal-500/10 text-teal-300'
            : 'border-zinc-800 bg-zinc-800/60 text-zinc-200'
        }`}
      />
    </label>
  )
}

// ---------- 提示词要求卡编辑器 ----------

function PromptCardsSection({
  settings,
  save
}: {
  settings: AppSettings
  save: (patch: Partial<AppSettings>) => Promise<void>
}): React.JSX.Element {
  const [kind, setKind] = useState<PromptKindKey>('word')
  // 文本输入先改本地草稿、失焦才落库，避免每个键都写盘/广播导致卡顿丢字
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const customized = !!settings.promptCards?.[kind]
  const cards = settings.promptCards?.[kind] ?? DEFAULT_PROMPT_CARDS[kind]
  const defaultIds = new Set(DEFAULT_PROMPT_CARDS[kind].map((c) => c.id))

  const draftKey = (cardId: string, field: 'title' | 'content'): string => `${kind}:${cardId}:${field}`
  const draftOf = (card: PromptCard, field: 'title' | 'content'): string =>
    drafts[draftKey(card.id, field)] ?? card[field]
  const setDraft = (cardId: string, field: 'title' | 'content', value: string): void =>
    setDrafts((d) => ({ ...d, [draftKey(cardId, field)]: value }))
  const commit = (card: PromptCard, field: 'title' | 'content'): void => {
    const value = draftOf(card, field)
    if (value !== card[field]) {
      setCardsLocal(cards.map((c) => (c.id === card.id ? { ...c, [field]: value } : c)))
    }
  }

  function setCardsLocal(next: PromptCard[]): void {
    void save({ promptCards: { ...(settings.promptCards ?? {}), [kind]: next } })
  }

  function updateCard(id: string, patch: Partial<PromptCard>): void {
    setCardsLocal(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function removeCard(id: string): void {
    setCardsLocal(cards.filter((c) => c.id !== id))
  }

  function addCard(): void {
    setCardsLocal([
      ...cards,
      { id: `c_${Date.now().toString(36)}`, title: '新要求', content: '', enabled: true }
    ])
  }

  function resetKind(): void {
    setDrafts({})
    const next: PromptCardSet = { ...(settings.promptCards ?? {}) }
    delete next[kind]
    void save({ promptCards: next })
  }

  return (
    <Section
      title="提示词组装"
      desc="勾选要包含的要求卡，内容用大白话写即可，程序会自动排版成完整提示词并附加输出格式约定，随便改不会弄坏划重点和复习功能。"
    >
      {/* 类型标签页 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {PROMPT_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 text-xs transition border ${
              kind === k
                ? 'border-teal-500 bg-teal-500/15 text-teal-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
            }`}
          >
            {PROMPT_KIND_LABELS[k]}
          </button>
        ))}
        <span className="flex-1" />
        {customized && <MiniBtn onClick={resetKind}>还原本组默认</MiniBtn>}
        {settings.promptCards && Object.keys(settings.promptCards).length > 0 && (
          <MiniBtn danger onClick={() => void save({ promptCards: {} })}>
            一键全部还原默认
          </MiniBtn>
        )}
      </div>

      {/* 卡片列表 */}
      <div className="space-y-2.5">
        {cards.map((card) => {
          const isCustom = !defaultIds.has(card.id)
          return (
            <div
              key={card.id}
              className={`rounded-xl border px-3.5 py-2.5 transition ${
                card.enabled
                  ? 'border-zinc-800 bg-zinc-900'
                  : 'border-zinc-800/60 bg-zinc-900/50 opacity-55'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={card.enabled}
                  disabled={card.locked}
                  onChange={(e) => updateCard(card.id, { enabled: e.target.checked })}
                  className="h-4 w-4 accent-teal-500"
                />
                {isCustom ? (
                  <input
                    value={draftOf(card, 'title')}
                    onChange={(e) => setDraft(card.id, 'title', e.target.value)}
                    onBlur={() => commit(card, 'title')}
                    placeholder="要求标题"
                    className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-xs font-medium text-zinc-200 outline-none focus:border-teal-500"
                  />
                ) : (
                  <span className="text-xs font-medium text-zinc-200">{card.title}</span>
                )}
                {card.locked && (
                  <span className="text-[10px] text-zinc-600" title="角色设定始终生效">
                    🔒 始终生效
                  </span>
                )}
                <span className="flex-1" />
                {isCustom && (
                  <MiniBtn danger onClick={() => removeCard(card.id)}>
                    删除
                  </MiniBtn>
                )}
              </div>
              <textarea
                value={draftOf(card, 'content')}
                onChange={(e) => setDraft(card.id, 'content', e.target.value)}
                onBlur={() => commit(card, 'content')}
                rows={2}
                placeholder="用大白话描述这个要求，例如：给出美式音标，标明词性和中文释义"
                spellCheck={false}
                className="mt-2 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-800/40 px-2.5 py-1.5 text-xs leading-5 text-zinc-300 outline-none transition placeholder:text-zinc-600 focus:border-teal-500"
              />
            </div>
          )
        })}
        <button
          onClick={addCard}
          className="rounded-lg border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-teal-500 hover:text-teal-300"
        >
          ＋ 添加要求卡
        </button>
      </div>
    </Section>
  )
}

function StorageRow({
  label,
  detail,
  value
}: {
  label: string
  detail: string
  value: string
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm text-zinc-200">{label}</div>
        <div className="text-[11px] text-zinc-500">{detail}</div>
      </div>
      <div className="text-sm tabular-nums text-zinc-400">{value}</div>
    </div>
  )
}

// ---------- 通用小组件 ----------

const inputCls =
  'w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-teal-500'

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-500">{label}</span>
      {children}
    </label>
  )
}

function MiniBtn({
  children,
  onClick,
  danger
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs transition ${
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  )
}
