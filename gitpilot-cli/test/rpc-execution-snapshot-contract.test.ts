import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type CreateAgentSessionRuntimeFactory,
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
} from "../src/core/agent-session-runtime.ts";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { runRpcMode } from "../src/modes/rpc/rpc-mode.ts";
import type { ExtensionAPI, ExtensionFactory } from "../src/index.ts";

// 捕获 RPC stdout 行，并暴露向 sidecar 注入命令的 lineHandler。
const rpcIo = vi.hoisted(() => ({
	outputLines: [] as string[],
	lineHandler: undefined as ((line: string) => void) | undefined,
}));

vi.mock("../src/core/output-guard.js", () => ({
	flushRawStdout: vi.fn(async () => {}),
	takeOverStdout: vi.fn(),
	waitForRawStdoutBackpressure: vi.fn(async () => {}),
	writeRawStdout: (line: string) => {
		rpcIo.outputLines.push(line);
	},
}));

vi.mock("../src/modes/interactive/theme/theme.js", () => ({ theme: {} }));

vi.mock("../src/modes/rpc/jsonl.js", () => ({
	attachJsonlLineReader: vi.fn((_stream: NodeJS.ReadableStream, onLine: (line: string) => void) => {
		rpcIo.lineHandler = onLine;
		return () => {};
	}),
	serializeJsonLine: (value: unknown) => `${JSON.stringify(value)}\n`,
}));

interface ParsedLine extends Record<string, unknown> {
	type?: string;
	command?: string;
	success?: boolean;
	id?: string;
}

function parsedLines(): ParsedLine[] {
	return rpcIo.outputLines
		.flatMap((line) => line.split("\n"))
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as ParsedLine);
}

function send(command: object): void {
	rpcIo.lineHandler!(JSON.stringify(command));
}

function findResponse(id: string): ParsedLine | undefined {
	return parsedLines().find((line) => line.id === id && line.type === "response");
}

async function waitForResponse(id: string, timeout = 5000): Promise<ParsedLine> {
	return vi.waitFor(
		() => {
			const response = findResponse(id);
			if (!response) throw new Error("response not yet emitted");
			return response;
		},
		{ timeout, interval: 10 },
	);
}

async function waitForEvent(predicate: (line: ParsedLine) => boolean, timeout = 5000): Promise<ParsedLine> {
	return vi.waitFor(
		() => {
			const event = parsedLines().find((line) => line.type !== "response" && predicate(line));
			if (!event) throw new Error("event not yet emitted");
			return event;
		},
		{ timeout, interval: 10 },
	);
}

/**
 * RPC 执行快照契约测试（设计文档 §14.2）。
 * 使用真实 AgentSessionRuntime + faux provider，通过 mock 的 output-guard 在进程内驱动 runRpcMode。
 */
