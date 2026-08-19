/** 目标项目导航：用固定列网格保护名称与操作区，保留原有项目/cwd/会话 action。 */
import { Folder, FolderOpen, MessageSquarePlus, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
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
}

function ProjectTreeItem({ node, depth, activeTaskPath, canCreateTask, onCreateTask, onSelectTask }: ProjectTreeItemProps) {
	const [expanded, setExpanded] = useState(true);
	const [hovered, setHovered] = useState(false);
	const projectName = node.project.name || '未命名工作空间';
	// 业务意图：保留项目到任务的一级层级；折叠仍由项目名称触发，但不再占用可见角标位置。
	return <Collapsible open={expanded} onOpenChange={setExpanded}>
		<div className={styles.projectBlock} data-sidebar-menu-kind="project" data-project-path={node.project.path} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
			<div className={styles.projectRow} style={{ paddingLeft: `${8 + depth * 14}px` }}>
				<CollapsibleTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className={styles.folderTrigger} aria-label={expanded ? `收起 ${projectName}` : `展开 ${projectName}`} title={expanded ? `收起 ${projectName}` : `展开 ${projectName}`}>{expanded ? <FolderOpen className={styles.typeIcon} aria-hidden="true" /> : <Folder className={styles.typeIcon} aria-hidden="true" />}</Button></CollapsibleTrigger>
				<Hint content={expanded ? `收起 ${projectName}` : `展开 ${projectName}`}><CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className={styles.projectLabel}>{projectName}</Button></CollapsibleTrigger></Hint>
				<Hint content="添加工作空间任务"><Button type="button" variant="ghost" size="icon-sm" onClick={() => onCreateTask(node.project.path)} disabled={!canCreateTask} className={cn(styles.action, hovered ? styles.actionVisible : '')} aria-label={`添加 ${projectName} 的任务`}><Pencil /></Button></Hint>
			</div>
			<CollapsibleContent className={styles.projectContent}>
			{node.tasks.length === 0 ? <div className={styles.emptyProject} style={{ paddingLeft: `${39 + depth * 14}px` }}>暂无工作空间任务</div> : <div className={styles.taskList}>{node.tasks.map((task) => {
				const label = task.name || task.firstMessage || '未命名工作空间任务';
					return <Hint key={task.path} content={task.isStreaming ? `${label}（进行中）` : label}><Button type="button" variant="ghost" size="sm" data-sidebar-menu-kind="project-task" data-session-path={task.path} data-session-cwd={task.cwd} aria-busy={task.isStreaming || undefined} onClick={() => onSelectTask(task.path)} className={cn(styles.taskRow, task.path === activeTaskPath ? styles.taskActive : '')} style={{ paddingLeft: `${31 + depth * 14}px` }}><span className={styles.label}>{label}</span></Button></Hint>;
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

	return <aside className={styles.root} aria-label="工作空间与任务">
	<div className={styles.primaryNav} aria-label="会话操作"><Hint content="新建对话"><Button type="button" variant="ghost" size="sm" className={styles.primaryNavItem} onClick={() => void newStandaloneSession()} disabled={connection !== 'ready'} aria-label="新建对话"><MessageSquarePlus aria-hidden="true" /><span>新对话</span></Button></Hint><ConversationHistorySearch items={sessions} getKey={(session) => session.path} getTitle={(session) => session.name || session.firstMessage || '未命名任务'} getSearchText={(session) => [session.name, session.firstMessage, session.allMessagesText].filter(Boolean).join(' ')} getUpdatedAt={(session) => session.modified} onSelect={(session) => switchSession(session.path)} label="搜索历史任务" triggerText="搜索" triggerVariant="nav" /></div>
	<header className={styles.header}><div className={styles.headerCopy}><span>工作空间</span></div><Hint content="添加工作空间"><Button type="button" variant="secondary" size="icon-sm" className={styles.headerAction} onClick={() => void addProject()} disabled={connection !== 'ready'} aria-label="添加工作空间"><Plus aria-hidden="true" /></Button></Hint></header>
		<ScrollArea fitContent className={styles.scroll}><div className={styles.content}>
			{projects.length === 0 ? <div className={styles.emptyState}>点「添加」选择工作空间目录</div> : projectTree.map((node) => <ProjectTreeItem key={node.project.path} node={node} depth={0} activeTaskPath={currentFile} canCreateTask={connection === 'ready'} onCreateTask={(path) => void newSession(path)} onSelectTask={(path) => void switchSession(path)} />)}
			<Separator className={styles.separator} />
			<div className={styles.sectionHeader}><span>任务</span><Hint content="添加任务"><Button type="button" variant="ghost" size="icon-sm" className={styles.sectionAction} onClick={() => void newStandaloneSession()} disabled={connection !== 'ready'} aria-label="添加任务"><Pencil /></Button></Hint></div>
			<div className={styles.standaloneList}>{standaloneTasks.length === 0 ? <div className={styles.emptyTask}>暂无独立任务</div> : standaloneTasks.map((session) => { const active = session.path === currentFile; const label = session.name || session.firstMessage || '未命名任务'; return <Hint key={session.path} content={session.isStreaming ? `${label}（进行中）` : label}><Button type="button" variant="ghost" size="sm" data-sidebar-menu-kind="standalone-task" data-session-path={session.path} data-session-cwd={session.cwd} aria-busy={session.isStreaming || undefined} onClick={() => void switchSession(session.path)} className={cn(styles.taskRow, active ? styles.taskActive : '')}><span className={styles.label}>{label}</span></Button></Hint>; })}</div>
		</div></ScrollArea>
	</aside>;
}
