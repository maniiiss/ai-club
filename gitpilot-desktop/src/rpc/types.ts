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

/** 思维级别（与 pi-agent-core ThinkingLevel 对齐） */
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';

/** 图片内容（pi-ai ImageContent 的桌面版消费视图） */
export interface ImageContent {
	type: 'image';
	source: { kind: 'base64'; mediaType: string; data: string } | { kind: 'url'; url: string };
}

/** Slash 命令来源信息（最小化） */
export interface SourceInfo {
	kind: string;
	name?: string;
	id?: string;
}

/** 会话树节点（pi SessionTreeNode 的桌面版消费视图） */
export interface SessionTreeNode {
	id: string;
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

// ============================================================================
// RPC Commands（桌面版 -> sidecar，stdin）
// ============================================================================

export type RpcCommand =
	// 会话与流式
	| { id?: string; type: 'prompt'; message: string; images?: ImageContent[]; streamingBehavior?: 'steer' | 'followUp' }
	| { id?: string; type: 'steer'; message: string; images?: ImageContent[] }
	| { id?: string; type: 'follow_up'; message: string; images?: ImageContent[] }
	| { id?: string; type: 'abort' }
	| { id?: string; type: 'new_session'; parentSession?: string }
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
	| { id?: string; type: 'get_entries'; since?: string }
	| { id?: string; type: 'get_messages' }
	| { id?: string; type: 'switch_session'; sessionPath: string }
	| { id?: string; type: 'set_session_name'; name: string }
	| { id?: string; type: 'export_html'; outputPath?: string }
	| { id?: string; type: 'get_commands' }
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
}

// ============================================================================
// RPC Responses（sidecar -> 桌面版，stdout）
// ============================================================================

export type RpcResponse =
	| { id?: string; type: 'response'; command: 'prompt'; success: true }
	| { id?: string; type: 'response'; command: 'steer'; success: true }
	| { id?: string; type: 'response'; command: 'follow_up'; success: true }
	| { id?: string; type: 'response'; command: 'abort'; success: true }
	| { id?: string; type: 'response'; command: 'new_session'; success: true; data: { cancelled: boolean } }
	| { id?: string; type: 'response'; command: 'get_state'; success: true; data: RpcSessionState }
	| { id?: string; type: 'response'; command: 'set_model'; success: true; data: ModelInfo }
	| { id?: string; type: 'response'; command: 'cycle_model'; success: true; data: { model: ModelInfo; thinkingLevel: ThinkingLevel; isScoped: boolean } | null }
	| { id?: string; type: 'response'; command: 'get_available_models'; success: true; data: { models: ModelInfo[] } }
	| { id?: string; type: 'response'; command: 'set_thinking_level'; success: true }
	| { id?: string; type: 'response'; command: 'cycle_thinking_level'; success: true; data: { level: ThinkingLevel } | null }
	| { id?: string; type: 'response'; command: 'get_available_thinking_levels'; success: true; data: { levels: ThinkingLevel[] } }
	| { id?: string; type: 'response'; command: 'get_tree'; success: true; data: { tree: SessionTreeNode[]; leafId: string | null } }
	| { id?: string; type: 'response'; command: 'get_entries'; success: true; data: { entries: SessionEntry[]; leafId: string | null } }
	| { id?: string; type: 'response'; command: 'get_messages'; success: true; data: { messages: unknown[] } }
	| { id?: string; type: 'response'; command: 'switch_session'; success: true; data: { cancelled: boolean } }
	| { id?: string; type: 'response'; command: 'set_session_name'; success: true }
	| { id?: string; type: 'response'; command: 'export_html'; success: true; data: { path: string } }
	| { id?: string; type: 'response'; command: 'get_commands'; success: true; data: { commands: RpcSlashCommand[] } }
	| { id?: string; type: 'response'; command: string; success: false; error: string };

// ============================================================================
// Slash 命令
// ============================================================================

export interface RpcSlashCommand {
	name: string;
	description?: string;
	source: 'extension' | 'prompt' | 'skill';
	sourceInfo: SourceInfo;
}

// ============================================================================
// Extension UI 事件（sidecar -> 桌面版，stdout）
// ============================================================================

export type RpcExtensionUIRequest =
	| { type: 'extension_ui_request'; id: string; method: 'select'; title: string; options: string[]; timeout?: number }
	| { type: 'extension_ui_request'; id: string; method: 'confirm'; title: string; message: string; timeout?: number }
	| { type: 'extension_ui_request'; id: string; method: 'input'; title: string; placeholder?: string; timeout?: number }
	| { type: 'extension_ui_request'; id: string; method: 'editor'; title: string; prefill?: string }
	| { type: 'extension_ui_request'; id: string; method: 'notify'; message: string; notifyType?: 'info' | 'warning' | 'error' }
	| { type: 'extension_ui_request'; id: string; method: 'setStatus'; statusKey: string; statusText: string | undefined }
	| { type: 'extension_ui_request'; id: string; method: 'setWidget'; widgetKey: string; widgetLines: string[] | undefined; widgetPlacement?: 'aboveEditor' | 'belowEditor' }
	| { type: 'extension_ui_request'; id: string; method: 'setTitle'; title: string }
	| { type: 'extension_ui_request'; id: string; method: 'set_editor_text'; text: string };

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
