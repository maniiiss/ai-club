/**
 * Tauri IPC 桥接层。
 *
 * 设计：response（带 id 的命令响应）通过 invoke 直接返回（Rust 等待对应 id 的 stdout），
 * 不依赖 Tauri event listen 时序；agent 事件流 / extension UI 请求走 rpc:event。
 *
 * 设计参考：docs/design-docs/gitpilot-desktop-technical-design-v1.md 第 5、6 节。
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { createDemoSnapshot } from '@/src/design/design-types';
import type {
	AgentSessionEvent,
	AttachmentInput,
	ImageContent,
	PreparedAttachment,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcResponse,
	DesignProjectGuidelines,
	DesignRpcSnapshot,
	DesignStreamLine,
	RpcSessionState,
	RpcStreamLine,
	ThinkingLevel,
} from './types';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let cmdSeq = 0;
const DEFAULT_TIMEOUT_MS = 30_000;

// ============================================================================
// 事件订阅
// ============================================================================

type EventCb = (e: AgentSessionEvent) => void;
type DesignEventCb = (e: DesignStreamLine) => void;
type ExtensionUICb = (req: RpcExtensionUIRequest) => void;
type ErrorCb = (msg: string) => void;
type LifecycleCb = () => void;

const eventCbs = new Set<EventCb>();
const designEventCbs = new Set<DesignEventCb>();
const extUICbs = new Set<ExtensionUICb>();
const errorCbs = new Set<ErrorCb>();
const readyCbs = new Set<LifecycleCb>();
const disconnectCbs = new Set<LifecycleCb>();

let unlisten: UnlistenFn | null = null;
let mockTimer: ReturnType<typeof setInterval> | null = null;
// Mock 模式下跟踪用户选择的思考级别，使非 Tauri 预览也能反映切换结果。
let mockThinkingLevel: ThinkingLevel = 'off';
let mockDesignSnapshot: DesignRpcSnapshot | null = null;

function createMockDesignSnapshot(designId: string, name = 'GitPilot Design'): DesignRpcSnapshot {
	const base = createDemoSnapshot();
	const files = base.files.map((file) => ({ id: file.id, path: file.path, scope: file.scope, language: file.language, content: file.content ?? '', hash: file.hash }));
	const projectPath = 'mock-project';
	return {
		document: {
			...base.document,
			id: designId,
			name,
			pages: base.document.pages.map((page) => ({ ...page, files: undefined })),
		},
		files,
		context: { projectId: encodeURIComponent(projectPath), projectPath, designId },
	};
}

/** 将 sidecar 错误收敛为可读提示，避免模型上下文或原始 JSON 撑满桌面界面。 */
export function normalizeSidecarError(raw: string): string {
	const message = raw.trim();
	if (!message) return 'GitPilot 发生错误，请重试。';
	if (message.startsWith('{') && message.includes('"type"')) {
		return 'GitPilot 返回了无法识别的输出。请重试；若持续出现，请重新启动应用。';
	}
	if (message.length > 240) return `${message.slice(0, 220)}…`;
	return message;
}

/** 分流 sidecar 输出的一行 JSONL（仅处理非 response：agent 事件 / extension UI / error）。 */
function dispatchLine(line: RpcStreamLine): void {
	if (line.type === 'extension_ui_request') {
		extUICbs.forEach((cb) => cb(line as RpcExtensionUIRequest));
		return;
	}
	if (line.type === 'rpc:error' || line.type === 'error') {
		const raw = (line as { message?: string; error?: string }).message ?? (line as { error?: string }).error ?? '未知错误';
		errorCbs.forEach((cb) => cb(normalizeSidecarError(raw)));
		return;
	}
	// Design 是独立 Agent 会话；在桥接层截断事件，避免 Code reducer 或执行中心
	// 将 Design 的 message/tool/settled 误认为当前 Code 会话的执行事件。
	if (line.type.startsWith('design_')) {
		designEventCbs.forEach((cb) => cb(line as unknown as DesignStreamLine));
		return;
	}
	// agent 事件流
	eventCbs.forEach((cb) => cb(line as AgentSessionEvent));
}

// ============================================================================
// 初始化
// ============================================================================

