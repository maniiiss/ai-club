/**
 * 项目研发模块中的数据工作台面板。
 * 业务意图：让项目成员在项目范围内提交受控 DataChange 工单，并查看自身项目的执行审计。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Database,
  FileClock,
  FileSearch,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Wand2,
} from 'lucide-react'
import {
  listDataChangeAudits,
  listProjectDataWorkbenchApps,
  listProjectDataWorkbenchEntities,
  pageProjectDataChangeRequests,
  parseProjectDataChange,
  previewProjectDataChange,
  submitProjectDataChange,
} from '@/src/api/dataWorkbench'
import { Button } from '@/src/components/common/Button'
import { Card } from '@/src/components/common/Card'
import { EmptyState } from '@/src/components/common/EmptyState'
import { ErrorState } from '@/src/components/common/ErrorState'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { Select } from '@/src/components/common/Select'
import { SemanticQueryPanel } from './SemanticQueryPanel'
import { cn, formatDateTime, getErrorMessage } from '@/src/lib/utils'
import type {
  DataChangeAuditItem,
  DataChangeDsl,
  DataChangePreviewResult,
  DataChangeRequestItem,
  DataWorkbenchAppItem,
  DataWorkbenchEntityItem,
} from '@/src/types/dataWorkbench'

type WorkbenchTab = 'query' | 'change' | 'requests' | 'audits' | 'apps'

const tabs: { key: WorkbenchTab; label: string; icon: typeof Database }[] = [
  { key: 'query', label: '数据查询', icon: Search },
  { key: 'change', label: '数据变更', icon: Wand2 },
  { key: 'requests', label: '我的请求', icon: FileClock },
  { key: 'audits', label: '执行审计', icon: FileSearch },
  { key: 'apps', label: '能力入口', icon: Database },
]

const defaultText = '第五师医共体强基工程建设项目（施工）需要修改【是否资审】为「是」 项目编码为XMBM202606180004'

export const DataWorkbenchPanel = ({ projectId }: { projectId: number }) => {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('change')
  const [apps, setApps] = useState<DataWorkbenchAppItem[]>([])
  const [entities, setEntities] = useState<DataWorkbenchEntityItem[]>([])
  const [requests, setRequests] = useState<DataChangeRequestItem[]>([])
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null)
  const [audits, setAudits] = useState<DataChangeAuditItem[]>([])
  const [loading, setLoading] = useState(true)
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [auditsLoading, setAuditsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [entityCode, setEntityCode] = useState('')
  const [text, setText] = useState(defaultText)
  const [dslText, setDslText] = useState('')
  const [preview, setPreview] = useState<DataChangePreviewResult | null>(null)
  const [parsing, setParsing] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const entityOptions = useMemo(
    () => entities.map((entity) => ({
      value: entity.entityCode,
      label: entity.entityName,
      description: `${entity.entityCode} / 最大 ${entity.maxAffectedRows} 行`,
    })),
    [entities],
  )

  const selectedEntity = entities.find((entity) => entity.entityCode === entityCode) || null

  const loadBaseData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [appData, entityData] = await Promise.all([
        listProjectDataWorkbenchApps(projectId),
        listProjectDataWorkbenchEntities(projectId),
      ])
      setApps(appData)
      setEntities(entityData)
      setEntityCode((current) => current || entityData[0]?.entityCode || '')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true)
    try {
      const data = await pageProjectDataChangeRequests(projectId, { page: 1, size: 20 })
      setRequests(data.records)
      setSelectedRequestId((current) => current ?? data.records[0]?.id ?? null)
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setRequestsLoading(false)
    }
  }, [projectId])

  const loadAudits = useCallback(async (requestId: number | null) => {
    if (!requestId) {
      setAudits([])
      return
    }
    setAuditsLoading(true)
    try {
      setAudits(await listDataChangeAudits(requestId))
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setAuditsLoading(false)
    }
  }, [])

  useEffect(() => { loadBaseData() }, [loadBaseData])
  useEffect(() => {
    if (activeTab === 'requests' || activeTab === 'audits') {
      loadRequests()
    }
  }, [activeTab, loadRequests])
  useEffect(() => {
    if (activeTab === 'audits') {
      loadAudits(selectedRequestId)
    }
  }, [activeTab, selectedRequestId, loadAudits])

  const parseDslText = (): Record<string, unknown> | undefined => {
    if (!dslText.trim()) return undefined
    return JSON.parse(dslText) as Record<string, unknown>
  }

  /**
   * 统一构造 DataChange 请求载荷。
   * 业务意图：前端只传自然语言和 DSL，SQL 摘要仅用于展示，真实 SQL 始终由后端白名单生成。
   */
  const buildPayload = () => ({
    text: text.trim(),
    entityCode: entityCode || undefined,
    dsl: parseDslText(),
  })

  const handleParse = async () => {
    setParsing(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const dsl = await parseProjectDataChange(projectId, buildPayload())
      setDslText(JSON.stringify(dsl, null, 2))
      setEntityCode(dsl.entityCode || entityCode)
      setActionMessage('已生成 DataChange DSL。')
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setParsing(false)
    }
  }

  const handlePreview = async () => {
    setPreviewing(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await previewProjectDataChange(projectId, buildPayload())
      setPreview(result)
      setDslText(JSON.stringify(result.dsl, null, 2))
      setActionMessage('预览完成，已校验影响范围与风险。')
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setPreviewing(false)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const request = await submitProjectDataChange(projectId, buildPayload())
      setActionMessage(`工单 #${request.id} 已提交。`)
      await loadRequests()
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingSpinner text="加载数据工作台…" />
  if (error) return <ErrorState description={error} onRetry={loadBaseData} />

  return (
    <div className="h-full min-h-0 space-y-4 overflow-y-auto pb-2 animate-fadeIn">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)] w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
              activeTab === tab.key
                ? 'bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
            )}
          >
            <tab.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {tab.label}
          </button>
        ))}
      </div>

      {(actionError || actionMessage) && (
        <div className={cn(
          'rounded-lg border px-3.5 py-2.5 text-[13px]',
          actionError ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700',
        )}>
          {actionError || actionMessage}
        </div>
      )}

      {activeTab === 'query' && <SemanticQueryPanel projectId={projectId} />}

      {activeTab === 'change' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <Card title="变更输入">
            <div className="space-y-4">
              <Select
                label="业务实体"
                value={entityCode}
                onChange={(value) => {
                  setEntityCode(value)
                  setPreview(null)
                }}
                options={entityOptions}
                placeholder="选择可变更实体"
              />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">自然语言描述</span>
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className="min-h-[128px] w-full resize-y rounded-lg border border-[var(--color-border-strong)] bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-text-primary)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">DataChange DSL</span>
                <textarea
                  value={dslText}
                  onChange={(event) => {
                    setDslText(event.target.value)
                    setPreview(null)
                  }}
                  placeholder="可先解析自然语言，也可粘贴后端 DSL JSON。"
                  className="min-h-[180px] w-full resize-y rounded-lg border border-[var(--color-border-strong)] bg-white px-3.5 py-2.5 font-mono text-[12px] text-[var(--color-text-primary)] outline-none transition-all focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" loading={parsing} icon={<Wand2 className="h-4 w-4" />} onClick={handleParse}>
                  解析
                </Button>
                <Button type="button" variant="secondary" loading={previewing} icon={<ShieldCheck className="h-4 w-4" />} onClick={handlePreview}>
                  预览
                </Button>
                <Button type="button" loading={submitting} icon={<Send className="h-4 w-4" />} onClick={handleSubmit}>
                  提交工单
                </Button>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <EntitySummary entity={selectedEntity} />
            <PreviewSummary preview={preview} />
          </div>
        </div>
      )}

      {activeTab === 'requests' && (
        <RequestList loading={requestsLoading} requests={requests} onRefresh={loadRequests} />
      )}

      {activeTab === 'audits' && (
        <AuditPanel
          loading={auditsLoading}
          requests={requests}
          selectedRequestId={selectedRequestId}
          audits={audits}
          onSelectRequest={setSelectedRequestId}
          onRefresh={() => loadAudits(selectedRequestId)}
        />
      )}

      {activeTab === 'apps' && <AppCatalog apps={apps} />}
    </div>
  )
}

