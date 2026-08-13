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
import type { SessionEntry, SessionInfo, SessionTreeNode } from "../../core/session-manager.ts";
import type { SourceInfo } from "../../core/source-info.ts";

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
export interface DesignRpcFile { path: "index.html" | "styles.css" | "main.js"; language: "html" | "css" | "javascript"; content: string }
export interface DesignRpcSnapshot { document: Record<string, unknown>; files: DesignRpcFile[] }

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

/** 当前 sidecar 宣告的全部能力。 */
export const RPC_CAPABILITIES: readonly string[] = [
	RPC_CAPABILITY_SESSION_EXECUTION_SNAPSHOT_V1,
	RPC_CAPABILITY_SESSION_EVENT_METADATA_V1,
	RPC_CAPABILITY_SWITCH_SESSION_SNAPSHOT_V1,
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
	| { id?: string; type: "new_work_session"; taskId: string }
	| { id?: string; type: "work_prompt"; taskId: string; message: string; history?: WorkConversationMessage[]; research?: boolean }
	| { id?: string; type: "work_abort"; requestId?: string }
	| { id?: string; type: "work_file_list"; taskId: string }
	| { id?: string; type: "work_file_read"; taskId: string; path: string }
	| { id?: string; type: "work_file_write"; taskId: string; path: string; content: string }
	| { id?: string; type: "work_file_delete"; taskId: string; path: string }
	| { id?: string; type: "work_file_rename"; taskId: string; path: string; newPath: string }
	| { id?: string; type: "work_prepare_attachments"; items: AttachmentInput[] }
	| { id?: string; type: "design_create"; name?: string }
	| { id?: string; type: "design_get_snapshot"; designId: string }
	| { id?: string; type: "design_generate"; designId: string; pageId: string; prompt: string; baseRevisionId?: string; targetProfiles: Array<"mobile" | "tablet" | "desktop"> }
	| { id?: string; type: "design_apply_patch"; designId: string; pageId: string; baseRevisionId: string; patch: Record<string, unknown> }
	| { id?: string; type: "design_preview"; designId: string; pageId: string; revisionId?: string }
	| { id?: string; type: "design_check"; designId: string; pageId: string; revisionId?: string }
	| { id?: string; type: "design_revert"; designId: string; revisionId: string }
	| { id?: string; type: "design_export"; designId: string; outputPath?: string }
	// MCP 管理仅传输写入所需的服务定义；查询响应不会返回 env、headers 或 OAuth 凭据。
	| { id?: string; type: "mcp_list" }
	| { id?: string; type: "mcp_save_server"; name: string; definition: Record<string, unknown>; modes: Array<"code" | "work" | "design"> }
	| { id?: string; type: "mcp_delete_server"; name: string }
	| { id?: string; type: "mcp_set_modes"; name: string; modes: Array<"code" | "work" | "design"> }
	| { id?: string; type: "mcp_set_enabled"; name: string; enabled: boolean }
	| { id?: string; type: "mcp_reload" }

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
	| { id?: string; type: "bash"; command: string; excludeFromContext?: boolean }
	| { id?: string; type: "abort_bash" }

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

	// Token（桌面版登录后注入平台设备授权拿到的 gpt_ token，复用 saveCliToken 存凭据库）
	| { id?: string; type: "set_token"; platformUrl: string; token: string }
	// 桌面账户菜单：所有网络访问和凭据读取保留在 sidecar 内。
	| { id?: string; type: "get_platform_account" }
	// 仅检查已登录的平台后端是否可用，供桌面底栏显示连接状态。
	| { id?: string; type: "get_platform_connection" }
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
	| { id?: string; type: "response"; command: "new_work_session"; success: true; data: { taskId: string; sessionId: string; sessionPath: string; workspacePath: string; title: string } }
	| { id?: string; type: "response"; command: "work_prompt"; success: true; data: { requestId: string; text: string; title?: string; sources?: WorkResearchSource[] } }
	| { id?: string; type: "response"; command: "work_abort"; success: true }
	| { id?: string; type: "response"; command: "work_file_list"; success: true; data: { taskId: string; files: WorkFileSnapshot[] } }
	| { id?: string; type: "response"; command: "work_file_read"; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: "response"; command: "work_file_write"; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: "response"; command: "work_file_delete"; success: true; data: { taskId: string; path: string } }
	| { id?: string; type: "response"; command: "work_file_rename"; success: true; data: { taskId: string; file: WorkFileSnapshot } }
	| { id?: string; type: "response"; command: "work_prepare_attachments"; success: true; data: { attachments: PreparedAttachment[] } }
	| { id?: string; type: "response"; command: "design_create"; success: true; data: { designId: string; snapshot: DesignRpcSnapshot } }
	| { id?: string; type: "response"; command: "design_get_snapshot" | "design_preview" | "design_check"; success: true; data: { snapshot?: DesignRpcSnapshot; checks?: Array<{ level: "error" | "warning" | "info"; message: string }> } }
	| { id?: string; type: "response"; command: "design_generate"; success: true; data: { requestId: string; snapshot?: DesignRpcSnapshot; summary?: string } }
	| { id?: string; type: "response"; command: "design_apply_patch" | "design_revert"; success: true; data: { snapshot: DesignRpcSnapshot } }
	| { id?: string; type: "response"; command: "design_export"; success: true; data: { path: string } }
	| { id?: string; type: "response"; command: "mcp_list"; success: true; data: { servers: Array<{ name: string; source: "global" | "project" | "project-override"; enabled: boolean; modes: Array<"code" | "work" | "design">; transport: "stdio" | "http" | "unknown" }> } }
	| { id?: string; type: "response"; command: "mcp_save_server" | "mcp_delete_server" | "mcp_set_modes" | "mcp_set_enabled" | "mcp_reload"; success: true }

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
	| { id?: string; type: "response"; command: "set_token"; success: true }
	| { id?: string; type: "response"; command: "get_platform_account"; success: true; data: RpcPlatformAccount }
	| { id?: string; type: "response"; command: "get_platform_connection"; success: true; data: RpcPlatformConnection }
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
