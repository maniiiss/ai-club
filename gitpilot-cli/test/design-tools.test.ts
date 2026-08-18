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
		expect(isDesignPatchOperation({ op: "replace_file", path: "../../secret", content: "x" })).toBe(false);
		expect(isDesignPatchOperation({ op: "replace_file", path: "main.js" })).toBe(false);
		expect(isDesignPatchOperation({ op: "write_file", path: "main.js", content: "x" })).toBe(false);
	});

	it("高风险 patch 先等待审批，审批后才调用 sidecar apply", async () => {
		const applyPatch = vi.fn().mockResolvedValue({ operationId: "op-1", revisionId: "rev-2", summary: "更新", changedFiles: snapshot.files, removedPaths: [], snapshot });
		const requestApproval = vi.fn().mockResolvedValue(true);
		const tool = createDesignToolDefinitions({ getPageId: () => "home", getSnapshot: () => snapshot, applyPatch, requestApproval, requestClarification: vi.fn(), updatePlan: vi.fn() })[0];
		const result = await tool.execute("call-1", { baseRevisionId: "rev-1", risk: "high", operations: [{ op: "replace_text", path: "styles.css", search: ".old", replacement: ".new" }] }, undefined, undefined, {} as never);
		const payload = JSON.parse(String(result.content[0].text)) as { operationId: string; pageId: string };
		expect(requestApproval).toHaveBeenCalledOnce();
		expect(applyPatch).toHaveBeenCalledOnce();
		expect(payload).toMatchObject({ operationId: "op-1", pageId: "home" });
	});

	it("用户拒绝高风险 patch 时不落盘", async () => {
		const applyPatch = vi.fn();
		const tool = createDesignToolDefinitions({ getPageId: () => "home", getSnapshot: () => snapshot, applyPatch, requestApproval: vi.fn().mockResolvedValue(false), requestClarification: vi.fn(), updatePlan: vi.fn() })[0];
		await expect(tool.execute("call-2", { baseRevisionId: "rev-1", risk: "high", operations: [{ op: "replace_file", path: "index.html", content: "<main />" }] }, undefined, undefined, {} as never)).rejects.toThrow("用户拒绝");
		expect(applyPatch).not.toHaveBeenCalled();
	});

	it("澄清工具等待用户回答，计划工具归一化状态", async () => {
		const requestClarification = vi.fn().mockResolvedValue("管理员");
		const updatePlan = vi.fn().mockResolvedValue(undefined);
		const tools = createDesignToolDefinitions({ getPageId: () => "home", getSnapshot: () => snapshot, applyPatch: vi.fn(), requestApproval: vi.fn(), requestClarification, updatePlan });
		const clarification = await tools.find((tool) => tool.name === "design_request_clarification")?.execute("call-3", { question: "主要用户是谁？", options: ["管理员"] }, undefined, undefined, {} as never);
		const plan = await tools.find((tool) => tool.name === "update_plan")?.execute("call-4", { steps: [{ title: "完成页面骨架", status: "running" }, { title: "验证响应式", status: "pending" }] }, undefined, undefined, {} as never);
		expect(requestClarification).toHaveBeenCalledWith({ question: "主要用户是谁？", context: undefined, options: ["管理员"] });
		expect(JSON.parse(String(clarification?.content[0].text))).toMatchObject({ answer: "管理员" });
		expect(updatePlan).toHaveBeenCalledWith([{ id: "design-step-1", text: "完成页面骨架", state: "active" }, { id: "design-step-2", text: "验证响应式", state: "pending" }], undefined);
		expect(plan).toBeDefined();
		expect(normalizeDesignPlanSteps({ steps: [{ title: "阶段一", status: "completed" }] })).toEqual([{ id: "design-step-1", text: "阶段一", state: "done" }]);
	});
});
