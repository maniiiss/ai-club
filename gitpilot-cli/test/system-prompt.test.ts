import { describe, expect, test } from "vitest";
import { buildSystemPrompt, DESKTOP_CHINESE_OUTPUT_PROMPT } from "../src/core/system-prompt.ts";

describe("buildSystemPrompt", () => {
	describe("empty tools", () => {
		test("shows (none) for empty tools list", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Available tools:\n(none)");
		});

		test("shows file paths guideline even with no tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Show file paths clearly");
		});

		test("asks for a visible initial plan before the first tool call", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("Before the first tool call, the same assistant response MUST start with a concise user-visible plan");
		});

		test("requires real phase updates and bounds silent tool chains", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("During execution, before switching phase");
			expect(prompt).toContain("Finding: <what the real results established>. Next step: <what you will do now>");
			expect(prompt).toContain("Never make more than 6 tool calls after the latest user-visible plan or progress update");
		});

		test("keeps streaming visibility rules when a custom system prompt replaces the default", () => {
			const prompt = buildSystemPrompt({
				customPrompt: "You are the project's domain-specific coding assistant.",
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("You are the project's domain-specific coding assistant.");
			expect(prompt).toContain("<gitpilot_streaming_contract>");
			expect(prompt).toContain("Before the first tool call, the same assistant response MUST start with a concise user-visible plan");
			expect(prompt).toContain("Never make more than 6 tool calls after the latest user-visible plan or progress update");
		});
	});

	describe("default tools", () => {
		test("includes all default tools when snippets are provided", () => {
			const prompt = buildSystemPrompt({
				toolSnippets: {
					read: "Read file contents",
					bash: "Execute bash commands",
					edit: "Make surgical edits",
					write: "Create or overwrite files",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- edit:");
			expect(prompt).toContain("- write:");
		});

		test("instructs models to resolve GitPilot docs and examples under absolute base paths", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain(
				"- When reading gitpilot docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory",
			);
		});
	});

	describe("custom tool snippets", () => {
		test("includes custom tools in available tools section when promptSnippet is provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				toolSnippets: {
					dynamic_tool: "Run dynamic test behavior",
				},
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- dynamic_tool: Run dynamic test behavior");
		});

		test("omits custom tools from available tools section when promptSnippet is not provided", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).not.toContain("dynamic_tool");
		});
	});

	describe("prompt guidelines", () => {
		test("appends promptGuidelines to default guidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for project summaries."],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("- Use dynamic_tool for project summaries.");
		});

		test("deduplicates and trims promptGuidelines", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "dynamic_tool"],
				promptGuidelines: ["Use dynamic_tool for summaries.", "  Use dynamic_tool for summaries.  ", "   "],
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt.match(/- Use dynamic_tool for summaries\./g)).toHaveLength(1);
		});
	});

	describe("desktop output language", () => {
		test("keeps the desktop Chinese output contract when appended to the prompt", () => {
			const prompt = buildSystemPrompt({
				appendSystemPrompt: DESKTOP_CHINESE_OUTPUT_PROMPT,
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("<gitpilot_output_language>");
			expect(prompt).toContain("默认使用简体中文回答。");
			expect(prompt).toContain("用户明确要求其他语言时，遵循用户要求。");
			expect(prompt).toContain("代码、文件路径、命令、日志、异常原文、标识符和协议字段保持原样");
		});

		test("keeps the desktop Chinese output contract with a custom system prompt", () => {
			const prompt = buildSystemPrompt({
				customPrompt: "You are a project-specific coding assistant.",
				appendSystemPrompt: DESKTOP_CHINESE_OUTPUT_PROMPT,
				contextFiles: [],
				skills: [],
				cwd: process.cwd(),
			});

			expect(prompt).toContain("You are a project-specific coding assistant.");
			expect(prompt).toContain("默认使用简体中文回答。");
		});
	});
});
