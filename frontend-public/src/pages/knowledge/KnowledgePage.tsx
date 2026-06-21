/**
 * 知识模块页面。
 * 三个子 Tab：Wiki 空间、知识图谱、记忆事实。
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  BookOpen,
  FolderTree,
  FileText,
  Network,
  Brain,
  Search,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react'
import { listWikiSpaces, getWikiDirectoryTree, getWikiPage, searchWikiPages, getProjectKnowledgeGraph, getProjectMemoryFactGraph } from '@/src/api/knowledge'
import type { WikiSpaceItem, WikiDirectoryTreeNodeItem, WikiSpacePageSummaryItem, WikiSpacePageDetailItem, KnowledgeGraphItem, MemoryFactGraphItem } from '@/src/types/knowledge'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { cn, formatDate } from '@/src/lib/utils'

type KnowledgeTab = 'wiki' | 'graph' | 'memory'

const tabs: { key: KnowledgeTab; label: string; icon: typeof BookOpen }[] = [
  { key: 'wiki', label: 'Wiki', icon: BookOpen },
  { key: 'graph', label: '知识图谱', icon: Network },
  { key: 'memory', label: '记忆事实', icon: Brain },
]

export const KnowledgePage = () => {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>('wiki')

  return (
    <div className="animate-fadeIn">
      {/* 子 Tab */}
      <div className="mb-6 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)] w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
              activeTab === tab.key
                ? 'bg-[var(--color-primary)] text-white shadow-[0_1px_2px_rgba(79,70,229,0.25)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
            )}
          >
            <tab.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'wiki' && <WikiPanel />}
      {activeTab === 'graph' && <GraphPanel />}
      {activeTab === 'memory' && <MemoryPanel />}
    </div>
  )
}

