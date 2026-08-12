import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import {
	AgentExecutionSnapshotManager,
	EXECUTION_RUN_ENTRY_CUSTOM_TYPE,
	isExecutionRunEntryV1,
	restoreExecutionSnapshotFromEntry,
} from "../../src/core/agent-execution-state.ts";
import type { AgentSessionEvent } from "../../src/core/agent-session.ts";
import { createHarness, type Harness } from "./harness.ts";

// 构造最小化 AgentSessionEvent，仅用于驱动快照管理器的状态机测试。
function evt(event: Partial<AgentSessionEvent> & { type: AgentSessionEvent["type"] }): AgentSessionEvent {
	return event as AgentSessionEvent;
}

describe("AgentExecutionSnapshotManager 状态机", () => {
	it("beginRun 生成 runId、startedAt 并进入 preparing/running", () => {
		const manager = new AgentExecutionSnapshotManager();
		expect(manager.status).toBe("idle");
		manager.beginRun(123);
		const snapshot = manager.getSnapshot();
		expect(snapshot.status).toBe("running");
		expect(snapshot.phase).toBe("preparing");
		expect(snapshot.runId).toBeTruthy();
		expect(snapshot.startedAt).toBeTypeOf("number");
		expect(snapshot.rootUserTimestamp).toBe(123);
		expect(snapshot.sequence).toBeGreaterThan(0);
		expect(snapshot.activeTools).toEqual([]);
	});

	it("thinking/text/tool 阶段转换并按 toolCallId 独立维护并行工具", () => {
		const manager = new AgentExecutionSnapshotManager();
		manager.beginRun();
		const before = manager.sequence;

		manager.applyEvent(evt({ type: "message_update", assistantMessageEvent: { type: "thinking_delta" } }));
		expect(manager.getSnapshot().phase).toBe("thinking");

		manager.applyEvent(evt({ type: "message_update", assistantMessageEvent: { type: "text_delta" } }));
		expect(manager.getSnapshot().phase).toBe("responding");

		// 两个工具先后 start，按 toolCallId 独立保留，支持并行。
		manager.applyEvent(
			evt({ type: "tool_execution_start", toolCallId: "t1", toolName: "read", args: { a: 1 } }),
		);
		manager.applyEvent(
			evt({ type: "tool_execution_start", toolCallId: "t2", toolName: "bash", args: { b: 2 } }),
		);
		const snapshot = manager.getSnapshot();
		expect(snapshot.phase).toBe("tool");
		expect(snapshot.activeTools.map((t) => t.toolCallId)).toEqual(["t1", "t2"]);

		// update 只替换对应工具的 partialResult，不影响另一个。
		manager.applyEvent(
			evt({ type: "tool_execution_update", toolCallId: "t1", toolName: "read", partialResult: "partial" }),
		);
		expect(manager.getSnapshot().activeTools.find((t) => t.toolCallId === "t1")?.partialResult).toBe("partial");
		expect(manager.getSnapshot().activeTools.find((t) => t.toolCallId === "t2")?.partialResult).toBeUndefined();

		// 结束 t1 后仍处于 tool 阶段（t2 仍在运行）。
		manager.applyEvent(evt({ type: "tool_execution_end", toolCallId: "t1", toolName: "read", result: "r", isError: false }));
		expect(manager.getSnapshot().activeTools.map((t) => t.toolCallId)).toEqual(["t2"]);
		expect(manager.getSnapshot().phase).toBe("tool");

		// 结束最后一个工具后进入 settling。
		manager.applyEvent(evt({ type: "tool_execution_end", toolCallId: "t2", toolName: "bash", result: "r2", isError: false }));
		expect(manager.getSnapshot().activeTools).toEqual([]);
		expect(manager.getSnapshot().phase).toBe("settling");

		// 序号单调递增。
		expect(manager.sequence).toBeGreaterThan(before);
	});

	it("retry/compaction/queue 阶段转换保留同一 runId", () => {
		const manager = new AgentExecutionSnapshotManager();
		manager.beginRun();
		const runId = manager.runId;

		manager.applyEvent(evt({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 1, errorMessage: "e" }));
		expect(manager.getSnapshot().phase).toBe("retrying");
		expect(manager.runId).toBe(runId);

		manager.applyEvent(evt({ type: "auto_retry_end", success: true, attempt: 1 }));
		expect(manager.getSnapshot().phase).toBe("preparing");

		manager.applyEvent(evt({ type: "compaction_start", reason: "threshold" }));
		expect(manager.getSnapshot().phase).toBe("compacting");
		expect(manager.runId).toBe(runId);

		manager.applyEvent(evt({ type: "compaction_end", reason: "threshold", result: undefined, aborted: false, willRetry: false }));
		expect(manager.getSnapshot().phase).toBe("preparing");

		manager.applyEvent(evt({ type: "queue_update", steering: ["more"], followUp: [] }));
		expect(manager.getSnapshot().phase).toBe("queued_continuation");
		expect(manager.runId).toBe(runId);

		// 队列清空后回到 preparing。
		manager.applyEvent(evt({ type: "queue_update", steering: [], followUp: [] }));
		expect(manager.getSnapshot().phase).toBe("preparing");
	});

	it("waiting_confirmation 由 setWaitingConfirmation 控制", () => {
		const manager = new AgentExecutionSnapshotManager();
		manager.beginRun();
		manager.setWaitingConfirmation(true);
		expect(manager.getSnapshot().phase).toBe("waiting_confirmation");
		manager.setWaitingConfirmation(false);
		expect(manager.getSnapshot().phase).toBe("preparing");
	});

	it("turn_end / agent_end / message_start 不写 endedAt，run 仍 running", () => {
		const manager = new AgentExecutionSnapshotManager();
		manager.beginRun();
		manager.applyEvent(evt({ type: "agent_end", messages: [], willRetry: false }));
		manager.applyEvent(evt({ type: "turn_end", message: {} as never, toolResults: [] }));
		const snapshot = manager.getSnapshot();
		expect(snapshot.status).toBe("running");
		expect(snapshot.endedAt).toBeUndefined();
	});

	it("单工具失败不提前结束 run（仍 running，settle 时才定终态）", () => {
		const manager = new AgentExecutionSnapshotManager();
		manager.beginRun();
		manager.applyEvent(
			evt({ type: "tool_execution_start", toolCallId: "t1", toolName: "bash", args: {} }),
		);
		manager.applyEvent(
			evt({ type: "tool_execution_end", toolCallId: "t1", toolName: "bash", result: "err", isError: true }),
		);
		const snapshot = manager.getSnapshot();
		expect(snapshot.status).toBe("running");
		expect(snapshot.activeTools).toEqual([]);
	});

	it("settle 写终态与 endedAt，清空活动工具；idle 期间事件不推进序号", () => {
		const manager = new AgentExecutionSnapshotManager();
		manager.beginRun();
		const runningSequence = manager.sequence;
		manager.settle("completed");
		const snapshot = manager.getSnapshot();
		expect(snapshot.status).toBe("completed");
		expect(snapshot.phase).toBe("idle");
		expect(snapshot.endedAt).toBeTypeOf("number");
		expect(snapshot.activeTools).toEqual([]);

		// idle 期间事件不应推进序号或改变状态。
		manager.applyEvent(evt({ type: "compaction_start", reason: "manual" }));
		manager.applyEvent(evt({ type: "message_update", assistantMessageEvent: { type: "text_delta" } }));
		expect(manager.sequence).toBe(runningSequence + 1); // 仅 settle 推进了一次
		expect(manager.getSnapshot().status).toBe("completed");
	});

	it("settle 仅在 running 时生效，重复 settle 不再写终态", () => {
		const manager = new AgentExecutionSnapshotManager();
		manager.settle("completed"); // 无活动 run，忽略
		expect(manager.status).toBe("idle");
		manager.beginRun();
		manager.settle("failed", "boom");
		expect(manager.getSnapshot().status).toBe("failed");
		expect(manager.getSnapshot().lastError).toBe("boom");
		const endedAt = manager.getSnapshot().endedAt;
		manager.settle("completed"); // 已非 running，忽略
		expect(manager.getSnapshot().status).toBe("failed");
		expect(manager.getSnapshot().endedAt).toBe(endedAt);
	});
});

