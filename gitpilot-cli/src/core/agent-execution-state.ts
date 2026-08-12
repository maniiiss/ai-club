/**
 * Agent 执行快照类型与权威投影管理器。
 *
 * 这里定义的运行时中性类型是 CLI Core 对“此刻会话正在做什么”的唯一事实来源。
 * RPC、Desktop 和其它宿主只消费只读快照，不再从消息时间戳或局部事件推断真实运行状态。
 *
 * 设计依据：docs/design-docs/gitpilot-cli-session-execution-snapshot-technical-design-v1.md
 */

import { randomUUID } from "node:crypto";
import type { AgentSessionEvent } from "./agent-session.ts";

// ============================================================================
// 运行时中性类型
// ============================================================================

/** 一次 Agent 执行 run 的整体状态。 */
export type AgentExecutionStatus = "idle" | "running" | "completed" | "failed" | "stopped";

/**
 * 当前 run 所处阶段。
 *
 * - `preparing`：run 已开始，等待第一个模型输出；
 * - `thinking` / `responding`：模型正在输出思考或正文；
 * - `tool`：有活动工具正在执行；
 * - `retrying` / `compacting` / `queued_continuation`：run 内部的自动重试、压缩或队列续跑；
 * - `waiting_confirmation`：扩展等待用户输入（如确认弹窗）；
 * - `settling`：活动工具全部结束，等待 `agent_settled` 收口；
 * - `idle`：没有活动 run。
 */
export type AgentExecutionPhase =
	| "preparing"
	| "thinking"
	| "responding"
	| "tool"
	| "retrying"
	| "compacting"
	| "queued_continuation"
	| "waiting_confirmation"
	| "settling"
	| "idle";

/** 单个活动工具的执行快照，按 `toolCallId` 独立维护，支持并行工具。 */
export interface AgentExecutionToolSnapshot {
	toolCallId: string;
	toolName: string;
	status: "running" | "waiting" | "succeeded" | "failed";
	args?: unknown;
	partialResult?: unknown;
	result?: unknown;
	isError?: boolean;
	startedAt: number;
	endedAt?: number;
	sequence: number;
}

/**
 * Agent 执行快照：描述当前 run 的权威状态。
 *
 * 约束（见设计文档 §6.1）：
 * - `runId` 在一次用户执行开始时生成，自动重试、自动压缩和队列 continuation 仍属于同一个 run；
 * - `startedAt` 在 run 从 idle 变为 running 的同一业务边界写入；
 * - `endedAt` 只在 `agent_settled`、明确 abort 或不可恢复失败时写入；
 * - 单个工具失败不直接把整个 run 标记为 failed，最终状态以 run 是否还能继续和 settled outcome 为准；
 * - `sequence` 对单个 session 单调递增，任何影响执行展示的状态变化都必须递增；
 * - `activeTools` 支持并行工具，不能简化成单个 `activeTool`。
 */
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

/**
 * 执行摘要：用于 `list_sessions` 等列表场景，不暴露活动工具参数与输出。
 */
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

// ============================================================================
// 已完成 run 的持久化条目
// ============================================================================

/** `gitpilot.execution-run.v1` custom entry 的 customType。 */
export const EXECUTION_RUN_ENTRY_CUSTOM_TYPE = "gitpilot.execution-run.v1";

/** `ExecutionRunEntryV1.version` 固定值。 */
export const EXECUTION_RUN_ENTRY_VERSION = 1;

/**
 * 每次 run settled 时追加一条低频 custom entry，用于应用退出后恢复精确总耗时。
 *
 * 只在 run 结束时追加一次，不持久化 token 增量和工具 partialResult，
 * 工具详情继续由标准消息和 toolResult 恢复，避免重复数据和 JSONL 膨胀。
 */
export interface ExecutionRunEntryV1 {
	version: 1;
	runId: string;
	status: "completed" | "failed" | "stopped";
	startedAt: number;
	endedAt: number;
	rootUserTimestamp?: number;
	lastSequence: number;
}