/** 初始化桥接：注册事件监听。response 不依赖监听，故 fire-and-forget 不阻塞 connect。 */
export async function initBridge(): Promise<void> {
	if (!isTauri) {
		startMock();
		return;
	}
	void listen('rpc:ready', () => readyCbs.forEach((cb) => cb())).catch((e) => console.error('[bridge] listen rpc:ready failed', e));
	void listen('rpc:disconnect', () => disconnectCbs.forEach((cb) => cb())).catch(() => {});
	void listen('rpc:event', (e) => dispatchLine(e.payload as RpcStreamLine))
		.then((u) => {
			unlisten = u;
		})
		.catch((e) => console.error('[bridge] listen rpc:event failed', e));
}

export async function destroyBridge(): Promise<void> {
	if (unlisten) {
		await unlisten();
		unlisten = null;
	}
	if (mockTimer) {
		clearInterval(mockTimer);
		mockTimer = null;
	}
}

// ============================================================================
// 发命令（invoke 直接返回 response）
// ============================================================================

/** 发送一条 RPC 命令并通过 invoke 等待 sidecar 对应 id 的响应。 */
export function send<C extends RpcCommand>(cmd: C, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RpcResponse> {
	// extension_ui_response 等命令携带 sidecar 生成的原始 id（如 select 请求的 UUID），
	// 必须保留原 id，否则 sidecar 的 pendingExtensionRequests 无法匹配，扩展命令会永久挂起
	const id = (cmd as { id?: string }).id ?? String(++cmdSeq);
	const cmdWithId = { ...cmd, id } as RpcCommand & { id: string };

	return new Promise<RpcResponse>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`RPC 命令超时: ${cmd.type}`)), timeoutMs);

		if (!isTauri) {
			setTimeout(() => {
				clearTimeout(timer);
				resolve(mockResponseFor(cmdWithId));
			}, 10);
			return;
		}

		invoke<RpcResponse>('rpc_send', { command: cmdWithId })
			.then((resp) => {
				clearTimeout(timer);
				resolve(resp);
			})
			.catch((err: unknown) => {
				clearTimeout(timer);
				reject(err instanceof Error ? err : new Error(String(err)));
			});
	});
}

// ============================================================================
// 便捷命令封装
// ============================================================================