describe("AgentSession 执行快照集成", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("prompt 创建 runId 和 startedAt，settled 后写 endedAt 与 v1 entry", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.setResponses([fauxAssistantMessage("done")]);

		const before = harness.session.executionSnapshot;
		expect(before.status).toBe("idle");
		expect(before.runId).toBeNull();

		await harness.session.prompt("hi");

		const snapshot = harness.session.executionSnapshot;
		expect(snapshot.status).toBe("completed");
		expect(snapshot.runId).toBeTruthy();
		expect(snapshot.startedAt).toBeTypeOf("number");
		expect(snapshot.endedAt).toBeTypeOf("number");
		expect(snapshot.endedAt! >= snapshot.startedAt!).toBe(true);
		expect(snapshot.phase).toBe("idle");
		expect(snapshot.rootUserTimestamp).toBeTypeOf("number");

		// 追加一条 gitpilot.execution-run.v1 custom entry。
		const runEntry = harness.sessionManager
			.getEntries()
			.filter((entry) => entry.type === "custom" && entry.customType === EXECUTION_RUN_ENTRY_CUSTOM_TYPE)
			.pop();
		expect(runEntry?.type).toBe("custom");
		if (runEntry?.type === "custom") {
			expect(isExecutionRunEntryV1(runEntry.data)).toBe(true);
			if (isExecutionRunEntryV1(runEntry.data)) {
				expect(runEntry.data.runId).toBe(snapshot.runId);
				expect(runEntry.data.status).toBe("completed");
				expect(runEntry.data.startedAt).toBe(snapshot.startedAt);
				expect(runEntry.data.endedAt).toBe(snapshot.endedAt);
			}
		}
	});

	it("turn_end / agent_end 不写 endedAt，只有 agent_settled 收口", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		const phases: { type: string; status: string; endedAt?: number }[] = [];
		harness.session.subscribe((event) => {
			if (event.type === "turn_end" || event.type === "agent_end" || event.type === "agent_settled") {
				const snapshot = harness.session.executionSnapshot;
				phases.push({ type: event.type, status: snapshot.status, endedAt: snapshot.endedAt });
			}
		});
		harness.setResponses([fauxAssistantMessage("done")]);

		await harness.session.prompt("hi");

		const turnEnd = phases.find((p) => p.type === "turn_end");
		const agentEnd = phases.find((p) => p.type === "agent_end");
		const settled = phases.find((p) => p.type === "agent_settled");
		expect(turnEnd?.status).toBe("running");
		expect(turnEnd?.endedAt).toBeUndefined();
		expect(agentEnd?.status).toBe("running");
		expect(agentEnd?.endedAt).toBeUndefined();
		expect(settled?.status).toBe("completed");
		expect(settled?.endedAt).toBeTypeOf("number");
	});

	it("并行工具按 toolCallId 独立更新，单工具失败不提前结束 run", async () => {
		const calls: string[] = [];
		const gate = { resolve: () => {} };
		const gatePromise = new Promise<void>((resolve) => {
			gate.resolve = resolve;
		});
		const slowTool: AgentTool = {
			name: "slow",
			label: "Slow",
			description: "Slow tool",
			parameters: Type.Object({}),
			execute: async () => {
				calls.push("start");
				await gatePromise;
				calls.push("end");
				return { content: [{ type: "text", text: "ok" }] };
			},
		};
		const failTool: AgentTool = {
			name: "fail",
			label: "Fail",
			description: "Failing tool",
			parameters: Type.Object({}),
			execute: async () => {
				throw new Error("boom");
			},
		};
		const harness = await createHarness({
			tools: [slowTool, failTool],
			initialActiveToolNames: ["slow", "fail"],
		});
		harnesses.push(harness);

		let activeSnapshotAtStart: { toolCallIds: string[]; status: string } | undefined;
		harness.session.subscribe((event) => {
			if (event.type === "tool_execution_start" && event.toolName === "fail" && !activeSnapshotAtStart) {
				const snapshot = harness.session.executionSnapshot;
				activeSnapshotAtStart = {
					toolCallIds: snapshot.activeTools.map((t) => t.toolCallId),
					status: snapshot.status,
				};
			}
		});

		harness.setResponses([
			fauxAssistantMessage(
				[fauxToolCall("slow", {}), fauxToolCall("fail", {})],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("recovered after failure"),
		]);

		const promptPromise = harness.session.prompt("hi");
		// 让 fail 工具有机会先执行（slow 仍在 gate 上）。
		await new Promise((r) => setTimeout(r, 50));
		gate.resolve();
		await promptPromise;

		expect(calls).toContain("start");
		// 单工具失败后 run 仍最终 completed。
		expect(harness.session.executionSnapshot.status).toBe("completed");
	});

	it("abort 标记 stopped 终态并写 endedAt", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.setResponses([fauxAssistantMessage("x".repeat(20_000))]);

		const sawUpdate = new Promise<void>((resolve) => {
			const unsubscribe = harness.session.subscribe((event) => {
				if (event.type === "message_update") {
					unsubscribe();
					resolve();
				}
			});
		});
		const promptPromise = harness.session.prompt("hi");
		await sawUpdate;
		await harness.session.abort();
		await promptPromise;

		const snapshot = harness.session.executionSnapshot;
		expect(snapshot.status).toBe("stopped");
		expect(snapshot.endedAt).toBeTypeOf("number");
	});

	it("重试耗尽标记 failed 终态并记录 lastError", async () => {
		const harness = await createHarness({
			settings: { retry: { enabled: true, maxRetries: 2, baseDelayMs: 1 } },
		});
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage("", { stopReason: "error", errorMessage: "overloaded_error" }),
			fauxAssistantMessage("", { stopReason: "error", errorMessage: "overloaded_error" }),
			fauxAssistantMessage("", { stopReason: "error", errorMessage: "overloaded_error" }),
		]);

		await harness.session.prompt("hi");

		const snapshot = harness.session.executionSnapshot;
		expect(snapshot.status).toBe("failed");
		expect(snapshot.endedAt).toBeTypeOf("number");
		expect(snapshot.lastError).toBeTruthy();
	});

	it("快照在没有外部监听器时仍持续更新（模拟 suspended session）", async () => {
		const harness = await createHarness();
		harnesses.push(harness);
		harness.setResponses([fauxAssistantMessage("done")]);

		// 不订阅任何监听器直接 prompt：内部 agent.subscribe 仍驱动 _emit -> applyEvent。
		await harness.session.prompt("hi");

		const snapshot = harness.session.executionSnapshot;
		expect(snapshot.status).toBe("completed");
		expect(snapshot.runId).toBeTruthy();
		expect(snapshot.endedAt).toBeTypeOf("number");
	});

	it("每次新 prompt 生成新的 runId，序列号单调递增", async () => {
		const harness = await createHarness();
		harnesses.push(harness);

		harness.setResponses([fauxAssistantMessage("one")]);
		await harness.session.prompt("first");
		const firstSnapshot = harness.session.executionSnapshot;
		const firstRunId = firstSnapshot.runId;
		const firstSequence = firstSnapshot.sequence;

		harness.setResponses([fauxAssistantMessage("two")]);
		await harness.session.prompt("second");
		const secondSnapshot = harness.session.executionSnapshot;

		expect(secondSnapshot.runId).toBeTruthy();
		expect(secondSnapshot.runId).not.toBe(firstRunId);
		expect(secondSnapshot.sequence).toBeGreaterThan(firstSequence);
	});
});

