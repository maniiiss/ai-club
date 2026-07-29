/**
 * 会话侧栏：项目（工作目录）树与任务（会话）列表两个独立分区。
 *
 * 项目区在项目节点下展示其项目任务；任务区仅展示没有关联项目的独立任务。
 * 选择任意任务仍会同步 Agent 的实际工作目录。
 */
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useSessionStore } from '@/src/store/session';
import { buildProjectTree, type ProjectTreeNode } from './project-tree';

interface ProjectTreeItemProps {
	node: ProjectTreeNode;
	depth: number;
	activeTaskPath: string | undefined;
	canCreateTask: boolean;
	onCreateTask: (path: string) => void;
	onRemove: (path: string) => void;
	onSelectTask: (path: string) => void;
}

/** 项目节点可展开其项目任务；任务仅在一个项目节点或独立任务列表中出现。 */
function ProjectTreeItem({ node, depth, activeTaskPath, canCreateTask, onCreateTask, onRemove, onSelectTask }: ProjectTreeItemProps) {
	const [expanded, setExpanded] = useState(true);

	return (
		<div>
			<div
				className="group flex min-h-8 items-center gap-1 rounded-sm py-1 pr-1 text-[14px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-hover)]"
				style={{ paddingLeft: `${8 + depth * 14}px` }}
			>
				<button type="button" onClick={() => setExpanded((value) => !value)} className="grid size-4 shrink-0 place-items-center text-[var(--color-text-muted)]" aria-label={expanded ? `收起 ${node.project.name}` : `展开 ${node.project.name}`}>
					{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
				</button>
				{expanded ? <FolderOpen size={13} className="shrink-0 text-[var(--color-text-muted)]" /> : <Folder size={13} className="shrink-0 text-[var(--color-text-muted)]" />}
				<button type="button" onClick={() => setExpanded((value) => !value)} className="min-w-0 flex-1 truncate text-left" title={expanded ? `收起 ${node.project.name}` : `展开 ${node.project.name}`}>{node.project.name}</button>
				<button type="button" onClick={() => onCreateTask(node.project.path)} disabled={!canCreateTask} className="shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity hover:text-[var(--color-primary)] group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0" title="新建项目任务" aria-label={`新建 ${node.project.name} 的任务`}>
					<Pencil size={12} />
				</button>
				<button type="button" onClick={() => onRemove(node.project.path)} className="shrink-0 text-[var(--color-text-muted)] opacity-0 hover:text-[var(--color-error)] group-hover:opacity-100" title="移除项目">
					<X size={12} />
				</button>
			</div>
			{expanded && (node.tasks.length === 0 ? <div className="py-1 text-[14px] text-[var(--color-text-muted)]" style={{ paddingLeft: `${39 + depth * 14}px` }}>暂无项目任务</div> : node.tasks.map((task) => (
				<button
					key={task.path}
					type="button"
					onClick={() => onSelectTask(task.path)}
					className={`flex w-full items-center gap-1.5 border-l-2 py-1.5 pr-2 text-left text-[14px] transition-colors ${
						task.path === activeTaskPath
							? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-text)]'
							: 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
					}`}
					style={{ paddingLeft: `${31 + depth * 14}px` }}
					title={task.cwd}
				>
					<FileText size={13} className="shrink-0 text-[var(--color-text-muted)]" />
					<span className="min-w-0 flex-1 truncate">{task.name || task.firstMessage || '未命名项目任务'}</span>
				</button>
			)))}
		</div>
	);
}

export function SessionSidebar() {
	const projects = useSessionStore((s) => s.projects);
	const sessions = useSessionStore((s) => s.sessions);
	const sessionState = useSessionStore((s) => s.sessionState);
	const newSession = useSessionStore((s) => s.newSession);
	const newStandaloneSession = useSessionStore((s) => s.newStandaloneSession);
	const switchSession = useSessionStore((s) => s.switchSession);
	const addProject = useSessionStore((s) => s.addProject);
	const removeProject = useSessionStore((s) => s.removeProject);
	const connection = useSessionStore((s) => s.connection);
	const standaloneTaskPaths = useSessionStore((s) => s.standaloneTaskPaths);
	const currentFile = sessionState?.sessionFile;
	const { projectTree, standaloneTasks } = buildProjectTree(projects, sessions, standaloneTaskPaths);

	return (
		<aside className="flex h-full w-full shrink-0 flex-col bg-[var(--color-bg-surface)]">
			<div className="flex items-center justify-between px-3 py-2.5">
				<span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">项目</span>
				<button
					type="button"
					onClick={() => addProject()}
					disabled={connection !== 'ready'}
					className="flex items-center gap-1 rounded-md bg-[var(--color-primary-muted)] px-2 py-1 text-xs text-[var(--color-primary-hover)] transition-colors hover:bg-[var(--color-primary)]/25 disabled:opacity-40"
				>
					<FolderOpen size={12} /> 添加
				</button>
			</div>

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="shrink-0 overflow-y-auto px-1.5 pb-2">
					{projects.length === 0 ? (
						<div className="px-2 py-4 text-[14px] text-[var(--color-text-muted)]">点「添加」选择工作目录</div>
					) : (
						projectTree.map((node) => <ProjectTreeItem key={node.project.path} node={node} depth={0} activeTaskPath={currentFile} canCreateTask={connection === 'ready'} onCreateTask={(path) => void newSession(path)} onRemove={removeProject} onSelectTask={(path) => void switchSession(path)} />)
					)}
				</div>

				<div className="flex min-h-0 flex-1 flex-col border-t border-[var(--color-border)] pt-1.5">
					<div className="flex items-center justify-between px-3 py-2">
						<span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">任务</span>
						<button
							type="button"
							onClick={() => void newStandaloneSession()}
							disabled={connection !== 'ready'}
							className="flex items-center gap-1 rounded-md bg-[var(--color-primary-muted)] px-2 py-1 text-xs text-[var(--color-primary-hover)] transition-colors hover:bg-[var(--color-primary)]/25 disabled:opacity-40"
						>
							<Plus size={12} /> 添加
						</button>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
						{standaloneTasks.length === 0 ? (
							<div className="px-2 py-2 text-xs text-[var(--color-text-muted)]">暂无独立任务</div>
						) : (
							standaloneTasks.map((session) => {
								const active = session.path === currentFile;
								const label = session.name || session.firstMessage || '未命名任务';
								return (
									<button
										key={session.path}
										type="button"
										onClick={() => void switchSession(session.path)}
										className={`flex w-full items-center rounded-sm border-l-2 px-2 py-2 text-left text-[14px] transition-colors ${
											active
												? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-text)]'
												: 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
										}`}
									>
										<span className="w-full truncate">{label}</span>
									</button>
								);
							})
						)}
					</div>
				</div>
			</div>
		</aside>
	);
}
