import { describe, expect, it } from "vitest";
import { createAutoPlanExtension, normalizeAutoPlanSteps } from "../src/extensions/gitpilot/auto-plan.ts";

describe("GitPilot 自动执行计划", () => {
	it("允许模型提交步骤并规范进行中状态", () => {
		const result = normalizeAutoPlanSteps({
			steps: [
				{ title: "梳理现有接口", status: "completed" },
				{ title: "修改实现", status: "pending" },
				{ title: "补充测试", status: "pending" },
			],
		});
		expect(result).toEqual({
			ok: true,
			steps: [
				{ title: "梳理现有接口", status: "completed" },
				{ title: "修改实现", status: "running" },
				{ title: "补充测试", status: "pending" },
			],
		});
	});

	it("保留模型一次性提交的全部完成状态", () => {
		const result = normalizeAutoPlanSteps({
			steps: [
				{ title: "修改实现", status: "completed" },
				{ title: "运行测试", status: "completed" },
			],
		});
		expect(result).toEqual({
			ok: true,
			steps: [
				{ title: "修改实现", status: "completed" },
				{ title: "运行测试", status: "completed" },
			],
		});
	});

	it("拒绝多个并行的进行中步骤，保持单一当前步骤", () => {
		const result = normalizeAutoPlanSteps({
			steps: [
				{ title: "修改接口", status: "running" },
				{ title: "补测试", status: "in_progress" },
			],
		});
		expect(result.ok).toBe(false);
	});

	it("Code 回合注入决策提示，并把 update_plan 结果推送到 Desktop UI", async () => {
		const handlers = new Map<string, Array<(event: any, context: any) => unknown>>();
		const registeredTools = new Map<string, any>();
		const fakePi = {
			appendEntry: () => {},
			registerTool: (tool: any) => { registeredTools.set(tool.name, tool); },
			on: (event: string, handler: (event: any, context: any) => unknown) => {
				const existing = handlers.get(event) ?? [];
				existing.push(handler);
				handlers.set(event, existing);
			},
		} as any;
		await createAutoPlanExtension().factory(fakePi);
		const statuses: Array<string | undefined> = [];
		const widgets: string[][] = [];
		const context = {
			ui: {
				setStatus: (_key: string, value: string | undefined) => { statuses.push(value); },
				setWidget: (_key: string, value: string[] | undefined) => { if (value) widgets.push(value); },
			},
			sessionManager: { getBranch: () => [] },
		} as any;
		const inputHandler = handlers.get("input")?.[0];
		const beforeStartHandler = handlers.get("before_agent_start")?.[0];
		if (!inputHandler || !beforeStartHandler) throw new Error("auto-plan handlers were not registered");
		await inputHandler({
			type: "input",
			text: "重构登录 API，同时调整前端表单、数据库迁移，并补充测试和 CI 校验。",
			source: "rpc",
		}, context);
		const beforeStart = await beforeStartHandler({ type: "before_agent_start", systemPrompt: "base" }, context);
		expect(beforeStart?.systemPrompt).toContain("update_plan");

		const updatePlan = registeredTools.get("update_plan");
		const skipPlan = registeredTools.get("skip_plan");
		if (!updatePlan || !skipPlan) throw new Error("auto-plan decision tools were not registered");
		await updatePlan.execute("plan-1", {
			steps: [
				{ title: "梳理接口", status: "running" },
				{ title: "修改实现", status: "pending" },
			],
		}, undefined, undefined, context);
		expect(statuses.at(-1)).toBe("📋 0/2");
		expect(widgets.at(-1)).toEqual(["☐ 梳理接口", "☐ 修改实现"]);

		// 上一轮完成后开始新任务，输入框上的旧计划应立即清除。
		await updatePlan.execute("plan-2", {
			steps: [
				{ title: "梳理接口", status: "completed" },
				{ title: "修改实现", status: "completed" },
			],
		}, undefined, undefined, context);
		await inputHandler({
			type: "input",
			text: "修正 README 中的一个错别字",
			source: "rpc",
		}, context);
		expect(statuses.at(-1)).toBeUndefined();
	});

	it("复杂度由模型决策工具确定，而不是由宿主关键词猜测", async () => {
		const handlers = new Map<string, Array<(event: any, context: any) => unknown>>();
		const tools = new Map<string, any>();
		const entries: unknown[] = [];
		const fakePi = {
			appendEntry: (_type: string, data: unknown) => entries.push(data),
			registerTool: (tool: any) => tools.set(tool.name, tool),
			on: (event: string, handler: (event: any, context: any) => unknown) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
		} as any;
		await createAutoPlanExtension().factory(fakePi);
		const context = {
			ui: { setStatus: () => {}, setWidget: () => {} },
			sessionManager: { getBranch: () => [] },
		} as any;
		await handlers.get("input")?.[0]({ type: "input", text: "这是一项需要模型自己理解范围的任务", source: "rpc" }, context);
		const beforeStart = await handlers.get("before_agent_start")?.[0]({ type: "before_agent_start", systemPrompt: "base" }, context);
		expect(beforeStart?.systemPrompt).toContain("skip_plan");
		const blocked = await handlers.get("tool_call")?.[0]({ toolName: "write", input: { path: "README.md", content: "x" } }, context);
		expect(blocked).toMatchObject({ block: true });
		await tools.get("skip_plan").execute("skip-1", { explanation: "只需直接回答，不涉及文件修改" }, undefined, undefined, context);
		const mutationResult = await handlers.get("tool_call")?.[0]({ toolName: "write", input: { path: "README.md", content: "x" } }, context);
		expect(mutationResult).toBeUndefined();
		expect(entries.at(-1)).toEqual({ decisionPending: false, steps: [] });
	});

	it("中途停止会关闭计划 loading，并让下一条输入重新进入决策", async () => {
		const handlers = new Map<string, Array<(event: any, context: any) => unknown>>();
		const tools = new Map<string, any>();
		const statuses: Array<string | undefined> = [];
		const widgets: Array<string[] | undefined> = [];
		const fakePi = {
			appendEntry: () => {},
			registerTool: (tool: any) => tools.set(tool.name, tool),
			on: (event: string, handler: (event: any, context: any) => unknown) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
		} as any;
		await createAutoPlanExtension().factory(fakePi);
		const context = {
			ui: {
				setStatus: (_key: string, value: string | undefined) => statuses.push(value),
				setWidget: (_key: string, value: string[] | undefined) => widgets.push(value),
			},
			sessionManager: { getBranch: () => [] },
		} as any;

		await handlers.get("input")?.[0]({ type: "input", text: "实现并验证一项多文件改造", source: "rpc" }, context);
		await tools.get("update_plan").execute("plan-1", {
			steps: [{ title: "修改实现", status: "running" }, { title: "运行验证", status: "pending" }],
		}, undefined, undefined, context);
		await handlers.get("agent_end")?.[0]({ messages: [{ role: "assistant", stopReason: "aborted" }] }, context);

		expect(statuses.at(-1)).toBeUndefined();
		expect(widgets.at(-1)).toBeUndefined();
		await handlers.get("input")?.[0]({ type: "input", text: "继续处理剩余问题", source: "rpc" }, context);
		expect((await handlers.get("before_agent_start")?.[0]({ type: "before_agent_start", systemPrompt: "base" }, context))?.systemPrompt).toContain("update_plan");
	});

	it("正常完成后在 agent_settled 收起计划 loading", async () => {
		const handlers = new Map<string, Array<(event: any, context: any) => unknown>>();
		const tools = new Map<string, any>();
		const statuses: Array<string | undefined> = [];
		const widgets: Array<string[] | undefined> = [];
		const fakePi = {
			appendEntry: () => {},
			registerTool: (tool: any) => tools.set(tool.name, tool),
			on: (event: string, handler: (event: any, context: any) => unknown) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
		} as any;
		await createAutoPlanExtension().factory(fakePi);
		const context = {
			ui: {
				setStatus: (_key: string, value: string | undefined) => statuses.push(value),
				setWidget: (_key: string, value: string[] | undefined) => widgets.push(value),
			},
			sessionManager: { getBranch: () => [] },
		} as any;

		await handlers.get("input")?.[0]({ type: "input", text: "实现并验证一项多文件改造", source: "rpc" }, context);
		await tools.get("update_plan").execute("plan-1", {
			steps: [{ title: "修改实现", status: "running" }, { title: "运行验证", status: "pending" }],
		}, undefined, undefined, context);
		await handlers.get("agent_settled")?.[0]({ type: "agent_settled" }, context);

		expect(statuses.at(-1)).toBeUndefined();
		expect(widgets.at(-1)).toBeUndefined();
	});
});
