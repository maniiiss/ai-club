import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCanvasOperations } from '@/src/design/canvas-document';
import { createDefaultProjectGuidelines, createDemoSnapshot, DESIGN_TARGETS, DESIGN_VIEWPORT_PRESETS, type DesignPreset } from '@/src/design/design-types';
import type { CanvasNode } from '@/src/design/canvas-types';
import { rpc } from '@/src/rpc/bridge';
import type { DesignAgentEvent, DesignStreamLine } from '@/src/rpc/types';
import { listDesignProjectHistory, useDesignStore } from './design';

const localStorageData = new Map<string, string>();
vi.stubGlobal('localStorage', {
	getItem: (key: string) => localStorageData.get(key) ?? null,
	setItem: (key: string, value: string) => { localStorageData.set(key, value); },
	removeItem: (key: string) => { localStorageData.delete(key); },
	get length() { return localStorageData.size; },
	key: (index: number) => [...localStorageData.keys()][index] ?? null,
	clear: () => { localStorageData.clear(); },
});

const designId = 'design-test';
const runId = 'run-test';
const requestId = 'request-test';

function presetFixture(): DesignPreset {
	const guidelines = createDefaultProjectGuidelines();
	return {
		id: 'neutral-modern', title: 'Neutral Modern', description: '测试预设', viewports: [{ id: 'desktop', label: 'Desktop', width: 1440, height: 900 }],
		tokens: { colors: { bg: '#ffffff', accent: '#2f6feb' }, typography: { body: 'system-ui' }, spacing: {}, radius: {}, shadows: {} },
		handoff: { brandDescription: '克制、清晰', componentRules: ['按钮保留焦点状态'], layoutRules: ['保留内容边界'], responsiveRules: ['小屏折叠导航'], agentPromptGuide: ['优先遵循 Token'] },
		handoffMarkdown: '## 组件规则\n\n- 按钮保留焦点状态',
		guidelines: { ...guidelines, brand: { name: 'Neutral Modern', tone: '克制、清晰' }, tokens: { ...guidelines.tokens, colors: { bg: '#ffffff', accent: '#2f6feb' }, typography: { body: 'system-ui' } }, components: { button: '按钮保留焦点状态' }, rules: ['保留内容边界', '小屏折叠导航'], updatedAt: new Date().toISOString() },
		license: 'unknown', warnings: [],
	};
}

function bucketKey(path: string): string {
	return `gitpilot-desktop.design-ui:${encodeURIComponent(path)}`;
}

function workspaceSnapshot(path: string, id = `design-${path}`) {
	const base = createDemoSnapshot();
	return { ...base, document: { ...base.document, id }, context: { projectId: path, projectPath: path, designId: id } };
}

