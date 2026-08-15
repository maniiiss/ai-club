/**
 * 桌面版消费 gitpilot-cli RPC 协议的类型定义。
 *
 * 与 `gitpilot-cli/src/modes/rpc/rpc-types.ts` 保持协议同步。
 * 后续将抽取为两端共享的独立子包（见设计文档第 15.1 节）。
 *
 * 设计取舍：对 pi-agent-core / pi-ai 的内部类型用最小化定义，
 * 避免前端构建依赖 gitpilot-cli 的 Node 包。事件流（AgentSessionEvent）
 * 因结构复杂且高度依赖 pi 内部类型，这里用宽松事件载体，具体子类型在
 * 事件分流层按 type 字段细化。
 */

// ============================================================================
// pi 内部类型的最小化桌面视图
// ============================================================================

/** 模型信息（pi-ai Model 的桌面版消费视图） */
export interface ModelInfo {
	id: string;
	name: string;
	api: string;
	provider: string;
	baseUrl?: string;
	reasoning?: boolean;
	input?: string[];
	contextWindow?: number;
	maxTokens?: number;
	cost?: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
}

/** 标题栏账户菜单所需的安全摘要；不会包含平台令牌。 */
export interface PlatformAccount {
	platformUrl: string;
	user: { id: number; username: string; nickname?: string; avatarUrl?: string };
	creditBalance: number | null;
}

/** 平台后端的只读连通状态；由 sidecar 持有凭据并完成探测。 */
export interface PlatformConnection {
	connected: boolean;
}

/** 思维级别（与 pi-agent-core ThinkingLevel 对齐） */
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';

/** 图片内容（pi-ai ImageContent 的桌面版消费视图）。
 * 与 sidecar 的扁平结构对齐：{ type, data(base64), mimeType }。 */
export interface ImageContent {
	type: 'image';
	data: string;
	mimeType: string;
}

/** 附件输入：可按路径提供（sidecar 读取本地文件），也可按内联 base64 提供（剪贴板粘贴/拖拽 blob）。 */
export type AttachmentInput =
	| { path: string; name?: string }
	| { name: string; data: string; mimeType?: string };

/** 预解析后的附件：图片带 image，文档/文本带 text，统一带元数据与 warnings（仅元数据，不含原文以免撑大 UI）。 */
export interface PreparedAttachment {
	name: string;
	path?: string;
	kind: 'image' | 'document' | 'text';
	mimeType: string;
	sizeBytes: number;
	text?: string;
	image?: ImageContent;
	truncated?: boolean;
	warnings?: string[];
}

/** Work 对话只传递本机任务上下文；不包含 Code session、cwd 或任何凭据。 */
export interface WorkConversationMessage { role: 'user' | 'assistant'; content: string; }
export interface WorkResearchSource { id: string; title: string; url: string; snippet: string; publishedAt?: string; }
export interface WorkFileSnapshot {
	path: string;
	name: string;
	type: string;
	size: number;
	updatedAt: number;
	content?: string;
}

/** Design 文件是项目级工作区内的 canonical 资源，path 永远相对 .gitpilot/design。 */
export interface DesignRpcFile { id?: string; path: string; scope?: 'page' | 'shared' | 'asset'; language: 'html' | 'css' | 'javascript' | 'json' | 'image' | 'unknown'; content: string; hash?: string }
export interface DesignProjectContext { projectId: string; projectPath: string; designId: string }
/** 项目级长期设计约束，随项目 Design Workspace 恢复，不属于单次页面 revision。 */
export interface DesignProjectGuidelines {
	version: 1;
	brand: { name: string; tone: string };
	tokens: {
		colors: Record<string, string>;
		typography: Record<string, string>;
		spacing: Record<string, string>;
		radius: Record<string, string>;
		shadows: Record<string, string>;
	};
	components: Record<string, string>;
	rules: string[];
	accessibility: { minContrast: 'AA' | 'AAA' };
	updatedAt: string;
}
export interface DesignRpcSnapshot { document: Record<string, unknown>; files: DesignRpcFile[]; context?: DesignProjectContext; guidelines?: DesignProjectGuidelines }
/** sidecar 构建的受控预览载荷；Desktop 只把 html 放进 sandbox iframe。 */
export interface DesignPreviewHandle { id: string; projectId: string; designId: string; pageId: string; revisionId: string; html: string; expiresAt: number }
export type DesignPatchOperation =
    | { op: 'create_file'; path: string; content: string; language: DesignRpcFile['language'] }
	| { op: 'replace_file'; path: string; content: string }
	| { op: 'replace_text'; path: string; search: string; replacement: string }
	| { op: 'rename_file'; path: string; newPath: string }
	| { op: 'delete_file'; path: string };