const EntitySummary = ({ entity }: { entity: DataWorkbenchEntityItem | null }) => {
  if (!entity) {
    return (
      <Card title="实体规则">
        <EmptyState title="暂无实体" description="当前项目没有可提交的数据变更实体。" icon={<Database className="h-6 w-6" />} />
      </Card>
    )
  }
  return (
    <Card title="实体规则">
      <div className="grid gap-3 text-[12px] sm:grid-cols-2">
        <SummaryField label="实体编码" value={entity.entityCode} />
        <SummaryField label="最大影响行数" value={`${entity.maxAffectedRows} 行`} />
        <SummaryField label="项目列" value={entity.projectIdColumn} />
        <SummaryField label="主键列" value={entity.primaryKeyColumn} />
      </div>
      <div className="mt-4">
        <p className="mb-2 text-[12px] font-semibold text-[var(--color-text-tertiary)]">可修改字段</p>
        <div className="flex flex-wrap gap-1.5">
          {entity.fields.filter((field) => field.updatable && field.enabled).map((field) => (
            <span key={field.id} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              {field.fieldName}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-[12px] font-semibold text-[var(--color-text-tertiary)]">定位字段</p>
        <div className="flex flex-wrap gap-1.5">
          {entity.fields.filter((field) => field.locator && field.enabled).map((field) => (
            <span key={field.id} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              {field.fieldName}
            </span>
          ))}
        </div>
      </div>
    </Card>
  )
}

const PreviewSummary = ({ preview }: { preview: DataChangePreviewResult | null }) => (
  <Card title="预览结果">
    {!preview ? (
      <EmptyState title="尚未预览" description="解析并预览后会展示影响行数、SQL 摘要与审批判断。" icon={<Activity className="h-6 w-6" />} />
    ) : (
      <div className="space-y-3">
        <div className="grid gap-3 text-[12px] sm:grid-cols-3">
          <SummaryField label="影响行数" value={`${preview.affectedRows} 行`} />
          <SummaryField label="风险等级" value={riskLabel(preview.riskLevel)} tone={riskTone(preview.riskLevel)} />
          <SummaryField label="审批" value={preview.approvalRequired ? '需要审批' : '可直接执行'} />
        </div>
        <div className="rounded-lg bg-[var(--color-bg-hover)] px-3 py-2">
          <p className="text-[11px] text-[var(--color-text-tertiary)]">SQL 摘要</p>
          <p className="mt-1 break-all font-mono text-[12px] text-[var(--color-text-primary)]">{preview.sqlSummary}</p>
        </div>
        {preview.riskReasons.length > 0 && (
          <div className="space-y-1">
            {preview.riskReasons.map((reason) => (
              <p key={reason} className="text-[12px] text-[var(--color-text-secondary)]">• {reason}</p>
            ))}
          </div>
        )}
      </div>
    )}
  </Card>
)

const RequestList = ({
  loading,
  requests,
  onRefresh,
}: {
  loading: boolean
  requests: DataChangeRequestItem[]
  onRefresh: () => void
}) => (
  <Card title="项目内 DataChange 请求" action={<Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRefresh}>刷新</Button>}>
    {loading ? (
      <LoadingSpinner text="加载请求…" />
    ) : requests.length === 0 ? (
      <EmptyState title="暂无请求" description="提交数据变更后，工单会在这里展示。" icon={<FileClock className="h-6 w-6" />} />
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px]">
          <thead>
            <tr className="border-b border-[var(--color-border-light)]">
              <TableHead>变更内容</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>风险</TableHead>
              <TableHead>影响</TableHead>
              <TableHead>申请时间</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-light)]">
            {requests.map((request) => (
              <tr key={request.id} className="hover:bg-[var(--color-bg-hover)]/50">
                <td className="px-3 py-3">
                  <p className="line-clamp-2 text-[13px] font-medium text-[var(--color-text-primary)]">{request.originalText}</p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">#{request.id} / {request.entityName}</p>
                </td>
                <td className="px-3 py-3">
                  <StatusPill value={approvalLabel(request.approvalStatus)} tone={statusTone(request.approvalStatus)} />
                  <StatusPill value={executionLabel(request.executionStatus)} tone={statusTone(request.executionStatus)} />
                </td>
                <td className="px-3 py-3"><StatusPill value={riskLabel(request.riskLevel)} tone={riskTone(request.riskLevel)} /></td>
                <td className="px-3 py-3 text-[12px] text-[var(--color-text-secondary)]">{request.affectedRows ?? 0} 行</td>
                <td className="px-3 py-3 text-[12px] text-[var(--color-text-tertiary)]">{formatDateTime(request.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </Card>
)

const AuditPanel = ({
  loading,
  requests,
  selectedRequestId,
  audits,
  onSelectRequest,
  onRefresh,
}: {
  loading: boolean
  requests: DataChangeRequestItem[]
  selectedRequestId: number | null
  audits: DataChangeAuditItem[]
  onSelectRequest: (id: number | null) => void
  onRefresh: () => void
}) => (
  <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
    <Card title="工单">
      {requests.length === 0 ? (
        <EmptyState title="暂无工单" description="有执行记录后可查看 before/after 快照。" icon={<FileSearch className="h-6 w-6" />} />
      ) : (
        <div className="space-y-2">
          {requests.map((request) => (
            <button
              key={request.id}
              type="button"
              onClick={() => onSelectRequest(request.id)}
              className={cn(
                'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                selectedRequestId === request.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]',
              )}
            >
              <p className="truncate text-[13px] font-medium text-[var(--color-text-primary)]">#{request.id} {request.entityName}</p>
              <p className="mt-1 truncate text-[11px] text-[var(--color-text-tertiary)]">{request.originalText}</p>
            </button>
          ))}
        </div>
      )}
    </Card>
    <Card title="审计快照" action={<Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRefresh}>刷新</Button>}>
      {loading ? (
        <LoadingSpinner text="加载审计…" />
      ) : audits.length === 0 ? (
        <EmptyState title="暂无审计" description="工单执行后会保存影响行主键及变更前后快照。" icon={<FileSearch className="h-6 w-6" />} />
      ) : (
        <div className="space-y-3">
          {audits.map((audit) => (
            <div key={audit.id} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">{audit.entityName} / PK {audit.primaryKeyValue}</p>
                  <p className="mt-1 break-all font-mono text-[11px] text-[var(--color-text-tertiary)]">{audit.sqlSummary}</p>
                </div>
                <StatusPill value={audit.rollbackStatus || '未回滚'} tone={statusTone(audit.rollbackStatus || '')} />
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <SnapshotBlock title="Before" value={audit.beforeSnapshot} />
                <SnapshotBlock title="After" value={audit.afterSnapshot} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  </div>
)

const AppCatalog = ({ apps }: { apps: DataWorkbenchAppItem[] }) => (
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    {apps.map((app) => (
      <Card key={app.code} interactive>
        <div className="flex items-start gap-3">
          <div className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg',
            app.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500',
          )}>
            {app.enabled ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Database className="h-4.5 w-4.5" />}
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">{app.name}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--color-text-tertiary)]">{app.description}</p>
            <StatusPill value={app.enabled ? '已启用' : '规划中'} tone={app.enabled ? 'success' : 'neutral'} />
          </div>
        </div>
      </Card>
    ))}
  </div>
)

const SummaryField = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="rounded-lg bg-[var(--color-bg-hover)] px-3 py-2">
    <p className="text-[11px] text-[var(--color-text-tertiary)]">{label}</p>
    <p className={cn('mt-0.5 truncate text-[12px] font-semibold text-[var(--color-text-primary)]', tone)}>{value}</p>
  </div>
)

const TableHead = ({ children }: { children: string }) => (
  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">{children}</th>
)

const StatusPill = ({ value, tone }: { value: string; tone: string }) => (
  <span className={cn('mr-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', toneClass(tone))}>{value}</span>
)

const SnapshotBlock = ({ title, value }: { title: string; value: Record<string, unknown> }) => (
  <div className="rounded-lg bg-[var(--color-bg-hover)] p-3">
    <p className="mb-2 text-[11px] font-semibold text-[var(--color-text-tertiary)]">{title}</p>
    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-[var(--color-text-secondary)]">
      {JSON.stringify(value, null, 2)}
    </pre>
  </div>
)

const approvalLabel = (value: string) => ({ PENDING: '待审批', APPROVED: '已审批', REJECTED: '已驳回', NOT_REQUIRED: '免审批' } as Record<string, string>)[value] || value
const executionLabel = (value: string) => ({ SUBMITTED: '待执行', EXECUTING: '执行中', EXECUTED: '已执行', REJECTED: '已终止', FAILED: '执行失败' } as Record<string, string>)[value] || value
const riskLabel = (value: string) => ({ LOW: '低风险', MEDIUM: '中风险', HIGH: '高风险' } as Record<string, string>)[value] || value
const riskTone = (value: string) => (value === 'HIGH' ? 'danger' : value === 'MEDIUM' ? 'warning' : 'success')
const statusTone = (value: string) => {
  if (['REJECTED', 'FAILED', 'CONFLICT'].includes(value)) return 'danger'
  if (['PENDING', 'SUBMITTED', 'EXECUTING'].includes(value)) return 'warning'
  if (['APPROVED', 'EXECUTED', 'NOT_REQUIRED', 'ROLLED_BACK'].includes(value)) return 'success'
  return 'neutral'
}

const toneClass = (tone: string) => {
  if (tone === 'danger') return 'bg-red-50 text-red-700'
  if (tone === 'warning') return 'bg-amber-50 text-amber-700'
  if (tone === 'success') return 'bg-emerald-50 text-emerald-700'
  return 'bg-gray-100 text-gray-600'
}
