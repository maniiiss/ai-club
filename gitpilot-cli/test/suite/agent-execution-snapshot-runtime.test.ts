import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall, registerFauxProvider } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import {
	type CreateAgentSessionRuntimeFactory,
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
} from "../../src/core/agent-session-runtime.ts";
import { AuthStorage } from "../../src/core/auth-storage.ts";
import { SessionManager } from "../../src/core/session-manager.ts";
import type { ExtensionAPI, ExtensionFactory } from "../../src/index.ts";

/**
 * 验证执行快照在 AgentSessionRuntime 层的查询能力，以及 suspended session 切走后
 * 仍持续更新、切回仍是同一 runId/startedAt（设计文档 §14.1 末项）。
 */
describe("AgentSessionRuntime 执行快照与 suspended session", () => {
	const cleanups: Array<() => Promise<void> | void> = [];

	afterEach(async () => {
		while (cleanups.length > 0) {
			await cleanups.pop?.();
		}
	});

	interface Gate {
		promise: Promise<void>;
		resolve: () => void;
	}

	async function createRuntimeWithDelayTool(gate: Gate) {
		const tempDir = join(tmpdir(), `pi-exec-snap-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });

		const faux = registerFauxProvider({ models: [{ id: "faux-1", reasoning: false }] });
		faux.setResponses([fauxAssistantMessage("one")]);

		const authStorage = AuthStorage.inMemory();
		await authStorage.modify(faux.getModel().provider, async () => ({ type: "api_key", key: "faux-key" }));

		// 注册 faux provider 与一个可被 gate 阻塞的 delay 工具，用于让会话保持 running 以便 suspend。
		const extensionFactory: ExtensionFactory = (pi: ExtensionAPI) => {
			pi.registerProvider(faux.getModel().provider, {
				baseUrl: faux.getModel().baseUrl,
				apiKey: "faux-key",
				api: faux.api,
				models: faux.models.map((registeredModel) => ({
					id: registeredModel.id,
					name: registeredModel.name,
					api: registeredModel.api,
					reasoning: registeredModel.reasoning,
					input: registeredModel.input,
					cost: registeredModel.cost,
					contextWindow: registeredModel.contextWindow,
					maxTokens: registeredModel.maxTokens,
				})),
			});
			pi.on("session_start", () => {
				pi.registerTool({
					name: "delay",
					label: "Delay",
					description: "Delay tool",
					parameters: Type.Object({}),
					execute: async () => {
						await gate.promise;
						return { content: [{ type: "text", text: "ok" }] };
					},
				});
			});
		};

		const runtimeOptions = {
			agentDir: tempDir,
			authStorage,
			model: faux.getModel(),
			resourceLoaderOptions: {
				extensionFactories: [extensionFactory],
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
			},
		};

		const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
			const services = await createAgentSessionServices({ ...runtimeOptions, cwd });
			return {
				...(await createAgentSessionFromServices({
					services,
					sessionManager,
					sessionStartEvent,
					model: runtimeOptions.model,
				})),
				services,
				diagnostics: services.diagnostics,
			};
		};

		const runtime = await createAgentSessionRuntime(createRuntime, {
			cwd: tempDir,
			agentDir: tempDir,
			sessionManager: SessionManager.create(tempDir),
		});
		await runtime.session.bindExtensions({});

		cleanups.push(async () => {
			await runtime.dispose();
			faux.unregister();
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		return { runtime, faux, tempDir };
	}

	it("suspended session 切走后仍可查询快照，切回仍是同一 runId 和 startedAt", async () => {
		let resolveGate = () => {};
		const gatePromise = new Promise<void>((resolve) => {
			resolveGate = resolve;
		});
		const { runtime, faux } = await createRuntimeWithDelayTool({ promise: gatePromise, resolve: resolveGate });

		faux.setResponses([
			fauxAssistantMessage([fauxToolCall("delay", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		const promptPromise = runtime.session.prompt("hi");
		// 等待 delay 工具开始执行，确保 A 处于 running。
		await new Promise<void>((resolve) => {
			const unsubscribe = runtime.session.subscribe((event) => {
				if (event.type === "tool_execution_start") {
					unsubscribe();
					resolve();
				}
			});
		});

		const sessionAPath = runtime.session.sessionFile!;
		const runIdA = runtime.session.executionSnapshot.runId;
		const startedAtA = runtime.session.executionSnapshot.startedAt;
		expect(runIdA).toBeTruthy();
		expect(runtime.session.executionSnapshot.status).toBe("running");
		expect(runtime.session.executionSnapshot.activeTools.map((t) => t.toolName)).toContain("delay");

		// 切走 A：A 仍在运行，会被 suspend（保留同一 AgentSession 实例继续后台执行）。
		await runtime.newSession();
		expect(runtime.session.sessionFile).not.toBe(sessionAPath);

		// suspended A 的快照仍可查询，且仍是同一 runId / startedAt / running。
		const suspendedSnapshot = runtime.getSessionExecutionSnapshot(sessionAPath);
		expect(suspendedSnapshot?.status).toBe("running");
		expect(suspendedSnapshot?.runId).toBe(runIdA);
		expect(suspendedSnapshot?.startedAt).toBe(startedAtA);
		expect(suspendedSnapshot?.activeTools.map((t) => t.toolName)).toContain("delay");

		// 让 A 在后台完成。
		resolveGate();
		await promptPromise;

		// A 完成后快照更新为 completed，runId 不变，endedAt 已写。
		const completedSnapshot = runtime.getSessionExecutionSnapshot(sessionAPath);
		expect(completedSnapshot?.status).toBe("completed");
		expect(completedSnapshot?.runId).toBe(runIdA);
		expect(completedSnapshot?.startedAt).toBe(startedAtA);
		expect(completedSnapshot?.endedAt).toBeTypeOf("number");

		// 切回 A：恢复同一 AgentSession 实例，runId 与 startedAt 不变。
		await runtime.switchSession(sessionAPath);
		expect(runtime.session.sessionFile).toBe(sessionAPath);
		const resumedSnapshot = runtime.session.executionSnapshot;
		expect(resumedSnapshot.runId).toBe(runIdA);
		expect(resumedSnapshot.startedAt).toBe(startedAtA);
		expect(resumedSnapshot.status).toBe("completed");
	});

	it("getSessionExecutionSummary 返回当前会话摘要（不含工具参数）", async () => {
		const { runtime, faux } = await createRuntimeWithDelayTool({
			promise: Promise.resolve(),
			resolve: () => {},
		});
		faux.setResponses([fauxAssistantMessage("done")]);
		await runtime.session.prompt("hi");

		const summary = runtime.getSessionExecutionSummary(runtime.session.sessionFile!);
		expect(summary?.status).toBe("completed");
		expect(summary?.runId).toBeTruthy();
		expect(summary?.activeToolCount).toBe(0);
		// 摘要不应携带活动工具参数与输出。
		expect(summary).not.toHaveProperty("activeTools");
	});
});
