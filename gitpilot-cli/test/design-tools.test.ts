import { describe, expect, it, vi } from "vitest";
import { createDesignToolDefinitions, isDesignPatchOperation, normalizeDesignPlanSteps } from "../src/modes/rpc/design-tools.ts";
import type { DesignRpcSnapshot } from "../src/modes/rpc/rpc-types.ts";

const snapshot: DesignRpcSnapshot = {
	document: { id: "design-test", version: 1, pages: [{ id: "home", entryFileId: "home-index", fileIds: ["home-index", "home-styles", "home-main"] }], revisions: [{ id: "rev-1" }] },
	files: [
		{ path: "index.html", language: "html", content: "<main>old</main>" },
		{ path: "styles.css", language: "css", content: ".old{color:black}" },
		{ path: "main.js", language: "javascript", content: "console.log('old')" },
	],
};

describe("Design 结构化工具", () => {
	it("只接受白名单文件和完整的操作参数", () => {
		expect(isDesignPatchOperation({ op: "replace_file", path: "index.html", content: "<main />" })).toBe(true);
		expect(isDesignPatchOperation({ op: "replace_text", path: "styles.css", search: ".old", replacement: ".new" })).toBe(true);
		expect(isDesignPatchOperation({ op: "insert_text", path: "styles.css", anchor: ".old", text: "\n.new{}", position: "after" })).toBe(true);
		expect(isDesignPatchOperation({ op: "replace_file", path: "../../secret", content: "x" })).toBe(false);
		expect(isDesignPatchOperation({ op: "replace_file", path: "main.js" })).toBe(false);
		expect(isDesignPatchOperation({ op: "write_file", path: "main.js", content: "x" })).toBe(false);
	});

	it("支持读取完整文件并允许整文件 patch", async () => {
		const applyPatch = vi.fn().mockResolvedValue({ operationId: "op-full", revisionId: "rev-2", summary: "整文件更新", changedFiles: [snapshot.files[1]], removedPaths: [], snapshot });
		const tools = createDesignToolDefinitions({ getPageId: () => "home", getSnapshot: () => snapshot, getBaseRevisionId: () => "rev-1", applyPatch, requestApproval: vi.fn(), requestClarification: vi.fn(), updatePlan: vi.fn(), skipPlan: vi.fn() });
		const read = tools.find((tool) => tool.name === "design_read_file");
		const result = await read?.execute("call-read", { path: "styles.css", startLine: 1, endLine: 1 }, undefined, undefined, {} as never);
		expect(JSON.parse(String(result?.content[0].text))).toMatchObject({ path: "styles.css", content: "1|.old{color:black}", truncated: false });
		const charResult = await read?.execute("call-read-char", { path: "styles.css", startChar: 2, maxChars: 1_000 }, undefined, undefined, {} as never);
		expect(JSON.parse(String(charResult?.content[0].text))).toMatchObject({ startChar: 2, content: "ld{color:black}", truncated: false });
		const fullResult = await read?.execute("call-read-full", { path: "styles.css" }, undefined, undefined, {} as never);
		expect(JSON.parse(String(fullResult?.content[0].text))).toMatchObject({ path: "styles.css", content: ".old{color:black}", truncated: false });
		const patch = tools.find((tool) => tool.name === "design_apply_patch");
		await patch?.execute("call-full-patch", { operations: [{ op: "replace_file", path: "styles.css", content: "x".repeat(100_000) }] }, undefined, undefined, {} as never);
		expect(applyPatch).toHaveBeenCalledOnce();
		expect(applyPatch.mock.calls[0][0]).toMatchObject({ baseRevisionId: "rev-1" });
		const parameters = patch?.parameters as { properties?: Record<string, unknown> };
		expect(parameters.properties?.baseRevisionId).toBeUndefined();
	});

	it("高风险 patch 先等待审批，审批后才调用 sidecar apply", async () => {
		const applyPatch = vi.fn().mockResolvedValue({ operationId: "op-1", revisionId: "rev-2", summary: "更新", changedFiles: snapshot.files, removedPaths: [], snapshot });
		const requestApproval = vi.fn().mockResolvedValue(true);
		const tool = createDesignToolDefinitions({ getPageId: () => "home", getSnapshot: () => snapshot, getBaseRevisionId: () => "rev-1", applyPatch, requestApproval, requestClarification: vi.fn(), updatePlan: vi.fn(), skipPlan: vi.fn() })[0];
		const result = await tool.execute("call-1", { risk: "high", operations: [{ op: "replace_text", path: "styles.css", search: ".old", replacement: ".new" }] }, undefined, undefined, {} as never);
		const payload = JSON.parse(String(result.content[0].text)) as { operationId: string; pageId: string };
		expect(requestApproval).toHaveBeenCalledOnce();
		expect(applyPatch).toHaveBeenCalledOnce();
		expect(payload).toMatchObject({ operationId: "op-1", pageId: "home" });
	});

	it("连续 patch 始终使用服务端基准，不依赖上一次工具返回的 draft revision", async () => {
		const applyPatch = vi.fn()
			.mockResolvedValueOnce({ operationId: "op-1", revisionId: "draft-run-1", summary: "第一次更新", changedFiles: [], removedPaths: [], snapshot })
			.mockResolvedValueOnce({ operationId: "op-2", revisionId: "draft-run-1", summary: "第二次更新", changedFiles: [], removedPaths: [], snapshot });
		const getBaseRevisionId = vi.fn(() => "rev-1");
		const tool = createDesignToolDefinitions({ getPageId: () => "home", getSnapshot: () => snapshot, getBaseRevisionId, applyPatch, requestApproval: vi.fn(), requestClarification: vi.fn(), updatePlan: vi.fn(), skipPlan: vi.fn() })[0];

		await tool.execute("call-1", { operations: [{ op: "replace_text", path: "styles.css", search: ".old", replacement: ".new" }] }, undefined, undefined, {} as never);
		await tool.execute("call-2", { operations: [{ op: "replace_text", path: "styles.css", search: ".new", replacement: ".latest" }] }, undefined, undefined, {} as never);

		expect(getBaseRevisionId).toHaveBeenCalledTimes(2);
		expect(applyPatch.mock.calls.map(([patch]) => patch.baseRevisionId)).toEqual(["rev-1", "rev-1"]);
	});

	it("用户拒绝高风险 patch 时不落盘", async () => {
		const applyPatch = vi.fn();
		const tool = createDesignToolDefinitions({ getPageId: () => "home", getSnapshot: () => snapshot, getBaseRevisionId: () => "rev-1", applyPatch, requestApproval: vi.fn().mockResolvedValue(false), requestClarification: vi.fn(), updatePlan: vi.fn(), skipPlan: vi.fn() })[0];
		await expect(tool.execute("call-2", { risk: "high", operations: [{ op: "replace_file", path: "index.html", content: "<main />" }] }, undefined, undefined, {} as never)).rejects.toThrow("用户拒绝");
		expect(applyPatch).not.toHaveBeenCalled();
	});

	it("澄清工具等待用户回答，计划工具归一化状态", async () => {
		const requestClarification = vi.fn().mockResolvedValue("管理员");
		const updatePlan = vi.fn().mockResolvedValue(undefined);
		const skipPlan = vi.fn().mockResolvedValue(undefined);
		const tools = createDesignToolDefinitions({ getPageId: () => "home", getSnapshot: () => snapshot, getBaseRevisionId: () => "rev-1", applyPatch: vi.fn(), requestApproval: vi.fn(), requestClarification, updatePlan, skipPlan });
		const clarification = await tools.find((tool) => tool.name === "design_request_clarification")?.execute("call-3", { question: "主要用户是谁？", options: ["管理员"] }, undefined, undefined, {} as never);
		const plan = await tools.find((tool) => tool.name === "update_plan")?.execute("call-4", { steps: [{ title: "完成页面骨架", status: "running" }, { title: "验证响应式", status: "pending" }] }, undefined, undefined, {} as never);
		const skip = await tools.find((tool) => tool.name === "skip_plan")?.execute("call-5", { explanation: "只需直接修改一个标题" }, undefined, undefined, {} as never);
		expect(requestClarification).toHaveBeenCalledWith({ question: "主要用户是谁？", context: undefined, options: ["管理员"] });
		expect(JSON.parse(String(clarification?.content[0].text))).toMatchObject({ answer: "管理员" });
		expect(updatePlan).toHaveBeenCalledWith([{ id: "design-step-1", text: "完成页面骨架", state: "active" }, { id: "design-step-2", text: "验证响应式", state: "pending" }], undefined);
		expect(plan).toBeDefined();
		expect(skipPlan).toHaveBeenCalledWith("只需直接修改一个标题");
		expect(JSON.parse(String(skip?.content[0].text))).toMatchObject({ decision: "skip" });
		expect(normalizeDesignPlanSteps({ steps: [{ title: "阶段一", status: "completed" }] })).toEqual([{ id: "design-step-1", text: "阶段一", state: "done" }]);
	});

	it("生产 Design 工具列表暴露 skip_plan/update_plan 决策工具，并支持兼容关闭", () => {
		const context = { getPageId: () => "home", getSnapshot: () => snapshot, getBaseRevisionId: () => "rev-1", applyPatch: vi.fn(), requestApproval: vi.fn(), requestClarification: vi.fn(), updatePlan: vi.fn(), skipPlan: vi.fn() };
		const tools = createDesignToolDefinitions(context);
		expect(tools.some((tool) => tool.name === "update_plan")).toBe(true);
		expect(tools.some((tool) => tool.name === "skip_plan")).toBe(true);
		const compatibilityTools = createDesignToolDefinitions(context, { includePlanTool: false, includeSkipPlanTool: false });
		expect(compatibilityTools.some((tool) => tool.name === "update_plan")).toBe(false);
		expect(compatibilityTools.some((tool) => tool.name === "skip_plan")).toBe(false);
	});
});
