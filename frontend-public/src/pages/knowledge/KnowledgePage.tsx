/**
 * 知识模块页面。
 * 三个子 Tab：Wiki 空间（含 CRUD）、知识图谱、记忆事实。
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  BookOpen, FolderTree, FileText, Network, Brain, Search,
  ChevronRight, ChevronDown, Edit3, Trash2, Plus, X, Save, AlertTriangle,
} from 'lucide-react'
import { Markdown } from '@/src/components/common/Markdown'
import { MarkdownEditor } from '@/src/components/common/MarkdownEditor'
import { WIKI_PAGE_TEMPLATE } from '@/src/lib/markdownTemplates'
import { uploadMarkdownImage } from '@/src/lib/markdownImageUpload'
import {
  listWikiSpaces, getWikiDirectoryTree, getWikiPage, searchWikiPages,
  getProjectKnowledgeGraph, getProjectMemoryFactGraph,
  getProjectMemoryFactFacts,
  createWikiPage, updateWikiPage, deleteWikiPage,
  createWikiDirectory, deleteWikiDirectory,
} from '@/src/api/knowledge'
import type { WikiPagePayload, WikiDirectoryPayload } from '@/src/api/knowledge'
import type {
  WikiSpaceItem, WikiDirectoryTreeNodeItem, WikiSpacePageSummaryItem,
  WikiSpacePageDetailItem, KnowledgeGraphItem, MemoryFactGraphItem,
  MemoryFactFactsResponseItem, MemoryFactItem,
} from '@/src/types/knowledge'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { cn, formatDate, getErrorMessage } from '@/src/lib/utils'

type KnowledgeTab = 'wiki' | 'graph' | 'memory'

const tabs: { key: KnowledgeTab; label: string; icon: typeof BookOpen }[] = [
  { key: 'wiki', label: 'Wiki', icon: BookOpen },
  { key: 'graph', label: '知识图谱', icon: Network },
  { key: 'memory', label: '记忆事实', icon: Brain },
]

export const KnowledgePage = () => {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>('wiki')
  return (
    <div className="h-full flex flex-col overflow-hidden animate-fadeIn">
      <div className="flex-shrink-0 mb-6 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)] w-fit">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
              activeTab === tab.key ? 'bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]')}>
            <tab.icon className="h-3.5 w-3.5" strokeWidth={1.75} />{tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
      {activeTab === 'wiki' && <WikiPanel />}
      {activeTab === 'graph' && <GraphPanel />}
      {activeTab === 'memory' && <MemoryPanel />}
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
  const [newPageDialog, setNewPageDialog] = useState<{ open: boolean; directoryId: number }>({ open: false, directoryId: 0 })
  const [newDirDialog, setNewDirDialog] = useState<{ open: boolean; parentDirectoryId?: number }>({ open: false })
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'page' | 'directory'; id: number; name: string } | null>(null)

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
    setPageLoading(true); setEditing(false)
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

  const handleCreatePage = async (directoryId: number, title: string) => {
    if (!selectedSpace) return
    try {
      const payload: WikiPagePayload = { directoryId, title, content: '', changeSummary: '新建页面' }
      const created = await createWikiPage(selectedSpace.id, payload)
      await refreshTree()
      setSelectedPage(created); setEditContent(''); setEditTitle(created.title); setEditing(true)
    } catch { /* ignore */ }
    setNewPageDialog({ open: false, directoryId: 0 })
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
                className="group text-left rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:border-[var(--color-primary)]/20 hover:shadow-[var(--shadow-card-hover)]">
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
          className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-text-primary)]"
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
          <button onClick={() => { setSelectedSpace(null); setSearchResults([]); setSelectedPage(null); setMobileTreeOpen(false) }} className="mb-3 text-[12px] text-[var(--color-primary)] hover:underline">← 返回空间列表</button>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate">{selectedSpace.name}</h3>
            <div className="flex gap-0.5">
              <button onClick={() => setNewDirDialog({ open: true })} className="rounded p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-hover)] transition-colors" title="新建目录"><FolderTree className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          {treeLoading ? <LoadingSpinner text="加载目录…" /> : tree.length === 0 ? <p className="text-[12px] text-[var(--color-text-tertiary)]">暂无目录</p> : (
            <DirectoryTree nodes={tree} spaceId={selectedSpace.id} onSelectPage={(sId, pId) => { handleSelectPage(sId, pId); setMobileTreeOpen(false) }}
              onAddPage={(dirId) => setNewPageDialog({ open: true, directoryId: dirId })}
              onDeleteDir={(dirId, name) => setDeleteConfirm({ type: 'directory', id: dirId, name })} />
          )}
        </div>
      </div>

      {/* 页面内容 */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {pageLoading ? <LoadingSpinner text="加载页面…" /> : selectedPage ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]">
            {/* 页面头部 */}
            <div className="flex items-center justify-between border-b border-[var(--color-border-light)] px-6 py-3">
              <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                <span>{selectedPage.directoryName}</span><span>/</span><span>{selectedPage.title}</span>
              </div>
              <div className="flex items-center gap-1">
                {!editing && selectedPage.canEdit && (
                  <button onClick={handleStartEdit} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors">
                    <Edit3 className="h-3.5 w-3.5" />编辑
                  </button>
                )}
                {selectedPage.canEdit && (
                  <button onClick={() => setDeleteConfirm({ type: 'page', id: selectedPage.id, name: selectedPage.title })} className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-bg-hover)] transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {saveError && <div className="mx-6 mt-4 rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3 py-2 text-[13px] text-[var(--color-danger)]">{saveError}</div>}

            {editing ? (
              /* 编辑模式 */
              <div className="p-6 flex flex-col gap-4" style={{ minHeight: 'calc(100vh - 220px)' }}>
                <Input label="标题" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                <div className="flex flex-col gap-1.5 flex-1 min-h-0">
                  <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">内容</label>
                  <MarkdownEditor
                    value={editContent}
                    onChange={setEditContent}
                    height="auto"
                    templates={[WIKI_PAGE_TEMPLATE]}
                    uploadImage={uploadMarkdownImage}
                    startInEditMode
                  />
                </div>
                <div className="flex justify-end gap-2">
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

      {/* 弹窗 */}
      {newPageDialog.open && <SimpleInputDialog title="新建页面" label="页面标题" placeholder="输入页面标题" onSubmit={(v) => handleCreatePage(newPageDialog.directoryId, v)} onClose={() => setNewPageDialog({ open: false, directoryId: 0 })} />}
      {newDirDialog.open && <SimpleInputDialog title="新建目录" label="目录名称" placeholder="输入目录名称" onSubmit={(v) => handleCreateDirectory(v, newDirDialog.parentDirectoryId)} onClose={() => setNewDirDialog({ open: false })} />}
      {deleteConfirm && <DeleteConfirmDialog name={deleteConfirm.name} onCancel={() => setDeleteConfirm(null)} onConfirm={handleDeleteConfirm} />}
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
      <div className="group flex items-center rounded-md hover:bg-[var(--color-bg-hover)] transition-colors" style={{ paddingLeft: `${depth * 12}px` }}>
        <button onClick={() => setExpanded(!expanded)} className="flex flex-1 items-center gap-1 px-2 py-1.5 text-left">
          {hasChildren ? (expanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-tertiary)] shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-tertiary)] shrink-0" />) : <span className="w-3.5 shrink-0" />}
          <FolderTree className="h-3.5 w-3.5 text-amber-600 shrink-0" strokeWidth={1.75} />
          <span className="truncate text-[12.5px] text-[var(--color-text-primary)]">{node.name}</span>
        </button>
        <div className="flex items-center gap-0.5 pr-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
          <button onClick={() => onAddPage(node.id)} className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors" title="新建页面"><Plus className="h-3 w-3" /></button>
          <button onClick={() => onDeleteDir(node.id, node.name)} className="rounded p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors" title="删除目录"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
      {expanded && (
        <div>
          {node.children.map((child) => (
            <DirectoryNode key={child.id} node={child} spaceId={spaceId} onSelectPage={onSelectPage} onAddPage={onAddPage} onDeleteDir={onDeleteDir} depth={depth + 1} />
          ))}
          {node.pages.map((page) => (
            <button key={page.id} onClick={() => onSelectPage(spaceId, page.id)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] text-left transition-colors hover:bg-[var(--color-bg-hover)]"
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
  const [graph, setGraph] = useState<KnowledgeGraphItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => { setLoading(true); try { setGraph(await getProjectKnowledgeGraph(pid)) } catch (err) { setError(getErrorMessage(err)) } finally { setLoading(false) } }
    fetch()
  }, [pid])

  if (loading) return <LoadingSpinner text="加载知识图谱…" />
  if (error) return <ErrorState description={error} />
  if (!graph || graph.nodeCount === 0) return <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]"><EmptyState title="暂无知识图谱" description="项目知识图谱尚未生成。" icon={<Network className="h-6 w-6" strokeWidth={1.5} />} /></div>

  const nodeTypeCounts: Record<string, number> = {}
  graph.nodes.forEach((n) => { nodeTypeCounts[n.nodeType] = (nodeTypeCounts[n.nodeType] || 0) + 1 })
  const edgeTypeCounts: Record<string, number> = {}
  graph.edges.forEach((e) => { edgeTypeCounts[e.edgeType] = (edgeTypeCounts[e.edgeType] || 0) + 1 })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card title="节点"><p className="text-[28px] font-bold text-[var(--color-primary)]">{graph.nodeCount}</p></Card>
        <Card title="关系"><p className="text-[28px] font-bold text-[var(--color-text-primary)]">{graph.edgeCount}</p></Card>
        <Card title="生成时间"><p className="text-[14px] font-medium text-[var(--color-text-primary)]">{formatDate(graph.generatedAt)}</p></Card>
      </div>
      <Card title="节点类型分布">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(nodeTypeCounts).map(([type, count]) => (
          <div key={type} className="rounded-lg bg-[var(--color-bg-hover)] px-3 py-2"><p className="text-[11px] text-[var(--color-text-tertiary)] truncate">{type}</p><p className="text-[18px] font-bold text-[var(--color-text-primary)]">{count}</p></div>
        ))}</div>
      </Card>
      <Card title="关系类型分布">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(edgeTypeCounts).map(([type, count]) => (
          <div key={type} className="rounded-lg bg-[var(--color-bg-hover)] px-3 py-2"><p className="text-[11px] text-[var(--color-text-tertiary)] truncate">{type}</p><p className="text-[18px] font-bold text-[var(--color-text-primary)]">{count}</p></div>
        ))}</div>
      </Card>
    </div>
  )
}

