/**
 * 文档模块页面。
 * 三个子 Tab：Wiki 空间（含 CRUD）、知识图谱、API。
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  BookOpen, FolderTree, FileText, Network, Search,
  ChevronRight, ChevronDown, Edit3, Trash2, Plus, X, Save, AlertTriangle,
  History, Upload, RotateCcw, FileUp, Code2,
} from 'lucide-react'
import { Markdown } from '@/src/components/common/Markdown'
import { MarkdownEditor } from '@/src/components/common/MarkdownEditor'
import { WIKI_PAGE_TEMPLATE } from '@/src/lib/markdownTemplates'
import { uploadMarkdownImage } from '@/src/lib/markdownImageUpload'
import {
  listWikiSpaces, getWikiDirectoryTree, getWikiPage, searchWikiPages,
  getWikiSpaceKnowledgeGraph,
  createWikiPage, updateWikiPage, deleteWikiPage,
  createWikiDirectory, deleteWikiDirectory,
  listWikiPageVersions, restoreWikiPageVersion,
  uploadDocumentAsset, previewWikiImport, importWikiPage,
} from '@/src/api/knowledge'
import type { WikiPagePayload, WikiDirectoryPayload, WikiImportPagePayload } from '@/src/api/knowledge'
import type {
  WikiSpaceItem, WikiDirectoryTreeNodeItem, WikiSpacePageSummaryItem,
  WikiSpacePageDetailItem, WikiSpacePageVersionItem, DocumentMarkdownResultItem,
  WikiSpaceKnowledgeGraphItem,
} from '@/src/types/knowledge'
import { KnowledgeGraphView } from '@/src/components/knowledge/KnowledgeGraphView'
import { ApiStudioPanel } from './ApiStudioPanel'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { cn, formatDate, getErrorMessage } from '@/src/lib/utils'

type KnowledgeTab = 'wiki' | 'graph' | 'api'

const tabs: { key: KnowledgeTab; label: string; icon: typeof BookOpen }[] = [
  { key: 'wiki', label: 'Wiki', icon: BookOpen },
  { key: 'graph', label: '知识图谱', icon: Network },
  { key: 'api', label: 'API', icon: Code2 },
]

export const KnowledgePage = () => {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>('wiki')

  return (
    <div className="h-full flex flex-col overflow-hidden animate-fadeIn">
      <div className="flex-shrink-0 mb-6 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)] w-fit">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150 cursor-pointer',
              activeTab === tab.key ? 'bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]')}>
            <tab.icon className="h-3.5 w-3.5" strokeWidth={1.75} />{tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
      {activeTab === 'wiki' && <WikiPanel />}
      {activeTab === 'graph' && <GraphPanel />}
      {activeTab === 'api' && <ApiStudioPanel />}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════
   Wiki 面板（含完整 CRUD）
   ════════════════════════════════════════════ */

const WikiPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [spaces, setSpaces] = useState<WikiSpaceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedSpace, setSelectedSpace] = useState<WikiSpaceItem | null>(null)
  const [tree, setTree] = useState<WikiDirectoryTreeNodeItem[]>([])
  const [treeLoading, setTreeLoading] = useState(false)

  const [selectedPage, setSelectedPage] = useState<WikiSpacePageDetailItem | null>(null)
  const [pageLoading, setPageLoading] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [keyword, setKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<WikiSpacePageSummaryItem[]>([])

  // 弹窗
  const [newPageDialog, setNewPageDialog] = useState<{ open: boolean; directoryId: number; pages: WikiSpacePageSummaryItem[] }>({ open: false, directoryId: 0, pages: [] })
  const [newDirDialog, setNewDirDialog] = useState<{ open: boolean; parentDirectoryId?: number }>({ open: false })
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'page' | 'directory'; id: number; name: string } | null>(null)

  // 版本历史面板
  const [versionPanel, setVersionPanel] = useState<{ open: boolean; versions: WikiSpacePageVersionItem[]; loading: boolean }>({ open: false, versions: [], loading: false })
  const [versionRestoreConfirm, setVersionRestoreConfirm] = useState<{ versionNumber: number } | null>(null)

  // 文档导入对话框
  const [importDialog, setImportDialog] = useState<{ open: boolean; directoryId: number }>({ open: false, directoryId: 0 })
  const [importLoading, setImportLoading] = useState(false)
  const [importPreview, setImportPreview] = useState<DocumentMarkdownResultItem | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // 移动端目录树展开状态
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false)

  useEffect(() => {
    const fetch = async () => { setLoading(true); try { setSpaces(await listWikiSpaces({ projectId: pid })) } catch (err) { setError(getErrorMessage(err)) } finally { setLoading(false) } }
    fetch()
  }, [pid])

  const handleSelectSpace = async (space: WikiSpaceItem) => {
    setSelectedSpace(space); setSelectedPage(null); setTreeLoading(true)
    try { setTree(await getWikiDirectoryTree(space.id)) } catch { setTree([]) } finally { setTreeLoading(false) }
  }

  const refreshTree = async () => {
    if (!selectedSpace) return
    try { setTree(await getWikiDirectoryTree(selectedSpace.id)) } catch { /* ignore */ }
  }

  const handleSelectPage = async (spaceId: number, pageId: number) => {
    setPageLoading(true); setEditing(false); setVersionPanel({ open: false, versions: [], loading: false })
    try { const p = await getWikiPage(spaceId, pageId); setSelectedPage(p); setEditContent(p.content); setEditTitle(p.title) }
    catch { setSelectedPage(null) } finally { setPageLoading(false) }
  }

  const handleStartEdit = () => { if (selectedPage) { setEditContent(selectedPage.content); setEditTitle(selectedPage.title); setEditing(true) } }

  const handleSavePage = async () => {
    if (!selectedSpace || !selectedPage) return
    setSaving(true); setSaveError(null)
    try {
      const payload: WikiPagePayload = { directoryId: selectedPage.directoryId, title: editTitle, content: editContent, changeSummary: '编辑更新' }
      const updated = await updateWikiPage(selectedSpace.id, selectedPage.id, payload)
      setSelectedPage(updated); setEditing(false)
    } catch (err) { setSaveError(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  const handleCreatePage = async (directoryId: number, title: string, parentPageId?: number | null, content?: string) => {
    if (!selectedSpace) return
    try {
      const payload: WikiPagePayload = { directoryId, parentPageId: parentPageId ?? null, title, content: content ?? '', changeSummary: '新建页面' }
      const created = await createWikiPage(selectedSpace.id, payload)
      await refreshTree()
      setSelectedPage(created); setEditContent(created.content); setEditTitle(created.title); setEditing(true)
    } catch { /* ignore */ }
    setNewPageDialog({ open: false, directoryId: 0, pages: [] })
  }

  const handleCreateDirectory = async (name: string, parentDirectoryId?: number) => {
    if (!selectedSpace) return
    try {
      const payload: WikiDirectoryPayload = { name, content: '', parentDirectoryId: parentDirectoryId ?? null, boundProjectId: pid }
      await createWikiDirectory(selectedSpace.id, payload)
      await refreshTree()
    } catch { /* ignore */ }
    setNewDirDialog({ open: false })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm || !selectedSpace) return
    try {
      if (deleteConfirm.type === 'page') { await deleteWikiPage(selectedSpace.id, deleteConfirm.id); setSelectedPage(null); await refreshTree() }
      else { await deleteWikiDirectory(selectedSpace.id, deleteConfirm.id); await refreshTree() }
    } catch { /* ignore */ }
    setDeleteConfirm(null)
  }

  const handleSearch = async () => {
    if (!keyword.trim()) { setSearchResults([]); return }
    try { setSearchResults(await searchWikiPages({ keyword, projectId: pid })) } catch { setSearchResults([]) }
  }

  // ── 版本历史 ──

  /** 打开版本历史面板，加载版本列表。 */
  const openVersionPanel = async () => {
    if (!selectedSpace || !selectedPage) return
    setVersionPanel({ open: true, versions: [], loading: true })
    try {
      const versions = await listWikiPageVersions(selectedSpace.id, selectedPage.id)
      setVersionPanel({ open: true, versions, loading: false })
    } catch {
      setVersionPanel({ open: true, versions: [], loading: false })
    }
  }

  /** 恢复到指定版本。 */
  const handleRestoreVersion = async (versionNumber: number) => {
    if (!selectedSpace || !selectedPage) return
    try {
      const restored = await restoreWikiPageVersion(selectedSpace.id, selectedPage.id, versionNumber)
      setSelectedPage(restored); setEditContent(restored.content); setEditTitle(restored.title)
      await refreshTree()
      // 刷新版本列表
      const versions = await listWikiPageVersions(selectedSpace.id, restored.id)
      setVersionPanel({ open: true, versions, loading: false })
    } catch { /* ignore */ }
    setVersionRestoreConfirm(null)
  }

  // ── 文档导入 ──

  /** 处理导入文件选择：上传文件并生成预览。 */
  const handleImportFile = async (file: File) => {
    if (!selectedSpace) return
    setImportLoading(true); setImportError(null); setImportPreview(null)
    try {
      const asset = await uploadDocumentAsset(file, `wiki-spaces/space-${selectedSpace.id}`)
      const preview = await previewWikiImport(selectedSpace.id, asset.id)
      setImportPreview(preview)
    } catch (err) {
      setImportError(getErrorMessage(err))
    } finally {
      setImportLoading(false)
    }
  }

  /** 从导入预览创建新页面。 */
  const handleImportCreate = async (directoryId: number, title: string, parentPageId?: number | null) => {
    if (!selectedSpace || !importPreview) return
    try {
      const payload: WikiImportPagePayload = {
        assetId: importPreview.assetId,
        directoryId,
        parentPageId: parentPageId ?? null,
        title,
        content: importPreview.markdown,
      }
      const created = await importWikiPage(selectedSpace.id, payload)
      await refreshTree()
      setSelectedPage(created); setEditContent(created.content); setEditTitle(created.title); setEditing(true)
    } catch { /* ignore */ }
    setImportDialog({ open: false, directoryId: 0 })
    setImportPreview(null)
  }

  /** 从目录树节点中收集指定目录下的页面列表（用于父页面选择）。 */
  const collectDirPages = (directoryId: number): WikiSpacePageSummaryItem[] => {
    const findNode = (nodes: WikiDirectoryTreeNodeItem[]): WikiDirectoryTreeNodeItem | null => {
      for (const n of nodes) {
        if (n.id === directoryId) return n
        const found = findNode(n.children)
        if (found) return found
      }
      return null
    }
    const node = findNode(tree)
    return node?.pages ?? []
  }

  if (loading) return <LoadingSpinner text="加载 Wiki 空间…" />
  if (error) return <ErrorState description={error} />

  // ── 空间列表 ──
  if (!selectedSpace) {
    return (
      <div>
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input type="text" placeholder="搜索 Wiki 页面…" value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20" />
          </div>
        </div>
        {searchResults.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">搜索结果</h3>
            {searchResults.map((r) => (
              <div key={r.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 hover:shadow-[var(--shadow-sm)] transition-shadow cursor-pointer"
                onClick={() => { const space = spaces.find((s) => s.id === r.spaceId); if (space) { handleSelectSpace(space).then(() => handleSelectPage(r.spaceId, r.id)) } }}>
                <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{r.title}</p>
                <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">{r.spaceName} / {r.directoryName}</p>
              </div>
            ))}
          </div>
        ) : spaces.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]">
            <EmptyState title="暂无 Wiki 空间" description="该项目还没有关联的 Wiki 空间。" icon={<BookOpen className="h-6 w-6" strokeWidth={1.5} />} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {spaces.map((space) => (
              <button key={space.id} onClick={() => handleSelectSpace(space)}
                className="group text-left rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:border-[var(--color-primary)]/20 hover:shadow-[var(--shadow-card-hover)] cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-light)] transition-colors group-hover:bg-[var(--color-primary)]">
                    <BookOpen className="h-5 w-5 text-[var(--color-primary)] group-hover:text-white" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">{space.name}</h3>
                    <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)] truncate">{space.description || '暂无描述'}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                  <span className="flex items-center gap-1"><FolderTree className="h-3 w-3" />{space.directoryCount} 目录</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{space.pageCount} 页面</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── 空间详情：目录树 + 页面内容 ──
  return (
    <div className="h-full flex flex-col lg:flex-row gap-5 overflow-hidden">
      {/* 移动端目录树切换按钮 */}
      <div className="lg:hidden flex-shrink-0">
        <button
          onClick={() => setMobileTreeOpen(!mobileTreeOpen)}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-text-primary)] cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-[var(--color-primary)]" />
            {selectedSpace.name}
          </span>
          <ChevronDown className={cn('h-4 w-4 text-[var(--color-text-tertiary)] transition-transform', mobileTreeOpen && 'rotate-180')} />
        </button>
      </div>

      {/* 目录树 */}
      <div className={cn(
        'shrink-0 transition-all duration-200',
        'lg:w-[240px] lg:block lg:overflow-y-auto',
        mobileTreeOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 lg:max-h-none lg:opacity-100',
      )}>
        <div className="pt-2 lg:pt-0">
          <button onClick={() => { setSelectedSpace(null); setSearchResults([]); setSelectedPage(null); setMobileTreeOpen(false) }} className="mb-3 text-[12px] text-[var(--color-primary)] hover:underline cursor-pointer">← 返回空间列表</button>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate">{selectedSpace.name}</h3>
            <div className="flex gap-0.5">
              <button onClick={() => setImportDialog({ open: true, directoryId: tree[0]?.id ?? 0 })} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer" title="导入文档"><Upload className="h-3.5 w-3.5" /></button>
              <button onClick={() => setNewDirDialog({ open: true })} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer" title="新建目录"><FolderTree className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          {treeLoading ? <LoadingSpinner text="加载目录…" /> : tree.length === 0 ? <p className="text-[12px] text-[var(--color-text-tertiary)]">暂无目录</p> : (
            <DirectoryTree nodes={tree} spaceId={selectedSpace.id} onSelectPage={(sId, pId) => { handleSelectPage(sId, pId); setMobileTreeOpen(false) }}
              onAddPage={(dirId) => setNewPageDialog({ open: true, directoryId: dirId, pages: collectDirPages(dirId) })}
              onDeleteDir={(dirId, name) => setDeleteConfirm({ type: 'directory', id: dirId, name })} />
          )}
        </div>
      </div>

      {/* 页面内容 */}
      <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
        {pageLoading ? <LoadingSpinner text="加载页面…" /> : selectedPage ? (
          <div className={cn('rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]', editing && 'flex-1 flex flex-col min-h-0 overflow-hidden')}>
            {/* 页面头部 */}
            <div className="flex-shrink-0 flex items-center justify-between border-b border-[var(--color-border-light)] px-6 py-3">
              <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                <span>{selectedPage.directoryName}</span><span>/</span><span>{selectedPage.title}</span>
              </div>
              <div className="flex items-center gap-1">
                {!editing && selectedPage.canEdit && (
                  <button onClick={openVersionPanel} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer">
                    <History className="h-3.5 w-3.5" />版本
                  </button>
                )}
                {!editing && selectedPage.canEdit && (
                  <button onClick={handleStartEdit} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer">
                    <Edit3 className="h-3.5 w-3.5" />编辑
                  </button>
                )}
                {selectedPage.canEdit && (
                  <button onClick={() => setDeleteConfirm({ type: 'page', id: selectedPage.id, name: selectedPage.title })} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {saveError && <div className="flex-shrink-0 mx-6 mt-4 rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3 py-2 text-[13px] text-[var(--color-danger)]">{saveError}</div>}

            {editing ? (
              /* 编辑模式：标题 + 编辑器 + 操作栏一屏展示，仅编辑器内部滚动 */
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex-shrink-0 px-6 pt-4 pb-2">
                  <Input label="标题" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div className="flex-1 flex flex-col min-h-0 px-6 pb-2">
                  <label className="flex-shrink-0 text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">内容</label>
                  <MarkdownEditor
                    value={editContent}
                    onChange={setEditContent}
                    height="auto"
                    templates={[WIKI_PAGE_TEMPLATE]}
                    uploadImage={uploadMarkdownImage}
                    startInEditMode
                  />
                </div>
                <div className="flex-shrink-0 flex justify-end gap-2 px-6 pb-4 pt-2 border-t border-[var(--color-border-light)]">
                  <Button variant="secondary" onClick={() => setEditing(false)}>取消</Button>
                  <Button onClick={handleSavePage} loading={saving} icon={<Save className="h-4 w-4" />}>保存</Button>
                </div>
              </div>
            ) : (
              /* 阅读模式 */
              <div className="p-6">
                <h1 className="text-[20px] font-bold text-[var(--color-text-primary)] mb-4">{selectedPage.title}</h1>
                <div className="text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
                  <Markdown content={selectedPage.content} />
                </div>
                <div className="mt-6 border-t border-[var(--color-border-light)] pt-3 text-[11px] text-[var(--color-text-tertiary)]">
                  作者：{selectedPage.authorName} · v{selectedPage.currentVersionNumber} · {formatDate(selectedPage.updatedAt)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] p-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
            <p className="mt-3 text-[14px] text-[var(--color-text-tertiary)]">从左侧目录树选择一个页面查看</p>
          </div>
        )}
      </div>

      {/* 版本历史面板 */}
      {versionPanel.open && selectedPage && (
        <div className="w-[360px] shrink-0">
          <div className="sticky top-0">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--color-border-light)] px-4 py-3">
                <div>
                  <h4 className="text-[14px] font-semibold text-[var(--color-text-primary)]">版本历史</h4>
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">{selectedPage.title}</p>
                </div>
                <button onClick={() => setVersionPanel({ open: false, versions: [], loading: false })} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {versionPanel.loading ? (
                <div className="p-6"><LoadingSpinner text="加载版本…" /></div>
              ) : versionPanel.versions.length === 0 ? (
                <div className="p-6 text-center">
                  <History className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
                  <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)]">暂无版本记录</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto p-3 space-y-2">
                  {versionPanel.versions.map((v) => (
                    <div key={v.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">v{v.versionNumber} · {v.title}</span>
                        {v.versionNumber !== selectedPage.currentVersionNumber && (
                          <button onClick={() => setVersionRestoreConfirm({ versionNumber: v.versionNumber })} className="shrink-0 rounded p-0.5 text-[11px] text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer" title="恢复此版本">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--color-text-tertiary)] truncate">{v.changeSummary || '无变更说明'}</p>
                      <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{v.authorName || '-'} · {formatDate(v.createdAt)}</p>
                      {v.versionNumber === selectedPage.currentVersionNumber && (
                        <span className="mt-1 inline-block rounded-full bg-[var(--color-primary-light)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">当前版本</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 弹窗 */}
      {newPageDialog.open && <CreatePageDialog directoryId={newPageDialog.directoryId} pages={newPageDialog.pages} onSubmit={(title, parentPageId) => handleCreatePage(newPageDialog.directoryId, title, parentPageId)} onClose={() => setNewPageDialog({ open: false, directoryId: 0, pages: [] })} />}
      {newDirDialog.open && <SimpleInputDialog title="新建目录" label="目录名称" placeholder="输入目录名称" onSubmit={(v) => handleCreateDirectory(v, newDirDialog.parentDirectoryId)} onClose={() => setNewDirDialog({ open: false })} />}
      {deleteConfirm && <DeleteConfirmDialog name={deleteConfirm.name} onCancel={() => setDeleteConfirm(null)} onConfirm={handleDeleteConfirm} />}
      {versionRestoreConfirm && <VersionRestoreConfirmDialog versionNumber={versionRestoreConfirm.versionNumber} onCancel={() => setVersionRestoreConfirm(null)} onConfirm={() => handleRestoreVersion(versionRestoreConfirm.versionNumber)} />}
      {importDialog.open && <ImportDialog directoryId={importDialog.directoryId} loading={importLoading} preview={importPreview} error={importError} onFileSelect={handleImportFile} onCreate={(dirId, title, parentPageId) => handleImportCreate(dirId, title, parentPageId)} onClose={() => { setImportDialog({ open: false, directoryId: 0 }); setImportPreview(null); setImportError(null) }} />}
    </div>
  )
}

/* ── 目录树 ── */

const DirectoryTree = ({ nodes, spaceId, onSelectPage, onAddPage, onDeleteDir, depth = 0 }: {
  nodes: WikiDirectoryTreeNodeItem[]; spaceId: number
  onSelectPage: (spaceId: number, pageId: number) => void
  onAddPage: (dirId: number) => void
  onDeleteDir: (dirId: number, name: string) => void
  depth?: number
}) => (
  <div className="space-y-0.5">
    {nodes.map((node) => (
      <DirectoryNode key={node.id} node={node} spaceId={spaceId} onSelectPage={onSelectPage} onAddPage={onAddPage} onDeleteDir={onDeleteDir} depth={depth} />
    ))}
  </div>
)

const DirectoryNode = ({ node, spaceId, onSelectPage, onAddPage, onDeleteDir, depth }: {
  node: WikiDirectoryTreeNodeItem; spaceId: number
  onSelectPage: (spaceId: number, pageId: number) => void
  onAddPage: (dirId: number) => void
  onDeleteDir: (dirId: number, name: string) => void
  depth: number
}) => {
  const [expanded, setExpanded] = useState(depth === 0)
  const hasChildren = node.children.length > 0 || node.pages.length > 0

  return (
    <div>
      <div className="group flex items-center rounded-md hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer" style={{ paddingLeft: `${depth * 12}px` }}>
        <button onClick={() => setExpanded(!expanded)} className="flex flex-1 items-center gap-1 px-2 py-1.5 text-left cursor-pointer">
          {hasChildren ? (expanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-tertiary)] shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-tertiary)] shrink-0" />) : <span className="w-3.5 shrink-0" />}
          <FolderTree className="h-3.5 w-3.5 text-amber-600 shrink-0" strokeWidth={1.75} />
          <span className="truncate text-[12.5px] text-[var(--color-text-primary)]">{node.name}</span>
        </button>
        <div className="flex items-center gap-0.5 pr-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
          <button onClick={() => onAddPage(node.id)} className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer" title="新建页面"><Plus className="h-3 w-3" /></button>
          <button onClick={() => onDeleteDir(node.id, node.name)} className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors cursor-pointer" title="删除目录"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {expanded && (
        <div>
          {node.children.map((child) => (
            <DirectoryNode key={child.id} node={child} spaceId={spaceId} onSelectPage={onSelectPage} onAddPage={onAddPage} onDeleteDir={onDeleteDir} depth={depth + 1} />
          ))}
          {node.pages.map((page) => (
            <button key={page.id} onClick={() => onSelectPage(spaceId, page.id)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] text-left transition-colors hover:bg-[var(--color-bg-hover)] cursor-pointer"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
              <FileText className="h-3.5 w-3.5 text-[var(--color-text-tertiary)] shrink-0" strokeWidth={1.75} />
              <span className="truncate text-[var(--color-text-secondary)]">{page.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════
   知识图谱面板
   ════════════════════════════════════════════ */

const GraphPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)
  const [graph, setGraph] = useState<WikiSpaceKnowledgeGraphItem | null>(null)
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 项目是否绑定了 Wiki 空间；未绑定时给出引导而非报错。
  const [noSpace, setNoSpace] = useState(false)
  // pageId -> 页面标题，供图谱「来源文档」召回段展示。
  const [pageMap, setPageMap] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      setError(null)
      setNoSpace(false)
      try {
        // 项目与 Wiki 空间一对一绑定，取绑定空间后读其 LightRAG 图谱。
        const spaces = await listWikiSpaces({ projectId: pid })
        const space = spaces[0]
        if (!space) {
          setNoSpace(true)
          return
        }
        setSelectedSpaceId(space.id)
        // 并行拉图谱与目录树：目录树用于构建「来源文档」段的 pageId → 标题映射。
        const [g, tree] = await Promise.all([
          getWikiSpaceKnowledgeGraph(space.id),
          getWikiDirectoryTree(space.id).catch(() => [] as WikiDirectoryTreeNodeItem[]),
        ])
        const pm = new Map<number, string>()
        const walkPages = (pages: WikiSpacePageSummaryItem[]) => {
          for (const p of pages) {
            pm.set(p.id, p.title)
            if (p.children?.length) walkPages(p.children)
          }
        }
        const walkDirs = (nodes: WikiDirectoryTreeNodeItem[]) => {
          for (const n of nodes) {
            walkPages(n.pages)
            walkDirs(n.children)
          }
        }
        walkDirs(tree)
        setPageMap(pm)
        setGraph(g)
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [pid])

  if (loading) return <LoadingSpinner text="加载知识图谱…" />
  if (error) return <ErrorState description={error} />
  if (noSpace) return <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]"><EmptyState title="尚未绑定 Wiki 空间" description="为该项目绑定一个 Wiki 空间并补充文档后，即可看到从文档中抽取的知识图谱。" icon={<Network className="h-6 w-6" strokeWidth={1.5} />} /></div>
  if (!graph || graph.nodes.length === 0) return <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]"><EmptyState title="暂无知识图谱" description="该空间尚未抽取出知识实体，补充文档内容后稍候重试。" icon={<Network className="h-6 w-6" strokeWidth={1.5} />} /></div>

  return <KnowledgeGraphView graph={graph} pageMap={pageMap} spaceId={selectedSpaceId!} />
}

/* ════════════════════════════════════════════
   公共小组件
   ════════════════════════════════════════════ */

const SimpleInputDialog = ({ title, label, placeholder, onSubmit, onClose }: {
  title: string; label: string; placeholder: string; onSubmit: (value: string) => void; onClose: () => void
}) => {
  const [value, setValue] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
        <h2 className="text-[16px] font-bold text-[var(--color-text-primary)] mb-3">{title}</h2>
        <Input label={label} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} autoFocus />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={() => value.trim() && onSubmit(value.trim())} disabled={!value.trim()}>确定</Button>
        </div>
      </div>
    </div>
  )
}

const DeleteConfirmDialog = ({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onCancel} />
    <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger-light)]"><Trash2 className="h-5 w-5 text-[var(--color-danger)]" /></div>
      <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">确认删除</h3>
      <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">确定要删除「{name}」吗？此操作不可撤销。</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button variant="danger" onClick={onConfirm}>删除</Button>
      </div>
    </div>
  </div>
)

/** 版本恢复确认对话框。 */
const VersionRestoreConfirmDialog = ({ versionNumber, onCancel, onConfirm }: { versionNumber: number; onCancel: () => void; onConfirm: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onCancel} />
    <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-light)]"><RotateCcw className="h-5 w-5 text-[var(--color-primary)]" /></div>
      <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">确认恢复</h3>
      <p className="mt-1.5 text-[13px] text-[var(--color-text-tertiary)]">确定要恢复到 v{versionNumber} 吗？当前内容将被覆盖。</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button onClick={onConfirm}>恢复</Button>
      </div>
    </div>
  </div>
)

/** 新建页面对话框（含标题和父页面选择）。 */
const CreatePageDialog = ({ directoryId, pages, onSubmit, onClose }: {
  directoryId: number; pages: WikiSpacePageSummaryItem[]; onSubmit: (title: string, parentPageId?: number | null) => void; onClose: () => void
}) => {
  const [title, setTitle] = useState('')
  const [parentPageId, setParentPageId] = useState<number | null>(null)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
        <h2 className="text-[16px] font-bold text-[var(--color-text-primary)] mb-3">新建页面</h2>
        <Input label="页面标题" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入页面标题" autoFocus />
        {pages.length > 0 && (
          <div className="mt-3">
            <label className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">父页面（可选）</label>
            <select
              value={parentPageId ?? ''}
              onChange={(e) => setParentPageId(e.target.value ? Number(e.target.value) : null)}
              className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            >
              <option value="">无（顶层页面）</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button onClick={() => title.trim() && onSubmit(title.trim(), parentPageId)} disabled={!title.trim()}>确定</Button>
        </div>
      </div>
    </div>
  )
}

/** 文档导入对话框（上传 → 预览 → 创建）。 */
const ImportDialog = ({ directoryId, loading, preview, error, onFileSelect, onCreate, onClose }: {
  directoryId: number
  loading: boolean
  preview: DocumentMarkdownResultItem | null
  error: string | null
  onFileSelect: (file: File) => void
  onCreate: (directoryId: number, title: string, parentPageId?: number | null) => void
  onClose: () => void
}) => {
  const [title, setTitle] = useState('')
  const fileInputRef = { current: null as HTMLInputElement | null }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFileSelect(file)
  }

  // 当预览结果生成时，自动填入建议标题
  useEffect(() => {
    if (preview && !title) {
      setTitle(preview.suggestedTitle || preview.fileName)
    }
  }, [preview])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-[var(--color-text-primary)]">导入文档</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3 py-2 text-[13px] text-[var(--color-danger)]">{error}</div>
        )}

        {!preview ? (
          /* 上传阶段 */
          <div>
            <input
              ref={(el) => { fileInputRef.current = el }}
              type="file"
              accept=".pdf,.docx,.pptx,.xlsx"
              onChange={handleFileInput}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="w-full rounded-xl border-2 border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-page)] p-8 text-center transition-colors hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary-light)]/30 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <LoadingSpinner text="转换中…" />
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">正在上传并转换文档…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <FileUp className="h-8 w-8 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
                  <p className="text-[14px] font-medium text-[var(--color-text-primary)]">点击选择文件</p>
                  <p className="text-[12px] text-[var(--color-text-tertiary)]">支持 PDF、DOCX、PPTX、XLSX 格式</p>
                </div>
              )}
            </button>
          </div>
        ) : (
          /* 预览阶段 */
          <div>
            <div className="mb-3 rounded-lg bg-[var(--color-bg-page)] border border-[var(--color-border)] p-3">
              <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)]">
                <FileText className="h-4 w-4 text-[var(--color-primary)]" />
                <span className="font-medium">{preview.fileName}</span>
                <span className="text-[var(--color-text-tertiary)]">· {preview.sourceFormat.toUpperCase()}</span>
                {preview.truncated && <span className="text-amber-600 font-medium">（内容已截断）</span>}
              </div>
              {preview.warnings.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{w}</p>
                  ))}
                </div>
              )}
            </div>

            <Input label="页面标题" value={title} onChange={(e) => setTitle(e.target.value)} />

            <div className="mt-3">
              <label className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">内容预览</label>
              <div className="max-h-[200px] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] p-3 text-[12px] text-[var(--color-text-secondary)]">
                <Markdown content={preview.markdown.slice(0, 2000)} />
                {preview.markdown.length > 2000 && <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)] text-center">… 仅展示前 2000 字符</p>}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>取消</Button>
              <Button onClick={() => title.trim() && onCreate(directoryId, title.trim())} disabled={!title.trim()}>
                导入为新页面
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