describe("RPC 执行快照契约", () => {
	const cleanups: Array<() => Promise<void> | void> = [];
	let faux: ReturnType<typeof registerFauxProvider>;

	afterEach(async () => {
		while (cleanups.length > 0) {
			await cleanups.pop?.();
		}
		rpcIo.outputLines = [];
	});

	async function startRpc() {
		const tempDir = join(tmpdir(), `pi-rpc-exec-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });

		faux = registerFauxProvider({ models: [{ id: "faux-1", reasoning: false }] });
		faux.setResponses([fauxAssistantMessage("done")]);
		const authStorage = AuthStorage.inMemory();
		await authStorage.modify(faux.getModel().provider, async () => ({ type: "api_key", key: "faux-key" }));

		const extensionFactory: ExtensionFactory = (pi: ExtensionAPI) => {
			pi.registerProvider(faux.getModel().provider, {
				baseUrl: faux.getModel().baseUrl,
				apiKey: "faux-key",
				api: faux.api,
				models: faux.models.map((m) => ({
					id: m.id,
					name: m.name,
					api: m.api,
					reasoning: m.reasoning,
					input: m.input,
					cost: m.cost,
					contextWindow: m.contextWindow,
					maxTokens: m.maxTokens,
				})),
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
		faux.setResponses([fauxAssistantMessage("done")]);

		void runRpcMode(runtime);

		cleanups.push(async () => {
			try {
				await runtime.dispose();
			} catch {
				// ignore
			}
			faux.unregister();
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		// 等待 ready 帧。
		await waitForEvent((line) => line.type === "ready", 5000);
		return { runtime, tempDir };
	}

	it("get_state 返回能力列表与当前执行快照", async () => {
		await startRpc();
		send({ id: "s1", type: "get_state" });
		const response = await waitForResponse("s1");
		expect(response.success).toBe(true);
		const data = response.data as Record<string, unknown>;
		expect(data.rpcCapabilities).toEqual(
			expect.arrayContaining([
				"session_execution_snapshot_v1",
				"session_event_metadata_v1",
				"switch_session_snapshot_v1",
			]),
		);
		const execution = data.execution as Record<string, unknown>;
		expect(execution).toBeDefined();
		expect(execution.status).toBe("idle");
	});

	it("get_session_snapshot 的 session/messages/execution 来自同一会话", async () => {
		const { runtime } = await startRpc();
		send({ id: "snap1", type: "get_session_snapshot" });
		const response = await waitForResponse("snap1");
		expect(response.success).toBe(true);
		const data = response.data as Record<string, unknown>;
		const session = data.session as Record<string, unknown>;
		const execution = data.execution as Record<string, unknown>;
		expect(session.sessionId).toBe(runtime.session.sessionId);
		expect(execution.runId).toBeNull();
		expect(Array.isArray(data.messages)).toBe(true);
		expect(data.eventCursor).toBe(execution.sequence);
	});

	it("实时事件包含 session/run/sequence 元数据，且保留原有 type", async () => {
		await startRpc();
		rpcIo.outputLines = [];
		send({ id: "p1", type: "prompt", message: "hi" });
		await waitForResponse("p1");
		const settled = await waitForEvent((line) => line.type === "agent_settled");

		// 元数据字段存在。
		expect(settled.sessionId).toBeTypeOf("string");
		expect(settled.sequence).toBeTypeOf("number");
		expect(settled.emittedAt).toBeTypeOf("number");
		expect(settled.type).toBe("agent_settled");

		// 运行期间事件应携带 runId；settled 时 runId 仍为本次 run。
		const agentStart = parsedLines().find((line) => line.type === "agent_start");
		expect(agentStart?.runId).toBeTypeOf("string");
		expect(settled.runId).toBe(agentStart?.runId);

		// 序号单调递增。
		const eventSequences = parsedLines()
			.filter((line) => line.type !== "response" && typeof line.sequence === "number")
			.map((line) => line.sequence as number);
		for (let i = 1; i < eventSequences.length; i += 1) {
			expect(eventSequences[i]).toBeGreaterThanOrEqual(eventSequences[i - 1]);
		}
	});

	it("list_sessions 返回当前会话的执行摘要", async () => {
		const { runtime } = await startRpc();
		// 先完成一次 run，使会话有 settled 摘要。
		send({ id: "p2", type: "prompt", message: "hi" });
		await waitForResponse("p2");
		await waitForEvent((line) => line.type === "agent_settled");

		send({ id: "ls1", type: "list_sessions" });
		const response = await waitForResponse("ls1");
		expect(response.success).toBe(true);
		const data = response.data as { sessions: Array<Record<string, unknown>> };
		const current = data.sessions.find((s) => s.path === runtime.session.sessionFile);
		expect(current).toBeDefined();
		expect(current?.isStreaming).toBe(false);
		const execution = current?.execution as Record<string, unknown> | undefined;
		expect(execution).toBeDefined();
		expect(execution?.status).toBe("completed");
		expect(execution?.runId).toBeTypeOf("string");
	});

	it("switch_session 返回目标会话原子快照", async () => {
		const { runtime } = await startRpc();
		// 切到当前会话本身：runtime 返回 cancelled:false，应附带快照。
		send({ id: "sw1", type: "switch_session", sessionPath: runtime.session.sessionFile! });
		const response = await waitForResponse("sw1");
		expect(response.success).toBe(true);
		const data = response.data as { cancelled: boolean; snapshot?: Record<string, unknown> };
		expect(data.cancelled).toBe(false);
		expect(data.snapshot).toBeDefined();
		const snapshot = data.snapshot!;
		expect(snapshot.eventCursor).toBeTypeOf("number");
		expect((snapshot.execution as Record<string, unknown>).runId).toBeNull();
		expect((snapshot.session as Record<string, unknown>).sessionId).toBe(runtime.session.sessionId);
	});

	it("prompt 完成后 get_state 的 execution 反映 completed 与 endedAt", async () => {
		await startRpc();
		send({ id: "p3", type: "prompt", message: "hi" });
		await waitForResponse("p3");
		await waitForEvent((line) => line.type === "agent_settled");

		send({ id: "s2", type: "get_state" });
		const response = await waitForResponse("s2");
		const execution = (response.data as Record<string, unknown>).execution as Record<string, unknown>;
		expect(execution.status).toBe("completed");
		expect(execution.runId).toBeTypeOf("string");
		expect(execution.endedAt).toBeTypeOf("number");
	});
});
