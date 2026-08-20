import { describe, expect, it } from "vitest";
import type { AgentSessionEvent } from "../src/core/agent-session.ts";
import { buildDesignCompactionInstructions, collectDesignPatchDelta, projectDesignAgentEvent } from "../src/modes/rpc/design-events.ts";

describe("Design RPC event projection", () => {
	it("只传输 patch 的变更文件与删除路径", () => {
		const files = [
			{ path: "pages/home/index.html", language: "html" as const, content: "<main />" },
			{ path: "pages/home/styles.css", language: "css" as const, content: ".home{}" },
			{ path: "pages/login/index.html", language: "html" as const, content: "<form />" },
		];
		const delta = collectDesignPatchDelta([
			{ op: "replace_file", path: "pages/home/styles.css", content: ".home{color:red}" },
			{ op: "rename_file", path: "pages/login/index.html", newPath: "pages/sign-in/index.html" },
		], [
			files[0],
			{ ...files[1], content: ".home{color:red}" },
			{ ...files[2], path: "pages/sign-in/index.html" },
		]);

		expect(delta.changedFiles.map((file) => file.path)).toEqual(["pages/home/styles.css", "pages/sign-in/index.html"]);
		expect(delta.removedPaths).toEqual(["pages/login/index.html"]);
	});

	it("剥离工具 patch 正文和原始输出，只保留轻量摘要", () => {
		const rawPatch = "x".repeat(128_000);
		const started = projectDesignAgentEvent({
			type: "tool_execution_start",
			toolCallId: "patch-1",
			toolName: "design_apply_patch",
			args: { operations: [{ op: "replace_file", path: "pages/home/styles.css", content: rawPatch }] },
		} as AgentSessionEvent);
		const ended = projectDesignAgentEvent({
			type: "tool_execution_end",
			toolCallId: "patch-1",
			toolName: "design_apply_patch",
			result: rawPatch,
			isError: false,
		} as AgentSessionEvent);

		expect(started).toMatchObject({ type: "tool_execution_start", toolCallId: "patch-1", summary: "修改 pages/home/styles.css · 125 KB" });
		expect(ended).toEqual({ type: "tool_execution_end", toolCallId: "patch-1", toolName: "design_apply_patch" });
		expect(JSON.stringify({ started, ended })).not.toContain(rawPatch);
	});

	it("只保留助手可见正文，丢弃内部和工具消息", () => {
		const assistant = projectDesignAgentEvent({
			type: "message_end",
			message: { role: "assistant", content: [{ type: "text", text: "正在更新登录页面。" }, { type: "toolCall", arguments: { content: "secret" } }] },
		} as AgentSessionEvent);
		const internal = projectDesignAgentEvent({ type: "message_end", message: { role: "user", content: "内部提示" } } as AgentSessionEvent);

		expect(assistant).toEqual({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "正在更新登录页面。" }] } });
		expect(internal).toBeNull();
	});

	it("只投影 Design 压缩状态和错误，不传输摘要正文", () => {
		expect(projectDesignAgentEvent({ type: "compaction_start", reason: "threshold" })).toEqual({ type: "compaction_start" });
		expect(projectDesignAgentEvent({ type: "compaction_end", reason: "overflow", result: undefined, aborted: false, willRetry: false, errorMessage: "overflow detail" })).toEqual({ type: "compaction_end", result: false, errorMessage: "overflow detail" });
		expect(projectDesignAgentEvent({ type: "compaction_end", reason: "manual", result: { summary: "不要传输这段摘要" } as never, aborted: false, willRetry: false })).toEqual({ type: "compaction_end", result: true });
	});

	it("按当前 pageId 生成 Design 压缩上下文，切页后不残留页面选择器", () => {
		const snapshot = {
			document: {
				id: "design-1",
				name: "设计工作区",
				pages: [
					{ id: "home", name: "首页", route: "/", entryFileId: "home-html", fileIds: ["home-html", "home-css"] },
					{ id: "settings", name: "设置页", route: "/settings", entryFileId: "settings-html", fileIds: ["settings-html", "settings-css"] },
				],
				revisions: [{ id: "rev-2", summary: "完成首页", prompt: "首页", createdAt: "2026-08-20T00:00:00.000Z" }],
			},
			files: [
				{ id: "home-html", path: "pages/home/index.html", language: "html" as const, content: '<main class="home-only" data-design-id="home-main"></main>' },
				{ id: "home-css", path: "pages/home/styles.css", language: "css" as const, content: '@media (max-width: 768px) {.home-only{display:block}}' },
				{ id: "settings-html", path: "pages/settings/index.html", language: "html" as const, content: '<form class="settings-only"></form>' },
				{ id: "settings-css", path: "pages/settings/styles.css", language: "css" as const, content: '.settings-only{display:grid}' },
				{ path: "shared/tokens.css", scope: "shared" as const, language: "css" as const, content: ":root{}" },
			],
			guidelines: { version: 1 as const, brand: { name: "GitPilot", tone: "克制" }, tokens: { colors: {}, typography: {}, spacing: {}, radius: {}, shadows: {} }, components: {}, rules: ["按钮必须有焦点态"], accessibility: { minContrast: "AA" as const }, updatedAt: "2026-08-20T00:00:00.000Z" },
		};
		const home = buildDesignCompactionInstructions(snapshot, "home");
		const settings = buildDesignCompactionInstructions(snapshot, "settings");
		expect(home).toContain("pageId=home");
		expect(home).toContain("home-only");
		expect(home).toContain("shared/tokens.css");
		expect(home).not.toContain("settings-only");
		expect(settings).toContain("pageId=settings");
		expect(settings).toContain("settings-only");
		expect(settings).not.toContain("home-only");
		expect(home).not.toContain("<main");
	});
});
