/**
 * 工作台卡片：常用系统访问入口。
 * 业务意图：聚合管理员统一维护的系统入口与当前账号自己的常用链接，便于在首页快速跳转。
 * 数据来源：系统入口来自 getDashboardOverview 的 shortcutOverview.systemEntries（只读）；
 * 个人入口走 /api/dashboard/shortcut-entries 读写，按账号在后端持久化。
 * 图标上传复用管理端 /api/common/files/upload（仅需登录态），icon 字段存图片 URL 或图标名。
 * 依赖权限：dashboard:view（由 V110 迁移补授给 PUBLIC_DEFAULT）。
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Plus, Trash2, ExternalLink, Star, Link2, ImagePlus, Pencil, RotateCcw } from 'lucide-react'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { SlideDrawer } from '@/src/components/common/SlideDrawer'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { listDashboardShortcutEntries, saveDashboardShortcutEntries } from '@/src/api/dashboard'
import type {
  DashboardShortcutEntryItem,
  DashboardShortcutPayloadItem,
  DashboardShortcutOverview,
} from '@/src/types/dashboard'
import { uploadShortcutIcon, isImageIcon } from '@/src/lib/shortcutIconUpload'
import { getErrorMessage } from '@/src/lib/utils'

interface ShortcutEntriesWidgetProps {
  /** 工作台概览返回的系统入口聚合（systemEntries 只读展示）。 */
  overview: DashboardShortcutOverview | null
}

