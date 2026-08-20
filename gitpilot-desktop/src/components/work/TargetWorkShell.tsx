import { ClipboardList, File, FileArchive, FileCode2, FileImage, FileJson, FilePlus2, FileSpreadsheet, FileText, Folder, FolderOpen, Loader2, LoaderCircle, Maximize2, MessageSquarePlus, Minimize2, Network, Pencil, Plus, Send, Sparkles, Square, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { TargetTitleBar } from '@/src/components/desktop/TargetTitleBar';
import { ModelPicker } from '@/src/components/ModelPicker';
import { TargetWorkbenchLayout } from '@/src/components/workbench/TargetWorkbenchLayout';
import { WelcomeView } from '@/src/components/workbench/WelcomeView';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/src/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import { MessageBubble } from '@/src/components/MessageBubble';
import { ExecutionActivity } from '@/src/components/ExecutionActivity';
import { CommandPalette } from '@/src/components/CommandPalette';
import { onEvent, rpc } from '@/src/rpc/bridge';
import { useSessionStore } from '@/src/store/session';
import type { WorkFile, WorkMessage, WorkTask, WorkWorkspaceEntry } from '@/src/store/work';
import { getWorkTaskTitle, useWorkStore } from '@/src/store/work';
import type { UIMessage } from '@/src/store/session';
import type { RpcWorkItemDetail, WorkStreamEvent } from '@/src/rpc/types';
import { cn } from '@/src/lib/utils';
import chatStyles from '@/src/components/ChatView.module.css';
import inputStyles from '@/src/components/InputBox.module.css';
import inspectorStyles from '@/src/components/features/TargetExecutionInspector.module.css';
import sidebarStyles from '@/src/components/workbench/TargetSessionSidebar.module.css';
import { ConversationHistorySearch } from '@/src/components/workbench/ConversationHistorySearch';
import { getAdditionalScrollTail, getConversationFollowScrollTop, getConversationScrollBehavior, scrollMessageToSafeZone, shouldAnchorNewMessage } from '@/src/components/conversation-scroll';
import { applyWorkStreamEvent, createWorkRun, settleWorkRun, workMessageToUIMessage, type WorkExecutionBatch, type WorkRunState } from './work-execution';
import { WorkCollaborationPanel, buildWorkItemConversationContext } from './WorkCollaborationPanel';
import styles from './TargetWorkShell.module.css';

function id(): string { return crypto.randomUUID(); }

function fileExtension(file: WorkFile): string {
	const name = file.name || file.path;
	const extension = name.split('.').pop()?.toLowerCase();
	return extension && extension !== name.toLowerCase() ? extension : 'file';
}

function FileTypeIcon({ file }: { file: WorkFile }) {
	const extension = fileExtension(file);
	if (['ts', 'tsx', 'js', 'jsx', 'css', 'html', 'py', 'java', 'go', 'rs', 'sql', 'sh'].includes(extension)) return <FileCode2 aria-hidden="true" />;
	if (['json', 'jsonl'].includes(extension)) return <FileJson aria-hidden="true" />;
	if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(extension)) return <FileImage aria-hidden="true" />;
	if (['csv', 'xls', 'xlsx'].includes(extension)) return <FileSpreadsheet aria-hidden="true" />;
	if (['zip', 'tar', 'gz', '7z', 'rar'].includes(extension)) return <FileArchive aria-hidden="true" />;
	if (['md', 'txt', 'log'].includes(extension)) return <FileText aria-hidden="true" />;
	return <File aria-hidden="true" />;
}

