import { FilePlus2, FileText, Loader2, Send, Sparkles, Square } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { TargetTitleBar } from '@/src/components/desktop/TargetTitleBar';
import { ModelPicker } from '@/src/components/ModelPicker';
import { TargetWorkbenchLayout } from '@/src/components/workbench/TargetWorkbenchLayout';
import { Button } from '@/src/components/ui/button';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { MessageBubble } from '@/src/components/MessageBubble';
import { onEvent, rpc } from '@/src/rpc/bridge';
import type { WorkArtifactKind, WorkMessage, WorkSource, WorkTask } from '@/src/store/work';
import type { UIMessage } from '@/src/store/session';
import { useWorkStore } from '@/src/store/work';
import chatStyles from '@/src/components/ChatView.module.css';
import inputStyles from '@/src/components/InputBox.module.css';
import inspectorStyles from '@/src/components/features/TargetExecutionInspector.module.css';
import sidebarStyles from '@/src/components/workbench/TargetSessionSidebar.module.css';
import styles from './TargetWorkShell.module.css';

function sourceId(): string { return crypto.randomUUID(); }
function artifactLabel(kind: WorkArtifactKind): string { return kind === 'plan' ? '计划' : kind === 'notes' ? '笔记' : '结论'; }

/** Work 左栏沿用 Code 会话栏的层级与选中态，只移除项目目录。 */
function WorkTaskSidebar({ tasks, activeTaskId, runningTaskId, onCreate, onSelect }: {
	tasks: WorkTask[];
	activeTaskId: string | null;
	runningTaskId: string | null;
	onCreate: (title: string) => void;
	onSelect: (id: string) => void;
}) {
	const [creating, setCreating] = useState(false);
	const [title, setTitle] = useState('');
	const create = () => {
		onCreate(title || '新的工作任务');
		setTitle('');
		setCreating(false);
	};
	return <aside className={sidebarStyles.root} aria-label="Work 任务">
		<header className={sidebarStyles.header}><div className={sidebarStyles.headerCopy}><span>工作</span></div><Button type="button" variant="secondary" size="sm" onClick={() => setCreating(true)} title="新建任务"><FilePlus2 />新建</Button></header>
		<ScrollArea fitContent className={sidebarStyles.scroll}><div className={sidebarStyles.content}>
			{creating && <form className={styles.createTask} onSubmit={(event) => { event.preventDefault(); create(); }}><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="任务名称" aria-label="任务名称" /><Button type="submit" size="sm">创建</Button></form>}
			{tasks.length === 0 ? <div className={sidebarStyles.emptyTask}>暂无任务</div> : <div className={sidebarStyles.standaloneList}>{tasks.map((task) => {
				const isRunning = task.id === runningTaskId;
				return <Button key={task.id} type="button" variant="ghost" size="sm" onClick={() => onSelect(task.id)} className={`${sidebarStyles.taskRow} ${task.id === activeTaskId ? sidebarStyles.taskActive : ''}`} title={task.title}>
					{isRunning ? <Loader2 className={`${sidebarStyles.taskIcon} ${sidebarStyles.taskLoading}`} aria-label="任务进行中" /> : <FileText className={sidebarStyles.taskIcon} />}
					<span className={sidebarStyles.label}>{task.title}</span>
				</Button>;
			})}</div>}
		</div></ScrollArea>
	</aside>;
}

/** Work 输入器使用与 Code 相同的 InputBox 样式和浮动位置，行为只接入受限 Work Agent。 */
function WorkInputBox({ disabled, running, onSend, onAbort }: { disabled: boolean; running: boolean; onSend: (text: string) => void; onAbort: () => void }) {
	const [text, setText] = useState('');
	const submit = () => {
		if (!text.trim() || disabled || running) return;
		onSend(text.trim());
		setText('');
	};
	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey) { event.preventDefault(); submit(); }
	};
	return <div className={inputStyles.root}>
		<div className={inputStyles.surface}>
			<div className={inputStyles.composerRow}><textarea className={`${inputStyles.editorShell} ${inputStyles.editorSurface} ${styles.workEditor}`} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} disabled={disabled} placeholder="描述你要完成、学习或探索的内容…" aria-label="向 GitPilot Work 发送消息" /></div>
			<div className={inputStyles.toolbar}><div className={inputStyles.actions}>
				<ModelPicker />
				{running ? <Button type="button" variant="ghost" size="icon" onClick={onAbort} className={`${inputStyles.send} ${inputStyles.stop}`} title="停止当前 Work 请求" aria-label="停止当前 Work 请求"><Square size={15} /></Button> : <Button type="button" variant="default" size="icon" onClick={submit} disabled={disabled || !text.trim()} className={inputStyles.send} title="发送"><Send size={16} /></Button>}
			</div></div>
		</div>
	</div>;
}