export interface DesignPatch { baseRevisionId: string; operations: DesignPatchOperation[]; affectedPaths?: string[]; summary?: string; risk?: 'safe' | 'high'; operationId?: string }
export interface DesignStreamEvent { type: 'design_event'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; event: AgentSessionEvent }
export interface DesignPatchAppliedEvent { type: 'design_patch_applied'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; operationId: string; revisionId: string; pageId: string; summary: string; files: DesignRpcFile[] }
export interface DesignApprovalRequiredEvent { type: 'design_approval_required'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; approvalId: string; pageId: string; patch: DesignPatch; reason: string }
export interface DesignRunSettledEvent { type: 'design_run_settled'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; snapshot: DesignRpcSnapshot }
export interface DesignErrorEvent { type: 'design_error'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; error: string }
export type DesignStreamLine = DesignStreamEvent | DesignPatchAppliedEvent | DesignApprovalRequiredEvent | DesignRunSettledEvent | DesignErrorEvent;
export type McpMode = 'code' | 'work' | 'design';
/** 管理页只消费脱敏 MCP 摘要，凭据只在写入请求中短暂经过 sidecar。 */
export interface ManagedMcpServer { name: string; source: 'global' | 'project' | 'project-override'; enabled: boolean; modes: McpMode[]; transport: 'stdio' | 'http' | 'unknown'; }

/** Slash 命令来源信息（最小化） */
export interface SourceInfo {
	kind: string;
	name?: string;
	id?: string;
}

/** 会话树节点（pi SessionTreeNode 的桌面版消费视图）。
 * pi 实际结构为 { entry: SessionEntry, children: SessionTreeNode[] }，
 * entry.id 为条目 id；sessionFile 在部分节点上提供。 */
export interface SessionTreeNode {
	entry?: { id: string; type?: string; name?: string; sessionFile?: string; [k: string]: unknown };
	id?: string;
	name?: string;
	sessionFile?: string;
	isLeaf?: boolean;
	parentId?: string | null;
	children?: SessionTreeNode[];
}

/** 会话条目（最小化） */
export interface SessionEntry {
	id: string;
	type?: string;
	role?: string;
	text?: string;
	createdAt?: string;
}

/** 历史会话列表项（pi SessionInfo 的桌面版消费视图）。
 * created/modified 经 JSON 序列化为 ISO 字符串；path 可直接作为 switch_session 的 sessionPath。 */
export interface SessionListItem {
	path: string;
	id: string;
	name?: string;
	cwd: string;
	created: string;
	modified: string;
	messageCount: number;
	firstMessage: string;
	/** sidecar runtime 是否仍在执行，任务切换后用于保留左侧 loading 状态。 */
	isStreaming?: boolean;
	/** 当前会话执行摘要（仅当 sidecar 宣告 session_execution_snapshot_v1 时存在）。 */
	execution?: AgentExecutionSummary;
}

// ============================================================================
// 执行快照（与 gitpilot-cli agent-execution-state.ts 对齐，设计文档 §8）
// ============================================================================

export type AgentExecutionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

export type AgentExecutionPhase =
	| 'preparing'
	| 'thinking'
	| 'responding'
	| 'tool'
	| 'retrying'
	| 'compacting'
	| 'queued_continuation'
	| 'waiting_confirmation'
	| 'settling'
	| 'idle';

/** 单个活动工具的执行快照，按 toolCallId 独立维护，支持并行工具。 */
export interface AgentExecutionToolSnapshot {
	toolCallId: string;
	toolName: string;
	status: 'running' | 'waiting' | 'succeeded' | 'failed';
	args?: unknown;
	partialResult?: unknown;
	result?: unknown;
	isError?: boolean;
	startedAt: number;
	endedAt?: number;
	sequence: number;
}

/** Agent 执行快照：CLI Core 对当前 run 的权威状态视图。 */
export interface AgentExecutionSnapshot {
	runId: string | null;
	status: AgentExecutionStatus;
	phase: AgentExecutionPhase;
	startedAt?: number;
	endedAt?: number;
	updatedAt: number;
	sequence: number;
	rootUserTimestamp?: number;
	activeTools: AgentExecutionToolSnapshot[];
	lastError?: string;
}

