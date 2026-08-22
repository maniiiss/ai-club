import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@earendil-works/pi-agent-core";
import { EventStream, getModel, type AssistantMessage, type AssistantMessageEvent, type Model } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSession } from "../src/core/agent-session.ts";
import type { AgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { runRpcMode } from "../src/modes/rpc/rpc-mode.ts";
import { createModelRegistry, getModelRuntime } from "./model-runtime-test-utils.ts";
import { createTestResourceLoader } from "./utilities.ts";

const rpcIo = vi.hoisted(() => ({ outputLines: [] as string[], lineHandler: undefined as ((line: string) => void) | undefined }));

vi.mock("../src/core/output-guard.js", () => ({
	flushRawStdout: vi.fn(async () => {}),
	takeOverStdout: vi.fn(),
	waitForRawStdoutBackpressure: vi.fn(async () => {}),
	writeRawStdout: (line: string) => { rpcIo.outputLines.push(line); },
}));
vi.mock("../src/modes/interactive/theme/theme.js", () => ({ theme: {} }));
vi.mock("../src/modes/rpc/jsonl.js", () => ({
	attachJsonlLineReader: vi.fn((_stream: NodeJS.ReadableStream, onLine: (line: string) => void) => { rpcIo.lineHandler = onLine; return () => {}; }),
	serializeJsonLine: (value: unknown) => `${JSON.stringify(value)}\n`,
}));

class DelayedAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super((event) => event.type === "done" || event.type === "error", (event) => {
			if (event.type === "done") return event.message;
			if (event.type === "error") return event.error;
			throw new Error("Unexpected assistant event");
		});
	}
}

function assistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant", content: [{ type: "text", text }], api: "anthropic-messages", provider: "anthropic", model: "claude-sonnet-4-5",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now(),
	};
}