describe("恢复快照与 v1 entry 辅助函数", () => {
	it("isExecutionRunEntryV1 校验字段完整性", () => {
		expect(isExecutionRunEntryV1(null)).toBe(false);
		expect(isExecutionRunEntryV1({ version: 1 })).toBe(false);
		expect(
			isExecutionRunEntryV1({
				version: 1,
				runId: "r",
				status: "completed",
				startedAt: 1,
				endedAt: 2,
				lastSequence: 5,
			}),
		).toBe(true);
	});

	it("restoreExecutionSnapshotFromEntry 还原终态快照", () => {
		const restored = restoreExecutionSnapshotFromEntry(99, {
			version: 1,
			runId: "r",
			status: "failed",
			startedAt: 10,
			endedAt: 20,
			rootUserTimestamp: 5,
			lastSequence: 7,
		});
		expect(restored).toEqual({
			runId: "r",
			status: "failed",
			phase: "idle",
			startedAt: 10,
			endedAt: 20,
			updatedAt: 99,
			sequence: 7,
			rootUserTimestamp: 5,
			activeTools: [],
			lastError: undefined,
		});
	});

	it("restoreExecutionSnapshotFromEntry 对非法数据返回 undefined", () => {
		expect(restoreExecutionSnapshotFromEntry(99, { version: 2 })).toBeUndefined();
	});
});