/** 执行摘要（不含活动工具参数与输出），供列表场景使用。 */
export interface AgentExecutionSummary {
	runId: string | null;
	status: AgentExecutionStatus;
	phase: AgentExecutionPhase;
	startedAt?: number;
	endedAt?: number;
	updatedAt: number;
	sequence: number;
	activeToolCount: number;
	activeToolName?: string;
}

/** v1 能力编码。Desktop 只按能力字段启用新链路，不按版本号硬编码行为。 */
export const RPC_CAPABILITY_SESSION_EXECUTION_SNAPSHOT_V1 = 'session_execution_snapshot_v1';
export const RPC_CAPABILITY_SESSION_EVENT_METADATA_V1 = 'session_event_metadata_v1';
export const RPC_CAPABILITY_SWITCH_SESSION_SNAPSHOT_V1 = 'switch_session_snapshot_v1';

/** 实时事件传输层元数据（设计文档 §8.4）。 */
export interface RpcSessionEventMetadata {
	sessionFile?: string;
	sessionId: string;
	runId?: string;
	sequence: number;
	emittedAt: number;
}

/** 原子会话快照：会话状态、消息与执行快照来自同一会话同一时刻（设计文档 §8.3）。 */
export interface RpcDesktopSessionSnapshot {
	session: RpcSessionState;
	execution: AgentExecutionSnapshot;
	messages: unknown[];
	/** 当前快照对应的事件游标，丢弃 sequence <= eventCursor 的旧事件。 */
	eventCursor: number;
}

// ============================================================================
// RPC Commands（桌面版 -> sidecar，stdin）
// ============================================================================

