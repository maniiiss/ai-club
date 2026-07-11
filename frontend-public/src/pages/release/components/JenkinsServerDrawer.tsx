/**
 * Jenkins 服务管理抽屉。
 * 列表展示 + 创建/编辑/删除/连通性测试，支持分页。
 */
import { useEffect, useState, useCallback } from 'react'
import { SlideDrawer } from '@/src/components/common/SlideDrawer'
import { Input } from '@/src/components/common/Input'
import { Button } from '@/src/components/common/Button'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import {
  pageJenkinsServers,
  createJenkinsServer,
  updateJenkinsServer,
  deleteJenkinsServer,
  testJenkinsServer,
} from '@/src/api/release'
import { getErrorMessage, cn, formatDateTime } from '@/src/lib/utils'
import type { JenkinsServerItem, JenkinsServerPayload } from '@/src/types/release'
import type { PageResponse } from '@/src/types/api'
import { Server, Plus, Pencil, Trash2, Zap, ChevronLeft, ChevronRight } from 'lucide-react'

interface JenkinsServerDrawerProps {
  open: boolean
  onClose: () => void
}

type ViewMode = 'list' | 'form'

export const JenkinsServerDrawer = ({ open, onClose }: JenkinsServerDrawerProps) => {
  const [mode, setMode] = useState<ViewMode>('list')
  const [servers, setServers] = useState<PageResponse<JenkinsServerItem> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  /** 编辑中的 server，null 表示新建。 */
  const [editing, setEditing] = useState<JenkinsServerItem | null>(null)

  /** 表单字段 */
  const [formName, setFormName] = useState('')
  const [formBaseUrl, setFormBaseUrl] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formApiToken, setFormApiToken] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formEnabled, setFormEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  /** 删除确认 */
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  /** 测试中的 server ID */
  const [testingId, setTestingId] = useState<number | null>(null)

  const fetchServers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setServers(await pageJenkinsServers({ page, size: 20 }))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    if (open && mode === 'list') fetchServers()
  }, [open, mode, fetchServers])

  /** 打开新建表单。 */
  const handleOpenNew = () => {
    setEditing(null)
    setFormName('')
    setFormBaseUrl('')
    setFormUsername('')
    setFormApiToken('')
    setFormDescription('')
    setFormEnabled(true)
    setFormError(null)
    setMode('form')
  }

  /** 打开编辑表单。 */
  const handleOpenEdit = (server: JenkinsServerItem) => {
    setEditing(server)
    setFormName(server.name)
    setFormBaseUrl(server.baseUrl)
    setFormUsername(server.username)
    setFormApiToken('')
    setFormDescription(server.description || '')
    setFormEnabled(server.enabled)
    setFormError(null)
    setMode('form')
  }

  /** 保存（创建或更新）。 */
  const handleSave = async () => {
    if (!formName.trim()) { setFormError('名称不能为空'); return }
    if (!formBaseUrl.trim()) { setFormError('地址不能为空'); return }
    if (!formUsername.trim()) { setFormError('用户名不能为空'); return }

    setSaving(true)
    setFormError(null)
    try {
      const payload: JenkinsServerPayload = {
        name: formName.trim(),
        baseUrl: formBaseUrl.trim(),
        username: formUsername.trim(),
        apiToken: formApiToken.trim() || null,
        description: formDescription.trim() || null,
        enabled: formEnabled,
      }
      if (editing) {
        await updateJenkinsServer(editing.id, payload)
      } else {
        await createJenkinsServer(payload)
      }
      setMode('list')
      fetchServers()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  /** 测试连通性。 */
  const handleTest = async (server: JenkinsServerItem) => {
    setTestingId(server.id)
    try {
      await testJenkinsServer(server.id)
      fetchServers()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setTestingId(null)
    }
  }

  /** 确认删除。 */
  const handleDelete = async () => {
    if (deletingId === null) return
    setDeleteLoading(true)
    try {
      await deleteJenkinsServer(deletingId)
      setDeletingId(null)
      fetchServers()
    } catch (err) {
      setFormError(getErrorMessage(err))
      setDeletingId(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      title="Jenkins 服务管理"
      description={mode === 'list' ? '管理 Jenkins CI 服务实例' : editing ? '编辑 Jenkins 服务' : '新建 Jenkins 服务'}
      width="100%"
      maxWidth="900px"
    >
      {mode === 'list' ? (
        <div className="p-6">
          <div className="mb-4 flex justify-end">
            <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={handleOpenNew}>
              新建 Jenkins 服务
            </Button>
          </div>

          {loading ? (
            <LoadingSpinner text="加载 Jenkins 服务…" />
          ) : error ? (
            <ErrorState description={error} onRetry={fetchServers} />
          ) : !servers || servers.records.length === 0 ? (
            <EmptyState
              title="暂无 Jenkins 服务"
              description="添加一个 Jenkins 服务实例以绑定流水线。"
              icon={<Server className="h-6 w-6" strokeWidth={1.5} />}
            />
          ) : (
            <>
              <div className="space-y-3">
                {servers.records.map((server) => (
                  <div
                    key={server.id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                          <h3 className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">{server.name}</h3>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', server.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600')}>
                            {server.enabled ? '已启用' : '已禁用'}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                          <span className="font-mono">{server.baseUrl}</span>
                          <span>用户: {server.username}</span>
                          <span className={cn('rounded px-1.5 py-0.5', server.tokenConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500')}>
                            {server.tokenConfigured ? 'Token 已配置' : '未配置 Token'}
                          </span>
                        </div>
                        {server.lastTestStatus && (
                          <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                            <span className={cn('rounded px-1.5 py-0.5 font-medium', server.lastTestStatus === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                              {server.lastTestStatus}
                            </span>
                            {server.lastTestedAt && <span className="text-[var(--color-text-tertiary)]">{formatDateTime(server.lastTestedAt)}</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleTest(server)}
                          disabled={testingId === server.id}
                          className="rounded-md p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-40"
                          title="测试连通性"
                        >
                          <Zap className={cn('h-3.5 w-3.5', testingId === server.id && 'animate-pulse')} />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(server)}
                          className="rounded-md p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingId(server.id)}
                          className="rounded-md p-1.5 text-[var(--color-text-tertiary)] hover:bg-red-50 hover:text-[var(--color-danger)] transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {servers.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-[13px] text-[var(--color-text-tertiary)]">共 {servers.total} 条，第 {servers.page}/{servers.totalPages} 页</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" icon={<ChevronLeft className="h-4 w-4" />} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</Button>
                    <Button variant="secondary" size="sm" disabled={page >= servers.totalPages} onClick={() => setPage((p) => Math.min(servers.totalPages, p + 1))}>下一页 <ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* 表单视图 */
        <div className="p-6 space-y-5">
          {formError && (
            <div className="rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3.5 py-2.5 text-[13px] text-[var(--color-danger)]">
              {formError}
            </div>
          )}
          <Input label="名称" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="生产 Jenkins" maxLength={100} />
          <Input label="服务地址" value={formBaseUrl} onChange={(e) => setFormBaseUrl(e.target.value)} placeholder="https://jenkins.example.com" maxLength={255} />
          <Input label="用户名" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} placeholder="admin" maxLength={100} />
          <Input
            label="API Token"
            value={formApiToken}
            onChange={(e) => setFormApiToken(e.target.value)}
            placeholder={editing ? '留空表示不修改' : '输入 API Token'}
            maxLength={500}
            hint="Jenkins 个人设置中生成的 API Token"
          />
          <Input label="描述" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="可选" maxLength={500} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formEnabled} onChange={(e) => setFormEnabled(e.target.checked)} className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]" />
            <span className="text-[13px] text-[var(--color-text-primary)]">启用</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setMode('list')}>取消</Button>
            <Button loading={saving} onClick={handleSave}>{editing ? '保存' : '创建'}</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        title="删除 Jenkins 服务"
        description="确定要删除该 Jenkins 服务吗？关联的流水线绑定将不再可用。"
        variant="danger"
        confirmText="删除"
        loading={deleteLoading}
        onCancel={() => setDeletingId(null)}
        onConfirm={handleDelete}
      />
    </SlideDrawer>
  )
}
