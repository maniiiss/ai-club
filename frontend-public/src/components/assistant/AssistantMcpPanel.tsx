import { CheckCircle2, Eye, EyeOff, Plug, RefreshCw, ShieldCheck, Trash2, Wrench, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/src/components/common/Button'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import { Input } from '@/src/components/common/Input'
import { Select } from '@/src/components/common/Select'
import {
  createAssistantMcpServer,
  deleteAssistantMcpServer,
  listAssistantMcpServers,
  retestAssistantMcpServer,
  setAssistantMcpServerEnabled,
  testAssistantMcpServer,
  updateAssistantMcpServer,
} from '@/src/api/assistant'
import { getErrorMessage } from '@/src/lib/utils'
import type { AssistantMcpConnectionTestResult, AssistantMcpServerPayload, AssistantMcpServerSummary } from '@/src/types/assistant'

interface AssistantMcpPanelProps {
  onClose: () => void
}

interface McpFormState {
  name: string
  endpointUrl: string
  authType: string
  credential: string
  enabled: boolean
  toolConfirmationOverrides: Record<string, boolean>
  toolEnabledOverrides: Record<string, boolean>
}

const emptyForm: McpFormState = {
  name: '',
  endpointUrl: '',
  authType: 'NONE',
  credential: '',
  enabled: true,
  toolConfirmationOverrides: {},
  toolEnabledOverrides: {},
}

/** 为新发现的工具补齐默认确认策略，同时保留用户已经做过的逐工具选择。 */
const mergeToolConfirmationDefaults = (
  tools: AssistantMcpConnectionTestResult['tools'],
  current: Record<string, boolean>,
) => tools.reduce<Record<string, boolean>>((result, tool) => {
  result[tool.name] = Object.prototype.hasOwnProperty.call(current, tool.name)
    ? current[tool.name]
    : tool.requiresConfirm || !tool.readOnly
  return result
}, { ...current })

/** 为新发现的工具补齐启用状态，默认沿用服务端发现结果或保持启用。 */
const mergeToolEnabledDefaults = (
  tools: AssistantMcpConnectionTestResult['tools'],
  current: Record<string, boolean>,
) => tools.reduce<Record<string, boolean>>((result, tool) => {
  result[tool.name] = Object.prototype.hasOwnProperty.call(current, tool.name)
    ? current[tool.name]
    : tool.enabled
  return result
}, { ...current })

/**
 * GitPilot 外部 MCP 管理面板。
 * 业务意图：用户在助手上下文内完成个人 MCP 的测试、发现、启停和凭证轮换。
 */
export const AssistantMcpPanel = ({ onClose }: AssistantMcpPanelProps) => {
  const [servers, setServers] = useState<AssistantMcpServerSummary[]>([])
  const [form, setForm] = useState<McpFormState>(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [showCredential, setShowCredential] = useState(false)
  const [testResult, setTestResult] = useState<AssistantMcpConnectionTestResult | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AssistantMcpServerSummary | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setServers(await listAssistantMcpServers())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const toPayload = (): AssistantMcpServerPayload => ({
    name: form.name.trim(),
    endpointUrl: form.endpointUrl.trim(),
    transport: 'AUTO',
    authType: form.authType,
    credential: form.credential,
    enabled: form.enabled,
    toolConfirmationOverrides: form.toolConfirmationOverrides,
    toolEnabledOverrides: form.toolEnabledOverrides,
  })

  const testForm = async () => {
    setWorking(true)
    setError('')
    setTestResult(null)
    try {
      const result = await testAssistantMcpServer(toPayload())
      setTestResult(result)
      setForm((current) => ({
        ...current,
        toolConfirmationOverrides: mergeToolConfirmationDefaults(result.tools, current.toolConfirmationOverrides),
        toolEnabledOverrides: mergeToolEnabledDefaults(result.tools, current.toolEnabledOverrides),
      }))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  const save = async () => {
    setWorking(true)
    setError('')
    try {
      const saved = editingId == null
        ? await createAssistantMcpServer(toPayload())
        : await updateAssistantMcpServer(editingId, toPayload())
      setServers((current) => editingId == null
        ? [...current, saved]
        : current.map((item) => item.id === saved.id ? saved : item))
      setForm(emptyForm)
      setEditingId(null)
      setTestResult(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  const edit = (server: AssistantMcpServerSummary) => {
    setEditingId(server.id)
    setForm({
      name: server.name,
      endpointUrl: server.endpointUrl,
      authType: server.authType,
      credential: '',
      enabled: server.enabled,
      toolConfirmationOverrides: Object.fromEntries(server.tools.map((tool) => [tool.name, tool.requiresConfirm])),
      toolEnabledOverrides: Object.fromEntries(server.tools.map((tool) => [tool.name, tool.enabled])),
    })
    setTestResult(null)
    setError('')
  }

  const editingServer = editingId == null ? null : servers.find((server) => server.id === editingId) || null
  const configurableTools = testResult?.tools || editingServer?.tools || []

  const toggle = async (server: AssistantMcpServerSummary) => {
    setTestingId(server.id)
    setError('')
    try {
      const next = await setAssistantMcpServerEnabled(server.id, !server.enabled)
      setServers((current) => current.map((item) => item.id === next.id ? next : item))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setTestingId(null)
    }
  }

  const retest = async (server: AssistantMcpServerSummary) => {
    setTestingId(server.id)
    setError('')
    try {
      const next = await retestAssistantMcpServer(server.id)
      setServers((current) => current.map((item) => item.id === next.id ? next : item))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setTestingId(null)
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    setWorking(true)
    try {
      await deleteAssistantMcpServer(deleteTarget.id)
      setServers((current) => current.filter((item) => item.id !== deleteTarget.id))
      if (editingId === deleteTarget.id) { setEditingId(null); setForm(emptyForm) }
      setDeleteTarget(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--color-border-light)] px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text-primary)]"><Plug className="h-4 w-4 text-[var(--color-primary)]" />外部 MCP 服务</div>
          <div className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">仅当前账号可用；凭证由平台加密托管。</div>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onClose} icon={<X className="h-3.5 w-3.5" />}>返回</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">外部 MCP 仅注入新 Runtime 会话；如果当前 GitPilot 仍使用 HERMES_LEGACY，服务不会出现在模型工具目录中。</div>
        <div className="mb-4 rounded-xl border border-[var(--color-border-light)] bg-[var(--color-bg-hover)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">{editingId == null ? '添加 MCP 服务' : '编辑 MCP 服务'}</div>
            {editingId != null && <button type="button" className="text-[12px] text-[var(--color-text-tertiary)]" onClick={() => { setEditingId(null); setForm(emptyForm); setTestResult(null) }}>取消编辑</button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="服务名称" value={form.name} placeholder="例如：公司知识库" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <Input label="MCP 地址" value={form.endpointUrl} placeholder="https://example.com/mcp" onChange={(event) => setForm((current) => ({ ...current, endpointUrl: event.target.value }))} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Select label="认证方式" value={form.authType} onChange={(value) => setForm((current) => ({ ...current, authType: value }))} options={[{ value: 'NONE', label: '无认证' }, { value: 'BEARER', label: 'Bearer' }, { value: 'API_KEY', label: 'API Key' }]} />
            <Input label={form.authType === 'API_KEY' ? 'API Key' : '访问令牌'} type={showCredential ? 'text' : 'password'} value={form.credential} placeholder={editingId == null ? '请输入凭证' : '留空表示不修改'} icon={showCredential ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} onChange={(event) => setForm((current) => ({ ...current, credential: event.target.value }))} />
          </div>
          {configurableTools.length > 0 && <div className="mt-3 rounded-lg border border-[var(--color-border-light)] bg-white p-3">
            <div className="text-[12px] font-semibold text-[var(--color-text-primary)]">工具启用与确认策略</div>
            <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">默认所有工具都需要确认；取消勾选表示你确认该工具可自动调用。建议仅对确定不会写入数据的查询工具取消勾选。</div>
            <div className="mt-2 flex items-center gap-2 pl-2 text-[11px] text-[var(--color-text-tertiary)]"><span className="w-4">启用</span><span className="w-4">确认</span><span>工具策略</span></div>
            <div className="mt-2 space-y-2">
              {configurableTools.map((tool) => {
                const requiresConfirm = form.toolConfirmationOverrides[tool.name] ?? tool.requiresConfirm
                const toolEnabled = form.toolEnabledOverrides[tool.name] ?? tool.enabled
                return <div key={tool.name} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--color-bg-hover)]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                    checked={toolEnabled}
                    aria-label={`启用 ${tool.name}`}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      toolEnabledOverrides: { ...current.toolEnabledOverrides, [tool.name]: event.target.checked },
                    }))}
                  />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={requiresConfirm}
                    aria-label={`确认 ${tool.name}`}
                    className={`mt-0.5 h-4 w-7 rounded-full p-0.5 transition-colors ${requiresConfirm ? 'bg-[var(--color-primary)]' : 'bg-gray-300'}`}
                    onClick={() => setForm((current) => ({
                      ...current,
                      toolConfirmationOverrides: { ...current.toolConfirmationOverrides, [tool.name]: !requiresConfirm },
                    }))}
                  ><span className={`block h-3 w-3 rounded-full bg-white transition-transform ${requiresConfirm ? 'translate-x-3' : 'translate-x-0'}`} /></button>
                  <span className="min-w-0 text-[12px] text-[var(--color-text-secondary)]"><span className="font-medium text-[var(--color-text-primary)]">{tool.name}</span><span className="ml-1">{toolEnabled ? '· 已启用' : '· 已停用'}</span><span className="ml-1">{requiresConfirm ? '· 需确认' : '· 可自动调用（人工授权）'}</span>{!tool.readOnly && <span className="ml-1 text-amber-700">· 服务端未声明只读</span>}{tool.description && <span className="mt-0.5 block truncate text-[11px] text-[var(--color-text-tertiary)]">{tool.description}</span>}</span>
                </div>
              })}
            </div>
          </div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" loading={working} onClick={() => void testForm()} icon={<ShieldCheck className="h-3.5 w-3.5" />}>测试并发现工具</Button>
            <Button type="button" size="sm" loading={working} onClick={() => void save()} icon={<CheckCircle2 className="h-3.5 w-3.5" />}>{editingId == null ? '保存服务' : '保存修改'}</Button>
            <button type="button" className="text-[12px] text-[var(--color-text-tertiary)]" onClick={() => setShowCredential((value) => !value)}>{showCredential ? '隐藏凭证' : '显示凭证'}</button>
          </div>
          {testResult && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800"><div className="font-semibold">{testResult.message} · {testResult.serverName || '未命名服务'}</div><div className="mt-1">已发现 {testResult.tools.length} 个工具</div></div>}
        </div>

        {loading ? <div className="py-8 text-center text-[13px] text-[var(--color-text-tertiary)]">正在加载 MCP 服务...</div> : servers.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center text-[13px] text-[var(--color-text-tertiary)]">还没有配置外部 MCP 服务</div> : <div className="space-y-3">{servers.map((server) => <article key={server.id} className="rounded-xl border border-[var(--color-border-light)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text-primary)]"><Wrench className="h-3.5 w-3.5 text-[var(--color-primary)]" />{server.name}<span className={server.enabled ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700' : 'rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500'}>{server.enabled ? '已启用' : '已停用'}</span></div><div className="mt-1 truncate text-[12px] text-[var(--color-text-tertiary)]">{server.endpointUrl}</div></div><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="sm" loading={testingId === server.id} onClick={() => void toggle(server)}>{server.enabled ? '停用' : '启用'}</Button><Button type="button" variant="ghost" size="sm" loading={testingId === server.id} onClick={() => void retest(server)} icon={<RefreshCw className="h-3.5 w-3.5" />}>测试</Button><Button type="button" variant="ghost" size="sm" onClick={() => edit(server)}>编辑</Button><button type="button" className="rounded p-2 text-[var(--color-danger)] hover:bg-[var(--color-danger-light)]" aria-label={`删除 ${server.name}`} onClick={() => setDeleteTarget(server)}><Trash2 className="h-3.5 w-3.5" /></button></div></div>
          <div className="mt-2 flex flex-wrap gap-1">{server.tools.map((tool) => <span key={tool.toolCode} className="rounded-full bg-[var(--color-bg-hover)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)]">{tool.name}{tool.enabled ? ' · 已启用' : ' · 已停用'}{tool.requiresConfirm ? ' · 需确认' : ' · 可自动调用'}</span>)}</div>
          <div className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">{server.connectionStatus === 'HEALTHY' ? '连接正常' : server.connectionMessage || '尚未连接'} · 配置版本 {server.configVersion}</div>
        </article>)}</div>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2 border-t border-[var(--color-border-light)] px-4 py-3 text-[11px] text-[var(--color-text-tertiary)]"><ShieldCheck className="h-3.5 w-3.5" />未手动取消确认的工具仍会在调用前弹出确认。</div>
      <ConfirmDialog open={Boolean(deleteTarget)} title="删除 MCP 服务" description={<>确定删除「{deleteTarget?.name}」吗？删除后新的 GitPilot 会话将无法使用它。</>} variant="danger" confirmText="删除" loading={working} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} />
    </div>
  )
}
