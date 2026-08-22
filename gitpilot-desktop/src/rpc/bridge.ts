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
import type { CanvasDesignDocument } from '@/src/design/canvas-types';
import type {
	AgentSessionEvent,
	AttachmentInput,
	ImageContent,
	PreparedAttachment,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcResponse,
	DesignProjectGuidelines,
	DesignRpcMessage,
	DesignRpcSnapshot,
	DesignStreamLine,
	CodeProjectFileEntry,
	RpcGitEvent,
	GitRepositoryState,
	RpcSessionState,
	RpcStreamLine,
	ThinkingLevel,
	ManagedMcpServer,
	McpServerDefinition,
	ApprovalDecision,
	SecurityPolicy,
	SessionApprovalMode,
} from './types';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let cmdSeq = 0;
const DEFAULT_TIMEOUT_MS = 30_000;

// ============================================================================
// 事件订阅
// ============================================================================

type EventCb = (e: AgentSessionEvent) => void;
type DesignEventCb = (e: DesignStreamLine) => void;
type GitEventCb = (e: RpcGitEvent) => void;
type ExtensionUICb = (req: RpcExtensionUIRequest) => void;
type ErrorCb = (msg: string) => void;
type LifecycleCb = () => void;

const eventCbs = new Set<EventCb>();
const designEventCbs = new Set<DesignEventCb>();
const gitEventCbs = new Set<GitEventCb>();
const extUICbs = new Set<ExtensionUICb>();
const errorCbs = new Set<ErrorCb>();
const readyCbs = new Set<LifecycleCb>();
const disconnectCbs = new Set<LifecycleCb>();

