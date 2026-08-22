/**
 * RPC protocol types for headless operation.
 *
 * Commands are sent as JSON lines on stdin.
 * Responses and events are emitted as JSON lines on stdout.
 */

import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ImageContent, Model } from "@earendil-works/pi-ai";
import type { AgentSessionEvent, SessionStats } from "../../core/agent-session.ts";
import type {
	AgentExecutionSnapshot,
	AgentExecutionSummary,
} from "../../core/agent-execution-state.ts";
import type { AttachmentInput, PreparedAttachment } from "../../core/attachments/prepare-attachment.ts";
import type { BashResult } from "../../core/bash-executor.ts";
import type { CompactionResult } from "../../core/compaction/index.ts";
import type { GitBranchInfo, GitDiffResult, GitRepositoryState } from "../../core/git/git-types.ts";
import type { SessionEntry, SessionInfo, SessionTreeNode } from "../../core/session-manager.ts";
import type { SourceInfo } from "../../core/source-info.ts";
import type { WorkspaceChangeSet } from "../../core/workspace-changes.ts";
import type { ManagedMcpServer, McpServerDefinition } from "../../extensions/gitpilot/mcp-manager.ts";
import type { ApprovalDecision, SecurityApprovalRequest, SecurityPolicy, SandboxStatus, SessionApprovalMode } from "../../core/security/security-policy.ts";

export type SkillMode = "code" | "work" | "design";
export interface ManagedSkill {
	id: string;
	name: string;
	description: string;
	source: "builtin" | "personal";
	filePath: string;
	enabled: boolean;
	modes: SkillMode[];
	disableModelInvocation: boolean;
}
export interface SkillReloadResult {
	reloadedModes: SkillMode[];
	deferredModes: SkillMode[];
}

/** 桌面标题栏展示的登录账户摘要，令牌绝不通过 RPC 返回。 */
export interface RpcPlatformAccount {
	platformUrl: string;
	user: { id: number; username: string; nickname?: string; avatarUrl?: string };
	creditBalance: number | null;
}

/**
 * GitPilot 平台后端的可用性摘要。
 * 业务意图：桌面端以一次需要凭据的轻量请求同时确认后端可达与登录令牌有效，
 * 不把令牌、网络错误原文或账户资料暴露给渲染层。
 */
export interface RpcPlatformConnection {
	connected: boolean;
}

/** Work 对话只传递本机任务文本；它与 Code 会话、cwd 和 token 严格隔离。 */
export interface WorkConversationMessage { role: "user" | "assistant"; content: string }
export interface WorkResearchSource { id: string; title: string; url: string; snippet: string; publishedAt?: string }
export interface WorkFileSnapshot { path: string; name: string; type: string; size: number; updatedAt: number; content?: string }

// ============================================================================
// 工作项协同浏览（右侧栏分页浏览，只读，不进模型上下文）
// ============================================================================

/** 协同浏览的项目下拉条目（与 CliProjectSummary 字段对齐）。 */
export interface RpcWorkProjectSummary {
	id: number;
	name: string;
	status?: string;
	description?: string;
	owner?: string;
}

/** 协同浏览的工作项列表行；requirementMarkdown 大字段只在详情态出现，列表不携带。 */
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

/** 平台分页响应（与后端 PageResponse 对齐）。 */
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

/** 工作项关联的测试用例摘要（TaskLinksSummary.LinkedTestCaseSummary 的最小消费视图）。 */
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

/** 工作项的关联资源集合；children/parent/related 只保留列表行必需的轻量字段。 */
export interface RpcWorkItemLinks {
	children: RpcWorkItemListItem[];
	parentWorkItems: RpcWorkItemListItem[];
	relatedWorkItems: RpcWorkItemListItem[];
	testCases: RpcWorkItemTestCase[];
	attachments: RpcWorkItemAttachment[];
}
/** Code 右侧文件树的只读条目；文件内容仍由现有附件预处理链路按需读取。 */
export interface CodeProjectFileEntry {
	path: string;
	name: string;
	kind: "file" | "directory";
	size?: number;
	updatedAt?: number;
}
export interface CodeProjectFileList {
	rootPath: string;
	entries: CodeProjectFileEntry[];
	truncated: boolean;
}
/** Design 文件是项目根目录下的 canonical 资源，path 永远相对项目根目录。 */
export interface DesignRpcFile {
	id?: string;
	path: string;
	scope?: "page" | "shared" | "asset";
	language: "html" | "css" | "javascript" | "json" | "image" | "unknown";
	content: string;
	hash?: string;
}

/**
 * Design Mode 的视觉事实源。Canvas 节点只保存设计语义，不允许携带 HTML/CSS/JavaScript 源码。
 * 业务意图：Desktop、sidecar 和平台版本都消费同一份可校验场景，而不是各自重建页面。
 */
export interface CanvasDesignDocument {
	schemaVersion: 2;
	id: string;
	name: string;
	revision: number;
	updatedAt: string;
	entryPageId: string;
	pages: Array<Record<string, unknown>>;
	nodes: Record<string, Record<string, unknown>>;
	assets: Record<string, Record<string, unknown>>;
	guidelines?: DesignProjectGuidelines;
}

