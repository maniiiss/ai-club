import { File, FileArchive, FileCode2, FileImage, FileJson, FilePlus2, FileSpreadsheet, FileText, FolderOpen, Loader2, Network, Pencil, Plus, Send, Sparkles, Square, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { TargetTitleBar } from '@/src/components/desktop/TargetTitleBar';
import { ModelPicker } from '@/src/components/ModelPicker';
import { TargetWorkbenchLayout } from '@/src/components/workbench/TargetWorkbenchLayout';
import { Button } from '@/src/components/ui/button';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import { MessageBubble } from '@/src/components/MessageBubble';
import { onEvent, rpc } from '@/src/rpc/bridge';
import type { WorkFile, WorkMessage, WorkTask } from '@/src/store/work';
import { useWorkStore } from '@/src/store/work';
import type { UIMessage } from '@/src/store/session';
import chatStyles from '@/src/components/ChatView.module.css';
import inputStyles from '@/src/components/InputBox.module.css';
import inspectorStyles from '@/src/components/features/TargetExecutionInspector.module.css';
import sidebarStyles from '@/src/components/workbench/TargetSessionSidebar.module.css';
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

function WorkTaskSidebar({ tasks, activeTaskId, runningTaskId, onCreate, onSelect }: { tasks: WorkTask[]; activeTaskId: string | null; runningTaskId: string | null; onCreate: () => void; onSelect: (id: string) => void }) {
	return <aside className={sidebarStyles.root} aria-label="Work 任务">
		<header className={sidebarStyles.header}><div className={sidebarStyles.headerCopy}><span>Work</span></div><Button type="button" variant="secondary" size="sm" onClick={onCreate} title="新建任务"><FilePlus2 />新建</Button></header>
		<ScrollArea fitContent className={sidebarStyles.scroll}><div className={sidebarStyles.content}>{tasks.length === 0 ? <div className={sidebarStyles.emptyTask}>暂无任务</div> : <div className={sidebarStyles.standaloneList}>{tasks.map((task) => <Button key={task.id} type="button" variant="ghost" size="sm" onClick={() => onSelect(task.id)} className={`${sidebarStyles.taskRow} ${task.id === activeTaskId ? sidebarStyles.taskActive : ''}`} title={task.title}>{task.id === runningTaskId ? <Loader2 className={`${sidebarStyles.taskIcon} ${sidebarStyles.taskLoading}`} /> : <FileText className={sidebarStyles.taskIcon} />}<span className={sidebarStyles.label}>{task.title}</span></Button>)}</div>}</div></ScrollArea>
	</aside>;
}

function WorkInputBox({ disabled, running, onSend, onAbort }: { disabled: boolean; running: boolean; onSend: (text: string) => void; onAbort: () => void }) {
	const [text, setText] = useState('');
	const submit = () => { if (!text.trim() || disabled || running) return; onSend(text.trim()); setText(''); };
	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey) { event.preventDefault(); submit(); } };
	return <div className={inputStyles.root}><div className={inputStyles.surface}><div className={inputStyles.composerRow}><textarea className={`${inputStyles.editorShell} ${inputStyles.editorSurface} ${styles.workEditor}`} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} disabled={disabled} placeholder="描述你要推进的工作" aria-label="发送 Work 消息" /></div><div className={inputStyles.toolbar}><div className={inputStyles.actions}><ModelPicker />{running ? <Button type="button" variant="ghost" size="icon" onClick={onAbort} title="停止"><Square size={15} /></Button> : <Button type="button" variant="default" size="icon" onClick={submit} disabled={disabled || !text.trim()} title="发送"><Send size={16} /></Button>}</div></div></div></div>;
}

function WorkConversation({ task, streamingText, running, inputBlocked, onSend, onAbort }: { task: WorkTask | null; streamingText: string; running: boolean; inputBlocked: boolean; onSend: (text: string) => void; onAbort: () => void }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [task?.id, task?.messages, streamingText]);
	return <main className={styles.conversation} aria-label="Work 对话工作区"><div className={chatStyles.surface}><div ref={scrollRef} className={chatStyles.scroll}><div className={chatStyles.frame}><div className={chatStyles.content}>{task ? (task.messages.length === 0 && !running ? <div className={chatStyles.empty}><div className={chatStyles.emptyIcon}><Sparkles size={26} /></div><div><h2>开始一项 Work</h2><p>围绕 GitPilot 公众端协同推进工作，正式产出请写入工作区文件。</p></div></div> : <div className={chatStyles.messages}>{task.messages.map((message) => <article key={message.id} className={styles.message}><MessageBubble message={{ id: message.id, role: message.role, text: message.text, kind: 'text' } as UIMessage} />{message.sources?.length ? <div className={styles.sources}>{message.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><span>{source.snippet}</span></a>)}</div> : null}</article>)}{running && <article className={`${styles.message} ${styles.assistantMessage} ${styles.streaming}`}><Loader2 size={15} className="animate-spin" />{streamingText || '正在处理…'}</article>}</div>) : <div className={chatStyles.empty}><h2>点击新建开始 Work</h2></div>}</div></div></div></div><WorkInputBox disabled={inputBlocked || !task} running={running} onSend={onSend} onAbort={onAbort} /></main>;
}


