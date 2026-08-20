/**
 * 改动文件列表的派生逻辑。
 *
 * 业务意图：执行完成后，从已持久化的 AgentMessage 或实时 ExecutionStep 中
 * 聚合出本次执行实际编辑过的文件清单，供聊天流展示一张可展开 diff 的卡片。
 * 不访问文件系统或 Shell，纯函数便于单测。
 */
import { classifyExecutionKind, type ExecutionStep } from '@/src/store/workbench';
import type { WorkspaceChangeSet } from '@/src/rpc/types';

/** 文件变更状态标记，对齐 Git 惯例。 */
export type ChangeStatus = 'modified' | 'added' | 'deleted';

/** 单次工具调用级别的编辑操作（解析中间态）。 */
export interface EditOperation {
	toolCallId: string;
	toolName: string;
	path: string;
	/** edit 工具有 unified diff；write 工具无。 */
	diff?: string;
	/** edit 工具有 unified patch。 */
	patch?: string;
	status: ChangeStatus;
	added: number;
	removed: number;
}

/** 聚合后的文件项（卡片渲染数据）。 */
export interface ChangedFile {
	path: string;
	status: ChangeStatus;
	added: number;
	removed: number;
	/** 同文件多次编辑时取最后一次 edit 的 diff。 */
	diff?: string;
	/**
	 * 本轮任务中该文件每次带 diff 的编辑（按发生顺序）。
	 * 业务意图：added/removed 是累计口径，而单次 diff 只描述当次编辑；
	 * 审查面板需要逐轮展示全部 diff 才能与累计统计对得上。
	 */
	diffs?: string[];
	editCount: number;
	/** 是否可展开 diff（write 无 diff 时为 false）。 */
	editable: boolean;
}

/** 工具名是否属于编辑类（edit/write/patch/apply），与 workbench.classifyExecutionKind 保持一致。 */
export function isEditToolName(toolName: string): boolean {
	const name = toolName.toLowerCase();
	return /(^|_)(edit|write|patch|apply)(_|$)/.test(name);
}

/**
 * 从 unified diff 文本推断文件状态与行数变化。
 * - `--- /dev/null` 表示新文件 -> added
 * - `+++ /dev/null` 表示删除文件 -> deleted
 * - 否则 modified
 * 空 diff 回退为 modified 且零行数（write 工具降级时使用）。
 */
export function parseDiffStats(diff?: string): { status: ChangeStatus; added: number; removed: number } {
	if (!diff || !diff.trim()) return { status: 'modified', added: 0, removed: 0 };
	let status: ChangeStatus = 'modified';
	let added = 0;
	let removed = 0;
	for (const line of diff.split('\n')) {
		if (line.startsWith('--- ') && line.includes('/dev/null')) status = 'added';
		else if (line.startsWith('+++ ') && line.includes('/dev/null')) status = 'deleted';
		else if (line.startsWith('+') && !line.startsWith('+++')) added++;
		else if (line.startsWith('-') && !line.startsWith('---')) removed++;
	}
	return { status, added, removed };
}

/** 从 args.content 估算写入行数（write 工具无 diff 时的降级统计）。 */
function contentLineCount(content: unknown): number {
	if (typeof content !== 'string' || !content) return 0;
	const trimmed = content.replace(/\n$/, '');
	return trimmed === '' ? 0 : trimmed.split('\n').length;
}

/** 从 result 字符串解析出 details.{diff,patch}；解析失败视为无 details。 */
function parseStepResult(result?: string): { diff?: string; patch?: string } {
	if (!result) return {};
	try {
		const parsed = JSON.parse(result) as { details?: { diff?: unknown; patch?: unknown } };
		const diff = typeof parsed.details?.diff === 'string' ? parsed.details.diff : undefined;
		const patch = typeof parsed.details?.patch === 'string' ? parsed.details.patch : undefined;
		return diff || patch ? { diff, patch } : {};
	} catch {
		return {};
	}
}

/**
 * 实时路径解析器：从 workbench ExecutionStep[] 提取编辑操作。
 * execution.steps 在 beginExecution 后按轮重置，故 agent_settled 时直接全量筛 edit。
 */