/** 判断一个 custom entry 数据是否为 v1 执行 run 记录。 */
export function isExecutionRunEntryV1(data: unknown): data is ExecutionRunEntryV1 {
	if (typeof data !== "object" || data === null) return false;
	const record = data as Record<string, unknown>;
	return (
		record.version === EXECUTION_RUN_ENTRY_VERSION &&
		typeof record.runId === "string" &&
		(record.status === "completed" || record.status === "failed" || record.status === "stopped") &&
		typeof record.startedAt === "number" &&
		typeof record.endedAt === "number" &&
		typeof record.lastSequence === "number"
	);
}

// ============================================================================
// 快照管理器
// ============================================================================

/**
 * 维护单个 AgentSession 的可变执行快照状态，对外只暴露只读副本。
 *
 * 快照在 AgentSession 内部事件链更新（通过 `applyEvent` 接入 `_emit`），
 * 这样即使 RPC 已切换到其他会话，suspended AgentSession 仍会处理自己的事件并更新快照。
 */
export class AgentExecutionSnapshotManager {
	private _runId: string | null = null;
	private _status: AgentExecutionStatus = "idle";
	private _phase: AgentExecutionPhase = "idle";
	private _startedAt: number | undefined;
	private _endedAt: number | undefined;
	private _updatedAt: number;
	private _sequence = 0;
	private _rootUserTimestamp: number | undefined;
	private _activeTools = new Map<string, AgentExecutionToolSnapshot>();
	private _lastError: string | undefined;

	constructor(now: number = Date.now()) {
		this._updatedAt = now;
	}

	/** 当前序号（单调递增，供 RPC eventCursor 对齐）。 */
	get sequence(): number {
		return this._sequence;
	}

	/** 当前 runId（无活动 run 时为 null）。 */
	get runId(): string | null {
		return this._runId;
	}

	/** 当前状态。 */
	get status(): AgentExecutionStatus {
		return this._status;
	}

	/** 是否有活动 run。 */
	get isRunning(): boolean {
		return this._status === "running";
	}

	/**
	 * 开始一次新的执行 run：生成 `runId`、记录开始时间、进入 `preparing` 阶段。
	 * 自动重试、自动压缩和队列续跑不会调用此方法，它们保留同一个 run。
	 */
	beginRun(rootUserTimestamp?: number): void {
		this._runId = randomUUID();
		this._status = "running";
		this._phase = "preparing";
		this._startedAt = Date.now();
		this._endedAt = undefined;
		this._updatedAt = this._startedAt;
		this._sequence += 1;
		this._rootUserTimestamp = rootUserTimestamp;
		this._activeTools.clear();
		this._lastError = undefined;
	}

	/**
	 * 结束当前 run，写入终态与 `endedAt`，清空活动工具。
	 * 仅在 running 时生效；无活动 run 时忽略。
	 */
	settle(status: "completed" | "failed" | "stopped", lastError?: string): void {
		if (this._status !== "running") return;
		this._status = status;
		this._phase = "idle";
		this._endedAt = Date.now();
		this._updatedAt = this._endedAt;
		this._sequence += 1;
		this._activeTools.clear();
		if (lastError) this._lastError = lastError;
	}

