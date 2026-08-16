import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Clock3, FileCode2, History, Layers3, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { activateDesignVersion, getDesignVersion, listDesignVersions, restoreDesignVersion } from '@/src/api/design-versions'
import { Button } from '@/src/components/common/Button'
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog'
import { EmptyState } from '@/src/components/common/EmptyState'
import { ErrorState } from '@/src/components/common/ErrorState'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import type { DesignVersionDetail, DesignVersionStatus, DesignVersionSummary } from '@/src/types/design-version'
import { cn, formatDate } from '@/src/lib/utils'

type PendingAction = 'activate' | 'restore' | null

const statusLabel: Record<DesignVersionStatus, string> = { DRAFT: '草稿', CURRENT: '当前版本', ARCHIVED: '历史版本' }
const statusClass: Record<DesignVersionStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 ring-amber-200',
  CURRENT: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ARCHIVED: 'bg-slate-100 text-slate-600 ring-slate-200',
}

const formatBytes = (value: number) => value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(2)} MB`

/** 项目内的远端 Design 修订工作台，预览只使用受限 srcDoc iframe。 */
export const DesignVersionsPage = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)
  const [versions, setVersions] = useState<DesignVersionSummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<DesignVersionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const loadVersions = useCallback(async (preferredId?: number) => {
    if (!Number.isInteger(pid) || pid <= 0) return
    setLoading(true)
    setError(null)
    try {
      const result = await listDesignVersions(pid)
      setVersions(result.versions)
      const current = result.versions.find((item) => item.status === 'CURRENT')
      const draft = result.versions.find((item) => item.status === 'DRAFT')
      setSelectedId((existing) => preferredId ?? (existing && result.versions.some((item) => item.id === existing) ? existing : current?.id ?? draft?.id ?? result.versions[0]?.id ?? null))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载设计版本失败')
    } finally {
      setLoading(false)
    }
  }, [pid])

  useEffect(() => { void loadVersions() }, [loadVersions])

  useEffect(() => {
    if (!selectedId || !pid) { setDetail(null); return }
    let cancelled = false
    setDetailLoading(true)
    void getDesignVersion(pid, selectedId)
      .then((value) => { if (!cancelled) setDetail(value) })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '加载版本详情失败') })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [pid, selectedId])

  const selected = useMemo(() => versions.find((version) => version.id === selectedId) ?? null, [selectedId, versions])
  const files = detail?.snapshot.files ?? []
  const executeAction = async () => {
    if (!detail || !pendingAction) return
    setWorking(true)
    setError(null)
    try {
      const result = pendingAction === 'activate'
        ? await activateDesignVersion(pid, detail.id)
        : await restoreDesignVersion(pid, detail.id)
      setPendingAction(null)
      await loadVersions(result.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作设计版本失败')
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <LoadingSpinner text="加载设计版本…" />
  if (error && versions.length === 0) return <ErrorState title="加载设计版本失败" description={error} onRetry={() => void loadVersions()} />

  return <div className="mx-auto flex min-h-full max-w-[1440px] flex-col gap-4 pb-5 animate-fadeIn">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-4">
      <div><div className="mb-1 flex items-center gap-2 text-[12px] font-medium text-[var(--color-primary)]"><Layers3 className="h-4 w-4" />项目设计</div><h1 className="text-[22px] font-semibold text-[var(--color-text-primary)]">设计版本</h1><p className="mt-1 text-[13px] text-[var(--color-text-tertiary)]">查看 Desktop 上传的设计快照，选择一个版本预览、激活或创建新草稿。</p></div>
      <Button type="button" variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void loadVersions()}>刷新</Button>
    </header>

    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
    {versions.length === 0 ? <EmptyState title="暂无设计版本" description="在 GitPilot Desktop 的版本管理中上传本地设计修订后，版本会出现在这里。" icon={<History className="h-6 w-6" />} /> : <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[315px_minmax(0,1fr)]">
      <aside className="min-h-0 border border-[var(--color-border)] bg-[var(--color-bg-card)] xl:overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3"><span className="text-[12px] font-semibold text-[var(--color-text-secondary)]">版本时间线</span><span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">{versions.length}</span></div>
        <div className="p-2">{versions.map((version) => <button type="button" key={version.id} onClick={() => setSelectedId(version.id)} className={cn('mb-1 block w-full border px-3 py-3 text-left transition-colors', selectedId === version.id ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]' : 'border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]')}>
          <div className="flex items-center justify-between gap-2"><strong className="min-w-0 truncate text-[12px] font-semibold text-[var(--color-text-primary)]">v{version.versionNumber} · {version.title}</strong><span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset', statusClass[version.status])}>{statusLabel[version.status]}</span></div>
          <p className="mt-1 truncate text-[11px] text-[var(--color-text-tertiary)]">{version.summary || '未填写更新说明'}</p><div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--color-text-tertiary)]"><Clock3 className="h-3 w-3" />{formatDate(version.createdAt)}<span>{version.fileCount} 个文件</span></div>
        </button>)}</div>
      </aside>

      <section className="min-w-0 border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        {detailLoading || !detail ? <LoadingSpinner text="加载版本快照…" /> : <div className="flex min-h-[620px] flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-4 lg:px-5"><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-[17px] font-semibold text-[var(--color-text-primary)]">{detail.title}</h2><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset', statusClass[detail.status])}>{statusLabel[detail.status]}</span></div><p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">{detail.summary || '未填写更新说明'} · 本地修订 {detail.revisionId}</p></div><div className="flex gap-2">{detail.status !== 'CURRENT' && <Button type="button" size="sm" variant="secondary" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setPendingAction('activate')}>激活版本</Button>}<Button type="button" size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setPendingAction('restore')}>创建草稿</Button></div></div>
          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-h-[400px] bg-slate-100 p-3"><iframe title={`${detail.title} HTML 预览`} sandbox="allow-scripts" srcDoc={detail.previewHtml} className="h-full min-h-[400px] w-full border border-[var(--color-border-strong)] bg-white shadow-sm" /></div>
            <aside className="min-h-0 border-t border-[var(--color-border)] xl:border-l xl:border-t-0"><div className="border-b border-[var(--color-border)] px-4 py-3"><div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--color-text-secondary)]"><FileCode2 className="h-4 w-4" />文件清单</div><p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{files.length} 个文件 · {formatBytes(selected?.snapshotBytes ?? 0)}</p></div><div className="max-h-[320px] overflow-y-auto p-2">{files.map((file) => <div key={file.path} className="mb-1 rounded-md px-2 py-2 font-mono text-[10px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"><div className="truncate" title={file.path}>{file.path}</div><div className="mt-0.5 text-[9px] uppercase text-[var(--color-text-tertiary)]">{file.language || 'text'}</div></div>)}</div></aside>
          </div>
        </div>}
      </section>
    </div>}
    <ConfirmDialog open={pendingAction !== null} title={pendingAction === 'activate' ? '激活设计版本' : '从历史创建草稿'} description={pendingAction === 'activate' ? '激活后同一设计的旧当前版本会归档，历史快照不会被修改。' : '将复制选中版本的完整快照并创建一个新的 Web 草稿。'} confirmText={pendingAction === 'activate' ? '激活' : '创建草稿'} loading={working} onCancel={() => setPendingAction(null)} onConfirm={() => void executeAction()} />
  </div>
}