type OutputRecord = Record<string, any>;
function outputs(): OutputRecord[] { return rpcIo.outputLines.flatMap((line) => line.split("\n").filter(Boolean).map((value) => JSON.parse(value) as OutputRecord)); }
function waitForRecord(predicate: (record: OutputRecord) => boolean): Promise<OutputRecord> {
	return vi.waitFor(() => {
		const record = outputs().find(predicate);
		expect(record).toBeDefined();
		return record!;
	});
}
async function startRpcMode(responseDelayMs = 2_000): Promise<{ lineHandler: (line: string) => void; projectPath: string; cleanup: () => Promise<void> }> {
	rpcIo.outputLines = [];
	rpcIo.lineHandler = undefined;
	const projectPath = join(tmpdir(), `gitpilot-design-journal-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(projectPath, { recursive: true });
	const model = getModel("anthropic", "claude-sonnet-4-5") as Model<any>;
	if (!model) throw new Error("Test model not found");
	const agent = new Agent({
		getApiKey: () => "test-key",
		initialState: { model, systemPrompt: "Test", tools: [] },
		streamFn: () => {
			const stream = new DelayedAssistantStream();
			queueMicrotask(() => {
				stream.push({ type: "start", partial: assistantMessage("") });
				setTimeout(() => stream.push({ type: "done", reason: "stop", message: assistantMessage("测试运行结束") }), responseDelayMs);
			});
			return stream;
		},
	});
	const sessionManager = SessionManager.inMemory();
	const settingsManager = SettingsManager.create(projectPath, projectPath);
	const authStorage = AuthStorage.create(join(projectPath, "auth.json"));
	await authStorage.modify("anthropic", async () => ({ type: "api_key", key: "test-key" }));
	const modelRegistry = await createModelRegistry(authStorage, projectPath);
	const modelRuntime = getModelRuntime(modelRegistry);
	const session = new AgentSession({ agent, sessionManager, settingsManager, cwd: projectPath, modelRuntime, resourceLoader: createTestResourceLoader() });
	const runtimeHost = {
		session,
		services: { modelRuntime },
		newSession: vi.fn(async () => ({ cancelled: true })), switchSession: vi.fn(async () => ({ cancelled: true })), fork: vi.fn(async () => ({ cancelled: true, selectedText: "" })),
		dispose: vi.fn(async () => {}), setRebindSession: vi.fn(),
	} as unknown as AgentSessionRuntime;
	void runRpcMode(runtimeHost);
	await vi.waitFor(() => expect(rpcIo.lineHandler).toBeDefined());
	return {
		lineHandler: rpcIo.lineHandler!, projectPath,
		cleanup: async () => {
			try { if (session.isStreaming) await session.abort(); } catch { /* 测试收口不影响断言 */ }
			session.dispose();
			if (existsSync(projectPath)) rmSync(projectPath, { recursive: true, force: true });
		},
	};
}

function createNode(nodeId: string) {
	return {
		id: nodeId, type: "rect", name: "测试矩形", parentId: null, childIds: [], visible: true, locked: false, opacity: 1,
		transform: { x: 80, y: 80, width: 160, height: 80, rotation: 0, scaleX: 1, scaleY: 1 },
		layout: { mode: "absolute", width: 160, height: 80, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: "column", align: "start", justify: "start" },
		paint: { fill: { kind: "solid", color: "#ffffff" } },
	};
}

describe("Design live render draft journal", () => {
	afterEach(() => { rpcIo.outputLines = []; rpcIo.lineHandler = undefined; });

	it("Agent 异常会以 interrupted settled 收口，并在无 patch 时不新增 revision", async () => {
		const { lineHandler, projectPath, cleanup } = await startRpcMode(20);
		try {
			lineHandler(JSON.stringify({ id: "create-error-run", type: "design_create", projectPath, name: "异常收口 Design" }));
			const created = await waitForRecord((record) => record.id === "create-error-run" && record.command === "design_create");
			const designId = String(created.data.designId);
			const baseRevisionCount = created.data.snapshot.document.revisions.length;
			const baseRevisionId = String(created.data.snapshot.document.revisions.at(-1).id);

			lineHandler(JSON.stringify({ id: "error-run", type: "design_prompt", projectPath, designId, pageId: "canvas", baseRevisionId, prompt: "触发异常收口" }));
			await waitForRecord((record) => record.id === "error-run" && record.command === "design_prompt");
			await waitForRecord((record) => record.type === "design_error" && record.designId === designId);
			const settled = await waitForRecord((record) => record.type === "design_run_settled" && record.designId === designId);

			expect(settled.reason).toBe("interrupted");
			expect(settled.snapshot.document.revisions).toHaveLength(baseRevisionCount);
			expect(settled.snapshot.document.revisions.at(-1).id).toBe(baseRevisionId);
		} finally { await cleanup(); }
	});

	it("design_open 返回 orphaned draft，keep 生成 interrupted revision，discard 回到 canonical scene", async () => {
		const { lineHandler, projectPath, cleanup } = await startRpcMode(50);
		try {
			lineHandler(JSON.stringify({ id: "create", type: "design_create", projectPath, name: "Recovery Design" }));
			const created = await waitForRecord((record) => record.id === "create" && record.command === "design_create");
			const designId = String(created.data.designId);
			const baseSnapshot = created.data.snapshot;
			const baseRevisionId = String(baseSnapshot.document.revisions.at(-1).id);
			const baseCanvas = baseSnapshot.document.canvas;
			const writeOrphan = (runId: string, nodeId: string) => {
				const root = join(projectPath, ".gitpilot", "design", designId, "drafts", runId);
				mkdirSync(root, { recursive: true });
				writeFileSync(join(root, "base.json"), JSON.stringify({ designId, runId, requestId: `request-${runId}`, baseRevisionId, draftRevisionId: `draft-${runId}`, canvas: baseCanvas }));
				writeFileSync(join(root, "operations.jsonl"), `${JSON.stringify({ operationId: `op-${runId}`, sequence: 1, operationIndex: 1, pageId: "canvas", summary: "恢复矩形", transaction: { transactionId: `op-${runId}`, baseRevision: baseCanvas.revision, source: "ai", operations: [{ op: "create_node", node: createNode(nodeId), parentId: "canvas-root" }], summary: "恢复矩形", createdAt: new Date().toISOString() } })}\n`);
			};

			writeOrphan("design-run-recover-keep", "keep-node");
			lineHandler(JSON.stringify({ id: "open-keep", type: "design_open", projectPath }));
			const opened = await waitForRecord((record) => record.id === "open-keep" && record.command === "design_open");
			expect(opened.data.draft).toMatchObject({ status: "orphaned", runId: "design-run-recover-keep", operationCount: 1, lastSequence: 1 });
			lineHandler(JSON.stringify({ id: "keep", type: "design_recover_draft", projectPath, designId, runId: "design-run-recover-keep", action: "keep" }));
			const kept = await waitForRecord((record) => record.id === "keep" && record.command === "design_recover_draft");
			expect(kept.success).toBe(true);
			expect(kept.data.reason).toBe("interrupted");
			expect(kept.data.snapshot.document.canvas.nodes["keep-node"]).toBeDefined();
			expect(kept.data.snapshot.document.revisions.at(-1).kind).toBe("interrupted");

			const current = kept.data.snapshot;
			const currentRevisionId = String(current.document.revisions.at(-1).id);
			const currentCanvas = current.document.canvas;
			const discardRoot = join(projectPath, ".gitpilot", "design", designId, "drafts", "design-run-recover-discard");
			mkdirSync(discardRoot, { recursive: true });
			writeFileSync(join(discardRoot, "base.json"), JSON.stringify({ designId, runId: "design-run-recover-discard", requestId: "request-discard", baseRevisionId: currentRevisionId, draftRevisionId: "draft-discard", canvas: currentCanvas }));
			writeFileSync(join(discardRoot, "operations.jsonl"), `${JSON.stringify({ operationId: "op-discard", sequence: 1, operationIndex: 1, pageId: "canvas", summary: "放弃矩形", transaction: { transactionId: "op-discard", baseRevision: currentCanvas.revision, source: "ai", operations: [{ op: "create_node", node: createNode("discard-node"), parentId: "canvas-root" }], summary: "放弃矩形", createdAt: new Date().toISOString() } })}\n`);
			lineHandler(JSON.stringify({ id: "discard", type: "design_recover_draft", projectPath, designId, runId: "design-run-recover-discard", action: "discard" }));
			const discarded = await waitForRecord((record) => record.id === "discard" && record.command === "design_recover_draft");
			expect(discarded.success).toBe(true);
			expect(discarded.data.reason).toBe("discarded");
			expect(discarded.data.snapshot.document.canvas.nodes["discard-node"]).toBeUndefined();
			expect(existsSync(discardRoot)).toBe(false);
		} finally { await cleanup(); }
	});

	it("design_open 会把旧 rectangle/fill/字符串 text 场景迁移为可绘制 canonical 节点", async () => {
		const { lineHandler, projectPath, cleanup } = await startRpcMode();
		const designId = "design-legacy-canvas";
		const designRoot = join(projectPath, ".gitpilot", "design", designId);
		const designPath = join(designRoot, "design.json");
		try {
			mkdirSync(designRoot, { recursive: true });
			const updatedAt = new Date().toISOString();
			const legacy = {
				schemaVersion: 2, id: designId, name: "旧 Canvas", revision: 4, updatedAt, entryPageId: "canvas",
				pages: [{ id: "canvas", name: "无限画板", route: "", rootNodeId: "canvas-root", width: 100000, height: 100000, background: { kind: "solid", color: "#ffffff" }, isInfinite: true }],
				nodes: {
					"canvas-root": { id: "canvas-root", type: "page", name: "无限画板", parentId: null, childIds: ["bg", "title"], visible: true, locked: false, opacity: 1, transform: { x: 0, y: 0, width: 100000, height: 100000, rotation: 0, scaleX: 1, scaleY: 1 }, layout: { mode: "absolute", width: 100000, height: 100000, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: "column", align: "start", justify: "start" } },
					bg: { id: "bg", type: "rectangle", name: "背景", parentId: "canvas-root", childIds: [], fill: "#2563EB", transform: { x: 0, y: 0, width: 1440, height: 900, rotation: 0, scaleX: 1, scaleY: 1 } },
					title: { id: "title", type: "text", name: "标题", parentId: "canvas-root", childIds: [], text: "登录", fontSize: 30, fontWeight: 700, fill: "#1E293B", transform: { x: 100, y: 100, width: 300, height: 40, rotation: 0, scaleX: 1, scaleY: 1 } },
				},
				assets: {},
			};
			writeFileSync(designPath, JSON.stringify(legacy));
			writeFileSync(join(designRoot, "manifest.json"), JSON.stringify({ schemaVersion: 2, designId, name: "旧 Canvas", revision: 4, pageCount: 1, updatedAt, revisions: [{ id: "rev-1", kind: "initial", prompt: "旧 Canvas", summary: "旧 Canvas", createdAt: updatedAt }] }));

			lineHandler(JSON.stringify({ id: "open-legacy-canvas", type: "design_open", projectPath }));
			const opened = await waitForRecord((record) => record.id === "open-legacy-canvas" && record.command === "design_open");
			expect(opened.success).toBe(true);
			expect(opened.data.snapshot.document.canvas.nodes.bg).toMatchObject({ type: "rect", visible: true, layout: { width: 1440, height: 900 }, paint: { fill: { kind: "solid", color: "#2563EB" } } });
			expect(opened.data.snapshot.document.canvas.nodes.title.text).toMatchObject({ text: "登录", color: "#1E293B" });
			const persisted = JSON.parse(readFileSync(designPath, "utf8"));
			expect(persisted.nodes.bg.type).toBe("rect");
			expect(persisted.nodes.title.text).toMatchObject({ text: "登录" });
		} finally { await cleanup(); }
	});

});