function WorkFilesInspector({ task, onOpen, onRename, onDelete }: { task: WorkTask | null; onOpen: (file: WorkFile) => void; onRename: (file: WorkFile) => void; onDelete: (file: WorkFile) => void }) {
	type WorkInspectorTabId = 'files' | 'collaboration';
	const [openTabs, setOpenTabs] = useState<WorkInspectorTabId[]>(['files']);
	const [activeTab, setActiveTab] = useState<WorkInspectorTabId>('files');
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
	const tabs: Array<{ id: WorkInspectorTabId; label: string; icon: typeof FolderOpen }> = [{ id: 'files', label: '文件', icon: FolderOpen }, { id: 'collaboration', label: '公众端协同', icon: Network }];
	return <aside className={inspectorStyles.root} aria-label="工作区文件">
		<nav className={styles.fileTabs} aria-label="Work 功能页签" onMouseDown={(event) => event.stopPropagation()}>
			{openTabs.map((tabId) => { const tab = tabs.find((item) => item.id === tabId)!; const Icon = tab.icon; return <div key={tab.id} className={`${styles.fileTab} ${activeTab === tab.id ? styles.fileTabActive : ''}`} role="tab" tabIndex={0} aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveTab(tab.id); } }}><Icon /><span>{tab.label}</span><button type="button" className={styles.fileTabClose} onClick={(event) => { event.stopPropagation(); closeFunctionTab(tab.id); }} aria-label={`关闭${tab.label}`}><X size={12} /></button></div>; })}
			<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className={styles.addFileTab} aria-label="打开 Work 功能页签" title="打开功能页签"><Plus size={15} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => openFunctionTab('files')}><FolderOpen />文件</DropdownMenuItem><DropdownMenuItem onSelect={() => openFunctionTab('collaboration')}><Network />公众端协同</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
		</nav>
		{openTabs.length === 0 ? <div className={styles.fileEmpty}><FolderOpen size={20} /><span>右侧功能面板已关闭</span><small>点击上方“+”重新打开一个功能面板。</small></div> : activeTab === 'files' ? (task ? <ScrollArea className={styles.fileList} fitContent>{task.files.length ? <div className={styles.fileRows} role="list">{task.files.map((file) => { const changeLabel = fileChangeLabel(file.changeState); const isActive = activePath === file.path; return <div key={file.path} className={`${styles.fileRow} ${isActive ? styles.fileRowActive : ''}`} role="listitem"><Button type="button" variant="unstyled" className={styles.fileRowButton} onClick={() => { setActivePath(file.path); onOpen(file); }} aria-label={`打开 ${file.path}`}><span className={`${styles.fileIcon} ${styles[`fileIcon_${fileExtension(file)}`] || ''}`}><FileTypeIcon file={file} /></span><span className={styles.fileBody}><span className={styles.fileName}>{file.name || file.path}</span><span className={styles.fileMeta}><span>{fileExtension(file).toUpperCase()}</span><span>{formatFileSize(file.size)}</span><span>{formatFileDate(file.updatedAt)}</span>{changeLabel ? <span className={styles.fileStatus}>{changeLabel}</span> : null}</span></span></Button><div className={styles.fileActions}><Button type="button" variant="ghost" size="icon-sm" onClick={() => onRename(file)} title="重命名" aria-label={`重命名 ${file.path}`}><Pencil size={14} /></Button><Button type="button" variant="ghost" size="icon-sm" className={styles.deleteFileButton} onClick={() => onDelete(file)} title="删除" aria-label={`删除 ${file.path}`}><Trash2 size={14} /></Button></div></div>; })}</div> : <div className={styles.fileEmpty}><FileText size={20} /><span>暂无文件</span><small>让 Agent 写入工作区后，文件会出现在这里。</small></div>} </ScrollArea> : <div className={styles.fileEmpty}><FileText size={20} /><span>尚未创建工作区</span><small>新建任务后即可管理文件产出。</small></div>) : <div className={styles.fileEmpty}><Network size={20} /><span>公众端协同</span><small>Agent 会按需调用 GitPilot 公众端项目、工作项、评论和附件能力。</small></div>}
	</aside>;
}

