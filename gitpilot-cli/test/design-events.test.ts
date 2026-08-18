import { describe, expect, it } from "vitest";
import type { AgentSessionEvent } from "../src/core/agent-session.ts";
import { collectDesignPatchDelta, projectDesignAgentEvent } from "../src/modes/rpc/design-events.ts";

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
});