function formatFileSize(size: number): string {
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFileDate(updatedAt: number): string {
	if (!updatedAt) return '未同步';
	return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(updatedAt);
}

function fileChangeLabel(changeState: WorkFile['changeState']): string | null {
	if (changeState === 'created') return '新建';
	if (changeState === 'updated' || changeState === 'unsaved') return '已更新';
	return null;
}

interface WorkTaskSidebarProps {
	tasks: WorkTask[];
	activeTaskId: string | null;
	runningTaskId: string | null;
	workspaces: WorkWorkspaceEntry[];
	currentWorkspacePath: string | null;
	onCreate: (workspacePath?: string | null) => void;
	onSelect: (id: string) => void;
	onAddWorkspace: () => void;
	onSelectWorkspace: (path: string | null) => void;
}

function WorkTaskRow({ task, active, running, indent, onSelect }: { task: WorkTask; active: boolean; running: boolean; indent: boolean; onSelect: (id: string) => void }) {
	const label = getWorkTaskTitle(task.title, task.messages.find((message) => message.role === 'user')?.text);
	return <Hint content={running ? `${label}（进行中）` : label}><Button type="button" variant="ghost" size="sm" data-sidebar-menu-kind="work-task" data-work-task-id={task.id} data-session-cwd={task.workspacePath} aria-busy={running || undefined} onClick={() => onSelect(task.id)} className={`${sidebarStyles.taskRow} ${active ? sidebarStyles.taskActive : ''}`} style={indent ? { paddingLeft: '31px' } : undefined}><span className={sidebarStyles.label}>{label}</span>{running && <LoaderCircle className={sidebarStyles.taskLoading} aria-hidden="true" />}</Button></Hint>;
}

/** 工作空间分组：组头点击切换当前工作空间，新建任务会落到该目录（sidecar cwd 绑定）。 */
function WorkWorkspaceGroup({ workspace, tasks, activeTaskId, runningTaskId, current, expanded, onExpandedChange, onCreate, onSelect, onSelectWorkspace }: { workspace: WorkWorkspaceEntry; tasks: WorkTask[]; activeTaskId: string | null; runningTaskId: string | null; current: boolean; expanded: boolean; onExpandedChange: (path: string, open: boolean) => void; onCreate: (workspacePath?: string | null) => void; onSelect: (id: string) => void; onSelectWorkspace: (path: string | null) => void }) {
	const [hovered, setHovered] = useState(false);
	return <Collapsible open={expanded} onOpenChange={(open) => onExpandedChange(workspace.path, open)}>
		<div className={sidebarStyles.projectBlock} data-sidebar-menu-kind="work-project" data-project-path={workspace.path} data-workspace-path={workspace.path} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
			<div className={sidebarStyles.projectRow}>
				<CollapsibleTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className={sidebarStyles.folderTrigger} aria-label={expanded ? `收起 ${workspace.name}` : `展开 ${workspace.name}`} title={expanded ? `收起 ${workspace.name}` : `展开 ${workspace.name}`}>{expanded ? <FolderOpen className={sidebarStyles.typeIcon} aria-hidden="true" /> : <Folder className={sidebarStyles.typeIcon} aria-hidden="true" />}</Button></CollapsibleTrigger>
				<Hint content={expanded ? `收起 ${workspace.name}` : `展开 ${workspace.name}`}><CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className={sidebarStyles.projectLabel} onClick={() => onSelectWorkspace(workspace.path)} aria-label={`选择并${expanded ? '收起' : '展开'}工作空间 ${workspace.name}`} aria-current={current || undefined}>{workspace.name}</Button></CollapsibleTrigger></Hint>
				<Hint content="在该工作空间新建任务"><Button type="button" variant="ghost" size="icon-sm" onClick={() => onCreate(workspace.path)} className={cn(sidebarStyles.action, hovered ? sidebarStyles.actionVisible : '')} aria-label={`在 ${workspace.name} 新建任务`}><FilePlus2 /></Button></Hint>
			</div>
			<CollapsibleContent className={sidebarStyles.projectContent}>
				{tasks.length === 0 ? <div className={sidebarStyles.emptyProject} style={{ paddingLeft: '39px' }}>暂无任务</div> : <div className={sidebarStyles.taskList}>{tasks.map((task) => <WorkTaskRow key={task.id} task={task} active={task.id === activeTaskId} running={task.id === runningTaskId} indent onSelect={onSelect} />)}</div>}
			</CollapsibleContent>
		</div>
	</Collapsible>;
}

function WorkTaskSidebar({ tasks, activeTaskId, runningTaskId, workspaces, currentWorkspacePath, onCreate, onSelect, onAddWorkspace, onSelectWorkspace }: WorkTaskSidebarProps) {
	// 业务意图：把工作空间折叠状态上提到侧栏，配合“收起/展开全部”按钮统一控制；
	// 用 Set 记录“显式折叠”的工作空间路径，未在集合中的视为默认展开，新工作空间自动可见。
	const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(() => new Set());
	const handleWorkspaceExpandedChange = (path: string, open: boolean) => {
		setCollapsedWorkspaces((prev) => {
			const next = new Set(prev);
			if (open) next.delete(path);
			else next.add(path);
			return next;
		});
	};
	const collapseAllWorkspaces = () => {
		setCollapsedWorkspaces(new Set(workspaces.map((workspace) => workspace.path)));
	};
	const expandAllWorkspaces = () => {
		setCollapsedWorkspaces(new Set());
	};
	const hasExpandedWorkspace = workspaces.some((workspace) => !collapsedWorkspaces.has(workspace.path));
	const allWorkspacesCollapsed = workspaces.length > 0 && !hasExpandedWorkspace;
	// 任务保留已删除工作空间的路径元数据；只有从未绑定工作空间的任务才进入未分组列表。
	const ungrouped = tasks.filter((task) => !task.workspaceRootPath);
	return <aside className={sidebarStyles.root} aria-label="Work 工作空间与任务">
		<div className={sidebarStyles.primaryNav} aria-label="会话操作"><Hint content="新建对话"><Button type="button" variant="ghost" size="sm" className={sidebarStyles.primaryNavItem} onClick={() => onCreate(null)} aria-label="新建对话"><MessageSquarePlus aria-hidden="true" /><span>新对话</span></Button></Hint><ConversationHistorySearch items={tasks} getKey={(task) => task.id} getTitle={(task) => getWorkTaskTitle(task.title, task.messages.find((message) => message.role === 'user')?.text)} getSearchText={(task) => [getWorkTaskTitle(task.title, task.messages.find((message) => message.role === 'user')?.text), ...task.messages.map((message) => message.text)].join(' ')} getUpdatedAt={(task) => task.updatedAt} onSelect={(task) => onSelect(task.id)} label="搜索历史任务" triggerText="搜索" triggerVariant="nav" /></div>
		<header className={sidebarStyles.header}><div className={sidebarStyles.headerCopy}><span>工作空间</span></div><div className={sidebarStyles.headerActions}>{allWorkspacesCollapsed ? <Hint content="展开全部工作空间"><Button type="button" variant="secondary" size="icon-sm" className={sidebarStyles.headerAction} onClick={expandAllWorkspaces} disabled={workspaces.length === 0} aria-label="展开全部工作空间"><Maximize2 aria-hidden="true" /></Button></Hint> : <Hint content="收起全部工作空间"><Button type="button" variant="secondary" size="icon-sm" className={sidebarStyles.headerAction} onClick={collapseAllWorkspaces} disabled={!hasExpandedWorkspace} aria-label="收起全部工作空间"><Minimize2 aria-hidden="true" /></Button></Hint>}<Hint content="添加工作空间"><Button type="button" variant="secondary" size="icon-sm" className={sidebarStyles.headerAction} onClick={onAddWorkspace} aria-label="添加工作空间"><Plus aria-hidden="true" /></Button></Hint></div></header>
		<ScrollArea fitContent className={sidebarStyles.scroll}><div className={sidebarStyles.content}>
			{workspaces.map((workspace) => <WorkWorkspaceGroup key={workspace.path} workspace={workspace} tasks={tasks.filter((task) => task.workspaceRootPath === workspace.path)} activeTaskId={activeTaskId} runningTaskId={runningTaskId} current={workspace.path === currentWorkspacePath} expanded={!collapsedWorkspaces.has(workspace.path)} onExpandedChange={handleWorkspaceExpandedChange} onCreate={onCreate} onSelect={onSelect} onSelectWorkspace={onSelectWorkspace} />)}
			{workspaces.length > 0 && <div className={sidebarStyles.sectionHeader}><span>未分组任务</span><Hint content="新建任务"><Button type="button" variant="ghost" size="icon-sm" className={sidebarStyles.sectionAction} onClick={() => onCreate(null)} aria-label="新建任务"><FilePlus2 /></Button></Hint></div>}
			{ungrouped.length === 0 ? (workspaces.length === 0 ? <div className={sidebarStyles.emptyState}>点「新建」开始一项 Work，或先添加工作空间</div> : <div className={sidebarStyles.emptyTask}>暂无未分组任务</div>) : <div className={sidebarStyles.standaloneList}>{ungrouped.map((task) => <WorkTaskRow key={task.id} task={task} active={task.id === activeTaskId} running={task.id === runningTaskId} indent={false} onSelect={onSelect} />)}</div>}
		</div></ScrollArea>
	</aside>;
}

function WorkInputBox({ disabled, running, onSend, onAbort, inline, pendingWorkItem, onClearPendingWorkItem }: { disabled: boolean; running: boolean; onSend: (text: string) => void; onAbort: () => void; inline?: boolean; pendingWorkItem: RpcWorkItemDetail | null; onClearPendingWorkItem: () => void }) {
	const [text, setText] = useState('');
	const commands = useSessionStore((state) => state.commands);
	const [showPalette, setShowPalette] = useState(false);
	const rootClassName = inline ? `${inputStyles.root} ${inputStyles.inline}` : inputStyles.root;
	// 待发送工作项以 <work_item> 块追加到用户消息之后；只有工作项时填入默认指令，允许“零输入”发送。
	const submit = () => {
		const hasText = text.trim().length > 0;
		if ((!hasText && !pendingWorkItem) || disabled || running) return;
		const message = pendingWorkItem ? `${hasText ? text.trim() : '请基于以下工作项推进：'}\n\n${buildWorkItemConversationContext(pendingWorkItem)}` : text.trim();
		onSend(message);
		setText('');
		setShowPalette(false);
	};
	// Work 输入框遵循即时发送习惯：普通回车发送，Shift+Enter 保留换行；/project 等命令交给 Work 专属 AgentSession 执行。
	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (showPalette && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
			event.preventDefault();
			return;
		}
		if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
	};
	const onTextChange = (value: string) => {
		setText(value);
		setShowPalette(value.startsWith('/') && !value.includes(' '));
	};
	const pickCommand = (name: string) => { setText(`/${name} `); setShowPalette(false); };
	return <div className={rootClassName}><div className={inputStyles.surface}>{showPalette && <CommandPalette commands={commands} query={text.slice(1)} onPick={pickCommand} onDismiss={() => setShowPalette(false)} />}{pendingWorkItem ? <div className={styles.collabPendingChip}><ClipboardList size={12} aria-hidden="true" /><strong>{pendingWorkItem.workItemCode} {pendingWorkItem.name}</strong><button type="button" onClick={onClearPendingWorkItem} aria-label="移除待发送工作项"><X size={12} /></button></div> : null}<div className={inputStyles.composerRow}><textarea className={`${inputStyles.editorShell} ${inputStyles.editorSurface} ${styles.workEditor}`} value={text} onChange={(event) => onTextChange(event.target.value)} onKeyDown={onKeyDown} disabled={disabled} placeholder="描述你要推进的工作" aria-label="发送 Work 消息" /></div><div className={inputStyles.toolbar}><div className={inputStyles.actions}><ModelPicker />{running ? <Hint content="停止"><Button type="button" variant="ghost" size="icon" onClick={onAbort} aria-label="停止"><Square size={15} /></Button></Hint> : <Hint content="发送"><Button type="button" variant="default" size="icon" onClick={submit} disabled={disabled || (!text.trim() && !pendingWorkItem)} aria-label="发送"><Send size={16} /></Button></Hint>}</div></div></div></div>;
}

