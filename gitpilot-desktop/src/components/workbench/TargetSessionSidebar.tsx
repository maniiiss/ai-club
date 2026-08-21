/** 目标项目导航：用固定列网格保护名称与操作区，保留原有项目/cwd/会话 action。 */
import { ArrowsIn, ArrowsOut, ChatCircleDots, CircleNotch, Folder, FolderOpen, PencilSimple, Plus } from '@phosphor-icons/react';
import { useCallback, useMemo, useState } from 'react';
import { useSessionStore } from '@/src/store/session';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/src/components/ui/collapsible';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { Separator } from '@/src/components/ui/separator';
import { cn } from '@/src/lib/utils';
import { buildProjectTree, type ProjectTreeNode } from '@/src/components/project-tree';
import { ConversationHistorySearch } from '@/src/components/workbench/ConversationHistorySearch';
import styles from './TargetSessionSidebar.module.css';

interface ProjectTreeItemProps {
	node: ProjectTreeNode;
	depth: number;
	activeTaskPath: string | undefined;
	canCreateTask: boolean;
	onCreateTask: (path: string) => void;
	onSelectTask: (path: string) => void;
	expanded: boolean;
	onExpandedChange: (path: string, open: boolean) => void;
}

function ProjectTreeItem({ node, depth, activeTaskPath, canCreateTask, onCreateTask, onSelectTask, expanded, onExpandedChange }: ProjectTreeItemProps) {
	const [hovered, setHovered] = useState(false);
	const projectName = node.project.name || '未命名工作空间';
	// 业务意图：保留项目到任务的一级层级；折叠仍由项目名称触发，但不再占用可见角标位置。
	return <Collapsible open={expanded} onOpenChange={(open) => onExpandedChange(node.project.path, open)}>
		<div className={styles.projectBlock} data-sidebar-menu-kind="project" data-project-path={node.project.path} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
			<div className={styles.projectRow} style={{ paddingLeft: `${8 + depth * 14}px` }}>
				<CollapsibleTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className={styles.folderTrigger} aria-label={expanded ? `收起 ${projectName}` : `展开 ${projectName}`} title={expanded ? `收起 ${projectName}` : `展开 ${projectName}`}>{expanded ? <FolderOpen weight="regular" className={styles.typeIcon} aria-hidden="true" /> : <Folder weight="regular" className={styles.typeIcon} aria-hidden="true" />}</Button></CollapsibleTrigger>
				<Hint content={expanded ? `收起 ${projectName}` : `展开 ${projectName}`}><CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className={styles.projectLabel}>{projectName}</Button></CollapsibleTrigger></Hint>
				<Hint content="添加工作空间任务"><Button type="button" variant="ghost" size="icon-sm" onClick={() => onCreateTask(node.project.path)} disabled={!canCreateTask} className={cn(styles.action, hovered ? styles.actionVisible : '')} aria-label={`添加 ${projectName} 的任务`}><PencilSimple weight="regular" /></Button></Hint>
			</div>
			<CollapsibleContent className={styles.projectContent}>
			{node.tasks.length === 0 ? <div className={styles.emptyProject} style={{ paddingLeft: `${39 + depth * 14}px` }}>暂无工作空间任务</div> : <div className={styles.taskList}>{node.tasks.map((task) => {
				const label = task.name || task.firstMessage || '未命名工作空间任务';
					return <Hint key={task.path} content={task.isStreaming ? `${label}（进行中）` : label}><Button type="button" variant="ghost" size="sm" data-sidebar-menu-kind="project-task" data-session-path={task.path} data-session-cwd={task.cwd} aria-busy={task.isStreaming || undefined} onClick={() => onSelectTask(task.path)} className={cn(styles.taskRow, task.path === activeTaskPath ? styles.taskActive : '')} style={{ paddingLeft: `${31 + depth * 14}px` }}><span className={styles.label}>{label}</span>{task.isStreaming && <CircleNotch weight="bold" className={styles.taskLoading} aria-hidden="true" />}</Button></Hint>;
				})}</div>}
			</CollapsibleContent>
		</div>
	</Collapsible>;
}

