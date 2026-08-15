import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProjectGuidelines, createDemoSnapshot, DESIGN_TARGETS, DESIGN_VIEWPORT_PRESETS } from '@/src/design/design-types';
import { rpc } from '@/src/rpc/bridge';
import type { AgentSessionEvent, DesignStreamLine } from '@/src/rpc/types';
import { listDesignProjectHistory, useDesignStore } from './design';

const localStorageData = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (key: string) => localStorageData.get(key) ?? null,
	setItem: (key: string, value: string) => { localStorageData.set(key, value); },
	removeItem: (key: string) => { localStorageData.delete(key); },
	clear: () => { localStorageData.clear(); },
});

const designId = 'design-test';
const runId = 'run-test';
const requestId = 'request-test';

function bucketKey(path: string): string {
	return `gitpilot-desktop.design-workspace:${encodeURIComponent(path)}`;
}

function workspaceSnapshot(path: string, id = `design-${path}`) {
	const base = createDemoSnapshot();
	return { ...base, document: { ...base.document, id }, context: { projectId: path, projectPath: path, designId: id } };
}

function writeWorkspace(path: string, options: { activeFile?: string; activeTab?: 'preview' | 'code'; messages?: unknown[]; queuedPrompts?: Array<{ id: string; text: string }>; isProjectStarted?: boolean; hasWorkspace?: boolean } = {}): void {
	const snapshot = workspaceSnapshot(path);
	localStorage.setItem(bucketKey(path), JSON.stringify({
		snapshot,
		activePageId: snapshot.document.entryPageId,
		activeFile: options.activeFile ?? snapshot.files[0].path,
		activeTab: options.activeTab ?? 'preview',
		target: 'desktop',
		viewport: { width: 1440, height: 900 },
		zoom: 100,
		selectedElementId: null,
		messages: options.messages ?? [{ id: 'welcome', kind: 'assistant', text: 'welcome' }],
		pendingPlan: null,
		pendingApproval: null,
		execution: { status: 'idle', phase: 'idle', runId: null, requestId: null, sequence: 0, thinking: '', steps: [] },
		queuedPrompts: options.queuedPrompts ?? [],
		streamingAssistantId: null,
		isGenerating: false,
		error: null,
		hasWorkspace: options.hasWorkspace ?? true,
		isProjectStarted: options.isProjectStarted ?? false,
	}));
}

function resetStore(): void {
	const snapshot = { ...createDemoSnapshot(), document: { ...createDemoSnapshot().document, id: designId } };
	useDesignStore.setState({
		snapshot,
		projects: [{ name: 'Design project', path: 'project-test' }],
		projectPath: 'project-test',
		activeProjectKey: 'project-test',
		backgroundRuns: {},
		activePageId: 'home',
		activeFile: snapshot.files[0].path,
		activeTab: 'preview',
		target: 'desktop',
		viewport: { width: DESIGN_TARGETS.desktop.width, height: DESIGN_TARGETS.desktop.height },
		zoom: 100,
		selectedElementId: null,
		messages: [{ id: 'welcome', kind: 'assistant', text: 'welcome' }],
		pendingPlan: null,
		pendingApproval: null,
		execution: { status: 'idle', phase: 'idle', runId: null, requestId: null, sequence: 0, thinking: '', steps: [] },
		queuedPrompts: [],
		streamingAssistantId: null,
		isGenerating: false,
		error: null,
		hasWorkspace: false,
		isProjectStarted: false,
	});
}

function line(line: Omit<Extract<DesignStreamLine, { type: 'design_event' }>, 'designId' | 'requestId' | 'runId' | 'sequence' | 'emittedAt'> & { sequence: number }): DesignStreamLine {
	return { ...line, projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, emittedAt: Date.now() };
}

function agentEvent(event: unknown): AgentSessionEvent {
	return event as AgentSessionEvent;
}

