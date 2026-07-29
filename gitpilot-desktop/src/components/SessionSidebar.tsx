/**
 * 会话侧栏：项目（工作目录）与任务（会话）两个并列分区。
 *
 * 项目区只负责选择和管理工作目录；任务区统一展示全部会话，避免任务被嵌套在项目下而难以查找。
 * 任务区的“添加”始终使用当前选中的项目根目录创建会话，保持现有 Agent 工作目录语义。
 */
import { Folder, FolderOpen, Plus, X } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';

/** 路径前缀匹配（兼容 Windows 反斜杠与大小写）。 */
function pathStartsWith(child: string, parent: string): boolean {
	const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
	const c = norm(child);
	const p = norm(parent);
	return c === p || c.startsWith(`${p}/`);
}

export function SessionSidebar() {
	const projects = useSessionStore((s) => s.projects);
	const currentProjectPath = useSessionStore((s) => s.currentProjectPath);
	const sessions = useSessionStore((s) => s.sessions);
	const sessionState = useSessionStore((s) => s.sessionState);
	const newSession = useSessionStore((s) => s.newSession);
	const switchSession = useSessionStore((s) => s.switchSession);
	const switchProject = useSessionStore((s) => s.switchProject);
	const addProject = useSessionStore((s) => s.addProject);
	const removeProject = useSessionStore((s) => s.removeProject);
	const connection = useSessionStore((s) => s.connection);
	const currentFile = sessionState?.sessionFile;
	const activeProjectPath = currentProjectPath ?? projects[0]?.path ?? null;
	const projectForSession = (cwd?: string) => projects.find((project) => pathStartsWith(cwd ?? '', project.path));

	return (
		<aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-surface)]">
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
						<div className="px-2 py-4 text-xs text-[var(--color-text-muted)]">点「添加」选择工作目录</div>
					) : (
						projects.map((project) => {
							const active = project.path === activeProjectPath;
							return (
								<div
									key={project.path}
									className={`group flex items-center gap-1 rounded-sm px-2 py-1.5 text-sm transition-colors ${
										active ? 'bg-[var(--color-primary-muted)] text-[var(--color-text)]' : 'text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]'
									}`}
								>
									<Folder size={13} className="shrink-0 text-[var(--color-text-muted)]" />
									<button
										type="button"
										onClick={() => switchProject(project.path)}
										className="min-w-0 flex-1 truncate text-left"
										title={project.path}
									>
										{project.name}
									</button>
									<button
										type="button"
										onClick={() => removeProject(project.path)}
										className="shrink-0 text-[var(--color-text-muted)] opacity-0 hover:text-[var(--color-error)] group-hover:opacity-100"
										title="移除项目"
									>
										<X size={12} />
									</button>
								</div>
							);
						})
					)}
				</div>

				<div className="flex min-h-0 flex-1 flex-col border-t border-[var(--color-border)] pt-1.5">
					<div className="flex items-center justify-between px-3 py-2">
						<span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">任务</span>
						<button
							type="button"
							onClick={() => newSession(activeProjectPath ?? undefined)}
							disabled={connection !== 'ready' || !activeProjectPath}
							className="flex items-center gap-1 rounded-md bg-[var(--color-primary-muted)] px-2 py-1 text-xs text-[var(--color-primary-hover)] transition-colors hover:bg-[var(--color-primary)]/25 disabled:opacity-40"
						>
							<Plus size={12} /> 添加
						</button>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
						{sessions.length === 0 ? (
							<div className="px-2 py-2 text-xs text-[var(--color-text-muted)]">暂无任务</div>
						) : (
							sessions.map((session) => {
								const active = session.path === currentFile;
								const label = session.name || session.firstMessage || '未命名任务';
								const time = session.modified ? new Date(session.modified).toLocaleString() : '';
								const project = projectForSession(session.cwd);
								return (
									<button
										key={session.path}
										type="button"
										onClick={() => switchSession(session.path)}
										className={`flex w-full flex-col items-start gap-0.5 rounded-sm border-l-2 px-2 py-1.5 text-left text-xs transition-colors ${
											active
												? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-text)]'
												: 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
										}`}
									>
										<span className="w-full truncate">{label}</span>
										<span className="w-full truncate text-[10px] text-[var(--color-text-muted)]">
											{project?.name ?? session.cwd ?? '未关联项目'}
											{time ? ` · ${time}` : ''}
											{session.messageCount > 0 ? ` · ${session.messageCount} 条` : ''}
										</span>
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
