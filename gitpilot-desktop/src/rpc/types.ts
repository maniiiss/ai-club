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
	/** 平台模型相对 1x 基准价的倍率；缺失表示 free。 */
	billingMultiplier?: number;
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

export type SandboxMode = 'windows-native' | 'gondolin';
export type ApprovalDecision = 'approve_once' | 'approve_session' | 'deny';
export type ApprovalRisk = 'write' | 'command' | 'outside_workspace' | 'network' | 'dangerous';
export type SessionApprovalMode = 'per_request' | 'full_access';
export interface SecurityPolicy { sandboxMode: SandboxMode; network: 'deny-by-default'; approvalPolicy: 'read-auto-write-command-approve'; defaultTimeoutSeconds: number; maxTimeoutSeconds: number; }
export interface SandboxStatus { mode: SandboxMode; available: boolean; initialized: boolean; message?: string; workspacePath?: string; guestWorkspacePath?: string; wsl2Installed?: boolean; virtualizationReady?: boolean; distributionInstalled?: boolean; nodeInstalled?: boolean; gondolinWorkerInstalled?: boolean; }
export interface SecurityApprovalRequest { type: 'approval_required'; approvalId: string; sessionId: string; toolName: string; risk: ApprovalRisk; title: string; summary: string; command?: string; paths?: string[]; cwd: string; expiresAt: number; }

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