export type CanvasDesignOperation =
	| { op: "create_node"; node: Record<string, unknown>; parentId: string; index?: number }
	| { op: "update_node"; nodeId: string; changes: Record<string, unknown> }
	| { op: "delete_node"; nodeId: string }
	| { op: "move_node"; nodeId: string; parentId: string; index: number }
	| { op: "update_text"; nodeId: string; text: Record<string, unknown> }
	| { op: "update_path"; nodeId: string; path: Record<string, unknown> }
	| { op: "attach_asset"; nodeId: string; assetId: string };

export interface CanvasDesignTransaction {
	transactionId: string;
	baseRevision: number;
	source: "user" | "ai" | "system";
	operations: CanvasDesignOperation[];
	summary: string;
	createdAt: string;
}
export interface DesignProjectContext { projectId: string; projectPath: string; designId: string }
/** 项目级长期设计约束，和某次页面 revision 分开保存，供后续 Design run 稳定继承。 */
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
	accessibility: { minContrast: "AA" | "AAA" };
	updatedAt: string;
}
export interface DesignRpcSnapshot { document: Record<string, unknown>; files: DesignRpcFile[]; context?: DesignProjectContext; guidelines?: DesignProjectGuidelines }
/**
 * Design 对话气泡的轻量持久化载荷；canonical 文件和 Agent 内部消息仍由各自会话负责保存。
 * 业务意图：桌面端重启后能够恢复用户真正看到的消息，同时不把 UI 状态塞进 localStorage。
 */
export type DesignRpcMessage =
	| { id: string; kind: "user"; text: string; status?: "queued" | "sent" | "cancelled" }
	| { id: string; kind: "assistant"; text: string }
	| { id: string; kind: "error"; text: string }
	| { id: string; kind: "result"; revisionId: string; summary: string };
/** 上传 Design 修订到 Web 后返回的远端版本摘要。 */
export interface DesignUploadResult {
	versionId: number;
	versionNumber: number;
	status: "DRAFT" | "CURRENT" | "ARCHIVED";
	projectId: number;
	designId: string;
	revisionId: string;
	createdAt: string;
}
/** sidecar 构建的受控场景检查载荷；预览不再生成 HTML。 */
export interface DesignPreviewHandle {
	id: string;
	projectId: string;
	designId: string;
	pageId: string;
	revisionId: string;
	scene: CanvasDesignDocument;
	checks: Array<{ level: "error" | "warning" | "info"; message: string }>;
	expiresAt: number;
}
/** Design Mode 只接受场景图事务；文件 patch 属于旧 HTML 工作区协议，已明确下线。 */
export type DesignPatchOperation = CanvasDesignOperation;
export interface DesignPatch { baseRevisionId: string; operations: DesignPatchOperation[]; affectedPaths?: string[]; summary?: string; risk?: "safe" | "high"; operationId?: string }
export interface DesignStreamMetadata extends DesignProjectContext { requestId: string; runId?: string; sequence: number; emittedAt: number }
/**
 * 发往 Desktop 的 Design 执行事件是原始 Agent 事件的轻量投影。
 * 业务意图：patch 参数与工具原始输出可能包含整份页面代码，不能跨进程传输或驻留在 UI 状态中。
 */
export type DesignAgentEvent =
	| { type: "compaction_start" }
	| { type: "compaction_end"; result: boolean; errorMessage?: string }
	| { type: "message_update"; assistantMessageEvent: { type: "thinking_delta" | "text_delta"; delta: string } }
	| { type: "message_end"; message: { role: "assistant"; content: Array<{ type: "text"; text: string }> } }
	| { type: "tool_execution_start" | "tool_execution_update" | "tool_execution_end"; toolCallId: string; toolName: string; summary?: string; isError?: boolean };
export interface DesignStreamEvent extends DesignStreamMetadata { type: "design_event"; event: DesignAgentEvent }
export interface DesignPatchAppliedEvent extends DesignStreamMetadata { type: "design_patch_applied"; operationId: string; revisionId: string; pageId: string; summary: string; transaction: CanvasDesignTransaction; affectedNodeIds: string[]; /** Agent run 中的增量 patch 仍是 draft，不应在 Desktop 侧新增历史 revision。 */ isDraft?: boolean; /** 当前 run 的稳定 draft 身份；旧 sidecar 不提供时由 Desktop 使用 revisionId 回退。 */ draftRevisionId?: string; /** 已接受的 patch 批次编号，不代表模型进度百分比。 */ operationIndex?: number; /** page-local 脏矩形，供渲染器后续裁剪使用。 */ dirtyRects?: Array<{ x: number; y: number; width: number; height: number }> }
export interface DesignApprovalRequiredEvent extends DesignStreamMetadata { type: "design_approval_required"; approvalId: string; pageId: string; patch: DesignPatch; reason: string }
/** Design Agent 发现关键歧义时暂停当前工具调用，等待 Desktop 返回用户决策。 */
export interface DesignClarificationRequiredEvent extends DesignStreamMetadata { type: "design_clarification_required"; clarificationId: string; question: string; context?: string; options: string[] }
/** 复杂任务由模型通过 update_plan 提交，简单任务由 skip_plan 显式跳过。 */
export interface DesignPlanStep { id: string; text: string; state: "pending" | "active" | "done" }
export interface DesignPlanUpdatedEvent extends DesignStreamMetadata { type: "design_plan_updated"; steps: DesignPlanStep[]; explanation?: string }
export interface DesignRunSettledEvent extends DesignStreamMetadata { type: "design_run_settled"; snapshot: DesignRpcSnapshot; reason?: "completed" | "interrupted" }
export interface DesignErrorEvent extends DesignStreamMetadata { type: "design_error"; error: string }