export type RpcCommand =
	// 会话与流式
	| { id?: string; type: 'prompt'; message: string; images?: ImageContent[]; streamingBehavior?: 'steer' | 'followUp' }
	| { id?: string; type: 'steer'; message: string; images?: ImageContent[] }
	| { id?: string; type: 'follow_up'; message: string; images?: ImageContent[] }
	/** 停止当前执行；clearQueue=true 时同时取消尚未执行的引导。 */
	| { id?: string; type: 'abort'; clearQueue?: boolean }
	| { id?: string; type: 'new_session'; parentSession?: string; cwd?: string }
	// 附件预解析（路径或内联 base64 -> 文本/图片，结果随下一条 prompt 注入）
	| { id?: string; type: 'prepare_attachments'; items: AttachmentInput[] }
	| { id?: string; type: 'new_work_session'; taskId: string }
	| { id?: string; type: 'work_prompt'; taskId: string; message: string }
	| { id?: string; type: 'work_abort'; requestId?: string }
	| { id?: string; type: 'work_file_list'; taskId: string }
	| { id?: string; type: 'work_file_read'; taskId: string; path: string }
	| { id?: string; type: 'work_file_write'; taskId: string; path: string; content: string }
	| { id?: string; type: 'work_file_delete'; taskId: string; path: string }
	| { id?: string; type: 'work_file_rename'; taskId: string; path: string; newPath: string }
	| { id?: string; type: 'work_prepare_attachments'; items: AttachmentInput[] }
	| { id?: string; type: 'design_open'; projectPath: string }
	| { id?: string; type: 'design_save_guidelines'; projectPath: string; designId: string; guidelines: DesignProjectGuidelines }
	| { id?: string; type: 'design_create'; projectPath: string; name?: string }
	| { id?: string; type: 'design_get_snapshot'; projectPath: string; designId: string }
	| { id?: string; type: 'design_prompt'; projectPath: string; designId: string; pageId: string; prompt: string; baseRevisionId?: string; targetProfiles: Array<'mobile' | 'tablet' | 'desktop'> }
	| { id?: string; type: 'design_follow_up'; projectPath: string; designId: string; message: string }
	| { id?: string; type: 'design_abort'; projectPath: string; designId: string }
	| { id?: string; type: 'design_approval_response'; projectPath: string; designId: string; approvalId: string; approved: boolean }
	| { id?: string; type: 'design_generate'; projectPath: string; designId: string; pageId: string; prompt: string; baseRevisionId?: string; targetProfiles: Array<'mobile' | 'tablet' | 'desktop'> }
	| { id?: string; type: 'design_apply_patch'; projectPath: string; designId: string; pageId: string; baseRevisionId: string; patch: Record<string, unknown> }
	| { id?: string; type: 'design_preview'; projectPath: string; designId: string; pageId: string; revisionId?: string }
	| { id?: string; type: 'design_check'; projectPath: string; designId: string; pageId: string; revisionId?: string }
	| { id?: string; type: 'design_revert'; projectPath: string; designId: string; revisionId: string }
	| { id?: string; type: 'design_export'; projectPath: string; designId: string; outputPath?: string }
	| { id?: string; type: 'mcp_list' }
	| { id?: string; type: 'mcp_save_server'; name: string; definition: Record<string, unknown>; modes: McpMode[] }
	| { id?: string; type: 'mcp_delete_server'; name: string }
	| { id?: string; type: 'mcp_set_modes'; name: string; modes: McpMode[] }
	| { id?: string; type: 'mcp_set_enabled'; name: string; enabled: boolean }
	| { id?: string; type: 'mcp_reload' }
	| { id?: string; type: 'get_state' }
	// 模型
	| { id?: string; type: 'set_model'; provider: string; modelId: string }
	| { id?: string; type: 'cycle_model' }
	| { id?: string; type: 'get_available_models' }
	// 思维级别
	| { id?: string; type: 'set_thinking_level'; level: ThinkingLevel }
	| { id?: string; type: 'cycle_thinking_level' }
	| { id?: string; type: 'get_available_thinking_levels' }
	// 会话管理
	| { id?: string; type: 'get_tree' }
	| { id?: string; type: 'list_sessions'; scope?: 'current' | 'all' }
	| { id?: string; type: 'get_entries'; since?: string }
	| { id?: string; type: 'get_messages' }
	| { id?: string; type: 'switch_session'; sessionPath: string }
	/** 原子取得当前会话状态、消息与执行快照，供启动/重连/刷新使用（设计文档 §8.3）。 */
	| { id?: string; type: 'get_session_snapshot' }
	| { id?: string; type: 'set_session_name'; name: string }
	| { id?: string; type: 'export_html'; outputPath?: string }
	| { id?: string; type: 'get_commands' }
	/** 执行扩展命令但不创建假的 slash 用户消息。 */
	| { id?: string; type: 'execute_command'; name: string; args?: string }
	// 桌面版登录后注入平台 gpt_ token（复用 sidecar saveCliToken）
	| { id?: string; type: 'set_token'; platformUrl: string; token: string }
	// 账户菜单的只读摘要与受控登出。
	| { id?: string; type: 'get_platform_account' }
	| { id?: string; type: 'get_platform_connection' }
	/** Design 入口绑定 Web 端项目时使用的只读项目查询。 */
	| { id?: string; type: 'get_platform_projects'; keyword?: string }
	| { id?: string; type: 'logout' }
	// 扩展 UI 响应
	| { type: 'extension_ui_response'; id: string; value: string }
	| { type: 'extension_ui_response'; id: string; confirmed: boolean }
	| { type: 'extension_ui_response'; id: string; cancelled: true };

// ============================================================================
// RPC State
// ============================================================================

export interface RpcSessionState {
	model?: ModelInfo;
	thinkingLevel: ThinkingLevel;
	isStreaming: boolean;
	isCompacting: boolean;
	steeringMode: 'all' | 'one-at-a-time';
	followUpMode: 'all' | 'one-at-a-time';
	sessionFile?: string;
	sessionId: string;
	sessionName?: string;
	autoCompactionEnabled: boolean;
	messageCount: number;
	pendingMessageCount: number;
	/** sidecar 宣告的能力列表，Desktop 据此启用新链路或回退旧推断。 */
	rpcCapabilities?: string[];
	/** 当前会话权威执行快照（仅当 sidecar 宣告 session_execution_snapshot_v1 时存在）。 */
	execution?: AgentExecutionSnapshot;
}

// ============================================================================
// RPC Responses（sidecar -> 桌面版，stdout）
// ============================================================================