/* ════════════════════════════════════════════
   Wiki 面板
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
  const [keyword, setKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<WikiSpacePageSummaryItem[]>([])

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        const data = await listWikiSpaces({ projectId: pid })
        setSpaces(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载 Wiki 空间失败')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [pid])

  const handleSelectSpace = async (space: WikiSpaceItem) => {
    setSelectedSpace(space)
    setSelectedPage(null)
    setTreeLoading(true)
    try {
      const data = await getWikiDirectoryTree(space.id)
      setTree(data)
    } catch {
      setTree([])
    } finally {
      setTreeLoading(false)
    }
  }

  const handleSelectPage = async (spaceId: number, pageId: number) => {
    setPageLoading(true)
    try {
      const data = await getWikiPage(spaceId, pageId)
      setSelectedPage(data)
    } catch {
      setSelectedPage(null)
    } finally {
      setPageLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!keyword.trim()) { setSearchResults([]); return }
    try {
      const data = await searchWikiPages({ keyword, projectId: pid })
      setSearchResults(data)
    } catch {
      setSearchResults([])
    }
  }

  if (loading) return <LoadingSpinner text="加载 Wiki 空间…" />
  if (error) return <ErrorState description={error} />

  // 没有选中空间 → 显示空间列表
  if (!selectedSpace) {
    return (
      <div>
        {/* 搜索 */}
        <div className="mb-4 flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              placeholder="搜索 Wiki 页面…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white pl-9 pr-3 text-[13px] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20"
            />
          </div>
        </div>

        {searchResults.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">搜索结果</h3>
            {searchResults.map((r) => (
              <div key={r.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 hover:shadow-[var(--shadow-sm)] transition-shadow">
                <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{r.title}</p>
                <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">{r.spaceName} / {r.directoryName}</p>
              </div>
            ))}
          </div>
        ) : spaces.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]">
            <EmptyState
              title="暂无 Wiki 空间"
              description="该项目还没有关联的 Wiki 空间。"
              icon={<BookOpen className="h-6 w-6" strokeWidth={1.5} />}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((space) => (
              <button
                key={space.id}
                onClick={() => handleSelectSpace(space)}
                className="group text-left rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:border-[var(--color-primary)]/20 hover:shadow-[var(--shadow-card-hover)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-light)] transition-colors group-hover:bg-[var(--color-primary)] group-hover:text-white">
                    <BookOpen className="h-5 w-5 text-[var(--color-primary)] group-hover:text-white" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors truncate">
                      {space.name}
                    </h3>
                    <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)] truncate">
                      {space.description || '暂无描述'}
                    </p>
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

  // 选中空间 → 目录树 + 页面内容
  return (
    <div className="flex gap-5">
      {/* 左侧目录树 */}
      <div className="w-[240px] shrink-0">
        <button
          onClick={() => { setSelectedSpace(null); setSearchResults([]) }}
          className="mb-3 text-[12px] text-[var(--color-primary)] hover:underline"
        >
          ← 返回空间列表
        </button>
        <h3 className="mb-2 text-[13px] font-semibold text-[var(--color-text-primary)] truncate">
          {selectedSpace.name}
        </h3>
        {treeLoading ? (
          <LoadingSpinner text="加载目录…" />
        ) : tree.length === 0 ? (
          <p className="text-[12px] text-[var(--color-text-tertiary)]">暂无目录</p>
        ) : (
          <DirectoryTree
            nodes={tree}
            spaceId={selectedSpace.id}
            onSelectPage={handleSelectPage}
          />
        )}
      </div>

      {/* 右侧页面内容 */}
      <div className="flex-1 min-w-0">
        {pageLoading ? (
          <LoadingSpinner text="加载页面…" />
        ) : selectedPage ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)] p-6">
            <div className="mb-4 flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
              <span>{selectedPage.directoryName}</span>
              <span>/</span>
              <span>{selectedPage.title}</span>
            </div>
            <h1 className="text-[20px] font-bold text-[var(--color-text-primary)] mb-4">
              {selectedPage.title}
            </h1>
            <div className="prose prose-sm max-w-none text-[var(--color-text-secondary)]">
              <pre className="whitespace-pre-wrap text-[13px] leading-relaxed font-sans">
                {selectedPage.content || '（页面内容为空）'}
              </pre>
            </div>
            <div className="mt-6 border-t border-[var(--color-border-light)] pt-3 text-[11px] text-[var(--color-text-tertiary)]">
              作者：{selectedPage.authorName} · 版本 v{selectedPage.currentVersionNumber} · 更新于 {formatDate(selectedPage.updatedAt)}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg-card)] p-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-[var(--color-text-tertiary)]" strokeWidth={1.5} />
            <p className="mt-3 text-[14px] text-[var(--color-text-tertiary)]">
              从左侧目录树选择一个页面查看
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** 递归目录树组件。 */
const DirectoryTree = ({
  nodes,
  spaceId,
  onSelectPage,
  depth = 0,
}: {
  nodes: WikiDirectoryTreeNodeItem[]
  spaceId: number
  onSelectPage: (spaceId: number, pageId: number) => void
  depth?: number
}) => (
  <div className="space-y-0.5">
    {nodes.map((node) => (
      <DirectoryNode
        key={node.id}
        node={node}
        spaceId={spaceId}
        onSelectPage={onSelectPage}
        depth={depth}
      />
    ))}
  </div>
)

