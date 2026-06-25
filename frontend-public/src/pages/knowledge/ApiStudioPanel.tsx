/**
 * API Studio 面板组件
 * 文档模块下的 API 管理功能（完整版）
 * 包含：目录树、API CRUD、参数/响应编辑器、环境管理、版本历史、调试面板
 * 所有抽屉和模态框均带关闭动效（参照 PlanningPage WorkItemDialog 模式）
 */
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  FolderTree, FileCode, Plus, Search, ChevronRight, ChevronDown,
  Edit3, Trash2, Play, Settings, History, Copy, Check, Star,
  AlertCircle, X, Save, RotateCcw, Eye,
} from 'lucide-react'
import { useApiStudioStore } from '@/src/stores/apiStudio'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { Select } from '@/src/components/common/Select'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { EmptyState } from '@/src/components/common/EmptyState'
import { SlideDrawer, SlideDrawerFooter } from '@/src/components/common/SlideDrawer'
import { cn, formatDate, getErrorMessage } from '@/src/lib/utils'
import type {
  ApiStudioMethod, ApiStudioStatus, ApiStudioBodyType,
  ApiStudioEndpointSummary, ApiStudioEndpointDetail, ApiStudioEndpointPayload,
  ApiStudioTreeNode, ApiStudioProjectTree,
  ApiStudioParameterItem, ApiStudioParamLocation, ApiStudioDataType,
  ApiStudioResponseItem, ApiStudioResponseFieldItem,
  ApiStudioEnvironmentDetail, ApiStudioEnvironmentPayload,
  ApiStudioEnvironmentVariableItem, ApiStudioAuthType,
  ApiStudioDebugExecutionResult, ApiStudioEndpointVersionItem,
  ApiStudioDirectoryPayload,
} from '@/src/types/api-studio'

const METHOD_COLORS: Record<ApiStudioMethod, string> = {
  GET: 'text-blue-600 bg-blue-50', POST: 'text-green-600 bg-green-50',
  PUT: 'text-orange-600 bg-orange-50', PATCH: 'text-purple-600 bg-purple-50',
  DELETE: 'text-red-600 bg-red-50', HEAD: 'text-gray-600 bg-gray-50',
  OPTIONS: 'text-gray-600 bg-gray-50',
}

const STATUS_BADGES: Record<ApiStudioStatus, { label: string; className: string }> = {
  DRAFT: { label: '草稿', className: 'bg-gray-100 text-gray-700' },
  PUBLISHED: { label: '已发布', className: 'bg-green-100 text-green-700' },
  DEPRECATED: { label: '已废弃', className: 'bg-red-100 text-red-700' },
}

const PARAM_LOCATIONS: ApiStudioParamLocation[] = ['PATH', 'QUERY', 'HEADER', 'FORM_DATA', 'FORM_URLENCODED']
const DATA_TYPES: ApiStudioDataType[] = ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT', 'FILE']