function WorkConversation({ task, run, running, inputBlocked, onSend, onAbort, pendingWorkItem, onClearPendingWorkItem }: { task: WorkTask | null; run: WorkRunState | null; running: boolean; inputBlocked: boolean; onSend: (text: string) => void; onAbort: () => void; pendingWorkItem: RpcWorkItemDetail | null; onClearPendingWorkItem: () => void }) {
	const streamingText = run?.text ?? '';
	const scrollRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const messageNodes = useRef(new Map<string, HTMLElement>());
	const scrollMode = useRef<'bottom' | 'positioning' | 'following' | 'manual'>('bottom');
	const scrollingToNewMessage = useRef(false);
	const previousTaskId = useRef<string | null>(task?.id ?? null);
	const previousUserId = useRef<string | null>(null);
	const initializedTask = useRef(false);
	const newMessageTimer = useRef<number | null>(null);
	const newMessageExtraSpace = useRef(0);
	const newMessageAnchorTop = useRef(0);
	const [newMessageId, setNewMessageId] = useState<string | null>(null);
	const latestUserId = useMemo(() => [...(task?.messages ?? [])].reverse().find((message) => message.role === 'user')?.id ?? null, [task?.messages]);
	const taskRef = useRef(task);
	const runningRef = useRef(running);
	const streamingTextRef = useRef(streamingText);
	taskRef.current = task;
	runningRef.current = running;
	streamingTextRef.current = streamingText;

	/** Work 发送后先把用户消息抬到安全区；首段流式回复出现后再恢复底部跟随。 */
	useLayoutEffect(() => {
		if (previousTaskId.current !== (task?.id ?? null)) {
			previousTaskId.current = task?.id ?? null;
			previousUserId.current = latestUserId;
			initializedTask.current = true;
			scrollMode.current = 'bottom';
			scrollingToNewMessage.current = false;
			newMessageExtraSpace.current = 0;
			newMessageAnchorTop.current = 0;
			contentRef.current?.style.setProperty('--gp-new-message-extra-space', '0px');
			setNewMessageId(null);
			if (newMessageTimer.current != null) window.clearTimeout(newMessageTimer.current);
			return;
		}
		if (!initializedTask.current) {
			initializedTask.current = true;
			previousUserId.current = latestUserId;
			return;
		}
		const previousId = previousUserId.current;
		previousUserId.current = latestUserId;
		if (!task || !latestUserId || !shouldAnchorNewMessage({ initialized: initializedTask.current, currentUserId: latestUserId, previousUserId: previousId })) return;

		const container = scrollRef.current;
		const message = messageNodes.current.get(latestUserId);
		if (!container || !message) return;
		scrollMode.current = 'positioning';
		// 新一轮发送重新计算尾部空间，避免上一轮的人工留白参与本轮目标计算。
		newMessageExtraSpace.current = 0;
		newMessageAnchorTop.current = 0;
		contentRef.current?.style.setProperty('--gp-new-message-extra-space', '0px');
		newMessageExtraSpace.current = getAdditionalScrollTail(container, message);
		contentRef.current?.style.setProperty('--gp-new-message-extra-space', `${newMessageExtraSpace.current}px`);
		setNewMessageId(latestUserId);
		if (newMessageTimer.current != null) window.clearTimeout(newMessageTimer.current);

		let removeScrollEndListener: (() => void) | undefined;
		const frame = window.requestAnimationFrame(() => {
			const currentContainer = scrollRef.current;
			const currentMessage = messageNodes.current.get(latestUserId);
			if (!currentContainer || !currentMessage) return;
			const reducedMotion = getConversationScrollBehavior() === 'auto';
			scrollingToNewMessage.current = !reducedMotion;
			newMessageAnchorTop.current = scrollMessageToSafeZone(currentContainer, currentMessage, { reducedMotion });
			let finished = false;
			const finish = () => {
				if (finished) return;
				finished = true;
				scrollingToNewMessage.current = false;
				const latestTask = taskRef.current;
				const latestMessages = latestTask?.messages ?? [];
				const latestUserIndex = latestMessages.findIndex((entry) => entry.id === latestUserId);
				const replyStarted = latestUserIndex >= 0 && latestMessages.some((item, index) => item.role === 'assistant' && index > latestUserIndex);
				if (replyStarted || (runningRef.current && streamingTextRef.current)) {
					scrollMode.current = 'following';
					currentContainer.scrollTop = getConversationFollowScrollTop(currentContainer, newMessageExtraSpace.current, newMessageAnchorTop.current);
				} else if (runningRef.current) {
					scrollMode.current = 'positioning';
				} else {
					scrollMode.current = 'manual';
				}
			};
			if (reducedMotion) {
				finish();
				return;
			}
			currentContainer.addEventListener('scrollend', finish, { once: true });
			removeScrollEndListener = () => currentContainer.removeEventListener('scrollend', finish);
			newMessageTimer.current = window.setTimeout(finish, 520);
		});

		return () => {
			window.cancelAnimationFrame(frame);
			removeScrollEndListener?.();
			scrollingToNewMessage.current = false;
			if (newMessageTimer.current != null) window.clearTimeout(newMessageTimer.current);
		};
	}, [latestUserId, task?.id]);

	useLayoutEffect(() => {
		if (!newMessageId || scrollMode.current !== 'positioning' || scrollingToNewMessage.current) return;
		const container = scrollRef.current;
		const userIndex = task?.messages.findIndex((message) => message.id === newMessageId) ?? -1;
		const replyStarted = userIndex >= 0 && Boolean(task?.messages.slice(userIndex + 1).some((message) => message.role === 'assistant'));
		if (!container) return;
		if (!running && !replyStarted) {
			scrollMode.current = 'manual';
			return;
		}
		if (!replyStarted && !streamingText) return;
		scrollMode.current = 'following';
		container.scrollTop = getConversationFollowScrollTop(container, newMessageExtraSpace.current, newMessageAnchorTop.current);
	}, [newMessageId, running, streamingText, task?.messages]);

	useLayoutEffect(() => {
		const container = scrollRef.current;
		if (!container) return;
		if (scrollMode.current === 'bottom') {
			container.scrollTop = container.scrollHeight;
		} else if (scrollMode.current === 'following' && running) {
			container.scrollTop = getConversationFollowScrollTop(container, newMessageExtraSpace.current, newMessageAnchorTop.current);
		}
	}, [task?.id, task?.messages, running, streamingText]);

	const onScroll = () => {
		if (scrollingToNewMessage.current) return;
		const container = scrollRef.current;
		if (!container) return;
		const latestScrollTop = newMessageExtraSpace.current > 0
			? getConversationFollowScrollTop(container, newMessageExtraSpace.current, newMessageAnchorTop.current)
			: container.scrollHeight - container.clientHeight;
		if (newMessageExtraSpace.current > 0 && container.scrollTop > latestScrollTop + 1) {
			// 人工尾部留白只服务于发送后的定位，用户手动下滚不能把正文继续顶出视口。
			container.scrollTop = latestScrollTop;
			return;
		}
		const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
		// 用户主动上滚查看历史时停止自动跟随，避免新 token 抢回阅读位置。
		if (!atBottom && (scrollMode.current === 'following' || scrollMode.current === 'positioning')) scrollMode.current = 'manual';
	};

	const isEmpty = !task || (task.messages.length === 0 && !running);
	// 空会话展示居中欢迎页；任务产生首条消息后回到常规消息流 + 底部输入框布局。
	if (isEmpty) return <main className={styles.conversation} aria-label="Work 对话区">
		<WelcomeView mode="work" composer={<WorkInputBox disabled={inputBlocked} running={running} onSend={onSend} onAbort={onAbort} inline pendingWorkItem={pendingWorkItem} onClearPendingWorkItem={onClearPendingWorkItem} />} />
	</main>;
	return <main className={styles.conversation} aria-label="Work 对话区">
		<div className={chatStyles.surface} data-new-message={newMessageId ? 'true' : undefined}>
			<div ref={scrollRef} onScroll={onScroll} className={chatStyles.scroll}>
				<div className={chatStyles.frame}>
					<div ref={contentRef} className={chatStyles.content}>
						{task ? (task.messages.length === 0 && !running ? <div className={chatStyles.empty}><div className={chatStyles.emptyIcon}><Sparkles size={26} /></div><div><h2>开始一项 Work</h2><p>围绕 GitPilot 工作项协同推进工作，正式产出请写入工作空间文件。</p></div></div> : <div className={chatStyles.messages}>
							{task.messages.map((message) => <article key={message.id} className={`${styles.message} ${newMessageId === message.id ? chatStyles.newMessageSlot : ''}`} ref={(node) => {
								if (node) messageNodes.current.set(message.id, node);
								else messageNodes.current.delete(message.id);
							}}>
								{/* execution 形态的历史消息复用 Code 模式的执行批次卡片，思考与工具按真实顺序回显 */}
								<MessageBubble message={workMessageToUIMessage(message)} />
								{message.sources?.length ? <div className={styles.sources}>{message.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><span>{source.snippet}</span></a>)}</div> : null}
							</article>)}
							{running && <article className={styles.message}>
								<MessageBubble message={{ id: `work-streaming-${task.id}`, role: 'assistant', text: streamingText || '正在处理…', kind: 'text', streaming: true } as UIMessage} />
								{/* 当前思考/工具活动跟在最新正文之后，与 Code 模式的实时执行面板保持一致 */}
								{run && <ExecutionActivity isStreaming={running} execution={run} />}
							</article>}
						</div>) : <div className={chatStyles.empty}><h2>点击新建开始 Work</h2></div>}
					</div>
				</div>
			</div>
		</div>
		<WorkInputBox disabled={inputBlocked || !task} running={running} onSend={onSend} onAbort={onAbort} pendingWorkItem={pendingWorkItem} onClearPendingWorkItem={onClearPendingWorkItem} />
	</main>;
}


