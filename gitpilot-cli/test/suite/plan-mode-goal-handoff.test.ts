import { Type } from "typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, type Harness } from "./harness.ts";

// 本地 Plan mode fork 仅在运行时需要 pi-tui-kit 的菜单实现；本用例只覆盖输入接管，
// 以轻量 mock 避免 peer dependency 影响会话/工具策略回归测试。
vi.mock("@narumitw/pi-tui-kit", () => ({
	defineMenu: <T>(menu: T) => menu,
	runMenu: vi.fn(),
}));

const { default: planModeExtension } = await import("../../src/extensions/plan-mode/index.ts");

describe("Plan mode to Goal mode handoff", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) harnesses.pop()?.cleanup();
	});

	it("restores execution and Goal terminal tools before /goal starts", async () => {
		let toolsVisibleToGoal: string[] = [];
		const harness = await createHarness({
			extensionFactories: [
				(pi) => {
					pi.registerTool({
						name: "goal_complete",
						label: "Goal complete",
						description: "Complete the active goal",
						parameters: Type.Object({}),
						execute: async () => ({ content: [], details: {} }),
					});
					pi.registerTool({
						name: "goal_blocked",
						label: "Goal blocked",
						description: "Block the active goal",
						parameters: Type.Object({}),
						execute: async () => ({ content: [], details: {} }),
					});
					pi.registerCommand("goal", {
						description: "Start a goal",
						handler: () => {
							toolsVisibleToGoal = pi.getActiveTools();
						},
					});
				},
				planModeExtension,
			],
		});
		harnesses.push(harness);

		await harness.session.prompt("/plan");
		expect(harness.session.getActiveToolNames()).not.toContain("edit");
		expect(harness.session.getActiveToolNames()).not.toContain("goal_complete");

		await harness.session.prompt("/goal implement the requested change");

		expect(toolsVisibleToGoal).toEqual(
			expect.arrayContaining(["read", "bash", "edit", "write", "goal_complete", "goal_blocked"]),
		);
	});
});
