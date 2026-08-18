import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProjectGuidelines, createDemoSnapshot, DESIGN_TARGETS, DESIGN_VIEWPORT_PRESETS, type DesignPreset } from '@/src/design/design-types';
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

function presetFixture(): DesignPreset {
	const guidelines = createDefaultProjectGuidelines();
	return {
		id: 'neutral-modern', title: 'Neutral Modern', description: '测试预设', entryFile: 'index.html', viewports: [{ id: 'desktop', label: 'Desktop', width: 1440, height: 900 }],
		tokens: { colors: { bg: '#ffffff', accent: '#2f6feb' }, typography: { body: 'system-ui' }, spacing: {}, radius: {}, shadows: {} },
		handoff: { brandDescription: '克制、清晰', componentRules: ['按钮保留焦点状态'], layoutRules: ['保留内容边界'], responsiveRules: ['小屏折叠导航'], agentPromptGuide: ['优先遵循 Token'] },
		handoffMarkdown: '## 组件规则\n\n- 按钮保留焦点状态',
		guidelines: { ...guidelines, brand: { name: 'Neutral Modern', tone: '克制、清晰' }, tokens: { ...guidelines.tokens, colors: { bg: '#ffffff', accent: '#2f6feb' }, typography: { body: 'system-ui' } }, components: { button: '按钮保留焦点状态' }, rules: ['保留内容边界', '小屏折叠导航'], updatedAt: new Date().toISOString() },
		previewHtml: '<main>Neutral Modern</main>', license: 'unknown', warnings: [],
	};
}

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
		previewMode: 'original',
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
		selectedPresetId: null,
		pendingPreset: null,
		intake: null,
		todos: [],
		uploadRecords: [],
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

	it('persists the preview display mode in the current project bucket', () => {
		useDesignStore.getState().setPreviewMode('browser');
		expect(useDesignStore.getState().previewMode).toBe('browser');
		expect(JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}').previewMode).toBe('browser');
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

	it('首次需求先进入确认卡，确认后才启动 Pi Design 运行', async () => {
		const current = useDesignStore.getState().snapshot;
		vi.spyOn(rpc, 'designCreate').mockResolvedValue({
			id: 'create', type: 'response', command: 'design_create', success: true,
			data: { designId, snapshot: { document: current.document as unknown as Record<string, unknown>, files: current.files, context: { projectId: 'project-test', projectPath: 'project-test', designId } } },
		} as never);
		const prompt = vi.spyOn(rpc, 'designPrompt').mockResolvedValue({ id: 'prompt', type: 'response', command: 'design_prompt', success: true, data: { requestId, runId } } as never);

		await useDesignStore.getState().startProject('设计一个登录页');

		expect(useDesignStore.getState()).toMatchObject({ isProjectStarted: true, error: null, intake: { status: 'pending', step: 0, sourcePrompt: '设计一个登录页' } });
		expect(useDesignStore.getState().todos[0]).toMatchObject({ id: 'direction', state: 'active' });
		expect(prompt).not.toHaveBeenCalled();

		useDesignStore.getState().updateIntakeAnswers({ productType: '面向客户的产品页面', visualTone: 'Editorial light', layout: '居中单焦点内容' });
		await useDesignStore.getState().confirmIntake();

		expect(useDesignStore.getState().messages.at(-1)).toMatchObject({ kind: 'user', text: '设计一个登录页', status: 'sent' });
		expect(useDesignStore.getState().todos.slice(0, 2)).toMatchObject([{ id: 'direction', state: 'done' }, { id: 'structure', state: 'active' }]);
		expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining('"visualTone": "Editorial light"') }));

		const files = useDesignStore.getState().snapshot.files.map((file) => ({ path: file.path, language: file.language, content: file.content ?? '' }));
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), operationId: 'intake-patch', revisionId: 'rev-intake', pageId: 'home', summary: '完成页面骨架', files });
		expect(useDesignStore.getState().todos.slice(0, 3)).toMatchObject([{ state: 'done' }, { state: 'done' }, { state: 'active' }]);
		const persisted = JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}');
		expect(persisted.intake).toMatchObject({ status: 'confirmed', answers: { visualTone: 'Editorial light' } });
		expect(persisted.todos[0]).toMatchObject({ id: 'direction', state: 'done' });
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
		useDesignStore.getState().updateIntakeAnswers({ productType: '品牌或营销页面', visualTone: 'Cinematic dark', layout: '沉浸式全屏叙事' });
		await useDesignStore.getState().confirmIntake();

		expect(calls).toEqual(['create', 'guidelines', 'prompt']);
		expect(useDesignStore.getState()).toMatchObject({ selectedPresetId: 'neutral-modern', pendingPreset: null, snapshot: { guidelines: { brand: { name: 'Neutral Modern' } } } });
	});

	it('已有工作区选择预设会立即保存规范并写回项目 bucket', async () => {
		const current = useDesignStore.getState().snapshot;
		const preset = presetFixture();
		useDesignStore.setState({ hasWorkspace: true, isProjectStarted: true });
		vi.spyOn(rpc, 'designSaveGuidelines').mockImplementation(async (_path, _id, guidelines) => ({ id: 'save-guidelines', type: 'response', command: 'design_save_guidelines', success: true, data: { designId, snapshot: { document: current.document as unknown as Record<string, unknown>, files: current.files, context: { projectId: 'project-test', projectPath: 'project-test', designId }, guidelines } } } as never));

		await useDesignStore.getState().applyPreset(preset);

		expect(rpc.designSaveGuidelines).toHaveBeenCalledWith('project-test', designId, expect.objectContaining({ brand: expect.objectContaining({ name: 'Neutral Modern' }) }));
		expect(useDesignStore.getState()).toMatchObject({ selectedPresetId: 'neutral-modern', pendingPreset: null, snapshot: { guidelines: { tokens: { colors: { accent: '#2f6feb' } } } } });
		expect(JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}')).toMatchObject({ selectedPresetId: 'neutral-modern', snapshot: { guidelines: { brand: { name: 'Neutral Modern' } } } });
	});

	it('sidecar 确认工作区已不存在时清理过期缓存，预设改为等待首次创建', async () => {
		writeWorkspace('project-test');
		useDesignStore.setState({ hasWorkspace: true, isProjectStarted: true });
		vi.spyOn(rpc, 'designOpen').mockResolvedValue({ id: 'open', type: 'response', command: 'design_open', success: false, error: '当前项目还没有 Design 工作区' });
		vi.spyOn(rpc, 'designSaveGuidelines');

		await useDesignStore.getState().hydrateSnapshot();
		expect(useDesignStore.getState()).toMatchObject({ hasWorkspace: false, isProjectStarted: false });

		await useDesignStore.getState().applyPreset(presetFixture());
		expect(useDesignStore.getState()).toMatchObject({ selectedPresetId: 'neutral-modern', pendingPreset: { id: 'neutral-modern' } });
		expect(rpc.designSaveGuidelines).not.toHaveBeenCalled();
		expect(JSON.parse(localStorage.getItem(bucketKey('project-test')) ?? '{}')).toMatchObject({ hasWorkspace: false, isProjectStarted: false });
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
		useDesignStore.getState().updateIntakeAnswers({ productType: '业务管理工作台', visualTone: 'Quiet utility', layout: '模块化工作台' });
		await useDesignStore.getState().confirmIntake();

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

	it('patch 事件返回多个页面文件时同步更新右侧页面树', () => {
		const current = useDesignStore.getState().snapshot;
		const files = [
			...current.files,
			{ id: 'qcc-login-index', path: 'pages/qcc-login/index.html', language: 'html' as const, content: '<main />' },
			{ id: 'qcc-login-css', path: 'pages/qcc-login/styles.css', language: 'css' as const, content: '.login{}' },
		];
		useDesignStore.getState().applyStreamEvent({ type: 'design_patch_applied', projectId: 'project-test', projectPath: 'project-test', designId, requestId, runId, sequence: 1, emittedAt: Date.now(), operationId: 'op-pages', revisionId: 'rev-pages', pageId: 'home', summary: '创建登录页', files });

		const page = useDesignStore.getState().snapshot.document.pages.find((item) => item.id === 'qcc-login');
		expect(page).toMatchObject({ name: 'qcc-login', route: '/qcc-login', entryFileId: 'qcc-login-index', fileIds: ['qcc-login-index', 'qcc-login-css'] });
	});

	it('查看历史修订不改变当前快照，回滚后写入新的当前修订', async () => {
		const current = useDesignStore.getState().snapshot;
		const historical = {
			...current,
			files: current.files.map((file, index) => index === 0 ? { ...file, content: '<main>历史页面</main>' } : file),
			document: {
				...current.document,
				version: Math.max(1, current.document.version - 1),
				revisions: [...current.document.revisions, { id: 'rev-history', prompt: '历史需求', summary: '历史版本', createdAt: '2026-08-16T12:00:00.000Z', kind: 'patch' as const }],
			},
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
			data: { designId, revisionId: 'rev-history', snapshot: { document: historical.document as unknown as Record<string, unknown>, files: historical.files, context: historical.context } },
		} as never);
		vi.spyOn(rpc, 'designRevert').mockResolvedValue({
			id: 'revert', type: 'response', command: 'design_revert', success: true,
			data: { designId, revisionId: 'rev-rollback', snapshot: { document: reverted.document as unknown as Record<string, unknown>, files: reverted.files, context: reverted.context } },
		} as never);

		const inspected = await useDesignStore.getState().getRevision('rev-history');
		expect(inspected.files[0].content).toBe('<main>历史页面</main>');
		expect(useDesignStore.getState().snapshot.files[0].content).toBe(current.files[0].content);
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

		await useDesignStore.getState().uploadRevision({ revisionId: 'rev-history', platformProjectId: 9, title: '登录页', summary: '首次上传' });
		await useDesignStore.getState().uploadRevision({ revisionId: 'rev-history', platformProjectId: 9, title: '登录页', summary: '网络重试' });

		expect(upload).toHaveBeenNthCalledWith(1, { projectPath: 'project-test', designId, revisionId: 'rev-history', platformProjectId: 9, title: '登录页', summary: '首次上传' });
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
		useDesignStore.setState({ isGenerating: true, execution: { status: 'running', phase: 'tool', runId, requestId, sequence: 2, thinking: '', steps: [] }, queuedPrompts: [{ id: 'q1', text: '未执行' }], messages: [{ id: 'welcome', kind: 'assistant', text: 'welcome' }, { id: 'q1', kind: 'user', text: '未执行', status: 'queued' }] });
		await useDesignStore.getState().stop();
		expect(useDesignStore.getState().queuedPrompts).toEqual([]);
		expect(useDesignStore.getState().execution.status).toBe('stopped');
		expect(useDesignStore.getState().messages.find((message) => message.id === 'q1')).toMatchObject({ status: 'cancelled' });
	});
});
