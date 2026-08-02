/** 目标项目导航：用固定列网格保护名称与操作区，保留原有项目/cwd/会话 action。 */
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, LoaderCircle, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useSessionStore } from '@/src/store/session';
import { Button } from '@/src/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/src/components/ui/collapsible';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { Separator } from '@/src/components/ui/separator';
import { cn } from '@/src/lib/utils';
import { buildProjectTree, type ProjectTreeNode } from '@/src/components/project-tree';
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
	const projectName = node.project.name || '未命名项目';
	return <Collapsible open={expanded} onOpenChange={setExpanded}>
		<div className={styles.projectBlock} data-sidebar-menu-kind="project" data-project-path={node.project.path} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
			<div className={styles.projectRow} style={{ paddingLeft: `${8 + depth * 14}px` }}>
				<CollapsibleTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className={styles.expandButton} aria-label={expanded ? `收起 ${projectName}` : `展开 ${projectName}`}>{expanded ? <ChevronDown /> : <ChevronRight />}</Button></CollapsibleTrigger>
				{expanded ? <FolderOpen className={styles.typeIcon} /> : <Folder className={styles.typeIcon} />}
				<CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className={styles.projectLabel} title={expanded ? `收起 ${projectName}` : `展开 ${projectName}`}>{projectName}</Button></CollapsibleTrigger>
				<Button type="button" variant="ghost" size="icon-sm" onClick={() => onCreateTask(node.project.path)} disabled={!canCreateTask} className={cn(styles.action, hovered ? styles.actionVisible : '')} title="添加项目任务" aria-label={`添加 ${projectName} 的任务`}><Pencil /></Button>
			</div>
			<CollapsibleContent className={styles.projectContent}>
				{node.tasks.length === 0 ? <div className={styles.emptyProject} style={{ paddingLeft: `${39 + depth * 14}px` }}>暂无项目任务</div> : <div className={styles.taskList}>{node.tasks.map((task) => {
					const label = task.name || task.firstMessage || '未命名项目任务';
					return <Button key={task.path} type="button" variant="ghost" size="sm" data-sidebar-menu-kind="project-task" data-session-path={task.path} data-session-cwd={task.cwd} onClick={() => onSelectTask(task.path)} className={cn(styles.taskRow, task.path === activeTaskPath ? styles.taskActive : '')} style={{ paddingLeft: `${31 + depth * 14}px` }} title={task.isStreaming ? `${label}（进行中）` : label}>{task.isStreaming ? <LoaderCircle className={`${styles.taskIcon} ${styles.taskLoading}`} aria-label="任务进行中" /> : <FileText className={styles.taskIcon} />}<span className={styles.label}>{label}</span></Button>;
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
	const { projectTree, standaloneTasks } = buildProjectTree(projects, sessions, standaloneTaskPaths);
	const currentFile = selectedSessionPath ?? sessionState?.sessionFile;

	return <aside className={styles.root} aria-label="项目与任务">
		<header className={styles.header}><div className={styles.headerCopy}><span>项目</span><p>工作目录与项目任务</p></div><Button type="button" variant="secondary" size="sm" onClick={() => addProject()} disabled={connection !== 'ready'} title="添加项目"><FolderOpen />添加</Button></header>
		<ScrollArea fitContent className={styles.scroll}><div className={styles.content}>
			{projects.length === 0 ? <div className={styles.emptyState}>点「添加」选择工作目录</div> : projectTree.map((node) => <ProjectTreeItem key={node.project.path} node={node} depth={0} activeTaskPath={currentFile} canCreateTask={connection === 'ready'} onCreateTask={(path) => void newSession(path)} onSelectTask={(path) => void switchSession(path)} />)}
			<Separator className={styles.separator} />
			<div className={styles.sectionHeader}><span>任务</span><Button type="button" variant="ghost" size="icon-sm" className={styles.sectionAction} onClick={() => void newStandaloneSession()} disabled={connection !== 'ready'} title="添加任务" aria-label="添加任务"><Pencil /></Button></div>
			<div className={styles.standaloneList}>{standaloneTasks.length === 0 ? <div className={styles.emptyTask}>暂无独立任务</div> : standaloneTasks.map((session) => { const active = session.path === currentFile; const label = session.name || session.firstMessage || '未命名任务'; return <Button key={session.path} type="button" variant="ghost" size="sm" data-sidebar-menu-kind="standalone-task" data-session-path={session.path} data-session-cwd={session.cwd} onClick={() => void switchSession(session.path)} title={session.isStreaming ? `${label}（进行中）` : label} className={cn(styles.taskRow, active ? styles.taskActive : '')}>{session.isStreaming ? <LoaderCircle className={`${styles.taskIcon} ${styles.taskLoading}`} aria-label="任务进行中" /> : <FileText className={styles.taskIcon} />}<span className={styles.label}>{label}</span></Button>; })}</div>
		</div></ScrollArea>
	</aside>;
}