export type RpcResponse =
	| { id?: string; type: 'response'; command: 'prompt'; success: true }
	| { id?: string; type: 'response'; command: 'steer'; success: true }
	| { id?: string; type: 'response'; command: 'follow_up'; success: true }
	| {
			id?: string;
			type: 'response';
			command: 'abort';
			success: true;
			data?: { clearedSteering: number; clearedFollowUp: number };
	  }
	| { id?: string; type: 'response'; command: 'new_session'; success: true; data: { cancelled: boolean } }
	| { id?: string; type: 'response'; command: 'prepare_attachments'; success: true; data: { attachments: PreparedAttachment[] } }
	| { id?: string; type: 'response'; command: 'new_work_session'; success: true; data: { taskId: string; sessionId: string; sessionPath: string; workspacePath: string; title: string } }
	| { id?: string; type: 'response'; command: 'work_prompt'; success: true; data: { requestId: string; text: string; title?: string; sources?: WorkResearchSource[] } }
	| { id?: string; type: 'response'; command: 'work_abort'; success: true }
	| { id?: string; type: 'response'; command: 'work_file_list'; success: true; data: { taskId: string; files: WorkFileSnapshot[] } }
	| { id?: string; type: 'response'; command: 'work_file_read'; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: 'response'; command: 'work_file_write'; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: 'response'; command: 'work_file_delete'; success: true; data: { taskId: string; path: string } }
	| { id?: string; type: 'response'; command: 'work_file_rename'; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: 'response'; command: 'work_prepare_attachments'; success: true; data: { attachments: PreparedAttachment[] } }
	| { id?: string; type: 'response'; command: 'design_open' | 'design_create' | 'design_save_guidelines'; success: true; data: { designId: string; snapshot: DesignRpcSnapshot } }
	| { id?: string; type: 'response'; command: 'design_get_snapshot' | 'design_check'; success: true; data: { snapshot?: DesignRpcSnapshot; checks?: Array<{ level: 'error' | 'warning' | 'info'; message: string }> } }
	| { id?: string; type: 'response'; command: 'design_preview'; success: true; data: { snapshot?: DesignRpcSnapshot; previewHandle: DesignPreviewHandle; checks?: Array<{ level: 'error' | 'warning' | 'info'; message: string }> } }
	| { id?: string; type: 'response'; command: 'design_prompt'; success: true; data: { requestId: string; runId: string } }
	| { id?: string; type: 'response'; command: 'design_follow_up'; success: true; data: { queued: true } }
	| { id?: string; type: 'response'; command: 'design_abort'; success: true }
	| { id?: string; type: 'response'; command: 'design_approval_response'; success: true }
	| { id?: string; type: 'response'; command: 'design_generate'; success: true; data: { requestId: string; snapshot?: DesignRpcSnapshot; summary?: string } }
	| { id?: string; type: 'response'; command: 'design_apply_patch' | 'design_revert'; success: true; data: { snapshot: DesignRpcSnapshot } }
	| { id?: string; type: 'response'; command: 'design_export'; success: true; data: { path: string } }
	| { id?: string; type: 'response'; command: 'mcp_list'; success: true; data: { servers: ManagedMcpServer[] } }
	| { id?: string; type: 'response'; command: 'mcp_save_server' | 'mcp_delete_server' | 'mcp_set_modes' | 'mcp_set_enabled' | 'mcp_reload'; success: true }
	| { id?: string; type: 'response'; command: 'get_state'; success: true; data: RpcSessionState }
	| { id?: string; type: 'response'; command: 'set_model'; success: true; data: ModelInfo }
	| { id?: string; type: 'response'; command: 'cycle_model'; success: true; data: { model: ModelInfo; thinkingLevel: ThinkingLevel; isScoped: boolean } | null }
	| { id?: string; type: 'response'; command: 'get_available_models'; success: true; data: { models: ModelInfo[] } }
	| { id?: string; type: 'response'; command: 'set_thinking_level'; success: true }
	| { id?: string; type: 'response'; command: 'cycle_thinking_level'; success: true; data: { level: ThinkingLevel } | null }
	| { id?: string; type: 'response'; command: 'get_available_thinking_levels'; success: true; data: { levels: ThinkingLevel[] } }
	| { id?: string; type: 'response'; command: 'get_tree'; success: true; data: { tree: SessionTreeNode[]; leafId: string | null } }
	| { id?: string; type: 'response'; command: 'list_sessions'; success: true; data: { sessions: SessionListItem[] } }
	| { id?: string; type: 'response'; command: 'get_entries'; success: true; data: { entries: SessionEntry[]; leafId: string | null } }
	| { id?: string; type: 'response'; command: 'get_messages'; success: true; data: { messages: unknown[] } }
	| { id?: string; type: 'response'; command: 'switch_session'; success: true; data: { cancelled: boolean; snapshot?: RpcDesktopSessionSnapshot } }
	| { id?: string; type: 'response'; command: 'get_session_snapshot'; success: true; data: RpcDesktopSessionSnapshot }
	| { id?: string; type: 'response'; command: 'set_session_name'; success: true }
	| { id?: string; type: 'response'; command: 'export_html'; success: true; data: { path: string } }
	| { id?: string; type: 'response'; command: 'get_commands'; success: true; data: { commands: RpcSlashCommand[] } }
	| { id?: string; type: 'response'; command: 'execute_command'; success: true }
	| { id?: string; type: 'response'; command: 'set_token'; success: true }
	| { id?: string; type: 'response'; command: 'get_platform_account'; success: true; data: PlatformAccount }
	| { id?: string; type: 'response'; command: 'get_platform_connection'; success: true; data: PlatformConnection }
	| { id?: string; type: 'response'; command: 'get_platform_projects'; success: true; data: { projects: Array<{ id: number; name: string; status?: string; description?: string; owner?: string }> } }
	| { id?: string; type: 'response'; command: 'logout'; success: true }
	| { id?: string; type: 'response'; command: string; success: false; error: string };

