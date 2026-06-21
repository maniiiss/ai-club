/**
 * Webhook 管理弹窗。
 * 展示指定自动合并配置下的 Webhook 列表，支持新建、编辑、删除和测试投递。
 */
import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { X, Plus, Trash2, Send, Pencil, Bell, CheckCircle, XCircle, Clock } from 'lucide-react'
import {
  listAutoMergeWebhooks,
  createAutoMergeWebhook,
  updateAutoMergeWebhook,
  deleteAutoMergeWebhook,
  testAutoMergeWebhook,
} from '@/src/api/development'
import type {
  GitlabAutoMergeWebhookItem,
  GitlabAutoMergeWebhookPayload,
} from '@/src/types/development'
import { GITLAB_AUTO_MERGE_WEBHOOK_EVENT_OPTIONS } from '@/src/types/development'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { cn, formatDate, getErrorMessage } from '@/src/lib/utils'

/* ── 初始表单 ── */

const initialForm: GitlabAutoMergeWebhookPayload = {
  name: '',
  targetUrl: '',
  subscribedEvents: [],
  messageTemplate: '',
  enabled: true,
}

/* ── 主组件 ── */

interface WebhookDialogProps {
  configId: number
  configName: string
  onClose: () => void
}

export const WebhookDialog = ({ configId, configName, onClose }: WebhookDialogProps) => {
  const [webhooks, setWebhooks] = useState<GitlabAutoMergeWebhookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* 编辑/新建表单 */
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<GitlabAutoMergeWebhookItem | null>(null)
  const [form, setForm] = useState<GitlabAutoMergeWebhookPayload>(initialForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  /* 测试投递状态 */
  const [testingId, setTestingId] = useState<number | null>(null)

  const fetchWebhooks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listAutoMergeWebhooks(configId)
      setWebhooks(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [configId])

  useEffect(() => {
    fetchWebhooks()
  }, [fetchWebhooks])

  /* 打开新建表单 */
  const openCreate = () => {
    setEditing(null)
    setForm(initialForm)
    setFormError(null)
    setFormOpen(true)
  }

  /* 打开编辑表单 */
  const openEdit = (wh: GitlabAutoMergeWebhookItem) => {
    setEditing(wh)
    setForm({
      name: wh.name,
      targetUrl: '',
      subscribedEvents: [...wh.subscribedEvents],
      messageTemplate: wh.messageTemplate || '',
      enabled: wh.enabled,
    })
    setFormError(null)
    setFormOpen(true)
  }

  /* 提交表单 */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        await updateAutoMergeWebhook(editing.id, form)
      } else {
        await createAutoMergeWebhook(configId, form)
      }
      setFormOpen(false)
      await fetchWebhooks()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  /* 删除 */
  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该 Webhook？')) return
    try {
      await deleteAutoMergeWebhook(id)
      await fetchWebhooks()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  /* 测试投递 */
  const handleTest = async (id: number) => {
    setTestingId(id)
    try {
      const updated = await testAutoMergeWebhook(id)
      setWebhooks((prev) => prev.map((w) => (w.id === id ? updated : w)))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setTestingId(null)
    }
  }

  /* 事件多选切换 */
  const toggleEvent = (value: string) => {
    setForm((prev) => ({
      ...prev,
      subscribedEvents: prev.subscribedEvents.includes(value)
        ? prev.subscribedEvents.filter((e) => e !== value)
        : [...prev.subscribedEvents, value],
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-[720px] flex-col rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] animate-scaleIn">
        {/* 头部 */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--color-border-light)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50">
              <Bell className="h-4.5 w-4.5 text-amber-600" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">Webhook 通知</h2>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">{configName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {formOpen ? (
            /* ── 新建/编辑表单 ── */
            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                {editing ? '编辑 Webhook' : '新建 Webhook'}
              </h3>
              {formError && (
                <div className="rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3 py-2 text-[13px] text-[var(--color-danger)]">
                  {formError}
                </div>
              )}
              <Input
                label="名称 *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
                placeholder="例如：飞书通知、钉钉群"
              />
              <Input
                label={editing ? '目标 URL（留空保留原 URL）' : '目标 URL *'}
                value={form.targetUrl}
                onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                required={!editing}
                placeholder="https://hooks.example.com/..."
              />

              {/* 事件多选 */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-text-secondary)]">
                  订阅事件
                </label>
                <div className="flex flex-wrap gap-2">
                  {GITLAB_AUTO_MERGE_WEBHOOK_EVENT_OPTIONS.map((opt) => {
                    const active = form.subscribedEvents.includes(opt.value)
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleEvent(opt.value)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-[12px] font-medium transition-all',
                          active
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                            : 'border-[var(--color-border)] bg-white text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/40',
                        )}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 消息模板 */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[var(--color-text-secondary)]">
                  消息模板
                </label>
                <textarea
                  value={form.messageTemplate || ''}
                  onChange={(e) => setForm({ ...form, messageTemplate: e.target.value })}
                  rows={3}
                  placeholder="留空使用默认模板。支持变量：{configName}, {result}, {mrTitle}, {mrUrl}"
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 py-2 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
                />
              </div>

              {/* 启用开关 */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]"
                />
                <span className="text-[13px] text-[var(--color-text-primary)]">启用</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" type="button" onClick={() => setFormOpen(false)}>
                  取消
                </Button>
                <Button type="submit" loading={saving}>
                  {editing ? '保存' : '创建'}
                </Button>
              </div>
            </form>
          ) : loading ? (
            <LoadingSpinner text="加载 Webhook…" />
          ) : error ? (
            <ErrorState description={error} onRetry={fetchWebhooks} />
          ) : webhooks.length === 0 ? (
            <EmptyState
              title="暂无 Webhook"
              description="创建 Webhook 后，自动合并事件将推送到指定 URL。"
              icon={<Bell className="h-6 w-6" strokeWidth={1.5} />}
            />
          ) : (
            /* ── Webhook 列表 ── */
            <div className="space-y-3">
              {webhooks.map((wh) => (
                <div
                  key={wh.id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                          {wh.name}
                        </span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-medium',
                            wh.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {wh.enabled ? '启用' : '禁用'}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[12px] font-mono text-[var(--color-text-tertiary)]">
                        {wh.targetUrlMasked}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {wh.subscribedEvents.map((evt) => {
                          const opt = GITLAB_AUTO_MERGE_WEBHOOK_EVENT_OPTIONS.find((o) => o.value === evt)
                          return (
                            <span
                              key={evt}
                              className="rounded-full bg-[var(--color-bg-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)]"
                            >
                              {opt?.label || evt}
                            </span>
                          )
                        })}
                      </div>
                      {/* 最近投递状态 */}
                      {wh.lastDeliveryAt && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                          {wh.lastDeliveryStatus === 'SUCCESS' ? (
                            <CheckCircle className="h-3 w-3 text-emerald-600" />
                          ) : wh.lastDeliveryStatus === 'FAILED' ? (
                            <XCircle className="h-3 w-3 text-red-600" />
                          ) : (
                            <Clock className="h-3 w-3 text-gray-500" />
                          )}
                          <span>
                            最近投递：{wh.lastDeliveryStatus} · {formatDate(wh.lastDeliveryAt)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="测试投递"
                        onClick={() => handleTest(wh.id)}
                        disabled={testingId === wh.id}
                        className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="编辑"
                        onClick={() => openEdit(wh)}
                        className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="删除"
                        onClick={() => handleDelete(wh.id)}
                        className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部 */}
        {!formOpen && webhooks.length > 0 && (
          <div className="flex flex-shrink-0 justify-end border-t border-[var(--color-border-light)] px-6 py-3">
            <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
              新建 Webhook
            </Button>
          </div>
        )}
        {!formOpen && !loading && webhooks.length === 0 && (
          <div className="flex flex-shrink-0 justify-center border-t border-[var(--color-border-light)] px-6 py-3">
            <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
              新建 Webhook
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
