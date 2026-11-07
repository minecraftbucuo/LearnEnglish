import { useEffect, useState } from 'react'
import type { AppSettings, PromptOverrides, ProviderConfig, ProviderTestResult } from '@shared/types'
import { DEFAULT_PROMPTS } from '@shared/default-prompts'

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
    chatModel: 'glm-4-flash',
    visionModel: 'glm-4v-flash'
  },
  {
    name: '火山方舟 (豆包)',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    chatModel: 'doubao-1-5-lite-32k-250115',
    visionModel: 'doubao-1-5-vision-lite-250315',
    disableThinking: true
  },
  {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    chatModel: 'deepseek-chat',
    visionModel: ''
  },
  {
    name: 'Moonshot Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    chatModel: 'moonshot-v1-8k',
    visionModel: 'moonshot-v1-8k-vision-preview'
  },
  {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o-mini',
    visionModel: 'gpt-4o-mini'
  }
]

const PROMPT_KEYS: [keyof PromptOverrides, string][] = [
  ['word', '单词讲解'],
  ['sentence', '句子讲解'],
  ['zhWord', '中文查词（中→英）'],
  ['zhSentence', '中文翻译（中→英）'],
  ['image', '截图讲解']
]

export function SettingsPage(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    void window.api.settingsGet().then(setSettings)
  }, [])

  // 文本框显示"当前生效"的提示词：有覆盖用覆盖，否则显示内置默认
  useEffect(() => {
    if (!settings) return
    setPromptDrafts(
      Object.fromEntries(
        PROMPT_KEYS.map(([k]) => [k, settings.prompts[k]?.trim() || DEFAULT_PROMPTS[k]])
      )
    )
  }, [settings])

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
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-base font-semibold text-zinc-100">设置</h1>
        {saved && (
          <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs text-teal-300">
            已保存 ✓
          </span>
        )}
      </div>

      <div className="max-w-3xl space-y-6">
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
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ['lookup', '查词（抓取选中文本）'],
                ['screenshot', '截图查询'],
                ['main', '打开主窗口']
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

        {/* 提示词微调 */}
        <Section
          title="提示词自定义"
          desc="自定义 AI 的讲解风格与结构。输出格式要求由程序自动附加，随便改不会弄坏划重点和复习功能；未改过即显示内置默认。"
        >
          <div className="space-y-4">
            {PROMPT_KEYS.map(([key, label]) => {
              const def = DEFAULT_PROMPTS[key]
              const draft = promptDrafts[key] ?? def
              const modified = draft.trim() !== def.trim()
              return (
                <label key={key} className="block">
                  <span className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-400">{label}</span>
                    {modified && (
                      <span className="rounded bg-amber-500/15 px-1.5 text-[10px] text-amber-300">
                        已自定义
                      </span>
                    )}
                    <span className="flex-1" />
                    {modified && (
                      <button
                        onClick={() => {
                          setPromptDrafts((d) => ({ ...d, [key]: def }))
                          void save({ prompts: { ...settings.prompts, [key]: '' } })
                        }}
                        className="text-[11px] text-zinc-500 transition hover:text-teal-300"
                      >
                        还原默认
                      </button>
                    )}
                  </span>
                  <textarea
                    value={draft}
                    onChange={(e) => setPromptDrafts((d) => ({ ...d, [key]: e.target.value }))}
                    onBlur={() =>
                      void save({
                        prompts: {
                          ...settings.prompts,
                          [key]: draft.trim() === def.trim() ? '' : draft
                        }
                      })
                    }
                    rows={8}
                    spellCheck={false}
                    className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2 font-mono text-[11px] leading-5 text-zinc-300 outline-none transition focus:border-teal-500"
                  />
                </label>
              )
            })}
          </div>
        </Section>
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