export const rpc = {
	prompt: (message: string, images?: ImageContent[]) => send({ type: 'prompt', message, images }),
	steer: (message: string, images?: ImageContent[]) => send({ type: 'steer', message, images }),
	followUp: (message: string, images?: ImageContent[]) => send({ type: 'follow_up', message, images }),
	abort: (clearQueue = false) => send({ type: 'abort', clearQueue }),
	prepareAttachments: (items: AttachmentInput[]) => send({ type: 'prepare_attachments', items }),
	newWorkSession: (taskId: string) => send({ type: 'new_work_session', taskId }),
	workPrompt: (payload: { taskId: string; message: string }) => send({ type: 'work_prompt', ...payload }, 120_000),
	workAbort: (requestId?: string) => send({ type: 'work_abort', requestId }),
	workFileList: (taskId: string) => send({ type: 'work_file_list', taskId }),
	workFileRead: (taskId: string, path: string) => send({ type: 'work_file_read', taskId, path }),
	workFileWrite: (taskId: string, path: string, content: string) => send({ type: 'work_file_write', taskId, path, content }),
	workFileDelete: (taskId: string, path: string) => send({ type: 'work_file_delete', taskId, path }),
	workFileRename: (taskId: string, path: string, newPath: string) => send({ type: 'work_file_rename', taskId, path, newPath }),
	workPrepareAttachments: (items: AttachmentInput[]) => send({ type: 'work_prepare_attachments', items }),
	designOpen: (projectPath: string) => send({ type: 'design_open', projectPath }),
	designSaveGuidelines: (projectPath: string, designId: string, guidelines: DesignProjectGuidelines) => send({ type: 'design_save_guidelines', projectPath, designId, guidelines }),
	designCreate: (projectPath: string, name?: string) => send({ type: 'design_create', projectPath, name }),
	designGetSnapshot: (projectPath: string, designId: string) => send({ type: 'design_get_snapshot', projectPath, designId }),
	designGetRevision: (projectPath: string, designId: string, revisionId: string) => send({ type: 'design_get_revision', projectPath, designId, revisionId }),
	designPrompt: (payload: { projectPath: string; designId: string; pageId: string; prompt: string; baseRevisionId?: string; targetProfiles: Array<'mobile' | 'tablet' | 'desktop'> }) => send({ type: 'design_prompt', ...payload }),
	designFollowUp: (projectPath: string, designId: string, message: string) => send({ type: 'design_follow_up', projectPath, designId, message }),
	designAbort: (projectPath: string, designId: string) => send({ type: 'design_abort', projectPath, designId }),
	designApplyPatch: (payload: { projectPath: string; designId: string; pageId: string; baseRevisionId: string; patch: Record<string, unknown> }) => send({ type: 'design_apply_patch', ...payload }),
	designApprovalResponse: (projectPath: string, designId: string, approvalId: string, approved: boolean) => send({ type: 'design_approval_response', projectPath, designId, approvalId, approved }),
	// Design 生成需要等待模型返回完整的三文件结构化结果，给本地模型和首次冷启动留出足够时间。
	designGenerate: (payload: { projectPath: string; designId: string; pageId: string; prompt: string; baseRevisionId?: string; targetProfiles: Array<'mobile' | 'tablet' | 'desktop'> }) => send({ type: 'design_generate', ...payload }, 150_000),
	designPreview: (projectPath: string, designId: string, pageId: string, revisionId?: string) => send({ type: 'design_preview', projectPath, designId, pageId, revisionId }),
	designCheck: (projectPath: string, designId: string, pageId: string, revisionId?: string) => send({ type: 'design_check', projectPath, designId, pageId, revisionId }),
	designRevert: (projectPath: string, designId: string, revisionId: string) => send({ type: 'design_revert', projectPath, designId, revisionId }),
	designUpload: (payload: { projectPath: string; designId: string; revisionId: string; platformProjectId: number; title?: string; summary?: string }) => send({ type: 'design_upload', ...payload }, 90_000),
	designExport: (projectPath: string, designId: string, outputPath?: string) => send({ type: 'design_export', projectPath, designId, outputPath }),
	mcpList: () => send({ type: 'mcp_list' }),
	mcpSaveServer: (name: string, definition: Record<string, unknown>, modes: Array<'code' | 'work' | 'design'>) => send({ type: 'mcp_save_server', name, definition, modes }),
	mcpDeleteServer: (name: string) => send({ type: 'mcp_delete_server', name }),
	mcpSetModes: (name: string, modes: Array<'code' | 'work' | 'design'>) => send({ type: 'mcp_set_modes', name, modes }),
	mcpSetEnabled: (name: string, enabled: boolean) => send({ type: 'mcp_set_enabled', name, enabled }),
	mcpReload: () => send({ type: 'mcp_reload' }),
	newSession: (cwd?: string, parentSession?: string) => send({ type: 'new_session', cwd, parentSession }),
	getState: () => send({ type: 'get_state' }),
	setModel: (provider: string, modelId: string) => send({ type: 'set_model', provider, modelId }),
	cycleModel: () => send({ type: 'cycle_model' }),
	getAvailableModels: () => send({ type: 'get_available_models' }),
	setThinkingLevel: (level: RpcSessionState['thinkingLevel']) => send({ type: 'set_thinking_level', level }),
	getAvailableThinkingLevels: () => send({ type: 'get_available_thinking_levels' }),
	getTree: () => send({ type: 'get_tree' }),
	listSessions: (scope?: 'current' | 'all') => send({ type: 'list_sessions', scope }),
	getMessages: () => send({ type: 'get_messages' }),
	switchSession: (sessionPath: string) => send({ type: 'switch_session', sessionPath }),
	/** 原子取得当前会话状态、消息与执行快照，供启动/重连/刷新使用（设计文档 §8.3）。 */
	getSessionSnapshot: () => send({ type: 'get_session_snapshot' }),
	setSessionName: (name: string) => send({ type: 'set_session_name', name }),
	exportHtml: (outputPath?: string) => send({ type: 'export_html', outputPath }),
	getCommands: () => send({ type: 'get_commands' }),
	executeCommand: (name: string, args?: string) => send({ type: 'execute_command', name, args }),
	setToken: (platformUrl: string, token: string) => send({ type: 'set_token', platformUrl, token }),
	getPlatformAccount: () => send({ type: 'get_platform_account' }),
	getPlatformConnection: () => send({ type: 'get_platform_connection' }),
	/** 查询当前账号可访问的 Web 端项目，供 Design 入口建立请求上下文。 */
	getPlatformProjects: (keyword?: string) => send({ type: 'get_platform_projects', keyword }),
	/** 查询当前账号负责的工作项，供输入框“工作项”页签展示。 */
	getPlatformWorkItems: () => send({ type: 'get_platform_work_items' }),
	logout: () => send({ type: 'logout' }),
	respondValue: (id: string, value: string) => send({ type: 'extension_ui_response', id, value }),
	respondConfirmed: (id: string, confirmed: boolean) => send({ type: 'extension_ui_response', id, confirmed }),
	respondCancelled: (id: string) => send({ type: 'extension_ui_response', id, cancelled: true }),
};