describe('Design Mode snapshot', () => {
	beforeEach(() => {
		localStorage.clear();
		resetStore();
		vi.restoreAllMocks();
	});
	it('provides a runnable multi-file GitPilot prototype', () => {
		const snapshot = createDemoSnapshot();
		expect(snapshot.document.entryPageId).toBe('home');
		expect(snapshot.files.map((file) => file.path)).toEqual(['pages/home/index.html', 'pages/home/styles.css', 'pages/home/main.js']);
		expect(snapshot.files[0].content).toContain('GitPilot');
		expect(snapshot.files[1].content).toContain('@media');
	});

	it('keeps the three target profiles deterministic', () => {
		expect(DESIGN_TARGETS.mobile).toEqual({ label: '手机', width: 375, height: 812 });
		expect(DESIGN_TARGETS.desktop.width).toBeGreaterThan(DESIGN_TARGETS.tablet.width);
	});

	it('provides editable-friendly common viewport presets', () => {
		expect(DESIGN_VIEWPORT_PRESETS.mobile.map((preset) => preset.width)).toEqual([360, 375, 390, 430]);
		expect(DESIGN_VIEWPORT_PRESETS.desktop.map((preset) => preset.id)).toEqual(['desktop-workspace', 'desktop-720p', 'desktop-1080p', 'desktop-2k', 'desktop-4k']);
		expect(DESIGN_VIEWPORT_PRESETS.desktop.find((preset) => preset.id === 'desktop-4k')).toMatchObject({ width: 3840, height: 2160 });
	});

	it('只把已有 Design Workspace 的项目派生为历史，并按最近打开时间排序', () => {
		writeWorkspace('project-old');
		writeWorkspace('project-new');
		const history = listDesignProjectHistory([
			{ name: '旧项目', path: 'project-old', hasWorkspace: true, lastOpenedAt: 100 },
			{ name: '未创建项目', path: 'project-empty' },
			{ name: '新项目', path: 'project-new', hasWorkspace: true, lastOpenedAt: 200 },
		]);

		expect(history.map((item) => item.path)).toEqual(['project-new', 'project-old']);
		expect(history[0]).toMatchObject({ workspaceName: '灵感工坊首页', pageCount: 1, fileCount: 3, hasWorkspace: true });
	});

	it('兼容旧 bucket 的工作区状态，并忽略损坏 bucket', () => {
		writeWorkspace('legacy-project', { hasWorkspace: undefined, isProjectStarted: true });
		localStorage.setItem(bucketKey('broken-project'), '{broken json');

		const history = listDesignProjectHistory([
			{ name: '旧项目', path: 'legacy-project' },
			{ name: '损坏项目', path: 'broken-project', hasWorkspace: true },
		]);

		expect(history.map((item) => item.path)).toEqual(['legacy-project']);
	});

	it('从 Design 项目列表移除当前项目但保留磁盘工作区', () => {
		writeWorkspace('project-test');
		useDesignStore.setState({ projects: [{ name: '当前项目', path: 'project-test', hasWorkspace: true }], projectPath: 'project-test', hasWorkspace: true, isProjectStarted: false });

		useDesignStore.getState().removeProject('project-test');

		expect(useDesignStore.getState()).toMatchObject({ projects: [], projectPath: null, hasWorkspace: false, isProjectStarted: false });
		expect(localStorage.getItem(bucketKey('project-test'))).not.toBeNull();
	});

	it('resetProject 返回 Landing 但保留完整工作区，历史点击可恢复当前项目', async () => {
		const activeFile = 'pages/home/styles.css';
		const messages = [{ id: 'welcome', kind: 'assistant' as const, text: 'welcome' }, { id: 'm1', kind: 'user' as const, text: '保留我', status: 'sent' as const }];
		writeWorkspace('project-test', { activeFile, activeTab: 'code', messages, queuedPrompts: [{ id: 'q1', text: '排队内容' }] });
		useDesignStore.setState({ projects: [{ name: '项目', path: 'project-test', hasWorkspace: true }], hasWorkspace: true, isProjectStarted: true, activeFile, activeTab: 'code', messages, queuedPrompts: [{ id: 'q1', text: '排队内容' }] });
		vi.spyOn(rpc, 'designOpen').mockResolvedValue({ id: 'open', type: 'response', command: 'design_open', success: true, data: { snapshot: workspaceSnapshot('project-test') } } as never);

		useDesignStore.getState().resetProject();
		expect(useDesignStore.getState()).toMatchObject({ isProjectStarted: false, hasWorkspace: true, activeFile, activeTab: 'code', queuedPrompts: [{ id: 'q1', text: '排队内容' }] });

		await useDesignStore.getState().openProjectHistory('project-test');
		expect(useDesignStore.getState()).toMatchObject({ isProjectStarted: true, hasWorkspace: true, activeFile, activeTab: 'code', messages, queuedPrompts: [{ id: 'q1', text: '排队内容' }] });
	});

	it('切换项目时恢复各自的页面、文件和对话 bucket', async () => {
		const fileA = 'pages/home/index.html';
		const fileB = 'pages/home/main.js';
		writeWorkspace('project-a', { activeFile: fileA, messages: [{ id: 'a', kind: 'assistant', text: '项目 A' }] });
		writeWorkspace('project-b', { activeFile: fileB, activeTab: 'code', messages: [{ id: 'b', kind: 'assistant', text: '项目 B' }] });
		const projects = [{ name: 'A', path: 'project-a', hasWorkspace: true }, { name: 'B', path: 'project-b', hasWorkspace: true }];
		useDesignStore.setState({ projects, projectPath: 'project-a', hasWorkspace: true, isProjectStarted: false, snapshot: workspaceSnapshot('project-a'), activeFile: fileA, messages: [{ id: 'a', kind: 'assistant', text: '项目 A' }] });
		vi.spyOn(rpc, 'designOpen').mockImplementation(async (path) => ({ id: 'open', type: 'response', command: 'design_open', success: true, data: { snapshot: workspaceSnapshot(path) } }) as never);

		await useDesignStore.getState().openProjectHistory('project-b');
		let state = useDesignStore.getState();
		expect(state).toMatchObject({ projectPath: 'project-b', activeFile: fileB, activeTab: 'code', messages: [{ id: 'b', kind: 'assistant', text: '项目 B' }] });

		await useDesignStore.getState().openProjectHistory('project-a');
		state = useDesignStore.getState();
		expect(state).toMatchObject({ projectPath: 'project-a', activeFile: fileA, activeTab: 'preview', messages: [{ id: 'a', kind: 'assistant', text: '项目 A' }] });
	});

	it('首次发送在创建 Design 工作区后进入工作页并启动运行', async () => {
		const current = useDesignStore.getState().snapshot;
		vi.spyOn(rpc, 'designCreate').mockResolvedValue({
			id: 'create', type: 'response', command: 'design_create', success: true,
			data: { designId, snapshot: { document: current.document as unknown as Record<string, unknown>, files: current.files, context: { projectId: 'project-test', projectPath: 'project-test', designId } } },
		} as never);
		const prompt = vi.spyOn(rpc, 'designPrompt').mockResolvedValue({ id: 'prompt', type: 'response', command: 'design_prompt', success: true, data: { requestId, runId } } as never);

		await useDesignStore.getState().startProject('设计一个登录页');

		expect(useDesignStore.getState()).toMatchObject({ isProjectStarted: true, error: null });
		expect(useDesignStore.getState().messages.at(-1)).toMatchObject({ kind: 'user', text: '设计一个登录页', status: 'sent' });
		expect(prompt).toHaveBeenCalledTimes(1);
	});

	it('保存项目规范后更新当前 snapshot，且下一次读取可恢复', async () => {
		const current = useDesignStore.getState().snapshot;
		const baseGuidelines = current.guidelines ?? createDefaultProjectGuidelines();
		const guidelines = { ...baseGuidelines, brand: { name: 'CRM', tone: '克制、清晰' }, tokens: { ...baseGuidelines.tokens, colors: { primary: '#146c5b' } }, updatedAt: new Date().toISOString() };
		vi.spyOn(rpc, 'designSaveGuidelines').mockResolvedValue({ id: 'save-guidelines', type: 'response', command: 'design_save_guidelines', success: true, data: { designId, snapshot: { document: current.document as unknown as Record<string, unknown>, files: current.files, context: { projectId: 'project-test', projectPath: 'project-test', designId }, guidelines } } } as never);

		await useDesignStore.getState().saveProjectGuidelines(guidelines);

		expect(rpc.designSaveGuidelines).toHaveBeenCalledWith('project-test', designId, guidelines);
		expect(useDesignStore.getState().snapshot.guidelines).toMatchObject({ brand: { name: 'CRM' }, tokens: { colors: { primary: '#146c5b' } } });
	});

	it('不读取 Code 的 currentProjectPath，Design 请求使用自己的项目目录', async () => {
		const current = useDesignStore.getState().snapshot;
		vi.spyOn(rpc, 'designCreate').mockResolvedValue({
			id: 'create', type: 'response', command: 'design_create', success: true,
			data: { designId, snapshot: { document: current.document as unknown as Record<string, unknown>, files: current.files, context: { projectId: 'design-project', projectPath: 'design-project', designId } } },
		} as never);
		const prompt = vi.spyOn(rpc, 'designPrompt').mockResolvedValue({ id: 'prompt', type: 'response', command: 'design_prompt', success: true, data: { requestId, runId } } as never);
		useDesignStore.setState({ projectPath: 'design-project', activeProjectKey: encodeURIComponent('design-project') });

		await useDesignStore.getState().startProject('使用 Design 目录');

		expect(rpc.designCreate).toHaveBeenCalledWith('design-project', 'GitPilot Design');
		expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ projectPath: 'design-project' }));
	});

	it('拼接 thinking/text 增量，并用 message_end 替换而不重复正文', () => {
		const store = useDesignStore.getState();
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '先检查页面。' } }), sequence: 1 }));
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '正在准备' } }), sequence: 2 }));
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: '正在准备页面。' }] } }), sequence: 3 }));
		const state = useDesignStore.getState();
		expect(state.execution.thinking).toBe('先检查页面。');
		expect(state.messages.filter((message) => message.kind === 'assistant').at(-1)).toMatchObject({ text: '正在准备页面。' });
		expect(state.messages.filter((message) => message.kind === 'assistant')).toHaveLength(2);
	});

	it('不把内部 user 指令或工具 JSON 渲染成 Design 正文', () => {
		const store = useDesignStore.getState();
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({
			type: 'message_end',
			message: { role: 'user', content: '系统提示词、revision 和当前文件' },
		}), sequence: 1 }));
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({
			type: 'message_end',
			message: { role: 'toolResult', toolName: 'design_apply_patch', content: [{ type: 'text', text: '{"operationId":"op-1","revisionId":"rev-2"}' }] },
		}), sequence: 2 }));
		const state = useDesignStore.getState();
		expect(state.messages).toHaveLength(1);
		expect(state.messages[0]).toMatchObject({ id: 'welcome' });
	});

	it('工具阶段覆盖 thinking 提示，并拒绝乱序/重复 sequence', () => {
		const store = useDesignStore.getState();
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '分析中' } }), sequence: 1 }));
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'tool_execution_start', toolCallId: 'tool-1', toolName: 'design_apply_patch', args: {} }), sequence: 2 }));
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'tool_execution_start', toolCallId: 'tool-duplicate', toolName: 'ignored', args: {} }), sequence: 1 }));
		const state = useDesignStore.getState();
		expect(state.execution.phase).toBe('tool');
		expect(state.execution.steps).toHaveLength(1);
		expect(state.execution.sequence).toBe(2);
	});

	it('patch 事件立即更新 snapshot，旧 request 不会重复修改', () => {
		const current = useDesignStore.getState().snapshot;
		const files = current.files.map((file) => file.path.endsWith('/styles.css') ? { ...file, content: `${file.content}\n.patch{color:red}` } : file);
		const rpcFiles = files.map((file) => ({ path: file.path, language: file.language, content: file.content ?? '' }));
		const currentRpcFiles = current.files.map((file) => ({ path: file.path, language: file.language, content: file.content ?? '' }));
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), operationId: 'op-1', revisionId: 'rev-2', pageId: 'home', summary: '增加强调色', files: rpcFiles });
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 2, emittedAt: Date.now(), operationId: 'op-1-retry', revisionId: 'rev-2', pageId: 'home', summary: '重复修改', files: currentRpcFiles });
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId: 'old-request', runId, sequence: 3, emittedAt: Date.now(), operationId: 'op-old', revisionId: 'rev-old', pageId: 'home', summary: '旧任务', files: currentRpcFiles });
		const state = useDesignStore.getState();
		expect(state.snapshot.files.find((file) => file.path.endsWith('/styles.css'))?.content).toContain('.patch{color:red}');
		expect(state.snapshot.document.version).toBe(current.document.version + 1);
	});

	it('执行中输入只排队一次，settled 后自动派发下一条', async () => {
		const prompt = vi.spyOn(rpc, 'designPrompt')
			.mockResolvedValueOnce({ id: '1', type: 'response', command: 'design_prompt', success: true, data: { requestId, runId } })
			.mockResolvedValueOnce({ id: '2', type: 'response', command: 'design_prompt', success: true, data: { requestId: 'request-next', runId: 'run-next' } });
		await useDesignStore.getState().sendPrompt('第一条');
		await useDesignStore.getState().sendPrompt('第二条');
		expect(prompt).toHaveBeenCalledTimes(1);
		expect(useDesignStore.getState().queuedPrompts).toHaveLength(1);
		const currentRpcFiles = useDesignStore.getState().snapshot.files.map((file) => ({ path: file.path, language: file.language, content: file.content ?? '' }));
		useDesignStore.getState().applyStreamEvent({ type: 'design_run_settled', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), snapshot: { document: useDesignStore.getState().snapshot.document as unknown as Record<string, unknown>, files: currentRpcFiles } });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(prompt).toHaveBeenCalledTimes(2);
		expect(useDesignStore.getState().queuedPrompts).toHaveLength(0);
		expect(useDesignStore.getState().messages.find((message) => message.kind === 'user' && message.text === '第二条')).toMatchObject({ status: 'sent' });
	});

	it('停止清空未执行队列但保留已完成 patch', async () => {
		vi.spyOn(rpc, 'designAbort').mockResolvedValue({ id: 'abort', type: 'response', command: 'design_abort', success: true });
		useDesignStore.setState({ isGenerating: true, execution: { status: 'running', phase: 'tool', runId, requestId, sequence: 2, thinking: '', steps: [] }, queuedPrompts: [{ id: 'q1', text: '未执行' }], messages: [{ id: 'welcome', kind: 'assistant', text: 'welcome' }, { id: 'q1', kind: 'user', text: '未执行', status: 'queued' }] });
		await useDesignStore.getState().stop();
		expect(useDesignStore.getState().queuedPrompts).toEqual([]);
		expect(useDesignStore.getState().execution.status).toBe('stopped');
		expect(useDesignStore.getState().messages.find((message) => message.id === 'q1')).toMatchObject({ status: 'cancelled' });
	});
});