/** 事务测试使用的非默认场景夹具；产品新建工作区仍然必须保持空白。 */
function transactionFixtureSnapshot() {
	const base = createDemoSnapshot();
	const makeNode = (input: Pick<CanvasNode, 'id' | 'type' | 'name' | 'transform'> & Partial<CanvasNode>): CanvasNode => ({
		parentId: null, childIds: [], visible: true, locked: false, opacity: 1,
		layout: { mode: 'absolute', width: input.transform.width, height: input.transform.height, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column', align: 'start', justify: 'start' },
		...input,
	});
	const nodes: CanvasNode[] = [
		makeNode({ id: 'brand', type: 'text', name: '品牌测试层', transform: { x: 32, y: 32, width: 180, height: 40, rotation: 0, scaleX: 1, scaleY: 1 }, text: { text: '测试品牌', fontFamily: 'Inter', fontSize: 20, fontWeight: 500, lineHeight: 28, letterSpacing: 0, color: '#ffffff', align: 'left', verticalAlign: 'top', wrap: 'nowrap' } }),
		makeNode({ id: 'headline', type: 'text', name: '标题测试层', transform: { x: 80, y: 160, width: 640, height: 120, rotation: 0, scaleX: 1, scaleY: 1 }, text: { text: '默认测试标题', fontFamily: 'Inter', fontSize: 48, fontWeight: 700, lineHeight: 56, letterSpacing: 0, color: '#ffffff', align: 'left', verticalAlign: 'top', wrap: 'wrap' } }),
		makeNode({ id: 'subline', type: 'text', name: '副标题测试层', transform: { x: 80, y: 300, width: 420, height: 60, rotation: 0, scaleX: 1, scaleY: 1 }, text: { text: '测试说明', fontFamily: 'Inter', fontSize: 18, fontWeight: 400, lineHeight: 28, letterSpacing: 0, color: '#b8c4c4', align: 'left', verticalAlign: 'top', wrap: 'wrap' } }),
		makeNode({ id: 'decorative-path', type: 'path', name: '路径测试层', transform: { x: 760, y: 120, width: 160, height: 160, rotation: 0, scaleX: 1, scaleY: 1 }, path: { fillRule: 'nonZero', commands: [{ op: 'moveTo', x: 0, y: 0 }, { op: 'lineTo', x: 160, y: 160 }] } }),
	];
	const canvas = applyCanvasOperations(base.document.canvas!, nodes.map((node) => ({ op: 'create_node' as const, node, parentId: 'canvas-root' })));
	return { ...base, document: { ...base.document, version: canvas.revision, canvas } };
}

function writeWorkspace(path: string, options: { activeFile?: string; activeTab?: 'preview' | 'code'; messages?: unknown[]; queuedPrompts?: Array<{ id: string; text: string }>; isProjectStarted?: boolean; hasWorkspace?: boolean } = {}): void {
	const snapshot = workspaceSnapshot(path);
	localStorage.setItem(bucketKey(path), JSON.stringify({
		activePageId: snapshot.document.entryPageId,
		activeFile: options.activeFile ?? '',
		activeTab: options.activeTab ?? 'preview',
		target: 'desktop',
		viewport: { width: 1440, height: 900 },
		zoom: 100,
		selectedElementId: null,
		hasWorkspace: options.hasWorkspace ?? true,
		isProjectStarted: options.isProjectStarted ?? false,
	}));
}

function resetStore(): void {
	const fixture = transactionFixtureSnapshot();
	const snapshot = { ...fixture, document: { ...fixture.document, id: designId } };
	useDesignStore.setState({
		snapshot,
		committedScene: structuredClone(snapshot.document.canvas!),
		draft: null,
		draftMetadata: null,
		transient: null,
		manualQueue: [],
		isResynchronizing: false,
		projects: [{ name: 'Design project', path: 'project-test' }],
		projectPath: 'project-test',
		activeProjectKey: 'project-test',
		backgroundRuns: {},
		activePageId: snapshot.document.entryPageId,
		activeFile: '',
		activeTab: 'preview',
		target: 'desktop',
		viewport: { width: DESIGN_TARGETS.desktop.width, height: DESIGN_TARGETS.desktop.height },
		zoom: 100,
		previewMode: 'original',
		selectedElementId: null,
		messages: [],
		pendingPlan: null,
		pendingApproval: null,
		execution: { status: 'idle', phase: 'idle', runId: null, requestId: null, sequence: 0, thinking: '', steps: [] },
		queuedPrompts: [],
		streamingAssistantId: null,
		isGenerating: false,
		error: null,
		hasWorkspace: false,
		isProjectStarted: false,
		selectedPresetId: null,
		pendingPreset: null,
		pendingClarification: null,
		todos: [],
		uploadRecords: [],
	});
}

function line(line: Omit<Extract<DesignStreamLine, { type: 'design_event' }>, 'designId' | 'requestId' | 'runId' | 'sequence' | 'emittedAt'> & { sequence: number }): DesignStreamLine {
	return { ...line, projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, emittedAt: Date.now() };
}

function agentEvent(event: unknown): DesignAgentEvent {
	return event as DesignAgentEvent;
}

describe('Design Mode snapshot', () => {
	beforeEach(() => {
		localStorage.clear();
		resetStore();
		vi.restoreAllMocks();
	});
	it('provides a runnable CanvasKit native prototype', () => {
		const snapshot = createDemoSnapshot();
		expect(snapshot.document.entryPageId).toBe('canvas');
		expect(snapshot.files).toEqual([]);
		expect(snapshot.document.canvas?.pages[0]).toMatchObject({ id: 'canvas', name: '无限画板', isInfinite: true });
		expect(snapshot.document.canvas?.nodes['canvas-root']).toMatchObject({ type: 'page', childIds: [] });
		expect(Object.keys(snapshot.document.canvas?.nodes ?? {})).toEqual(['canvas-root']);
	});

	it('keeps the three target profiles deterministic', () => {
		expect(DESIGN_TARGETS.mobile).toEqual({ label: '手机', width: 375, height: 812 });
		expect(DESIGN_TARGETS.desktop.width).toBeGreaterThan(DESIGN_TARGETS.tablet.width);
	});

	it('Design 压缩事件显示实时、成功和失败三种状态文案所需的状态', () => {
		useDesignStore.getState().applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'compaction_start' }), sequence: 1 }));
		expect(useDesignStore.getState().execution).toMatchObject({ phase: 'compacting', compactionNotice: undefined });
		expect(useDesignStore.getState().isGenerating).toBe(true);
		useDesignStore.getState().applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'compaction_end', result: true }), sequence: 2 }));
		expect(useDesignStore.getState().execution).toMatchObject({ phase: 'thinking', compactionNotice: 'success' });
		useDesignStore.getState().applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'compaction_start' }), sequence: 3 }));
		useDesignStore.getState().applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'compaction_end', result: false, errorMessage: '底层错误' }), sequence: 4 }));
		expect(useDesignStore.getState().execution).toMatchObject({ compactionNotice: 'failure', compactionError: '底层错误' });
	});

	it('provides editable-friendly common viewport presets', () => {
		expect(DESIGN_VIEWPORT_PRESETS.mobile.map((preset) => preset.width)).toEqual([360, 375, 390, 430]);
		expect(DESIGN_VIEWPORT_PRESETS.desktop.map((preset) => preset.id)).toEqual(['desktop-workspace', 'desktop-720p', 'desktop-1080p', 'desktop-2k', 'desktop-4k']);
		expect(DESIGN_VIEWPORT_PRESETS.desktop.find((preset) => preset.id === 'desktop-4k')).toMatchObject({ width: 3840, height: 2160 });
	});

	it('persists the preview display mode in the current project bucket', () => {
		useDesignStore.getState().setPreviewMode('browser');
		expect(useDesignStore.getState().previewMode).toBe('browser');
		expect(JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}').previewMode).toBe('browser');
	});

	it('通过 sidecar 修订保存页面重命名并同步当前 bucket', async () => {
		const current = useDesignStore.getState().snapshot;
		const renamedCanvas = structuredClone(current.document.canvas!);
		renamedCanvas.pages[0].name = '登录页';
		const nextSnapshot = { ...current, document: { ...current.document, version: current.document.version + 1, pages: current.document.pages.map((page) => page.id === 'canvas' ? { ...page, name: '登录页' } : page), canvas: renamedCanvas } };
		const rename = vi.spyOn(rpc, 'designRenamePage').mockResolvedValue({ id: 'rename-page', type: 'response', command: 'design_rename_page', success: true, data: { designId, snapshot: nextSnapshot as never } } as never);

		await useDesignStore.getState().renamePage('canvas', ' 登录页 ');

		expect(rename).toHaveBeenCalledWith({ projectPath: 'project-test', designId, pageId: 'canvas', name: '登录页', baseRevisionId: current.document.revisions.at(-1)?.id ?? '' });
		expect(useDesignStore.getState().snapshot.document.pages[0].name).toBe('登录页');
		expect(JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}')).not.toHaveProperty('snapshot');
	});

	it('Canvas 本地事务把基准修订写入 patch 正文', async () => {
		const current = useDesignStore.getState().snapshot;
		const baseRevisionId = current.document.revisions.at(-1)?.id ?? '';
		const applyPatch = vi.spyOn(rpc, 'designApplyPatch').mockResolvedValue({
			id: 'apply-canvas', type: 'response', command: 'design_apply_patch', success: true,
			data: { snapshot: current as never },
		} as never);

		await useDesignStore.getState().applyCanvasTransaction({
			transactionId: 'desktop-update-brand', baseRevision: current.document.canvas!.revision, source: 'user',
			operations: [{ op: 'update_node', nodeId: 'brand', changes: { visible: false } }],
			summary: '隐藏品牌层', createdAt: new Date().toISOString(),
		});

		expect(applyPatch).toHaveBeenCalledWith(expect.objectContaining({
			baseRevisionId,
			patch: expect.objectContaining({ baseRevisionId }),
		}));
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
		expect(history[0]).toMatchObject({ workspaceName: 'GitPilot Design', pageCount: 0, fileCount: 0, hasWorkspace: true });
	});

	it('兼容旧 bucket 的工作区状态，并忽略损坏 bucket', () => {
		writeWorkspace('legacy-project', { hasWorkspace: undefined, isProjectStarted: true });
		localStorage.setItem(bucketKey('broken-project'), '{broken json');

		const history = listDesignProjectHistory([
			{ name: '旧项目', path: 'legacy-project' },
			{ name: '损坏项目', path: 'broken-project', hasWorkspace: true },
		]);

		expect(history.map((item) => item.path)).toEqual(['legacy-project', 'broken-project']);
	});

	it('从 Design 项目列表移除当前项目但保留磁盘工作区', () => {
		writeWorkspace('project-test');
		useDesignStore.setState({ projects: [{ name: '当前项目', path: 'project-test', hasWorkspace: true }], projectPath: 'project-test', hasWorkspace: true, isProjectStarted: false });

		useDesignStore.getState().removeProject('project-test');

		expect(useDesignStore.getState()).toMatchObject({ projects: [], projectPath: null, hasWorkspace: false, isProjectStarted: false });
		expect(localStorage.getItem(bucketKey('project-test'))).not.toBeNull();
	});

	it('删除当前项目后回到入口，不自动切入其它工作空间', () => {
		writeWorkspace('project-a');
		writeWorkspace('project-b');
		const open = vi.spyOn(rpc, 'designOpen');
		useDesignStore.setState({ projects: [{ name: 'A', path: 'project-a', hasWorkspace: true }, { name: 'B', path: 'project-b', hasWorkspace: true }], projectPath: 'project-a', hasWorkspace: true, isProjectStarted: true });

		useDesignStore.getState().removeProject('project-a');

		expect(useDesignStore.getState()).toMatchObject({ projectPath: null, hasWorkspace: false, isProjectStarted: false, projects: [{ name: 'B', path: 'project-b', hasWorkspace: true }] });
		expect(open).not.toHaveBeenCalled();
	});

	it('resetProject 返回 Landing 但保留完整工作区，历史点击可恢复当前项目', async () => {
		const activeFile = 'pages/home/styles.css';
		const messages = [{ id: 'm0', kind: 'assistant' as const, text: '历史回复' }, { id: 'm1', kind: 'user' as const, text: '保留我', status: 'sent' as const }];
		writeWorkspace('project-test', { activeFile, activeTab: 'code', messages, queuedPrompts: [{ id: 'q1', text: '排队内容' }] });
		useDesignStore.setState({ projects: [{ name: '项目', path: 'project-test', hasWorkspace: true }], hasWorkspace: true, isProjectStarted: true, activeFile, activeTab: 'code', messages, queuedPrompts: [{ id: 'q1', text: '排队内容' }] });
		vi.spyOn(rpc, 'designOpen').mockResolvedValue({ id: 'open', type: 'response', command: 'design_open', success: true, data: { snapshot: workspaceSnapshot('project-test') } } as never);

		useDesignStore.getState().resetProject();
		expect(useDesignStore.getState()).toMatchObject({ isProjectStarted: false, hasWorkspace: true, activeFile, activeTab: 'code', queuedPrompts: [{ id: 'q1', text: '排队内容' }] });

		await useDesignStore.getState().openProjectHistory('project-test');
		expect(useDesignStore.getState()).toMatchObject({ isProjectStarted: true, hasWorkspace: true, activeFile, activeTab: 'code', messages: [], queuedPrompts: [] });
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
		expect(state).toMatchObject({ projectPath: 'project-b', activeFile: fileB, activeTab: 'code', messages: [] });

		await useDesignStore.getState().openProjectHistory('project-a');
		state = useDesignStore.getState();
		expect(state).toMatchObject({ projectPath: 'project-a', activeFile: fileA, activeTab: 'preview', messages: [] });
	});

	it('切出再切回项目时保留后台运行态，并继续显示执行阶段', async () => {
		const open = vi.spyOn(rpc, 'designOpen').mockImplementation(async (path) => ({ id: 'open', type: 'response', command: 'design_open', success: true, data: { snapshot: workspaceSnapshot(path) } }) as never);
		useDesignStore.setState({
			projects: [{ name: 'A', path: 'project-test', hasWorkspace: true }, { name: 'B', path: 'project-b', hasWorkspace: true }],
			projectPath: 'project-test',
			snapshot: workspaceSnapshot('project-test', designId),
			hasWorkspace: true,
			isProjectStarted: true,
			execution: { status: 'running', phase: 'tool', runId, requestId, sequence: 4, thinking: '正在分析页面', steps: [{ id: 'tool-1', toolCallId: 'tool-1', toolName: 'design_apply_patch', summary: '修改首页', status: 'running', startedAt: Date.now() }] },
			isGenerating: true,
		});

		await useDesignStore.getState().switchProject('project-b');
		await useDesignStore.getState().switchProject('project-test');

		expect(open).toHaveBeenCalledWith('project-test');
		expect(useDesignStore.getState()).toMatchObject({
			projectPath: 'project-test',
			isGenerating: true,
			execution: { status: 'running', phase: 'tool', runId, requestId, sequence: 4 },
		});
		expect(useDesignStore.getState().execution.steps[0]).toMatchObject({ toolName: 'design_apply_patch', status: 'running' });
	});

	it('从 sidecar 恢复 Design UI 消息，而 localStorage 只保留轻量状态', async () => {
		const messages = [
			{ id: 'user-qcc', kind: 'user' as const, text: '设计企查查页面', status: 'sent' as const },
			{ id: 'assistant-qcc', kind: 'assistant' as const, text: '已完成页面骨架。' },
		];
		vi.spyOn(rpc, 'designOpen').mockResolvedValue({
			id: 'open', type: 'response', command: 'design_open', success: true,
			data: { designId, snapshot: workspaceSnapshot('project-test'), messages },
		} as never);

		await useDesignStore.getState().hydrateSnapshot();

		expect(useDesignStore.getState().messages).toEqual(messages);
		const bucket = JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}');
		expect(bucket).not.toHaveProperty('snapshot');
		expect(bucket).not.toHaveProperty('messages');
	});

	it('重新进入工作区不恢复上次 Canvas 节点选中态', async () => {
		useDesignStore.setState({ selectedElementId: 'brand', selectedElementIds: ['brand'] });
		vi.spyOn(rpc, 'designOpen').mockResolvedValue({
			id: 'open', type: 'response', command: 'design_open', success: true,
			data: { designId, snapshot: workspaceSnapshot('project-test'), messages: [] },
		} as never);

		await useDesignStore.getState().hydrateSnapshot();

		expect(useDesignStore.getState()).toMatchObject({ selectedElementId: null, selectedElementIds: [] });
	});

	it('重新打开工作区时恢复 sidecar 的审批暂停态，且不把完整 patch 带回前端', async () => {
		const open = vi.spyOn(rpc, 'designOpen').mockResolvedValue({
			id: 'open', type: 'response', command: 'design_open', success: true,
			data: {
				designId,
				snapshot: workspaceSnapshot('project-test'),
				messages: [],
				execution: {
					status: 'awaiting_approval', phase: 'awaiting_approval', requestId, runId, sequence: 7,
					pendingApproval: { approvalId: 'approval-recovered', pageId: 'home', reason: '需要确认整页替换' },
				},
			},
		} as never);

		await useDesignStore.getState().hydrateSnapshot();

		expect(open).toHaveBeenCalledWith('project-test');
		expect(useDesignStore.getState()).toMatchObject({
			isGenerating: true,
			pendingApproval: { approvalId: 'approval-recovered', reason: '需要确认整页替换', pageId: 'home' },
			execution: { status: 'awaiting_approval', phase: 'awaiting_approval', requestId, runId, sequence: 7 },
		});
		expect(useDesignStore.getState().pendingApproval?.patch).toBeUndefined();
	});

	it('重连 active draft 时使用 draftSnapshot 渲染，但 committedScene 仍保持 canonical', async () => {
		const canonical = workspaceSnapshot('project-test');
		const draftCanvas = applyCanvasOperations(structuredClone(canonical.document.canvas!), [{ op: 'update_node', nodeId: 'canvas-root', changes: { opacity: 0.8 } }]);
		const draftSnapshot = { ...canonical, document: { ...canonical.document, version: draftCanvas.revision, canvas: draftCanvas } };
		vi.spyOn(rpc, 'designOpen').mockResolvedValue({
			id: 'open-draft', type: 'response', command: 'design_open', success: true,
			data: { designId, snapshot: canonical, draft: { status: 'active', runId, requestId, baseRevisionId: 'rev-1', draftRevisionId: `draft-${runId}`, operationCount: 1, lastSequence: 4 }, draftSnapshot, execution: { status: 'running', phase: 'applying_patch', requestId, runId, sequence: 4 } },
		} as never);

		await useDesignStore.getState().hydrateSnapshot();

		expect(useDesignStore.getState().committedScene.nodes['canvas-root'].opacity).toBe(1);
		expect(useDesignStore.getState().draft?.scene.nodes['canvas-root'].opacity).toBe(0.8);
		expect(useDesignStore.getState().getRenderScene().nodes['canvas-root'].opacity).toBe(0.8);
	});

	it('审批或澄清等待期间输入不会创建新的 Design 请求', async () => {
		const prompt = vi.spyOn(rpc, 'designPrompt');
		useDesignStore.setState({
			isGenerating: true,
			pendingApproval: { approvalId: 'approval-waiting', reason: '请确认', patch: { baseRevisionId: 'rev-1', operations: [] } },
			execution: { status: 'awaiting_approval', phase: 'awaiting_approval', runId, requestId, sequence: 3, thinking: '', steps: [] },
		});

		await useDesignStore.getState().sendPrompt('继续');

		expect(prompt).not.toHaveBeenCalled();
		expect(useDesignStore.getState().queuedPrompts).toEqual([]);
		expect(useDesignStore.getState().error).toBe('请先处理当前待确认的 Design 修改');
	});

	it('流式正文变化不会高频写入 localStorage', () => {
		const setItem = vi.spyOn(localStorage, 'setItem');
		useDesignStore.setState({ isGenerating: true, execution: { status: 'running', phase: 'responding', runId, requestId, sequence: 0, thinking: '', steps: [] } });
		setItem.mockClear();

		useDesignStore.getState().applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '流式片段' } }), sequence: 1 }));

		expect(setItem).not.toHaveBeenCalled();
	});

	it('新需求直接启动 Agent，只有 Agent 推送计划时才出现真实待办', async () => {
		const current = useDesignStore.getState().snapshot;
		vi.spyOn(rpc, 'designCreate').mockResolvedValue({
			id: 'create', type: 'response', command: 'design_create', success: true,
			data: { designId, snapshot: { document: current.document as unknown as Record<string, unknown>, files: current.files, context: { projectId: 'project-test', projectPath: 'project-test', designId } } },
		} as never);
		const prompt = vi.spyOn(rpc, 'designPrompt').mockResolvedValue({ id: 'prompt', type: 'response', command: 'design_prompt', success: true, data: { requestId, runId } } as never);

		await useDesignStore.getState().startProject('设计一个登录页');

		expect(useDesignStore.getState()).toMatchObject({ isProjectStarted: true, error: null, pendingClarification: null, todos: [] });
		expect(useDesignStore.getState().messages.at(-1)).toMatchObject({ kind: 'user', text: '设计一个登录页', status: 'sent' });
		expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ prompt: '设计一个登录页' }));

		useDesignStore.getState().applyStreamEvent({ type: 'design_plan_updated', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), steps: [{ id: 'design-step-1', text: '搭建页面骨架', state: 'active' }, { id: 'design-step-2', text: '验证响应式布局', state: 'pending' }] });
		expect(useDesignStore.getState().todos).toEqual([{ id: 'design-step-1', text: '搭建页面骨架', state: 'active' }, { id: 'design-step-2', text: '验证响应式布局', state: 'pending' }]);
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 2, emittedAt: Date.now(), operationId: 'plan-patch', revisionId: 'rev-plan', pageId: 'page-home', summary: '完成页面骨架', transaction: { transactionId: 'plan-patch', baseRevision: useDesignStore.getState().snapshot.document.canvas!.revision, source: 'ai', operations: [], summary: '完成页面骨架', createdAt: new Date().toISOString() }, affectedNodeIds: [] });
		expect(useDesignStore.getState().todos[0]).toMatchObject({ state: 'active' });
		const persisted = JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}');
		expect(persisted).not.toHaveProperty('pendingClarification');
		expect(persisted).not.toHaveProperty('todos');
		expect(persisted).not.toHaveProperty('snapshot');
	});

	it('Design 任务结束后收起输入框上方的临时计划', () => {
		const current = useDesignStore.getState().snapshot;
		useDesignStore.getState().applyStreamEvent({ type: 'design_plan_updated', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), steps: [{ id: 'design-step-1', text: '完成页面设计', state: 'active' }] });
		expect(useDesignStore.getState().todos).toHaveLength(1);

		useDesignStore.getState().applyStreamEvent({ type: 'design_run_settled', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 2, emittedAt: Date.now(), snapshot: { document: current.document as unknown as Record<string, unknown>, files: current.files, context: { projectId: 'project-test', projectPath: 'project-test', designId } } });
		expect(useDesignStore.getState().todos).toEqual([]);
	});

	it('Agent 发现关键歧义时暂停，并在回答后恢复同一次运行', async () => {
		const prompt = vi.spyOn(rpc, 'designPrompt').mockResolvedValue({ id: 'prompt', type: 'response', command: 'design_prompt', success: true, data: { requestId, runId } } as never);
		await useDesignStore.getState().sendPrompt('设计一个工作台');
		useDesignStore.getState().applyStreamEvent({ type: 'design_clarification_required', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), clarificationId: 'clarification-1', question: '主要服务哪类用户？', context: '这会影响信息密度和导航层级。', options: ['管理员', '普通成员'] });
		expect(useDesignStore.getState()).toMatchObject({ pendingClarification: { clarificationId: 'clarification-1', question: '主要服务哪类用户？' }, execution: { status: 'awaiting_clarification', phase: 'awaiting_clarification' } });
		const response = vi.spyOn(rpc, 'designClarificationResponse').mockResolvedValue({ id: 'answer', type: 'response', command: 'design_clarification_response', success: true } as never);
		await useDesignStore.getState().respondClarification('管理员');
		expect(response).toHaveBeenCalledWith({ projectPath: 'project-test', designId, clarificationId: 'clarification-1', answer: '管理员' });
		expect(useDesignStore.getState()).toMatchObject({ pendingClarification: null, execution: { status: 'running', phase: 'thinking' } });
		expect(prompt).toHaveBeenCalledTimes(1);
	});

	it('新项目先保存待应用预设规范，再发送首次设计请求', async () => {
		const current = useDesignStore.getState().snapshot;
		const calls: string[] = [];
		vi.spyOn(rpc, 'designCreate').mockImplementation(async () => {
			calls.push('create');
			return { id: 'create', type: 'response', command: 'design_create', success: true, data: { designId, snapshot: { document: current.document as unknown as Record<string, unknown>, files: current.files, context: { projectId: 'project-test', projectPath: 'project-test', designId } } } } as never;
		});
		vi.spyOn(rpc, 'designSaveGuidelines').mockImplementation(async (_path, _id, guidelines) => {
			calls.push('guidelines');
			return { id: 'save-guidelines', type: 'response', command: 'design_save_guidelines', success: true, data: { designId, snapshot: { document: current.document as unknown as Record<string, unknown>, files: current.files, context: { projectId: 'project-test', projectPath: 'project-test', designId }, guidelines } } } as never;
		});
		vi.spyOn(rpc, 'designPrompt').mockImplementation(async () => {
			calls.push('prompt');
			return { id: 'prompt', type: 'response', command: 'design_prompt', success: true, data: { requestId, runId } } as never;
		});

		await useDesignStore.getState().applyPreset(presetFixture());
		expect(useDesignStore.getState()).toMatchObject({ selectedPresetId: 'neutral-modern', pendingPreset: { id: 'neutral-modern' } });
		await useDesignStore.getState().startProject('设计一个登录页');

		expect(calls).toEqual(['create', 'guidelines', 'prompt']);
		expect(useDesignStore.getState()).toMatchObject({ selectedPresetId: 'neutral-modern', pendingPreset: null, snapshot: { guidelines: { brand: { name: 'Neutral Modern' } } } });
	});

	it('UI bucket 不持久化待应用预设的完整 Canvas scene', async () => {
		const preset = { ...presetFixture(), scene: transactionFixtureSnapshot().document.canvas };
		await useDesignStore.getState().applyPreset(preset);

		const bucket = JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}') as { pendingPreset?: Record<string, unknown> };
		expect(bucket.pendingPreset).toMatchObject({ id: preset.id });
		expect(bucket.pendingPreset).not.toHaveProperty('scene');
	});

	it('已有工作区选择预设会立即保存规范并写回项目 bucket', async () => {
		const current = useDesignStore.getState().snapshot;
		const preset = presetFixture();
		useDesignStore.setState({ hasWorkspace: true, isProjectStarted: true });
		vi.spyOn(rpc, 'designSaveGuidelines').mockImplementation(async (_path, _id, guidelines) => ({ id: 'save-guidelines', type: 'response', command: 'design_save_guidelines', success: true, data: { designId, snapshot: { document: current.document as unknown as Record<string, unknown>, files: current.files, context: { projectId: 'project-test', projectPath: 'project-test', designId }, guidelines } } } as never));

		await useDesignStore.getState().applyPreset(preset);

		expect(rpc.designSaveGuidelines).toHaveBeenCalledWith('project-test', designId, expect.objectContaining({ brand: expect.objectContaining({ name: 'Neutral Modern' }) }), expect.objectContaining({ schemaVersion: 2 }));
		expect(useDesignStore.getState()).toMatchObject({ selectedPresetId: 'neutral-modern', pendingPreset: null, snapshot: { guidelines: { tokens: { colors: { accent: '#2f6feb' } } } } });
		expect(JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}')).toMatchObject({ selectedPresetId: 'neutral-modern' });
		expect(JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}')).not.toHaveProperty('snapshot');
	});

	it('sidecar 确认工作区已不存在时清理过期缓存，预设改为等待首次创建', async () => {
		writeWorkspace('project-test');
		useDesignStore.setState({ hasWorkspace: true, isProjectStarted: true });
		vi.spyOn(rpc, 'designOpen').mockResolvedValue({ id: 'open', type: 'response', command: 'design_open', success: false, error: '当前工作空间还没有设计工作区' });
		vi.spyOn(rpc, 'designSaveGuidelines');

		await useDesignStore.getState().hydrateSnapshot();
		expect(useDesignStore.getState()).toMatchObject({ hasWorkspace: false, isProjectStarted: false });

		await useDesignStore.getState().applyPreset(presetFixture());
		expect(useDesignStore.getState()).toMatchObject({ selectedPresetId: 'neutral-modern', pendingPreset: { id: 'neutral-modern' } });
		expect(rpc.designSaveGuidelines).not.toHaveBeenCalled();
		expect(JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}')).toMatchObject({ hasWorkspace: false, isProjectStarted: false });
		expect(JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}')).not.toHaveProperty('snapshot');
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
		expect(state.messages.filter((message) => message.kind === 'assistant')).toHaveLength(1);
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
		expect(state.messages).toHaveLength(0);
	});

	it('工具阶段覆盖 thinking 提示，并拒绝乱序/重复 sequence', () => {
		const store = useDesignStore.getState();
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '分析中' } }), sequence: 1 }));
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'tool_execution_start', toolCallId: 'tool-1', toolName: 'design_apply_patch', summary: '修改 pages/home/index.html · 3 KB' }), sequence: 2 }));
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'tool_execution_start', toolCallId: 'tool-duplicate', toolName: 'ignored' }), sequence: 1 }));
		const state = useDesignStore.getState();
		expect(state.execution.phase).toBe('tool');
		expect(state.execution.steps).toHaveLength(1);
		expect(state.execution.steps[0]).toMatchObject({ summary: '修改 pages/home/index.html · 3 KB' });
		expect(state.execution.sequence).toBe(2);
	});

	it('工具事件只保留展示摘要，不在 Design store 留存 patch 正文或工具输出', () => {
		const store = useDesignStore.getState();
		const largePayload = 'x'.repeat(128_000);
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'tool_execution_start', toolCallId: 'tool-memory', toolName: 'design_apply_patch', summary: '修改 pages/home/styles.css · 125 KB', args: { operations: [{ content: largePayload }] } }), sequence: 1 }));
		store.applyStreamEvent(line({ type: 'design_event', event: agentEvent({ type: 'tool_execution_end', toolCallId: 'tool-memory', toolName: 'design_apply_patch', result: largePayload }), sequence: 2 }));
		const step = useDesignStore.getState().execution.steps[0] as unknown as Record<string, unknown>;
		expect(step).toMatchObject({ summary: '修改 pages/home/styles.css · 125 KB', status: 'succeeded' });
		expect(step).not.toHaveProperty('args');
		expect(step).not.toHaveProperty('result');
	});

	it('Canvas transaction 事件立即更新场景，重复序号不会重复归约', () => {
		const current = useDesignStore.getState().snapshot;
		const canvas = current.document.canvas!;
		const operation = { op: 'update_node' as const, nodeId: 'subline', changes: { opacity: 0.6 } };
		const transaction = { transactionId: 'op-1', baseRevision: canvas.revision, source: 'ai' as const, operations: [operation], summary: '增加强调色', createdAt: new Date().toISOString() };
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), operationId: 'op-1', revisionId: 'draft-2', pageId: 'page-home', summary: '增加强调色', transaction, affectedNodeIds: ['subline'], isDraft: true });
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), operationId: 'op-1', revisionId: 'draft-2', pageId: 'page-home', summary: '重复修改', transaction, affectedNodeIds: ['subline'], isDraft: true });
		const state = useDesignStore.getState();
		expect(state.snapshot.document.canvas?.nodes.subline.opacity).toBe(0.6);
		expect(state.snapshot.document.canvas?.revision).toBe(canvas.revision + 1);
	});

	it('Design run 的 draft Canvas transaction 不新增 revision，收口快照才新增一次 revision', () => {
		const current = useDesignStore.getState().snapshot;
		const formalRevisionCount = current.document.revisions.length;
		const transaction = { transactionId: 'op-draft', baseRevision: current.document.canvas!.revision, source: 'ai' as const, operations: [{ op: 'update_node' as const, nodeId: 'subline', changes: { opacity: 0.7 } }], summary: '实时修改', createdAt: new Date().toISOString() };
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), operationId: 'op-draft', revisionId: 'draft-run-test', pageId: 'page-home', summary: '实时修改', transaction, affectedNodeIds: ['subline'], isDraft: true });
		expect(useDesignStore.getState().snapshot.document.revisions).toHaveLength(formalRevisionCount);

		const draft = useDesignStore.getState().snapshot;
		const settled = { ...draft, document: { ...draft.document, revisions: [...draft.document.revisions, { id: 'rev-run-test', prompt: '完成 Design 任务', summary: '完成 Design 任务', createdAt: new Date().toISOString(), kind: 'patch' as const }] } };
		useDesignStore.getState().applyStreamEvent({ type: 'design_run_settled', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 2, emittedAt: Date.now(), snapshot: settled });
		expect(useDesignStore.getState().snapshot.document.revisions).toHaveLength(formalRevisionCount + 1);
		expect(useDesignStore.getState().snapshot.document.revisions.at(-1)?.id).toBe('rev-run-test');
	});

	it('interrupted settled 保留已接受 draft 并清理 draft 状态', () => {
		const current = useDesignStore.getState().snapshot;
		const canvas = current.document.canvas!;
		const transaction = { transactionId: 'op-interrupted', baseRevision: canvas.revision, source: 'ai' as const, operations: [{ op: 'update_node' as const, nodeId: 'subline', changes: { opacity: 0.5 } }], summary: '停止前已接受的修改', createdAt: new Date().toISOString() };
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), operationId: 'op-interrupted', revisionId: 'draft-interrupted', draftRevisionId: 'draft-interrupted', pageId: 'page-home', summary: transaction.summary, transaction, affectedNodeIds: ['subline'], isDraft: true });
		const draft = useDesignStore.getState().snapshot;
		const settled = { ...draft, document: { ...draft.document, revisions: [...draft.document.revisions, { id: 'rev-interrupted', prompt: '停止', summary: '停止前已接受的修改', createdAt: new Date().toISOString(), kind: 'interrupted' as const }] } };
		useDesignStore.getState().applyStreamEvent({ type: 'design_run_settled', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 2, emittedAt: Date.now(), snapshot: settled, reason: 'interrupted' });
		expect(useDesignStore.getState()).toMatchObject({ draft: null, isGenerating: false, execution: { status: 'stopped' }, snapshot: { document: { revisions: expect.arrayContaining([expect.objectContaining({ id: 'rev-interrupted', kind: 'interrupted' })]) } } });
	});

	it('AI 运行期间结构性手工事务进入队列，并在 settled 后按 FIFO 提交', async () => {
		const current = useDesignStore.getState().snapshot;
		const canvas = current.document.canvas!;
		useDesignStore.setState({ isGenerating: true, execution: { status: 'running', phase: 'tool', runId, requestId, sequence: 0, thinking: '', steps: [] } });
		await useDesignStore.getState().applyCanvasTransaction({ transactionId: 'manual-queued', baseRevision: canvas.revision, source: 'user', operations: [{ op: 'update_node', nodeId: 'subline', changes: { opacity: 0.4 } }], summary: '排队手工修改', createdAt: new Date().toISOString() });
		expect(useDesignStore.getState().manualQueue).toHaveLength(1);
		expect(useDesignStore.getState().getRenderScene().nodes.subline.opacity).not.toBe(0.4);
		const settled = { ...current, document: { ...current.document, revisions: [...current.document.revisions, { id: 'rev-settled-queue', prompt: '完成', summary: '完成', createdAt: new Date().toISOString(), kind: 'patch' as const }] } };
		vi.spyOn(rpc, 'designApplyPatch').mockResolvedValue({ id: 'manual-response', type: 'response', command: 'design_apply_patch', success: true, data: { snapshot: settled } } as never);
		useDesignStore.getState().applyStreamEvent({ type: 'design_run_settled', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), snapshot: settled, reason: 'completed' });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(useDesignStore.getState().manualQueue).toHaveLength(0);
		expect(rpc.designApplyPatch).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({ operationId: 'manual-queued' }) }));
	});

	it('interrupted settled 后仍按 FIFO 提交结构性手工事务', async () => {
		const current = useDesignStore.getState().snapshot;
		const canvas = current.document.canvas!;
		useDesignStore.setState({ isGenerating: true, execution: { status: 'running', phase: 'tool', runId, requestId, sequence: 0, thinking: '', steps: [] } });
		await useDesignStore.getState().applyCanvasTransaction({ transactionId: 'manual-after-interrupt', baseRevision: canvas.revision, source: 'user', operations: [{ op: 'update_node', nodeId: 'subline', changes: { opacity: 0.35 } }], summary: '中断后排队修改', createdAt: new Date().toISOString() });
		const settled = { ...current, document: { ...current.document, revisions: [...current.document.revisions, { id: 'rev-interrupted-queue', prompt: '停止', summary: '停止', createdAt: new Date().toISOString(), kind: 'interrupted' as const }] } };
		const applyPatch = vi.spyOn(rpc, 'designApplyPatch').mockResolvedValue({ id: 'manual-interrupted-response', type: 'response', command: 'design_apply_patch', success: true, data: { snapshot: settled } } as never);
		useDesignStore.getState().applyStreamEvent({ type: 'design_run_settled', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), snapshot: settled, reason: 'interrupted' });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(applyPatch).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({ operationId: 'manual-after-interrupt' }) }));
		expect(useDesignStore.getState().manualQueue).toHaveLength(0);
	});

	it('同一批 patch 同时更新容器和子节点时，笔迹目标优先使用具体子节点', () => {
		const current = useDesignStore.getState().snapshot;
		const canvas = current.document.canvas!;
		const root = canvas.nodes['canvas-root'];
		const frame: CanvasNode = {
			id: 'ai-target-frame', type: 'frame', name: '登录表单', parentId: root.id, childIds: [], visible: true, locked: false, opacity: 1,
			transform: { x: 120, y: 120, width: 420, height: 260, rotation: 0, scaleX: 1, scaleY: 1 },
			layout: { mode: 'absolute', width: 420, height: 260, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column', align: 'start', justify: 'start' },
		};
		const text: CanvasNode = { ...structuredClone(canvas.nodes.headline), id: 'ai-target-label', name: '登录标题', parentId: frame.id, childIds: [], transform: { x: 32, y: 32, width: 260, height: 48, rotation: 0, scaleX: 1, scaleY: 1 } };
		const transaction = { transactionId: 'op-container-and-child', baseRevision: canvas.revision, source: 'ai' as const, operations: [{ op: 'create_node' as const, node: frame, parentId: root.id }, { op: 'create_node' as const, node: text, parentId: frame.id }], summary: '创建登录表单', createdAt: new Date().toISOString() };
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), operationId: transaction.transactionId, revisionId: 'draft-container-and-child', draftRevisionId: 'draft-container-and-child', operationIndex: 1, pageId: 'canvas', summary: transaction.summary, transaction, isDraft: true });

		expect(useDesignStore.getState().draft?.lastPatchNodeIds).toEqual(['ai-target-label']);
	});

	it('连续 draft patch 按 operationIndex/sequence 归约，旧 run 与重复 operationId 被丢弃', () => {
		const current = useDesignStore.getState().snapshot;
		const firstNode = current.document.canvas!.nodes.subline;
		useDesignStore.setState({ execution: { status: 'running', phase: 'tool', runId: 'run-live', requestId: 'request-live', sequence: 0, thinking: '', steps: [] }, isGenerating: true });
		for (let index = 1; index <= 20; index += 1) {
			const scene = useDesignStore.getState().getRenderScene();
			const transaction = { transactionId: `burst-${index}`, baseRevision: scene.revision, source: 'ai' as const, operations: [{ op: 'update_node' as const, nodeId: 'subline', changes: { opacity: index / 20 } }], summary: `批次 ${index}`, createdAt: new Date().toISOString() };
			useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId: 'request-live', runId: 'run-live', sequence: index, emittedAt: Date.now(), operationId: transaction.transactionId, revisionId: 'draft-run-live', draftRevisionId: 'draft-run-live', operationIndex: index, pageId: 'canvas', summary: transaction.summary, transaction, affectedNodeIds: ['subline'], isDraft: true });
		}
		const beforeDuplicate = useDesignStore.getState().getRenderScene().revision;
		const duplicate = { transactionId: 'burst-20', baseRevision: beforeDuplicate, source: 'ai' as const, operations: [{ op: 'update_node' as const, nodeId: 'subline', changes: { opacity: 0.01 } }], summary: '重复批次', createdAt: new Date().toISOString() };
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId: 'request-live', runId: 'run-live', sequence: 21, emittedAt: Date.now(), operationId: 'burst-20', revisionId: 'draft-run-live', draftRevisionId: 'draft-run-live', operationIndex: 21, pageId: 'canvas', summary: duplicate.summary, transaction: duplicate, affectedNodeIds: ['subline'], isDraft: true });
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId: 'old-request', runId: 'old-run', sequence: 22, emittedAt: Date.now(), operationId: 'old-op', revisionId: 'draft-old', draftRevisionId: 'draft-old', operationIndex: 22, pageId: 'canvas', summary: '旧任务', transaction: { ...duplicate, transactionId: 'old-op', baseRevision: beforeDuplicate }, affectedNodeIds: ['subline'], isDraft: true });
		const state = useDesignStore.getState();
		expect(state.getRenderScene().nodes.subline).toMatchObject({ opacity: 1 });
		expect(state.getRenderScene().revision).toBe(firstNode ? current.document.canvas!.revision + 20 : beforeDuplicate);
		expect(state.execution.sequence).toBe(20);
		expect(state.draft?.lastPatchNodeIds).toEqual(['subline']);
	});

	it('Canvas transaction 事件只更新受影响节点，不再通过文件清单派生页面', () => {
		const current = useDesignStore.getState().snapshot;
		const transaction = { transactionId: 'op-pages', baseRevision: current.document.canvas!.revision, source: 'ai' as const, operations: [{ op: 'update_node' as const, nodeId: 'headline', changes: { name: '登录页标题' } }], summary: '更新登录页标题', createdAt: new Date().toISOString() };
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), operationId: 'op-pages', revisionId: 'draft-pages', pageId: 'page-home', summary: '更新登录页标题', transaction, affectedNodeIds: ['headline'], isDraft: true });

		const node = useDesignStore.getState().snapshot.document.canvas?.nodes.headline;
		expect(node?.name).toBe('登录页标题');
		expect(useDesignStore.getState().snapshot.files).toEqual([]);
	});

	it('Canvas delete transaction 会删除节点子树，不操作文件路径', () => {
		const current = useDesignStore.getState().snapshot;
		const transaction = { transactionId: 'op-remove', baseRevision: current.document.canvas!.revision, source: 'ai' as const, operations: [{ op: 'delete_node' as const, nodeId: 'decorative-path' }], summary: '移除装饰路径', createdAt: new Date().toISOString() };
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), operationId: 'op-remove', revisionId: 'draft-remove', pageId: 'page-home', summary: '移除装饰路径', transaction, affectedNodeIds: ['decorative-path'], isDraft: true });

		expect(useDesignStore.getState().snapshot.document.canvas?.nodes['decorative-path']).toBeUndefined();
		expect(useDesignStore.getState().snapshot.files).toEqual([]);
	});

	it('查看历史修订不改变当前快照，回滚后写入新的当前修订', async () => {
		const current = useDesignStore.getState().snapshot;
		const historicalCanvas = structuredClone(current.document.canvas!);
		historicalCanvas.nodes.headline.text = { ...historicalCanvas.nodes.headline.text!, text: '历史页面' };
		const historical = {
			...current,
			document: {
				...current.document,
				version: Math.max(1, current.document.version - 1),
				canvas: historicalCanvas,
				revisions: [...current.document.revisions, { id: 'rev-history', prompt: '历史需求', summary: '历史版本', createdAt: '2026-08-16T12:00:00.000Z', kind: 'patch' as const }],
			},
		files: [],
		};
		const reverted = {
			...historical,
			document: {
				...historical.document,
				version: current.document.version + 1,
				revisions: [...historical.document.revisions, {
					id: 'rev-rollback', prompt: '回滚 rev-history', summary: '从历史修订恢复', createdAt: '2026-08-16T12:01:00.000Z',
					kind: 'rollback' as const, parentRevisionId: current.document.revisions.at(-1)?.id, sourceRevisionId: 'rev-history',
				}],
			},
		};
		vi.spyOn(rpc, 'designGetRevision').mockResolvedValue({
			id: 'history', type: 'response', command: 'design_get_revision', success: true,
			data: { designId, revisionId: 'rev-history', snapshot: { document: historical.document as unknown as Record<string, unknown>, files: [], context: historical.context } },
		} as never);
		vi.spyOn(rpc, 'designRevert').mockResolvedValue({
			id: 'revert', type: 'response', command: 'design_revert', success: true,
			data: { designId, revisionId: 'rev-rollback', snapshot: { document: reverted.document as unknown as Record<string, unknown>, files: [], context: reverted.context } },
		} as never);

		const inspected = await useDesignStore.getState().getRevision('rev-history');
		expect(inspected.document.canvas?.nodes.headline.text?.text).toBe('历史页面');
		expect(useDesignStore.getState().snapshot.document.canvas?.nodes.headline.text?.text).toContain('默认测试标题');
		expect(rpc.designGetRevision).toHaveBeenCalledWith('project-test', designId, 'rev-history');

		await useDesignStore.getState().revertToRevision('rev-history');
		expect(rpc.designRevert).toHaveBeenCalledWith('project-test', designId, 'rev-history');
		expect(useDesignStore.getState()).toMatchObject({ activeTab: 'preview', selectedElementId: null, snapshot: { document: { version: current.document.version + 1 } } });
		expect(useDesignStore.getState().snapshot.document.revisions.at(-1)).toMatchObject({ id: 'rev-rollback', kind: 'rollback', sourceRevisionId: 'rev-history' });
	});

	it('上传指定修订只更新对应远端记录，并覆盖重复上传结果', async () => {
		const upload = vi.spyOn(rpc, 'designUpload')
			.mockResolvedValueOnce({
				id: 'upload-1', type: 'response', command: 'design_upload', success: true,
				data: { upload: { projectId: 9, designId, revisionId: 'rev-history', versionId: 42, versionNumber: 3, status: 'DRAFT', createdAt: '2026-08-16T12:00:00.000Z' } },
			} as never)
			.mockResolvedValueOnce({
				id: 'upload-2', type: 'response', command: 'design_upload', success: true,
				data: { upload: { projectId: 9, designId, revisionId: 'rev-history', versionId: 42, versionNumber: 3, status: 'DRAFT', createdAt: '2026-08-16T12:00:00.000Z' } },
			} as never);

		await useDesignStore.getState().uploadRevision({ revisionId: 'rev-history', platformProjectId: 9, title: '登录页', summary: '首次上传', previewPng: 'data:image/png;base64,aGVsbG8=' });
		await useDesignStore.getState().uploadRevision({ revisionId: 'rev-history', platformProjectId: 9, title: '登录页', summary: '网络重试', previewPng: 'data:image/png;base64,aGVsbG8=' });

		expect(upload).toHaveBeenNthCalledWith(1, { projectPath: 'project-test', designId, revisionId: 'rev-history', platformProjectId: 9, title: '登录页', summary: '首次上传', previewPng: 'data:image/png;base64,aGVsbG8=' });
		expect(useDesignStore.getState().uploadRecords).toEqual([{ projectId: 9, revisionId: 'rev-history', versionId: 42, versionNumber: 3, status: 'DRAFT', uploadedAt: '2026-08-16T12:00:00.000Z' }]);
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
		useDesignStore.setState({ isGenerating: true, execution: { status: 'running', phase: 'tool', runId, requestId, sequence: 2, thinking: '', steps: [] }, queuedPrompts: [{ id: 'q1', text: '未执行' }], messages: [{ id: 'm0', kind: 'assistant', text: '历史回复' }, { id: 'q1', kind: 'user', text: '未执行', status: 'queued' }] });
		await useDesignStore.getState().stop();
		expect(useDesignStore.getState().queuedPrompts).toEqual([]);
		expect(useDesignStore.getState().execution.status).toBe('stopped');
		expect(useDesignStore.getState().messages.find((message) => message.id === 'q1')).toMatchObject({ status: 'cancelled' });
	});
});