/**
 * Design 工作区重新打开或前端重连时恢复的最小运行态。
 * 业务意图：审批正文可能很大，不重复传回完整 patch；只恢复继续审批所需的标识和原因，
 * 页面正文仍以 canonical snapshot 为准；active draft 若需要重连由 design_open 单独返回一次 draftSnapshot。
 */
export interface DesignRunRecoveryState {
	status: "idle" | "running" | "awaiting_approval" | "awaiting_clarification";
	phase: "idle" | "thinking" | "responding" | "tool" | "applying_patch" | "compacting" | "awaiting_approval" | "awaiting_clarification";
	requestId: string | null;
	runId: string | null;
	sequence: number;
	pendingApproval?: { approvalId: string; pageId: string; reason: string };
	pendingClarification?: { clarificationId: string; question: string; context?: string; options: string[] };
}

/** Design 打开时返回的草稿摘要；不携带完整 patch，避免恢复响应复制整个场景。 */
export interface DesignDraftMetadata {
	status: "active" | "orphaned";
	runId: string;
	requestId: string;
	baseRevisionId: string;
	draftRevisionId: string;
	operationCount: number;
	lastSequence: number;
	lastSummary?: string;
}
export interface DesignOpenData {
	designId: string;
	snapshot: DesignRpcSnapshot;
	messages?: DesignRpcMessage[];
	execution?: DesignRunRecoveryState;
	draft?: DesignDraftMetadata;
	/** active draft 的完整场景只通过 RPC 返回，不写入 Desktop localStorage；用于重连后继续增量归约。 */
	draftSnapshot?: DesignRpcSnapshot;
}

// ============================================================================
// 执行快照（设计文档 §8）
// ============================================================================

/** RPC 传输用的执行快照，直接复用 CLI Core 的权威类型。 */
export type RpcSessionExecutionSnapshot = AgentExecutionSnapshot;

/** RPC 传输用的执行摘要（不含活动工具参数与输出），供列表场景使用。 */
export type RpcSessionExecutionSummary = AgentExecutionSummary;

/**
 * v1 能力编码。Desktop 不按版本号硬编码行为，只按能力字段启用对应链路。
 * 旧 sidecar 不宣告这些能力，新 Desktop 自动回退前端推断。
 */
export const RPC_CAPABILITY_SESSION_EXECUTION_SNAPSHOT_V1 = "session_execution_snapshot_v1";
export const RPC_CAPABILITY_SESSION_EVENT_METADATA_V1 = "session_event_metadata_v1";
export const RPC_CAPABILITY_SWITCH_SESSION_SNAPSHOT_V1 = "switch_session_snapshot_v1";
/** Code 模式右侧栏 Git 面板能力：受限 sidecar Git 服务（core/git）。 */
export const RPC_CAPABILITY_DESKTOP_GIT_PANEL_V1 = "desktop_git_panel_v1";
/** Git 面板 v2：状态标注误跟踪文件（ignoredTracked）并支持 git_untrack_paths 解除跟踪。 */
export const RPC_CAPABILITY_DESKTOP_GIT_PANEL_V2 = "desktop_git_panel_v2";

/** 当前 sidecar 宣告的全部能力。 */
export const RPC_CAPABILITIES: readonly string[] = [
	RPC_CAPABILITY_SESSION_EXECUTION_SNAPSHOT_V1,
	RPC_CAPABILITY_SESSION_EVENT_METADATA_V1,
	RPC_CAPABILITY_SWITCH_SESSION_SNAPSHOT_V1,
	RPC_CAPABILITY_DESKTOP_GIT_PANEL_V1,
	RPC_CAPABILITY_DESKTOP_GIT_PANEL_V2,
];

/**
 * 实时事件传输层元数据（设计文档 §8.4）。
 * 不污染 Core 原始 AgentSessionEvent 类型，仅在 RPC 输出时附加。
 * 保留事件原有 `type`，不新增外层 envelope，旧客户端可忽略额外字段。
 */
export interface RpcSessionEventMetadata {
	sessionFile?: string;
	sessionId: string;
	runId?: string;
	sequence: number;
	emittedAt: number;
}

/** 附带传输层元数据的实时事件。 */
export type RpcAgentSessionEvent = AgentSessionEvent & RpcSessionEventMetadata;

/**
 * 原子会话快照（设计文档 §8.3）。
 * 应用启动、sidecar 重连和显式刷新当前任务时一次取得会话状态、消息和执行快照，
 * 避免switch_session -> get_state -> get_messages 多请求竞态。
 */
export interface RpcDesktopSessionSnapshot {
	session: RpcSessionState;
	execution: RpcSessionExecutionSnapshot;
	messages: AgentMessage[];
	/** 当前快照对应的事件游标，Desktop 据此丢弃 sequence <= eventCursor 的旧事件。 */
	eventCursor: number;
}

/** list_sessions 返回的会话条目，附带运行态摘要。 */
export type RpcSessionListItem = SessionInfo & {
	isStreaming?: boolean;
	execution?: RpcSessionExecutionSummary;
};

