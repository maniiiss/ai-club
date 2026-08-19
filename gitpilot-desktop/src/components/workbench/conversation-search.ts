/**
 * 历史任务搜索的纯逻辑：Code 与 Work 使用同一套归一化、匹配、排序和截断规则，
 * 但由调用方决定各自模式允许被搜索的字段。
 */

export type ConversationSearchTimestamp = string | number | Date | null | undefined;

export interface ConversationSearchResult<T> {
	item: T;
	title: string;
	summary: string;
	updatedAt: ConversationSearchTimestamp;
	key: string;
}

export interface ConversationSearchOptions<T> {
	getKey?: (item: T, index: number) => string;
	getTitle: (item: T) => string;
	getSearchText: (item: T) => string;
	getUpdatedAt: (item: T) => ConversationSearchTimestamp;
	limit?: number;
}

export const DEFAULT_CONVERSATION_SEARCH_LIMIT = 8;

/** 将用户输入和历史文本统一为可稳定匹配的单行、小写文本。 */
export function normalizeConversationSearchText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('zh-CN');
}

function searchTerms(query: string): string[] {
	return normalizeConversationSearchText(query).split(' ').filter(Boolean);
}

function timestampValue(value: ConversationSearchTimestamp): number {
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
	if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
	if (typeof value === 'string') {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function truncateSummary(value: string, start: number, end: number): string {
	const prefix = start > 0 ? '…' : '';
	const suffix = end < value.length ? '…' : '';
	return `${prefix}${value.slice(start, end)}${suffix}`;
}

function buildSummary(value: string, terms: string[]): string {
	const cleaned = value.replace(/\s+/g, ' ').trim();
	if (!cleaned) return '匹配历史任务';
	const normalized = cleaned.toLocaleLowerCase('zh-CN');
	const matchIndex = terms
		.map((term) => normalized.indexOf(term))
		.filter((index) => index >= 0)
		.sort((left, right) => left - right)[0] ?? 0;
	const start = Math.max(0, matchIndex - 36);
	const end = Math.min(cleaned.length, Math.max(matchIndex + 72, start + 108));
	return truncateSummary(cleaned, start, end);
}

/**
 * 搜索所有关键词均出现的历史任务，并按最近更新时间倒序返回有限数量的结果。
 * 未传入关键词时返回空数组，调用方可以据此展示“输入关键词”的引导状态。
 */
export function searchConversationHistory<T>(items: readonly T[], query: string, options: ConversationSearchOptions<T>): ConversationSearchResult<T>[] {
	const terms = searchTerms(query);
	if (terms.length === 0) return [];
	const limit = Math.max(0, Math.floor(options.limit ?? DEFAULT_CONVERSATION_SEARCH_LIMIT));
	if (limit === 0) return [];

	return items
		.map((item, index) => {
			const title = options.getTitle(item).replace(/\s+/g, ' ').trim() || '未命名任务';
			const rawSearchText = options.getSearchText(item);
			const searchText = normalizeConversationSearchText(rawSearchText);
			const updatedAt = options.getUpdatedAt(item);
			return {
				item,
				index,
				title,
				summary: buildSummary(rawSearchText, terms),
				updatedAt,
				key: options.getKey?.(item, index) ?? String(index),
				matched: terms.every((term) => searchText.includes(term)),
				updatedAtValue: timestampValue(updatedAt),
			};
		})
		.filter((entry) => entry.matched)
		.sort((left, right) => right.updatedAtValue - left.updatedAtValue || left.index - right.index)
		.slice(0, limit)
		.map(({ item, title, summary, updatedAt, key }) => ({ item, title, summary, updatedAt, key }));
}