function WorkFilesInspector({ task, onOpen, onRename, onDelete, collaborationRefreshKey, onSendWorkItemToConversation }: { task: WorkTask | null; onOpen: (file: WorkFile) => void; onRename: (file: WorkFile) => void; onDelete: (file: WorkFile) => void; collaborationRefreshKey: number; onSendWorkItemToConversation: (item: RpcWorkItemDetail) => void }) {
	type WorkInspectorTabId = 'files' | 'collaboration';
	const [openTabs, setOpenTabs] = useState<WorkInspectorTabId[]>(['collaboration']);
	const [activeTab, setActiveTab] = useState<WorkInspectorTabId>('collaboration');
	const [activePath, setActivePath] = useState<string | null>(null);
	useEffect(() => {
		setActivePath(task?.files[0]?.path ?? null);
	}, [task?.id]);
	useEffect(() => {
		const availablePaths = new Set(task?.files.map((file) => file.path) ?? []);
		setActivePath((path) => path && availablePaths.has(path) ? path : null);
	}, [task?.files]);
	const openFunctionTab = (tab: WorkInspectorTabId) => {
		setOpenTabs((tabs) => tabs.includes(tab) ? tabs : [...tabs, tab]);
		setActiveTab(tab);
	};
	const closeFunctionTab = (tab: WorkInspectorTabId) => {
		setOpenTabs((tabs) => {
			const index = tabs.indexOf(tab);
			const nextTabs = tabs.filter((item) => item !== tab);
			if (activeTab === tab) setActiveTab(nextTabs[index] ?? nextTabs[index - 1] ?? (nextTabs[0] ?? 'files'));
			return nextTabs;
		});
	};
	const tabs: Array<{ id: WorkInspectorTabId; label: string; icon: typeof FolderOpen }> = [{ id: 'collaboration', label: '工作项协同', icon: Network }, { id: 'files', label: '文件', icon: FolderOpen }];
	return <aside className={inspectorStyles.root} aria-label="工作空间文件">
		<nav className={styles.fileTabs} aria-label="Work 功能页签" onMouseDown={(event) => event.stopPropagation()}>
			<div className={styles.fileTabScroller}>
				{openTabs.map((tabId) => { const tab = tabs.find((item) => item.id === tabId)!; const Icon = tab.icon; return <div key={tab.id} className={`${styles.fileTab} ${activeTab === tab.id ? styles.fileTabActive : ''}`} role="tab" tabIndex={0} aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveTab(tab.id); } }}><Icon /><span>{tab.label}</span><button type="button" className={styles.fileTabClose} onClick={(event) => { event.stopPropagation(); closeFunctionTab(tab.id); }} aria-label={`关闭${tab.label}`}><X size={12} /></button></div>; })}
			</div>
			<div className={styles.fileTabActions}>
				<DropdownMenu><Hint content="打开功能页签"><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className={`${styles.addFileTab} focus-visible:outline-none focus-visible:ring-0`} aria-label="打开 Work 功能页签"><Plus size={15} /></Button></DropdownMenuTrigger></Hint><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => openFunctionTab('collaboration')}><Network />工作项协同</DropdownMenuItem><DropdownMenuItem onSelect={() => openFunctionTab('files')}><FolderOpen />文件</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
			</div>
		</nav>
		{openTabs.length === 0 ? <div className={styles.fileEmpty}><FolderOpen size={20} /><span>右侧功能面板已关闭</span><small>点击上方“+”重新打开一个功能面板。</small></div> : activeTab === 'files' ? (task ? <ScrollArea className={styles.fileList} fitContent>{task.files.length ? <div className={styles.fileRows} role="list">{task.files.map((file) => { const changeLabel = fileChangeLabel(file.changeState); const isActive = activePath === file.path; return <div key={file.path} className={`${styles.fileRow} ${isActive ? styles.fileRowActive : ''}`} role="listitem"><Button type="button" variant="unstyled" className={styles.fileRowButton} onClick={() => { setActivePath(file.path); onOpen(file); }} aria-label={`打开 ${file.path}`}><span className={`${styles.fileIcon} ${styles[`fileIcon_${fileExtension(file)}`] || ''}`}><FileTypeIcon file={file} /></span><span className={styles.fileBody}><span className={styles.fileName}>{file.name || file.path}</span><span className={styles.fileMeta}><span>{fileExtension(file).toUpperCase()}</span><span>{formatFileSize(file.size)}</span><span>{formatFileDate(file.updatedAt)}</span>{changeLabel ? <span className={styles.fileStatus}>{changeLabel}</span> : null}</span></span></Button><div className={styles.fileActions}><Button type="button" variant="ghost" size="icon-sm" onClick={() => onRename(file)} title="重命名" aria-label={`重命名 ${file.path}`}><Pencil size={14} /></Button><Button type="button" variant="ghost" size="icon-sm" className={styles.deleteFileButton} onClick={() => onDelete(file)} title="删除" aria-label={`删除 ${file.path}`}><Trash2 size={14} /></Button></div></div>; })}</div> : <div className={styles.fileEmpty}><FileText size={20} /><span>暂无文件</span><small>让 Agent 写入工作空间后，文件会出现在这里。</small></div>} </ScrollArea> : <div className={styles.fileEmpty}><FileText size={20} /><span>尚未创建工作空间</span><small>新建任务后即可管理文件产出。</small></div>) : <WorkCollaborationPanel refreshKey={collaborationRefreshKey} onSendToConversation={onSendWorkItemToConversation} />}
	</aside>;
}

