/**
 * 计划消息的展示解析器。
 *
 * sidecar 为兼容既有 plan-mode 输出会携带 Proposed Plan 包装标题；
 * 这里只处理展示层包装，不改变会话中保存的原始 Markdown。
 */

export interface ParsedPlanContent {
	title: string;
	markdown: string;
	previewMarkdown: string;
}

const PROPOSED_PLAN_PREFIX = /^\s*\*\*Proposed Plan\*\*\s*(?:\r?\n)+/i;
const MARKDOWN_HEADING = /^#{1,6}\s+(.+?)\s*#*$/;

function stripWrapper(text: string): string {
	return text.replace(/\r\n/g, '\n').replace(PROPOSED_PLAN_PREFIX, '').trim();
}

function cleanHeading(value: string): string {
	return value.replace(/[`*_]/g, '').trim() || '实施计划';
}

function getTitle(markdown: string): string {
	for (const line of markdown.split('\n')) {
		const match = line.trim().match(MARKDOWN_HEADING);
		if (match) return cleanHeading(match[1]);
	}
	const firstLine = markdown.split('\n').find((line) => line.trim()) ?? '';
	return cleanHeading(firstLine.slice(0, 96));
}

/** 预览最多保留前四个 Markdown 块，具体高度由卡片 CSS 负责收敛。 */
function getPreview(markdown: string): string {
	return markdown
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter(Boolean)
		.slice(0, 4)
		.join('\n\n');
}

export function parsePlanContent(text: string): ParsedPlanContent {
	const markdown = stripWrapper(text);
	return {
		title: getTitle(markdown),
		markdown,
		previewMarkdown: getPreview(markdown),
	};
}