/** 预解析后的附件：图片带 image，文档/文本带 text，工作项带上下文载荷，统一带元数据与 warnings。 */
export interface PreparedAttachment {
	name: string;
	path?: string;
	kind: 'image' | 'document' | 'text' | 'work-item';
	mimeType: string;
	sizeBytes: number;
	text?: string;
	image?: ImageContent;
	/** 工作项标签对应的原始摘要，便于草稿恢复和发送前确认。 */
	workItem?: RpcWorkItemSummary;
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
/**
 * sidecar 推送到 Desktop 的 Work 执行过程事件；必须与 gitpilot-cli rpc-mode 的 work_* 输出保持同步。
 * 业务意图：Work 对话与 Code 模式一致，在输出正文中穿插展示思考与工具调用，
 * 这些事件是执行过程进入渲染与持久化链路的唯一数据源。
 */
export type WorkStreamEvent =
	| { type: 'work_delta'; taskId: string; delta: string }
	| { type: 'work_thinking_delta'; taskId: string; delta: string }
	| { type: 'work_message_end'; taskId: string; text: string }
	| { type: 'work_tool_started'; taskId: string; toolCallId: string; toolName: string; args?: unknown }
	| { type: 'work_tool_updated'; taskId: string; toolCallId: string; toolName: string; partialResult?: unknown }
	| { type: 'work_tool_completed'; taskId: string; toolCallId: string; toolName: string; result?: unknown; isError?: boolean };
/** Code 右侧文件树的只读条目；文件内容仍由现有附件预处理链路按需读取。 */
export interface CodeProjectFileEntry {
	path: string;
	name: string;
	kind: 'file' | 'directory';
	size?: number;
	updatedAt?: number;
}
export interface CodeProjectFileList {
	rootPath: string;
	entries: CodeProjectFileEntry[];
	truncated: boolean;
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
/** Design UI 对话气泡的 sidecar 持久化视图，不包含内部 prompt、工具参数或文件正文。 */
export type DesignRpcMessage =
	| { id: string; kind: 'user'; text: string; status?: 'queued' | 'sent' | 'cancelled' }
	| { id: string; kind: 'assistant'; text: string }
	| { id: string; kind: 'error'; text: string }
	| { id: string; kind: 'result'; revisionId: string; summary: string };
/** 上传 Design 修订到 Web 后返回的远端版本摘要。 */
export interface DesignUploadResult {
	versionId: number;
	versionNumber: number;
	status: 'DRAFT' | 'CURRENT' | 'ARCHIVED';
	projectId: number;
	designId: string;
	revisionId: string;
	createdAt: string;
}
/** sidecar 构建的受控预览载荷；Desktop 只把 html 放进 sandbox iframe。 */
export interface DesignPreviewHandle { id: string; projectId: string; designId: string; pageId: string; revisionId: string; html: string; expiresAt: number }
export type DesignPatchOperation =
	| { op: 'create_file'; path: string; content: string; language: DesignRpcFile['language'] }
	| { op: 'replace_file'; path: string; content: string }
	| { op: 'replace_text'; path: string; search: string; replacement: string }
	| { op: 'insert_text'; path: string; anchor: string; text: string; position: 'before' | 'after'; occurrence?: number }
	| { op: 'rename_file'; path: string; newPath: string }
	| { op: 'delete_file'; path: string };
export interface DesignPatch { baseRevisionId: string; operations: DesignPatchOperation[]; affectedPaths?: string[]; summary?: string; risk?: 'safe' | 'high'; operationId?: string }
/**
 * Design 只消费 UI 所需的轻量执行事件；完整 patch 参数和工具输出禁止进入 WebView。
 * 必须与 gitpilot-cli 的同名协议保持同步。
 */
export type DesignAgentEvent =
	| { type: 'compaction_start' }
	| { type: 'compaction_end'; result: boolean; errorMessage?: string }
	| { type: 'message_update'; assistantMessageEvent: { type: 'thinking_delta' | 'text_delta'; delta: string } }
	| { type: 'message_end'; message: { role: 'assistant'; content: Array<{ type: 'text'; text: string }> } }
	| { type: 'tool_execution_start' | 'tool_execution_update' | 'tool_execution_end'; toolCallId: string; toolName: string; summary?: string; isError?: boolean };
export interface DesignStreamEvent { type: 'design_event'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; event: DesignAgentEvent }
export interface DesignPatchAppliedEvent { type: 'design_patch_applied'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; operationId: string; revisionId: string; pageId: string; summary: string; changedFiles: DesignRpcFile[]; removedPaths: string[]; /** Agent run 中的增量 patch 是 draft，终态快照才创建正式历史 revision。 */ isDraft?: boolean }
export interface DesignApprovalRequiredEvent { type: 'design_approval_required'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; approvalId: string; pageId: string; patch: DesignPatch; reason: string }
/** Design Agent 发现关键歧义时暂停当前工具调用，等待用户输入后恢复同一次运行。 */
export interface DesignClarificationRequiredEvent { type: 'design_clarification_required'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; clarificationId: string; question: string; context?: string; options: string[] }
/** 复杂任务由模型通过 update_plan 提交，简单任务由 skip_plan 显式跳过。 */
export interface DesignPlanStep { id: string; text: string; state: 'pending' | 'active' | 'done' }
export interface DesignPlanUpdatedEvent { type: 'design_plan_updated'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; steps: DesignPlanStep[]; explanation?: string }
export interface DesignRunSettledEvent { type: 'design_run_settled'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; snapshot: DesignRpcSnapshot }
export interface DesignErrorEvent { type: 'design_error'; projectId?: string; projectPath?: string; designId: string; requestId: string; runId?: string; sequence: number; emittedAt: number; error: string }

/**
 * Design 工作区重新打开或前端重连时恢复的最小运行态。
 * 业务意图：审批正文可能很大，不重复传回完整 patch；只恢复继续审批所需的标识和原因，
 * 页面正文仍以 canonical snapshot 为准，避免把审批恢复变成新的大对象传输。
 */
export interface DesignRunRecoveryState {
	status: 'idle' | 'running' | 'awaiting_approval' | 'awaiting_clarification';
	phase: 'idle' | 'thinking' | 'responding' | 'tool' | 'applying_patch' | 'compacting' | 'awaiting_approval' | 'awaiting_clarification';
	requestId: string | null;
	runId: string | null;
	sequence: number;
	pendingApproval?: { approvalId: string; pageId: string; reason: string };
	pendingClarification?: { clarificationId: string; question: string; context?: string; options: string[] };
}
export type DesignStreamLine = DesignStreamEvent | DesignPatchAppliedEvent | DesignApprovalRequiredEvent | DesignClarificationRequiredEvent | DesignPlanUpdatedEvent | DesignRunSettledEvent | DesignErrorEvent;
export type McpMode = 'code' | 'work' | 'design';
export type McpTransport = 'stdio' | 'http' | 'sse' | 'unknown';
/** 与 sidecar 同构的 MCP 定义；env/headers 的值在列表响应中统一是脱敏占位符。 */
export interface McpServerDefinition { command?: string; args?: string[]; url?: string; env?: Record<string, string>; headers?: Record<string, string>; cwd?: string; httpTransport?: 'streamable-http' | 'sse'; requestTimeoutMs?: number; disabled?: boolean; [key: string]: unknown; }
export interface ManagedMcpServer { name: string; source: 'global' | 'project' | 'project-override'; enabled: boolean; modes: McpMode[]; definition: McpServerDefinition; transport: McpTransport; }
export type SkillMode = McpMode;
export interface ManagedSkill { id: string; name: string; description: string; source: 'builtin' | 'personal'; filePath: string; enabled: boolean; modes: SkillMode[]; disableModelInvocation: boolean; }
export interface SkillReloadResult { reloadedModes: SkillMode[]; deferredModes: SkillMode[]; }

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
	/** sidecar 提供的完整历史文本；旧 sidecar 未提供时由桌面端回退到标题和首条消息。 */
	allMessagesText?: string;
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

/** Code 任务收口后的最终工作区 diff；只描述本次任务触及路径的净结果。 */
export interface WorkspaceChangedFile {
	path: string;
	status: 'modified' | 'added' | 'deleted';
	added: number;
	removed: number;
	diff?: string;
}
export interface WorkspaceChangeSet {
	version: 1;
	source: 'git';
	files: WorkspaceChangedFile[];
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
	| { id?: string; type: 'code_file_list' }
	| { id?: string; type: 'new_work_session'; taskId: string; workspacePath?: string }
	| { id?: string; type: 'work_prompt'; taskId: string; message: string }
	| { id?: string; type: 'work_abort'; requestId?: string }
	| { id?: string; type: 'work_file_list'; taskId: string }
	| { id?: string; type: 'work_file_read'; taskId: string; path: string }
	| { id?: string; type: 'work_file_write'; taskId: string; path: string; content: string }
	| { id?: string; type: 'work_file_delete'; taskId: string; path: string }
	| { id?: string; type: 'work_file_rename'; taskId: string; path: string; newPath: string }
	| { id?: string; type: 'work_prepare_attachments'; items: AttachmentInput[] }
	// 工作项协同浏览：右侧栏只读分页，与 Work AgentSession 无关，不进模型上下文。
	| { id?: string; type: 'work_project_list' }
	| { id?: string; type: 'work_item_page'; page?: number; size?: number; status?: string; priority?: string; projectId?: number; keyword?: string; workItemType?: string }
	| { id?: string; type: 'work_item_detail'; workItemId: number }
	| { id?: string; type: 'design_open'; projectPath: string }
	| { id?: string; type: 'design_sync_messages'; projectPath: string; designId: string; messages: DesignRpcMessage[] }
	| { id?: string; type: 'design_save_guidelines'; projectPath: string; designId: string; guidelines: DesignProjectGuidelines }
	| { id?: string; type: 'design_rename_page'; projectPath: string; designId: string; pageId: string; name: string; baseRevisionId: string }
	| { id?: string; type: 'design_create'; projectPath: string; name?: string }
	| { id?: string; type: 'design_get_snapshot'; projectPath: string; designId: string }
	| { id?: string; type: 'design_get_revision'; projectPath: string; designId: string; revisionId: string }
	/** uiMessageId 由 Desktop 生成并贯穿 sidecar/UI 同一条气泡，避免恢复时重复显示用户消息。 */
	| { id?: string; type: 'design_prompt'; projectPath: string; designId: string; pageId: string; prompt: string; baseRevisionId?: string; targetProfiles: Array<'mobile' | 'tablet' | 'desktop'>; uiMessageId?: string }
	| { id?: string; type: 'design_clarification_response'; projectPath: string; designId: string; clarificationId: string; answer: string }
	| { id?: string; type: 'design_follow_up'; projectPath: string; designId: string; message: string }
	| { id?: string; type: 'design_abort'; projectPath: string; designId: string }
	| { id?: string; type: 'design_approval_response'; projectPath: string; designId: string; approvalId: string; approved: boolean }
	| { id?: string; type: 'design_generate'; projectPath: string; designId: string; pageId: string; prompt: string; baseRevisionId?: string; targetProfiles: Array<'mobile' | 'tablet' | 'desktop'> }
	| { id?: string; type: 'design_apply_patch'; projectPath: string; designId: string; pageId: string; baseRevisionId: string; patch: Record<string, unknown> }
	| { id?: string; type: 'design_preview'; projectPath: string; designId: string; pageId: string; revisionId?: string }
	| { id?: string; type: 'design_check'; projectPath: string; designId: string; pageId: string; revisionId?: string }
	| { id?: string; type: 'design_revert'; projectPath: string; designId: string; revisionId: string }
	| { id?: string; type: 'design_upload'; projectPath: string; designId: string; revisionId: string; platformProjectId: number; title?: string; summary?: string }
	| { id?: string; type: 'design_export'; projectPath: string; designId: string; outputPath?: string }
	| { id?: string; type: 'mcp_list' }
	| { id?: string; type: 'mcp_save_server'; name: string; previousName?: string; definition: McpServerDefinition; modes: McpMode[] }
	| { id?: string; type: 'mcp_copy_server'; name: string }
	| { id?: string; type: 'mcp_delete_server'; name: string }
	| { id?: string; type: 'mcp_set_modes'; name: string; modes: McpMode[] }
	| { id?: string; type: 'mcp_set_enabled'; name: string; enabled: boolean }
	| { id?: string; type: 'mcp_reload' }
	| { id?: string; type: 'skill_list' }
	| { id?: string; type: 'skill_set_enabled'; name: string; enabled: boolean }
	| { id?: string; type: 'skill_set_modes'; name: string; modes: SkillMode[] }
	| { id?: string; type: 'skill_reload' }
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
	// 标题栏刷新按钮：强制 sidecar 联网重拉平台模型清单并重解析当前模型，
	// 让管理端新配置（visionRouting、输入模态等）无需重启即可生效。
	| { id?: string; type: 'refresh_models' }
	// 桌面版登录后注入平台 gpt_ token（复用 sidecar saveCliToken）
	| { id?: string; type: 'set_token'; platformUrl: string; token: string }
	| { id?: string; type: 'approval_response'; approvalId: string; decision: ApprovalDecision }
       | { id?: string; type: 'get_security_policy' }
       | { id?: string; type: 'set_security_policy'; policy: Partial<SecurityPolicy> }
       | { id?: string; type: 'set_session_approval_mode'; mode: SessionApprovalMode }
	// 账户菜单的只读摘要与受控登出。
	| { id?: string; type: 'get_platform_account' }
	| { id?: string; type: 'get_platform_connection' }
	/** Design 入口绑定 Web 端项目时使用的只读项目查询。 */
	| { id?: string; type: 'get_platform_projects'; keyword?: string }
	/** 输入框工作项入口查询当前用户负责的需求、任务和缺陷。 */
	| { id?: string; type: 'get_platform_work_items' }
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
	/** 最近一次已收口 Code 任务的最终工作区 diff。 */
	workspaceChanges?: WorkspaceChangeSet;
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
	| { id?: string; type: 'response'; command: 'code_file_list'; success: true; data: CodeProjectFileList }
	| { id?: string; type: 'response'; command: 'new_work_session'; success: true; data: { taskId: string; sessionId: string; sessionPath: string; workspacePath: string; title: string } }
	| { id?: string; type: 'response'; command: 'work_prompt'; success: true; data: { requestId: string } }
	| { id?: string; type: 'response'; command: 'work_abort'; success: true }
	| { id?: string; type: 'response'; command: 'work_file_list'; success: true; data: { taskId: string; files: WorkFileSnapshot[] } }
	| { id?: string; type: 'response'; command: 'work_file_read'; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: 'response'; command: 'work_file_write'; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: 'response'; command: 'work_file_delete'; success: true; data: { taskId: string; path: string } }
	| { id?: string; type: 'response'; command: 'work_file_rename'; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: 'response'; command: 'work_prepare_attachments'; success: true; data: { attachments: PreparedAttachment[] } }
	| { id?: string; type: 'response'; command: 'design_open' | 'design_create' | 'design_save_guidelines' | 'design_rename_page'; success: true; data: { designId: string; snapshot: DesignRpcSnapshot; messages?: DesignRpcMessage[]; execution?: DesignRunRecoveryState } }
	| { id?: string; type: 'response'; command: 'design_sync_messages'; success: true; data: { designId: string; messages: DesignRpcMessage[] } }
	| { id?: string; type: 'response'; command: 'design_get_snapshot' | 'design_get_revision' | 'design_check'; success: true; data: { snapshot?: DesignRpcSnapshot; checks?: Array<{ level: 'error' | 'warning' | 'info'; message: string }> } }
	| { id?: string; type: 'response'; command: 'design_preview'; success: true; data: { snapshot?: DesignRpcSnapshot; previewHandle: DesignPreviewHandle; checks?: Array<{ level: 'error' | 'warning' | 'info'; message: string }> } }
	| { id?: string; type: 'response'; command: 'design_prompt'; success: true; data: { requestId: string; runId: string } }
	| { id?: string; type: 'response'; command: 'design_clarification_response'; success: true }
	| { id?: string; type: 'response'; command: 'design_follow_up'; success: true; data: { queued: true } }
	| { id?: string; type: 'response'; command: 'design_abort'; success: true }
	| { id?: string; type: 'response'; command: 'design_approval_response'; success: true }
	| { id?: string; type: 'response'; command: 'design_generate'; success: true; data: { requestId: string; snapshot?: DesignRpcSnapshot; summary?: string } }
	| { id?: string; type: 'response'; command: 'design_apply_patch' | 'design_revert'; success: true; data: { snapshot: DesignRpcSnapshot } }
	| { id?: string; type: 'response'; command: 'design_upload'; success: true; data: { upload: DesignUploadResult } }
	| { id?: string; type: 'response'; command: 'design_export'; success: true; data: { path: string } }
	| { id?: string; type: 'response'; command: 'mcp_list'; success: true; data: { servers: ManagedMcpServer[] } }
	| { id?: string; type: 'response'; command: 'mcp_copy_server'; success: true; data: { name: string } }
	| { id?: string; type: 'response'; command: 'mcp_save_server' | 'mcp_delete_server' | 'mcp_set_modes' | 'mcp_set_enabled' | 'mcp_reload'; success: true }
	| { id?: string; type: 'response'; command: 'skill_list'; success: true; data: { skills: ManagedSkill[]; diagnostics: Array<{ type: string; message: string; path?: string }> } }
	| { id?: string; type: 'response'; command: 'skill_set_enabled' | 'skill_set_modes' | 'skill_reload'; success: true; data: SkillReloadResult }
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
	| { id?: string; type: 'response'; command: 'refresh_models'; success: true; data: { models: ModelInfo[] } }
	| { id?: string; type: 'response'; command: 'set_token'; success: true }
	| { id?: string; type: 'response'; command: 'get_platform_account'; success: true; data: PlatformAccount }
	| { id?: string; type: 'response'; command: 'get_platform_connection'; success: true; data: PlatformConnection }
	| { id?: string; type: 'response'; command: 'approval_response'; success: true }
       | { id?: string; type: 'response'; command: 'get_security_policy'; success: true; data: { policy: SecurityPolicy; sandbox: SandboxStatus; approvalMode: SessionApprovalMode; pendingApprovals: Omit<SecurityApprovalRequest, 'type'>[] } }
       | { id?: string; type: 'response'; command: 'set_security_policy'; success: true; data: { policy: SecurityPolicy; sandbox: SandboxStatus } }
       | { id?: string; type: 'response'; command: 'set_session_approval_mode'; success: true; data: { approvalMode: SessionApprovalMode } }
	| { id?: string; type: 'response'; command: 'get_platform_projects'; success: true; data: { projects: Array<{ id: number; name: string; status?: string; description?: string; owner?: string }> } }
	| { id?: string; type: 'response'; command: 'get_platform_work_items'; success: true; data: { items: RpcWorkItemSummary[] } }
	| { id?: string; type: 'response'; command: 'work_project_list'; success: true; data: { projects: RpcWorkProjectSummary[] } }
	| { id?: string; type: 'response'; command: 'work_item_page'; success: true; data: RpcWorkItemPage }
	| { id?: string; type: 'response'; command: 'work_item_detail'; success: true; data: { detail: RpcWorkItemDetail; links: RpcWorkItemLinks } }
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

/** 桌面端工作项入口使用的轻量摘要，避免把完整需求文档加载到弹层。 */
export interface RpcWorkItemSummary {
	id: number;
	workItemCode: string;
	name: string;
	workItemType: string;
	status: string;
	priority: string | null;
	assignee: string | null;
	taskType: string | null;
	projectId: number | null;
	projectName: string | null;
	iterationId: number | null;
	iterationName: string | null;
	planStartDate: string | null;
	planEndDate: string | null;
	requirementMarkdown: string | null;
}

// ============================================================================
// 工作项协同浏览（右侧栏分页浏览，只读，不进模型上下文）
// ============================================================================

/** 协同浏览的项目下拉条目。 */
export interface RpcWorkProjectSummary {
	id: number;
	name: string;
	status?: string;
	description?: string;
	owner?: string;
}

/** 协同浏览的工作项列表行；requirementMarkdown 大字段只在详情态返回，列表不携带。 */
export interface RpcWorkItemListItem {
	id: number;
	workItemCode: string;
	name: string;
	workItemType: string;
	status: string;
	priority: string | null;
	assignee: string | null;
	taskType: string | null;
	projectId: number | null;
	projectName: string | null;
	iterationId: number | null;
	iterationName: string | null;
	planStartDate: string | null;
	planEndDate: string | null;
}

/** 协同浏览的工作项分页结果。 */
export interface RpcWorkItemPage {
	records: RpcWorkItemListItem[];
	total: number;
	page: number;
	size: number;
	totalPages: number;
}

/** 工作项详情：列表字段 + 详情态专属字段（描述、需求正文、创建人、原型与模块信息）。 */
export interface RpcWorkItemDetail extends RpcWorkItemListItem {
	description: string | null;
	requirementMarkdown: string | null;
	creatorName: string | null;
	prototypeUrl: string | null;
	moduleName: string | null;
}

/** 工作项关联的测试用例摘要。 */
export interface RpcWorkItemTestCase {
	id: number;
	title: string;
	moduleName: string | null;
	caseType: string | null;
	priority: string | null;
	testPlanName: string | null;
}

/** 工作项关联的附件摘要。 */
export interface RpcWorkItemAttachment {
	id: number;
	fileName: string;
	contentType: string | null;
	fileSize: number;
}

/** 工作项的关联资源集合。 */
export interface RpcWorkItemLinks {
	children: RpcWorkItemListItem[];
	parentWorkItems: RpcWorkItemListItem[];
	relatedWorkItems: RpcWorkItemListItem[];
	testCases: RpcWorkItemTestCase[];
	attachments: RpcWorkItemAttachment[];
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
