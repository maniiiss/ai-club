/**
 * AI 提交信息生成的纯文本构造与抽取。
 *
 * 业务意图：Desktop 提交时若未填写提交信息，由 sidecar 用一次性模型会话基于暂存
 * diff 生成；本模块只负责提示词构造与对模型输出的清洗（可脱离会话单测）。
 */

/** 进入模型上下文的暂存 diff 上限，与 repository-service 的截断口径一致。 */
export const COMMIT_MESSAGE_DIFF_MAX_BYTES = 24 * 1024;

/** 一次性会话的系统提示：限定输出为"单条提交信息"，杜绝解释与围栏。 */
export const COMMIT_MESSAGE_SYSTEM_PROMPT = [
	"你是 Git 提交信息生成器。根据用户提供的暂存变更生成一条提交信息。",
	"要求：",
	"- 首行：不超过 50 个字符的中文祈使句，概括变更目的，不要罗列文件名。",
	"- 若变更包含多个主题，首行概括主要目的，空一行后用 \"- \" 列表补充次要要点（最多 5 条）。",
	"- 只输出提交信息本身，不要解释、前言、代码块围栏或引号。",
].join("\n");

export interface CommitMessageSuggestionInput {
	files: string[];
	diff: string;
	truncated: boolean;
	binary: boolean;
}

/** 构造生成请求的用户消息：文件清单 + （截断后的）暂存 diff。 */
export function buildCommitMessagePrompt(input: CommitMessageSuggestionInput): string {
	const lines: string[] = ["请为以下暂存变更生成提交信息。", "", "暂存文件：", ...input.files.map((file) => `- ${file}`)];
	if (input.binary) lines.push("", "（包含二进制文件，对应 diff 未展示）");
	if (input.diff) lines.push("", "暂存 diff：", input.diff);
	if (input.truncated) lines.push("", "（diff 超长已截断，请基于以上内容总结）");
	return lines.join("\n");
}

const LABEL_PREFIX = /^(提交信息|commit\s*message)\s*[:：]\s*/i;
/** 提交信息总长度上限，防止模型长篇大论被误当作提交信息。 */
const COMMIT_MESSAGE_MAX_LENGTH = 500;

/**
 * 从模型回复中抽取提交信息：首行作为标题，其后紧跟的 "- " 列表作为正文要点；
 * 剥离围栏、引号与"提交信息："类标签，忽略标题后首个非列表行之后的解释性内容。
 */
export function extractCommitMessage(raw: string): string {
	const cleaned = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "```")
		.join("\n")
		.trim();
	if (!cleaned) return "";
	const lines = cleaned.split("\n").map((line) => line.replace(/^>\s*/, "").trim());
	const subjectLine = lines.find((line) => line.length > 0);
	if (!subjectLine) return "";
	const subject = subjectLine.replace(/^["'“”]+|["'“”]+$/g, "").replace(LABEL_PREFIX, "").trim();
	if (!subject) return "";
	const subjectIndex = lines.indexOf(subjectLine);
	const bullets: string[] = [];
	for (let index = subjectIndex + 1; index < lines.length && bullets.length < 5; index += 1) {
		const line = lines[index];
		if (!line) continue;
		if (!/^[-*]\s+/.test(line)) break;
		bullets.push(line.replace(/^[-*]\s+/, "- "));
	}
	const message = bullets.length > 0 ? `${subject}\n\n${bullets.join("\n")}` : subject;
	return message.length > COMMIT_MESSAGE_MAX_LENGTH ? message.slice(0, COMMIT_MESSAGE_MAX_LENGTH) : message;
}
