/**
 * 会话标题生成器：用户发首条消息后，用 LLM 将问题总结为简短任务标题。
 *
 * 复用 completeSummarization（与 compaction / branch-summarization 同一调用路径），
 * 不传 tools 以避免触发 agent 工具循环。失败 / 超时 / 空标题时返回截断消息兜底，
 * 保证调用方总能拿到非空标题。
 */
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { contentText, type RetryCallbacks, type RetryPolicy } from "@earendil-works/pi-ai";
import type { Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai/compat";
import { completeSummarization } from "./compaction/compaction.ts";

/** 标题生成的系统提示：要求根据用户问题生成简短中文标题。 */
const TITLE_SYSTEM_PROMPT = `根据用户的问题生成一个简短的中文任务标题（不超过 20 个字）。
要求：
- 只返回标题文本，不要加引号、标点或任何解释
- 标题应概括用户的核心意图
- 若用户消息为英文，标题仍用中文概括`;

/** 兜底标题的最大长度（字符）。 */
const FALLBACK_MAX_LENGTH = 20;
/** 标题生成超时（毫秒）。超时后用截断消息兜底，避免任务长时间不显示。 */
const TITLE_TIMEOUT_MS = 10_000;
/** 标题生成的 maxTokens，标题很短，无需大预算。 */
const TITLE_MAX_TOKENS = 64;

export interface GenerateTitleOptions {
	apiKey?: string;
	headers?: Record<string, string>;
	env?: Record<string, string>;
	/** 外部取消信号（如会话切换 / 关闭）。与内部超时信号合并。 */
	signal?: AbortSignal;
	streamFn?: StreamFn;
	retry?: RetryPolicy;
	callbacks?: RetryCallbacks;
}

export interface GenerateTitleResult {
	/** 生成的标题文本（永不为空）。 */
	title: string;
	/** 是否为兜底标题（LLM 失败 / 超时 / 空标题时为 true）。 */
	fallback: boolean;
}

/**
 * 用 LLM 根据用户首条消息生成简短任务标题。
 *
 * 与 generateBranchSummary（branch-summarization.ts）结构一致，仅 prompt 更短、
 * maxTokens 更小。不传 tools，模型无法触发工具循环。
 */
export async function generateSessionTitle(
	model: Model<any>,
	userMessage: string,
	options: GenerateTitleOptions,
): Promise<GenerateTitleResult> {
	const fallback = fallbackTitle(userMessage);
	try {
		// 合并外部 signal 与内部超时 signal
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);
		const externalSignal = options.signal;
		if (externalSignal) {
			if (externalSignal.aborted) controller.abort();
			else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
		}

		const context: Context = {
			systemPrompt: TITLE_SYSTEM_PROMPT,
			messages: [
				{
					role: "user" as const,
					content: [{ type: "text" as const, text: userMessage }],
					timestamp: Date.now(),
				},
			],
		};
		const requestOptions: SimpleStreamOptions = {
			apiKey: options.apiKey,
			headers: options.headers,
			env: options.env,
			signal: controller.signal,
			maxTokens: TITLE_MAX_TOKENS,
		};

		const response = await completeSummarization(
			model,
			context,
			requestOptions,
			options.streamFn,
			options.retry,
			options.callbacks,
		);
		clearTimeout(timer);

		if (response.stopReason === "aborted" || response.stopReason === "error") {
			return { title: fallback, fallback: true };
		}

		const title = normalizeTitle(contentText(response.content));
		if (!title) return { title: fallback, fallback: true };
		return { title, fallback: false };
	} catch {
		return { title: fallback, fallback: true };
	}
}

/**
 * 规范化 LLM 返回的标题：去首尾空白、去包裹引号、去结尾句号。
 * 防止模型偶尔返回 "标题" 或 标题。 等格式。
 */
function normalizeTitle(raw: string): string {
	let t = raw.trim();
	// 去掉成对包裹的引号（中英文）
	const pairs: Array<[string, string]> = [
		['"', '"'],
		["'", "'"],
		["「", "」"],
		["“", "”"],
	];
	for (const [open, close] of pairs) {
		if (t.length >= 2 && t.startsWith(open) && t.endsWith(close)) {
			t = t.slice(1, -1).trim();
			break;
		}
	}
	// 去掉结尾句号 / 英文句点
	t = t.replace(/[。.]\s*$/, "");
	return t;
}

/** 截断用户消息作为兜底标题：压缩空白后限长，超出加省略号。导出供异常路径使用。 */
export function fallbackTitle(message: string): string {
	const trimmed = message.trim().replace(/\s+/g, " ");
	if (trimmed.length <= FALLBACK_MAX_LENGTH) return trimmed;
	return `${trimmed.slice(0, FALLBACK_MAX_LENGTH)}…`;
}