function WorkConversation({ task, streamingText, running, inputBlocked, onSend, onAbort, onAppendArtifact }: {
	task: WorkTask | null;
	streamingText: string;
	running: boolean;
	inputBlocked: boolean;
	onSend: (text: string) => void;
	onAbort: () => void;
	onAppendArtifact: (taskId: string, kind: WorkArtifactKind, text: string) => void;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => { const node = scrollRef.current; if (node) node.scrollTop = node.scrollHeight; }, [task?.id, task?.messages, streamingText]);
	return <main className={styles.conversation} aria-label="Work 对话工作区">
		<div className={chatStyles.surface}>
			<div ref={scrollRef} className={chatStyles.scroll}><div className={chatStyles.frame}><div className={chatStyles.content}>
				{task ? <>
					{task.messages.length === 0 && !running ? <div className={chatStyles.empty}><div className={chatStyles.emptyIcon}><Sparkles size={26} /></div><div><h2>开始这项工作</h2><p>告诉 GitPilot 你的目标，它会基于受控研究帮你推进。</p></div></div> : <div className={chatStyles.messages}>
						{task.messages.map((message) => <WorkMessageItem key={message.id} taskId={task.id} message={message} onAppendArtifact={onAppendArtifact} />)}
						{running && <article className={`${styles.message} ${styles.assistantMessage} ${styles.streaming}`}><Loader2 size={15} className="animate-spin" />{streamingText || '正在整理研究与回答…'}</article>}
					</div>}
				</> : <div className={chatStyles.empty}><div className={chatStyles.emptyIcon}><Sparkles size={26} /></div><div><h2>开始一项工作</h2><p>直接输入目标，GitPilot 会新建本机任务；不会读取项目目录。</p></div></div>}
			</div></div></div>
		</div>
		<WorkInputBox disabled={inputBlocked} running={running} onSend={onSend} onAbort={onAbort} />
	</main>;
}

function WorkMessageItem({ taskId, message, onAppendArtifact }: { taskId: string; message: WorkMessage; onAppendArtifact: (taskId: string, kind: WorkArtifactKind, text: string) => void }) {
	const chatMessage: UIMessage = { id: message.id, role: message.role, text: message.text, kind: 'text' };
	return <article className={styles.message}><MessageBubble message={chatMessage} />
		{message.sources?.length ? <div className={styles.sources}>{message.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><span>{source.snippet}</span></a>)}</div> : null}
		{message.role === 'assistant' && message.text.trim() && <div className={styles.artifactActions}>{(['plan', 'notes', 'conclusion'] as WorkArtifactKind[]).map((kind) => <Button key={kind} type="button" variant="ghost" size="sm" onClick={() => onAppendArtifact(taskId, kind, message.text)}>添加到{artifactLabel(kind)}</Button>)}</div>}
	</article>;
}