export const ShortcutEntriesWidget = ({ overview }: ShortcutEntriesWidgetProps) => {
  const [userEntries, setUserEntries] = useState<DashboardShortcutEntryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newIcon, setNewIcon] = useState<string | null>(null)
  // 编辑模式：null=新增，数字=正在编辑 userEntries 的下标
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [iconUploading, setIconUploading] = useState(false)
  const [iconError, setIconError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)

  const systemEntries = overview?.systemEntries || []

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listDashboardShortcutEntries()
      setUserEntries(list)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // 个人入口整体覆盖保存，后端返回带 id 的最新结果回填本地
  const persist = useCallback(async (next: DashboardShortcutEntryItem[]) => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const payload: DashboardShortcutPayloadItem[] = next.map((e) => ({
        id: e.id,
        name: e.name,
        url: e.url,
        icon: e.icon,
        enabled: e.enabled,
      }))
      const saved = await saveDashboardShortcutEntries(payload)
      setUserEntries(saved)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [])

  const resetForm = () => {
    setNewName('')
    setNewUrl('')
    setNewIcon(null)
    setEditingIndex(null)
    setIconError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openDrawerForAdd = () => {
    resetForm()
    setDrawerOpen(true)
  }

  const openDrawerForEdit = (idx: number) => {
    const entry = userEntries[idx]
    setNewName(entry.name)
    setNewUrl(entry.url)
    setNewIcon(entry.icon ?? null)
    setEditingIndex(idx)
    setIconError(null)
    setDrawerOpen(true)
  }

  const handleClose = () => {
    setDrawerOpen(false)
    resetForm()
  }

  const handleSave = async () => {
    if (!newName.trim() || !newUrl.trim()) return
    let next: DashboardShortcutEntryItem[]
    if (editingIndex === null) {
      // 新增：追加一条新入口
      next = [
        ...userEntries,
        { name: newName.trim(), url: newUrl.trim(), icon: newIcon, enabled: true },
      ]
    } else {
      // 编辑：保留原 id 与 enabled，仅更新名称、地址、图标
      next = userEntries.map((e, i) =>
        i === editingIndex
          ? { ...e, name: newName.trim(), url: newUrl.trim(), icon: newIcon }
          : e,
      )
    }
    await persist(next)
    resetForm()
    setDrawerOpen(false)
  }

  const handleDelete = async (idx: number) => {
    const next = userEntries.filter((_, i) => i !== idx)
    await persist(next)
  }

  const handleIconFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIconUploading(true)
    setIconError(null)
    try {
      const url = await uploadShortcutIcon(file)
      setNewIcon(url)
    } catch (err) {
      setIconError(getErrorMessage(err))
    } finally {
      setIconUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const isEditing = editingIndex !== null

  return (
    <Card
      title="常用系统访问入口"
      action={
        <Button
          variant="ghost"
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={openDrawerForAdd}
        >
          添加
        </Button>
      }
    >
      {loading ? (
        <LoadingSpinner text="加载入口…" />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : (
        <div className="space-y-4">
          {/* 系统推荐入口（管理员统一维护，只读） */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
              系统推荐
            </p>
            {systemEntries.length === 0 ? (
              <p className="text-[12px] text-[var(--color-text-tertiary)]">暂无系统入口</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {systemEntries.map((entry) => (
                  <a
                    key={entry.id ?? entry.url}
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2.5 transition-all hover:border-[var(--color-primary)]/20 hover:shadow-[var(--shadow-sm)]"
                  >
                    {isImageIcon(entry.icon) ? (
                      <img
                        src={entry.icon as string}
                        alt=""
                        className="h-4 w-4 flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <Star className="h-4 w-4 flex-shrink-0 text-amber-500" />
                    )}
                    <span className="truncate text-[12px] text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)]">
                      {entry.name}
                    </span>
                    <ExternalLink className="ml-auto h-3 w-3 flex-shrink-0 text-[var(--color-text-tertiary)]" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* 我的常用入口（当前账号私有，可增删改） */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
              我的常用
            </p>
            {userEntries.length === 0 ? (
              <p className="text-[12px] text-[var(--color-text-tertiary)]">点击「添加」收藏常用链接</p>
            ) : (
              <div className="space-y-1.5">
                {userEntries.map((entry, idx) => (
                  <div
                    key={entry.id ?? entry.url}
                    className="group flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2.5"
                  >
                    {isImageIcon(entry.icon) ? (
                      <img
                        src={entry.icon as string}
                        alt=""
                        className="h-4 w-4 flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <Link2 className="h-4 w-4 flex-shrink-0 text-[var(--color-text-tertiary)]" />
                    )}
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text-primary)] hover:text-[var(--color-primary)] hover:underline"
                    >
                      {entry.name}
                    </a>
                    <button
                      type="button"
                      onClick={() => openDrawerForEdit(idx)}
                      className="flex-shrink-0 rounded p-1 text-[var(--color-text-tertiary)] opacity-0 transition-opacity hover:text-[var(--color-primary)] group-hover:opacity-100"
                      aria-label="编辑"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
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
              </div>
            )}
          </div>
        </div>
      )}

      <SlideDrawer
        open={drawerOpen}
        onClose={handleClose}
        title={isEditing ? '编辑常用入口' : '添加常用入口'}
        description="收藏一个常用链接，可上传自定义图标"
        maxWidth="480px"
        footer={
          <>
            <Button variant="secondary" onClick={handleClose} disabled={saving}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={!newName.trim() || !newUrl.trim()}
              onClick={handleSave}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4 p-6">
          <Input
            label="名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例如：内部 Wiki"
            maxLength={50}
          />
          <Input
            label="地址"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://..."
          />
          {/* 图标上传：隐藏 input + 预览 + 上传/恢复默认按钮 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">图标</label>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)]">
                {isImageIcon(newIcon) ? (
                  <img src={newIcon as string} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Link2 className="h-5 w-5 text-[var(--color-text-tertiary)]" />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleIconFileChange}
                className="hidden"
              />
              <Button
                variant="secondary"
                size="sm"
                icon={<ImagePlus className="h-3.5 w-3.5" />}
                loading={iconUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                上传图片
              </Button>
              {newIcon && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  onClick={() => setNewIcon(null)}
                >
                  恢复默认
                </Button>
              )}
            </div>
            {iconError && <p className="text-[12px] text-[var(--color-danger)]">{iconError}</p>}
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              支持 PNG/JPG/GIF/WebP，不超过 5MB
            </p>
          </div>
        </div>
      </SlideDrawer>
    </Card>
  )
}