// ============================================================================
// 事件订阅 API
// ============================================================================

export function onEvent(cb: EventCb): () => void {
	eventCbs.add(cb);
	return () => eventCbs.delete(cb);
}
export function onDesignEvent(cb: DesignEventCb): () => void {
	designEventCbs.add(cb);
	return () => designEventCbs.delete(cb);
}
export function onExtensionUI(cb: ExtensionUICb): () => void {
	extUICbs.add(cb);
	return () => extUICbs.delete(cb);
}
export function onError(cb: ErrorCb): () => void {
	errorCbs.add(cb);
	return () => errorCbs.delete(cb);
}
export function onReady(cb: LifecycleCb): () => void {
	readyCbs.add(cb);
	return () => readyCbs.delete(cb);
}
export function onDisconnect(cb: LifecycleCb): () => void {
	disconnectCbs.add(cb);
	return () => disconnectCbs.delete(cb);
}
export function isTauriEnv(): boolean {
	return isTauri;
}

/** 获取独立任务的 GitPilot 工作区根目录；该路径由原生层解析，避免依赖 WebView 当前页面地址。 */
export async function getGitPilotRoot(): Promise<string> {
	if (!isTauri) return '';
	return invoke<string>('gitpilot_root');
}

// ============================================================================
// Mock 模式（非 Tauri 环境下预览 UI 用）
// ============================================================================

