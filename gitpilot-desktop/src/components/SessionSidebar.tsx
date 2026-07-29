/**
 * 会话侧栏：项目(工作目录) > 对话记录(会话) 两层树。
 *
 * 项目可折叠，展开后是该工作目录下的对话记录；每项目行可新建任务（cwd=项目根）、移除项目。
 * 新建任务按钮直接传项目 cwd，不依赖全局 currentProjectPath。
 */
import { Plus, FolderOpen, ChevronRight, ChevronDown, Folder, X } from 'lucide-react';
import { useState } from 'react';
import { useSessionStore } from '@/src/store/session';

/** 路径前缀匹配（兼容 Windows 反斜杠与大小写） */
function pathStartsWith(child: string, parent: string): boolean {
	const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
	const c = norm(child);
	const p = norm(parent);
	return c === p || c.startsWith(`${p}/`);
}

export function SessionSidebar() {
	const projects = useSessionStore((s) => s.projects);
	const sessions = useSessionStore((s) => s.sessions);
	const sessionState = useSessionStore((s) => s.sessionState);
	const newSession = useSessionStore((s) => s.newSession);
	const switchSession = useSessionStore((s) => s.switchSession);
	const addProject = useSessionStore((s) => s.addProject);
	const removeProject = useSessionStore((s) => s.removeProject);
	const connection = useSessionStore((s) => s.connection);
	const currentFile = sessionState?.sessionFile;
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

	const sessionsOf = (projectPath: string) => sessions.filter((s) => pathStartsWith(s.cwd ?? '', projectPath));
	const toggle = (path: string) => setCollapsed((c) => ({ ...c, [path]: !c[path] }));

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

			<div className="flex-1 overflow-y-auto px-1.5 pb-2">
				{projects.length === 0 ? (
					<div className="px-2 py-4 text-xs text-[var(--color-text-muted)]">点「添加」选择工作目录</div>
				) : (
					projects.map((p) => {
						const list = sessionsOf(p.path);
						const isCollapsed = collapsed[p.path];
						return (
							<div key={p.path} className="mb-1">
								<div className="group flex items-center gap-1 rounded-sm px-2 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]">
									<button type="button" onClick={() => toggle(p.path)} className="shrink-0 text-[var(--color-text-muted)]">
										{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
									</button>
									<Folder size={13} className="shrink-0 text-[var(--color-text-muted)]" />
									<span className="min-w-0 flex-1 truncate" title={p.path}>
										{p.name}
									</span>
									<button
										type="button"
										onClick={() => newSession(p.path)}
										className="shrink-0 text-[var(--color-text-muted)] opacity-0 hover:text-[var(--color-primary-hover)] group-hover:opacity-100"
										title="新建任务"
									>
										<Plus size={13} />
									</button>
									<button
										type="button"
										onClick={() => removeProject(p.path)}
										className="shrink-0 text-[var(--color-text-muted)] opacity-0 hover:text-[var(--color-error)] group-hover:opacity-100"
										title="移除项目"
									>
										<X size={12} />
									</button>
								</div>
								{!isCollapsed && (
									<div className="ml-3 border-l border-[var(--color-border)]">
										{list.length === 0 ? (
											<div className="px-3 py-1.5 text-xs text-[var(--color-text-muted)]">暂无任务</div>
										) : (
											list.map((s) => {
												const active = s.path === currentFile;
												const label = s.name || s.firstMessage || '未命名任务';
												const time = s.modified ? new Date(s.modified).toLocaleString() : '';
												return (
													<button
														key={s.path}
														type="button"
														onClick={() => switchSession(s.path)}
														className={`flex w-full flex-col items-start gap-0.5 border-l-2 px-3 py-1.5 text-left text-xs transition-colors ${
															active
																? 'border-[var(--color-primary)] bg-[var(--color-primary-muted)] text-[var(--color-text)]'
																: 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
														}`}
													>
														<span className="truncate">{label}</span>
														<span className="text-[10px] text-[var(--color-text-muted)]">
															{time}
															{s.messageCount > 0 ? ` · ${s.messageCount} 条` : ''}
														</span>
													</button>
												);
											})
										)}
									</div>
								)}
							</div>
						);
					})
				)}
			</div>
		</aside>
	);
}