export function TargetWorkShell() {
	const { tasks, activeTaskId, workspaces, currentWorkspacePath, hydrated, hydrate, createTask, selectTask, updateTask, appendMessage, upsertFile, removeFile, addWorkspace, selectWorkspace } = useWorkStore();
	const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
	// 工作项协同面板：模型回合结束后递增刷新信号，面板据此重拉当前页；用户“发送到对话”的工作项暂存在输入框上方。
	const [collaborationRefreshKey, setCollaborationRefreshKey] = useState(0);
	const [pendingWorkItem, setPendingWorkItem] = useState<RpcWorkItemDetail | null>(null);
	// Work 执行过程运行态：work_* 事件先进入纯状态机归并，产物（执行批次/正文段）按真实顺序写入 work store。
	const [run, setRun] = useState<WorkRunState | null>(null);
	const runRef = useRef<WorkRunState | null>(null);
	const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) ?? null, [tasks, activeTaskId]);
	useEffect(() => { void hydrate(); }, [hydrate]);
	/** 把执行过程批次落盘为 kind === 'execution' 的 WorkMessage（IndexedDB 持久化 + 会话回显）。 */
	const appendExecutionBatch = (taskId: string, batch: WorkExecutionBatch) => {
		appendMessage(taskId, { id: id(), role: 'assistant', text: '', createdAt: Date.now(), kind: 'execution', steps: batch.steps, thinking: batch.thinking });
	};
	/** 归档尾部执行过程并兜底最终正文；返回后清除运行态。 */
	const settleRun = (taskId: string, finalText: string | null) => {
		const current = runRef.current;
		if (!current || current.taskId !== taskId) return;
		const settled = settleWorkRun(current, finalText);
		if (settled.executionBatch) appendExecutionBatch(taskId, settled.executionBatch);
		if (settled.textSegment) appendMessage(taskId, { id: id(), role: 'assistant', text: settled.textSegment, createdAt: Date.now() });
	};
	const clearRun = () => { runRef.current = null; setRun(null); setRunningTaskId(null); };
	useEffect(() => onEvent((event) => {
		const line = event as { type?: string; taskId?: string; requestId?: string; delta?: string; text?: string; title?: string; message?: string; file?: WorkFile & { content?: string }; path?: string };
		if (!line.taskId) return;
		// 执行过程事件（思考增量/工具生命周期/正文收口）统一走状态机；产物按“先批次后正文”的顺序落盘。
		if (line.type === 'work_delta' || line.type === 'work_thinking_delta' || line.type === 'work_message_end' || line.type === 'work_tool_started' || line.type === 'work_tool_updated' || line.type === 'work_tool_completed') {
			const current = runRef.current;
			if (current && current.taskId === line.taskId) {
				const outcome = applyWorkStreamEvent(current, line as WorkStreamEvent);
				runRef.current = outcome.run;
				setRun(outcome.run);
				if (outcome.executionBatch) appendExecutionBatch(line.taskId, outcome.executionBatch);
				if (outcome.textSegment) appendMessage(line.taskId, { id: id(), role: 'assistant', text: outcome.textSegment, createdAt: Date.now() });
			}
		}
		if ((line.type === 'work_file_created' || line.type === 'work_file_updated') && line.file) upsertFile(line.taskId, { ...line.file, changeState: line.type === 'work_file_created' ? 'created' : 'updated' });
		if (line.type === 'work_file_deleted' && line.path) removeFile(line.taskId, line.path);
		// work_prompt 为受理式协议：回合结束后由 sidecar 推送 work_complete / work_error，
		// 这里负责归档尾部执行过程、落最终 assistant 消息、更新任务标题并解除运行态（send 不再等待回合完成）。
		if (line.type === 'work_complete') {
			const hadRun = runRef.current?.taskId === line.taskId;
			settleRun(line.taskId, typeof line.text === 'string' ? line.text : null);
			// 无运行态兜底（如页面重载后收到迟到的完成事件）：保留旧的整段落盘行为。
			if (!hadRun && typeof line.text === 'string' && line.text.trim()) appendMessage(line.taskId, { id: id(), role: 'assistant', text: line.text, createdAt: Date.now() });
			if (typeof line.title === 'string' && line.title.trim()) updateTask(line.taskId, { title: line.title.trim() });
			// 回合内模型可能写过公众端工作项，通知协同面板刷新当前页。
			setCollaborationRefreshKey((key) => key + 1);
			clearRun();
		}
		if (line.type === 'work_error') {
			// 失败也先归档已发生的执行过程和部分正文，再落错误提示，保证过程可审阅。
			settleRun(line.taskId, null);
			appendMessage(line.taskId, { id: id(), role: 'assistant', text: `请求失败：${typeof line.message === 'string' ? line.message : 'Work 执行失败'}`, createdAt: Date.now() });
			clearRun();
		}
	}), [upsertFile, removeFile, appendMessage, updateTask]);
	const create = async (workspacePath?: string | null) => { if (workspacePath) selectWorkspace(workspacePath); const task = createTask(workspacePath); selectTask(task.id); try { const response = await rpc.newWorkSession(task.id, task.workspaceRootPath); if (response.success && response.command === 'new_work_session') updateTask(task.id, { sessionId: response.data.sessionId, sessionPath: response.data.sessionPath, workspacePath: response.data.workspacePath }); } catch { /* 延迟到首次消息时重试绑定 */ } };
	const send = async (text: string) => {
		if (runningTaskId) return;
		let task = activeTask;
		if (!task) {
			task = createTask();
			selectTask(task.id);
		}
		// 先落本地消息和运行态，再等待 session 初始化；欢迎页发送后立即进入对话，并可立刻停止。
		const user: WorkMessage = { id: id(), role: 'user', text, createdAt: Date.now() };
		appendMessage(task.id, user);
		setRunningTaskId(task.id);
		const freshRun = createWorkRun(task.id);
		runRef.current = freshRun;
		setRun(freshRun);
		try {
			if (!task.sessionId) {
				const sessionResponse = await rpc.newWorkSession(task.id, task.workspaceRootPath);
				if (sessionResponse.success && sessionResponse.command === 'new_work_session') {
					updateTask(task.id, { sessionId: sessionResponse.data.sessionId, sessionPath: sessionResponse.data.sessionPath, workspacePath: sessionResponse.data.workspacePath });
				}
			}
			const response = await rpc.workPrompt({ taskId: task.id, message: text });
			if (!response.success || response.command !== 'work_prompt') throw new Error(('error' in response && response.error) || 'Work 请求失败');
			// 受理成功：回合在 sidecar 异步执行，思考/工具/正文由 work_* 事件流式送达，
			// 最终收口由 work_complete / work_error 事件处理，此处不再等待回合完成。
			// 工作项上下文已随消息发出；失败分支保留待发送状态供用户重试。
			setPendingWorkItem(null);
		} catch (error) {
			appendMessage(task.id, { id: id(), role: 'assistant', text: `请求失败：${error instanceof Error ? error.message : String(error)}`, createdAt: Date.now() });
			clearRun();
		}
	};
	const openFile = async (file: WorkFile) => {
		if (!activeTask) return;
		const response = await rpc.workFileRead(activeTask.id, file.path);
		if (!response.success || response.command !== 'work_file_read') return;
		if (response.data.file.content === undefined || response.data.file.type !== 'text/plain') {
			window.alert(`${file.path} 是二进制成果文件，当前 Work 面板不提供文本编辑，避免损坏 Office 文件。请使用系统 Office/WPS 打开。`);
			upsertFile(activeTask.id, { ...response.data.file, changeState: 'clean' });
			return;
		}
		const content = window.prompt(`预览/编辑 ${file.path}`, response.data.file.content);
		if (content != null && content !== response.data.file.content) {
			const saved = await rpc.workFileWrite(activeTask.id, file.path, content);
			if (saved.success && saved.command === 'work_file_write') upsertFile(activeTask.id, { ...saved.data.file, changeState: 'unsaved' });
		} else upsertFile(activeTask.id, { ...response.data.file, changeState: 'clean' });
	};
	const renameFile = async (file: WorkFile) => { if (!activeTask) return; const newPath = window.prompt('新文件名', file.path)?.trim(); if (!newPath || newPath === file.path) return; const response = await rpc.workFileRename(activeTask.id, file.path, newPath); if (response.success && response.command === 'work_file_rename') { removeFile(activeTask.id, file.path); upsertFile(activeTask.id, { ...response.data.file, changeState: 'updated' }); } };
	const deleteFile = async (file: WorkFile) => { if (!activeTask || !window.confirm(`删除 ${file.path}？`)) return; const response = await rpc.workFileDelete(activeTask.id, file.path); if (response.success && response.command === 'work_file_delete') removeFile(activeTask.id, file.path); };
	if (!hydrated) return <div className={styles.loading}><Loader2 className="animate-spin" />正在加载 Work 工作空间…</div>;
	const workspaceName = activeTask?.workspaceRootPath ? (workspaces.find((workspace) => workspace.path === activeTask.workspaceRootPath)?.name ?? activeTask.workspaceRootPath.split(/[\\/]/).filter(Boolean).pop() ?? null) : null;
	const activeTaskTitle = activeTask ? getWorkTaskTitle(activeTask.title, activeTask.messages.find((message) => message.role === 'user')?.text) : null;
	return <div className={styles.shell} data-ui-version="work"><TargetTitleBar /><TargetWorkbenchLayout left={<WorkTaskSidebar tasks={tasks} activeTaskId={activeTaskId} runningTaskId={runningTaskId} workspaces={workspaces} currentWorkspacePath={currentWorkspacePath} onCreate={(workspacePath) => void create(workspacePath)} onSelect={selectTask} onAddWorkspace={() => void addWorkspace()} onSelectWorkspace={selectWorkspace} />} center={<WorkConversation task={activeTask} run={run && run.taskId === activeTask?.id ? run : null} running={runningTaskId === activeTask?.id} inputBlocked={runningTaskId !== null && runningTaskId !== activeTask?.id} onSend={(text) => void send(text)} onAbort={() => { void rpc.workAbort(); }} pendingWorkItem={pendingWorkItem} onClearPendingWorkItem={() => setPendingWorkItem(null)} />} right={<WorkFilesInspector task={activeTask} onOpen={(file) => void openFile(file)} onRename={(file) => void renameFile(file)} onDelete={(file) => void deleteFile(file)} collaborationRefreshKey={collaborationRefreshKey} onSendWorkItemToConversation={setPendingWorkItem} />} showBottom={false} workspacePath={activeTask?.workspacePath ?? null} statusLabel={activeTask ? `Work · ${workspaceName ? `${workspaceName} · ` : ''}${activeTaskTitle}` : 'Work 独立任务空间'} leftPanelTitle="工作空间与任务" leftPanelDescription="切换 Work 工作空间或任务。" rightPanelTitle="工作空间文件" rightPanelDescription="管理当前 Work 任务的文件产出。" /></div>;
}
