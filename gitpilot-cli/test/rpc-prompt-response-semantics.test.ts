import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@earendil-works/pi-agent-core";
import {
	type AssistantMessage,
	type AssistantMessageEvent,
	EventStream,
	getModel,
	type Model,
} from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSession } from "../src/core/agent-session.ts";
import type { AgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { runRpcMode } from "../src/modes/rpc/rpc-mode.ts";
import { createModelRegistry, getModelRuntime } from "./model-runtime-test-utils.ts";
import { createTestExtensionsResult, createTestResourceLoader } from "./utilities.ts";

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

class MockAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected event type");
			},
		);
	}
}

function createAssistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

type ParsedOutputLine = Record<string, unknown>;

function parseOutputLines(outputLines: string[]): ParsedOutputLine[] {
	return outputLines
		.flatMap((line) => line.split("\n"))
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as ParsedOutputLine);
}

function getPromptResponses(outputLines: string[], id: string): ParsedOutputLine[] {
	return parseOutputLines(outputLines).filter(
		(record) => record.id === id && record.type === "response" && record.command === "prompt",
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createRuntimeHost(options: {
	withAuth: boolean;
	responseDelayMs: number;
	model?: Model<any>;
	extensionCommandHandler?: () => Promise<void>;
}): Promise<{
	runtimeHost: AgentSessionRuntime;
	projectPath: string;
	cleanup: () => Promise<void>;
}> {
	const tempDir = join(tmpdir(), `pi-rpc-prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });

	const model = options.model ?? getModel("anthropic", "claude-sonnet-4-5");
	if (!model) {
		throw new Error("Test model not found");
	}

	const agent = new Agent({
		getApiKey: () => "test-key",
		initialState: {
			model,
			systemPrompt: "Test",
			tools: [],
		},
		streamFn: (_model, _context, _options) => {
			const stream = new MockAssistantStream();
			queueMicrotask(() => {
				stream.push({ type: "start", partial: createAssistantMessage("") });
				setTimeout(() => {
					stream.push({ type: "done", reason: "stop", message: createAssistantMessage("done") });
				}, options.responseDelayMs);
			});
			return stream;
		},
	});

	const sessionManager = SessionManager.inMemory();
	const settingsManager = SettingsManager.create(tempDir, tempDir);
	const authStorage = AuthStorage.create(join(tempDir, "auth.json"));
	const modelRegistry = await createModelRegistry(authStorage, tempDir);
	if (options.withAuth) {
		await authStorage.modify("anthropic", async () => ({ type: "api_key", key: "test-key" }));
	}

	const extensionsResult = options.extensionCommandHandler
		? await createTestExtensionsResult([
			(pi) => {
				pi.registerCommand("slow-goal", { handler: options.extensionCommandHandler! });
			},
		], tempDir)
		: undefined;

	const session = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd: tempDir,
		modelRuntime: getModelRuntime(modelRegistry),
		resourceLoader: createTestResourceLoader({ extensionsResult }),
	});

	const runtimeHost = {
		session,
		newSession: vi.fn(async () => ({ cancelled: true })),
		switchSession: vi.fn(async () => ({ cancelled: true })),
		fork: vi.fn(async () => ({ cancelled: true, selectedText: "" })),
		dispose: vi.fn(async () => {}),
		setRebindSession: vi.fn(),
	} as unknown as AgentSessionRuntime;

	return {
		runtimeHost,
		projectPath: tempDir,
		cleanup: async () => {
			try {
				if (session.isStreaming) {
					await session.abort();
				}
			} catch {
				// ignore test cleanup failures
			}
			session.dispose();
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true });
			}
		},
	};
}

async function startRpcMode(options: {
	withAuth: boolean;
	responseDelayMs: number;
	model?: Model<any>;
	extensionCommandHandler?: () => Promise<void>;
}): Promise<{
	lineHandler: (line: string) => void;
	projectPath: string;
	cleanup: () => Promise<void>;
}> {
	rpcIo.outputLines = [];
	rpcIo.lineHandler = undefined;

	const { runtimeHost, projectPath, cleanup } = await createRuntimeHost(options);
	void runRpcMode(runtimeHost);
	await vi.waitFor(() => expect(rpcIo.lineHandler).toBeDefined());

	return { lineHandler: rpcIo.lineHandler!, projectPath, cleanup };
}

describe("RPC prompt response semantics", () => {
	afterEach(() => {
		rpcIo.outputLines = [];
		rpcIo.lineHandler = undefined;
	});

	it("emits one failure response when prompt preflight rejects", async () => {
		const { lineHandler, cleanup } = await startRpcMode({
			withAuth: false,
			responseDelayMs: 0,
			model: {
				id: "fake-model",
				name: "Fake Model",
				api: "openai-completions",
				provider: "fake-provider",
				baseUrl: "https://example.invalid",
				reasoning: false,
				input: [],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 0,
				maxTokens: 0,
			},
		});

		try {
			lineHandler(JSON.stringify({ id: "b1", type: "prompt", message: "Hello" }));

			await vi.waitFor(() => {
				const responses = getPromptResponses(rpcIo.outputLines, "b1");
				expect(responses).toHaveLength(1);
				expect(responses[0]).toMatchObject({
					id: "b1",
					type: "response",
					command: "prompt",
					success: false,
						error: expect.stringContaining(
							"未找到 fake-provider 的 API 密钥。\n\n使用 /login 通过 OAuth 或 API 密钥登录提供商。参见：",
						),
				});
			});
		} finally {
			await cleanup();
		}
	});

	it("emits one success response when prompt preflight succeeds", async () => {
		const { lineHandler, cleanup } = await startRpcMode({ withAuth: true, responseDelayMs: 0 });

		try {
			lineHandler(JSON.stringify({ id: "b2", type: "prompt", message: "Hello" }));

			await vi.waitFor(() => {
				const responses = getPromptResponses(rpcIo.outputLines, "b2");
				expect(responses).toHaveLength(1);
				expect(responses[0]).toMatchObject({
					id: "b2",
					type: "response",
					command: "prompt",
					success: true,
				});
			});
		} finally {
			await cleanup();
		}
	});

	it("emits one success response when prompt is queued during streaming", async () => {
		const { lineHandler, cleanup } = await startRpcMode({ withAuth: true, responseDelayMs: 100 });

		try {
			lineHandler(JSON.stringify({ id: "b3-start", type: "prompt", message: "Start" }));
			await vi.waitFor(() => {
				expect(getPromptResponses(rpcIo.outputLines, "b3-start")).toHaveLength(1);
			});

			rpcIo.outputLines = [];
			lineHandler(
				JSON.stringify({
					id: "b3",
					type: "prompt",
					message: "Queue this",
					streamingBehavior: "followUp",
				}),
			);

			await vi.waitFor(() => {
				const responses = getPromptResponses(rpcIo.outputLines, "b3");
				expect(responses).toHaveLength(1);
				expect(responses[0]).toMatchObject({
					id: "b3",
					type: "response",
					command: "prompt",
					success: true,
				});
			});

			await sleep(150);
		} finally {
			await cleanup();
		}
	});

	it("acknowledges a long-running extension command before its Agent work settles", async () => {
		let commandStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			commandStarted = resolve;
		});
		let releaseCommand!: () => void;
		const commandFinished = new Promise<void>((resolve) => {
			releaseCommand = resolve;
		});
		const { lineHandler, cleanup } = await startRpcMode({
			withAuth: true,
			responseDelayMs: 0,
			extensionCommandHandler: async () => {
				commandStarted();
				await commandFinished;
			},
		});

		try {
			lineHandler(JSON.stringify({ id: "goal-ack", type: "prompt", message: "/slow-goal" }));
			await started;

			expect(getPromptResponses(rpcIo.outputLines, "goal-ack")).toEqual([
				expect.objectContaining({ id: "goal-ack", type: "response", command: "prompt", success: true }),
			]);
		} finally {
			releaseCommand();
			await cleanup();
		}
	});

	it("persists Design UI messages in the fixed conversation and applies status updates by message ID", async () => {
		const { lineHandler, projectPath, cleanup } = await startRpcMode({ withAuth: true, responseDelayMs: 0 });

		try {
			lineHandler(JSON.stringify({ id: "design-create", type: "design_create", projectPath, name: "企查查页面" }));
			const createResponse = await vi.waitFor(() => {
				const response = parseOutputLines(rpcIo.outputLines).find((record) => record.id === "design-create" && record.command === "design_create");
				expect(response).toMatchObject({ success: true });
				return response!;
			});
			const designId = String((createResponse.data as { designId: string }).designId);

			lineHandler(JSON.stringify({ id: "design-sync-queued", type: "design_sync_messages", projectPath, designId, messages: [{ id: "qcc-1", kind: "user", text: "设计企查查页面", status: "queued" }] }));
			await vi.waitFor(() => expect(parseOutputLines(rpcIo.outputLines).find((record) => record.id === "design-sync-queued")).toMatchObject({ success: true }));

			lineHandler(JSON.stringify({ id: "design-sync-sent", type: "design_sync_messages", projectPath, designId, messages: [{ id: "qcc-1", kind: "user", text: "设计企查查页面", status: "sent" }] }));
			const syncResponse = await vi.waitFor(() => {
				const response = parseOutputLines(rpcIo.outputLines).find((record) => record.id === "design-sync-sent");
				expect(response).toMatchObject({ success: true });
				return response!;
			});

			expect((syncResponse.data as { messages: unknown[] }).messages).toEqual([{ id: "qcc-1", kind: "user", text: "设计企查查页面", status: "sent" }]);
			expect(existsSync(join(projectPath, ".gitpilot", "sessions", designId, "conversation.jsonl"))).toBe(true);
		} finally {
			await cleanup();
		}
	});

	it("Design patch 从当前页面创建新页面并同步 canonical 页面索引", async () => {
		const { lineHandler, projectPath, cleanup } = await startRpcMode({ withAuth: true, responseDelayMs: 0 });

		try {
			lineHandler(JSON.stringify({ id: "design-create-page-workspace", type: "design_create", projectPath, name: "多页面工作区" }));
			const createResponse = await vi.waitFor(() => {
				const response = parseOutputLines(rpcIo.outputLines).find((record) => record.id === "design-create-page-workspace" && record.command === "design_create");
				expect(response).toMatchObject({ success: true });
				return response!;
			});
			const designId = String((createResponse.data as { designId: string }).designId);
			const initialSnapshot = (createResponse.data as { snapshot: { document: { revisions: Array<{ id: string }> } } }).snapshot;
			const baseRevisionId = initialSnapshot.document.revisions.at(-1)?.id ?? "";
			lineHandler(JSON.stringify({
				id: "design-create-page-patch",
				type: "design_apply_patch",
				projectPath,
				designId,
				pageId: "home",
				baseRevisionId,
				patch: {
					baseRevisionId,
					operationId: "create-about-page",
					affectedPaths: ["pages/about/index.html", "pages/about/styles.css", "pages/about/main.js"],
					operations: [
						{ op: "create_file", path: "pages/about/index.html", language: "html", content: "<!doctype html><main>About</main>" },
						{ op: "create_file", path: "pages/about/styles.css", language: "css", content: ".about{}" },
						{ op: "create_file", path: "pages/about/main.js", language: "javascript", content: "console.log('about')" },
					],
					summary: "创建 About 页面",
				},
			}));

			const patchResponse = await vi.waitFor(() => {
				const response = parseOutputLines(rpcIo.outputLines).find((record) => record.id === "design-create-page-patch" && record.command === "design_apply_patch");
				expect(response).toMatchObject({ success: true });
				return response!;
			});
			const snapshot = (patchResponse.data as { snapshot: { document: { pages: Array<{ id: string; fileIds: string[] }> } } }).snapshot;
			expect(snapshot.document.pages.find((page) => page.id === "about")).toMatchObject({ id: "about" });
			expect(existsSync(join(projectPath, "pages", "about", "index.html"))).toBe(true);
		} finally {
			await cleanup();
		}
	});

	it("从旧版 .gitpilot/design 会话迁移到固定 Design conversation.jsonl", async () => {
		const { lineHandler, projectPath, cleanup } = await startRpcMode({ withAuth: true, responseDelayMs: 0 });
		const designId = "design-legacy";
		const legacyRoot = join(projectPath, ".gitpilot", "design", designId);
		const legacySessionRoot = join(legacyRoot, ".session");
		const filePath = "pages/home/index.html";
		const document = {
			id: designId,
			name: "旧版页面",
			version: 1,
			entryPageId: "home",
			pages: [{ id: "home", name: "Home", route: "/", entryFileId: "legacy-html", fileIds: ["legacy-html"] }],
			files: [{ id: "legacy-html", path: filePath, language: "html", scope: "page" }],
			revisions: [{ id: "rev-legacy", prompt: "旧版页面", summary: "旧版页面", createdAt: "2026-08-01T00:00:00.000Z", kind: "initial" }],
		};
		try {
			mkdirSync(legacySessionRoot, { recursive: true });
			writeFileSync(join(projectPath, ".gitpilot", "design", "manifest.json"), JSON.stringify({ designId }));
			writeFileSync(join(legacyRoot, "design.json"), JSON.stringify(document));
			mkdirSync(join(legacyRoot, "pages", "home"), { recursive: true });
			writeFileSync(join(legacyRoot, filePath), "<main>旧版</main>");
			writeFileSync(join(legacySessionRoot, "2026-08-01T00-00-00Z.jsonl"), `${JSON.stringify({ type: "session", version: 3, id: "legacy-session", timestamp: "2026-08-01T00:00:00.000Z", cwd: projectPath })}\n${JSON.stringify({ type: "custom", customType: "gitpilot.design-ui-message.v1", id: "legacy-ui-entry", parentId: null, timestamp: "2026-08-01T00:00:01.000Z", data: { id: "legacy-message", kind: "assistant", text: "旧版消息" } })}\n`);

			lineHandler(JSON.stringify({ id: "design-open-legacy", type: "design_open", projectPath }));
			const response = await vi.waitFor(() => {
				const record = parseOutputLines(rpcIo.outputLines).find((item) => item.id === "design-open-legacy");
				expect(record).toMatchObject({ success: true, command: "design_open" });
				return record!;
			});
			expect((response.data as { designId: string }).designId).toBe(designId);
			expect((response.data as { messages: Array<{ text: string }> }).messages).toEqual([{ id: "legacy-message", kind: "assistant", text: "旧版消息" }]);
			expect(existsSync(join(projectPath, ".gitpilot", "sessions", designId, "conversation.jsonl"))).toBe(true);
			expect((response.data as { snapshot: { files: Array<{ content?: string }> } }).snapshot.files[0]?.content).toBe("<main>旧版</main>");
		} finally {
			await cleanup();
		}
	});
});
