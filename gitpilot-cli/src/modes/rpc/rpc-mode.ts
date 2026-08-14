/**
 * RPC mode: Headless operation with JSON stdin/stdout protocol.
 *
 * Used for embedding the agent in other applications.
 * Receives commands as JSON on stdin, outputs events and responses as JSON on stdout.
 *
 * Protocol:
 * - Commands: JSON objects with `type` field, optional `id` for correlation
 * - Responses: JSON objects with `type: "response"`, `command`, `success`, and optional `data`/`error`
 * - Events: AgentSessionEvent objects streamed as they occur
 * - Extension UI: Extension UI requests are emitted, client responds with extension_ui_response
 */

import * as crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { AgentSessionEvent } from "../../core/agent-session.ts";
import type { AgentSessionRuntime } from "../../core/agent-session-runtime.ts";
import { prepareAttachment } from "../../core/attachments/prepare-attachment.ts";
import { SessionManager } from "../../core/session-manager.ts";
import { getAgentDir } from "../../config.ts";
import { createAgentSessionFromServices, createAgentSessionServices } from "../../core/agent-session-services.ts";
import type {
	ExtensionUIContext,
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
	WorkingIndicatorOptions,
} from "../../core/extensions/index.ts";
import {
	flushRawStdout,
	takeOverStdout,
	waitForRawStdoutBackpressure,
	writeRawStdout,
} from "../../core/output-guard.ts";
import { killTrackedDetachedChildren } from "../../utils/shell.ts";
import { type Theme, theme } from "../interactive/theme/theme.ts";
import { attachJsonlLineReader, serializeJsonLine } from "./jsonl.ts";
import {
	RPC_CAPABILITIES,
	type RpcAgentSessionEvent,
	type RpcCommand,
	type RpcDesktopSessionSnapshot,
	type RpcExtensionUIRequest,
	type RpcExtensionUIResponse,
	type RpcResponse,
	type RpcSessionListItem,
	type RpcSessionState,
	type RpcSlashCommand,
} from "./rpc-types.ts";
import { getPlatformUrl, setPlatformUrl } from "../../extensions/gitpilot/config.ts";
import { deleteCliToken, loadCliToken, saveCliToken } from "../../extensions/gitpilot/credentials.ts";
import { getCurrentCreditAccount, getCurrentUser, revokeCliToken } from "../../extensions/gitpilot/api.ts";
import { createGitPilotWorkToolDefinitions } from "../../extensions/gitpilot/work-tools.ts";
import { createModeExtensions } from "../../extensions/gitpilot/mode-extensions.ts";
import { deleteManagedMcpServer, listManagedMcpServers, saveManagedMcpServer, setManagedMcpEnabled, setManagedMcpModes, type GitPilotAgentMode, type McpServerDefinition } from "../../extensions/gitpilot/mcp-manager.ts";
import type { Context } from "@earendil-works/pi-ai/compat";
import type { DesignRpcFile, DesignRpcSnapshot, WorkFileSnapshot, WorkResearchSource } from "./rpc-types.ts";

// Re-export types for consumers
export type {
	RpcAgentSessionEvent,
	RpcCommand,
	RpcDesktopSessionSnapshot,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
	RpcSessionExecutionSnapshot,
	RpcSessionExecutionSummary,
	RpcSessionListItem,
	RpcSessionState,
} from "./rpc-types.ts";
export { RPC_CAPABILITIES } from "./rpc-types.ts";

/**
 * Run in RPC mode.
 * Listens for JSON commands on stdin, outputs events and responses on stdout.
 */
