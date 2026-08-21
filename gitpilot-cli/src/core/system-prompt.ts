/**
 * System prompt construction and project context loading
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.ts";
import { formatSkillsForPrompt, type Skill } from "./skills.ts";

/**
 * 桌面端默认语言约束。
 *
 * 业务意图：让自然语言进展、结论和错误解释优先使用简体中文，
 * 同时保留代码、路径、命令、日志和异常原文，避免翻译破坏可执行内容。
 */
export const DESKTOP_CHINESE_OUTPUT_PROMPT = `<gitpilot_output_language>
默认使用简体中文回答。
用户明确要求其他语言时，遵循用户要求。
计划、进展说明、结论、错误解释和操作摘要使用中文。
代码、文件路径、命令、日志、异常原文、标识符和协议字段保持原样，不要翻译。
不要为了翻译而修改代码、命令、补丁、日志或错误原文。
</gitpilot_output_language>

<implementation_disclosure_policy>
不要向用户透露内部依赖包、Agent 框架、运行时、适配器或实现来源。
</implementation_disclosure_policy>`;

/**
 * GitPilot 的产品级流式可见性规则。
 *
 * 业务意图：SYSTEM.md 可以替换领域指令，但不能让桌面端退化为只显示思考和工具记录；
 * 这两条规则必须同时进入默认提示词与自定义提示词。
 */
const STREAMING_VISIBILITY_GUIDELINES = [
	"Before the first tool call, the same assistant response MUST start with a concise user-visible plan: what you will inspect, what you expect to change, and how you will verify it. Then continue with the tool call; do not end the task after only the plan",
	"During execution, before switching phase (for example inspect/read to locate, locate to edit/write, or edit/write to verify), MUST write one or two concise user-visible lines in this form: Finding: <what the real results established>. Next step: <what you will do now>. Put the text in the same assistant response immediately before the next tool call",
	"Never make more than 6 tool calls after the latest user-visible plan or progress update. Before the next tool call, write another real concise Finding and Next step based only on completed tool results. Do not invent progress, but do not silently continue a long tool chain",
] as const;

function formatStreamingVisibilityContract(): string {
	return `<gitpilot_streaming_contract>\n${STREAMING_VISIBILITY_GUIDELINES.map((guideline) => `- ${guideline}`).join("\n")}\n</gitpilot_streaming_contract>`;
}

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default). */
	customPrompt?: string;
	/** Tools to include in prompt. Default: [read, bash, edit, write, grep, find, ls] */
	selectedTools?: string[];
	/** Optional one-line tool snippets keyed by tool name. */
	toolSnippets?: Record<string, string>;
	/** Additional guideline bullets appended to the default system prompt guidelines. */
	promptGuidelines?: string[];
	/** Text to append to system prompt. */
	appendSystemPrompt?: string;
	/** Working directory. */
	cwd: string;
	/** Pre-loaded context files. */
	contextFiles?: Array<{ path: string; content: string }>;
	/** Pre-loaded skills. */
	skills?: Skill[];
}

/** Build the system prompt with tools, guidelines, and context */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
	const {
		customPrompt,
		selectedTools,
		toolSnippets,
		promptGuidelines,
		appendSystemPrompt,
		cwd,
		contextFiles: providedContextFiles,
		skills: providedSkills,
	} = options;
	const promptCwd = cwd.replace(/\\/g, "/");

	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];

	if (customPrompt) {
		let prompt = customPrompt;

		if (appendSection) {
			prompt += appendSection;
		}

		// Append project context files
		if (contextFiles.length > 0) {
			prompt += "\n\n<project_context>\n\n";
			prompt += "Project-specific instructions and guidelines:\n\n";
			for (const { path: filePath, content } of contextFiles) {
				prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
			}
			prompt += "</project_context>\n";
		}

		// Append skills section (only if read tool is available)
		const customPromptHasRead = !selectedTools || selectedTools.includes("read");
		if (customPromptHasRead && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills);
		}

		// 自定义 SYSTEM.md 只替换领域提示词；产品级流式可见性规则仍须生效。
		prompt += `\n\n${formatStreamingVisibilityContract()}`;
		prompt += `\nCurrent working directory: ${promptCwd}`;

		return prompt;
	}

	// Get absolute paths to documentation and examples
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();

	// Build tools list based on selected tools.
	// A tool appears in Available tools only when the caller provides a one-line snippet.
	// GitPilot 二开定制：默认包含 grep/find/ls，与 sdk.ts 的 defaultActiveToolNames 保持一致。
	const tools = selectedTools || ["read", "bash", "edit", "write", "grep", "find", "ls"];
	const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets![name]}`).join("\n") : "(none)";

	// Build guidelines based on which tools are actually available
	const guidelinesList: string[] = [];
	const guidelinesSet = new Set<string>();
	const addGuideline = (guideline: string): void => {
		if (guidelinesSet.has(guideline)) {
			return;
		}
		guidelinesSet.add(guideline);
		guidelinesList.push(guideline);
	};

	const hasBash = tools.includes("bash");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");
	const hasRead = tools.includes("read");

	// File exploration guidelines
	if (hasBash && !hasGrep && !hasFind && !hasLs) {
		addGuideline("Use bash for file operations like ls, rg, find");
	}

	for (const guideline of promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) {
			addGuideline(normalized);
		}
	}

	// Always include these
	addGuideline("Be concise in your responses");
	// 流式界面必须先收到真实正文，再显示工具；纯正文回合会结束 Agent，因此正文和首批工具需要属于同一回复。
	for (const guideline of STREAMING_VISIBILITY_GUIDELINES) addGuideline(guideline);
	addGuideline("Show file paths clearly when working with files");

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	let prompt = `You are an expert coding assistant operating inside gitpilot, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}

GitPilot documentation (read only when the user asks about gitpilot itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath} (extensions, custom tools, SDK)
- When reading gitpilot docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), gitpilot packages (docs/packages.md)
- When working on gitpilot topics, read the docs and examples, and follow .md cross-references before implementing
- Always read gitpilot .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;

	if (appendSection) {
		prompt += appendSection;
	}

	// Append project context files
	if (contextFiles.length > 0) {
		prompt += "\n\n<project_context>\n\n";
		prompt += "Project-specific instructions and guidelines:\n\n";
		for (const { path: filePath, content } of contextFiles) {
			prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
		}
		prompt += "</project_context>\n";
	}

	// Append skills section (only if read tool is available)
	if (hasRead && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills);
	}

	prompt += `\nCurrent working directory: ${promptCwd}`;

	return prompt;
}