let unlisten: UnlistenFn | null = null;
let mockTimer: ReturnType<typeof setInterval> | null = null;
// Mock 模式下跟踪用户选择的思考级别，使非 Tauri 预览也能反映切换结果。
let mockThinkingLevel: ThinkingLevel = 'off';
let mockDesignSnapshot: DesignRpcSnapshot | null = null;
/** 非 Tauri 预览也保留一组可编辑 MCP 夹具，便于设置页联调完整配置与项目只读行为。 */
let mockMcpServers: ManagedMcpServer[] = [
	{
		name: 'filesystem', source: 'global', enabled: true, modes: ['code', 'work'], transport: 'stdio',
		definition: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'], env: { API_KEY: '__GITPILOT_REDACTED__' }, requestTimeoutMs: 30000 },
	},
	{
		name: 'team-search', source: 'project', enabled: true, modes: ['code'], transport: 'http',
		definition: { url: 'https://mcp.example.com/mcp', httpTransport: 'streamable-http', headers: { Authorization: '__GITPILOT_REDACTED__' }, requestTimeoutMs: 30000 },
	},
];

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
	// Git 面板事件同样独立分流，不进入 Code 会话 reducer（与 design_ 前缀同模式）。
	if (line.type.startsWith('git_')) {
		gitEventCbs.forEach((cb) => cb(line as unknown as RpcGitEvent));
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
	codeFileList: () => send({ type: 'code_file_list' }),
	// Git 面板：只读命令默认超时；远程同步（fetch/pull/push）放宽到 150s。
	gitGetState: () => send({ type: 'git_get_state' }),
	gitGetDiff: (scope: 'worktree' | 'staged', path: string) => send({ type: 'git_get_diff', scope, path }),
	gitListBranches: () => send({ type: 'git_list_branches' }),
	gitStagePaths: (paths: string[]) => send({ type: 'git_stage_paths', paths }),
	gitUnstagePaths: (paths: string[]) => send({ type: 'git_unstage_paths', paths }),
	gitUntrackPaths: (paths: string[]) => send({ type: 'git_untrack_paths', paths }),
	gitCommit: (message: string, expectedVersion?: number) => send({ type: 'git_commit', message, expectedVersion }),
	// 提交信息生成走一次性模型会话，给本地模型冷启动留足时间。
	gitSuggestCommitMessage: () => send({ type: 'git_suggest_commit_message' }, 120_000),
	gitCreateBranch: (name: string, switchTo = false) => send({ type: 'git_create_branch', name, switchTo }),
	gitSwitchBranch: (name: string, expectedVersion?: number) => send({ type: 'git_switch_branch', name, expectedVersion }),
	gitFetch: () => send({ type: 'git_fetch' }, 150_000),
	gitPullFfOnly: (expectedVersion?: number) => send({ type: 'git_pull_ff_only', expectedVersion }, 150_000),
	gitPush: (payload: { expectedVersion?: number; setUpstream?: boolean }) => send({ type: 'git_push', ...payload }, 150_000),
	gitCancelOperation: (operationId: string) => send({ type: 'git_cancel_operation', operationId }),
	newWorkSession: (taskId: string, workspacePath?: string) => send({ type: 'new_work_session', taskId, workspacePath }),
	// work_prompt 为受理式协议：sidecar 立即返回 requestId，最终文本通过
	// work_complete / work_error 事件流推送，响应本身只需默认超时。
	workPrompt: (payload: { taskId: string; message: string }) => send({ type: 'work_prompt', ...payload }),
	workAbort: (requestId?: string) => send({ type: 'work_abort', requestId }),
	workFileList: (taskId: string) => send({ type: 'work_file_list', taskId }),
	workFileRead: (taskId: string, path: string) => send({ type: 'work_file_read', taskId, path }),
	workFileWrite: (taskId: string, path: string, content: string) => send({ type: 'work_file_write', taskId, path, content }),
	workFileDelete: (taskId: string, path: string) => send({ type: 'work_file_delete', taskId, path }),
	workFileRename: (taskId: string, path: string, newPath: string) => send({ type: 'work_file_rename', taskId, path, newPath }),
	workPrepareAttachments: (items: AttachmentInput[]) => send({ type: 'work_prepare_attachments', items }),
	// 工作项协同浏览：右侧栏只读分页浏览，数据经 sidecar 代理平台接口，不进模型上下文。
	workProjectList: () => send({ type: 'work_project_list' }),
	workItemPage: (payload: { page?: number; size?: number; status?: string; priority?: string; projectId?: number; keyword?: string; workItemType?: string }) => send({ type: 'work_item_page', ...payload }),
	workItemDetail: (workItemId: number) => send({ type: 'work_item_detail', workItemId }),
	designOpen: (projectPath: string) => send({ type: 'design_open', projectPath }),
	designSyncMessages: (projectPath: string, designId: string, messages: DesignRpcMessage[]) => send({ type: 'design_sync_messages', projectPath, designId, messages }),
	designSaveGuidelines: (projectPath: string, designId: string, guidelines: DesignProjectGuidelines, canvas?: CanvasDesignDocument) => send({ type: 'design_save_guidelines', projectPath, designId, guidelines, ...(canvas ? { canvas } : {}) }),
	designRenamePage: (payload: { projectPath: string; designId: string; pageId: string; name: string; baseRevisionId: string }) => send({ type: 'design_rename_page', ...payload }),
	designCreate: (projectPath: string, name?: string) => send({ type: 'design_create', projectPath, name }),
	designGetSnapshot: (projectPath: string, designId: string) => send({ type: 'design_get_snapshot', projectPath, designId }),
	designGetRevision: (projectPath: string, designId: string, revisionId: string) => send({ type: 'design_get_revision', projectPath, designId, revisionId }),
	designPrompt: (payload: { projectPath: string; designId: string; pageId: string; prompt: string; baseRevisionId?: string; targetProfiles: Array<'mobile' | 'tablet' | 'desktop'>; uiMessageId?: string }) => send({ type: 'design_prompt', ...payload }),
	designClarificationResponse: (payload: { projectPath: string; designId: string; clarificationId: string; answer: string }) => send({ type: 'design_clarification_response', ...payload }),
	designFollowUp: (projectPath: string, designId: string, message: string) => send({ type: 'design_follow_up', projectPath, designId, message }),
	designAbort: (projectPath: string, designId: string) => send({ type: 'design_abort', projectPath, designId }),
	designRecoverDraft: (payload: { projectPath: string; designId: string; runId: string; action: 'keep' | 'discard' }) => send({ type: 'design_recover_draft', ...payload }),
	designApplyPatch: (payload: { projectPath: string; designId: string; pageId: string; baseRevisionId: string; patch: Record<string, unknown> }) => send({ type: 'design_apply_patch', ...payload }),
	designApprovalResponse: (projectPath: string, designId: string, approvalId: string, approved: boolean) => send({ type: 'design_approval_response', projectPath, designId, approvalId, approved }),
	// Design 生成需要等待模型返回完整的三文件结构化结果，给本地模型和首次冷启动留出足够时间。
	designGenerate: (payload: { projectPath: string; designId: string; pageId: string; prompt: string; baseRevisionId?: string; targetProfiles: Array<'mobile' | 'tablet' | 'desktop'> }) => send({ type: 'design_generate', ...payload }, 150_000),
	designPreview: (projectPath: string, designId: string, pageId: string, revisionId?: string) => send({ type: 'design_preview', projectPath, designId, pageId, revisionId }),
	designCheck: (projectPath: string, designId: string, pageId: string, revisionId?: string) => send({ type: 'design_check', projectPath, designId, pageId, revisionId }),
	designRevert: (projectPath: string, designId: string, revisionId: string) => send({ type: 'design_revert', projectPath, designId, revisionId }),
	designUpload: (payload: { projectPath: string; designId: string; revisionId: string; platformProjectId: number; title?: string; summary?: string; previewPng?: string }) => send({ type: 'design_upload', ...payload }, 90_000),
	designExport: (projectPath: string, designId: string, outputPath?: string) => send({ type: 'design_export', projectPath, designId, outputPath }),
	mcpList: () => send({ type: 'mcp_list' }),
	mcpSaveServer: (name: string, definition: McpServerDefinition, modes: Array<'code' | 'work' | 'design'>, previousName?: string) => send({ type: 'mcp_save_server', name, definition, modes, previousName }),
	mcpCopyServer: (name: string) => send({ type: 'mcp_copy_server', name }),
	mcpDeleteServer: (name: string) => send({ type: 'mcp_delete_server', name }),
	mcpSetModes: (name: string, modes: Array<'code' | 'work' | 'design'>) => send({ type: 'mcp_set_modes', name, modes }),
	mcpSetEnabled: (name: string, enabled: boolean) => send({ type: 'mcp_set_enabled', name, enabled }),
	mcpReload: () => send({ type: 'mcp_reload' }),
	skillList: () => send({ type: 'skill_list' }),
	skillSetEnabled: (name: string, enabled: boolean) => send({ type: 'skill_set_enabled', name, enabled }),
	skillSetModes: (name: string, modes: Array<'code' | 'work' | 'design'>) => send({ type: 'skill_set_modes', name, modes }),
	skillReload: () => send({ type: 'skill_reload' }),
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
	/** 标题栏刷新按钮：强制 sidecar 联网重拉平台模型清单并重解析当前选中模型。 */
	refreshModels: () => send({ type: 'refresh_models' }),
	setToken: (platformUrl: string, token: string) => send({ type: 'set_token', platformUrl, token }),
	getPlatformAccount: () => send({ type: 'get_platform_account' }),
	getPlatformConnection: () => send({ type: 'get_platform_connection' }),
	/** 查询当前账号可访问的 Web 端项目，供 Design 入口建立请求上下文。 */
	getPlatformProjects: (keyword?: string) => send({ type: 'get_platform_projects', keyword }),
	/** 查询当前账号负责的工作项，供输入框“工作项”页签展示。 */
	getPlatformWorkItems: () => send({ type: 'get_platform_work_items' }),
	logout: () => send({ type: 'logout' }),
	approvalResponse: (approvalId: string, decision: ApprovalDecision) => send({ type: 'approval_response', approvalId, decision }),
	getSecurityPolicy: () => send({ type: 'get_security_policy' }),
	setSecurityPolicy: (policy: Partial<SecurityPolicy>) => send({ type: 'set_security_policy', policy }),
	setSessionApprovalMode: (mode: SessionApprovalMode) => send({ type: 'set_session_approval_mode', mode }),
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
export function onGitEvent(cb: GitEventCb): () => void {
	gitEventCbs.add(cb);
	return () => gitEventCbs.delete(cb);
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
		case 'design_rename_page': {
			const snapshot = mockDesignSnapshot?.document.id === cmd.designId ? mockDesignSnapshot : createMockDesignSnapshot(cmd.designId);
			const name = cmd.name.trim();
			if (!name) return { id, type: 'response', command: 'design_rename_page', success: false, error: '页面名称不能为空' };
			const pages = (Array.isArray(snapshot.document.pages) ? snapshot.document.pages : []) as Array<{ id: string; [key: string]: unknown }>;
			if (!pages.some((page) => page.id === cmd.pageId)) return { id, type: 'response', command: 'design_rename_page', success: false, error: `Design 页面不存在：${cmd.pageId}` };
			const revisions = (Array.isArray(snapshot.document.revisions) ? snapshot.document.revisions : []) as Array<Record<string, unknown>>;
			const revisionId = `rev-mock-${Date.now()}`;
			const version = typeof snapshot.document.version === 'number' ? snapshot.document.version : 1;
			const next = { ...snapshot, document: { ...snapshot.document, version: version + 1, pages: pages.map((page) => page.id === cmd.pageId ? { ...page, name } : page), revisions: [...revisions, { id: revisionId, prompt: `重命名页面 ${name}`, summary: `已将页面重命名为 ${name}。`, createdAt: new Date().toISOString(), parentRevisionId: revisions.at(-1)?.id, kind: 'patch' as const }] } };
			mockDesignSnapshot = next;
			return { id, type: 'response', command: 'design_rename_page', success: true, data: { designId: cmd.designId, snapshot: next } };
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
		case 'mcp_list':
			return { id, type: 'response', command: 'mcp_list', success: true, data: { servers: mockMcpServers } };
		case 'mcp_save_server': {
			const previousName = cmd.previousName ?? cmd.name;
			mockMcpServers = mockMcpServers.filter((server) => server.name !== previousName && server.name !== cmd.name);
			const transport = typeof cmd.definition.command === 'string' && cmd.definition.command.trim() ? 'stdio' : cmd.definition.httpTransport === 'sse' ? 'sse' : 'http';
			mockMcpServers.push({ name: cmd.name, source: 'global', enabled: cmd.definition.disabled !== true, modes: cmd.modes, transport, definition: cmd.definition });
			return { id, type: 'response', command: 'mcp_save_server', success: true };
		}
		case 'mcp_copy_server': {
			const source = mockMcpServers.find((server) => server.name === cmd.name);
			if (!source) return { id, type: 'response', command: 'mcp_copy_server', success: false, error: `MCP 服务不存在：${cmd.name}` };
			if (source.source === 'global') return { id, type: 'response', command: 'mcp_copy_server', success: false, error: `只能复制项目来源 MCP 服务：${cmd.name}` };
			let name = `${source.name}-global`;
			let suffix = 2;
			while (mockMcpServers.some((server) => server.name === name)) name = `${source.name}-global-${suffix++}`;
			mockMcpServers.push({ ...source, name, source: 'global', definition: { ...source.definition } });
			return { id, type: 'response', command: 'mcp_copy_server', success: true, data: { name } };
		}
		case 'mcp_delete_server':
			mockMcpServers = mockMcpServers.filter((server) => server.name !== cmd.name || server.source !== 'global');
			return { id, type: 'response', command: 'mcp_delete_server', success: true };
		case 'mcp_set_modes': {
			mockMcpServers = mockMcpServers.map((server) => server.name === cmd.name && server.source === 'global' ? { ...server, modes: [...new Set(cmd.modes)] } : server);
			return { id, type: 'response', command: 'mcp_set_modes', success: true };
		}
		case 'mcp_set_enabled': {
			mockMcpServers = mockMcpServers.map((server) => server.name === cmd.name && server.source === 'global' ? { ...server, enabled: cmd.enabled, definition: { ...server.definition, disabled: !cmd.enabled } } : server);
			return { id, type: 'response', command: 'mcp_set_enabled', success: true };
		}
		case 'mcp_reload':
			return { id, type: 'response', command: 'mcp_reload', success: true };
		case 'skill_list':
			return {
				id,
				type: 'response',
				command: 'skill_list',
				success: true,
				data: {
					skills: [
						{ id: 'cross-agent-harness', name: 'cross-agent-harness', description: '为多智能体仓库创建并维护协作规范。', source: 'builtin', filePath: 'C:/GitPilot/skills/cross-agent-harness/SKILL.md', enabled: true, modes: ['code'], disableModelInvocation: false },
						{ id: 'frontend-review', name: 'frontend-review', description: '检查界面可访问性、布局与视觉一致性。', source: 'personal', filePath: 'C:/Users/you/.agents/skills/frontend-review/SKILL.md', enabled: true, modes: ['code', 'design'], disableModelInvocation: false },
					],
					diagnostics: [],
				},
			};
		case 'skill_set_enabled':
		case 'skill_set_modes':
		case 'skill_reload':
			return { id, type: 'response', command: cmd.type, success: true, data: { reloadedModes: ['code', 'work', 'design'], deferredModes: [] } };
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
		case 'code_file_list': {
			// 非 Tauri 预览提供稳定的文件树夹具，便于验证右侧面板与拖入对话框交互。
			const entries: CodeProjectFileEntry[] = [
				{ path: 'src', name: 'src', kind: 'directory' },
				{ path: 'src/App.tsx', name: 'App.tsx', kind: 'file', size: 2_048, updatedAt: Date.now() },
				{ path: 'src/main.tsx', name: 'main.tsx', kind: 'file', size: 1_024, updatedAt: Date.now() },
				{ path: 'package.json', name: 'package.json', kind: 'file', size: 512, updatedAt: Date.now() },
			];
			return { id, type: 'response', command: 'code_file_list', success: true, data: { rootPath: 'mock-project', entries, truncated: false } };
		}
		case 'git_get_state': {
			// 浏览器预览的 Git 面板夹具：一个带未暂存/已暂存/未跟踪文件的 mock 仓库。
			const state: GitRepositoryState = {
				repositoryId: 'mock-repo',
				repositoryVersion: 1,
				branch: 'main',
				detached: false,
				upstream: 'origin/main',
				ahead: 1,
				behind: 0,
				files: [
					{ path: 'src/App.tsx', staged: null, worktree: 'M', untracked: false, conflicted: false, stagedCounts: null, worktreeCounts: { added: 12, removed: 4 } },
					{ path: 'src/feature.ts', staged: 'A', worktree: null, untracked: false, conflicted: false, stagedCounts: { added: 36, removed: 0 }, worktreeCounts: null },
					{ path: 'notes.md', staged: null, worktree: null, untracked: true, conflicted: false, stagedCounts: null, worktreeCounts: null },
				],
			};
			return { id, type: 'response', command: 'git_get_state', success: true, data: state };
		}
		case 'git_get_diff':
			return { id, type: 'response', command: 'git_get_diff', success: true, data: { path: cmd.path, scope: cmd.scope, diff: '@@ -1,2 +1,2 @@\n line1\n-old\n+new\n', truncated: false, binary: false } };
		case 'git_suggest_commit_message':
			return { id, type: 'response', command: 'git_suggest_commit_message', success: true, data: { message: 'feat(mock): 新增导出接口' } };
		case 'git_list_branches':
			return { id, type: 'response', command: 'git_list_branches', success: true, data: { branches: [
				{ name: 'main', kind: 'local', current: true, upstream: 'origin/main' },
				{ name: 'feature/mock', kind: 'local', current: false, upstream: null },
				{ name: 'origin/main', kind: 'remote', current: false, upstream: null },
			] } };
		case 'git_stage_paths':
		case 'git_unstage_paths':
		case 'git_create_branch':
		case 'git_switch_branch':
		case 'git_fetch':
		case 'git_pull_ff_only':
		case 'git_push':
			// 写操作在预览模式下返回未变化的 mock 状态，仅保证界面可联调。
			return { id, type: 'response', command: cmd.type, success: true, data: { repositoryVersion: 1, state: {
				repositoryId: 'mock-repo', repositoryVersion: 1, branch: 'main', detached: false, upstream: 'origin/main', ahead: 1, behind: 0, files: [],
			} } };
		case 'work_prompt': {
			// 受理式协议的 mock：立即返回 requestId，再通过事件流模拟一次完整回合，
			// 保持浏览器预览下 Work 对话可用（delta 流式 + complete 收尾）。
			const requestId = id;
			const taskId = cmd.taskId;
			setTimeout(() => {
				dispatchLine({ type: 'work_delta', taskId, delta: '[mock] 已收到 Work 请求，' } as RpcStreamLine);
				setTimeout(() => {
					dispatchLine({ type: 'work_delta', taskId, delta: '浏览器预览仅提供界面联调。' } as RpcStreamLine);
					dispatchLine({ type: 'work_complete', requestId, taskId, text: '[mock] 已收到 Work 请求，浏览器预览仅提供界面联调。', title: 'Mock Work 会话' } as RpcStreamLine);
				}, 60);
			}, 20);
			return { id, type: 'response', command: 'work_prompt', success: true, data: { requestId } };
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