// ============================================================================
// RPC Commands (stdin)
// ============================================================================

export type RpcCommand =
	// Prompting
	| { id?: string; type: "prompt"; message: string; images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }
	| { id?: string; type: "steer"; message: string; images?: ImageContent[] }
	| { id?: string; type: "follow_up"; message: string; images?: ImageContent[] }
	/** 中止当前执行；clearQueue 用于桌面端停止时同步取消未执行引导。 */
	| { id?: string; type: "abort"; clearQueue?: boolean }
	| { id?: string; type: "new_session"; parentSession?: string; cwd?: string }
	// Attachments（桌面端上传附件预解析：路径或内联 base64 -> 文本/图片，结果随下一条 prompt 注入）
	| { id?: string; type: "prepare_attachments"; items: AttachmentInput[] }
	| { id?: string; type: "code_file_list" }
	// Desktop Code 模式右侧栏 Git 面板：受限 sidecar Git，确定性操作，不进模型上下文。
	// 设计文档：docs/design-docs/gitpilot-desktop-code-git-panel-technical-design-v1.md
	| { id?: string; type: "git_get_state" }
	| { id?: string; type: "git_get_diff"; scope: "worktree" | "staged"; path: string }
	| { id?: string; type: "git_list_branches" }
	| { id?: string; type: "git_stage_paths"; paths: string[] }
	| { id?: string; type: "git_unstage_paths"; paths: string[] }
	/** 解除误跟踪：只从 index 移除保留工作区文件，提交删除后忽略规则才生效。 */
	| { id?: string; type: "git_untrack_paths"; paths: string[] }
	| { id?: string; type: "git_commit"; message: string; expectedVersion?: number }
	/** 空提交信息时由 sidecar 用一次性模型会话基于暂存 diff 生成建议，不落盘、不带工具。 */
	| { id?: string; type: "git_suggest_commit_message" }
	| { id?: string; type: "git_create_branch"; name: string; switchTo?: boolean }
	| { id?: string; type: "git_switch_branch"; name: string; expectedVersion?: number }
	| { id?: string; type: "git_fetch"; remote?: string }
	| { id?: string; type: "git_pull_ff_only"; expectedVersion?: number }
	| { id?: string; type: "git_push"; expectedVersion?: number; setUpstream?: boolean }
	| { id?: string; type: "git_cancel_operation"; operationId: string }
	| { id?: string; type: "new_work_session"; taskId: string; workspacePath?: string }
	| { id?: string; type: "work_prompt"; taskId: string; message: string; history?: WorkConversationMessage[]; research?: boolean }
	| { id?: string; type: "work_abort"; requestId?: string }
	| { id?: string; type: "work_file_list"; taskId: string }
	| { id?: string; type: "work_file_read"; taskId: string; path: string }
	| { id?: string; type: "work_file_write"; taskId: string; path: string; content: string }
	| { id?: string; type: "work_file_delete"; taskId: string; path: string }
	| { id?: string; type: "work_file_rename"; taskId: string; path: string; newPath: string }
	| { id?: string; type: "work_prepare_attachments"; items: AttachmentInput[] }
	// 工作项协同浏览：桌面端右侧栏只读分页浏览，与 Work AgentSession 无关，不进模型上下文。
	| { id?: string; type: "work_project_list" }
	| { id?: string; type: "work_item_page"; page?: number; size?: number; status?: string; priority?: string; projectId?: number; keyword?: string; workItemType?: string }
	| { id?: string; type: "work_item_detail"; workItemId: number }
	| { id?: string; type: "design_open"; projectPath: string }
	| { id?: string; type: "design_sync_messages"; projectPath: string; designId: string; messages: DesignRpcMessage[] }
	| { id?: string; type: "design_save_guidelines"; projectPath: string; designId: string; guidelines: DesignProjectGuidelines; canvas?: CanvasDesignDocument }
	| { id?: string; type: "design_rename_page"; projectPath: string; designId: string; pageId: string; name: string; baseRevisionId: string }
	| { id?: string; type: "design_create"; projectPath: string; name?: string }
	| { id?: string; type: "design_get_snapshot"; projectPath: string; designId: string }
	| { id?: string; type: "design_get_revision"; projectPath: string; designId: string; revisionId: string }
	/** uiMessageId 由 Desktop 生成并贯穿 sidecar/UI 同一条气泡，避免恢复时重复显示用户消息。 */
	| { id?: string; type: "design_prompt"; projectPath: string; designId: string; pageId: string; prompt: string; baseRevisionId?: string; targetProfiles: Array<"mobile" | "tablet" | "desktop">; uiMessageId?: string }
	| { id?: string; type: "design_clarification_response"; projectPath: string; designId: string; clarificationId: string; answer: string }
	| { id?: string; type: "design_follow_up"; projectPath: string; designId: string; message: string }
	| { id?: string; type: "design_abort"; projectPath: string; designId: string }
	| { id?: string; type: "design_recover_draft"; projectPath: string; designId: string; runId: string; action: "keep" | "discard" }
	| { id?: string; type: "design_approval_response"; projectPath: string; designId: string; approvalId: string; approved: boolean }
	| { id?: string; type: "design_generate"; projectPath: string; designId: string; pageId: string; prompt: string; baseRevisionId?: string; targetProfiles: Array<"mobile" | "tablet" | "desktop"> }
	| { id?: string; type: "design_apply_patch"; projectPath: string; designId: string; pageId: string; baseRevisionId: string; patch: Record<string, unknown> }
	| { id?: string; type: "design_preview"; projectPath: string; designId: string; pageId: string; revisionId?: string }
	| { id?: string; type: "design_check"; projectPath: string; designId: string; pageId: string; revisionId?: string }
	| { id?: string; type: "design_revert"; projectPath: string; designId: string; revisionId: string }
	| { id?: string; type: "design_upload"; projectPath: string; designId: string; revisionId: string; platformProjectId: number; title?: string; summary?: string; previewPng?: string }
	| { id?: string; type: "design_export"; projectPath: string; designId: string; outputPath?: string }
	// MCP 管理传输标准服务定义；查询响应中的 env、headers 等敏感值始终是脱敏占位符。
	| { id?: string; type: "mcp_list" }
	| { id?: string; type: "mcp_save_server"; name: string; previousName?: string; definition: McpServerDefinition; modes: Array<"code" | "work" | "design"> }
	| { id?: string; type: "mcp_copy_server"; name: string }
	| { id?: string; type: "mcp_delete_server"; name: string }
	| { id?: string; type: "mcp_set_modes"; name: string; modes: Array<"code" | "work" | "design"> }
	| { id?: string; type: "mcp_set_enabled"; name: string; enabled: boolean }
	| { id?: string; type: "mcp_reload" }
	| { id?: string; type: "skill_list" }
	| { id?: string; type: "skill_set_enabled"; name: string; enabled: boolean }
	| { id?: string; type: "skill_set_modes"; name: string; modes: SkillMode[] }
	| { id?: string; type: "skill_reload" }

	// State
	| { id?: string; type: "get_state" }

	// Model
	| { id?: string; type: "set_model"; provider: string; modelId: string }
	| { id?: string; type: "cycle_model" }
	| { id?: string; type: "get_available_models" }

	// Thinking
	| { id?: string; type: "set_thinking_level"; level: ThinkingLevel }
	| { id?: string; type: "cycle_thinking_level" }
	| { id?: string; type: "get_available_thinking_levels" }

	// Queue modes
	| { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
	| { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }

	// Compaction
	| { id?: string; type: "compact"; customInstructions?: string }
	| { id?: string; type: "set_auto_compaction"; enabled: boolean }

	// Retry
	| { id?: string; type: "set_auto_retry"; enabled: boolean }
	| { id?: string; type: "abort_retry" }

	// Bash
	| { id?: string; type: "bash"; command: string; excludeFromContext?: boolean; timeout?: number }
	| { id?: string; type: "abort_bash" }
	/** Code 工具审批响应；授权仅存在于当前 sidecar 会话内。 */
	| { id?: string; type: "approval_response"; approvalId: string; decision: ApprovalDecision }
	| { id?: string; type: "get_security_policy" }
	| { id?: string; type: "set_security_policy"; policy: Partial<SecurityPolicy> }
	/** 切换会话级访问权限；即时生效且只影响当前会话，不落盘。 */
	| { id?: string; type: "set_session_approval_mode"; mode: SessionApprovalMode }

	// Session
	| { id?: string; type: "get_session_stats" }
	| { id?: string; type: "export_html"; outputPath?: string }
	| { id?: string; type: "switch_session"; sessionPath: string }
	| { id?: string; type: "fork"; entryId: string }
	| { id?: string; type: "clone" }
	| { id?: string; type: "get_fork_messages" }
	| { id?: string; type: "get_entries"; since?: string }
	| { id?: string; type: "get_tree" }
	| { id?: string; type: "list_sessions"; scope?: "current" | "all" }
	| { id?: string; type: "get_last_assistant_text" }
	| { id?: string; type: "set_session_name"; name: string }
	/** 原子取得当前会话状态、消息与执行快照，供应用启动/重连/刷新使用（设计文档 §8.3）。 */
	| { id?: string; type: "get_session_snapshot" }

	// Messages
	| { id?: string; type: "get_messages" }

	// Commands (available for invocation via prompt)
	| { id?: string; type: "get_commands" }
	/** 执行扩展命令但不把 slash 文本伪装成一条用户消息；交互请求通过事件异步返回。 */
	| { id?: string; type: "execute_command"; name: string; args?: string }

	// 桌面标题栏刷新按钮：强制联网重拉平台模型清单并重解析当前选中模型，
	// 让管理端新配置（visionRouting、输入模态等）无需重启 sidecar 即可生效。
	| { id?: string; type: "refresh_models" }
	// Token（桌面版登录后注入平台设备授权拿到的 gpt_ token，复用 saveCliToken 存凭据库）
	| { id?: string; type: "set_token"; platformUrl: string; token: string }
	// 桌面账户菜单：所有网络访问和凭据读取保留在 sidecar 内。
	| { id?: string; type: "get_platform_account" }
	// 仅检查已登录的平台后端是否可用，供桌面底栏显示连接状态。
	| { id?: string; type: "get_platform_connection" }
	/** Design 入口绑定 Web 端项目时使用的只读项目查询。 */
	| { id?: string; type: "get_platform_projects"; keyword?: string }
	/** 输入框工作项入口查询当前用户负责的需求、任务和缺陷。 */
	| { id?: string; type: "get_platform_work_items" }
	| { id?: string; type: "logout" };

// ============================================================================
// RPC Slash Command (for get_commands response)
// ============================================================================

/** A command available for invocation via prompt */
export interface RpcSlashCommand {
	/** Command name (without leading slash) */
	name: string;
	/** Human-readable description */
	description?: string;
	/** What kind of command this is */
	source: "extension" | "prompt" | "skill";
	/** Source metadata for the owning resource */
	sourceInfo: SourceInfo;
	/** 宿主侧动作：prompt 透传给扩展、open_local_review 打开本地审查工作台、open_rtk_settings 打开 RTK 设置 */
	hostAction?: "prompt" | "open_local_review" | "open_rtk_settings";
	/** UI 能力：rpc-standard 走标准 RPC 事件、tui-custom 需原生 GUI 适配、none 无 UI */
	uiCapability?: "rpc-standard" | "tui-custom" | "none";
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
// RPC State
// ============================================================================

export interface RpcSessionState {
	model?: Model<any>;
	thinkingLevel: ThinkingLevel;
	isStreaming: boolean;
	isCompacting: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	sessionFile?: string;
	sessionId: string;
	sessionName?: string;
	autoCompactionEnabled: boolean;
	messageCount: number;
	pendingMessageCount: number;
	/** 当前 sidecar 宣告的能力列表，Desktop 据此启用新链路或回退旧推断。 */
	rpcCapabilities?: string[];
	/** 当前会话的权威执行快照（仅当 sidecar 宣告 session_execution_snapshot_v1 时存在）。 */
	execution?: RpcSessionExecutionSnapshot;
	/** 最近一次已收口 Code 任务的最终工作区 diff；完整结果来自压缩 artifact。 */
	workspaceChanges?: WorkspaceChangeSet;
}

// ============================================================================
// RPC Responses (stdout)
// ============================================================================

// Success responses with data
export type RpcResponse =
	// Prompting (async - events follow)
	| { id?: string; type: "response"; command: "prompt"; success: true }
	| { id?: string; type: "response"; command: "steer"; success: true }
	| { id?: string; type: "response"; command: "follow_up"; success: true }
	| {
			id?: string;
			type: "response";
			command: "abort";
			success: true;
			data?: { clearedSteering: number; clearedFollowUp: number };
	  }
	| { id?: string; type: "response"; command: "new_session"; success: true; data: { cancelled: boolean } }
	// Attachments（预解析附件，结果不触发事件流，直接随 response 返回）
	| { id?: string; type: "response"; command: "prepare_attachments"; success: true; data: { attachments: PreparedAttachment[] } }
	| { id?: string; type: "response"; command: "code_file_list"; success: true; data: CodeProjectFileList }
	// Git 面板：写操作返回新版本号 + 强制重读后的完整状态，UI 无需再发 get_state。
	| { id?: string; type: "response"; command: "git_get_state"; success: true; data: GitRepositoryState }
	| { id?: string; type: "response"; command: "git_get_diff"; success: true; data: GitDiffResult }
	| { id?: string; type: "response"; command: "git_list_branches"; success: true; data: { branches: GitBranchInfo[] } }
	| { id?: string; type: "response"; command: "git_stage_paths" | "git_unstage_paths" | "git_untrack_paths" | "git_create_branch" | "git_switch_branch" | "git_fetch" | "git_pull_ff_only" | "git_push"; success: true; data: { repositoryVersion: number; state: GitRepositoryState } }
	| { id?: string; type: "response"; command: "git_commit"; success: true; data: { repositoryVersion: number; state: GitRepositoryState; commitSha: string } }
	| { id?: string; type: "response"; command: "git_suggest_commit_message"; success: true; data: { message: string } }
	| { id?: string; type: "response"; command: "git_cancel_operation"; success: true; data: { cancelled: boolean } }
	| { id?: string; type: "response"; command: "new_work_session"; success: true; data: { taskId: string; sessionId: string; sessionPath: string; workspacePath: string; title: string } }
	| { id?: string; type: "response"; command: "work_prompt"; success: true; data: { requestId: string } }
	| { id?: string; type: "response"; command: "work_abort"; success: true }
	| { id?: string; type: "response"; command: "work_file_list"; success: true; data: { taskId: string; files: WorkFileSnapshot[] } }
	| { id?: string; type: "response"; command: "work_file_read"; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: "response"; command: "work_file_write"; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: "response"; command: "work_file_delete"; success: true; data: { taskId: string; path: string } }
	| { id?: string; type: "response"; command: "work_file_rename"; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: "response"; command: "work_prepare_attachments"; success: true; data: { attachments: PreparedAttachment[] } }
	| { id?: string; type: "response"; command: "work_project_list"; success: true; data: { projects: RpcWorkProjectSummary[] } }
	| { id?: string; type: "response"; command: "work_item_page"; success: true; data: RpcWorkItemPage }
	| { id?: string; type: "response"; command: "work_item_detail"; success: true; data: { detail: RpcWorkItemDetail; links: RpcWorkItemLinks } }
	| { id?: string; type: "response"; command: "design_open" | "design_create" | "design_save_guidelines" | "design_rename_page"; success: true; data: DesignOpenData }
	| { id?: string; type: "response"; command: "design_sync_messages"; success: true; data: { designId: string; messages: DesignRpcMessage[] } }
	| { id?: string; type: "response"; command: "design_get_snapshot" | "design_get_revision" | "design_check"; success: true; data: { snapshot?: DesignRpcSnapshot; checks?: Array<{ level: "error" | "warning" | "info"; message: string }> } }
	| { id?: string; type: "response"; command: "design_preview"; success: true; data: { snapshot?: DesignRpcSnapshot; previewHandle: DesignPreviewHandle; checks?: Array<{ level: "error" | "warning" | "info"; message: string }> } }
	| { id?: string; type: "response"; command: "design_prompt"; success: true; data: { requestId: string; runId: string } }
	| { id?: string; type: "response"; command: "design_clarification_response"; success: true }
	| { id?: string; type: "response"; command: "design_follow_up"; success: true; data: { queued: true } }
	| { id?: string; type: "response"; command: "design_abort"; success: true }
	| { id?: string; type: "response"; command: "design_recover_draft"; success: true; data: { designId: string; action: "keep" | "discard"; snapshot: DesignRpcSnapshot; reason?: "interrupted" | "discarded" } }
	| { id?: string; type: "response"; command: "design_approval_response"; success: true }
	| { id?: string; type: "response"; command: "design_generate"; success: true; data: { requestId: string; snapshot?: DesignRpcSnapshot; summary?: string } }
	| { id?: string; type: "response"; command: "design_apply_patch" | "design_revert"; success: true; data: { snapshot: DesignRpcSnapshot } }
	| { id?: string; type: "response"; command: "design_upload"; success: true; data: { upload: DesignUploadResult } }
	| { id?: string; type: "response"; command: "design_export"; success: true; data: { path: string } }
	| { id?: string; type: "response"; command: "mcp_list"; success: true; data: { servers: ManagedMcpServer[] } }
	| { id?: string; type: "response"; command: "mcp_copy_server"; success: true; data: { name: string } }
	| { id?: string; type: "response"; command: "mcp_save_server" | "mcp_delete_server" | "mcp_set_modes" | "mcp_set_enabled" | "mcp_reload"; success: true }
	| { id?: string; type: "response"; command: "skill_list"; success: true; data: { skills: ManagedSkill[]; diagnostics: Array<{ type: string; message: string; path?: string }> } }
	| { id?: string; type: "response"; command: "skill_set_enabled" | "skill_set_modes" | "skill_reload"; success: true; data: SkillReloadResult }

	// State
	| { id?: string; type: "response"; command: "get_state"; success: true; data: RpcSessionState }

	// Model
	| {
			id?: string;
			type: "response";
			command: "set_model";
			success: true;
			data: Model<any>;
	  }
	| {
			id?: string;
			type: "response";
			command: "cycle_model";
			success: true;
			data: { model: Model<any>; thinkingLevel: ThinkingLevel; isScoped: boolean } | null;
	  }
	| {
			id?: string;
			type: "response";
			command: "get_available_models";
			success: true;
			data: { models: Model<any>[] };
	  }

	// Thinking
	| { id?: string; type: "response"; command: "set_thinking_level"; success: true }
	| {
			id?: string;
			type: "response";
			command: "cycle_thinking_level";
			success: true;
			data: { level: ThinkingLevel } | null;
	  }
		| {
				id?: string;
				type: "response";
				command: "get_available_thinking_levels";
				success: true;
				data: { levels: ThinkingLevel[] };
		  }

	// Extension UI（sidecar 对 extension_ui_response 的回包，避免桌面同步等待阻塞主线程）
	| { id?: string; type: "response"; command: "extension_ui_response"; success: true }

	// Queue modes
	| { id?: string; type: "response"; command: "set_steering_mode"; success: true }
	| { id?: string; type: "response"; command: "set_follow_up_mode"; success: true }

	// Compaction
	| { id?: string; type: "response"; command: "compact"; success: true; data: CompactionResult }
	| { id?: string; type: "response"; command: "set_auto_compaction"; success: true }

	// Retry
	| { id?: string; type: "response"; command: "set_auto_retry"; success: true }
	| { id?: string; type: "response"; command: "abort_retry"; success: true }

	// Bash
	| { id?: string; type: "response"; command: "bash"; success: true; data: BashResult }
	| { id?: string; type: "response"; command: "abort_bash"; success: true }

	// Session
	| { id?: string; type: "response"; command: "get_session_stats"; success: true; data: SessionStats }
	| { id?: string; type: "response"; command: "export_html"; success: true; data: { path: string } }
	| { id?: string; type: "response"; command: "switch_session"; success: true; data: { cancelled: boolean; snapshot?: RpcDesktopSessionSnapshot } }
	| { id?: string; type: "response"; command: "fork"; success: true; data: { text: string; cancelled: boolean } }
	| { id?: string; type: "response"; command: "clone"; success: true; data: { cancelled: boolean } }
	| {
			id?: string;
			type: "response";
			command: "get_fork_messages";
			success: true;
			data: { messages: Array<{ entryId: string; text: string }> };
	  }
	| {
			id?: string;
			type: "response";
			command: "get_entries";
			success: true;
			data: { entries: SessionEntry[]; leafId: string | null };
	  }
	| {
			id?: string;
			type: "response";
			command: "get_tree";
			success: true;
			data: { tree: SessionTreeNode[]; leafId: string | null };
	  }
	| {
				id?: string;
				type: "response";
				command: "list_sessions";
				success: true;
				data: { sessions: RpcSessionListItem[] };
		  }
	| {
				id?: string;
				type: "response";
				command: "get_session_snapshot";
				success: true;
				data: RpcDesktopSessionSnapshot;
		  }
	| {
			id?: string;
			type: "response";
			command: "get_last_assistant_text";
			success: true;
			data: { text: string | null };
	  }
	| { id?: string; type: "response"; command: "set_session_name"; success: true }

	// Messages
	| { id?: string; type: "response"; command: "get_messages"; success: true; data: { messages: AgentMessage[] } }

	// Commands
	| {
			id?: string;
			type: "response";
			command: "get_commands";
			success: true;
			data: { commands: RpcSlashCommand[] };
	  }
	| { id?: string; type: "response"; command: "execute_command"; success: true }
	| { id?: string; type: "response"; command: "refresh_models"; success: true; data: { models: Model<any>[] } }
	| { id?: string; type: "response"; command: "set_token"; success: true }
	| { id?: string; type: "response"; command: "get_platform_account"; success: true; data: RpcPlatformAccount }
	| { id?: string; type: "response"; command: "get_platform_connection"; success: true; data: RpcPlatformConnection }
	| { id?: string; type: "response"; command: "approval_response"; success: true }
       | { id?: string; type: "response"; command: "get_security_policy"; success: true; data: { policy: SecurityPolicy; sandbox: SandboxStatus; approvalMode: SessionApprovalMode; pendingApprovals: SecurityApprovalRequest[] } }
       | { id?: string; type: "response"; command: "set_security_policy"; success: true; data: { policy: SecurityPolicy; sandbox: SandboxStatus } }
       | { id?: string; type: "response"; command: "set_session_approval_mode"; success: true; data: { approvalMode: SessionApprovalMode } }
	| { id?: string; type: "response"; command: "get_platform_projects"; success: true; data: { projects: Array<{ id: number; name: string; status?: string; description?: string; owner?: string }> } }
	| { id?: string; type: "response"; command: "get_platform_work_items"; success: true; data: { items: RpcWorkItemSummary[] } }
	| { id?: string; type: "response"; command: "logout"; success: true }

	// Error response (any command can fail)
	| { id?: string; type: "response"; command: string; success: false; error: string };

// ============================================================================
// Extension UI Events (stdout)
// ============================================================================

/** Emitted when an extension needs user input */
/**
 * 扩展交互请求的来源会话。
 *
 * RPC 可能在 Desktop 已乐观切换任务后才收到旧会话发出的 stdout；因此必须由
 * sidecar 在请求生成时写入来源，而不能由界面按接收时的当前会话猜测。
 */
export interface RpcExtensionUISessionMetadata {
	sessionFile?: string;
}

export type RpcExtensionUIRequest = (
	| { type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[]; timeout?: number }
	| { type: "extension_ui_request"; id: string; method: "confirm"; title: string; message: string; timeout?: number }
	| {
			type: "extension_ui_request";
			id: string;
			method: "input";
			title: string;
			placeholder?: string;
			timeout?: number;
	  }
	| { type: "extension_ui_request"; id: string; method: "editor"; title: string; prefill?: string }
	| {
			type: "extension_ui_request";
			id: string;
			method: "notify";
			message: string;
			notifyType?: "info" | "warning" | "error";
	  }
	| {
			type: "extension_ui_request";
			id: string;
			method: "setStatus";
			statusKey: string;
			statusText: string | undefined;
	  }
	| {
			type: "extension_ui_request";
			id: string;
			method: "setWidget";
			widgetKey: string;
			widgetLines: string[] | undefined;
			widgetPlacement?: "aboveEditor" | "belowEditor";
	  }
	| { type: "extension_ui_request"; id: string; method: "setTitle"; title: string }
	| { type: "extension_ui_request"; id: string; method: "set_editor_text"; text: string }
) & RpcExtensionUISessionMetadata;

/** Code 工具执行前发给 Desktop 的独立审批事件，不复用 Design 审批状态。 */
export interface RpcApprovalRequiredEvent extends SecurityApprovalRequest {
	type: "approval_required";
}

/**
 * Git 面板事件：core/git RepositoryService 广播的操作生命周期与状态变化。
 * Desktop 桥接层按 "git_" 前缀分流到独立回调，不进入 Code 会话 reducer。
 */
export type RpcGitEvent =
	| { type: "git_operation_started"; operationId: string; kind: string }
	| { type: "git_operation_completed"; operationId: string; kind: string; repositoryVersion: number }
	| { type: "git_operation_failed"; operationId: string; kind: string; errorCode: string; message: string }
	| { type: "git_operation_cancelled"; operationId: string; kind: string }
	| { type: "git_state_changed"; repositoryVersion: number };

// ============================================================================
// Extension UI Commands (stdin)
// ============================================================================

/** Response to an extension UI request */
export type RpcExtensionUIResponse =
	| { type: "extension_ui_response"; id: string; value: string }
	| { type: "extension_ui_response"; id: string; confirmed: boolean }
	| { type: "extension_ui_response"; id: string; cancelled: true };

// ============================================================================
// Helper type for extracting command types
// ============================================================================

export type RpcCommandType = RpcCommand["type"];