/* ════════════════════════════════════════════
   记忆事实面板（含实体事实钻取）
   ════════════════════════════════════════════ */

const MemoryPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)
  const [graph, setGraph] = useState<MemoryFactGraphItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* 事实钻取 */
  const [factPanel, setFactPanel] = useState<{
    entityId: string
    entityLabel: string
    facts: MemoryFactFactsResponseItem | null
    loading: boolean
  } | null>(null)

  useEffect(() => {
    const fetch = async () => { setLoading(true); try { setGraph(await getProjectMemoryFactGraph(pid)) } catch (err) { setError(getErrorMessage(err)) } finally { setLoading(false) } }
    fetch()
  }, [pid])

  const handleDrillDown = async (entityId: string, entityLabel: string) => {
    setFactPanel({ entityId, entityLabel, facts: null, loading: true })
    try {
      const facts = await getProjectMemoryFactFacts(pid, { entityId, limit: 50 })
      setFactPanel({ entityId, entityLabel, facts, loading: false })
    } catch {
      setFactPanel({ entityId, entityLabel, facts: null, loading: false })
    }
  }

  if (loading) return <LoadingSpinner text="加载记忆事实…" />
  if (error) return <ErrorState description={error} />
  if (!graph || graph.nodeCount === 0) return <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]"><EmptyState title="暂无记忆事实" description="项目记忆事实图尚未生成。" icon={<Brain className="h-6 w-6" strokeWidth={1.5} />} /></div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card title="实体"><p className="text-[28px] font-bold text-[var(--color-primary)]">{graph.nodeCount}</p></Card>
        <Card title="关系"><p className="text-[28px] font-bold text-[var(--color-text-primary)]">{graph.edgeCount}</p></Card>
        <Card title="事实"><p className="text-[28px] font-bold text-emerald-600">{graph.factCount}</p></Card>
      </div>
      {graph.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <div className="flex items-center gap-2 text-amber-800 text-[13px] font-medium mb-1"><AlertTriangle className="h-4 w-4" />警告</div>
          {graph.warnings.map((w, i) => <p key={i} className="text-[12px] text-amber-700">{w}</p>)}
        </div>
      )}

      <div className="flex gap-5">
        {/* 实体列表 */}
        <div className="flex-1 min-w-0">
          <Card title="实体列表">
            <div className="overflow-x-auto">
              <table className="w-full"><thead><tr className="border-b border-[var(--color-border-light)]">
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">实体</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">类型</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">关联度</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">事实数</th>
                <th className="px-3 py-2 w-[60px]" />
              </tr></thead>
              <tbody className="divide-y divide-[var(--color-border-light)]">
                {graph.nodes.slice(0, 50).map((node) => (
                  <tr
                    key={node.id}
                    className={cn(
                      'hover:bg-[var(--color-bg-hover)]/50 transition-colors cursor-pointer',
                      factPanel?.entityId === node.id && 'bg-[var(--color-primary-light)]',
                    )}
                    onClick={() => handleDrillDown(node.id, node.label)}
                  >
                    <td className="px-3 py-2.5 text-[13px] font-medium text-[var(--color-text-primary)]">{node.label}</td>
                    <td className="px-3 py-2.5"><span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-primary)]">{node.entityType}</span></td>
                    <td className="px-3 py-2.5 text-[13px] text-right text-[var(--color-text-secondary)]">{node.degree}</td>
                    <td className="px-3 py-2.5 text-[13px] text-right text-[var(--color-text-secondary)]">{node.factCount}</td>
                    <td className="px-3 py-2.5 text-right">
                      {node.factCount > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDrillDown(node.id, node.label) }}
                          className="text-[11px] text-[var(--color-primary)] hover:underline"
                        >
                          查看事实
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody></table>
              {graph.nodes.length > 50 && <p className="mt-2 text-center text-[12px] text-[var(--color-text-tertiary)]">显示前 50 个，共 {graph.nodeCount} 个</p>}
            </div>
          </Card>
        </div>

        {/* 事实详情面板 */}
        {factPanel && (
          <div className="w-[380px] shrink-0">
            <div className="sticky top-[68px]">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--color-border-light)] px-4 py-3">
                  <div>
                    <h4 className="text-[14px] font-semibold text-[var(--color-text-primary)]">{factPanel.entityLabel}</h4>
                    <p className="text-[11px] text-[var(--color-text-tertiary)]">事实详情</p>
                  </div>
                  <button
                    onClick={() => setFactPanel(null)}
                    className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {factPanel.loading ? (
                  <div className="p-6"><LoadingSpinner text="加载事实…" /></div>
                ) : !factPanel.facts || factPanel.facts.facts.length === 0 ? (
                  <div className="p-6 text-center">
                    <Brain className="mx-auto h-8 w-8 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
                    <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)]">暂无关联事实</p>
                  </div>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto p-4 space-y-2">
                    <p className="text-[11px] text-[var(--color-text-tertiary)] mb-2">
                      共 {factPanel.facts.factCount} 条事实
                    </p>
                    {factPanel.facts.facts.map((fact) => (
                      <FactCard key={fact.id} fact={fact} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** 单条事实卡片。 */
const FactCard = ({ fact }: { fact: MemoryFactItem }) => (
  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-page)] p-3">
    <div className="flex items-start justify-between gap-2 mb-1.5">
      <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">
        {fact.type}
      </span>
      {fact.confidence != null && (
        <span className="text-[10px] text-[var(--color-text-tertiary)]">
          置信度: {(fact.confidence * 100).toFixed(0)}%
        </span>
      )}
    </div>
    <p className="text-[13px] font-medium text-[var(--color-text-primary)] mb-1">{fact.summary}</p>
    <div className="text-[11px] text-[var(--color-text-tertiary)] space-y-0.5">
      <p><span className="font-medium">主体:</span> {fact.subject}</p>
      <p><span className="font-medium">谓词:</span> {fact.predicate}</p>
      <p><span className="font-medium">客体:</span> {fact.object}</p>
    </div>
    <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--color-text-tertiary)]">
      <span>{fact.sourceType}</span>
      {fact.createdAt && <span>{formatDate(fact.createdAt)}</span>}
    </div>
    {fact.tags.length > 0 && (
      <div className="mt-1.5 flex flex-wrap gap-1">
        {fact.tags.map((tag) => (
          <span key={tag} className="rounded bg-[var(--color-bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]">
            {tag}
          </span>
        ))}
      </div>
    )}
  </div>
)

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
