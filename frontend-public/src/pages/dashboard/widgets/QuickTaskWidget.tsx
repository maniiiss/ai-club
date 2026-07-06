/**
 * 工作台卡片：快捷任务（便签）。
 * 业务意图：让研发用户在首页记录临时待办与笔记，数据按账号在后端持久化，
 * 与管理端首页便签共享同一份数据（/api/dashboard/quick-tasks）。
 * 依赖权限：dashboard:view（由 V110 迁移补授给 PUBLIC_DEFAULT）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { listDashboardQuickTasks, saveDashboardQuickTasks } from '@/src/api/dashboard'
import type {
  DashboardQuickTaskItem,
  DashboardQuickTaskPayloadItem,
} from '@/src/types/dashboard'
import { cn, getErrorMessage } from '@/src/lib/utils'

/** 与管理端保持一致的单账号便签上限。 */
const QUICK_TASK_LIMIT = 20

export const QuickTaskWidget = () => {
  const [tasks, setTasks] = useState<DashboardQuickTaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listDashboardQuickTasks()
      setTasks(list)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // 持久化：以整体覆盖方式保存当前便签列表，后端返回带 id 的最新结果回填本地
  const persist = useCallback(async (next: DashboardQuickTaskItem[]) => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const payload: DashboardQuickTaskPayloadItem[] = next.map((t) => ({
        id: t.id,
        clientKey: t.clientKey,
        content: t.content,
        checked: t.checked,
      }))
      const saved = await saveDashboardQuickTasks(payload)
      setTasks(saved)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [])

  const handleAdd = () => {
    if (tasks.length >= QUICK_TASK_LIMIT) return
    // 新增空草稿行，待用户输入内容失焦后再持久化
    setTasks([
      ...tasks,
      { clientKey: `local-${Date.now()}`, content: '', checked: false },
    ])
  }

  const handleToggle = (idx: number) => {
    const next = tasks.map((t, i) => (i === idx ? { ...t, checked: !t.checked } : t))
    setTasks(next)
    persist(next)
  }

  const handleContentChange = (idx: number, content: string) => {
    setTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, content } : t)))
  }

  const handleBlur = (idx: number) => {
    const task = tasks[idx]
    // 仍未输入内容的草稿行：失焦时清掉，不保存
    if (!task.content.trim() && !task.id) {
      setTasks(tasks.filter((_, i) => i !== idx))
      return
    }
    persist(tasks)
  }

  const handleDelete = (idx: number) => {
    const next = tasks.filter((_, i) => i !== idx)
    setTasks(next)
    persist(next)
  }

  return (
    <Card
      title="快捷任务"
      action={
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={handleAdd}
          disabled={tasks.length >= QUICK_TASK_LIMIT || saving}
        >
          新增
        </Button>
      }
    >
      {loading ? (
        <LoadingSpinner text="加载便签…" />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : tasks.length === 0 ? (
        <EmptyState title="暂无便签" description="记录临时待办与笔记，最多 20 条。" />
      ) : (
        <div className="space-y-1.5">
          {tasks.map((task, idx) => (
            <div
              key={task.id ?? task.clientKey ?? idx}
              className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-[var(--color-bg-hover)]"
            >
              <button
                type="button"
                onClick={() => handleToggle(idx)}
                className={cn(
                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors',
                  task.checked
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                    : 'border-[var(--color-border-strong)] bg-white hover:border-[var(--color-primary)]',
                )}
                aria-label={task.checked ? '标记为未完成' : '标记为已完成'}
              >
                {task.checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </button>
              <input
                value={task.content}
                onChange={(e) => handleContentChange(idx, e.target.value)}
                onBlur={() => handleBlur(idx)}
                placeholder="输入任务内容…"
                className={cn(
                  'flex-1 bg-transparent text-[13px] outline-none',
                  task.checked
                    ? 'text-[var(--color-text-tertiary)] line-through'
                    : 'text-[var(--color-text-primary)]',
                )}
              />
              <button
                type="button"
                onClick={() => handleDelete(idx)}
                className="flex-shrink-0 rounded p-1 text-[var(--color-text-tertiary)] opacity-0 transition-opacity hover:text-[var(--color-danger)] group-hover:opacity-100"
                aria-label="删除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {saving && (
            <p className="pt-1 text-[11px] text-[var(--color-text-tertiary)]">保存中…</p>
          )}
        </div>
      )}
    </Card>
  )
}