export function parseOpsFromSteps(steps: ExecutionStep[]): EditOperation[] {
	const ops: EditOperation[] = [];
	for (const step of steps) {
		if (step.kind !== 'edit') continue;
		let args: { path?: unknown; content?: unknown } = {};
		try {
			args = step.args ? (JSON.parse(step.args) as { path?: unknown; content?: unknown }) : {};
		} catch {
			continue;
		}
		const path = typeof args.path === 'string' ? args.path : '';
		if (!path) continue;
		const { diff, patch } = parseStepResult(step.result);
		const toolCallId = step.toolCallId ?? step.id;
		if (diff) {
			const stats = parseDiffStats(diff);
			ops.push({ toolCallId, toolName: step.title, path, diff, patch, ...stats });
		} else {
			ops.push({ toolCallId, toolName: step.title, path, status: 'modified', added: contentLineCount(args.content), removed: 0 });
		}
	}
	return ops;
}

interface ToolCallBlock {
	type: 'toolCall';
	/** 工具名，pi-ai 持久化时序列化为 name 字段（非 toolName）。 */
	name: string;
	/** toolCall 唯一标识，pi-ai 持久化时序列化为 id 字段（非 toolCallId）。 */
	id?: string;
	/** 工具参数，pi-ai 持久化时序列化为 arguments 字段（非 args）。 */
	arguments?: { path?: unknown; content?: unknown };
}

interface ToolResultMessage {
	role: 'toolResult';
	/** toolResult 的 toolCallId 与 toolCall 的 id 配对（字段名不同）。 */
	toolCallId?: string;
	content?: unknown;
	details?: { diff?: unknown; patch?: unknown };
	isError?: boolean;
}

/** 在 assistantIndex 之后寻找 id 匹配的 toolResult（同 turn，遇到下一条 user/assistant 停止）。 */
function findToolResult(messages: unknown[], assistantIndex: number, toolCallId: string): ToolResultMessage | undefined {
	for (let j = assistantIndex + 1; j < messages.length; j++) {
		const m = messages[j] as { role?: string };
		if (m.role === 'user' || m.role === 'assistant') break;
		if (m.role === 'toolResult') {
			const tr = m as ToolResultMessage;
			if (tr.toolCallId === toolCallId) return tr;
		}
	}
	return undefined;
}

/**
 * 历史路径解析器：以单条 assistant 消息为锚点，提取其 toolCall 并配对后续 toolResult。
 * agentMessagesToUi 在 flatMap 中对每条 assistant 调用一次，得到该轮编辑操作。
 * 注意：持久化的 AgentMessage 中 toolCall block 用 name/arguments/id 字段
 * （与流式 tool_execution_* 事件的 toolName/args/toolCallId 不同），勿混用。
 */
export function parseOpsFromMessages(messages: unknown[], assistantIndex: number): EditOperation[] {
	const assistant = messages[assistantIndex] as { content?: unknown[] };
	const ops: EditOperation[] = [];
	if (!Array.isArray(assistant?.content)) return ops;
	for (const block of assistant.content) {
		const tc = block as Partial<ToolCallBlock>;
		if (tc.type !== 'toolCall' || typeof tc.name !== 'string') continue;
		if (!isEditToolName(tc.name)) continue;
		const toolCallId = tc.id ?? '';
		const args = tc.arguments ?? {};
		const path = typeof args.path === 'string' ? args.path : '';
		if (!path) continue;
		const result = toolCallId ? findToolResult(messages, assistantIndex, toolCallId) : undefined;
		const diff = typeof result?.details?.diff === 'string' ? result.details.diff : undefined;
		const patch = typeof result?.details?.patch === 'string' ? result.details.patch : undefined;
		if (diff) {
			const stats = parseDiffStats(diff);
			ops.push({ toolCallId, toolName: tc.name, path, diff, patch, ...stats });
		} else {
			ops.push({ toolCallId, toolName: tc.name, path, status: 'modified', added: contentLineCount(args.content), removed: 0 });
		}
	}
	return ops;
}