	/**
	 * 处理一个 AgentSessionEvent，更新 phase、活动工具、序号与 updatedAt。
	 *
	 * 只在 running 时生效：idle 期间的事件（如 thinking_level_changed、entry_appended）
	 * 不影响执行展示，因此不推进序号；手动压缩等在 run 收口后触发的事件同理被忽略。
	 * `agent_settled` 由 `settle` 显式处理，这里不再重复更新。
	 */
	applyEvent(event: AgentSessionEvent): void {
		if (this._status !== "running") return;
		if (event.type === "agent_settled") return; // 由 settle() 处理
		this._sequence += 1;
		this._updatedAt = Date.now();
		switch (event.type) {
			case "agent_start":
				this._phase = "preparing";
				break;
			case "message_update": {
				const subType = event.assistantMessageEvent.type;
				if (subType.startsWith("thinking")) {
					this._phase = "thinking";
				} else if (subType.startsWith("text") || subType.startsWith("toolcall")) {
					this._phase = "responding";
				}
				break;
			}
			case "tool_execution_start":
				this._activeTools.set(event.toolCallId, {
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					status: "running",
					args: event.args,
					startedAt: this._updatedAt,
					sequence: this._sequence,
				});
				this._phase = "tool";
				break;
			case "tool_execution_update": {
				const existing = this._activeTools.get(event.toolCallId);
				if (existing) {
					this._activeTools.set(event.toolCallId, { ...existing, partialResult: event.partialResult });
				}
				if (this._phase !== "tool") this._phase = "tool";
				break;
			}
			case "tool_execution_end":
				this._activeTools.delete(event.toolCallId);
				this._phase = this._activeTools.size > 0 ? "tool" : "settling";
				break;
			case "compaction_start":
				this._phase = "compacting";
				break;
			case "compaction_end":
				// 压缩结束，run 仍在继续：回到 preparing 等待下一轮事件更新阶段。
				this._phase = "preparing";
				break;
			case "auto_retry_start":
				this._phase = "retrying";
				break;
			case "auto_retry_end":
				this._phase = "preparing";
				break;
			case "queue_update":
				if (event.steering.length > 0 || event.followUp.length > 0) {
					this._phase = "queued_continuation";
				} else if (this._phase === "queued_continuation") {
					this._phase = "preparing";
				}
				break;
			default:
				// turn_start / turn_end / message_start / message_end / agent_end 等不改变 phase，
				// 但仍推进序号与 updatedAt，保证 eventCursor 覆盖所有已发出事件。
				break;
		}
	}

	/**
	 * 标记扩展是否正在等待用户确认（如 extension UI pending request）。
	 * 仅在 running 时生效；由 RPC/Extension UI bridge 回写到当前 snapshot。
	 */
	setWaitingConfirmation(waiting: boolean): void {
		if (this._status !== "running") return;
		if (waiting) {
			if (this._phase === "waiting_confirmation") return;
			this._phase = "waiting_confirmation";
		} else {
			if (this._phase !== "waiting_confirmation") return;
			this._phase = "preparing";
		}
		this._sequence += 1;
		this._updatedAt = Date.now();
	}

	/** 返回不可被调用方修改的快照副本。 */
	getSnapshot(): AgentExecutionSnapshot {
		return {
			runId: this._runId,
			status: this._status,
			phase: this._phase,
			startedAt: this._startedAt,
			endedAt: this._endedAt,
			updatedAt: this._updatedAt,
			sequence: this._sequence,
			rootUserTimestamp: this._rootUserTimestamp,
			activeTools: Array.from(this._activeTools.values()).map((tool) => ({ ...tool })),
			lastError: this._lastError,
		};
	}

	/** 返回不含活动工具参数与输出的摘要。 */
	getSummary(): AgentExecutionSummary {
		const tools = Array.from(this._activeTools.values());
		return {
			runId: this._runId,
			status: this._status,
			phase: this._phase,
			startedAt: this._startedAt,
			endedAt: this._endedAt,
			updatedAt: this._updatedAt,
			sequence: this._sequence,
			activeToolCount: tools.length,
			activeToolName: tools[0]?.toolName,
		};
	}
}

/**
 * 从历史 SessionManager 条目恢复一个终态快照（用于未加载的会话）。
 *
 * 只读取最后一条 `gitpilot.execution-run.v1` custom entry；没有该 entry 的旧会话
 * 返回 undefined，由调用方降级到首尾消息时间戳推断。
 */
export function restoreExecutionSnapshotFromEntry(
	entryTimestamp: number,
	data: unknown,
): AgentExecutionSnapshot | undefined {
	if (!isExecutionRunEntryV1(data)) return undefined;
	return {
		runId: data.runId,
		status: data.status,
		phase: "idle",
		startedAt: data.startedAt,
		endedAt: data.endedAt,
		updatedAt: entryTimestamp,
		sequence: data.lastSequence,
		rootUserTimestamp: data.rootUserTimestamp,
		activeTools: [],
		lastError: data.status === "failed" ? undefined : undefined,
	};
}