export async function runRpcMode(runtimeHost: AgentSessionRuntime): Promise<never> {
	takeOverStdout();
	let session = runtimeHost.session;
	let unsubscribe: (() => void) | undefined;
	let unsubscribeBackpressure: (() => void) | undefined;

	const output = (obj: RpcResponse | RpcExtensionUIRequest | object) => {
		writeRawStdout(serializeJsonLine(obj));
	};

	const success = <T extends RpcCommand["type"]>(
		id: string | undefined,
		command: T,
		data?: object | null,
	): RpcResponse => {
		if (data === undefined) {
			return { id, type: "response", command, success: true } as RpcResponse;
		}
		return { id, type: "response", command, success: true, data } as RpcResponse;
	};

	const error = (id: string | undefined, command: string, message: string): RpcResponse => {
		return { id, type: "response", command, success: false, error: message };
	};

	/** 构造当前会话状态 DTO，附带能力列表与权威执行快照（设计文档 §8.1）。 */
	const buildSessionState = (): RpcSessionState => ({
		model: session.model,
		thinkingLevel: session.thinkingLevel,
		isStreaming: session.isStreaming,
		isCompacting: session.isCompacting,
		steeringMode: session.steeringMode,
		followUpMode: session.followUpMode,
		sessionFile: session.sessionFile,
		sessionId: session.sessionId,
		sessionName: session.sessionName,
		autoCompactionEnabled: session.autoCompactionEnabled,
		messageCount: session.messages.length,
		pendingMessageCount: session.pendingMessageCount,
		rpcCapabilities: [...RPC_CAPABILITIES],
		execution: session.executionSnapshot,
	});

	/**
	 * 构造原子会话快照：会话状态、消息与执行快照来自同一会话同一时刻，
	 * eventCursor 对齐当前快照序号，供 Desktop 丢弃旧事件（设计文档 §8.3）。
	 */
	const buildDesktopSnapshot = (): RpcDesktopSessionSnapshot => {
		const execution = session.executionSnapshot;
		return {
			session: buildSessionState(),
			execution,
			messages: session.messages,
			eventCursor: execution.sequence,
		};
	};

	/**
	 * 为实时事件附加传输层元数据后输出（设计文档 §8.4）。
	 * sequence 取自事件分发后刷新的执行快照，保证与 snapshot 对齐；
	 * runId 为 null（idle 期间事件）时不参与 run 级去重。
	 */
	const emitEvent = (event: AgentSessionEvent): void => {
		const execution = session.executionSnapshot;
		const enriched: RpcAgentSessionEvent = {
			...event,
			sessionFile: session.sessionFile,
			sessionId: session.sessionId,
			runId: execution.runId ?? undefined,
			sequence: execution.sequence,
			emittedAt: Date.now(),
		};
		output(enriched);
	};

	// Pending extension UI requests waiting for response
	const pendingExtensionRequests = new Map<
		string,
		{ resolve: (value: any) => void; reject: (error: Error) => void; sessionFile?: string }
	>();

	// Shutdown request flag
	let shutdownRequested = false;
	let shuttingDown = false;
	/** Work 运行只保留进程内 AbortController，绝不写入 Code session 或磁盘。 */
	let activeWorkRequest: { id: string; controller: AbortController; session?: import("../../core/agent-session.ts").AgentSession } | undefined;
	/** Work 每个任务拥有独立 cwd 与 AgentSession，避免读取或污染当前 Code 项目。 */
	const workSessions = new Map<string, { session: import("../../core/agent-session.ts").AgentSession; workspacePath: string }>();
	const workRoot = join(getAgentDir(), "workspaces");
	const workPath = (taskId: string): string => {
		if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) throw new Error("非法 Work 任务标识");
		return join(workRoot, taskId);
	};
	const safeWorkFile = (taskId: string, path: string): string => {
		const root = resolve(workPath(taskId));
		const target = resolve(root, path);
		const rel = relative(root, target);
		if (!rel || rel.startsWith("..") || rel.includes("..\\") || rel.includes("../")) throw new Error("Work 文件路径越界");
		return target;
	};
	const snapshotFile = (root: string, target: string): WorkFileSnapshot => {
		const stat = statSync(target);
		const path = relative(root, target).replaceAll("\\", "/");
		return { path, name: path.split("/").pop() ?? path, type: "text/plain", size: stat.size, updatedAt: stat.mtimeMs, content: readFileSync(target, "utf8") };
	};
	const listWorkFiles = (root: string): WorkFileSnapshot[] => {
		if (!existsSync(root)) return [];
		const files: WorkFileSnapshot[] = [];
		const visit = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const target = join(dir, name);
				if (statSync(target).isDirectory()) visit(target);
				else files.push(snapshotFile(root, target));
			}
		};
		visit(root);
		return files;
	};
	const createWorkSession = async (taskId: string) => {
		const existing = workSessions.get(taskId);
		if (existing) return existing;
		const workspacePath = workPath(taskId);
		const sessionDir = join(workspacePath, ".session");
		mkdirSync(workspacePath, { recursive: true });
		const sessionManager = SessionManager.create(workspacePath, sessionDir, { id: `work-${taskId}` });
		const services = await createAgentSessionServices({
			cwd: workspacePath,
			agentDir: getAgentDir(),
			// Work 保留受限的本地工具集合，同时通过统一工厂获得 Web 与按模式授权的 MCP 工具。
			resourceLoaderOptions: { extensionFactories: createModeExtensions("work", workspacePath) },
		});
		const created = await createAgentSessionFromServices({ services, sessionManager, model: session.model, thinkingLevel: session.thinkingLevel, tools: ["read", "write", "edit", "grep", "find", "ls"], excludeTools: ["bash"], customTools: createGitPilotWorkToolDefinitions(taskId, workspacePath) });
		const record = { session: created.session, workspacePath };
		workSessions.set(taskId, record);
		created.session.subscribe((event) => {
			if (event.type === "message_update") {
				const update = event.assistantMessageEvent as { type?: string; delta?: string } | undefined;
				if (update?.type === "text_delta" && update.delta) output({ type: "work_delta", taskId, delta: update.delta });
			}
			if (event.type === "tool_execution_start") output({ type: "work_tool_started", taskId, toolCallId: event.toolCallId, toolName: event.toolName, args: event.args });
			if (event.type === "tool_execution_end") output({ type: "work_tool_completed", taskId, toolCallId: event.toolCallId, toolName: event.toolName, result: event.result, isError: event.isError });
			if (event.type === "agent_settled") output({ type: "work_file_snapshot", taskId, files: listWorkFiles(workspacePath) });
		});
		return record;
	};
	const getWorkSession = async (taskId: string) => workSessions.get(taskId) ?? await createWorkSession(taskId);
	const reloadMcpSessions = async (): Promise<void> => {
		await session.reload();
		for (const work of workSessions.values()) await work.session.reload();
	};
	const signalCleanupHandlers: Array<() => void> = [];

	// Design Mode 文件独立于 Code/Work 会话，所有路径都固定在 GitPilot 数据目录下。
	const designRoot = join(runtimeHost.cwd, ".gitpilot", "design");
	const designSnapshots = new Map<string, DesignRpcSnapshot>();
	const designSessions = new Map<string, import("../../core/agent-session.ts").AgentSession>();
	const designFile = (path: DesignRpcFile["path"], content: string): DesignRpcFile => ({ path, content, language: path === "index.html" ? "html" : path === "styles.css" ? "css" : "javascript" });
	const demoDesignSnapshot = (designId: string, name = "StudioAI Landing"): DesignRpcSnapshot => {
		const pageId = "home";
		const files: DesignRpcFile[] = [
			designFile("index.html", "<!doctype html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>StudioAI</title></head><body><header class=\"nav\"><strong>◉ StudioAI</strong><nav><a href=\"#work\">Work</a><a href=\"#process\">Process</a><button data-design-id=\"nav-cta\">Start a project ↗</button></nav></header><main class=\"hero\"><span class=\"eyebrow\">NEW · AI-powered web design</span><h1>The website your brand deserves.</h1><p>Stunning design. Blazing performance. Built by AI, refined by experts.</p><button data-design-id=\"hero-cta\" class=\"primary\">Start your project ↗</button></main><footer>Stripe · Vercel · Linear · Notion · Figma</footer></body></html>"),
			designFile("styles.css", ":root{font-family:Inter,system-ui,sans-serif;color:#f5f4ed;background:#071111}*{box-sizing:border-box}body{min-height:100vh;margin:0;padding:32px 5vw;background:radial-gradient(circle at 50% 10%,#31534e,#071111 68%);text-align:center}.nav{display:flex;justify-content:space-between;align-items:center}.nav nav{display:flex;gap:24px;align-items:center}.nav a{color:#b8c8c0;text-decoration:none;font-size:12px}.nav button,.primary{border:0;border-radius:999px;background:#edf0dd;color:#111b17;padding:11px 18px;font-weight:700}.eyebrow{display:inline-block;margin-top:23vh;border:1px solid #6f9084;border-radius:99px;padding:7px 12px;color:#d5e4da;font-size:10px}.hero h1{max-width:900px;margin:24px auto 14px;font:italic 400 clamp(48px,8vw,110px)/.95 Georgia,serif;letter-spacing:-.06em}.hero p{color:#a7b8ad}.primary{margin-top:20px}footer{margin-top:15vh;color:#c9d4c9;font:italic 20px Georgia,serif;word-spacing:28px}@media(max-width:700px){body{padding:20px 18px}.nav nav a{display:none}.hero h1{font-size:clamp(45px,15vw,76px)}footer{font-size:15px;word-spacing:5px;line-height:2}}"),
			designFile("main.js", "document.querySelectorAll('[data-design-id]').forEach((element)=>element.addEventListener('click',(event)=>{event.preventDefault();window.parent.postMessage({type:'design:select',id:element.dataset.designId},'*')}));"),
		];
		return { document: { id: designId, name, version: 1, entryPageId: pageId, pages: [{ id: pageId, name: "Home", route: "/", files }], revisions: [{ id: "rev-1", prompt: "Create a cinematic AI studio landing page", summary: "Initial StudioAI landing page", createdAt: new Date().toISOString() }] }, files };
	};
	const designPath = (designId: string) => { if (!/^[a-zA-Z0-9_-]+$/.test(designId)) throw new Error("非法 Design 标识"); return join(designRoot, designId); };
	const persistDesign = (snapshot: DesignRpcSnapshot): void => { const root = designPath(String(snapshot.document.id)); mkdirSync(join(root, "pages", "home"), { recursive: true }); writeFileSync(join(root, "design.json"), JSON.stringify(snapshot.document, null, 2), "utf8"); for (const file of snapshot.files) writeFileSync(join(root, "pages", "home", file.path), file.content, "utf8"); };
	const createDesignSession = async (designId: string) => {
		const existing = designSessions.get(designId);
		if (existing) return existing;
		const workspacePath = designPath(designId);
		mkdirSync(workspacePath, { recursive: true });
		const services = await createAgentSessionServices({
			cwd: workspacePath,
			agentDir: getAgentDir(),
			// Design 与主会话共享同一个 ModelRuntime，确保 keyring 加载的 GitPilot token、
			// provider 配置和当前模型选择在独立 Agent 会话中保持一致。
			modelRuntime: runtimeHost.services.modelRuntime,
			// Design 仅注册 Web/MCP 扩展；noTools 会移除全部本地文件、Shell 与 Git 工具。
			resourceLoaderOptions: { extensionFactories: createModeExtensions("design", workspacePath) },
		});
		const sessionManager = SessionManager.create(workspacePath, join(workspacePath, ".session"), { id: `design-${designId}` });
		// Design 只需要三份可解析的结构化文件，不需要主会话的深度推理；
		// 固定关闭 thinking，避免模型把输出预算消耗在隐藏推理上，导致 JSON 被截断。
		const created = await createAgentSessionFromServices({ services, sessionManager, model: session.model, thinkingLevel: "off", noTools: "all" });
		designSessions.set(designId, created.session);
		return created.session;
	};
	const designGenerate = async (command: Extract<RpcCommand, { type: "design_generate" }>) => {
		const current = designSnapshots.get(command.designId) ?? demoDesignSnapshot(command.designId);
		const requestId = command.id ?? crypto.randomUUID();
		const designSession = await createDesignSession(command.designId);
		// Design 会话按 designId 缓存；主会话切换模型后，下一次生成要跟随新的选择，
		// 避免继续使用旧模型或旧的未认证模型实例。
		if (session.model && (!designSession.model || designSession.model.provider !== session.model.provider || designSession.model.id !== session.model.id)) {
			await designSession.setModel(session.model);
		}
		if (!designSession.model) throw new Error("Design 尚未选择可用模型");
		const existingFiles = current.files.map((file) => `--- ${file.path} ---\n${file.content}`).join("\n\n");
		await designSession.prompt(`You are GitPilot Design Agent. You may use only supplied Web and authorized MCP tools for research. Never use local files, shell, Git, or write tools. Return JSON only: {"summary": string, "files": [{"path":"index.html|styles.css|main.js","content":string}]}. Return all three responsive, self-contained files and use no remote assets.\n\nCurrent files:\n${existingFiles}\n\nRequest:\n${command.prompt}`, { source: "rpc" });
		await designSession.waitForIdle();
		const modelText = designSession.getLastAssistantText() ?? "";
		if (modelText) output({ type: "design_delta", requestId, designId: command.designId, delta: modelText });
		let generatedFiles: DesignRpcFile[] | undefined;
		let generatedSummary = "";
		try {
			const parsed = JSON.parse(modelText.replace(/^```json\s*/i, "").replace(/\s*```$/, "")) as { summary?: unknown; files?: unknown };
			if (typeof parsed.summary === "string") generatedSummary = parsed.summary;
			if (Array.isArray(parsed.files)) {
				const valid = parsed.files.filter((file): file is { path: DesignRpcFile["path"]; content: string } => Boolean(file && typeof file === "object" && ["index.html", "styles.css", "main.js"].includes((file as { path?: unknown }).path as string) && typeof (file as { content?: unknown }).content === "string"));
				if (valid.length > 0) generatedFiles = valid.map((file) => designFile(file.path, file.content));
			}
		} catch { /* 非结构化响应会在下方转为明确错误，禁止本地 mock 回退。 */ }
		if (!generatedFiles || generatedFiles.length !== 3 || new Set(generatedFiles.map((file) => file.path)).size !== 3) throw new Error("Design Agent 未返回完整的 index.html、styles.css、main.js 结构化结果");
		const files = generatedFiles;
		const revisionId = `rev-${Date.now()}`;
		const summary = generatedSummary || "已应用 Design Agent 的结构化生成结果。";
		const document = { ...current.document, version: Number(current.document.version ?? 1) + 1, revisions: [...(Array.isArray(current.document.revisions) ? current.document.revisions : []), { id: revisionId, prompt: command.prompt, summary, createdAt: new Date().toISOString() }], pages: [{ ...(current.document.pages as Array<Record<string, unknown>>)[0], files }] };
		const next = { document, files } as DesignRpcSnapshot;
		designSnapshots.set(command.designId, next); persistDesign(next); output({ type: "design_preview_ready", designId: command.designId, pageId: command.pageId, revisionId, snapshot: next });
		return { requestId, snapshot: next, summary };
	};

	const loadWorkResearch = async (query: string, signal: AbortSignal): Promise<WorkResearchSource[]> => {
		const platformUrl = getPlatformUrl();
		const token = platformUrl ? await loadCliToken(platformUrl) : undefined;
		if (!platformUrl || !token) return [];
		const response = await fetch(`${platformUrl.replace(/\/$/, "")}/api/cli/work/research`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			body: JSON.stringify({ query }), signal,
		});
		if (!response.ok) throw new Error(`联网研究服务不可用 (${response.status})`);
		const payload = await response.json() as { data?: { sources?: WorkResearchSource[] } };
		return Array.isArray(payload.data?.sources) ? payload.data.sources : [];
	};

	/**
	 * Work 使用当前已选平台模型的无工具流式器；传入的上下文来自 Desktop 本机存储，
	 * runtime 不创建 AgentSession，因此无法获得 read/bash/edit/write/Git 等 Code 工具。
	 */
	const runWorkPrompt = async (command: Extract<RpcCommand, { type: "work_prompt" }>) => {
		const message = command.message.trim();
		if (!message || message.length > 12_000) throw new Error("Work 输入不能为空且不得超过 12000 个字符");
		if (activeWorkRequest) throw new Error("已有 Work 请求正在执行，请先停止或等待完成");
		if (!session.model) throw new Error("尚未选择可用模型");
		const requestId = command.id ?? crypto.randomUUID();
		const controller = new AbortController();
		activeWorkRequest = { id: requestId, controller };
		let sources: WorkResearchSource[] = [];
		try {
			if (command.research !== false) {
				try {
					sources = await loadWorkResearch(message, controller.signal);
					output({ type: "work_sources", requestId, taskId: command.taskId, sources });
				} catch (researchError) {
					output({ type: "work_research_warning", requestId, taskId: command.taskId, message: researchError instanceof Error ? researchError.message : String(researchError) });
				}
			}
			const researchContext = sources.length === 0 ? "" : `\n\n可引用研究资料（仅将其作为来源，不要编造 URL）：\n${sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}\n${source.snippet}`).join("\n\n")}`;
			const history = (command.history ?? []).slice(-20).filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string").map((item) => item.role === "user"
				? { role: "user", content: item.content.slice(0, 12_000), timestamp: Date.now() }
				: { role: "assistant", content: [{ type: "text", text: item.content.slice(0, 12_000) }], timestamp: Date.now() });
			const context: Context = {
				systemPrompt: "你是 GitPilot Work 助手，服务于工作、学习与探索。回答应清晰可执行；若提供研究资料，请标注对应的 [编号]。你没有本地文件、Shell、Git 或任意网络访问权限。",
				messages: history as Context["messages"],
				tools: [],
			};
			if (researchContext) context.messages.push({ role: "user", content: `请结合以下资料回答当前问题：${researchContext}`, timestamp: Date.now() } as Context["messages"][number]);
			const stream = session.modelRuntime.streamSimple(session.model, context, { signal: controller.signal } as never);
			let text = "";
			for await (const event of stream) {
				if (event.type === "text_delta") {
					text += event.delta;
					output({ type: "work_delta", requestId, taskId: command.taskId, delta: event.delta });
				}
				if (event.type === "error") throw new Error(event.error.errorMessage || "Work 模型请求失败");
			}
			output({ type: "work_complete", requestId, taskId: command.taskId, sources });
			return { requestId, text, sources };
		} finally {
			if (activeWorkRequest?.id === requestId) activeWorkRequest = undefined;
		}
	};

	/** Work 新回合使用独立 AgentSession，历史由 session JSONL 持久化，不再由 Desktop 重放。 */
	const runWorkPromptV2 = async (command: Extract<RpcCommand, { type: "work_prompt" }>) => {
		const message = command.message.trim();
		if (!message || message.length > 12_000) throw new Error("Work 输入不能为空且不得超过 12000 个字符");
		if (activeWorkRequest) throw new Error("已有 Work 请求正在执行，请先停止或等待完成");
		const work = await createWorkSession(command.taskId);
		if (!work.session.model) throw new Error("Work 尚未选择可用模型");
		const requestId = command.id ?? crypto.randomUUID();
		const controller = new AbortController();
		activeWorkRequest = { id: requestId, controller };
		try {
			await work.session.prompt(message, { source: "rpc" });
			await work.session.waitForIdle();
			const text = work.session.getLastAssistantText() ?? "";
			if (work.session.messages.filter((entry) => entry.role === "user").length === 1) await work.session.generateAndApplySessionTitle(message);
			output({ type: "work_complete", requestId, taskId: command.taskId });
			return { requestId, text, title: work.session.sessionName };
		} finally {
			if (activeWorkRequest?.id === requestId) activeWorkRequest = undefined;
		}
	};

	/** Helper for dialog methods with signal/timeout support */
	function createDialogPromise<T>(
		opts: ExtensionUIDialogOptions | undefined,
		defaultValue: T,
		request: Record<string, unknown>,
		parseResponse: (response: RpcExtensionUIResponse) => T,
		sessionFile: string | undefined,
	): Promise<T> {
		if (opts?.signal?.aborted) return Promise.resolve(defaultValue);

		const id = crypto.randomUUID();
		return new Promise((resolve, reject) => {
			let timeoutId: ReturnType<typeof setTimeout> | undefined;

			const cleanup = () => {
				if (timeoutId) clearTimeout(timeoutId);
				opts?.signal?.removeEventListener("abort", onAbort);
				pendingExtensionRequests.delete(id);
			};

			const onAbort = () => {
				cleanup();
				resolve(defaultValue);
			};
			opts?.signal?.addEventListener("abort", onAbort, { once: true });

			if (opts?.timeout) {
				timeoutId = setTimeout(() => {
					cleanup();
					resolve(defaultValue);
				}, opts.timeout);
			}

			pendingExtensionRequests.set(id, {
				resolve: (response: RpcExtensionUIResponse) => {
					cleanup();
					resolve(parseResponse(response));
				},
				reject,
				sessionFile,
			});
			output({ type: "extension_ui_request", id, ...request, sessionFile } as RpcExtensionUIRequest);
		});
	}

	/**
	 * Create an extension UI context that uses the RPC protocol.
	 */
	const createExtensionUIContext = (): ExtensionUIContext => {
		// 绑定时捕获会话路径，避免 session 变量在切换后把旧请求标记给新会话。
		const extensionSessionFile = session.sessionFile;
		return {
			select: (title, options, opts) =>
				createDialogPromise(opts, undefined, { method: "select", title, options, timeout: opts?.timeout }, (r) =>
					"cancelled" in r && r.cancelled ? undefined : "value" in r ? r.value : undefined,
					extensionSessionFile,
				),

			confirm: (title, message, opts) =>
				createDialogPromise(opts, false, { method: "confirm", title, message, timeout: opts?.timeout }, (r) =>
					"cancelled" in r && r.cancelled ? false : "confirmed" in r ? r.confirmed : false,
					extensionSessionFile,
				),

			input: (title, placeholder, opts) =>
				createDialogPromise(opts, undefined, { method: "input", title, placeholder, timeout: opts?.timeout }, (r) =>
					"cancelled" in r && r.cancelled ? undefined : "value" in r ? r.value : undefined,
					extensionSessionFile,
				),

		notify(message: string, type?: "info" | "warning" | "error"): void {
			// Fire and forget - no response needed
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "notify",
				message,
				notifyType: type,
			} as RpcExtensionUIRequest);
		},

		onTerminalInput(): () => void {
			// Raw terminal input not supported in RPC mode
			return () => {};
		},

		setStatus(key: string, text: string | undefined): void {
			// Fire and forget - no response needed
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "setStatus",
				statusKey: key,
				statusText: text,
			} as RpcExtensionUIRequest);
		},

		setWorkingMessage(_message?: string): void {
			// Working message not supported in RPC mode - requires TUI loader access
		},

		setWorkingVisible(_visible: boolean): void {
			// Working visibility not supported in RPC mode - requires TUI loader access
		},

		setWorkingIndicator(_options?: WorkingIndicatorOptions): void {
			// Working indicator customization not supported in RPC mode - requires TUI loader access
		},

		setHiddenThinkingLabel(_label?: string): void {
			// Hidden thinking label not supported in RPC mode - requires TUI message rendering access
		},

		setWidget(key: string, content: unknown, options?: ExtensionWidgetOptions): void {
			// Only support string arrays in RPC mode - factory functions are ignored
			if (content === undefined || Array.isArray(content)) {
				output({
					type: "extension_ui_request",
					id: crypto.randomUUID(),
					method: "setWidget",
					widgetKey: key,
					widgetLines: content as string[] | undefined,
					widgetPlacement: options?.placement,
				} as RpcExtensionUIRequest);
			}
			// Component factories are not supported in RPC mode - would need TUI access
		},

		setFooter(_factory: unknown): void {
			// Custom footer not supported in RPC mode - requires TUI access
		},

		setHeader(_factory: unknown): void {
			// Custom header not supported in RPC mode - requires TUI access
		},

		setTitle(title: string): void {
			// Fire and forget - host can implement terminal title control
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "setTitle",
				title,
			} as RpcExtensionUIRequest);
		},

		async custom() {
			// Custom UI not supported in RPC mode
			return undefined as never;
		},

		pasteToEditor(text: string): void {
			// Paste handling not supported in RPC mode - falls back to setEditorText
			this.setEditorText(text);
		},

		setEditorText(text: string): void {
			// Fire and forget - host can implement editor control
			output({
				type: "extension_ui_request",
				id: crypto.randomUUID(),
				method: "set_editor_text",
				text,
			} as RpcExtensionUIRequest);
		},

		getEditorText(): string {
			// Synchronous method can't wait for RPC response
			// Host should track editor state locally if needed
			return "";
		},

		async editor(title: string, prefill?: string): Promise<string | undefined> {
			const id = crypto.randomUUID();
			return new Promise((resolve, reject) => {
				pendingExtensionRequests.set(id, {
					resolve: (response: RpcExtensionUIResponse) => {
						if ("cancelled" in response && response.cancelled) {
							resolve(undefined);
						} else if ("value" in response) {
							resolve(response.value);
						} else {
							resolve(undefined);
						}
				},
				reject,
				sessionFile: extensionSessionFile,
			});
				output({ type: "extension_ui_request", id, method: "editor", title, prefill, sessionFile: extensionSessionFile } as RpcExtensionUIRequest);
			});
		},

		addAutocompleteProvider(): void {
			// Autocomplete provider composition is not supported in RPC mode
		},

		setEditorComponent(): void {
			// Custom editor components not supported in RPC mode
		},

		getEditorComponent() {
			// Custom editor components not supported in RPC mode
			return undefined;
		},

		get theme() {
			return theme;
		},

		getAllThemes() {
			return [];
		},

		getTheme(_name: string) {
			return undefined;
		},

		setTheme(_theme: string | Theme) {
			// Theme switching not supported in RPC mode
			return { success: false, error: "Theme switching not supported in RPC mode" };
		},

		getToolsExpanded() {
			// Tool expansion not supported in RPC mode - no TUI
			return false;
		},

		setToolsExpanded(_expanded: boolean) {
			// Tool expansion not supported in RPC mode - no TUI
		},
		};
	};

	runtimeHost.setRebindSession(async () => {
		await rebindSession();
	});

	const rebindSession = async (): Promise<void> => {
		session = runtimeHost.session;
		await session.bindExtensions({
			uiContext: createExtensionUIContext(),
			mode: "rpc",
			commandContextActions: {
				waitForIdle: () => session.waitForIdle(),
				newSession: async (options) => runtimeHost.newSession(options),
				fork: async (entryId, forkOptions) => {
					const result = await runtimeHost.fork(entryId, forkOptions);
					return { cancelled: result.cancelled };
				},
				navigateTree: async (targetId, options) => {
					const result = await session.navigateTree(targetId, {
						summarize: options?.summarize,
						customInstructions: options?.customInstructions,
						replaceInstructions: options?.replaceInstructions,
						label: options?.label,
					});
					return { cancelled: result.cancelled };
				},
				switchSession: async (sessionPath, options) => {
					return runtimeHost.switchSession(sessionPath, options);
				},
				reload: async () => {
					await session.reload();
				},
			},
			shutdownHandler: () => {
				shutdownRequested = true;
			},
			onError: (err) => {
				output({ type: "extension_error", extensionPath: err.extensionPath, event: err.event, error: err.error });
			},
		});

		unsubscribe?.();
		unsubscribeBackpressure?.();
		unsubscribe = session.subscribe((event) => {
			emitEvent(event);
			if (event.type === "agent_settled") {
				void checkShutdownRequested();
			}
		});
		unsubscribeBackpressure = session.agent.subscribe(async () => {
			await waitForRawStdoutBackpressure();
		});
	};

	const registerSignalHandlers = (): void => {
		const signals: NodeJS.Signals[] = ["SIGTERM"];
		if (process.platform !== "win32") {
			signals.push("SIGHUP");
		}

		for (const signal of signals) {
			const handler = () => {
				killTrackedDetachedChildren();
				void shutdown(signal === "SIGHUP" ? 129 : 143, signal);
			};
			process.on(signal, handler);
			signalCleanupHandlers.push(() => process.off(signal, handler));
		}
	};

	await rebindSession();
	registerSignalHandlers();

	// Handle a single command
	const handleCommand = async (command: RpcCommand): Promise<RpcResponse | undefined> => {
		const id = command.id;

		switch (command.type) {
			// =================================================================
			// Prompting
			// =================================================================

			case "prompt": {
				// 首条用户消息时异步生成任务标题（与 agent 回复并行，不阻塞 prompt）。
				// 标题就绪后 setSessionName 落盘并推送 session_info_changed，前端据此显示任务。
				if (session.messages.length === 0 && session.model) {
					void session.generateAndApplySessionTitle(command.message);
				}
				// Start prompt handling immediately, but emit the authoritative response only after
				// prompt preflight succeeds. Queued and immediately handled prompts also count as success.
				let preflightSucceeded = false;
				void session
					.prompt(command.message, {
						images: command.images,
						streamingBehavior: command.streamingBehavior,
						source: "rpc",
						preflightResult: (didSucceed) => {
							if (didSucceed) {
								preflightSucceeded = true;
								output(success(id, "prompt"));
							}
						},
					})
					.catch((e) => {
						if (!preflightSucceeded) {
							output(error(id, "prompt", e.message));
							return;
						}
						// 已确认受理的扩展命令可能在后续异步执行中失败；此时不能再发第二条
						// 同 id response，否则 Rust 侧会误匹配。通过事件流通知 Desktop 即可。
						output({ type: "rpc:error", message: e instanceof Error ? e.message : String(e) });
					});
				return undefined;
			}

			case "steer": {
				await session.steer(command.message, command.images);
				return success(id, "steer");
			}

			case "follow_up": {
				await session.followUp(command.message, command.images);
				return success(id, "follow_up");
			}

			case "abort": {
				const cleared = command.clearQueue ? session.clearQueue() : undefined;
				await session.abort();
				return success(
					id,
					"abort",
					cleared
						? { clearedSteering: cleared.steering.length, clearedFollowUp: cleared.followUp.length }
						: undefined,
				);
			}

			case "new_session": {
				// 透传 cwd：桌面版按项目/子目录创建任务时指定工作目录
				const options: { parentSession?: string; cwd?: string } = {};
				if (command.parentSession) options.parentSession = command.parentSession;
				if (command.cwd) options.cwd = command.cwd;
				const result = await runtimeHost.newSession(Object.keys(options).length > 0 ? options : undefined);
				if (!result.cancelled) {
					await rebindSession();
				}
				return success(id, "new_session", result);
			}

			// =================================================================
			// Attachments（桌面端上传附件预解析）
			// 路径输入由 sidecar 读取本地文件，内联 base64 用于剪贴板粘贴/拖拽的 blob；
			// 解析结果随 response 直接返回，下一条 prompt/steer 时由桌面端注入。
			// =================================================================

			case "prepare_attachments": {
				const items = command.items;
				if (!Array.isArray(items) || items.length === 0) {
					return error(id, "prepare_attachments", "items 不能为空");
				}
				try {
					const cwd = runtimeHost.cwd;
					const attachments = await Promise.all(items.map((item) => prepareAttachment(item, { cwd })));
					return success(id, "prepare_attachments", { attachments });
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					return error(id, "prepare_attachments", `附件解析失败: ${message}`);
				}
			}

			// =================================================================
			// GitPilot Work（独立无状态工作对话）
			// =================================================================

			case "work_prompt": {
				const result = await runWorkPromptV2(command);
				return success(id, "work_prompt", result);
			}

			case "design_create": {
				const designId = `design-${crypto.randomUUID()}`;
				const snapshot = demoDesignSnapshot(designId, command.name || "StudioAI Landing");
				designSnapshots.set(designId, snapshot); persistDesign(snapshot);
				return success(id, "design_create", { designId, snapshot });
			}

			case "design_get_snapshot": {
				const snapshot = designSnapshots.get(command.designId) ?? demoDesignSnapshot(command.designId);
				designSnapshots.set(command.designId, snapshot);
				return success(id, "design_get_snapshot", { snapshot });
			}

			case "design_generate": {
				return success(id, "design_generate", await designGenerate(command));
			}

			case "design_preview": {
				const snapshot = designSnapshots.get(command.designId) ?? demoDesignSnapshot(command.designId);
				return success(id, "design_preview", { snapshot });
			}

			case "design_check": {
				const snapshot = designSnapshots.get(command.designId) ?? demoDesignSnapshot(command.designId);
				return success(id, "design_check", { snapshot, checks: [{ level: "info", message: "Responsive preview is available for all target profiles." }] });
			}

			case "design_revert": {
				const snapshot = designSnapshots.get(command.designId) ?? demoDesignSnapshot(command.designId);
				return success(id, "design_revert", { snapshot });
			}

			case "design_export": {
				const snapshot = designSnapshots.get(command.designId) ?? demoDesignSnapshot(command.designId);
				persistDesign(snapshot);
				return success(id, "design_export", { path: designPath(command.designId) });
			}

			case "mcp_list": {
				return success(id, "mcp_list", { servers: listManagedMcpServers(runtimeHost.cwd, getAgentDir()) });
			}

			case "mcp_save_server": {
				saveManagedMcpServer(runtimeHost.cwd, command.name, command.definition as McpServerDefinition, command.modes as GitPilotAgentMode[], getAgentDir());
				await reloadMcpSessions();
				return success(id, "mcp_save_server");
			}

			case "mcp_delete_server": {
				deleteManagedMcpServer(runtimeHost.cwd, command.name, getAgentDir());
				await reloadMcpSessions();
				return success(id, "mcp_delete_server");
			}

			case "mcp_set_modes": {
				setManagedMcpModes(runtimeHost.cwd, command.name, command.modes as GitPilotAgentMode[], getAgentDir());
				await reloadMcpSessions();
				return success(id, "mcp_set_modes");
			}

			case "mcp_set_enabled": {
				setManagedMcpEnabled(runtimeHost.cwd, command.name, command.enabled, getAgentDir());
				await reloadMcpSessions();
				return success(id, "mcp_set_enabled");
			}

			case "mcp_reload": {
				await reloadMcpSessions();
				return success(id, "mcp_reload");
			}

			case "new_work_session": {
				const work = await createWorkSession(command.taskId);
				return success(id, "new_work_session", { taskId: command.taskId, sessionId: work.session.sessionId, sessionPath: work.session.sessionFile ?? "", workspacePath: work.workspacePath, title: work.session.sessionName ?? "新的 Work 任务" });
			}

			case "work_file_list": {
				const root = (await getWorkSession(command.taskId)).workspacePath;
				return success(id, "work_file_list", { taskId: command.taskId, files: listWorkFiles(root) });
			}

			case "work_file_read": {
				const root = (await getWorkSession(command.taskId)).workspacePath;
				const target = safeWorkFile(command.taskId, command.path);
				if (!existsSync(target) || !statSync(target).isFile()) return error(id, "work_file_read", "Work 文件不存在");
				return success(id, "work_file_read", { taskId: command.taskId, file: snapshotFile(root, target) });
			}

			case "work_file_write": {
				const root = (await getWorkSession(command.taskId)).workspacePath;
				const target = safeWorkFile(command.taskId, command.path);
				mkdirSync(resolve(target, ".."), { recursive: true });
				writeFileSync(target, command.content, "utf8");
				const file = snapshotFile(root, target);
				output({ type: "work_file_updated", taskId: command.taskId, file });
				return success(id, "work_file_write", { taskId: command.taskId, file });
			}

			case "work_file_delete": {
				await getWorkSession(command.taskId);
				const target = safeWorkFile(command.taskId, command.path);
				if (existsSync(target)) unlinkSync(target);
				output({ type: "work_file_deleted", taskId: command.taskId, path: command.path });
				return success(id, "work_file_delete", { taskId: command.taskId, path: command.path });
			}

			case "work_file_rename": {
				const root = (await getWorkSession(command.taskId)).workspacePath;
				const source = safeWorkFile(command.taskId, command.path);
				const target = safeWorkFile(command.taskId, command.newPath);
				if (!existsSync(source)) return error(id, "work_file_rename", "Work 文件不存在");
				mkdirSync(resolve(target, ".."), { recursive: true });
				renameSync(source, target);
				const file = snapshotFile(root, target);
				output({ type: "work_file_updated", taskId: command.taskId, file });
				return success(id, "work_file_rename", { taskId: command.taskId, file });
			}

		case "work_abort": {
			if (activeWorkRequest && (!command.requestId || activeWorkRequest.id === command.requestId)) {
				activeWorkRequest.controller.abort();
				const taskSession = [...workSessions.values()].find((entry) => entry.session.isStreaming);
				if (taskSession) void taskSession.session.abort();
			}
				return success(id, "work_abort");
			}

			case "work_prepare_attachments": {
				if (!Array.isArray(command.items) || command.items.length === 0) return error(id, "work_prepare_attachments", "items 不能为空");
				try {
					// 复用解析器仅处理用户主动提供的项目；解析结果由 Desktop 写入 IndexedDB，sidecar 不持久化。
					const attachments = await Promise.all(command.items.map((item) => prepareAttachment(item, { cwd: runtimeHost.cwd })));
					return success(id, "work_prepare_attachments", { attachments });
				} catch (attachmentError) {
					return error(id, "work_prepare_attachments", `附件解析失败: ${attachmentError instanceof Error ? attachmentError.message : String(attachmentError)}`);
				}
			}

			// =================================================================
			// State
			// =================================================================

			case "get_state": {
				return success(id, "get_state", buildSessionState());
			}

			// =================================================================
			// Model
			// =================================================================

			case "set_model": {
				const models = await session.modelRuntime.getAvailable();
				const model = models.find((m) => m.provider === command.provider && m.id === command.modelId);
				if (!model) {
					return error(id, "set_model", `Model not found: ${command.provider}/${command.modelId}`);
				}
				await session.setModel(model);
				return success(id, "set_model", model);
			}

			case "cycle_model": {
				const result = await session.cycleModel();
				if (!result) {
					return success(id, "cycle_model", null);
				}
				return success(id, "cycle_model", result);
			}

			case "get_available_models": {
				const models = await session.modelRuntime.getAvailable();
				return success(id, "get_available_models", { models });
			}

			// =================================================================
			// Thinking
			// =================================================================

			case "set_thinking_level": {
				session.setThinkingLevel(command.level);
				return success(id, "set_thinking_level");
			}

			case "cycle_thinking_level": {
				const level = session.cycleThinkingLevel();
				if (!level) {
					return success(id, "cycle_thinking_level", null);
				}
				return success(id, "cycle_thinking_level", { level });
			}

			case "get_available_thinking_levels": {
				const levels = session.getAvailableThinkingLevels();
				return success(id, "get_available_thinking_levels", { levels });
			}

			// =================================================================
			// Queue Modes
			// =================================================================

			case "set_steering_mode": {
				session.setSteeringMode(command.mode);
				return success(id, "set_steering_mode");
			}

			case "set_follow_up_mode": {
				session.setFollowUpMode(command.mode);
				return success(id, "set_follow_up_mode");
			}

			// =================================================================
			// Compaction
			// =================================================================

			case "compact": {
				const result = await session.compact(command.customInstructions);
				return success(id, "compact", result);
			}

			case "set_auto_compaction": {
				session.setAutoCompactionEnabled(command.enabled);
				return success(id, "set_auto_compaction");
			}

			// =================================================================
			// Retry
			// =================================================================

			case "set_auto_retry": {
				session.setAutoRetryEnabled(command.enabled);
				return success(id, "set_auto_retry");
			}

			case "abort_retry": {
				session.abortRetry();
				return success(id, "abort_retry");
			}

			// =================================================================
			// Bash
			// =================================================================

			case "bash": {
				const result = await session.executeBash(command.command, undefined, {
					excludeFromContext: command.excludeFromContext,
				});
				return success(id, "bash", result);
			}

			case "abort_bash": {
				session.abortBash();
				return success(id, "abort_bash");
			}

			// =================================================================
			// Session
			// =================================================================

			case "get_session_stats": {
				const stats = session.getSessionStats();
				return success(id, "get_session_stats", stats);
			}

			case "export_html": {
				const path = await session.exportToHtml(command.outputPath);
				return success(id, "export_html", { path });
			}

			case "switch_session": {
				const currentSessionFile = session.sessionFile;
				// 计划确认等交互会在 Agent 回合结束后继续等待；此时 isStreaming 已为 false。
				// 若直接销毁会话，Desktop 收到确认回包也找不到原 Promise，计划无法继续。
				const preserveCurrentForInteraction = Boolean(
					currentSessionFile && [...pendingExtensionRequests.values()].some((request) => request.sessionFile === currentSessionFile),
				);
				const result = await runtimeHost.switchSession(command.sessionPath, { preserveCurrentForInteraction });
				if (!result.cancelled) {
					await rebindSession();
				}
				// 切换成功时附带原子快照，避免 Desktop 再发 get_state/get_messages 多请求竞态。
				const snapshot = result.cancelled ? undefined : buildDesktopSnapshot();
				return success(id, "switch_session", { cancelled: result.cancelled, snapshot });
			}

			case "get_session_snapshot": {
				// 原子取得当前会话状态、消息与执行快照，供应用启动/重连/刷新使用。
				return success(id, "get_session_snapshot", buildDesktopSnapshot());
			}

			case "fork": {
				const result = await runtimeHost.fork(command.entryId);
				if (!result.cancelled) {
					await rebindSession();
				}
				return success(id, "fork", { text: result.selectedText, cancelled: result.cancelled });
			}

			case "clone": {
				const leafId = session.sessionManager.getLeafId();
				if (!leafId) {
					return error(id, "clone", "Cannot clone session: no current entry selected");
				}
				const result = await runtimeHost.fork(leafId, { position: "at" });
				if (!result.cancelled) {
					await rebindSession();
				}
				return success(id, "clone", { cancelled: result.cancelled });
			}

			case "get_fork_messages": {
				const messages = session.getUserMessagesForForking();
				return success(id, "get_fork_messages", { messages });
			}

			case "get_entries": {
				const sessionManager = session.sessionManager;
				let entries = sessionManager.getEntries();
				if (command.since !== undefined) {
					const sinceIndex = entries.findIndex((e) => e.id === command.since);
					if (sinceIndex === -1) {
						return error(id, "get_entries", `Entry not found: ${command.since}`);
					}
					entries = entries.slice(sinceIndex + 1);
				}
				return success(id, "get_entries", { entries, leafId: sessionManager.getLeafId() });
			}

			case "get_tree": {
				const sessionManager = session.sessionManager;
				return success(id, "get_tree", { tree: sessionManager.getTree(), leafId: sessionManager.getLeafId() });
			}

			case "list_sessions": {
				// scope=all 跨所有项目目录列会话（SessionManager.listAll），每条带 cwd 供前端按项目分组；
				// 否则只列当前 cwd 的会话。每条附带运行态摘要，桌面侧栏可在任务离开视口后继续显示运行标记。
				const sessionManager = session.sessionManager;
				const sessions =
					command.scope === "all"
						? await SessionManager.listAll()
						: await SessionManager.list(sessionManager.getCwd(), sessionManager.getSessionDir());
				const items: RpcSessionListItem[] = sessions.map((item) => ({
					...item,
					isStreaming: runtimeHost.isSessionStreaming(item.path),
					execution: runtimeHost.getSessionExecutionSummary(item.path),
				}));
				return success(id, "list_sessions", { sessions: items });
			}

			case "get_last_assistant_text": {
				const text = session.getLastAssistantText();
				return success(id, "get_last_assistant_text", { text });
			}

			case "set_session_name": {
				const name = command.name.trim();
				if (!name) {
					return error(id, "set_session_name", "Session name cannot be empty");
				}
				session.setSessionName(name);
				return success(id, "set_session_name");
			}

			// 桌面版登录后注入平台 gpt_ token：持久化平台地址并存入系统凭据库，
			// 复用 saveCliToken 使 inMemoryToken 与 GITPILOT_CLI_TOKEN 立即生效，无需重启 sidecar。
			case "set_token": {
				const normalized = setPlatformUrl(command.platformUrl);
				await saveCliToken(normalized, command.token);
				// 用新 token 重拉平台模型清单（refreshModels -> listModels -> GET /api/cli/models），
				// 否则 get_available_models 仍返回 sidecar 启动时（无 token）拉取的空列表。
				await session.modelRuntime.refresh({ allowNetwork: true });
				return success(id, "set_token");
			}

			// 桌面标题栏只取得安全的账户摘要；长期令牌始终留在 sidecar 的系统凭据库中。
			case "get_platform_account": {
				const platformUrl = getPlatformUrl();
				if (!platformUrl) return error(id, "get_platform_account", "未配置 GitPilot 平台地址");
				const token = await loadCliToken(platformUrl);
				if (!token) return error(id, "get_platform_account", "未登录 GitPilot 平台");
				const user = await getCurrentUser(platformUrl, token);
				// 资料和积分分开获取：积分服务短暂异常时仍要让标题栏显示已登录用户。
				let creditBalance: number | null = null;
				try {
					creditBalance = (await getCurrentCreditAccount(platformUrl, token)).balance;
				} catch (err) {
					console.warn("[rpc] 读取 GitPilot 积分失败：", err);
				}
				return success(id, "get_platform_account", { platformUrl, user, creditBalance });
			}

			// 底栏的“已连接”必须表示平台后端实际可访问，不能仅以 sidecar 存活作为依据。
			// 复用需要 Bearer token 的 /api/cli/me，以一次只读请求同时验证后端连通性和当前登录态。
			case "get_platform_connection": {
				const platformUrl = getPlatformUrl();
				if (!platformUrl) return success(id, "get_platform_connection", { connected: false });
				const token = await loadCliToken(platformUrl);
				if (!token) return success(id, "get_platform_connection", { connected: false });
				try {
					await getCurrentUser(platformUrl, token);
					return success(id, "get_platform_connection", { connected: true });
				} catch {
					// 网络不可达、后端停止或令牌失效都不能显示为绿色“已连接”。
					return success(id, "get_platform_connection", { connected: false });
				}
			}

			// 菜单登出需撤销平台会话并删除系统凭据，避免本地 Agent 继续持有可用 token。
			case "logout": {
				const platformUrl = getPlatformUrl();
				if (platformUrl) {
					const token = await loadCliToken(platformUrl);
					try {
						if (token) await revokeCliToken(platformUrl, token);
					} finally {
						await deleteCliToken(platformUrl);
					}
				}
				await session.modelRuntime.refresh({ allowNetwork: true });
				return success(id, "logout");
			}

			// =================================================================
			// Messages
			// =================================================================

			case "get_messages": {
				return success(id, "get_messages", { messages: session.messages });
			}

			// =================================================================
			// Commands (available for invocation via prompt)
			// =================================================================

			case "get_commands": {
				// 扩展命令的中文描述覆盖（上游扩展描述多为英文，宿主侧统一本地化）
				const EXTENSION_COMMAND_DESCRIPTIONS: Record<string, string> = {
					requirement: "列出负责人是我的需求，选中后进行技术设计与开发",
					llama: "管理 llama.cpp 本地推理模型",
					rtk: "配置 RTK 命令重写与工具输出压缩优化",
					goal: "设定会话目标，持续执行直至目标完成",
					plan: "进入只读计划模式，探索代码并制定实施计划",
				};
				const commands: RpcSlashCommand[] = [];

				for (const command of session.extensionRunner.getRegisteredCommands()) {
					commands.push({
						name: command.invocationName,
						description: EXTENSION_COMMAND_DESCRIPTIONS[command.invocationName] ?? command.description,
						source: "extension",
						sourceInfo: command.sourceInfo,
						// /rtk 主命令是 TUI 设置模态框，Desktop 需原生 Dialog 适配；
						// 其余扩展命令默认走标准 RPC 透传。
						// TODO(P1+): slopchop /diff、/slopchop -> open_local_review
						hostAction: command.invocationName === "rtk" ? "open_rtk_settings" : "prompt",
						uiCapability: command.invocationName === "rtk" ? "tui-custom" : "rpc-standard",
					});
				}

				for (const template of session.promptTemplates) {
					commands.push({
						name: template.name,
						description: template.description,
						source: "prompt",
						sourceInfo: template.sourceInfo,
					});
				}

				for (const skill of session.resourceLoader.getSkills().skills) {
					commands.push({
						name: `skill:${skill.name}`,
						description: skill.description,
						source: "skill",
						sourceInfo: skill.sourceInfo,
					});
				}

				return success(id, "get_commands", { commands });
			}

			case "execute_command": {
				const name = command.name.trim();
				const registered = session.extensionRunner.getCommand(name);
				if (!registered) return error(id, "execute_command", `未找到扩展命令：/${name}`);
				const text = command.args?.trim() ? `/${name} ${command.args.trim()}` : `/${name}`;
				// 交互式扩展命令可能等待 extension_ui_response；不能让 RPC response
				// 阻塞桌面输入态，因此只在后台启动，异常通过统一 rpc:error 事件收敛。
				void session.prompt(text, { source: "rpc" }).catch((commandError: unknown) => {
					output({
						type: "rpc:error",
						message: `执行扩展命令 /${name} 失败：${commandError instanceof Error ? commandError.message : String(commandError)}`,
					});
				});
				return success(id, "execute_command");
			}

			default: {
				const unknownCommand = command as { type: string };
				return error(id, unknownCommand.type, `Unknown command: ${unknownCommand.type}`);
			}
		}
	};

	/**
	 * Check if shutdown was requested and perform shutdown if so.
	 * Called after handling each command when waiting for the next command.
	 */
	let detachInput = () => {};

	async function shutdown(exitCode = 0, signal?: NodeJS.Signals): Promise<never> {
		if (shuttingDown) {
			process.exit(exitCode);
		}
		shuttingDown = true;
		for (const cleanup of signalCleanupHandlers) {
			cleanup();
		}
		unsubscribe?.();
		unsubscribeBackpressure?.();
		await runtimeHost.dispose();
		detachInput();
		process.stdin.pause();
		if (signal !== "SIGTERM") {
			await flushRawStdout();
		}
		process.exit(exitCode);
	}

	async function checkShutdownRequested(): Promise<void> {
		if (!shutdownRequested) return;
		await shutdown();
	}

	const handleInputLine = async (line: string) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch (parseError: unknown) {
			output(
				error(
					undefined,
					"parse",
					`Failed to parse command: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
				),
			);
			await waitForRawStdoutBackpressure();
			return;
		}

		// Handle extension UI responses
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"type" in parsed &&
			parsed.type === "extension_ui_response"
		) {
			const response = parsed as RpcExtensionUIResponse;
			const pending = pendingExtensionRequests.get(response.id);
			if (pending) {
				pendingExtensionRequests.delete(response.id);
				pending.resolve(response);
			}
			// 回一条带原 id 的响应：Desktop 通过同步 RPC 发送本命令（Rust rpc_send 会
			// recv_timeout 等待），不回包会让桌面主线程阻塞 30 秒，表现为"整个软件死机"。
			output({ type: "response", command: "extension_ui_response", success: true, id: response.id });
			await waitForRawStdoutBackpressure();
			return;
		}

		const command = parsed as RpcCommand;
		try {
			const response = await handleCommand(command);
			if (response) {
				output(response);
				await waitForRawStdoutBackpressure();
			}
			await checkShutdownRequested();
		} catch (commandError: unknown) {
			output(
				error(
					command.id,
					command.type,
					commandError instanceof Error ? commandError.message : String(commandError),
				),
			);
			await waitForRawStdoutBackpressure();
		}
	};

	const onInputEnd = () => {
		void shutdown();
	};
	// 通知宿主 sidecar 已完成初始化、可接收命令。宿主（如 Tauri 桥接器）据此确认就绪，
	// 避免在 sidecar 真正可用前误发命令导致首条命令响应延迟或就绪状态失真。
	output({ type: "ready" });
	await waitForRawStdoutBackpressure();

	process.stdin.on("end", onInputEnd);

	detachInput = (() => {
		const detachJsonl = attachJsonlLineReader(process.stdin, (line) => {
			void handleInputLine(line);
		});
		return () => {
			detachJsonl();
			process.stdin.off("end", onInputEnd);
		};
	})();

	// Keep process alive forever
	return new Promise(() => {});
}