const DirectoryNode = ({
  node,
  spaceId,
  onSelectPage,
  depth,
}: {
  node: WikiDirectoryTreeNodeItem
  spaceId: number
  onSelectPage: (spaceId: number, pageId: number) => void
  depth: number
}) => {
  const [expanded, setExpanded] = useState(depth === 0)
  const hasChildren = node.children.length > 0 || node.pages.length > 0

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] text-left transition-colors hover:bg-[var(--color-bg-hover)]',
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-tertiary)] shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-tertiary)] shrink-0" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <FolderTree className="h-3.5 w-3.5 text-amber-600 shrink-0" strokeWidth={1.75} />
        <span className="truncate text-[var(--color-text-primary)]">{node.name}</span>
      </button>

      {expanded && (
        <div>
          {/* 子目录 */}
          {node.children.map((child) => (
            <DirectoryNode
              key={child.id}
              node={child}
              spaceId={spaceId}
              onSelectPage={onSelectPage}
              depth={depth + 1}
            />
          ))}
          {/* 页面 */}
          {node.pages.map((page) => (
            <button
              key={page.id}
              onClick={() => onSelectPage(spaceId, page.id)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] text-left transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
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
    const fetch = async () => {
      setLoading(true)
      try {
        const data = await getProjectKnowledgeGraph(pid)
        setGraph(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载知识图谱失败')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [pid])

  if (loading) return <LoadingSpinner text="加载知识图谱…" />
  if (error) return <ErrorState description={error} />
  if (!graph || graph.nodeCount === 0) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]">
        <EmptyState
          title="暂无知识图谱"
          description="项目知识图谱尚未生成。"
          icon={<Network className="h-6 w-6" strokeWidth={1.5} />}
        />
      </div>
    )
  }

  // 按类型分组统计节点
  const nodeTypeCounts: Record<string, number> = {}
  graph.nodes.forEach((n) => {
    nodeTypeCounts[n.nodeType] = (nodeTypeCounts[n.nodeType] || 0) + 1
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card title="节点">
          <p className="text-[28px] font-bold text-[var(--color-primary)]">{graph.nodeCount}</p>
        </Card>
        <Card title="关系">
          <p className="text-[28px] font-bold text-[var(--color-text-primary)]">{graph.edgeCount}</p>
        </Card>
        <Card title="生成时间">
          <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{formatDate(graph.generatedAt)}</p>
        </Card>
      </div>

      <Card title="节点类型分布">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(nodeTypeCounts).map(([type, count]) => (
            <div key={type} className="rounded-lg bg-[var(--color-bg-hover)] px-3 py-2">
              <p className="text-[11px] text-[var(--color-text-tertiary)] truncate">{type}</p>
              <p className="text-[18px] font-bold text-[var(--color-text-primary)]">{count}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="关系类型分布">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(
            graph.edges.reduce<Record<string, number>>((acc, e) => {
              acc[e.edgeType] = (acc[e.edgeType] || 0) + 1
              return acc
            }, {}),
          ).map(([type, count]) => (
            <div key={type} className="rounded-lg bg-[var(--color-bg-hover)] px-3 py-2">
              <p className="text-[11px] text-[var(--color-text-tertiary)] truncate">{type}</p>
              <p className="text-[18px] font-bold text-[var(--color-text-primary)]">{count}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ════════════════════════════════════════════
   记忆事实面板
   ════════════════════════════════════════════ */

const MemoryPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)
  const [graph, setGraph] = useState<MemoryFactGraphItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        const data = await getProjectMemoryFactGraph(pid)
        setGraph(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载记忆事实图失败')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [pid])

  if (loading) return <LoadingSpinner text="加载记忆事实…" />
  if (error) return <ErrorState description={error} />
  if (!graph || graph.nodeCount === 0) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-[var(--shadow-card)]">
        <EmptyState
          title="暂无记忆事实"
          description="项目记忆事实图尚未生成。"
          icon={<Brain className="h-6 w-6" strokeWidth={1.5} />}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card title="实体">
          <p className="text-[28px] font-bold text-[var(--color-primary)]">{graph.nodeCount}</p>
        </Card>
        <Card title="关系">
          <p className="text-[28px] font-bold text-[var(--color-text-primary)]">{graph.edgeCount}</p>
        </Card>
        <Card title="事实">
          <p className="text-[28px] font-bold text-emerald-600">{graph.factCount}</p>
        </Card>
      </div>

      {graph.warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <div className="flex items-center gap-2 text-amber-800 text-[13px] font-medium mb-1">
            <AlertTriangle className="h-4 w-4" />
            警告
          </div>
          {graph.warnings.map((w, i) => (
            <p key={i} className="text-[12px] text-amber-700">{w}</p>
          ))}
        </div>
      )}

      <Card title="实体列表">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border-light)]">
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">实体</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">类型</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">关联度</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase">事实数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-light)]">
              {graph.nodes.slice(0, 30).map((node) => (
                <tr key={node.id} className="hover:bg-[var(--color-bg-hover)]/50 transition-colors">
                  <td className="px-3 py-2.5 text-[13px] font-medium text-[var(--color-text-primary)]">{node.label}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-primary)]">
                      {node.entityType}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-right text-[var(--color-text-secondary)]">{node.degree}</td>
                  <td className="px-3 py-2.5 text-[13px] text-right text-[var(--color-text-secondary)]">{node.factCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {graph.nodes.length > 30 && (
            <p className="mt-2 text-center text-[12px] text-[var(--color-text-tertiary)]">
              显示前 30 个实体，共 {graph.nodeCount} 个
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