/** 状态严重度排序：deleted > added > modified。 */
const STATUS_RANK: Record<ChangeStatus, number> = { modified: 0, added: 1, deleted: 2 };

function mergeStatus(a: ChangeStatus, b: ChangeStatus): ChangeStatus {
	return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

/**
 * 聚合编辑操作为文件项：按 path 分组，行数累计，status 取最严重，
 * diff 取最后一次 edit，diffs 保留全部带 diff 的轮次，editCount 递增。
 * editable = 存在任一 diff。
 */
export function aggregateChangedFiles(ops: EditOperation[]): ChangedFile[] {
	const map = new Map<string, ChangedFile>();
	for (const op of ops) {
		const existing = map.get(op.path);
		if (!existing) {
			map.set(op.path, {
				path: op.path,
				status: op.status,
				added: op.added,
				removed: op.removed,
				diff: op.diff,
				diffs: op.diff != null ? [op.diff] : undefined,
				editCount: 1,
				editable: op.diff != null,
			});
		} else {
			existing.added += op.added;
			existing.removed += op.removed;
			existing.status = mergeStatus(existing.status, op.status);
			if (op.diff != null) {
				existing.diff = op.diff;
				existing.diffs = [...(existing.diffs ?? []), op.diff];
				existing.editable = true;
			}
			existing.editCount += 1;
		}
	}
	return [...map.values()];
}

/**
 * 将 sidecar 计算出的任务级 Git diff 转为桌面端统一 ChangedFile。
 * 业务意图：最终卡片只展示 baseline -> final 的净增删行数，同一文件多次
 * edit 不再累加中间过程；workspace diff 天然带正文，因此 write 文件也可点击审查。
 */
export function changedFilesFromWorkspaceChanges(changes?: WorkspaceChangeSet): ChangedFile[] {
	if (!changes || typeof changes !== 'object' || changes.version !== 1 || changes.source !== 'git' || !Array.isArray(changes.files)) return [];
	return changes.files.map((file) => ({
		path: file.path,
		status: file.status,
		added: file.added,
		removed: file.removed,
		diff: file.diff,
		diffs: file.diff ? [file.diff] : undefined,
		editCount: 1,
		editable: Boolean(file.diff),
	}));
}

/** 将工具参数/结果序列化为 ExecutionStep.args/result 用的字符串，与 workbench.stringifyPayload 对齐。 */
function stringifyPayload(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

/**
 * 历史路径：以单条 assistant 消息为锚点，重建其所有工具调用为 ExecutionStep。
 * 与实时 reduceExecutionEvent 对齐：kind 用 classifyExecutionKind，args/result 字符串化。
 * 用于历史回放时重建 ExecutionBatch（“改动了xx文件、执行了xx命令”摘要）。
 */
export function parseExecutionStepsFromMessages(messages: unknown[], assistantIndex: number): ExecutionStep[] {
	const assistant = messages[assistantIndex] as { content?: unknown[] };
	const steps: ExecutionStep[] = [];
	if (!Array.isArray(assistant?.content)) return steps;
	for (const block of assistant.content) {
		const tc = block as Partial<ToolCallBlock>;
		if (tc.type !== 'toolCall' || typeof tc.name !== 'string') continue;
		const toolCallId = tc.id ?? '';
		const result = toolCallId ? findToolResult(messages, assistantIndex, toolCallId) : undefined;
		const isError = result?.isError === true;
		const payload = result ? { content: result.content, details: result.details } : undefined;
		steps.push({
			id: toolCallId || `step-${steps.length}`,
			toolCallId: toolCallId || undefined,
			kind: classifyExecutionKind(tc.name),
			status: isError ? 'failed' : 'succeeded',
			title: tc.name,
			args: stringifyPayload(tc.arguments),
			result: payload ? stringifyPayload(payload) : undefined,
			error: isError && payload ? stringifyPayload(payload) : undefined,
			startedAt: 0,
			endedAt: 0,
		});
	}
	return steps;
}