export const ApiStudioPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const store = useApiStudioStore()
  const {
    overview, tree, treeLoading, currentEndpoint, endpointLoading,
    environments, selectedEnvironmentId, debugResult, debugRunning,
    versions, versionsLoading,
    setProject, refreshOverview, refreshTree, refreshEnvironments,
    loadEndpoint, createEndpoint, saveEndpoint, removeEndpoint,
    publishEndpoint, deprecateEndpoint,
    createDirectory, updateDirectory, removeDirectory,
    createEnvironment, updateEnvironment, removeEnvironment, setDefaultEnvironment,
    debug, refreshDebugRecords, refreshVersions, rollbackVersion,
  } = store

  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')

  // Dialogs & Panels
  const [endpointDialog, setEndpointDialog] = useState<{
    open: boolean; mode: 'create' | 'edit'; endpoint?: ApiStudioEndpointDetail; directoryId?: number | null
  }>({ open: false, mode: 'create' })
  const [directoryDialog, setDirectoryDialog] = useState<{
    open: boolean; mode: 'create' | 'edit'; parentId?: number | null; directoryId?: number; name?: string
  }>({ open: false, mode: 'create' })
  const [envManagerOpen, setEnvManagerOpen] = useState(false)
  const [envDialog, setEnvDialog] = useState<{
    open: boolean; mode: 'create' | 'edit'; environment?: ApiStudioEnvironmentDetail
  }>({ open: false, mode: 'create' })
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const [versionSnapshot, setVersionSnapshot] = useState<ApiStudioEndpointVersionItem | null>(null)
  const [debugPanel, setDebugPanel] = useState<{ open: boolean; endpoint?: ApiStudioEndpointDetail }>({ open: false })
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'endpoint' | 'directory' | 'environment'; id: number; name: string } | null>(null)

  useEffect(() => {
    setProject(pid)
    Promise.all([refreshOverview(), refreshTree(), refreshEnvironments()])
  }, [pid])

  // 过滤目录树
  const filteredTree = useMemo(() => {
    if (!tree) return null
    if (!keyword.trim()) return tree
    const kw = keyword.toLowerCase()
    const filterNodes = (nodes: ApiStudioTreeNode[]): ApiStudioTreeNode[] => {
      return nodes.map(node => {
        const filteredChildren = filterNodes(node.children)
        const filteredEndpoints = node.endpoints.filter(ep =>
          ep.name.toLowerCase().includes(kw) || ep.path.toLowerCase().includes(kw) || ep.method.toLowerCase().includes(kw)
        )
        if (filteredChildren.length > 0 || filteredEndpoints.length > 0 || node.directory.name.toLowerCase().includes(kw)) {
          return { ...node, children: filteredChildren, endpoints: filteredEndpoints }
        }
        return null
      }).filter(Boolean) as ApiStudioTreeNode[]
    }
    const filteredRoot = tree.rootEndpoints.filter(ep =>
      ep.name.toLowerCase().includes(kw) || ep.path.toLowerCase().includes(kw) || ep.method.toLowerCase().includes(kw)
    )
    return { ...tree, nodes: filterNodes(tree.nodes), rootEndpoints: filteredRoot }
  }, [tree, keyword])

  const handleSelectEndpoint = async (endpointId: number) => {
    setSelectedNodeId(endpointId)
    await loadEndpoint(endpointId)
  }

  const handlePublish = async (endpointId: number) => {
    try { await publishEndpoint(endpointId); await loadEndpoint(endpointId) }
    catch (err) { setError(getErrorMessage(err)) }
  }

  const handleDeprecate = async (endpointId: number) => {
    try { await deprecateEndpoint(endpointId); await loadEndpoint(endpointId) }
    catch (err) { setError(getErrorMessage(err)) }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return
    try {
      if (deleteConfirm.type === 'endpoint') {
        await removeEndpoint(deleteConfirm.id)
        if (currentEndpoint?.id === deleteConfirm.id) setSelectedNodeId(null)
      } else if (deleteConfirm.type === 'directory') {
        await removeDirectory(deleteConfirm.id)
      } else if (deleteConfirm.type === 'environment') {
        await removeEnvironment(deleteConfirm.id)
      }
    } catch (err) { setError(getErrorMessage(err)) }
    setDeleteConfirm(null)
  }

  const handleOpenVersionHistory = async () => {
    if (!currentEndpoint) return
    setVersionHistoryOpen(true)
    await refreshVersions(currentEndpoint.id)
  }

  const handleRollback = async (versionId: number) => {
    if (!currentEndpoint) return
    try {
      await rollbackVersion(currentEndpoint.id, versionId)
      await loadEndpoint(currentEndpoint.id)
      await refreshVersions(currentEndpoint.id)
      setVersionHistoryOpen(false)
    } catch (err) { setError(getErrorMessage(err)) }
  }

  if (treeLoading) return <LoadingSpinner text="加载 API 列表…" />

  return (
    <div className="h-full flex flex-col lg:flex-row gap-5 overflow-hidden animate-fadeIn">
      {/* 左侧：目录树 */}
      <div className="w-full lg:w-[280px] shrink-0 flex flex-col overflow-hidden">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-light)]">
            <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)]">API 列表</h3>
            <div className="flex gap-1">
              <button onClick={() => setEnvManagerOpen(true)} className="rounded p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer" title="环境管理">
                <Settings className="h-4 w-4" />
              </button>
              <button onClick={() => setDirectoryDialog({ open: true, mode: 'create' })} className="rounded p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer" title="新建目录">
                <FolderTree className="h-4 w-4" />
              </button>
              <button onClick={() => setEndpointDialog({ open: true, mode: 'create' })} className="rounded p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer" title="新建 API">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="px-3 pt-3 pb-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input type="text" placeholder="搜索 API…" value={keyword} onChange={(e) => setKeyword(e.target.value)}
                className="h-8 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] pl-8 pr-3 text-[12px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {!filteredTree || (filteredTree.nodes.length === 0 && filteredTree.rootEndpoints.length === 0) ? (
              <EmptyState title={keyword ? "无匹配结果" : "暂无 API"} description={keyword ? "尝试其他关键词" : "点击上方按钮创建第一个 API"} icon={<FileCode className="h-6 w-6" />} />
            ) : (
              <div className="space-y-1">
                {filteredTree.nodes.map((node) => (
                  <DirectoryTreeNode key={node.directory.id} node={node} selectedEndpointId={selectedNodeId}
                    onSelectEndpoint={handleSelectEndpoint}
                    onEditDirectory={(id, name, parentId) => setDirectoryDialog({ open: true, mode: 'edit', directoryId: id, name, parentId })}
                    onDeleteDirectory={(id, name) => setDeleteConfirm({ type: 'directory', id, name })}
                    onAddEndpoint={(dirId) => setEndpointDialog({ open: true, mode: 'create', directoryId: dirId })} />
                ))}
                {filteredTree.rootEndpoints.map((ep) => (
                  <EndpointListItem key={ep.id} endpoint={ep} selected={selectedNodeId === ep.id} onClick={() => handleSelectEndpoint(ep.id)} />
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 右侧：详情面板 */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {endpointLoading ? <LoadingSpinner text="加载 API 详情…" /> : currentEndpoint ? (
          <EndpointDetail endpoint={currentEndpoint}
            onEdit={() => setEndpointDialog({ open: true, mode: 'edit', endpoint: currentEndpoint })}
            onDelete={() => setDeleteConfirm({ type: 'endpoint', id: currentEndpoint.id, name: currentEndpoint.name })}
            onPublish={() => handlePublish(currentEndpoint.id)}
            onDeprecate={() => handleDeprecate(currentEndpoint.id)}
            onDebug={() => setDebugPanel({ open: true, endpoint: currentEndpoint })}
            onHistory={handleOpenVersionHistory} />
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] p-16 text-center">
            <FileCode className="mx-auto h-10 w-10 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
            <p className="mt-3 text-[14px] text-[var(--color-text-tertiary)]">从左侧选择一个 API 查看详情</p>
          </div>
        )}
      </div>

      {/* Dialogs & Panels — 所有使用条件渲染的抽屉均通过内部 isClosing 实现关闭动效 */}
      {endpointDialog.open && (
        <EndpointDialog mode={endpointDialog.mode} endpoint={endpointDialog.endpoint} directoryId={endpointDialog.directoryId}
          onClose={() => setEndpointDialog({ open: false, mode: 'create' })}
          onSubmit={async (payload) => {
            if (endpointDialog.mode === 'create') await createEndpoint(payload)
            else if (endpointDialog.endpoint) { await saveEndpoint(endpointDialog.endpoint.id, payload); await loadEndpoint(endpointDialog.endpoint.id) }
            setEndpointDialog({ open: false, mode: 'create' })
          }} />
      )}

      {directoryDialog.open && (
        <DirectoryDialog mode={directoryDialog.mode} name={directoryDialog.name} parentId={directoryDialog.parentId}
          onClose={() => setDirectoryDialog({ open: false, mode: 'create' })}
          onSubmit={async (payload) => {
            if (directoryDialog.mode === 'create') await createDirectory(payload)
            else if (directoryDialog.directoryId) await updateDirectory(directoryDialog.directoryId, payload)
            setDirectoryDialog({ open: false, mode: 'create' })
          }} />
      )}

      {envManagerOpen && (
        <EnvironmentManager environments={environments}
          onClose={() => setEnvManagerOpen(false)}
          onEdit={(env) => setEnvDialog({ open: true, mode: 'edit', environment: env })}
          onDelete={(env) => setDeleteConfirm({ type: 'environment', id: env.id, name: env.name })}
          onCreate={() => setEnvDialog({ open: true, mode: 'create' })}
          onSetDefault={async (id) => await setDefaultEnvironment(id)} />
      )}

      {envDialog.open && (
        <EnvironmentDialog mode={envDialog.mode} environment={envDialog.environment}
          onClose={() => setEnvDialog({ open: false, mode: 'create' })}
          onSubmit={async (payload) => {
            if (envDialog.mode === 'create') await createEnvironment(payload)
            else if (envDialog.environment) await updateEnvironment(envDialog.environment.id, payload)
            setEnvDialog({ open: false, mode: 'create' })
          }} />
      )}

      {versionHistoryOpen && currentEndpoint && (
        <VersionHistoryPanel endpoint={currentEndpoint} versions={versions} loading={versionsLoading}
          onClose={() => { setVersionHistoryOpen(false); setVersionSnapshot(null) }}
          onRollback={handleRollback}
          onViewSnapshot={(v) => setVersionSnapshot(v)} />
      )}

      {versionSnapshot && (
        <SnapshotDrawer version={versionSnapshot} onClose={() => setVersionSnapshot(null)} />
      )}

      {debugPanel.open && debugPanel.endpoint && (
        <DebugPanel endpoint={debugPanel.endpoint} environments={environments} selectedEnvironmentId={selectedEnvironmentId}
          debugResult={debugResult} debugRunning={debugRunning} onClose={() => setDebugPanel({ open: false })}
          onExecute={async (payload) => { await debug(debugPanel.endpoint!.id, payload); await refreshDebugRecords(debugPanel.endpoint!.id) }} />
      )}

      {deleteConfirm && (
        <DeleteConfirmDialog name={deleteConfirm.name} onCancel={() => setDeleteConfirm(null)} onConfirm={handleDeleteConfirm} />
      )}

      {error && (
        <div className="fixed bottom-4 right-4 z-[60] rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-4 py-3 text-[13px] text-[var(--color-danger)] shadow-lg animate-scaleIn">
          <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}
            <button onClick={() => setError(null)} className="ml-2 cursor-pointer"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   目录树节点
   ════════════════════════════════════════════ */

const DirectoryTreeNode = ({ node, selectedEndpointId, depth = 0, onSelectEndpoint, onEditDirectory, onDeleteDirectory, onAddEndpoint }: {
  node: ApiStudioTreeNode; selectedEndpointId: number | null; depth?: number
  onSelectEndpoint: (id: number) => void
  onEditDirectory: (id: number, name: string, parentId: number | null) => void
  onDeleteDirectory: (id: number, name: string) => void
  onAddEndpoint: (dirId: number) => void
}) => {
  const [expanded, setExpanded] = useState(depth === 0)
  const hasChildren = node.children.length > 0 || node.endpoints.length > 0

  return (
    <div>
      <div className="group flex items-center rounded-md hover:bg-[var(--color-bg-hover)] transition-colors">
        <button onClick={() => setExpanded(!expanded)} className="flex flex-1 items-center gap-1 px-2 py-1.5 text-left cursor-pointer">
          {hasChildren ? (expanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-tertiary)] shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-tertiary)] shrink-0" />) : <span className="w-3.5 shrink-0" />}
          <FolderTree className="h-3.5 w-3.5 text-amber-600 shrink-0" strokeWidth={1.75} />
          <span className="truncate text-[12.5px] text-[var(--color-text-primary)]">{node.directory.name}</span>
        </button>
        <div className="flex items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onAddEndpoint(node.directory.id)} className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer" title="新建 API"><Plus className="h-3 w-3" /></button>
          <button onClick={() => onEditDirectory(node.directory.id, node.directory.name, node.directory.parentId)} className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer" title="编辑目录"><Edit3 className="h-3 w-3" /></button>
          <button onClick={() => onDeleteDirectory(node.directory.id, node.directory.name)} className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors cursor-pointer" title="删除目录"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {expanded && (
        <div>
          {node.children.map((child) => (
            <DirectoryTreeNode key={child.directory.id} node={child} selectedEndpointId={selectedEndpointId} depth={depth + 1}
              onSelectEndpoint={onSelectEndpoint} onEditDirectory={onEditDirectory} onDeleteDirectory={onDeleteDirectory} onAddEndpoint={onAddEndpoint} />
          ))}
          {node.endpoints.map((ep) => (
            <EndpointListItem key={ep.id} endpoint={ep} selected={selectedEndpointId === ep.id} onClick={() => onSelectEndpoint(ep.id)} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

const EndpointListItem = ({ endpoint, selected, onClick, depth = 0 }: {
  endpoint: ApiStudioEndpointSummary; selected: boolean; onClick: () => void; depth?: number
}) => (
  <button onClick={onClick}
    className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors cursor-pointer',
      selected ? 'bg-[var(--color-primary-light)]' : 'hover:bg-[var(--color-bg-hover)]')}
    style={{ paddingLeft: `${depth * 12 + 8}px` }}>
    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold', METHOD_COLORS[endpoint.method])}>{endpoint.method}</span>
    <span className="truncate text-[12.5px] text-[var(--color-text-primary)]">{endpoint.name}</span>
  </button>
)

/* ════════════════════════════════════════════
   API 详情
   ════════════════════════════════════════════ */

const EndpointDetail = ({ endpoint, onEdit, onDelete, onPublish, onDeprecate, onDebug, onHistory }: {
  endpoint: ApiStudioEndpointDetail
  onEdit: () => void; onDelete: () => void; onPublish: () => void; onDeprecate: () => void; onDebug: () => void; onHistory: () => void
}) => {
  const status = STATUS_BADGES[endpoint.status]
  const [copied, setCopied] = useState(false)

  const handleCopyPath = () => {
    navigator.clipboard.writeText(`${endpoint.method} ${endpoint.path}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-[var(--color-border-light)] px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('rounded px-2 py-0.5 text-[11px] font-bold', METHOD_COLORS[endpoint.method])}>{endpoint.method}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', status.className)}>{status.label}</span>
              </div>
              <h2 className="text-[18px] font-semibold text-[var(--color-text-primary)] mb-1">{endpoint.name}</h2>
              <div className="flex items-center gap-2">
                <p className="text-[13px] text-[var(--color-text-tertiary)] font-mono">{endpoint.path}</p>
                <button onClick={handleCopyPath} className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] cursor-pointer">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              {endpoint.summary && <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">{endpoint.summary}</p>}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={onDebug} icon={<Play className="h-4 w-4" />}>调试</Button>
              <Button variant="ghost" size="sm" onClick={onHistory} icon={<History className="h-4 w-4" />}>版本</Button>
              {endpoint.status === 'DRAFT' && <Button variant="secondary" size="sm" onClick={onPublish}>发布</Button>}
              {endpoint.status === 'PUBLISHED' && <Button variant="secondary" size="sm" onClick={onDeprecate}>废弃</Button>}
              <Button variant="ghost" size="sm" onClick={onEdit} icon={<Edit3 className="h-4 w-4" />}>编辑</Button>
              <button onClick={onDelete} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Parameters */}
          <section>
            <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] mb-3">请求参数</h3>
            {endpoint.parameters.length === 0 ? <p className="text-[13px] text-[var(--color-text-tertiary)]">暂无参数</p> : (
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                <table className="w-full">
                  <thead className="bg-[var(--color-bg-page)]">
                    <tr className="border-b border-[var(--color-border-light)]">
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">名称</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">位置</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">类型</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">必填</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-light)]">
                    {endpoint.parameters.map((param, idx) => (
                      <tr key={idx} className="hover:bg-[var(--color-bg-hover)]/50">
                        <td className="px-3 py-2.5 text-[13px] font-mono text-[var(--color-text-primary)]">{param.name}</td>
                        <td className="px-3 py-2.5"><span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-secondary)]">{param.location}</span></td>
                        <td className="px-3 py-2.5 text-[13px] text-[var(--color-text-secondary)]">{param.dataType}</td>
                        <td className="px-3 py-2.5 text-[13px] text-[var(--color-text-secondary)]">{param.required ? '是' : '否'}</td>
                        <td className="px-3 py-2.5 text-[13px] text-[var(--color-text-tertiary)]">{param.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Request Body */}
          {endpoint.requestBodyType !== 'NONE' && (
            <section>
              <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] mb-3">请求体 <span className="text-[12px] font-normal text-[var(--color-text-tertiary)]">({endpoint.requestBodyType})</span></h3>
              {endpoint.requestBodySchemaJson && (
                <pre className="rounded-lg bg-[var(--color-bg-page)] border border-[var(--color-border)] p-4 text-[12px] text-[var(--color-text-secondary)] overflow-x-auto font-mono whitespace-pre-wrap">{tryFormatJson(endpoint.requestBodySchemaJson)}</pre>
              )}
              {endpoint.requestBodyExample && (
                <div className="mt-3">
                  <p className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5">示例</p>
                  <pre className="rounded-lg bg-[var(--color-bg-page)] border border-[var(--color-border)] p-4 text-[12px] text-[var(--color-text-secondary)] overflow-x-auto font-mono whitespace-pre-wrap">{tryFormatJson(endpoint.requestBodyExample)}</pre>
                </div>
              )}
            </section>
          )}

          {/* Responses */}
          <section>
            <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] mb-3">响应定义</h3>
            {endpoint.responses.length === 0 ? <p className="text-[13px] text-[var(--color-text-tertiary)]">暂无响应定义</p> : (
              <div className="space-y-3">
                {endpoint.responses.map((resp, idx) => (
                  <div key={idx} className="rounded-lg border border-[var(--color-border)] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn('rounded px-2 py-0.5 text-[11px] font-medium', resp.statusCode >= 200 && resp.statusCode < 300 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>{resp.statusCode}</span>
                      <span className="text-[12px] text-[var(--color-text-tertiary)]">{resp.contentType}</span>
                    </div>
                    {resp.description && <p className="text-[13px] text-[var(--color-text-secondary)] mb-2">{resp.description}</p>}
                    {resp.exampleBody && <pre className="rounded bg-[var(--color-bg-page)] p-3 text-[11px] text-[var(--color-text-secondary)] overflow-x-auto font-mono whitespace-pre-wrap">{tryFormatJson(resp.exampleBody)}</pre>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Metadata */}
          <section className="border-t border-[var(--color-border-light)] pt-4">
            <div className="grid grid-cols-2 gap-4 text-[12px]">
              <div><span className="text-[var(--color-text-tertiary)]">创建时间：</span><span className="text-[var(--color-text-secondary)]">{formatDate(endpoint.createdAt)}</span></div>
              <div><span className="text-[var(--color-text-tertiary)]">更新时间：</span><span className="text-[var(--color-text-secondary)]">{formatDate(endpoint.updatedAt)}</span></div>
              <div><span className="text-[var(--color-text-tertiary)]">版本：</span><span className="text-[var(--color-text-secondary)]">v{endpoint.revision}</span></div>
            </div>
          </section>
        </div>
      </Card>
    </div>
  )
}

/* ════════════════════════════════════════════
   API 编辑对话框（含参数、请求体、响应编辑器）
   带关闭动效：内部 isClosing → SlideDrawer.open=false → animate-slideRight → 300ms 后卸载
   ════════════════════════════════════════════ */

const EndpointDialog = ({ mode, endpoint, directoryId, onClose, onSubmit }: {
  mode: 'create' | 'edit'; endpoint?: ApiStudioEndpointDetail; directoryId?: number | null
  onClose: () => void; onSubmit: (payload: ApiStudioEndpointPayload) => Promise<void>
}) => {
  const [isClosing, setIsClosing] = useState(false)
  const handleClose = useCallback(() => { setIsClosing(true); setTimeout(onClose, 300) }, [onClose])

  const [name, setName] = useState(endpoint?.name || '')
  const [method, setMethod] = useState<ApiStudioMethod>(endpoint?.method || 'GET')
  const [path, setPath] = useState(endpoint?.path || '')
  const [summary, setSummary] = useState(endpoint?.summary || '')
  const [descriptionMarkdown, setDescriptionMarkdown] = useState(endpoint?.descriptionMarkdown || '')
  const [requestBodyType, setRequestBodyType] = useState<ApiStudioBodyType>(endpoint?.requestBodyType || 'NONE')
  const [requestBodySchemaJson, setRequestBodySchemaJson] = useState(endpoint?.requestBodySchemaJson || '')
  const [requestBodyExample, setRequestBodyExample] = useState(endpoint?.requestBodyExample || '')
  const [parameters, setParameters] = useState<ApiStudioParameterItem[]>(endpoint?.parameters || [])
  const [responses, setResponses] = useState<ApiStudioResponseItem[]>(endpoint?.responses || [])
  const [saving, setSaving] = useState(false)

  const addParameter = () => setParameters([...parameters, { location: 'QUERY', name: '', dataType: 'STRING', required: false }])
  const updateParameter = (idx: number, field: keyof ApiStudioParameterItem, value: any) => {
    const next = [...parameters]; (next[idx] as any)[field] = value; setParameters(next)
  }
  const removeParameter = (idx: number) => setParameters(parameters.filter((_, i) => i !== idx))

  const addResponse = () => setResponses([...responses, { statusCode: 200, contentType: 'application/json', description: '' }])
  const updateResponse = (idx: number, field: keyof ApiStudioResponseItem, value: any) => {
    const next = [...responses]; (next[idx] as any)[field] = value; setResponses(next)
  }
  const removeResponse = (idx: number) => setResponses(responses.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    setSaving(true)
    try {
      await onSubmit({
        name, method, path, summary: summary || null, descriptionMarkdown: descriptionMarkdown || null,
        requestBodyType, requestBodySchemaJson: requestBodySchemaJson || null, requestBodyExample: requestBodyExample || null,
        directoryId: directoryId ?? null, parameters, responses,
        revision: endpoint?.revision,
      })
      handleClose()
    } catch { setSaving(false) }
  }

  return (
    <SlideDrawer open={!isClosing} onClose={handleClose} title={mode === 'create' ? '新建 API' : '编辑 API'} maxWidth="800px"
      footer={<SlideDrawerFooter loading={saving} onCancel={handleClose} onConfirm={handleSubmit} confirmText={mode === 'create' ? '创建' : '保存'} />}>
      <div className="p-6 space-y-6">
        {/* 基本信息 */}
        <section>
          <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-3 uppercase tracking-wide">基本信息</h4>
          <div className="space-y-4">
            <Input label="API 名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：获取用户列表" />
            <div className="grid grid-cols-2 gap-4">
              <Select label="请求方法" value={method} onChange={(v) => setMethod(v as ApiStudioMethod)}
                options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => ({ value: m, label: m }))} />
              <Input label="路径" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/users/{id}" />
            </div>
            <Input label="摘要" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="简要描述这个 API" />
            <div>
              <label className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">描述 (Markdown)</label>
              <textarea value={descriptionMarkdown} onChange={(e) => setDescriptionMarkdown(e.target.value)} rows={3}
                className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" placeholder="详细描述..." />
            </div>
          </div>
        </section>

        {/* 参数编辑器 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">请求参数</h4>
            <button onClick={addParameter} className="flex items-center gap-1 text-[12px] text-[var(--color-primary)] hover:underline cursor-pointer"><Plus className="h-3.5 w-3.5" />添加参数</button>
          </div>
          {parameters.length === 0 ? <p className="text-[12px] text-[var(--color-text-tertiary)]">暂无参数</p> : (
            <div className="space-y-2">
              {parameters.map((param, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-bg-page)]">
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    <input value={param.name} onChange={(e) => updateParameter(idx, 'name', e.target.value)} placeholder="参数名"
                      className="col-span-2 h-8 rounded border border-[var(--color-border-strong)] bg-white px-2 text-[12px] focus:border-[var(--color-primary)] focus:outline-none" />
                    <select value={param.location} onChange={(e) => updateParameter(idx, 'location', e.target.value)}
                      className="h-8 rounded border border-[var(--color-border-strong)] bg-white px-2 text-[12px] focus:border-[var(--color-primary)] focus:outline-none">
                      {PARAM_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <select value={param.dataType} onChange={(e) => updateParameter(idx, 'dataType', e.target.value)}
                      className="h-8 rounded border border-[var(--color-border-strong)] bg-white px-2 text-[12px] focus:border-[var(--color-primary)] focus:outline-none">
                      {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input value={param.description || ''} onChange={(e) => updateParameter(idx, 'description', e.target.value)} placeholder="说明"
                      className="col-span-3 h-8 rounded border border-[var(--color-border-strong)] bg-white px-2 text-[12px] focus:border-[var(--color-primary)] focus:outline-none" />
                    <label className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-secondary)] cursor-pointer">
                      <input type="checkbox" checked={param.required} onChange={(e) => updateParameter(idx, 'required', e.target.checked)} className="rounded border-gray-300" /> 必填
                    </label>
                  </div>
                  <button onClick={() => removeParameter(idx)} className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 请求体 */}
        <section>
          <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-3 uppercase tracking-wide">请求体</h4>
          <div className="space-y-4">
            <Select label="类型" value={requestBodyType} onChange={(v) => setRequestBodyType(v as ApiStudioBodyType)}
              options={[{ value: 'NONE', label: '无' }, { value: 'JSON', label: 'JSON' }, { value: 'FORM_DATA', label: 'Form Data' }, { value: 'FORM_URLENCODED', label: 'Form URL Encoded' }, { value: 'RAW_TEXT', label: 'Raw Text' }]} />
            {requestBodyType !== 'NONE' && (
              <>
                <div>
                  <label className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">Schema (JSON)</label>
                  <textarea value={requestBodySchemaJson} onChange={(e) => setRequestBodySchemaJson(e.target.value)} rows={4}
                    className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[12px] font-mono focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" placeholder='{"type": "object", "properties": {...}}' />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">示例</label>
                  <textarea value={requestBodyExample} onChange={(e) => setRequestBodyExample(e.target.value)} rows={4}
                    className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[12px] font-mono focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" placeholder='{"name": "example"}' />
                </div>
              </>
            )}
          </div>
        </section>

        {/* 响应编辑器 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">响应定义</h4>
            <button onClick={addResponse} className="flex items-center gap-1 text-[12px] text-[var(--color-primary)] hover:underline cursor-pointer"><Plus className="h-3.5 w-3.5" />添加响应</button>
          </div>
          {responses.length === 0 ? <p className="text-[12px] text-[var(--color-text-tertiary)]">暂无响应定义</p> : (
            <div className="space-y-3">
              {responses.map((resp, idx) => (
                <div key={idx} className="rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-bg-page)]">
                  <div className="flex items-center gap-2 mb-2">
                    <input type="number" value={resp.statusCode} onChange={(e) => updateResponse(idx, 'statusCode', Number(e.target.value))}
                      className="h-8 w-20 rounded border border-[var(--color-border-strong)] bg-white px-2 text-[12px] focus:border-[var(--color-primary)] focus:outline-none" />
                    <input value={resp.contentType} onChange={(e) => updateResponse(idx, 'contentType', e.target.value)} placeholder="Content-Type"
                      className="h-8 flex-1 rounded border border-[var(--color-border-strong)] bg-white px-2 text-[12px] focus:border-[var(--color-primary)] focus:outline-none" />
                    <button onClick={() => removeResponse(idx)} className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <input value={resp.description || ''} onChange={(e) => updateResponse(idx, 'description', e.target.value)} placeholder="描述"
                    className="mb-2 h-8 w-full rounded border border-[var(--color-border-strong)] bg-white px-2 text-[12px] focus:border-[var(--color-primary)] focus:outline-none" />
                  <textarea value={resp.exampleBody || ''} onChange={(e) => updateResponse(idx, 'exampleBody', e.target.value)} placeholder="示例响应体 (JSON)" rows={3}
                    className="w-full rounded border border-[var(--color-border-strong)] bg-white px-2 py-1.5 text-[11px] font-mono focus:border-[var(--color-primary)] focus:outline-none" />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </SlideDrawer>
  )
}

/* ════════════════════════════════════════════
   目录对话框（居中模态，带关闭动效）
   ════════════════════════════════════════════ */

const DirectoryDialog = ({ mode, name: initialName, parentId, onClose, onSubmit }: {
  mode: 'create' | 'edit'; name?: string; parentId?: number | null
  onClose: () => void; onSubmit: (payload: ApiStudioDirectoryPayload) => Promise<void>
}) => {
  const [name, setName] = useState(initialName || '')
  const [saving, setSaving] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  const handleClose = useCallback(() => { setIsClosing(true); setTimeout(onClose, 250) }, [onClose])

  const handleSubmit = async () => {
    setSaving(true)
    try { await onSubmit({ name, parentId: parentId ?? null }); handleClose() }
    catch { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={cn('absolute inset-0 bg-black/20 backdrop-blur-[2px]', isClosing ? 'animate-fadeOut' : 'animate-fadeIn')} onClick={handleClose} />
      <div className={cn('relative z-10 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)]',
        isClosing ? 'animate-scaleOut' : 'animate-scaleIn')}>
        <h2 className="text-[16px] font-bold text-[var(--color-text-primary)] mb-3">{mode === 'create' ? '新建目录' : '编辑目录'}</h2>
        <Input label="目录名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：用户管理" autoFocus />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>取消</Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!name.trim()}>确定</Button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   环境管理面板（带关闭动效）
   ════════════════════════════════════════════ */

const EnvironmentManager = ({ environments, onClose, onEdit, onDelete, onCreate, onSetDefault }: {
  environments: ApiStudioEnvironmentDetail[]; onClose: () => void
  onEdit: (env: ApiStudioEnvironmentDetail) => void; onDelete: (env: ApiStudioEnvironmentDetail) => void
  onCreate: () => void; onSetDefault: (id: number) => void
}) => {
  const [isClosing, setIsClosing] = useState(false)
  const handleClose = useCallback(() => { setIsClosing(true); setTimeout(onClose, 300) }, [onClose])

  return (
    <SlideDrawer open={!isClosing} onClose={handleClose} title="环境管理" description="配置 API 调试的运行环境" maxWidth="640px"
      headerActions={<Button size="sm" onClick={onCreate} icon={<Plus className="h-4 w-4" />}>新建环境</Button>}>
      <div className="p-6">
        {environments.length === 0 ? (
          <EmptyState title="暂无环境" description="创建一个环境来配置 API 的 Base URL 和认证信息" icon={<Settings className="h-6 w-6" />} />
        ) : (
          <div className="space-y-3">
            {environments.map((env) => (
              <div key={env.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 hover:shadow-[var(--shadow-sm)] transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-[14px] font-semibold text-[var(--color-text-primary)]">{env.name}</h4>
                    {env.isDefault && <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">默认</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {!env.isDefault && (
                      <button onClick={() => onSetDefault(env.id)} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] cursor-pointer" title="设为默认"><Star className="h-3.5 w-3.5" /></button>
                    )}
                    <button onClick={() => onEdit(env)} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] cursor-pointer"><Edit3 className="h-3.5 w-3.5" /></button>
                    <button onClick={() => onDelete(env)} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <p className="text-[12px] text-[var(--color-text-tertiary)] font-mono">{env.baseUrl}</p>
                <div className="mt-2 flex gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                  <span>认证: {env.authType}</span>
                  <span>变量: {env.variables.length}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SlideDrawer>
  )
}

/* ════════════════════════════════════════════
   环境编辑对话框（带关闭动效）
   ════════════════════════════════════════════ */

const EnvironmentDialog = ({ mode, environment, onClose, onSubmit }: {
  mode: 'create' | 'edit'; environment?: ApiStudioEnvironmentDetail
  onClose: () => void; onSubmit: (payload: ApiStudioEnvironmentPayload) => Promise<void>
}) => {
  const [isClosing, setIsClosing] = useState(false)
  const handleClose = useCallback(() => { setIsClosing(true); setTimeout(onClose, 300) }, [onClose])

  const [name, setName] = useState(environment?.name || '')
  const [baseUrl, setBaseUrl] = useState(environment?.baseUrl || '')
  const [authType, setAuthType] = useState<ApiStudioAuthType>(environment?.authType || 'NONE')
  const [authConfigJson, setAuthConfigJson] = useState(environment?.authConfigJson || '')
  const [variables, setVariables] = useState<ApiStudioEnvironmentVariableItem[]>(environment?.variables || [])
  const [saving, setSaving] = useState(false)

  const addVariable = () => setVariables([...variables, { name: '', value: '', secret: false }])
  const updateVariable = (idx: number, field: keyof ApiStudioEnvironmentVariableItem, value: any) => {
    const next = [...variables]; (next[idx] as any)[field] = value; setVariables(next)
  }
  const removeVariable = (idx: number) => setVariables(variables.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    setSaving(true)
    try { await onSubmit({ name, baseUrl, authType, authConfigJson: authConfigJson || null, variables }); handleClose() }
    catch { setSaving(false) }
  }

  return (
    <SlideDrawer open={!isClosing} onClose={handleClose} title={mode === 'create' ? '新建环境' : '编辑环境'} maxWidth="640px"
      footer={<SlideDrawerFooter loading={saving} onCancel={handleClose} onConfirm={handleSubmit} confirmText={mode === 'create' ? '创建' : '保存'} />}>
      <div className="p-6 space-y-6">
        <Input label="环境名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：开发环境" />
        <Input label="Base URL" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" />

        <section>
          <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] mb-3 uppercase tracking-wide">认证配置</h4>
          <Select label="认证类型" value={authType} onChange={(v) => setAuthType(v as ApiStudioAuthType)}
            options={[{ value: 'NONE', label: '无' }, { value: 'BEARER', label: 'Bearer Token' }, { value: 'API_KEY', label: 'API Key' }]} />
          {authType !== 'NONE' && (
            <div className="mt-3">
              <label className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">认证配置 (JSON)</label>
              <textarea value={authConfigJson} onChange={(e) => setAuthConfigJson(e.target.value)} rows={3}
                className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[12px] font-mono focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                placeholder={authType === 'BEARER' ? '{"token": "your-token"}' : '{"key": "X-API-Key", "value": "your-key"}'} />
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-semibold text-[var(--color-text-primary)] uppercase tracking-wide">环境变量</h4>
            <button onClick={addVariable} className="flex items-center gap-1 text-[12px] text-[var(--color-primary)] hover:underline cursor-pointer"><Plus className="h-3.5 w-3.5" />添加变量</button>
          </div>
          {variables.length === 0 ? <p className="text-[12px] text-[var(--color-text-tertiary)]">暂无变量</p> : (
            <div className="space-y-2">
              {variables.map((v, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] p-2 bg-[var(--color-bg-page)]">
                  <input value={v.name} onChange={(e) => updateVariable(idx, 'name', e.target.value)} placeholder="变量名"
                    className="h-8 flex-1 rounded border border-[var(--color-border-strong)] bg-white px-2 text-[12px] focus:border-[var(--color-primary)] focus:outline-none" />
                  <input value={v.value || ''} onChange={(e) => updateVariable(idx, 'value', e.target.value)} placeholder="值" type={v.secret ? 'password' : 'text'}
                    className="h-8 flex-1 rounded border border-[var(--color-border-strong)] bg-white px-2 text-[12px] focus:border-[var(--color-primary)] focus:outline-none" />
                  <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={v.secret} onChange={(e) => updateVariable(idx, 'secret', e.target.checked)} className="rounded border-gray-300" /> 加密
                  </label>
                  <button onClick={() => removeVariable(idx)} className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </SlideDrawer>
  )
}

/* ════════════════════════════════════════════
   版本历史面板（带关闭动效）
   ════════════════════════════════════════════ */

const VersionHistoryPanel = ({ endpoint, versions, loading, onClose, onRollback, onViewSnapshot }: {
  endpoint: ApiStudioEndpointDetail; versions: ApiStudioEndpointVersionItem[]; loading: boolean
  onClose: () => void; onRollback: (versionId: number) => void; onViewSnapshot: (v: ApiStudioEndpointVersionItem) => void
}) => {
  const [rollbackConfirm, setRollbackConfirm] = useState<ApiStudioEndpointVersionItem | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const handleClose = useCallback(() => { setIsClosing(true); setTimeout(onClose, 300) }, [onClose])

  return (
    <SlideDrawer open={!isClosing} onClose={handleClose} title="版本历史" description={endpoint.name} maxWidth="500px">
      <div className="p-6">
        {loading ? <LoadingSpinner text="加载版本…" /> : versions.length === 0 ? (
          <EmptyState title="暂无版本记录" description="保存 API 后将自动生成版本" icon={<History className="h-6 w-6" />} />
        ) : (
          <div className="space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-medium text-[var(--color-text-primary)]">v{v.versionNo}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onViewSnapshot(v)} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] cursor-pointer" title="查看快照"><Eye className="h-3.5 w-3.5" /></button>
                    {v.versionNo !== endpoint.revision && (
                      <button onClick={() => setRollbackConfirm(v)} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] cursor-pointer" title="回滚"><RotateCcw className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)]">{v.changeType}</span>
                  {v.changeSummary && <span className="text-[11px] text-[var(--color-text-tertiary)] truncate">{v.changeSummary}</span>}
                </div>
                <p className="text-[10px] text-[var(--color-text-tertiary)]">{formatDate(v.createdAt)}</p>
                {v.versionNo === endpoint.revision && <span className="mt-1 inline-block rounded-full bg-[var(--color-primary-light)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">当前版本</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {rollbackConfirm && (
        <RollbackConfirmDialog
          versionNo={rollbackConfirm.versionNo}
          onCancel={() => setRollbackConfirm(null)}
          onConfirm={() => { onRollback(rollbackConfirm.id); setRollbackConfirm(null) }}
        />
      )}
    </SlideDrawer>
  )
}

/* ════════════════════════════════════════════
   快照查看抽屉（带关闭动效）
   ════════════════════════════════════════════ */

const SnapshotDrawer = ({ version, onClose }: { version: ApiStudioEndpointVersionItem; onClose: () => void }) => {
  const [isClosing, setIsClosing] = useState(false)
  const handleClose = useCallback(() => { setIsClosing(true); setTimeout(onClose, 300) }, [onClose])

  return (
    <SlideDrawer open={!isClosing} onClose={handleClose} title={`版本 v${version.versionNo} 快照`} maxWidth="600px">
      <div className="p-6">
        <pre className="rounded-lg bg-[var(--color-bg-page)] border border-[var(--color-border)] p-4 text-[11px] font-mono text-[var(--color-text-secondary)] overflow-x-auto max-h-[600px] overflow-y-auto whitespace-pre-wrap">
          {version.snapshotJson ? JSON.stringify(JSON.parse(version.snapshotJson), null, 2) : '无快照数据'}
        </pre>
      </div>
    </SlideDrawer>
  )
}

/* ════════════════════════════════════════════
   调试面板（带关闭动效）
   ════════════════════════════════════════════ */

const DebugPanel = ({ endpoint, environments, selectedEnvironmentId, debugResult, debugRunning, onClose, onExecute }: {
  endpoint: ApiStudioEndpointDetail; environments: ApiStudioEnvironmentDetail[]; selectedEnvironmentId: number | null
  debugResult: ApiStudioDebugExecutionResult | null; debugRunning: boolean
  onClose: () => void; onExecute: (payload: any) => Promise<void>
}) => {
  const [isClosing, setIsClosing] = useState(false)
  const handleClose = useCallback(() => { setIsClosing(true); setTimeout(onClose, 300) }, [onClose])

  const [envId, setEnvId] = useState(selectedEnvironmentId || environments[0]?.id)
  const [requestBody, setRequestBody] = useState('')
  const [pathOverrides, setPathOverrides] = useState('')
  const [queryOverrides, setQueryOverrides] = useState('')
  const [headerOverrides, setHeaderOverrides] = useState('')
  const [copied, setCopied] = useState(false)

  const handleExecute = async () => {
    const payload: any = { environmentId: envId }
    if (requestBody) payload.requestBody = requestBody
    if (pathOverrides) { try { payload.pathOverrides = JSON.parse(pathOverrides) } catch { /* ignore */ } }
    if (queryOverrides) { try { payload.queryOverrides = JSON.parse(queryOverrides) } catch { /* ignore */ } }
    if (headerOverrides) { try { payload.headerOverrides = JSON.parse(headerOverrides) } catch { /* ignore */ } }
    await onExecute(payload)
  }

  const handleCopyResponse = () => {
    if (debugResult?.responseBody) {
      navigator.clipboard.writeText(debugResult.responseBody)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <SlideDrawer open={!isClosing} onClose={handleClose} title="API 调试" description={`${endpoint.method} ${endpoint.path}`} maxWidth="800px">
      <div className="p-6 space-y-4">
        <Select label="环境" value={String(envId)} onChange={(v) => setEnvId(Number(v))}
          options={environments.length > 0 ? environments.map((e) => ({ value: String(e.id), label: e.name })) : [{ value: '0', label: '无可用环境' }]} />

        {/* Path/Query/Header Overrides */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">Path 参数 (JSON)</label>
            <textarea value={pathOverrides} onChange={(e) => setPathOverrides(e.target.value)} rows={2}
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[11px] font-mono focus:border-[var(--color-primary)] focus:outline-none" placeholder='{"id": "123"}' />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">Query 参数 (JSON)</label>
            <textarea value={queryOverrides} onChange={(e) => setQueryOverrides(e.target.value)} rows={2}
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[11px] font-mono focus:border-[var(--color-primary)] focus:outline-none" placeholder='{"page": "1"}' />
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">Header 覆盖 (JSON)</label>
          <textarea value={headerOverrides} onChange={(e) => setHeaderOverrides(e.target.value)} rows={2}
            className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[11px] font-mono focus:border-[var(--color-primary)] focus:outline-none" placeholder='{"X-Custom": "value"}' />
        </div>

        {endpoint.requestBodyType !== 'NONE' && (
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">请求体</label>
            <textarea value={requestBody} onChange={(e) => setRequestBody(e.target.value)} rows={6}
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[12px] font-mono focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" placeholder="输入请求体..." />
          </div>
        )}

        <Button onClick={handleExecute} loading={debugRunning} icon={<Play className="h-4 w-4" />} disabled={!envId}>发送请求</Button>

        {debugResult && (
          <div className="space-y-3 mt-4">
            <div className="flex items-center gap-3">
              <span className={cn('rounded-full px-3 py-1 text-[12px] font-medium', debugResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                {debugResult.statusCode || 'Error'}
              </span>
              <span className="text-[12px] text-[var(--color-text-tertiary)]">{debugResult.durationMillis}ms</span>
              <span className="text-[12px] text-[var(--color-text-tertiary)]">{debugResult.responseBytes} bytes</span>
              {debugResult.responseBody && (
                <button onClick={handleCopyResponse} className="ml-auto flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] cursor-pointer">
                  {copied ? <><Check className="h-3 w-3 text-green-600" />已复制</> : <><Copy className="h-3 w-3" />复制响应</>}
                </button>
              )}
            </div>

            {debugResult.finalUrl && <p className="text-[11px] text-[var(--color-text-tertiary)] font-mono truncate">{debugResult.finalUrl}</p>}

            {debugResult.responseBody && (
              <div>
                <p className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5">响应体</p>
                <pre className="rounded-lg bg-[var(--color-bg-page)] border border-[var(--color-border)] p-4 text-[11px] font-mono text-[var(--color-text-secondary)] overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap">
                  {tryFormatJson(debugResult.responseBody)}
                  {debugResult.responseTruncated && <span className="block mt-2 text-amber-600">（响应已截断）</span>}
                </pre>
              </div>
            )}

            {debugResult.errorMessage && (
              <div className="rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-4 py-3 text-[13px] text-[var(--color-danger)]">{debugResult.errorMessage}</div>
            )}
          </div>
        )}
      </div>
    </SlideDrawer>
  )
}

/* ════════════════════════════════════════════
   删除确认对话框（带关闭动效）
   ════════════════════════════════════════════ */

const DeleteConfirmDialog = ({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) => {
  const [isClosing, setIsClosing] = useState(false)

  const handleClose = useCallback(() => { setIsClosing(true); setTimeout(onCancel, 250) }, [onCancel])
  const handleConfirm = useCallback(() => { setIsClosing(true); setTimeout(onConfirm, 250) }, [onConfirm])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className={cn('absolute inset-0 bg-black/20 backdrop-blur-[2px]', isClosing ? 'animate-fadeOut' : 'animate-fadeIn')} onClick={handleClose} />
      <div className={cn('relative z-10 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] text-center',
        isClosing ? 'animate-scaleOut' : 'animate-scaleIn')}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-light)]"><Trash2 className="h-5 w-5 text-[var(--color-danger)]" /></div>
        <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">确认删除</h3>
        <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">确定要删除「{name}」吗？此操作不可撤销。</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" onClick={handleClose}>取消</Button>
          <Button variant="danger" onClick={handleConfirm}>删除</Button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   回滚确认对话框（带关闭动效）
   ════════════════════════════════════════════ */

const RollbackConfirmDialog = ({ versionNo, onCancel, onConfirm }: { versionNo: number; onCancel: () => void; onConfirm: () => void }) => {
  const [isClosing, setIsClosing] = useState(false)

  const handleClose = useCallback(() => { setIsClosing(true); setTimeout(onCancel, 250) }, [onCancel])
  const handleConfirm = useCallback(() => { setIsClosing(true); setTimeout(onConfirm, 250) }, [onConfirm])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className={cn('absolute inset-0 bg-black/20 backdrop-blur-[2px]', isClosing ? 'animate-fadeOut' : 'animate-fadeIn')} onClick={handleClose} />
      <div className={cn('relative z-10 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] text-center',
        isClosing ? 'animate-scaleOut' : 'animate-scaleIn')}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-light)]"><RotateCcw className="h-5 w-5 text-[var(--color-primary)]" /></div>
        <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">确认回滚</h3>
        <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">确定要回滚到 v{versionNo} 吗？当前内容将被覆盖。</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" onClick={handleClose}>取消</Button>
          <Button onClick={handleConfirm}>回滚</Button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   工具函数
   ════════════════════════════════════════════ */

/** 尝试格式化 JSON 字符串，失败则返回原字符串 */
const tryFormatJson = (str: string): string => {
  if (!str) return str
  try { return JSON.stringify(JSON.parse(str), null, 2) } catch { return str }
}