export function TargetSessionSidebar() {
	const projects = useSessionStore((s) => s.projects);
	const sessions = useSessionStore((s) => s.sessions);
	const sessionState = useSessionStore((s) => s.sessionState);
	const selectedSessionPath = useSessionStore((s) => s.selectedSessionPath);
	const newSession = useSessionStore((s) => s.newSession);
	const newStandaloneSession = useSessionStore((s) => s.newStandaloneSession);
	const switchSession = useSessionStore((s) => s.switchSession);
	const addProject = useSessionStore((s) => s.addProject);
	const connection = useSessionStore((s) => s.connection);
	const standaloneTaskPaths = useSessionStore((s) => s.standaloneTaskPaths);
	const removedProjectPaths = useSessionStore((s) => s.removedProjectPaths);
	const { projectTree, standaloneTasks } = buildProjectTree(projects, sessions, standaloneTaskPaths, removedProjectPaths);
	const currentFile = selectedSessionPath ?? sessionState?.sessionFile;
	// 业务意图：把工作空间折叠状态上提，让“收起/展开全部”按钮能一键统一控制所有项目；
	// 用 Set 记录“显式折叠”的项目，新增项目不在集合中即视为默认展开。
	const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());
	const handleProjectExpandedChange = useCallback((path: string, open: boolean) => {
		setCollapsedPaths((prev) => {
			const next = new Set(prev);
			if (open) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);
	const collapseAllProjects = useCallback(() => {
		setCollapsedPaths(new Set(projectTree.map((node) => node.project.path)));
	}, [projectTree]);
	const expandAllProjects = useCallback(() => {
		setCollapsedPaths(new Set());
	}, []);
	const { hasExpandedProject, allProjectsCollapsed } = useMemo(() => {
		if (projectTree.length === 0) return { hasExpandedProject: false, allProjectsCollapsed: false };
		let expandedCount = 0;
		for (const node of projectTree) {
			if (!collapsedPaths.has(node.project.path)) expandedCount += 1;
		}
		return { hasExpandedProject: expandedCount > 0, allProjectsCollapsed: expandedCount === 0 };
	}, [projectTree, collapsedPaths]);

	return <aside className={styles.root} aria-label="工作空间与任务">
	<div className={styles.primaryNav} aria-label="会话操作"><Hint content="新建对话"><Button type="button" variant="ghost" size="sm" className={styles.primaryNavItem} onClick={() => void newStandaloneSession()} disabled={connection !== 'ready'} aria-label="新建对话"><ChatCircleDots weight="regular" aria-hidden="true" /><span>新对话</span></Button></Hint><ConversationHistorySearch items={sessions} getKey={(session) => session.path} getTitle={(session) => session.name || session.firstMessage || '未命名任务'} getSearchText={(session) => [session.name, session.firstMessage, session.allMessagesText].filter(Boolean).join(' ')} getUpdatedAt={(session) => session.modified} onSelect={(session) => switchSession(session.path)} label="搜索历史任务" triggerText="搜索" triggerVariant="nav" /></div>
		<ScrollArea fitContent className={styles.scroll}>
		<header className={styles.header}><div className={styles.headerCopy}><span>工作空间</span></div><div className={styles.headerActions}>{allProjectsCollapsed ? <Hint content="展开全部工作空间"><Button type="button" variant="ghost" size="icon-sm" className={styles.headerAction} onClick={expandAllProjects} disabled={projectTree.length === 0} aria-label="展开全部工作空间"><ArrowsOut weight="regular" aria-hidden="true" /></Button></Hint> : <Hint content="收起全部工作空间"><Button type="button" variant="ghost" size="icon-sm" className={styles.headerAction} onClick={collapseAllProjects} disabled={!hasExpandedProject} aria-label="收起全部工作空间"><ArrowsIn weight="regular" aria-hidden="true" /></Button></Hint>}<Hint content="添加工作空间"><Button type="button" variant="ghost" size="icon-sm" className={styles.headerAction} onClick={() => void addProject()} disabled={connection !== 'ready'} aria-label="添加工作空间"><Plus weight="bold" aria-hidden="true" /></Button></Hint></div></header>
			<div className={styles.content}>
			{projects.length === 0 ? <div className={styles.emptyState}>点「添加」选择工作空间目录</div> : projectTree.map((node) => <ProjectTreeItem key={node.project.path} node={node} depth={0} activeTaskPath={currentFile} canCreateTask={connection === 'ready'} onCreateTask={(path) => void newSession(path)} onSelectTask={(path) => void switchSession(path)} expanded={!collapsedPaths.has(node.project.path)} onExpandedChange={handleProjectExpandedChange} />)}
			<Separator className={styles.separator} />
			<div className={styles.sectionHeader}><span>任务</span><Hint content="添加任务"><Button type="button" variant="ghost" size="icon-sm" className={styles.sectionAction} onClick={() => void newStandaloneSession()} disabled={connection !== 'ready'} aria-label="添加任务"><PencilSimple weight="regular" /></Button></Hint></div>
			<div className={styles.standaloneList}>{standaloneTasks.length === 0 ? <div className={styles.emptyTask}>暂无独立任务</div> : standaloneTasks.map((session) => { const active = session.path === currentFile; const label = session.name || session.firstMessage || '未命名任务'; return <Hint key={session.path} content={session.isStreaming ? `${label}（进行中）` : label}><Button type="button" variant="ghost" size="sm" data-sidebar-menu-kind="standalone-task" data-session-path={session.path} data-session-cwd={session.cwd} aria-busy={session.isStreaming || undefined} onClick={() => void switchSession(session.path)} className={cn(styles.taskRow, active ? styles.taskActive : '')}><span className={styles.label}>{label}</span>{session.isStreaming && <CircleNotch weight="bold" className={styles.taskLoading} aria-hidden="true" />}</Button></Hint>; })}</div>
			</div>
		</ScrollArea>
	</aside>;
}