// ============================================================================
// Slash 命令
// ============================================================================

export interface RpcSlashCommand {
	name: string;
	description?: string;
	source: 'extension' | 'prompt' | 'skill';
	sourceInfo: SourceInfo;
	/** 宿主侧动作：prompt 透传给扩展、open_local_review 打开本地审查工作台、open_rtk_settings 打开 RTK 设置 */
	hostAction?: 'prompt' | 'open_local_review' | 'open_rtk_settings';
	/** UI 能力：rpc-standard 走标准 RPC 事件、tui-custom 需原生 GUI 适配、none 无 UI */
	uiCapability?: 'rpc-standard' | 'tui-custom' | 'none';
}

// ============================================================================
// Extension UI 事件（sidecar -> 桌面版，stdout）
// ============================================================================

/**
 * 扩展交互请求的来源会话。
 *
 * Desktop 在切换任务时会先乐观更新选中态，不能再用事件到达时的选中任务推断归属。
 */
export interface RpcExtensionUISessionMetadata {
	sessionFile?: string;
}

export type RpcExtensionUIRequest = (
	| { type: 'extension_ui_request'; id: string; method: 'select'; title: string; options: string[]; timeout?: number }
	| { type: 'extension_ui_request'; id: string; method: 'confirm'; title: string; message: string; timeout?: number }
	| { type: 'extension_ui_request'; id: string; method: 'input'; title: string; placeholder?: string; timeout?: number }
	| { type: 'extension_ui_request'; id: string; method: 'editor'; title: string; prefill?: string }
	| { type: 'extension_ui_request'; id: string; method: 'notify'; message: string; notifyType?: 'info' | 'warning' | 'error' }
	| { type: 'extension_ui_request'; id: string; method: 'setStatus'; statusKey: string; statusText: string | undefined }
	| { type: 'extension_ui_request'; id: string; method: 'setWidget'; widgetKey: string; widgetLines: string[] | undefined; widgetPlacement?: 'aboveEditor' | 'belowEditor' }
	| { type: 'extension_ui_request'; id: string; method: 'setTitle'; title: string }
	| { type: 'extension_ui_request'; id: string; method: 'set_editor_text'; text: string }
) & RpcExtensionUISessionMetadata;

// ============================================================================
// 事件流（sidecar -> 桌面版，stdout）
// ============================================================================

/**
 * Agent 会话事件载体。
 * 实际子类型由 pi-agent-core 的 AgentSessionEvent 定义，结构复杂且高度依赖
 * pi 内部类型。桌面版在事件分流层按 type 字段细化，此处用宽松载体。
 */
export interface AgentSessionEvent {
	type: string;
	[k: string]: unknown;
}

/** sidecar 经 stdout 输出的所有 JSONL 行类型 */
export type RpcStreamLine = RpcResponse | RpcExtensionUIRequest | AgentSessionEvent | { type: string; [k: string]: unknown };

// ============================================================================
// 命令类型辅助
// ============================================================================

export type RpcCommandType = RpcCommand['type'];

/** 由命令名提取带 id 的响应类型 */
export type ResponseFor<C extends string> = Extract<RpcResponse, { command: C }>;