function mockResponseFor(cmd: RpcCommand & { id: string }): RpcResponse {
	const id = cmd.id;
	const designContext = 'designId' in cmd ? { projectId: encodeURIComponent(cmd.projectPath), projectPath: cmd.projectPath, designId: cmd.designId } : undefined;
	switch (cmd.type) {
		case 'design_open': {
			const designId = `design-mock-${encodeURIComponent(cmd.projectPath)}`;
			const snapshot = createMockDesignSnapshot(designId, 'GitPilot Design');
			mockDesignSnapshot = snapshot;
			return { id, type: 'response', command: 'design_open', success: true, data: { designId, snapshot } };
		}
		case 'design_save_guidelines': {
			const snapshot = mockDesignSnapshot?.document.id === cmd.designId ? { ...mockDesignSnapshot, guidelines: cmd.guidelines } : { ...createMockDesignSnapshot(cmd.designId), guidelines: cmd.guidelines };
			mockDesignSnapshot = snapshot;
			return { id, type: 'response', command: 'design_save_guidelines', success: true, data: { designId: cmd.designId, snapshot } };
		}
		case 'design_create': {
			const designId = `design-mock-${encodeURIComponent(cmd.projectPath)}`;
			const snapshot = createMockDesignSnapshot(designId, cmd.name ?? 'GitPilot Design');
			mockDesignSnapshot = snapshot;
			return { id, type: 'response', command: 'design_create', success: true, data: { designId, snapshot } };
		}
		case 'design_get_snapshot':
			return { id, type: 'response', command: 'design_get_snapshot', success: true, data: { snapshot: mockDesignSnapshot?.document.id === cmd.designId ? mockDesignSnapshot : createMockDesignSnapshot(cmd.designId) } };
		case 'design_get_revision': {
			const snapshot = mockDesignSnapshot?.document.id === cmd.designId ? mockDesignSnapshot : createMockDesignSnapshot(cmd.designId);
			const revisions = Array.isArray(snapshot.document.revisions) ? snapshot.document.revisions as Array<{ id: string }> : [];
			if (!revisions.some((revision) => revision.id === cmd.revisionId)) return { id, type: 'response', command: 'design_get_revision', success: false, error: 'Design 历史修订不存在' };
			return { id, type: 'response', command: 'design_get_revision', success: true, data: { snapshot } };
		}
		case 'design_revert': {
			const snapshot = mockDesignSnapshot?.document.id === cmd.designId ? mockDesignSnapshot : createMockDesignSnapshot(cmd.designId);
			const revisions = Array.isArray(snapshot.document.revisions) ? snapshot.document.revisions as Array<{ id: string; prompt: string; summary: string; createdAt: string }> : [];
			if (!revisions.some((revision) => revision.id === cmd.revisionId)) return { id, type: 'response', command: 'design_revert', success: false, error: 'Design 历史修订不存在' };
			const revisionId = `rev-mock-${Date.now()}`;
			const version = typeof snapshot.document.version === 'number' ? snapshot.document.version : 1;
			const next = { ...snapshot, document: { ...snapshot.document, version: version + 1, revisions: [...revisions, { id: revisionId, prompt: `恢复 ${cmd.revisionId}`, summary: `已从历史修订 ${cmd.revisionId} 创建当前版本。`, createdAt: new Date().toISOString(), parentRevisionId: revisions.at(-1)?.id, sourceRevisionId: cmd.revisionId, kind: 'rollback' as const }] } };
			mockDesignSnapshot = next;
			return { id, type: 'response', command: 'design_revert', success: true, data: { snapshot: next } };
		}
		case 'design_upload':
			return { id, type: 'response', command: 'design_upload', success: true, data: { upload: { versionId: Date.now(), versionNumber: 1, status: 'DRAFT', projectId: cmd.platformProjectId, designId: cmd.designId, revisionId: cmd.revisionId, createdAt: new Date().toISOString() } } };
		case 'design_prompt': {
			const requestId = id;
			const runId = `design-run-mock-${Date.now()}`;
			setTimeout(() => {
				dispatchLine({ type: 'design_event', ...designContext!, requestId, runId, sequence: 1, emittedAt: Date.now(), event: { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '[mock] 已开始流式执行。' } } as AgentSessionEvent } as RpcStreamLine);
				setTimeout(() => dispatchLine({ type: 'design_run_settled', ...designContext!, requestId, runId, sequence: 2, emittedAt: Date.now(), snapshot: mockDesignSnapshot?.document.id === cmd.designId ? mockDesignSnapshot : createMockDesignSnapshot(cmd.designId) } as RpcStreamLine), 20);
			}, 0);
			return { id, type: 'response', command: 'design_prompt', success: true, data: { requestId, runId } };
		}
		case 'get_state':
			return {
				id,
				type: 'response',
				command: 'get_state',
				success: true,
				data: {
					model: { id: 'mock-model', name: 'Mock 模型', api: 'openai', provider: 'gitpilot' },
					thinkingLevel: mockThinkingLevel,
					isStreaming: false,
					isCompacting: false,
					steeringMode: 'one-at-a-time',
					followUpMode: 'one-at-a-time',
					sessionId: 'mock-session',
					sessionName: 'Mock 会话',
					autoCompactionEnabled: true,
					messageCount: 0,
					pendingMessageCount: 0,
					rpcCapabilities: [
						'session_execution_snapshot_v1',
						'session_event_metadata_v1',
						'switch_session_snapshot_v1',
					],
					execution: { runId: null, status: 'idle', phase: 'idle', updatedAt: Date.now(), sequence: 0, activeTools: [] },
				},
			};
		case 'get_session_snapshot':
			return {
				id,
				type: 'response',
				command: 'get_session_snapshot',
				success: true,
				data: {
					session: {
						model: { id: 'mock-model', name: 'Mock 模型', api: 'openai', provider: 'gitpilot' },
						thinkingLevel: mockThinkingLevel,
						isStreaming: false,
						isCompacting: false,
						steeringMode: 'one-at-a-time',
						followUpMode: 'one-at-a-time',
						sessionId: 'mock-session',
						sessionName: 'Mock 会话',
						autoCompactionEnabled: true,
						messageCount: 0,
						pendingMessageCount: 0,
					},
					execution: { runId: null, status: 'idle', phase: 'idle', updatedAt: Date.now(), sequence: 0, activeTools: [] },
					messages: [],
					eventCursor: 0,
				},
			};
		case 'get_available_models':
			return { id, type: 'response', command: 'get_available_models', success: true, data: { models: [{ id: 'mock-model', name: 'Mock 模型', api: 'openai', provider: 'gitpilot' }] } };
		case 'set_thinking_level':
			mockThinkingLevel = cmd.level;
			return { id, type: 'response', command: 'set_thinking_level', success: true };
		case 'get_available_thinking_levels':
			return { id, type: 'response', command: 'get_available_thinking_levels', success: true, data: { levels: ['off', 'low', 'medium', 'high'] } };
		case 'get_commands':
			return { id, type: 'response', command: 'get_commands', success: true, data: { commands: [{ name: 'login', source: 'extension', sourceInfo: { kind: 'extension', name: 'gitpilot' } }] } };
		case 'get_platform_connection':
			// 浏览器预览没有 sidecar 与真实后端，固定模拟为可用以保持工作台可进入。
			return { id, type: 'response', command: 'get_platform_connection', success: true, data: { connected: true } };
		case 'get_platform_projects':
			// 浏览器预览用固定项目联调选择器的加载、选择和绑定上下文。
			return { id, type: 'response', command: 'get_platform_projects', success: true, data: { projects: [{ id: 1, name: '星河营销站', status: '进行中' }, { id: 2, name: 'GitPilot 控制台', status: '进行中' }] } };
		case 'get_platform_work_items':
			// 浏览器预览用固定工作项联调分组、展开和选中带入输入框的交互。
			return {
				id,
				type: 'response',
				command: 'get_platform_work_items',
				success: true,
				data: {
					items: [
						{ id: 101, workItemCode: '#REQ-101', name: '支持工作项上下文带入', workItemType: '需求', status: '进行中', priority: '高', assignee: '当前用户', taskType: null, projectId: 1, projectName: 'GitPilot 控制台', iterationId: null, iterationName: null, planStartDate: null, planEndDate: null, requirementMarkdown: null },
						{ id: 102, workItemCode: '#TASK-102', name: '补充工作项入口验收测试', workItemType: '任务', status: '待处理', priority: '中', assignee: '当前用户', taskType: '开发', projectId: 1, projectName: 'GitPilot 控制台', iterationId: null, iterationName: null, planStartDate: null, planEndDate: null, requirementMarkdown: null },
						{ id: 103, workItemCode: '#BUG-103', name: '工作项菜单在窄屏下被遮挡', workItemType: '缺陷', status: '待修复', priority: '高', assignee: '当前用户', taskType: null, projectId: 2, projectName: '星河营销站', iterationId: null, iterationName: null, planStartDate: null, planEndDate: null, requirementMarkdown: null },
					],
				},
			};
		case 'get_tree':
			return { id, type: 'response', command: 'get_tree', success: true, data: { tree: [], leafId: null } };
		case 'prepare_attachments': {
			// 浏览器预览无真实 sidecar，按输入条目返回占位附件，便于 UI 联调。
			const attachments: PreparedAttachment[] = (cmd.items ?? []).map((item) => {
				const name = 'path' in item ? item.name ?? item.path : item.name;
				return {
					name: typeof name === 'string' ? name : '附件',
					kind: 'text' as const,
					mimeType: 'text/plain',
					sizeBytes: 0,
					text: '[mock] 浏览器预览不解析附件内容。',
					warnings: [],
				};
			});
			return { id, type: 'response', command: 'prepare_attachments', success: true, data: { attachments } };
		}
		case 'abort':
			return { id, type: 'response', command: 'abort', success: true, data: { clearedSteering: 0, clearedFollowUp: 0 } };
		default:
			return { id, type: 'response', command: cmd.type, success: true } as RpcResponse;
	}
}

function startMock(): void {
	readyCbs.forEach((cb) => cb());
	let n = 0;
	mockTimer = setInterval(() => {
		n += 1;
		if (n > 3) return;
		dispatchLine({ type: 'message.delta', text: `[mock] 第 ${n} 段流式文本…` });
	}, 2000);
}