/** 右栏与 Code 的执行检查器共用容器视觉，内容改为 Work 的三类本机成果。 */
function WorkArtifactsInspector({ task, onUpdateTask }: { task: WorkTask | null; onUpdateTask: (id: string, patch: Parameters<ReturnType<typeof useWorkStore.getState>['updateTask']>[1]) => void }) {
	const [kind, setKind] = useState<WorkArtifactKind>('plan');
	return <aside className={inspectorStyles.root} aria-label="任务产出"><header className={inspectorStyles.header}><div><span className={inspectorStyles.eyebrow}>WORKSPACE</span><h2>任务产出</h2><p>计划、笔记和结论仅保存在此设备。</p></div></header>
		{task ? <Tabs value={kind} onValueChange={(value) => setKind(value as WorkArtifactKind)} className={styles.artifactTabs}><TabsList aria-label="任务产出"><TabsTrigger value="plan">计划</TabsTrigger><TabsTrigger value="notes">笔记</TabsTrigger><TabsTrigger value="conclusion">结论</TabsTrigger></TabsList>{(['plan', 'notes', 'conclusion'] as WorkArtifactKind[]).map((entry) => <TabsContent key={entry} value={entry} className={styles.artifactContent}><textarea value={task.artifacts[entry]} onChange={(event) => onUpdateTask(task.id, { artifacts: { ...task.artifacts, [entry]: event.target.value } })} placeholder={`记录${artifactLabel(entry)}…`} aria-label={`${artifactLabel(entry)}编辑器`} /></TabsContent>)}</Tabs> : <div className={inspectorStyles.empty}>选择或创建任务后，可在这里整理计划、笔记与结论。</div>}
	</aside>;
}

/** 非编码 Work 模式：共享 Code 的工作台外观，但只连接受限的 Work Agent。 */
export function TargetWorkShell() {
	const { tasks, activeTaskId, hydrated, hydrate, createTask, selectTask, updateTask, appendMessage, appendArtifact } = useWorkStore();
	const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
	const [streaming, setStreaming] = useState<{ taskId: string; text: string } | null>(null);
	const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) ?? null, [tasks, activeTaskId]);
	useEffect(() => { void hydrate(); }, [hydrate]);
	useEffect(() => onEvent((event) => {
		const line = event as { type?: string; taskId?: string; delta?: string };
		if (line.type === 'work_delta' && line.taskId && line.delta) setStreaming((current) => {
			if (!current || current.taskId !== line.taskId) return current;
			return { taskId: current.taskId, text: current.text + line.delta };
		});
	}), []);
	const create = (title: string) => { const task = createTask(title); selectTask(task.id); return task; };
	const send = async (text: string) => {
		if (runningTaskId) return;
		const task = activeTask ?? create(text.slice(0, 36));
		const user: WorkMessage = { id: sourceId(), role: 'user', text, createdAt: Date.now() };
		appendMessage(task.id, user);
		setRunningTaskId(task.id);
		setStreaming({ taskId: task.id, text: '' });
		try {
			const response = await rpc.workPrompt({ taskId: task.id, message: text, history: [...task.messages, user].map(({ role, text: content }) => ({ role, content })), research: true });
			if (!response.success || response.command !== 'work_prompt') throw new Error(('error' in response && response.error) || 'Work 请求失败');
			appendMessage(task.id, { id: sourceId(), role: 'assistant', text: response.data.text, createdAt: Date.now(), sources: response.data.sources as WorkSource[] });
		} catch (error) {
			appendMessage(task.id, { id: sourceId(), role: 'assistant', text: `请求失败：${error instanceof Error ? error.message : String(error)}`, createdAt: Date.now() });
		} finally {
			setRunningTaskId(null);
			setStreaming(null);
		}
	};
	if (!hydrated) return <div className={styles.loading}><Loader2 className="animate-spin" />正在加载本机 Work 空间…</div>;
	return <div className={styles.shell} data-ui-version="work"><TargetTitleBar />
		<TargetWorkbenchLayout left={<WorkTaskSidebar tasks={tasks} activeTaskId={activeTaskId} runningTaskId={runningTaskId} onCreate={create} onSelect={selectTask} />} center={<WorkConversation task={activeTask} streamingText={streaming?.taskId === activeTask?.id ? streaming?.text ?? '' : ''} running={runningTaskId === activeTask?.id} inputBlocked={runningTaskId !== null && runningTaskId !== activeTask?.id} onSend={(text) => void send(text)} onAbort={() => { void rpc.workAbort(); }} onAppendArtifact={appendArtifact} />} right={<WorkArtifactsInspector task={activeTask} onUpdateTask={updateTask} />} showBottom={false} statusLabel="Work 本机空间" leftPanelTitle="任务" leftPanelDescription="切换本机 Work 任务。" rightPanelTitle="产出" rightPanelDescription="编辑任务计划、笔记与结论。" />
	</div>;
}