describe('Design 审批与澄清事件防丢失', () => {
	beforeEach(() => { resetStore(); });

	it('审批事件在终态下仍被放行，让用户能看到卡片并响应', async () => {
		vi.spyOn(rpc, 'designPrompt').mockResolvedValue({ id: 'prompt', type: 'response', command: 'design_prompt', success: true, data: { requestId, runId } } as never);
		await useDesignStore.getState().sendPrompt('重构首页布局');
		// 先让运行进入 completed 终态（模拟竞态：settled 事件先到）
		const currentRpcFiles = useDesignStore.getState().snapshot.files.map((file) => ({ path: file.path, language: file.language, content: file.content ?? '' }));
		useDesignStore.getState().applyStreamEvent({ type: 'design_run_settled', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), snapshot: { document: useDesignStore.getState().snapshot.document as unknown as Record<string, unknown>, files: currentRpcFiles } });
		expect(useDesignStore.getState().execution.status).toBe('completed');
		// 此时再发审批事件——修复前会被 design.ts 终态守卫丢弃，导致用户永远看不到审批卡片、后端 Promise 永久挂起。
		useDesignStore.getState().applyStreamEvent({ type: 'design_approval_required', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 2, emittedAt: Date.now(), approvalId: 'approval-1', pageId: 'home', patch: { baseRevisionId: 'rev-1', operations: [{ op: 'update_node', nodeId: 'frame-home', changes: { name: '新版首页' } }] }, reason: '高风险整页替换' });
		// 修复后：审批事件被放行，pendingApproval 被写入，status 从 completed 回到 awaiting_approval。
		expect(useDesignStore.getState()).toMatchObject({ pendingApproval: { approvalId: 'approval-1', reason: '高风险整页替换' }, execution: { status: 'awaiting_approval', phase: 'awaiting_approval' } });
		// 用户点击“继续”后，审批响应应被发出且状态恢复 running。
		const approvalResponse = vi.spyOn(rpc, 'designApprovalResponse').mockResolvedValue({ id: 'resp', type: 'response', command: 'design_approval_response', success: true } as never);
		await useDesignStore.getState().approve(true);
		expect(approvalResponse).toHaveBeenCalledWith('project-test', designId, 'approval-1', true);
		expect(useDesignStore.getState()).toMatchObject({ pendingApproval: null, execution: { status: 'running', phase: 'thinking' } });
	});

	it('澄清事件在终态下仍被放行，避免后端 Promise 永久悬挂', async () => {
		vi.spyOn(rpc, 'designPrompt').mockResolvedValue({ id: 'prompt', type: 'response', command: 'design_prompt', success: true, data: { requestId, runId } } as never);
		await useDesignStore.getState().sendPrompt('设计仪表盘');
		// 先让运行进入 failed 终态（模拟竞态：error 事件先到）
		useDesignStore.getState().applyStreamEvent({ type: 'design_error', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), error: '前置错误' });
		expect(useDesignStore.getState().execution.status).toBe('failed');
		// 此时再发澄清事件——修复前会被终态守卫丢弃，用户永远看不到澄清卡片。
		useDesignStore.getState().applyStreamEvent({ type: 'design_clarification_required', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 2, emittedAt: Date.now(), clarificationId: 'clarification-1', question: '目标设备是桌面还是移动端？', context: '影响布局断点。', options: ['桌面', '移动端'] });
		// 修复后：澄清事件被放行，pendingClarification 被写入，status 回到 awaiting_clarification。
		expect(useDesignStore.getState()).toMatchObject({ pendingClarification: { clarificationId: 'clarification-1', question: '目标设备是桌面还是移动端？' }, execution: { status: 'awaiting_clarification', phase: 'awaiting_clarification' } });
	});

	it('approve 在 RPC 响应失败时保留 pendingApproval 以供重试', async () => {
		vi.spyOn(rpc, 'designPrompt').mockResolvedValue({ id: 'prompt', type: 'response', command: 'design_prompt', success: true, data: { requestId, runId } } as never);
		await useDesignStore.getState().sendPrompt('替换首页配色');
		useDesignStore.getState().applyStreamEvent({ type: 'design_approval_required', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), approvalId: 'approval-2', pageId: 'home', patch: { baseRevisionId: 'rev-1', operations: [{ op: 'update_node', nodeId: 'frame-home', changes: { name: '新版首页' } }] }, reason: '高风险修改' });
		expect(useDesignStore.getState().pendingApproval).not.toBeNull();
		// 模拟 sidecar 返回失败（例如 approval 已超时被清理）
		vi.spyOn(rpc, 'designApprovalResponse').mockResolvedValue({ id: 'resp', type: 'response', command: 'design_approval_response', success: false, error: 'Design 审批请求已过期' } as never);
		await useDesignStore.getState().approve(true);
		// 修复后：失败时不清 pendingApproval，让用户能重新点击；error 被写入。
		expect(useDesignStore.getState().pendingApproval).toMatchObject({ approvalId: 'approval-2' });
		expect(useDesignStore.getState().error).toBe('Design 审批请求已过期');
	});

	it('审批等待超时或错误收口时清理审批卡片', () => {
		useDesignStore.setState({
			pendingApproval: { approvalId: 'approval-error', reason: '已失效', patch: { baseRevisionId: 'rev-1', operations: [] } },
			execution: { status: 'awaiting_approval', phase: 'awaiting_approval', runId, requestId, sequence: 0, thinking: '', steps: [] },
		});

		useDesignStore.getState().applyStreamEvent({ type: 'design_error', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), error: 'Design 审批等待超时，任务已停止' });

		expect(useDesignStore.getState()).toMatchObject({ pendingApproval: null, pendingClarification: null, isGenerating: false, execution: { status: 'failed' } });
	});
});