export function TargetWorkShell() {
	const { tasks, activeTaskId, hydrated, hydrate, createTask, selectTask, updateTask, appendMessage, upsertFile, removeFile } = useWorkStore();
	const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
	const [streaming, setStreaming] = useState<{ taskId: string; text: string } | null>(null);
	const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) ?? null, [tasks, activeTaskId]);
	useEffect(() => { void hydrate(); }, [hydrate]);
	useEffect(() => onEvent((event) => {
		const line = event as { type?: string; taskId?: string; delta?: string; file?: WorkFile & { content?: string }; path?: string };
		if (!line.taskId) return;
		if (line.type === 'work_delta' && line.delta) setStreaming((current) => current && current.taskId === line.taskId ? { taskId: line.taskId, text: current.text + line.delta! } : current);
		if ((line.type === 'work_file_created' || line.type === 'work_file_updated') && line.file) upsertFile(line.taskId, { ...line.file, changeState: line.type === 'work_file_created' ? 'created' : 'updated' });
		if (line.type === 'work_file_deleted' && line.path) removeFile(line.taskId, line.path);
	}), [upsertFile, removeFile]);
	const create = async () => { const task = createTask(); selectTask(task.id); try { const response = await rpc.newWorkSession(task.id); if (response.success && response.command === 'new_work_session') updateTask(task.id, { sessionId: response.data.sessionId, sessionPath: response.data.sessionPath, workspacePath: response.data.workspacePath, title: response.data.title }); } catch { /* 延迟到首次消息时重试绑定 */ } };
	const send = async (text: string) => { if (!activeTask || runningTaskId) return; const task = activeTask; const user: WorkMessage = { id: id(), role: 'user', text, createdAt: Date.now() }; appendMessage(task.id, user); setRunningTaskId(task.id); setStreaming({ taskId: task.id, text: '' }); try { const response = await rpc.workPrompt({ taskId: task.id, message: text }); if (!response.success || response.command !== 'work_prompt') throw new Error(('error' in response && response.error) || 'Work 请求失败'); updateTask(task.id, { title: response.data.title ?? task.title }); appendMessage(task.id, { id: id(), role: 'assistant', text: response.data.text, createdAt: Date.now() }); } catch (error) { appendMessage(task.id, { id: id(), role: 'assistant', text: `请求失败：${error instanceof Error ? error.message : String(error)}`, createdAt: Date.now() }); } finally { setRunningTaskId(null); setStreaming(null); } };
	const openFile = async (file: WorkFile) => { if (!activeTask) return; const response = await rpc.workFileRead(activeTask.id, file.path); if (response.success && response.command === 'work_file_read') { const content = window.prompt(`预览/编辑 ${file.path}`, response.data.file.content ?? ''); if (content != null && content !== response.data.file.content) { const saved = await rpc.workFileWrite(activeTask.id, file.path, content); if (saved.success && saved.command === 'work_file_write') upsertFile(activeTask.id, { ...saved.data.file, changeState: 'unsaved' }); } else upsertFile(activeTask.id, { ...response.data.file, changeState: 'clean' }); } };
	const renameFile = async (file: WorkFile) => { if (!activeTask) return; const newPath = window.prompt('新文件名', file.path)?.trim(); if (!newPath || newPath === file.path) return; const response = await rpc.workFileRename(activeTask.id, file.path, newPath); if (response.success && response.command === 'work_file_rename') { removeFile(activeTask.id, file.path); upsertFile(activeTask.id, { ...response.data.file, changeState: 'updated' }); } };
	const deleteFile = async (file: WorkFile) => { if (!activeTask || !window.confirm(`删除 ${file.path}？`)) return; const response = await rpc.workFileDelete(activeTask.id, file.path); if (response.success && response.command === 'work_file_delete') removeFile(activeTask.id, file.path); };
	if (!hydrated) return <div className={styles.loading}><Loader2 className="animate-spin" />正在加载 Work 工作区…</div>;
	const streamingText = streaming && streaming.taskId === activeTask?.id ? streaming.text : '';
	return <div className={styles.shell} data-ui-version="work"><TargetTitleBar /><TargetWorkbenchLayout left={<WorkTaskSidebar tasks={tasks} activeTaskId={activeTaskId} runningTaskId={runningTaskId} onCreate={() => void create()} onSelect={selectTask} />} center={<WorkConversation task={activeTask} streamingText={streamingText} running={runningTaskId === activeTask?.id} inputBlocked={runningTaskId !== null && runningTaskId !== activeTask?.id} onSend={(text) => void send(text)} onAbort={() => { void rpc.workAbort(); }} />} right={<WorkFilesInspector task={activeTask} onOpen={(file) => void openFile(file)} onRename={(file) => void renameFile(file)} onDelete={(file) => void deleteFile(file)} />} showBottom={false} statusLabel="Work 公众端协同" leftPanelTitle="任务" leftPanelDescription="Work 独立任务列表。" rightPanelTitle="工作区文件" rightPanelDescription="管理当前 Work 任务的文件产出。" /></div>;
}
