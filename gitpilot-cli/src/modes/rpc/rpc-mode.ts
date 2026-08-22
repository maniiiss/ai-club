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
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import JSZip from "jszip";
import type { AgentSessionEvent } from "../../core/agent-session.ts";
import type { AgentSessionRuntime } from "../../core/agent-session-runtime.ts";
import { prepareAttachment } from "../../core/attachments/prepare-attachment.ts";
import { GitServiceError, isGitServiceError } from "../../core/git/git-types.ts";
import { RepositoryService } from "../../core/git/repository-service.ts";
import { buildCommitMessagePrompt, COMMIT_MESSAGE_SYSTEM_PROMPT, extractCommitMessage } from "./git-commit-message.ts";
import { SessionManager } from "../../core/session-manager.ts";
import { getAgentDir } from "../../config.ts";
import { createAgentSessionFromServices, createAgentSessionServices } from "../../core/agent-session-services.ts";
import type {
	ExtensionUIContext,
	ExtensionUIDialogOptions,
	ExtensionWidgetOptions,
	ExtensionToolExecutionAdapter,
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
import { getCurrentCreditAccount, getCurrentUser, getWorkItemDetail, getWorkItemLinks, listMyTasks, listProjects, revokeCliToken, uploadDesignVersion } from "../../extensions/gitpilot/api.ts";
import { createGitPilotWorkToolDefinitions } from "../../extensions/gitpilot/work-tools.ts";
import { createModeExtensions } from "../../extensions/gitpilot/mode-extensions.ts";
import { isDesktopCommandVisible } from "../../extensions/gitpilot/desktop-command-visibility.ts";
import { copyManagedMcpServer, deleteManagedMcpServer, listManagedMcpServers, saveManagedMcpServer, setManagedMcpEnabled, setManagedMcpModes, type GitPilotAgentMode, type McpServerDefinition } from "../../extensions/gitpilot/mcp-manager.ts";
import { listManagedSkills, setManagedSkillEnabled, setManagedSkillModes, type SkillMode } from "../../extensions/gitpilot/skill-manager.ts";
import type { Context } from "@earendil-works/pi-ai/compat";
import type { CanvasDesignDocument, CanvasDesignOperation, DesignClarificationRequiredEvent, DesignDraftMetadata, DesignOpenData, DesignPatch, DesignPatchAppliedEvent, DesignPlanStep, DesignPlanUpdatedEvent, DesignPreviewHandle, DesignProjectGuidelines, DesignRpcMessage, DesignRpcSnapshot, DesignRunRecoveryState, DesignStreamMetadata, WorkFileSnapshot, WorkResearchSource } from "./rpc-types.ts";
import { buildDesignCompactionInstructions, collectCanvasPatchDelta, projectDesignAgentEvent } from "./design-events.ts";
import { createDesignToolDefinitions, isDesignPatchOperation, type DesignPatchResult } from "./design-tools.ts";
import { isCanonicalCanvasNode, normalizeCanvasOperations, normalizeNativeCanvasDocument } from "./canvas-normalize.ts";
import { defaultProjectGuidelines, normalizeProjectGuidelines } from "./design-guidelines.ts";
import { listCodeProjectFiles } from "./project-files.ts";
import {
	cloneSecurityPolicy,
	DEFAULT_SECURITY_POLICY,
	normalizeSecurityPolicy,
	type ApprovalDecision,
	type SecurityApprovalRequest,
	type SecurityPolicy,
	type SessionApprovalMode,
} from "../../core/security/security-policy.ts";
import { GondolinExecutor, WindowsNativeExecutor } from "../../core/security/sandbox-executor.ts";

/** Work 的会话提示词独立于 Code，避免共享 AgentSession 基础设施时继承编码助手身份。 */
const WORK_SYSTEM_PROMPT = `你是 GitPilot Work 模式的工作协同助手。
你的职责是帮助用户推进工作、学习、探索、调研、方案梳理、任务拆解和协作沟通。先理解用户的目标，再给出清晰、可执行的回答。

工作方式：
- 默认直接回答。只有当用户的请求确实需要产出文件、检索或操作公众端工作项、联网调研时才使用工具；不要为了"先了解上下文"而主动扫描工作区、读取会话记录或枚举平台项目。
- 你不是编码助手：除非用户明确要求处理当前工作区里的文件，否则不要读取或分析工作区代码。
- 当问题涉及某个项目、某类工作项而你不确定用户所指的范围时，先简短询问用户确认，不要自行猜测项目或检索全部项目。
- 需要产出 Office 文档时使用 office 工具；需要查询或操作公众端数据时使用 gitpilot 工具（写操作会由用户确认）。
- 使用工具前说明意图，完成后总结真实结果，不要虚构未执行的操作。`;

/**
 * Design 的系统角色只保留一次执行规则；具体需求和交付格式放在首轮 prompt 中。
 * 业务意图：把页面目录协议直接交给 Agent，避免它只修改当前页或把新页面写到
 * 无法被页面索引识别的路径中。
 */
const DESIGN_SYSTEM_PROMPT = `你是 GitPilot Design 模式的界面设计助手。
只使用 Design 白名单工具修改当前 snapshot；可以按需使用只读 Web/MCP 工具，但不能使用 Shell、Git 或任意本地文件工具。
 每轮开始先根据真实需求调用 skip_plan 或 update_plan 完成执行方式决策；在决策完成前不要调用 design_apply_patch。只有会改变设计方向或交付边界的关键歧义才调用 design_request_clarification。
只提交 Canvas 节点、布局、文字、路径和资源操作；禁止输出或生成 HTML、CSS、JavaScript、CanvasKit API 调用和本地路径。create_node 必须提供 id、type、name、parentId、childIds、visible、locked、opacity、transform 和 layout；原生矩形类型是 rect（不是 rectangle），颜色放在 paint.fill，圆角放在 paint.cornerRadius，文本必须使用 text 对象。
页面通过 CanvasDesignDocument.pages 管理；节点必须使用现有父节点和资源引用，复杂效果拆成明确的原生节点。
 用户未指定页面底色时默认使用白色或近白色，不要自行使用墨绿色或深色大面积背景；只有用户或项目规范明确要求时才使用深色背景。
每次 patch 后用一句中文说明结果，不要复述内部协议、工具 schema 或场景全文。
为了让 Desktop 能够边绘制边渲染，请按视觉区域多次提交小批次 patch：每批优先包含 1～12 个相关操作，完成页面骨架、导航、主要容器、控件和细节后分别提交；不要等待整页所有节点都完成才调用工具。`;

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
	/** Code 审批只存在 sidecar 内存中，sidecar 重启后全部失效。 */
	const pendingSecurityApprovals = new Map<string, { request: SecurityApprovalRequest; resolve: (decision: ApprovalDecision) => void; sessionId: string }>();
	let securityPolicy: SecurityPolicy = cloneSecurityPolicy(DEFAULT_SECURITY_POLICY);
	let sandboxExecutor: WindowsNativeExecutor | GondolinExecutor = new WindowsNativeExecutor(runtimeHost.cwd);

	const output = (obj: RpcResponse | RpcExtensionUIRequest | object) => {
		writeRawStdout(serializeJsonLine(obj));
	};

	/** Code 模式右侧栏 Git 面板的受限 Git 服务；事件直接透传给 Desktop。 */
	const gitService = new RepositoryService();
	gitService.onEvent((event) => output(event));

	/** git_* 命令薄转发：GitServiceError 转稳定 "CODE: message" 错误文本，业务留在 core/git。 */
	const runGitCommand = async (id: string | undefined, command: RpcCommand["type"], action: () => Promise<object>): Promise<RpcResponse> => {
		try {
			return success(id, command, await action());
		} catch (e) {
			if (isGitServiceError(e)) return error(id, command, `${e.code}: ${e.message}`);
			return error(id, command, e instanceof Error ? e.message : String(e));
		}
	};

	/** 生成中的提交建议；同一时间只允许一次，避免并发模型调用与状态目录竞争。 */
	let commitSuggestionInFlight = false;
	/**
	 * 空提交信息时的一次性模型会话：无扩展、无内置工具、思考关闭，用后即弃。
	 * 会话目录固定在 agentDir 下且每次生成前清空，不产生累积文件。
	 */
	const suggestCommitMessage = async (): Promise<{ message: string }> => {
		if (commitSuggestionInFlight) throw new GitServiceError("OPERATION_IN_PROGRESS", "正在生成提交信息，请稍候");
		commitSuggestionInFlight = true;
		try {
			const summary = await gitService.getStagedDiffSummary(runtimeHost.cwd);
			const workspacePath = join(getAgentDir(), "git-suggest");
			const sessionDir = join(workspacePath, ".session");
			rmSync(sessionDir, { recursive: true, force: true });
			mkdirSync(sessionDir, { recursive: true });
			const services = await createAgentSessionServices({
				cwd: workspacePath,
				agentDir: getAgentDir(),
				modelRuntime: runtimeHost.services.modelRuntime,
				// 提交信息生成不需要任何扩展工具：显式空 extensionFactories 保持会话纯净。
				resourceLoaderOptions: { extensionFactories: [], systemPrompt: COMMIT_MESSAGE_SYSTEM_PROMPT },
			});
			const sessionManager = SessionManager.create(workspacePath, sessionDir, { id: "git-suggest" });
			const created = await createAgentSessionFromServices({
				services,
				sessionManager,
				model: session.model,
				thinkingLevel: "off",
				noTools: "builtin",
			});
			try {
				await created.session.prompt(buildCommitMessagePrompt(summary), { source: "rpc" });
				const lastAssistant = [...created.session.messages].reverse().find((message) => (message as { role?: string }).role === "assistant");
				const text = ((lastAssistant as { content?: Array<{ type?: string; text?: string }> } | undefined)?.content ?? [])
					.filter((part) => part.type === "text")
					.map((part) => part.text ?? "")
					.join("");
				const message = extractCommitMessage(text);
				if (!message) throw new GitServiceError("GIT_FAILED", "AI 未能生成有效的提交信息，请手动填写");
				return { message };
			} finally {
				created.session.dispose();
			}
		} finally {
			commitSuggestionInFlight = false;
		}
	};

	/** 发起 Code 工具审批并等待 Desktop 决策；断连、abort 和超时均默认拒绝。 */
	const requestSecurityApproval = async (request: SecurityApprovalRequest): Promise<ApprovalDecision> => {
		const expiresAt = Math.min(request.expiresAt, Date.now() + 10 * 60 * 1000);
		return await new Promise<ApprovalDecision>((resolveApproval) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const settle = (decision: ApprovalDecision): void => {
				if (timer) clearTimeout(timer);
				pendingSecurityApprovals.delete(request.approvalId);
				resolveApproval(decision);
			};
			pendingSecurityApprovals.set(request.approvalId, { request: { ...request, expiresAt }, resolve: settle, sessionId: request.sessionId });
			timer = setTimeout(() => settle("deny"), Math.max(0, expiresAt - Date.now()));
			output({ type: "approval_required", ...request, expiresAt });
		});
	};

	/** 清理当前任务所有等待中的审批，避免切换任务后旧 Promise 永久挂起。 */
	const denySecurityApprovals = (sessionId?: string): void => {
		for (const [approvalId, approval] of pendingSecurityApprovals) {
			if (!sessionId || approval.sessionId === sessionId) approval.resolve("deny");
		}
	};

	const initializeSandbox = async (policy: SecurityPolicy, cwd = runtimeHost.cwd): Promise<void> => {
		const next = policy.sandboxMode === "gondolin" ? new GondolinExecutor(cwd) : new WindowsNativeExecutor(cwd);
		sandboxExecutor = next;
		await next.initialize(policy);
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
		workspaceChanges: session.workspaceChanges,
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
	 * runId 只在 run 处于 running 时附带：settle 后快照仍保留上一轮 runId，
	 * 空闲期事件（如 auto-plan 在 input 阶段追加的 entry_appended）若原样透传，
	 * Desktop 在 beginExecution 重置后会误把旧 runId 绑定为当前 run，
	 * 导致下一轮事件全部被序号守卫当作旧 run 丢弃。
	 * agent_settled 是终态边界事件，例外保留刚结束 run 的 runId 供 Desktop 收口对齐。
	 */
	const emitEvent = (event: AgentSessionEvent): void => {
		const execution = session.executionSnapshot;
		const enriched: RpcAgentSessionEvent = {
			...event,
			sessionFile: session.sessionFile,
			sessionId: session.sessionId,
			runId: execution.status === "running" || event.type === "agent_settled"
				? execution.runId ?? undefined
				: undefined,
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
	const pendingSkillReloadModes = new Set<SkillMode>();
	const workRoot = join(getAgentDir(), "workspaces");
	const workPath = (taskId: string): string => {
		if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) throw new Error("非法 Work 任务标识");
		return join(workRoot, taskId);
	};
	/**
	 * Work 任务可绑定到用户选择的本地工作空间目录；绑定持久化在 workRoot 下的
	 * .bindings.json，sidecar 重启后任务 cwd 与文件操作仍落回同一目录。
	 */
	const workBindingsFile = join(workRoot, ".bindings.json");
	const loadWorkBindings = (): Record<string, string> => {
		try {
			if (!existsSync(workBindingsFile)) return {};
			const parsed = JSON.parse(readFileSync(workBindingsFile, "utf8"));
			return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
		} catch {
			return {};
		}
	};
	const saveWorkBinding = (taskId: string, workspaceRootPath: string): void => {
		try {
			mkdirSync(workRoot, { recursive: true });
			writeFileSync(workBindingsFile, JSON.stringify({ ...loadWorkBindings(), [taskId]: workspaceRootPath }, null, 2), "utf8");
		} catch {
			// 绑定持久化失败不阻断会话创建，进程内 workSessions 仍持有生效 cwd。
		}
	};
	/** 任务生效工作目录：内存会话 → 持久化绑定 → 默认任务目录。 */
	const resolveWorkRoot = (taskId: string): string => workSessions.get(taskId)?.workspacePath ?? loadWorkBindings()[taskId] ?? workPath(taskId);
	const safeWorkFile = (taskId: string, path: string): string => {
		const root = resolve(resolveWorkRoot(taskId));
		const target = resolve(root, path);
		const rel = relative(root, target);
		if (!rel || rel.startsWith("..") || rel.includes("..\\") || rel.includes("../")) throw new Error("Work 文件路径越界");
		return target;
	};
	/**
	 * Work 文件列表同时包含文本成果和 Office 二进制成果；二进制文件不能按 UTF-8
	 * 读入 RPC/IndexedDB，否则 Desktop 的文本编辑入口可能误写坏 OOXML 压缩包。
	 */
	const snapshotFile = (root: string, target: string): WorkFileSnapshot => {
		const stat = statSync(target);
		const path = relative(root, target).replaceAll("\\", "/");
		const extension = extname(path).slice(1).toLowerCase();
		const binaryTypes: Record<string, string> = { docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", pdf: "application/pdf", zip: "application/zip" };
		const type = binaryTypes[extension] ?? "text/plain";
		return { path, name: path.split("/").pop() ?? path, type, size: stat.size, updatedAt: stat.mtimeMs, ...(type === "text/plain" ? { content: readFileSync(target, "utf8") } : {}) };
	};
	/**
	 * 绑定用户工作空间后目录可能很大，快照跳过常见噪声目录并限制数量与单文件大小，
	 * 避免把整个工作空间读入 RPC/IndexedDB。
	 */
	const WORK_SNAPSHOT_IGNORED_DIRS = new Set([".git", ".session", "node_modules", "dist", "build", "out", ".next", "target", "vendor", "__pycache__"]);
	const WORK_SNAPSHOT_MAX_FILES = 200;
	const WORK_SNAPSHOT_MAX_FILE_SIZE = 512 * 1024;
	const listWorkFiles = (root: string): WorkFileSnapshot[] => {
		if (!existsSync(root)) return [];
		const files: WorkFileSnapshot[] = [];
		const visit = (dir: string) => {
			for (const name of readdirSync(dir)) {
				if (files.length >= WORK_SNAPSHOT_MAX_FILES) return;
				const target = join(dir, name);
				const stat = statSync(target);
				if (stat.isDirectory()) {
					if (!WORK_SNAPSHOT_IGNORED_DIRS.has(name)) visit(target);
				} else if (stat.size <= WORK_SNAPSHOT_MAX_FILE_SIZE) files.push(snapshotFile(root, target));
			}
		};
		visit(root);
		return files;
	};
	const createWorkSession = async (taskId: string, workspaceRoot?: string) => {
		const existing = workSessions.get(taskId);
		if (existing) return existing;
		// 只接受绝对路径作为工作空间绑定，相对路径会被静默忽略并回落到默认任务目录。
		const boundRoot = workspaceRoot && isAbsolute(workspaceRoot) ? resolve(workspaceRoot) : loadWorkBindings()[taskId];
		const workspacePath = boundRoot ?? workPath(taskId);
		if (boundRoot && loadWorkBindings()[taskId] !== boundRoot) saveWorkBinding(taskId, boundRoot);
		// 会话数据始终放 agentDir 任务目录，避免在用户选择的工作空间里写入 .session。
		const sessionDir = join(workPath(taskId), ".session");
		mkdirSync(workspacePath, { recursive: true });
		mkdirSync(sessionDir, { recursive: true });
		const sessionManager = SessionManager.create(workspacePath, sessionDir, { id: `work-${taskId}` });
		const services = await createAgentSessionServices({
			cwd: workspacePath,
			agentDir: getAgentDir(),
			// Work 的 cwd、会话和工具仍然独立，但认证/provider 必须复用主 RPC 会话，避免已登录凭据只在 Code 生效。
			modelRuntime: runtimeHost.services.modelRuntime,
			// Work 保留受限的本地工具集合，同时通过统一工厂获得 Web 与按模式授权的 MCP 工具。
			// 用 Work 专属提示词替换 Coding Agent 默认提示词，避免 Work 回复成 Code 的编码助手。
			resourceLoaderOptions: { extensionFactories: createModeExtensions("work", workspacePath), systemPrompt: WORK_SYSTEM_PROMPT, skillMode: "work" },
		});
		// tools 参数是白名单语义：一旦传入，customTools 与 Web/MCP 扩展注册的工具会在注册阶段
		// 被整体过滤（曾导致 office_create_document “技能已安装但工具未挂载”）。
		// 这里只用 excludeTools 禁 bash，保住全部 Work 自定义与扩展工具；
		// 默认激活集只有 read/edit/write，创建后按注册表全集统一激活（bash 已被排除在外）。
		const created = await createAgentSessionFromServices({ services, sessionManager, model: session.model, thinkingLevel: session.thinkingLevel, excludeTools: ["bash"], customTools: createGitPilotWorkToolDefinitions(taskId, workspacePath) });
		created.session.setActiveToolsByName(created.session.getAllTools().map((tool) => tool.name));
		const record = { session: created.session, workspacePath };
		workSessions.set(taskId, record);
		created.session.subscribe((event) => {
			if (event.type === "message_update") {
				const update = event.assistantMessageEvent as { type?: string; delta?: string } | undefined;
				if (update?.type === "text_delta" && update.delta) output({ type: "work_delta", taskId, delta: update.delta });
				// 与 Code 模式对齐：真实思考增量单独转发，Desktop 在正文前渲染“思考过程”块。
				if (update?.type === "thinking_delta" && update.delta) output({ type: "work_thinking_delta", taskId, delta: update.delta });
			}
			if (event.type === "message_end") {
				// 正文段边界：Desktop 依据该事件把流式文本收口为一条 assistant 消息，
				// 实现“正文 → 执行过程 → 正文”按真实顺序交错落盘与回显。
				const message = event.message as { role?: string; content?: Array<{ type?: string; text?: string }> } | undefined;
				if (message?.role === "assistant") {
					const text = (message.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
					if (text.trim()) output({ type: "work_message_end", taskId, text });
				}
			}
			if (event.type === "tool_execution_start") output({ type: "work_tool_started", taskId, toolCallId: event.toolCallId, toolName: event.toolName, args: event.args });
			if (event.type === "tool_execution_update") output({ type: "work_tool_updated", taskId, toolCallId: event.toolCallId, toolName: event.toolName, partialResult: event.partialResult });
			if (event.type === "tool_execution_end") output({ type: "work_tool_completed", taskId, toolCallId: event.toolCallId, toolName: event.toolName, result: event.result, isError: event.isError });
			if (event.type === "agent_settled") {
				output({ type: "work_file_snapshot", taskId, files: listWorkFiles(workspacePath) });
				void flushSkillReload("work");
			}
		});
		return record;
	};
	const getWorkSession = async (taskId: string, workspaceRoot?: string) => workSessions.get(taskId) ?? await createWorkSession(taskId, workspaceRoot);
	const reloadMcpSessions = async (): Promise<void> => {
		await session.reload();
		for (const work of workSessions.values()) await work.session.reload();
		for (const designSession of designSessions.values()) await designSession.reload();
	};
	const skillModeBusy = (mode: SkillMode): boolean => {
		if (mode === "code") return session.isStreaming;
		if (mode === "work") return [...workSessions.values()].some((work) => work.session.isStreaming);
		return [...designRuns.values()].some((run) => run.active) || [...designSessions.values()].some((designSession) => designSession.isStreaming);
	};
	const reloadSkillMode = async (mode: SkillMode): Promise<void> => {
		if (mode === "code") {
			await session.reload();
			return;
		}
		if (mode === "work") {
			for (const work of workSessions.values()) await work.session.reload();
			return;
		}
		for (const designSession of designSessions.values()) await designSession.reload();
	};
	const reloadSkillSessions = async (): Promise<{ reloadedModes: SkillMode[]; deferredModes: SkillMode[] }> => {
		const reloadedModes: SkillMode[] = [];
		const deferredModes: SkillMode[] = [];
		for (const mode of ["code", "work", "design"] as const) {
			if (skillModeBusy(mode)) {
				pendingSkillReloadModes.add(mode);
				deferredModes.push(mode);
				continue;
			}
			await reloadSkillMode(mode);
			reloadedModes.push(mode);
		}
		return { reloadedModes, deferredModes };
	};
	const flushSkillReload = async (mode: SkillMode): Promise<void> => {
		if (!pendingSkillReloadModes.has(mode) || skillModeBusy(mode)) return;
		pendingSkillReloadModes.delete(mode);
		await reloadSkillMode(mode);
	};
	const signalCleanupHandlers: Array<() => void> = [];

	// Design Mode 以项目为边界保存工作区，避免多个项目共享同一个随机 designId 或文件目录。
	const designSnapshots = new Map<string, DesignRpcSnapshot>();
	const designProjects = new Map<string, string>();
	const designSessions = new Map<string, import("../../core/agent-session.ts").AgentSession>();
	const designSessionManagers = new Map<string, SessionManager>();
	type DesignRun = {
		designId: string;
		requestId: string;
		runId: string;
		pageId: string;
		projectPath: string;
		sequence: number;
		active: boolean;
		baseRevisionId: string;
		workingRevisionId: string;
		/** 当前 run 的内存 draft；canonical design.json 只在 settle 时更新。 */
		draftScene: CanvasDesignDocument;
		operationCount: number;
		hasChanges: boolean;
		lastSummary?: string;
		/** 当前 Agent 所处阶段，供项目切换或 Desktop 重连后恢复执行面板。 */
		phase: DesignRunRecoveryState["phase"];
		/** 新回合开始时要求模型先用 skip_plan/update_plan 完成一次结构化执行方式决策。 */
		planDecisionPending: boolean;
		/** 仅保留审批/澄清恢复所需的轻量元数据，避免把完整 patch 长期挂在运行态。 */
		pendingApproval?: { approvalId: string; reason: string; pageId: string };
		pendingClarification?: { clarificationId: string; question: string; context?: string; options: string[] };
	};
	const designRuns = new Map<string, DesignRun>();
	const designApprovals = new Map<string, { designId: string; resolve: (approved: boolean) => void }>();
	const designClarifications = new Map<string, { designId: string; resolve: (answer: string) => void }>();
	/**
	 * 审批与澄清的等待超时。业务意图：这两类暂停点依赖桌面端回传响应才会 resolve，
	 * 一旦事件因竞态被桌面端终态守卫丢弃，用户永远无法看到卡片，后端 Promise 将永久挂起，
	 * 进而导致 Agent 循环不退出、run.active 永久为 true，后续所有 design_prompt 都会报"正在执行中"。
	 * 设 10 分钟超时兜底：既给用户充足时间审阅高风险 patch 或回答澄清，又保证悬挂状态最终能自愈收口。
	 */
	const DESIGN_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
	const DESIGN_CLARIFICATION_TIMEOUT_MS = 10 * 60 * 1000;
	/**
	 * 幂等表只保存操作摘要，不保存完整 snapshot。
	 * 业务意图：每个 patch 的完整快照都包含全部文件；若长期缓存，会让连续 patch
	 * 在 sidecar 内叠加多份项目正文，成为 OOM 的独立来源。
	 */
	type AppliedDesignOperation = Pick<DesignPatchResult, "operationId" | "revisionId" | "summary"> & { changedPaths: string[] };
	const appliedDesignOperations = new Map<string, AppliedDesignOperation>();
	const MAX_APPLIED_DESIGN_OPERATIONS = 256;
	const normalizeDesignProjectPath = (projectPath?: string): string => {
		const normalized = resolve(projectPath || runtimeHost.cwd);
		if (!existsSync(normalized) || !statSync(normalized).isDirectory()) throw new Error("Design 项目目录不存在");
		return normalized;
	};
	const designProjectId = (projectPath: string): string => crypto.createHash("sha256").update(projectPath.toLowerCase()).digest("hex").slice(0, 20);
	/** DesignId 在协议上是 workspace 内身份，进程内缓存必须再带 projectId，避免项目切换串数据。 */
	const designKey = (projectPath: string, designId: string): string => `${designProjectId(normalizeDesignProjectPath(projectPath))}:${designId}`;
	/**
	 * Design 的正式产物和项目运行环境共享项目根目录；.gitpilot 只保存索引、规范、历史快照和会话。
	 * 业务意图：预览、Desktop 文件树、文件管理器和最终交付都读取同一份 canonical 文件。
	 */
	const designRoot = (projectPath: string): string => join(normalizeDesignProjectPath(projectPath), ".gitpilot");
	/** 原生 Canvas 工作区的隔离目录；旧 HTML 工作区不在这里做迁移或覆盖。 */
	const nativeDesignRoot = (projectPath: string, designId: string): string => join(designRoot(projectPath), "design", designId);
	const nativeDesignManifestPath = (projectPath: string, designId: string): string => join(nativeDesignRoot(projectPath, designId), "manifest.json");
	const nativeDesignDocumentPath = (projectPath: string, designId: string): string => join(nativeDesignRoot(projectPath, designId), "design.json");
	const legacyDesignRoot = (projectPath: string): string => join(designRoot(projectPath), "design");
	const designMetadataPath = (projectPath: string): string => join(designRoot(projectPath), "design.json");
	const projectGuidelinesPath = (projectPath: string): string => join(designRoot(projectPath), "project-guidelines.json");
	const designSessionPath = (designId: string, projectPath: string): string => join(nativeDesignRoot(projectPath, designId), ".session");
	const DESIGN_UI_MESSAGE_ENTRY = "gitpilot.design-ui-message.v1";
	const designConversationPath = (designId: string, projectPath: string): string => join(designSessionPath(designId, projectPath), "conversation.jsonl");
	/** 原生 Canvas 会话只写入 <designId>/.session，不读取或迁移旧 HTML 会话。 */
	const migrateDesignConversation = (_designId: string, _projectPath: string): void => { /* 保留调用点，原生布局无需迁移。 */ };
	const openDesignSessionManager = (designId: string, projectPath: string): SessionManager => {
		const normalizedProjectPath = normalizeDesignProjectPath(projectPath);
		const sessionDir = designSessionPath(designId, normalizedProjectPath);
		mkdirSync(sessionDir, { recursive: true });
		migrateDesignConversation(designId, normalizedProjectPath);
		return SessionManager.open(designConversationPath(designId, normalizedProjectPath), sessionDir, sessionDir);
	};
	const getDesignUiMessages = (manager: SessionManager): DesignRpcMessage[] => {
		const byId = new Map<string, DesignRpcMessage>();
		for (const entry of manager.getEntries()) {
			if (entry.type !== "custom" || entry.customType !== DESIGN_UI_MESSAGE_ENTRY || !entry.data || typeof entry.data !== "object") continue;
			const message = entry.data as DesignRpcMessage;
			if (typeof message.id !== "string" || typeof message.kind !== "string" || (typeof (message as { text?: unknown }).text !== "string" && typeof (message as { summary?: unknown }).summary !== "string")) continue;
			// custom entry 采用追加写入；状态变化（例如 queued -> sent）以同 ID 的最后一条为准，
			// 这样旧 localStorage 迁移和重复 RPC 都不会在 Desktop 生成重复气泡。
			byId.set(message.id, message);
		}
		return [...byId.values()];
	};
	const appendDesignUiMessage = (cacheKey: string, message: DesignRpcMessage): void => {
		const manager = designSessionManagers.get(cacheKey);
		if (!manager) return;
		const existing = getDesignUiMessages(manager).find((candidate) => candidate.id === message.id);
		if (existing && JSON.stringify(existing) === JSON.stringify(message)) return;
		manager.appendCustomEntry(DESIGN_UI_MESSAGE_ENTRY, message);
		// UI 首条用户消息发生在 assistant 回复之前，强制落盘才能在中途退出后恢复。
		manager.flushToDisk();
	};
	const releaseIdleDesignSessionManager = (cacheKey: string): void => {
		// Agent 运行期间仍需保留 manager；任务结束或只读查询完成后让完整 JSONL
		// entries 脱离内存，下一次访问再从磁盘打开。
		if (!designSessions.has(cacheKey)) designSessionManagers.delete(cacheKey);
	};
	const loadProjectGuidelines = (projectPath: string): DesignProjectGuidelines => {
		try { return normalizeProjectGuidelines(JSON.parse(readFileSync(projectGuidelinesPath(projectPath), "utf8"))); } catch { return defaultProjectGuidelines(); }
	};
	/** 新建工作区直接进入无限画板；旧 HTML 模板只保留在历史代码中且不会被 Design 路径调用。 */
	const demoDesignSnapshot = (designId: string, name = "GitPilot Design"): DesignRpcSnapshot => {
		const canvasSize = 100000;
		const rootId = "canvas-root";
		const page = { id: "canvas", name: "无限画板", route: "", rootNodeId: rootId, width: canvasSize, height: canvasSize, background: { kind: "solid", color: "#ffffff" }, isInfinite: true };
		const layout = { mode: "absolute", width: canvasSize, height: canvasSize, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: "column", align: "start", justify: "start" };
		const root: Record<string, unknown> = { id: rootId, type: "page", name: "无限画板", parentId: null, childIds: [], visible: true, locked: false, opacity: 1, layout, transform: { x: 0, y: 0, width: canvasSize, height: canvasSize, rotation: 0, scaleX: 1, scaleY: 1 } };
		const canvas: CanvasDesignDocument = { schemaVersion: 2, id: designId, name, revision: 1, updatedAt: new Date().toISOString(), entryPageId: page.id, pages: [page], nodes: { [rootId]: root }, assets: {} };
		return { document: { id: designId, name, version: 1, schemaVersion: 2, entryPageId: page.id, pages: [{ id: page.id, name: page.name, route: page.route, rootNodeId: page.rootNodeId, entryFileId: "", fileIds: [] }], files: [], revisions: [{ id: "rev-1", prompt: "创建原生 Canvas 设计工作区", summary: "已创建 CanvasKit 原生设计初稿", createdAt: canvas.updatedAt, kind: "initial" }], canvas }, files: [] };
	};
	/** Design 正式文件的根目录就是项目根目录；designId 只用于校验和元数据关联。 */
	const designPath = (designId: string, projectPath?: string) => { if (!/^[a-zA-Z0-9_-]+$/.test(designId)) throw new Error("非法 Design 标识"); return nativeDesignRoot(normalizeDesignProjectPath(projectPath || designProjects.get(designId) || runtimeHost.cwd), designId); };
	const revisionPath = (designId: string, revisionId: string, projectPath?: string): string => {
		if (!/^[a-zA-Z0-9_-]+$/.test(revisionId)) throw new Error("非法 Design 修订标识");
		return join(designRoot(projectPath || designProjects.get(designId) || runtimeHost.cwd), "revisions", revisionId);
	};
	const designCacheKey = (designId: string, projectPath?: string): string => designKey(normalizeDesignProjectPath(projectPath || designProjects.get(designId)), designId);
	/** Design snapshot 与导出包都使用临时文件替换，避免 Desktop 读到半写入结果。 */
	const atomicWrite = (target: string, content: string | Uint8Array): void => {
		const temporary = `${target}.${crypto.randomUUID()}.tmp`;
		try {
			if (typeof content === "string") writeFileSync(temporary, content, "utf8");
			else writeFileSync(temporary, content);
			renameSync(temporary, target);
		} catch (error) {
			try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* 保留原始写入错误 */ }
			throw error;
		}
	};
	const safeDraftRunId = (runId: string): string => {
		if (!/^design-run-[a-zA-Z0-9_-]+$/.test(runId)) throw new Error("非法 Design draft runId");
		return runId;
	};
	const draftRoot = (projectPath: string, designId: string, runId: string): string => join(nativeDesignRoot(projectPath, designId), "drafts", safeDraftRunId(runId));
	const draftBasePath = (projectPath: string, designId: string, runId: string): string => join(draftRoot(projectPath, designId, runId), "base.json");
	const draftOperationsPath = (projectPath: string, designId: string, runId: string): string => join(draftRoot(projectPath, designId, runId), "operations.jsonl");
	const draftCheckpointPath = (projectPath: string, designId: string, runId: string): string => join(draftRoot(projectPath, designId, runId), "checkpoint.json");
	type DraftJournalRecord = { operationId: string; sequence: number; operationIndex: number; pageId: string; summary: string; transaction: { transactionId: string; baseRevision: number; source: "ai" | "system"; operations: CanvasDesignOperation[]; summary: string; createdAt: string } };
	const createDraftJournal = (run: DesignRun): void => {
		const root = draftRoot(run.projectPath, run.designId ?? "", run.runId);
		mkdirSync(root, { recursive: true });
		atomicWrite(draftBasePath(run.projectPath, run.designId ?? "", run.runId), JSON.stringify({ designId: run.designId, runId: run.runId, requestId: run.requestId, baseRevisionId: run.baseRevisionId, draftRevisionId: run.workingRevisionId, canvas: run.draftScene }, null, 2));
		atomicWrite(draftOperationsPath(run.projectPath, run.designId ?? "", run.runId), "");
	};
	const appendDraftJournal = (run: DesignRun, record: DraftJournalRecord): void => {
		const path = draftOperationsPath(run.projectPath, run.designId ?? "", run.runId);
		if (!existsSync(path)) createDraftJournal(run);
		appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
	};
	/** checkpoint 必须在内存 draft 更新后写入，确保 checkpoint 的 operationCount 与 scene 一致。 */
	const writeDraftCheckpoint = (run: DesignRun, record: DraftJournalRecord): void => {
		if (record.operationIndex % 8 !== 0) return;
		atomicWrite(draftCheckpointPath(run.projectPath, run.designId ?? "", run.runId), JSON.stringify({ runId: run.runId, operationCount: record.operationIndex, lastSequence: record.sequence, canvas: run.draftScene }, null, 2));
	};
	const removeDraftJournal = (projectPath: string, designId: string, runId: string): void => {
		rmSync(draftRoot(projectPath, designId, runId), { recursive: true, force: true });
	};
	const readDraftRecords = (projectPath: string, designId: string, runId: string): DraftJournalRecord[] => {
		const path = draftOperationsPath(projectPath, designId, runId);
		if (!existsSync(path)) return [];
		const records: DraftJournalRecord[] = [];
		let lastSequence = 0;
		for (const line of readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean)) {
			const record = JSON.parse(line) as DraftJournalRecord;
			if (!record || typeof record.operationId !== "string" || typeof record.sequence !== "number" || !Number.isInteger(record.sequence) || record.sequence <= lastSequence || typeof record.operationIndex !== "number" || record.operationIndex !== records.length + 1 || typeof record.pageId !== "string" || !record.transaction || record.transaction.transactionId !== record.operationId || !Array.isArray(record.transaction.operations) || !record.transaction.operations.every(isDesignPatchOperation)) throw new Error("Design 草稿 journal 记录无效或顺序断裂");
			lastSequence = record.sequence;
			records.push(record);
		}
		return records;
	};
	const readDraftMetadata = (projectPath: string, designId: string, runId: string, status: "active" | "orphaned"): DesignDraftMetadata | null => {
		try {
			const base = JSON.parse(readFileSync(draftBasePath(projectPath, designId, runId), "utf8")) as Record<string, unknown>;
			const operations = readDraftRecords(projectPath, designId, runId);
			const last = operations.at(-1);
			if (typeof base.requestId !== "string" || typeof base.baseRevisionId !== "string" || typeof base.draftRevisionId !== "string") return null;
			return { status, runId, requestId: base.requestId, baseRevisionId: base.baseRevisionId, draftRevisionId: base.draftRevisionId, operationCount: operations.length, lastSequence: last?.sequence ?? 0, ...(typeof last?.summary === "string" ? { lastSummary: last.summary } : {}) };
		} catch { return null; }
	};
	const listDraftMetadata = (projectPath: string, designId: string): DesignDraftMetadata | undefined => {
		const root = join(nativeDesignRoot(projectPath, designId), "drafts");
		if (!existsSync(root)) return undefined;
		const candidates = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^design-run-[a-zA-Z0-9_-]+$/.test(entry.name)).map((entry) => {
			const active = designRuns.get(designKey(projectPath, designId));
			return readDraftMetadata(projectPath, designId, entry.name, active?.runId === entry.name && active.active ? "active" : "orphaned");
		}).filter((item): item is DesignDraftMetadata => Boolean(item));
		return candidates.at(-1);
	};
	const nativeCanvasFromSnapshot = (snapshot: DesignRpcSnapshot): CanvasDesignDocument => {
		const canvas = snapshot.document.canvas;
		if (!canvas || typeof canvas !== "object" || Array.isArray(canvas)) throw new Error("旧 HTML/CSS/JS Design 工作区不兼容；请新建原生 Canvas 工作区");
		return normalizeNativeCanvasDocument(canvas);
	};
	const validateNativeCanvasDocument = (canvas: CanvasDesignDocument): void => {
		if (canvas.schemaVersion !== 2 || typeof canvas.id !== "string" || !Array.isArray(canvas.pages) || !canvas.nodes || typeof canvas.nodes !== "object" || !canvas.assets || typeof canvas.assets !== "object") throw new Error("Canvas Design schema 无效");
		// 只拒绝真正的源码/预览注入，不禁止设计稿正文出现“HTML/CSS/JavaScript”等普通词语。
		// 业务意图：节点名称、按钮文案和规范说明都是用户可见文本，不能因为关键词误伤整个场景。
		const forbiddenKey = /^(?:html|css|javascript|srcDoc|innerHTML|postMessage)$/i;
		const forbiddenMarkup = /<\/?(?:html|script|style|iframe|object|embed|base)\b|(?:javascript|data:text\/html)\s*:/i;
		const forbiddenDomApi = /\b(?:document|window)\.(?:createElement|querySelector|querySelectorAll|body|documentElement|innerHTML|postMessage)\b/i;
		const scan = (value: unknown, key = ""): void => {
			if (typeof value === "string") {
				if (forbiddenKey.test(key) || forbiddenMarkup.test(value) || forbiddenDomApi.test(value)) throw new Error("Canvas 场景禁止包含 HTML、CSS、JavaScript 或 DOM 预览内容");
				return;
			}
			if (Array.isArray(value)) value.forEach((item) => scan(item, key));
			else if (value && typeof value === "object") Object.entries(value).forEach(([childKey, childValue]) => scan(childValue, childKey));
		};
		// guidelines 是预设/项目的设计说明，不是 Canvas 渲染载荷；其中允许出现
		// HTML、CSS 等对设计师有意义的术语或历史参考示例，不能据此拒绝整个场景。
		// 真正的节点、资源和渲染字段仍继续执行上述源码/DOM 注入检查。
		const renderDocument = { ...canvas };
		delete renderDocument.guidelines;
		scan(renderDocument);
		const pageIds = new Set<string>();
		const rootIds = new Set<string>();
		if (typeof canvas.entryPageId !== "string") throw new Error("Canvas entryPageId 无效");
		for (const page of canvas.pages) {
			if (!page || typeof page !== "object" || typeof page.id !== "string" || !page.id || typeof page.rootNodeId !== "string" || !canvas.nodes[page.rootNodeId]) throw new Error("Canvas 页面根节点引用无效");
			if (!pageIds.add(page.id)) throw new Error(`Canvas 页面标识重复：${page.id}`);
			if (!rootIds.add(page.rootNodeId)) throw new Error(`Canvas 页面根节点重复：${page.rootNodeId}`);
			if (canvas.nodes[page.rootNodeId].parentId !== null) throw new Error(`Canvas 页面根节点必须是顶层节点：${page.rootNodeId}`);
		}
		if (!pageIds.has(canvas.entryPageId)) throw new Error("Canvas entryPageId 不存在");
		const checkFontReference = (value: unknown, nodeId: string): void => {
			if (!value || typeof value !== "object" || Array.isArray(value)) return;
			const fontAssetId = (value as Record<string, unknown>).fontAssetId;
			if (fontAssetId === undefined || fontAssetId === null) return;
			if (typeof fontAssetId !== "string" || !canvas.assets[fontAssetId] || !String((canvas.assets[fontAssetId] as Record<string, unknown>).mimeType ?? "").startsWith("font/")) throw new Error(`Canvas 字体资源引用无效：${nodeId}`);
		};
		for (const [nodeId, node] of Object.entries(canvas.nodes)) {
			if (node.id !== nodeId || typeof node.type !== "string" || !Array.isArray(node.childIds)) throw new Error(`Canvas 节点无效：${nodeId}`);
			if (!isCanonicalCanvasNode(node)) throw new Error(`Canvas 节点 ${nodeId} 缺少可渲染的 visible、transform 或 layout 字段`);
			const childIds = node.childIds as unknown[];
			const uniqueChildren = new Set<string>();
			for (const childId of childIds) {
				if (typeof childId !== "string" || !uniqueChildren.add(childId) || !canvas.nodes[childId] || canvas.nodes[childId].parentId !== nodeId) throw new Error(`Canvas 子节点引用无效或重复：${nodeId} -> ${String(childId)}`);
			}
			if (node.parentId !== null && (typeof node.parentId !== "string" || !canvas.nodes[node.parentId])) throw new Error(`Canvas 父节点引用无效：${nodeId}`);
			if (node.parentId === null && !rootIds.has(nodeId)) throw new Error(`Canvas 存在未挂载的顶层节点：${nodeId}`);
			if (typeof node.parentId === "string") {
				const parentChildren = Array.isArray(canvas.nodes[node.parentId].childIds) ? canvas.nodes[node.parentId].childIds as unknown[] : [];
				if (parentChildren.filter((childId) => childId === nodeId).length !== 1) throw new Error(`Canvas 父子引用不一致：${nodeId}`);
			}
			if (node.type === "image") {
				const image = node.image;
				const assetId = image && typeof image === "object" && !Array.isArray(image) ? (image as Record<string, unknown>).assetId : undefined;
				const asset = typeof assetId === "string" ? canvas.assets[assetId] as Record<string, unknown> | undefined : undefined;
				if (!asset || !String(asset.mimeType ?? "").startsWith("image/")) throw new Error(`Canvas 图片资源引用无效：${nodeId}`);
			}
			if (node.type === "text" && (!node.text || typeof node.text !== "object" || Array.isArray(node.text))) throw new Error(`Canvas 文本节点缺少规范 text 对象：${nodeId}`);
			const text = node.text;
			checkFontReference(text, nodeId);
			if (text && typeof text === "object" && !Array.isArray(text)) for (const run of ((text as Record<string, unknown>).runs as unknown[] ?? [])) checkFontReference(run, nodeId);
			const prototype = node.prototype;
			if (prototype && typeof prototype === "object" && !Array.isArray(prototype) && typeof (prototype as Record<string, unknown>).targetId === "string" && !canvas.nodes[(prototype as Record<string, unknown>).targetId as string]) throw new Error(`Canvas 原型目标节点不存在：${nodeId}`);
		}
		for (const [assetId, asset] of Object.entries(canvas.assets)) {
			if (!asset || typeof asset !== "object" || Array.isArray(asset) || (asset as Record<string, unknown>).id !== assetId || typeof (asset as Record<string, unknown>).mimeType !== "string") throw new Error(`Canvas 资源定义无效：${assetId}`);
			if (String((asset as Record<string, unknown>).mimeType).startsWith("font/") && typeof (asset as Record<string, unknown>).fontFamily !== "string") throw new Error(`Canvas 字体资源缺少 fontFamily：${assetId}`);
		}
		for (const nodeId of Object.keys(canvas.nodes)) {
			const seen = new Set<string>();
			let current: string | null = nodeId;
			while (current) {
				if (seen.has(current)) throw new Error("Canvas 节点树不能包含循环引用");
				seen.add(current);
				current = (canvas.nodes[current]?.parentId as string | null | undefined) ?? null;
			}
		}
	};
	const applyNativeCanvasOperations = (source: CanvasDesignDocument, operations: CanvasDesignOperation[]): CanvasDesignDocument => {
		const normalizedSource = normalizeNativeCanvasDocument(source);
		const next = structuredClone(normalizedSource) as CanvasDesignDocument;
		const normalizedOperations = normalizeCanvasOperations(operations, normalizedSource);
		const parentFor = (parentId: string): Record<string, unknown> => {
			const parent = next.nodes[parentId];
			if (!parent || !["page", "frame", "group", "rect", "instance"].includes(String(parent.type))) throw new Error(`Canvas 父节点不可包含子节点：${parentId}`);
			return parent;
		};
		const assertNoCycle = (nodeId: string, parentId: string): void => {
			let current: string | null = parentId;
			while (current) { if (current === nodeId) throw new Error("Canvas 节点不能移动到自身或子孙节点下"); current = (next.nodes[current]?.parentId as string | null | undefined) ?? null; }
		};
		const remove = (nodeId: string): void => { const node = next.nodes[nodeId]; if (!node) return; for (const childId of node.childIds as string[]) remove(childId); delete next.nodes[nodeId]; };
		for (const operation of normalizedOperations) {
			switch (operation.op) {
				case "create_node": {
					if (next.nodes[operation.node.id as string]) throw new Error(`Canvas 节点已存在：${String(operation.node.id)}`);
					const parent = parentFor(operation.parentId);
					assertNoCycle(String(operation.node.id), operation.parentId);
					const node = structuredClone(operation.node);
					node.parentId = operation.parentId;
					node.childIds = Array.isArray(node.childIds) ? node.childIds : [];
					next.nodes[String(node.id)] = node;
					const children = parent.childIds as string[];
					children.splice(Math.max(0, Math.min(operation.index ?? children.length, children.length)), 0, String(node.id));
					break;
				}
				case "update_node": {
					const target = next.nodes[operation.nodeId];
					if (!target) throw new Error(`Canvas 节点不存在：${operation.nodeId}`);
					if ("id" in operation.changes || "parentId" in operation.changes || "childIds" in operation.changes) throw new Error("Canvas update_node 不能直接改写图层关系");
					next.nodes[operation.nodeId] = { ...target, ...structuredClone(operation.changes), id: target.id, parentId: target.parentId, childIds: target.childIds };
					break;
				}
				case "delete_node": {
					const target = next.nodes[operation.nodeId];
					if (!target || !target.parentId) throw new Error("Canvas 页面根节点不能删除");
					const parentId = typeof target.parentId === "string" ? target.parentId : null;
					const parent = parentId ? next.nodes[parentId] : undefined;
					if (parent) parent.childIds = (parent.childIds as string[]).filter((id) => id !== operation.nodeId);
					remove(operation.nodeId);
					break;
				}
				case "move_node": {
					const target = next.nodes[operation.nodeId];
					if (!target) throw new Error(`Canvas 节点不存在：${operation.nodeId}`);
					const parent = parentFor(operation.parentId);
					assertNoCycle(operation.nodeId, operation.parentId);
					const previousParentId = typeof target.parentId === "string" ? target.parentId : null;
					if (previousParentId && next.nodes[previousParentId]) next.nodes[previousParentId].childIds = (next.nodes[previousParentId].childIds as string[]).filter((id) => id !== operation.nodeId);
					target.parentId = operation.parentId;
					(parent.childIds as string[]).splice(Math.max(0, Math.min(operation.index, (parent.childIds as string[]).length)), 0, operation.nodeId);
					break;
				}
				case "update_text": {
					const target = next.nodes[operation.nodeId];
					if (!target || target.type !== "text") throw new Error(`Canvas 文本节点不存在：${operation.nodeId}`);
					target.text = structuredClone(operation.text);
					break;
				}
				case "update_path": {
					const target = next.nodes[operation.nodeId];
					if (!target || target.type !== "path") throw new Error(`Canvas 路径节点不存在：${operation.nodeId}`);
					target.path = structuredClone(operation.path);
					break;
				}
				case "attach_asset": {
					const target = next.nodes[operation.nodeId];
					if (!target || target.type !== "image" || !next.assets[operation.assetId]) throw new Error(`Canvas 图片资源不存在：${operation.assetId}`);
					target.image = { ...((target.image as Record<string, unknown> | undefined) ?? { fit: "contain" }), assetId: operation.assetId };
					break;
				}
			}
		}
		next.revision += 1;
		next.updatedAt = new Date().toISOString();
		validateNativeCanvasDocument(next);
		return next;
	};
	const persistProjectGuidelines = (projectPath: string, guidelines: DesignProjectGuidelines): DesignProjectGuidelines => {
		const normalized = normalizeProjectGuidelines(guidelines);
		const serialized = JSON.stringify(normalized, null, 2);
		if (serialized.length > 200_000) throw new Error("项目 Design 规范文件过大");
		mkdirSync(designRoot(projectPath), { recursive: true });
		atomicWrite(projectGuidelinesPath(projectPath), serialized);
		return normalized;
	};
	/**
	 * 将 Design 快照落盘；changedPaths 只用于实时 patch 热路径。
	 * 业务意图：manifest 仍然原子更新，但未改动的大文件不应在每个 patch 中重复写入。
	 */
	const persistDesign = (snapshot: DesignRpcSnapshot, projectPath?: string): void => {
		const normalizedProjectPath = normalizeDesignProjectPath(projectPath || snapshot.context?.projectPath);
		if (snapshot.document.canvas) {
			const canvas = nativeCanvasFromSnapshot(snapshot);
			validateNativeCanvasDocument(canvas);
			const root = nativeDesignRoot(normalizedProjectPath, String(snapshot.document.id));
			mkdirSync(join(root, "assets"), { recursive: true });
			mkdirSync(join(root, "fonts"), { recursive: true });
			mkdirSync(join(root, "revisions"), { recursive: true });
			mkdirSync(join(root, ".session"), { recursive: true });
			const revisions = Array.isArray(snapshot.document.revisions) ? snapshot.document.revisions as Array<Record<string, unknown>> : [];
			const manifest = { schemaVersion: 2, designId: canvas.id, name: canvas.name, revision: canvas.revision, pageCount: canvas.pages.length, updatedAt: canvas.updatedAt, revisions };
			atomicWrite(nativeDesignManifestPath(normalizedProjectPath, String(snapshot.document.id)), JSON.stringify(manifest, null, 2));
			atomicWrite(nativeDesignDocumentPath(normalizedProjectPath, String(snapshot.document.id)), JSON.stringify(canvas, null, 2));
			const currentRevisionId = typeof revisions.at(-1)?.id === "string" ? String(revisions.at(-1)?.id) : `rev-${canvas.revision}`;
			const revisionRoot = join(root, "revisions", currentRevisionId);
			if (!existsSync(join(revisionRoot, "design.json"))) {
				mkdirSync(revisionRoot, { recursive: true });
				atomicWrite(join(revisionRoot, "design.json"), JSON.stringify(canvas, null, 2));
				atomicWrite(join(revisionRoot, "snapshot.json"), JSON.stringify({ schemaVersion: 2, revisionId: currentRevisionId, document: snapshot.document }, null, 2));
			}
			designProjects.set(String(snapshot.document.id), normalizedProjectPath);
			return;
		}
		throw new Error("Canvas Design 快照无效：旧 HTML/CSS/JS 工作区不支持继续写入，请新建原生 Canvas 工作区");
	};
	const loadDesignSnapshot = (designId: string, projectPath?: string): DesignRpcSnapshot | undefined => {
		const normalizedProjectPath = normalizeDesignProjectPath(projectPath);
		const nativeRoot = nativeDesignRoot(normalizedProjectPath, designId);
		const nativeDocumentPath = nativeDesignDocumentPath(normalizedProjectPath, designId);
		if (existsSync(nativeRoot) || existsSync(nativeDocumentPath)) {
			if (!existsSync(nativeDocumentPath)) throw new Error("Canvas Design 工作区缺少 design.json");
			const canvas = normalizeNativeCanvasDocument(JSON.parse(readFileSync(nativeDocumentPath, "utf8")));
			validateNativeCanvasDocument(canvas);
			let manifest: { revisions?: unknown } = {};
			try { manifest = JSON.parse(readFileSync(nativeDesignManifestPath(normalizedProjectPath, designId), "utf8")) as { revisions?: unknown }; } catch { /* 旧原生目录没有 manifest 修订列表时使用初始修订。 */ }
			const revisions = Array.isArray(manifest.revisions) ? manifest.revisions : [{ id: `rev-${canvas.revision}`, prompt: "Canvas Design", summary: "Canvas 原生设计版本", createdAt: canvas.updatedAt, kind: "initial" }];
			const pages = canvas.pages.map((page) => ({ id: page.id, name: page.name, route: page.route, rootNodeId: page.rootNodeId, entryFileId: "", fileIds: [] }));
			const document = { id: canvas.id, name: canvas.name, version: canvas.revision, schemaVersion: 2, entryPageId: canvas.entryPageId, pages, files: [], revisions, canvas };
			return { document, files: [], context: { projectId: designProjectId(normalizedProjectPath), projectPath: normalizedProjectPath, designId }, guidelines: canvas.guidelines ?? loadProjectGuidelines(normalizedProjectPath) };
		}
		if (existsSync(designMetadataPath(normalizedProjectPath)) || existsSync(join(legacyDesignRoot(normalizedProjectPath), designId, "design.json"))) throw new Error("检测到旧 HTML/CSS/JS Design 工作区；该版本不支持迁移，请新建原生 Canvas 工作区");
		return undefined;
	};
	/** 读取项目级 Design 索引；旧布局只用于返回明确的不兼容错误。 */
	const loadDesignId = (projectPath: string): string | undefined => {
		try {
			const designDirectory = join(designRoot(projectPath), "design");
			if (existsSync(designDirectory)) {
				const native = readdirSync(designDirectory, { withFileTypes: true }).find((entry) => entry.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(entry.name) && existsSync(join(designDirectory, entry.name, "manifest.json")));
				if (native) return native.name;
			}
		} catch { /* 继续检查旧布局并返回明确不兼容错误。 */ }
		const legacyDirectory = legacyDesignRoot(projectPath);
		if (existsSync(designMetadataPath(projectPath)) || (existsSync(legacyDirectory) && readdirSync(legacyDirectory, { withFileTypes: true }).some((entry) => entry.isDirectory() && existsSync(join(legacyDirectory, entry.name, "design.json")) && !existsSync(join(legacyDirectory, entry.name, "manifest.json"))))) throw new Error("检测到旧 HTML/CSS/JS Design 工作区；该版本不支持迁移，请新建原生 Canvas 工作区");
		return undefined;
	};
	/** 读取历史目录中的只读快照，绝不写回 current workspace。 */
	const loadDesignRevision = (designId: string, revisionId: string, projectPath?: string): DesignRpcSnapshot => {
		const normalizedProjectPath = normalizeDesignProjectPath(projectPath);
		const nativeRevisionRoot = join(nativeDesignRoot(normalizedProjectPath, designId), "revisions", revisionId);
		if (existsSync(join(nativeRevisionRoot, "design.json"))) {
			const canvas = normalizeNativeCanvasDocument(JSON.parse(readFileSync(join(nativeRevisionRoot, "design.json"), "utf8")));
			validateNativeCanvasDocument(canvas);
			let document: Record<string, unknown>;
			try { document = (JSON.parse(readFileSync(join(nativeRevisionRoot, "snapshot.json"), "utf8")) as { document?: Record<string, unknown> }).document ?? {}; } catch { document = {}; }
			const revisions = Array.isArray(document.revisions) ? document.revisions : [{ id: revisionId, prompt: "Canvas Design", summary: "Canvas 原生设计版本", createdAt: canvas.updatedAt, kind: "patch" }];
			return { document: { ...document, id: designId, name: canvas.name, version: canvas.revision, schemaVersion: 2, entryPageId: canvas.entryPageId, pages: canvas.pages.map((page) => ({ id: page.id, name: page.name, route: page.route, rootNodeId: page.rootNodeId, entryFileId: "", fileIds: [] })), files: [], revisions, canvas }, files: [], context: { projectId: designProjectId(normalizedProjectPath), projectPath: normalizedProjectPath, designId }, guidelines: canvas.guidelines ?? loadProjectGuidelines(normalizedProjectPath) };
		}
		if (existsSync(designMetadataPath(normalizedProjectPath)) || existsSync(join(legacyDesignRoot(normalizedProjectPath), designId, "revisions"))) throw new Error("检测到旧 HTML/CSS/JS Design 历史；该版本不支持迁移，请新建原生 Canvas 工作区");
		throw new Error(`Design Canvas 历史修订不存在：${revisionId}`);
	};
	const getDesignSnapshot = (designId: string, projectPath?: string): DesignRpcSnapshot => {
		const normalizedProjectPath = normalizeDesignProjectPath(projectPath || designProjects.get(designId));
		const cacheKey = designKey(normalizedProjectPath, designId);
		const cached = designSnapshots.get(cacheKey);
		if (cached) {
			if (!cached.document.canvas) throw new Error("检测到旧 HTML/CSS/JS Design 工作区；该版本不支持迁移，请新建原生 Canvas 工作区");
			return cached;
		}
		const loaded = loadDesignSnapshot(designId, normalizedProjectPath);
		const base = loaded ?? demoDesignSnapshot(designId);
		const snapshot = { ...base, context: base.context?.projectPath === normalizedProjectPath ? base.context : { projectId: designProjectId(normalizedProjectPath), projectPath: normalizedProjectPath, designId }, guidelines: base.guidelines ?? loadProjectGuidelines(normalizedProjectPath) };
		if (loaded && snapshot !== loaded) persistDesign(snapshot, normalizedProjectPath);
		else designProjects.set(designId, normalizedProjectPath);
		designSnapshots.set(cacheKey, snapshot);
		return snapshot;
	};
	/** 给兼容性 generate 接口提供受限场景摘要；模型不接收文件正文或本地路径。 */
	const describeCanvasSnapshot = (snapshot: DesignRpcSnapshot): string => {
		const canvas = nativeCanvasFromSnapshot(snapshot);
		const nodeSummary = Object.values(canvas.nodes).map((node) => {
			const text = node.text && typeof node.text === "object" ? node.text as Record<string, unknown> : undefined;
			const image = node.image && typeof node.image === "object" ? node.image as Record<string, unknown> : undefined;
			return { id: node.id, type: node.type, name: node.name, parentId: node.parentId, childIds: node.childIds, transform: node.transform, text: text ? { text: String(text.text ?? "").slice(0, 160), fontFamily: text.fontFamily, fontSize: text.fontSize } : undefined, assetId: image?.assetId };
		}).slice(0, 500);
		return JSON.stringify({ pages: canvas.pages, nodes: nodeSummary, assets: Object.values(canvas.assets).map((asset) => ({ id: asset.id, mimeType: asset.mimeType, width: asset.width, height: asset.height, fontFamily: asset.fontFamily })), guidelines: snapshot.guidelines }, null, 2);
	};
	/** 页面名称属于工作区元数据；独立生成修订并落盘，避免 UI 本地改名在重启后被 canonical snapshot 覆盖。 */
	const renameDesignPage = (designId: string, projectPath: string, pageId: string, name: string, baseRevisionId: string): DesignRpcSnapshot => {
		const current = getDesignSnapshot(designId, projectPath);
		const nextName = name.trim();
		if (!nextName) throw new Error("Design 页面名称不能为空");
		if (current.document.canvas) {
			const canvas = structuredClone(nativeCanvasFromSnapshot(current)) as CanvasDesignDocument;
			const page = canvas.pages.find((candidate) => candidate.id === pageId);
			if (!page) throw new Error(`Canvas 页面不存在：${pageId}`);
			const revisions = Array.isArray(current.document.revisions) ? current.document.revisions as Array<Record<string, unknown>> : [];
			const currentRevisionId = String(revisions.at(-1)?.id ?? "");
			if (baseRevisionId !== currentRevisionId) throw new Error(`Design revision 冲突：当前为 ${currentRevisionId || "unknown"}，请求基于 ${baseRevisionId || "unknown"}`);
			page.name = nextName;
			canvas.revision += 1;
			canvas.updatedAt = new Date().toISOString();
			const revisionId = `rev-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
			const summary = `已将页面重命名为 ${nextName}。`;
			const document = { ...current.document, version: canvas.revision, pages: canvas.pages.map((item) => ({ id: item.id, name: item.name, route: item.route, rootNodeId: item.rootNodeId, entryFileId: "", fileIds: [] })), revisions: [...revisions, { id: revisionId, prompt: `重命名页面 ${nextName}`, summary, createdAt: canvas.updatedAt, parentRevisionId: currentRevisionId || undefined, kind: "patch" }], canvas };
			const next = { document, files: [], context: current.context, guidelines: current.guidelines } as DesignRpcSnapshot;
			designSnapshots.set(designKey(projectPath, designId), next);
			persistDesign(next, projectPath);
			return next;
		}
		throw new Error("旧 HTML/CSS/JS Design 工作区不兼容；请新建原生 Canvas 工作区");
	};
	const designMetadata = (designId: string): DesignStreamMetadata => {
		const projectPath = designProjects.get(designId);
		const run = designRuns.get(designCacheKey(designId, projectPath));
		if (!run) throw new Error("Design 当前没有运行中的任务");
		run.sequence += 1;
		return { projectId: designProjectId(run.projectPath), projectPath: run.projectPath, designId, requestId: run.requestId, runId: run.runId, sequence: run.sequence, emittedAt: Date.now() };
	};
	/**
	 * 返回 Design 工作区可恢复的最小运行态。
	 * 业务意图：前端重新 hydrate 后仍能看到审批卡片并继续原 run，
	 * 同时不把高风险 patch 的完整正文写入 localStorage 或恢复响应。
	 */
	const getDesignRunRecovery = (designId: string, projectPath: string): DesignRunRecoveryState => {
		const run = designRuns.get(designCacheKey(designId, projectPath));
		if (!run?.active) return { status: "idle", phase: "idle", requestId: null, runId: null, sequence: 0 };
		if (run.pendingApproval) return { status: "awaiting_approval", phase: "awaiting_approval", requestId: run.requestId, runId: run.runId, sequence: run.sequence, pendingApproval: run.pendingApproval };
		if (run.pendingClarification) return { status: "awaiting_clarification", phase: "awaiting_clarification", requestId: run.requestId, runId: run.runId, sequence: run.sequence, pendingClarification: run.pendingClarification };
		return { status: "running", phase: run.phase, requestId: run.requestId, runId: run.runId, sequence: run.sequence };
	};
	const getDesignSessionManager = (designId: string, projectPath: string): SessionManager => {
		const cacheKey = designKey(projectPath, designId);
		const existing = designSessionManagers.get(cacheKey);
		if (existing) return existing;
		const manager = openDesignSessionManager(designId, projectPath);
		designSessionManagers.set(cacheKey, manager);
		return manager;
	};
	/** 返回场景检查与渲染配置；预览不会生成页面源码或启动第二套内容容器。 */
	const buildDesignPreview = (projectPath: string, designId: string, pageId: string, revisionId?: string, requestedSnapshot?: DesignRpcSnapshot): { snapshot: DesignRpcSnapshot; previewHandle: DesignPreviewHandle; checks: Array<{ level: "error" | "warning" | "info"; message: string }> } => {
		const snapshot = requestedSnapshot ?? getDesignSnapshot(designId, projectPath);
		const canvas = nativeCanvasFromSnapshot(snapshot);
		validateNativeCanvasDocument(canvas);
		if (!canvas.pages.some((page) => page.id === pageId)) throw new Error(`Canvas 页面不存在：${pageId}`);
		const revisions = Array.isArray(snapshot.document.revisions) ? snapshot.document.revisions as Array<Record<string, unknown>> : [];
		const currentRevisionId = String(revisions.at(-1)?.id ?? `rev-${canvas.revision}`);
		if (revisionId && revisionId !== currentRevisionId) throw new Error(`Design scene revision 冲突：快照为 ${currentRevisionId}，请求为 ${revisionId}`);
		const checks = [
			{ level: "info" as const, message: `Canvas 场景包含 ${Object.keys(canvas.nodes).length} 个节点和 ${Object.keys(canvas.assets).length} 个资源。` },
			{ level: "info" as const, message: `渲染配置：页面 ${pageId}，DPR 由 Desktop CanvasKit 运行时决定。` },
		];
		const previewHandle: DesignPreviewHandle = { id: `scene-${crypto.randomUUID()}`, projectId: designProjectId(projectPath), designId, pageId, revisionId: currentRevisionId, scene: canvas, checks, expiresAt: Date.now() + 5 * 60_000 };
		return { snapshot, previewHandle, checks };
	};
	/**
	 * 导出 canonical Design 文件清单；ZIP 内保留 pages/shared/assets 的相对目录，
	 * 让多页面项目解压后仍能直接按文件路径继续开发，而不是丢失页面边界。
	 */
	const exportDesignArchive = async (projectPath: string, designId: string, outputPath: string): Promise<string> => {
		const target = resolve(outputPath);
		if (!target.toLowerCase().endsWith(".zip")) throw new Error("Design 导出文件必须使用 .zip 扩展名");
		if (existsSync(target) && statSync(target).isDirectory()) throw new Error("Design 导出路径不能是目录");
		const snapshot = getDesignSnapshot(designId, projectPath);
		persistDesign(snapshot, projectPath);
		const archive = new JSZip();
		const canvas = nativeCanvasFromSnapshot(snapshot);
		archive.file("design.json", JSON.stringify(canvas, null, 2));
		archive.file("manifest.json", JSON.stringify({ schemaVersion: 2, designId, revision: canvas.revision, name: canvas.name }, null, 2));
		const buffer = await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
		mkdirSync(dirname(target), { recursive: true });
		atomicWrite(target, buffer);
		return target;
	};
	const emitDesignEvent = (designId: string, event: AgentSessionEvent): void => {
		const run = designRuns.get(designCacheKey(designId));
		if (!run?.active) return;
		const projected = projectDesignAgentEvent(event);
		if (!projected) return;
		// 运行态只保存阶段和轻量工具信息；完整消息正文仍写入会话文件，
		// 避免项目切换恢复时再次传输整段模型输出。
		if (projected.type === "message_update") {
			const inner = projected.assistantMessageEvent;
			if (inner.type === "thinking_delta") run.phase = "thinking";
			else if (inner.type === "text_delta") run.phase = "responding";
		} else if (projected.type === "message_end") {
			run.phase = "responding";
		} else if (projected.type === "compaction_start") {
			run.phase = "compacting";
		} else if (projected.type === "compaction_end") {
			// 压缩完成后回到可继续执行的阶段；最终成功/失败状态由 Desktop 保留 compactionNotice 展示。
			run.phase = "thinking";
		} else if (projected.type === "tool_execution_start" || projected.type === "tool_execution_update" || projected.type === "tool_execution_end") {
			run.phase = "tool";
		}
		const metadata = designMetadata(designId);
		if (projected.type === "message_end") {
			// UI 消息单独以 custom entry 保存，避免把 Desktop 展示协议和 Agent 内部 prompt 混为同一条 user message。
			// 一个 run 内可能有多次 assistant message_end；Desktop 将它们合并成同一气泡，
			// 因此使用 run 级稳定 ID，后续 custom entry 会按 ID 更新而不是制造重复消息。
			const messageId = `design-assistant-${metadata.runId ?? metadata.requestId}`;
			appendDesignUiMessage(designKey(metadata.projectPath, designId), { id: messageId, kind: "assistant", text: projected.message.content.map((part) => part.text).join("") });
		}
		output({ type: "design_event", ...metadata, event: projected });
	};
	const applyDesignPatch = async (designId: string, pageId: string, patch: DesignPatch): Promise<DesignPatchResult> => {
		const projectPath = designProjects.get(designId) || runtimeHost.cwd;
		const operationKey = patch.operationId ? `${designCacheKey(designId, projectPath)}:${patch.operationId}` : undefined;
		if (patch.operationId) {
			const previous = operationKey ? appliedDesignOperations.get(operationKey) : undefined;
			if (previous) {
				const snapshot = getDesignSnapshot(designId, projectPath);
				return {
					operationId: previous.operationId,
					revisionId: previous.revisionId,
					summary: previous.summary,
					affectedNodeIds: previous.changedPaths,
					snapshot,
				};
			}
		}
		const current = getDesignSnapshot(designId, projectPath);
		if (!current.document.canvas) throw new Error("旧 HTML/CSS/JS Design 工作区不兼容；请新建原生 Canvas 工作区");
		const run = designRuns.get(designCacheKey(designId, projectPath));
		const isDraft = Boolean(run?.active);
		const revisions = Array.isArray(current.document.revisions) ? current.document.revisions as Array<Record<string, unknown>> : [];
		const currentRevisionId = typeof revisions.at(-1)?.id === "string" ? String(revisions.at(-1)?.id) : "";
		if (patch.baseRevisionId !== currentRevisionId) throw new Error(`Design revision 冲突：当前为 ${currentRevisionId || "unknown"}，请求基于 ${patch.baseRevisionId}`);
		if (!Array.isArray(patch.operations) || patch.operations.length === 0 || patch.operations.length > 20) throw new Error("Design patch 操作数量必须在 1 到 20 之间");
		if (!patch.operations.every(isDesignPatchOperation)) throw new Error("Design patch 包含不允许的文件或操作");
		{
			const canvas = isDraft && run ? run.draftScene : nativeCanvasFromSnapshot(current);
			if (!canvas.pages.some((page) => page.id === pageId)) throw new Error(`Canvas 页面不存在：${pageId}`);
			const nativeOperations = normalizeCanvasOperations(patch.operations as CanvasDesignOperation[], canvas);
			if (!nativeOperations.every((operation) => ["create_node", "update_node", "delete_node", "move_node", "update_text", "update_path", "attach_asset"].includes(operation.op))) throw new Error("Canvas patch 只能包含场景操作，不能包含文件操作");
			const nextCanvas = applyNativeCanvasOperations(canvas, nativeOperations);
			const revisionId = isDraft ? run!.workingRevisionId : `rev-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
			const summary = patch.summary?.trim() || "已应用一组 Canvas 场景修改。";
			const nextRevisions = isDraft ? revisions : [...revisions, { id: revisionId, prompt: summary, summary, createdAt: new Date().toISOString(), parentRevisionId: currentRevisionId || undefined, kind: "patch" }];
			const pages = nextCanvas.pages.map((page) => ({ id: page.id, name: page.name, route: page.route, rootNodeId: page.rootNodeId, entryFileId: "", fileIds: [] }));
			const next = { document: { ...current.document, version: nextCanvas.revision, entryPageId: nextCanvas.entryPageId, pages, files: [], revisions: nextRevisions, canvas: nextCanvas }, files: [], context: current.context, guidelines: current.guidelines } as DesignRpcSnapshot;
			const operationId = patch.operationId ?? `design-op-${crypto.randomUUID()}`;
			const affectedNodeIds = collectCanvasPatchDelta(nativeOperations);
			const transaction = { transactionId: operationId, baseRevision: canvas.revision, source: isDraft ? "ai" as const : "system" as const, operations: nativeOperations, summary, createdAt: new Date().toISOString() };
			if (run && isDraft) {
				const operationIndex = run.operationCount + 1;
				const sequence = run.sequence + 1;
				appendDraftJournal(run, { operationId, sequence, operationIndex, pageId, summary, transaction });
				run.draftScene = nextCanvas;
				run.operationCount = operationIndex;
				run.hasChanges = true;
				run.lastSummary = summary;
				run.phase = "applying_patch";
				writeDraftCheckpoint(run, { operationId, sequence, operationIndex, pageId, summary, transaction });
				designSnapshots.set(designKey(projectPath, designId), next);
				const metadata = designMetadata(designId);
				output({ type: "design_patch_applied", ...metadata, operationId, revisionId, pageId, summary, transaction, affectedNodeIds, draftRevisionId: run.workingRevisionId, operationIndex, dirtyRects: [], isDraft: true } satisfies DesignPatchAppliedEvent);
			} else {
				designSnapshots.set(designKey(projectPath, designId), next);
				persistDesign(next, projectPath);
			}
			const result = { operationId, revisionId, summary, affectedNodeIds, snapshot: next };
			if (operationKey) {
				if (appliedDesignOperations.size >= MAX_APPLIED_DESIGN_OPERATIONS) {
					const oldestKey = appliedDesignOperations.keys().next().value;
					if (typeof oldestKey === "string") appliedDesignOperations.delete(oldestKey);
				}
				appliedDesignOperations.set(operationKey, { operationId, revisionId, summary, changedPaths: affectedNodeIds });
			}
			return result;
		}
	};
	/**
	 * Design run 收口时把实时写入的项目文件固化为一个不可变 revision。
	 * 业务意图：patch 是编辑过程，run settled 才是用户版本时间线中的一次提交。
	 */
	const settleDesignRun = (designId: string, cacheKey: string, reason: "completed" | "interrupted" = "completed"): DesignRpcSnapshot => {
		const run = designRuns.get(cacheKey);
		if (!run) throw new Error("Design run 不存在，无法收口");
		if (!run.hasChanges) {
			removeDraftJournal(run.projectPath, designId, run.runId);
			return getDesignSnapshot(designId, run.projectPath);
		}
		const current = getDesignSnapshot(designId, run.projectPath);
		const canvas = run.draftScene;
		const revisions = Array.isArray(current.document.revisions) ? current.document.revisions as Array<Record<string, unknown>> : [];
		const parentRevisionId = typeof revisions.at(-1)?.id === "string" ? String(revisions.at(-1)?.id) : "";
		const revisionId = `rev-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
		const summary = run.lastSummary || (reason === "interrupted" ? "Design 任务已停止，保留已接受的绘制内容。" : "已完成一次 Design 任务。");
		const document = {
			...current.document,
			version: canvas.revision,
			pages: canvas.pages.map((page) => ({ id: page.id, name: page.name, route: page.route, rootNodeId: page.rootNodeId, entryFileId: "", fileIds: [] })),
			revisions: [...revisions, { id: revisionId, prompt: summary, summary, createdAt: new Date().toISOString(), parentRevisionId: parentRevisionId || undefined, kind: reason === "interrupted" ? "interrupted" : "patch" }],
			files: current.files.map(({ content: _content, ...file }) => file),
			canvas,
		};
		const settled = { document, files: current.files, context: current.context, guidelines: current.guidelines } as DesignRpcSnapshot;
		designSnapshots.set(cacheKey, settled);
		persistDesign(settled, run.projectPath);
		removeDraftJournal(run.projectPath, designId, run.runId);
		return settled;
	};
	const requestDesignApproval = async (designId: string, patch: DesignPatch, reason: string): Promise<boolean> => {
		const run = designRuns.get(designCacheKey(designId));
		if (!run?.active) return false;
		const approvalId = `design-approval-${crypto.randomUUID()}`;
		run.pendingApproval = { approvalId, reason, pageId: run.pageId };
		run.phase = "awaiting_approval";
		// 超时兜底：等待 10 分钟无响应则判定为悬挂，发 design_error 收口并清理 active。
		// 避免 Agent 循环永久卡在工具调用、run.active 永久为 true，导致后续请求全部报"正在执行中"。
		const result = new Promise<boolean>((resolveApproval) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			// 包装 resolve：无论正常响应还是超时，都先清除定时器，再唤醒等待方。
			const settle = (approved: boolean): void => {
				if (timer !== undefined) clearTimeout(timer);
				resolveApproval(approved);
			};
			designApprovals.set(approvalId, { designId: designCacheKey(designId), resolve: settle });
			timer = setTimeout(() => {
				const pending = designApprovals.get(approvalId);
				// 仅当该 approval 仍由当前 Promise 持有时才触发超时收口，避免误清已被响应的条目。
				if (pending && pending.resolve === settle) {
					// 先发 error（run 仍 active，designMetadata 可用），再 resolve(false) 让工具调用拿到拒绝、Agent 循环退出。
					const activeRun = designRuns.get(designCacheKey(designId));
					if (activeRun?.active) {
						output({ type: "design_error", ...designMetadata(designId), error: "Design 审批等待超时，任务已停止。请重新发起需求。" });
						activeRun.active = false;
						void flushSkillReload("design");
					}
					settle(false);
				}
			}, DESIGN_APPROVAL_TIMEOUT_MS);
		});
		output({ type: "design_approval_required", ...designMetadata(designId), approvalId, pageId: run.pageId, patch, reason });
		return result.finally(() => {
			designApprovals.delete(approvalId);
			if (run.pendingApproval?.approvalId === approvalId) run.pendingApproval = undefined;
			if (run.active) run.phase = "thinking";
		});
	};
	/**
	 * 业务意图：澄清是 Agent 在发现关键歧义后主动发起的暂停点，
	 * 不是 Design 会话创建时自动插入的首轮表单；答案返回后原工具调用会继续执行。
	 * 超时兜底与审批同源：避免桌面端因竞态丢失澄清事件导致后端 Promise 永久挂起。
	 */
	const requestDesignClarification = async (designId: string, request: { question: string; context?: string; options?: string[] }): Promise<string> => {
		const run = designRuns.get(designCacheKey(designId));
		if (!run?.active) throw new Error("Design 当前没有可等待澄清的运行任务");
		const clarificationId = `design-clarification-${crypto.randomUUID()}`;
		run.pendingClarification = { clarificationId, question: request.question, context: request.context, options: request.options ?? [] };
		run.phase = "awaiting_clarification";
		const result = new Promise<string>((resolveAnswer) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			// 包装 resolve：无论正常回答还是超时，都先清除定时器，再唤醒等待方。
			const settle = (answer: string): void => {
				if (timer !== undefined) clearTimeout(timer);
				resolveAnswer(answer);
			};
			designClarifications.set(clarificationId, { designId: designCacheKey(designId), resolve: settle });
			timer = setTimeout(() => {
				const pending = designClarifications.get(clarificationId);
				// 仅当该 clarification 仍由当前 Promise 持有时才触发超时收口。
				if (pending && pending.resolve === settle) {
					const activeRun = designRuns.get(designCacheKey(designId));
					if (activeRun?.active) {
						output({ type: "design_error", ...designMetadata(designId), error: "Design 澄清等待超时，任务已停止。请重新发起需求。" });
						activeRun.active = false;
						void flushSkillReload("design");
					}
					settle("用户长时间未回答，任务已停止");
				}
			}, DESIGN_CLARIFICATION_TIMEOUT_MS);
		});
		output({ type: "design_clarification_required", ...designMetadata(designId), clarificationId, question: request.question, context: request.context, options: request.options ?? [] } satisfies DesignClarificationRequiredEvent);
		return result.finally(() => {
			designClarifications.delete(clarificationId);
			if (run.pendingClarification?.clarificationId === clarificationId) run.pendingClarification = undefined;
			if (run.active) run.phase = "thinking";
		});
	};
	/** 复杂任务由模型通过 update_plan 提交，简单任务由 skip_plan 显式跳过。 */
	const updateDesignPlan = async (designId: string, steps: DesignPlanStep[], explanation?: string): Promise<void> => {
		const run = designRuns.get(designCacheKey(designId));
		if (!run?.active) throw new Error("Design 当前没有可更新计划的运行任务");
		run.planDecisionPending = false;
		output({ type: "design_plan_updated", ...designMetadata(designId), steps, explanation } satisfies DesignPlanUpdatedEvent);
	};
	const skipDesignPlan = async (designId: string, _explanation: string): Promise<void> => {
		const run = designRuns.get(designCacheKey(designId));
		if (!run?.active) throw new Error("Design 当前没有可跳过计划的运行任务");
		run.planDecisionPending = false;
		// 简单任务不发送空计划事件，避免 Desktop 短暂展示一个没有步骤的计划卡片。
	};
	const createDesignSession = async (designId: string, projectPath?: string) => {
		const cacheKey = designCacheKey(designId, projectPath);
		const existing = designSessions.get(cacheKey);
		if (existing) return existing;
		// Agent session 的 cwd 只用于保存会话，不再把项目根目录当作 Design 工作区。
		// 正式文件由受控 Design patch 写入项目根目录，避免 .session 和产物混在一起。
		const workspacePath = designSessionPath(designId, normalizeDesignProjectPath(projectPath));
		mkdirSync(workspacePath, { recursive: true });
		const services = await createAgentSessionServices({
			cwd: workspacePath,
			agentDir: getAgentDir(),
			// Design 与主会话共享同一个 ModelRuntime，确保 keyring 加载的 GitPilot token、
			// provider 配置和当前模型选择在独立 Agent 会话中保持一致。
			modelRuntime: runtimeHost.services.modelRuntime,
			// Design 仅注册 Web/MCP 扩展；内置文件/Shell/Git 工具关闭，但保留下方 Design custom tools。
			resourceLoaderOptions: { extensionFactories: createModeExtensions("design", normalizeDesignProjectPath(projectPath)), systemPrompt: DESIGN_SYSTEM_PROMPT, skillMode: "design" },
		});
		// Design 使用固定 conversation.jsonl；内存 AgentSession 可以按运行释放，下一轮会从同一文件恢复上下文。
		const sessionManager = getDesignSessionManager(designId, normalizeDesignProjectPath(projectPath));
		const created = await createAgentSessionFromServices({
			services,
			sessionManager,
			model: session.model,
			// builtin 模式关闭内置本地文件/Shell 工具，同时只开放 Design 白名单 custom tools。
			thinkingLevel: session.thinkingLevel,
			noTools: "builtin",
			compactionInstructions: () => buildDesignCompactionInstructions(getDesignSnapshot(designId, projectPath), designRuns.get(cacheKey)?.pageId),
			customTools: createDesignToolDefinitions({
				getPageId: () => designRuns.get(cacheKey)?.pageId ?? "home",
				getSnapshot: () => getDesignSnapshot(designId),
				getBaseRevisionId: () => {
					const run = designRuns.get(cacheKey);
					if (!run?.active) throw new Error("Design 当前没有活动运行，无法获取 patch 基准版本");
					return run.baseRevisionId;
				},
				applyPatch: (patch) => {
					const run = designRuns.get(cacheKey);
					if (run?.planDecisionPending) throw new Error("请先调用 skip_plan 或 update_plan 完成 Design 执行方式决策");
					if (!run?.active) throw new Error("Design 当前没有活动运行，无法应用 patch");
					// 服务端覆盖工具参数中的基准版本，保证一次 run 始终使用启动时的正式 revision。
					return applyDesignPatch(designId, run.pageId, { ...patch, baseRevisionId: run.baseRevisionId });
				},
				requestApproval: (patch, reason) => requestDesignApproval(designId, patch, reason),
				requestClarification: (request) => requestDesignClarification(designId, request),
				updatePlan: (steps, explanation) => updateDesignPlan(designId, steps, explanation),
				skipPlan: (explanation) => skipDesignPlan(designId, explanation),
			}),
		});
		created.session.subscribe((event) => {
			emitDesignEvent(designId, event);
			if (event.type === "agent_settled") {
				const run = designRuns.get(cacheKey);
				if (run?.active) {
					const settledSnapshot = settleDesignRun(designId, cacheKey);
					const settledMetadata = designMetadata(designId);
					run.active = false;
					output({ type: "design_run_settled", ...settledMetadata, snapshot: settledSnapshot, reason: "completed" });
				}
				// 释放本轮内存对象，但保留固定 JSONL；下一轮 createDesignSession 会重新打开并恢复上下文。
				// abort 后 run 已提前标记 inactive，也必须走这里，否则停止任务会泄漏 AgentSession。
				if (designSessions.get(cacheKey) === created.session) {
					designSessions.delete(cacheKey);
					created.session.dispose();
				}
				releaseIdleDesignSessionManager(cacheKey);
				// 先标记运行结束再刷新，确保延迟中的 Design Skill 配置不会因 busy 检查而一直挂起。
				void flushSkillReload("design");
			}
		});
		designSessionManagers.set(cacheKey, sessionManager);
		designSessions.set(cacheKey, created.session);
		return created.session;
	};
	const designGenerate = async (command: Extract<RpcCommand, { type: "design_generate" }>) => {
		const projectPath = normalizeDesignProjectPath(command.projectPath);
		designProjects.set(command.designId, projectPath);
		const current = getDesignSnapshot(command.designId, projectPath);
		const revisions = Array.isArray(current.document.revisions) ? current.document.revisions as Array<Record<string, unknown>> : [];
		const currentRevisionId = String(revisions.at(-1)?.id ?? "");
		if (command.baseRevisionId && command.baseRevisionId !== currentRevisionId) throw new Error(`Design revision 冲突：当前为 ${currentRevisionId || "unknown"}，请求基于 ${command.baseRevisionId}`);
		if (!Array.isArray(current.document.pages) || !(current.document.pages as Array<Record<string, unknown>>).some((page) => page.id === command.pageId)) throw new Error(`Design 页面不存在：${command.pageId}`);
		const requestId = command.id ?? crypto.randomUUID();
		const designSession = await createDesignSession(command.designId, projectPath);
		// Design 会话按 designId 缓存；主会话切换模型后，下一次生成要跟随新的选择，
		// 避免继续使用旧模型或旧的未认证模型实例。
		if (session.model && (!designSession.model || designSession.model.provider !== session.model.provider || designSession.model.id !== session.model.id)) {
			await designSession.setModel(session.model);
		}
		if (!designSession.model) throw new Error("Design 尚未选择可用模型");
		const sceneSummary = describeCanvasSnapshot(current);
		// 兼容接口仍要求完整 JSON；临时关闭工具，确保 generate 只返回可校验的原生事务。
		const activeDesignTools = designSession.getActiveToolNames();
		designSession.setActiveToolsByName([]);
		try {
			await designSession.prompt(`用户需求：\n${command.prompt}\n\n交付格式：\n- 不要调用工具，只返回 JSON：{"summary": string, "operations": CanvasDesignOperation[]}。\n- operations 只能使用 create_node、update_node、delete_node、move_node、update_text、update_path、attach_asset；不得返回源码、渲染引擎 API 或本地路径。\n\n当前场景摘要：\n${sceneSummary}`, { source: "rpc", persistUserMessageBeforeRun: true });
			await designSession.waitForIdle();
		} finally {
			designSession.setActiveToolsByName(activeDesignTools);
		}
		const modelText = designSession.getLastAssistantText() ?? "";
		if (modelText) output({ type: "design_delta", requestId, designId: command.designId, delta: modelText });
		let generatedOperations: CanvasDesignOperation[] | undefined;
		let generatedSummary = "";
		try {
			const parsed = JSON.parse(modelText.replace(/^```json\s*/i, "").replace(/\s*```$/, "")) as { summary?: unknown; operations?: unknown };
			if (typeof parsed.summary === "string") generatedSummary = parsed.summary;
			if (Array.isArray(parsed.operations) && parsed.operations.length > 0 && parsed.operations.length <= 20 && parsed.operations.every(isDesignPatchOperation)) generatedOperations = parsed.operations as CanvasDesignOperation[];
		} catch { /* 非结构化响应会在下方转为明确错误，禁止本地 mock 回退。 */ }
		if (!generatedOperations) throw new Error("Design Agent 未返回合法的 Canvas 场景事务");
		const summary = generatedSummary || "已应用 Design Agent 的结构化生成结果。";
		const result = await applyDesignPatch(command.designId, command.pageId, { baseRevisionId: currentRevisionId, operations: generatedOperations, summary, operationId: `design-generate-${requestId}` });
		output({ type: "design_preview_ready", designId: command.designId, pageId: command.pageId, revisionId: result.revisionId, snapshot: result.snapshot });
		return { requestId, snapshot: result.snapshot, summary };
	};

	const designPrompt = async (command: Extract<RpcCommand, { type: "design_prompt" }>, responseId?: string) => {
		const projectPath = normalizeDesignProjectPath(command.projectPath);
		designProjects.set(command.designId, projectPath);
		const cacheKey = designKey(projectPath, command.designId);
		const existingRun = designRuns.get(cacheKey);
		if (existingRun?.active) {
			// 泄漏兜底：上一轮 active 仍为 true 但对应 session 已释放/不存在，判定为异常悬挂
			// （如 sidecar 内部异常路径未走到 agent_settled 清理 active，或进程级残留）。
			// 直接清理而不抛错，避免用户被永久锁在"正在执行中"无法发起新任务。
			// 仅当 session 仍存活时才视为真正在执行，走原有抛错路径。
			if (designSessions.has(cacheKey)) {
				throw new Error("Design 正在执行中，请使用 design_follow_up 或等待当前任务结束");
			}
			// session 已不在，清理泄漏的 run 条目；残留的 approval/clarification Promise 由各自的超时兜底收口。
			designRuns.delete(cacheKey);
			releaseIdleDesignSessionManager(cacheKey);
		}
		const requestId = responseId ?? crypto.randomUUID();
		const runId = `design-run-${crypto.randomUUID()}`;
		const current = getDesignSnapshot(command.designId, projectPath);
		const revisions = Array.isArray(current.document.revisions) ? current.document.revisions as Array<Record<string, unknown>> : [];
		const currentRevisionId = String(revisions.at(-1)?.id ?? "");
		if (command.baseRevisionId && command.baseRevisionId !== currentRevisionId) throw new Error(`Design revision 冲突：当前为 ${currentRevisionId || "unknown"}，请求基于 ${command.baseRevisionId}`);
		if (!Array.isArray(current.document.pages) || !(current.document.pages as Array<Record<string, unknown>>).some((page) => page.id === command.pageId)) throw new Error(`Design 页面不存在：${command.pageId}`);
		designRuns.set(cacheKey, {
			designId: command.designId,
			requestId,
			runId,
			pageId: command.pageId,
			projectPath,
			sequence: 0,
			active: true,
			// 运行内 patch 使用稳定 draft revision；任务收口时再写入正式 revision。
			baseRevisionId: currentRevisionId,
			workingRevisionId: `draft-${runId}`,
			draftScene: structuredClone(nativeCanvasFromSnapshot(current)),
			operationCount: 0,
			hasChanges: false,
			phase: "thinking",
			planDecisionPending: true,
		});
		createDraftJournal(designRuns.get(cacheKey)!);
		getDesignSessionManager(command.designId, projectPath);
		appendDesignUiMessage(cacheKey, { id: command.uiMessageId ?? `design-user-${requestId}`, kind: "user", text: command.prompt, status: "sent" });
		try {
			const designSession = await createDesignSession(command.designId, projectPath);
			if (session.model && (!designSession.model || designSession.model.provider !== session.model.provider || designSession.model.id !== session.model.id)) await designSession.setModel(session.model);
			if (!designSession.model) throw new Error("Design 尚未选择可用模型");
			const sceneSummary = describeCanvasSnapshot(current);
			const prompt = `用户需求：\n${command.prompt}\n\n交付格式：\n- 直接修改当前 CanvasDesignDocument，产出可编辑的原生设计结果。\n- 遵循用户指定的页面范围、交互要求、布局和视觉规范。\n- 只通过 Design 工具提交 Canvas 节点、布局、文字、路径和资源操作。\n- 禁止输出源码、渲染引擎 API 和本地路径。\n\n当前场景摘要：\n${sceneSummary}`;
			void designSession.prompt(prompt, { source: "rpc", persistUserMessageBeforeRun: true }).catch((error: unknown) => {
				const run = designRuns.get(cacheKey);
				if (!run?.active) return;
				// Agent 异常也是一次可恢复的中断边界：先把已接受 patch 固化为
				// interrupted revision，再清理 active，避免 journal 永久停留在悬挂状态。
				const interruptedSnapshot = settleDesignRun(command.designId, cacheKey, "interrupted");
				run.active = false;
				const metadata = designMetadata(command.designId);
				output({ type: "design_error", ...metadata, error: error instanceof Error ? error.message : String(error) });
				run.sequence += 1;
				output({ type: "design_run_settled", ...metadata, sequence: run.sequence, emittedAt: Date.now(), snapshot: interruptedSnapshot, reason: "interrupted" });
				void flushSkillReload("design");
			});
			return { requestId, runId };
		} catch (error) {
			designRuns.delete(cacheKey);
			releaseIdleDesignSessionManager(cacheKey);
			throw error;
		}
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
		// 与 Code 模式 prompt 一致的受理式协议：回合包含多轮模型调用与工具执行，
		// 总时长远超 RPC 超时阈值；这里立即返回 requestId，最终文本通过
		// work_complete / work_error 事件流推送，避免 Desktop 在 30s 处误报超时。
		void (async () => {
			try {
				await work.session.prompt(message, { source: "rpc" });
				await work.session.waitForIdle();
				const text = work.session.getLastAssistantText() ?? "";
				if (work.session.messages.filter((entry) => entry.role === "user").length === 1) await work.session.generateAndApplySessionTitle(message);
				output({ type: "work_complete", requestId, taskId: command.taskId, text, title: work.session.sessionName });
			} catch (error) {
				output({ type: "work_error", requestId, taskId: command.taskId, message: error instanceof Error ? error.message : String(error) });
			} finally {
				if (activeWorkRequest?.id === requestId) activeWorkRequest = undefined;
			}
		})();
		return { requestId };
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
				sessionFile: extensionSessionFile,
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
					sessionFile: extensionSessionFile,
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

	/**
	 * Desktop/RPC 的 Plannotator 原生审核适配。
	 *
	 * 上游扩展在 `ctx.hasUI === true` 时会启动浏览器；RPC 通过一次原生确认
	 * 请求完成审核，批准后以 `hasUI=false` 执行上游工具，让其继续维护 phase、
	 * `[DONE:n]` 和 setStatus/setWidget 语义，但不会再启动浏览器服务器。
	 */
	const plannotatorToolExecutionAdapter: ExtensionToolExecutionAdapter = async ({ toolName, params, signal, execute }) => {
		if (toolName !== "plannotator_submit_plan") return execute();
		if (signal?.aborted) {
			return {
				content: [{ type: "text", text: "计划审核已取消。" }],
				details: { approved: false, cancelled: true },
			} as Awaited<ReturnType<typeof execute>>;
		}
		const inputPath = typeof (params as { filePath?: unknown })?.filePath === "string"
			? (params as { filePath: string }).filePath.trim()
			: "";
		if (!inputPath) return execute({ hasUI: false });
		const fullPath = resolve(runtimeHost.cwd, inputPath);
		const relativePath = relative(resolve(runtimeHost.cwd), fullPath);
		if (!relativePath || relativePath.startsWith("..") || relativePath.includes("..\\") || relativePath.includes("../")) return execute();
		let planContent: string;
		try {
			planContent = readFileSync(fullPath, "utf8");
		} catch {
			return execute({ hasUI: false });
		}
		const items = planContent
			.split(/\r?\n/)
			.map((line) => line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.+?)\s*$/)?.[1]?.trim())
			.filter((item): item is string => Boolean(item));
		const planSummary = items.length > 0
			? items.map((item, index) => `${index + 1}. ${item}`).join("\n")
			: planContent.trim().slice(0, 6_000);
		const message = `请审核执行计划：${relativePath}\n\n${planSummary}\n\n批准后将按步骤执行；拒绝后 Agent 会回到计划阶段。`;
		const approved = await createDialogPromise(
			{ signal } as ExtensionUIDialogOptions,
			false,
			{ method: "confirm", title: "审核执行计划", message, timeout: 15 * 60 * 1000 },
			(response) => "cancelled" in response && response.cancelled ? false : "confirmed" in response ? response.confirmed : false,
			session.sessionFile,
		);
		if (!approved) {
			return {
				content: [{ type: "text", text: "计划未获批准。请根据用户反馈修改计划后重新提交。" }],
				details: { approved: false },
			} as Awaited<ReturnType<typeof execute>>;
		}
		return execute({ hasUI: false });
	};

	runtimeHost.setRebindSession(async () => {
		await rebindSession();
	});

	const rebindSession = async (): Promise<void> => {
		session = runtimeHost.session;
		// 每个任务创建时快照策略；Gondolin 初始化失败直接阻断，不切回本机执行。
		let sandboxReady = false;
		try {
			await initializeSandbox(securityPolicy, session.sessionManager.getCwd());
			sandboxReady = true;
		} catch (error) {
			// 初始化失败仍通过 RPC 暴露结构化状态，所有 Code 工具随后由 AgentSession 阻断。
			output({ type: "sandbox_status", status: sandboxExecutor.getStatus(), error: error instanceof Error ? error.message : String(error) });
		}
		session.configureSecurityPolicy(securityPolicy, requestSecurityApproval, () => sandboxReady);
		await session.bindExtensions({
			uiContext: createExtensionUIContext(),
			mode: "rpc",
			toolExecutionAdapter: plannotatorToolExecutionAdapter,
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
				void flushSkillReload("code");
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
				denySecurityApprovals(session.sessionId);
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
				denySecurityApprovals(session.sessionId);
				// 透传 cwd：桌面版按项目/子目录创建任务时指定工作目录。
				// 新建只切换内存会话，不立即落盘；首条 prompt 生成标题后才形成历史记录。
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

			case "code_file_list": {
				try {
					return success(id, "code_file_list", listCodeProjectFiles(runtimeHost.cwd));
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					return error(id, "code_file_list", `工作空间文件加载失败: ${message}`);
				}
			}

			// =================================================================
			// Desktop Code 模式右侧栏 Git 面板（受限 sidecar Git，薄转发到 core/git）
			// =================================================================

			case "git_get_state":
				return await runGitCommand(id, "git_get_state", () => gitService.getState(runtimeHost.cwd));

			case "git_get_diff": {
				const scope = command.scope === "staged" ? "staged" : "worktree";
				return await runGitCommand(id, "git_get_diff", () => gitService.getDiff(runtimeHost.cwd, scope, command.path));
			}

			case "git_list_branches":
				return await runGitCommand(id, "git_list_branches", async () => ({ branches: await gitService.listBranches(runtimeHost.cwd) }));

			case "git_stage_paths": {
				const paths = Array.isArray(command.paths) ? command.paths.filter((path): path is string => typeof path === "string") : [];
				return await runGitCommand(id, "git_stage_paths", () => gitService.stagePaths(runtimeHost.cwd, paths));
			}

			case "git_unstage_paths": {
				const paths = Array.isArray(command.paths) ? command.paths.filter((path): path is string => typeof path === "string") : [];
				return await runGitCommand(id, "git_unstage_paths", () => gitService.unstagePaths(runtimeHost.cwd, paths));
			}

			case "git_untrack_paths": {
				const paths = Array.isArray(command.paths) ? command.paths.filter((path): path is string => typeof path === "string") : [];
				return await runGitCommand(id, "git_untrack_paths", () => gitService.untrackPaths(runtimeHost.cwd, paths));
			}

			case "git_commit":
				return await runGitCommand(id, "git_commit", () => gitService.commit(runtimeHost.cwd, command.message, command.expectedVersion));

			case "git_suggest_commit_message":
				return await runGitCommand(id, "git_suggest_commit_message", suggestCommitMessage);

			case "git_create_branch":
				return await runGitCommand(id, "git_create_branch", () => gitService.createBranch(runtimeHost.cwd, command.name, command.switchTo === true));

			case "git_switch_branch":
				return await runGitCommand(id, "git_switch_branch", () => gitService.switchBranch(runtimeHost.cwd, command.name, command.expectedVersion));

			case "git_fetch":
				return await runGitCommand(id, "git_fetch", () => gitService.fetch(runtimeHost.cwd, command.remote));

			case "git_pull_ff_only":
				return await runGitCommand(id, "git_pull_ff_only", () => gitService.pullFfOnly(runtimeHost.cwd, command.expectedVersion));

			case "git_push":
				return await runGitCommand(id, "git_push", () => gitService.push(runtimeHost.cwd, command.expectedVersion, command.setUpstream === true));

			case "git_cancel_operation":
				return await runGitCommand(id, "git_cancel_operation", async () => ({ cancelled: gitService.cancelOperation(command.operationId) }));

			// =================================================================
			// GitPilot Work（独立无状态工作对话）
			// =================================================================

			case "work_prompt": {
				const result = await runWorkPromptV2(command);
				return success(id, "work_prompt", result);
			}

	case "design_open": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				const designId = loadDesignId(projectPath);
				if (!designId) throw new Error("当前工作空间还没有设计工作区");
				const cacheKey = designKey(projectPath, designId);
				const draft = listDraftMetadata(projectPath, designId);
				// applyDesignPatch 为了让 Agent 继续读取最新场景会暂存 draft snapshot；
				// design_open 的 canonical 字段必须重新从磁盘读取，避免 Desktop 重连后把草稿误当正式场景。
				const snapshot = draft ? (loadDesignSnapshot(designId, projectPath) ?? getDesignSnapshot(designId, projectPath)) : getDesignSnapshot(designId, projectPath);
				const messages = getDesignUiMessages(getDesignSessionManager(designId, projectPath));
				const activeRun = designRuns.get(cacheKey);
				const draftSnapshot = draft?.status === "active" && activeRun?.active
					? { ...snapshot, document: { ...snapshot.document, version: activeRun.draftScene.revision, pages: activeRun.draftScene.pages.map((page) => ({ id: page.id, name: page.name, route: page.route, rootNodeId: page.rootNodeId, entryFileId: "", fileIds: [] })), canvas: activeRun.draftScene } }
					: undefined;
				releaseIdleDesignSessionManager(cacheKey);
				return success(id, "design_open", { designId, snapshot, messages, execution: getDesignRunRecovery(designId, projectPath), ...(draft ? { draft } : {}), ...(draftSnapshot ? { draftSnapshot } : {}) } satisfies DesignOpenData);
			}

			case "design_sync_messages": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				if (loadDesignId(projectPath) !== command.designId) throw new Error("当前工作空间还没有可同步消息的设计工作区");
				const cacheKey = designKey(projectPath, command.designId);
				const manager = getDesignSessionManager(command.designId, projectPath);
				for (const message of command.messages) {
					if (!message || typeof message.id !== "string" || typeof message.kind !== "string") continue;
					if (message.kind === "result") {
						if (typeof message.revisionId !== "string" || typeof message.summary !== "string") continue;
					} else if (typeof message.text !== "string") continue;
					appendDesignUiMessage(cacheKey, message);
				}
				manager.flushToDisk();
				releaseIdleDesignSessionManager(cacheKey);
				return success(id, "design_sync_messages", { designId: command.designId, messages: getDesignUiMessages(manager) });
			}

			case "design_save_guidelines": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				if (loadDesignId(projectPath) !== command.designId) throw new Error("当前工作空间还没有可保存规范的设计工作区");
				const snapshot = getDesignSnapshot(command.designId, projectPath);
				if (String(snapshot.document.id) !== command.designId) throw new Error("Design 规范保存目标不匹配当前工作区");
				const guidelines = persistProjectGuidelines(projectPath, command.guidelines);
				let canvas = snapshot.document.canvas ? structuredClone(nativeCanvasFromSnapshot(snapshot)) as CanvasDesignDocument : undefined;
				if (command.canvas) {
					validateNativeCanvasDocument(command.canvas);
					canvas = { ...structuredClone(command.canvas), id: command.designId, name: typeof snapshot.document.name === "string" ? snapshot.document.name : command.designId, revision: Math.max(snapshot.document.canvas ? nativeCanvasFromSnapshot(snapshot).revision : 1, command.canvas.revision), updatedAt: new Date().toISOString() };
				}
				const next = canvas
					? { ...snapshot, guidelines, document: { ...snapshot.document, canvas: { ...canvas, guidelines: canvas.guidelines ?? guidelines }, pages: canvas.pages.map((page) => ({ id: page.id, name: page.name, route: page.route, rootNodeId: page.rootNodeId, entryFileId: "", fileIds: [] })) } }
					: { ...snapshot, guidelines };
				designSnapshots.set(designKey(projectPath, command.designId), next);
				// 规范更新也写回 .gitpilot/design.json，确保 Desktop 重连时一次拿到一致快照。
				persistDesign(next, projectPath);
				return success(id, "design_save_guidelines", { designId: command.designId, snapshot: next });
			}

			case "design_rename_page": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				designProjects.set(command.designId, projectPath);
				const snapshot = renameDesignPage(command.designId, projectPath, command.pageId, command.name, command.baseRevisionId);
				return success(id, "design_rename_page", { designId: command.designId, snapshot });
			}

			case "design_create": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				const designId = loadDesignId(projectPath) || `design-${crypto.randomUUID()}`;
				const snapshot = getDesignSnapshot(designId, projectPath);
				if (command.name && snapshot.document.name !== command.name) {
					snapshot.document.name = command.name;
					if (snapshot.document.canvas) snapshot.document.canvas = { ...nativeCanvasFromSnapshot(snapshot), name: command.name, updatedAt: new Date().toISOString() };
				}
				designSnapshots.set(designKey(projectPath, designId), snapshot); persistDesign(snapshot, projectPath);
				const cacheKey = designKey(projectPath, designId);
				const manager = getDesignSessionManager(designId, projectPath);
				const messages = getDesignUiMessages(manager);
				releaseIdleDesignSessionManager(cacheKey);
				return success(id, "design_create", { designId, snapshot, messages });
			}

			case "design_get_snapshot": {
				const snapshot = getDesignSnapshot(command.designId, command.projectPath);
				return success(id, "design_get_snapshot", { snapshot });
			}

			case "design_get_revision": {
				const snapshot = loadDesignRevision(command.designId, command.revisionId, command.projectPath);
				return success(id, "design_get_revision", { snapshot });
			}

			case "design_prompt": {
				designProjects.set(command.designId, normalizeDesignProjectPath(command.projectPath));
				const result = await designPrompt(command, id);
				return success(id, "design_prompt", result);
			}

			case "design_clarification_response": {
				const clarification = designClarifications.get(command.clarificationId);
				const designId = designKey(normalizeDesignProjectPath(command.projectPath), command.designId);
				if (!clarification || clarification.designId !== designId) throw new Error("Design 澄清请求已过期");
				const answer = command.answer.trim();
				if (!answer) throw new Error("Design 澄清回答不能为空");
				designClarifications.delete(command.clarificationId);
				clarification.resolve(answer);
				const run = designRuns.get(designId);
				if (run?.active) run.phase = "thinking";
				return success(id, "design_clarification_response");
			}

			case "design_follow_up": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				const cacheKey = designKey(projectPath, command.designId);
				const run = designRuns.get(cacheKey);
				const designSession = designSessions.get(cacheKey);
				if (!run?.active || !designSession) throw new Error("Design 当前没有可追加的运行任务");
				await designSession.followUp(command.message);
				return success(id, "design_follow_up", { queued: true });
			}

			case "design_abort": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				const cacheKey = designKey(projectPath, command.designId);
				const run = designRuns.get(cacheKey);
				if (run?.active) {
					const interruptedSnapshot = settleDesignRun(command.designId, cacheKey, "interrupted");
					run.active = false;
					for (const [clarificationId, clarification] of designClarifications) {
						if (clarification.designId === cacheKey) {
							clarification.resolve("用户停止了当前任务");
							designClarifications.delete(clarificationId);
						}
					}
					for (const [approvalId, approval] of designApprovals) {
						if (approval.designId === cacheKey) {
							approval.resolve(false);
							designApprovals.delete(approvalId);
						}
					}
					const sequence = run.sequence + 1;
					run.sequence = sequence;
					output({ type: "design_error", projectId: designProjectId(run.projectPath), projectPath: run.projectPath, designId: command.designId, requestId: run.requestId, runId: run.runId, sequence, emittedAt: Date.now(), error: "Design 任务已停止" });
					output({ type: "design_run_settled", projectId: designProjectId(run.projectPath), projectPath: run.projectPath, designId: command.designId, requestId: run.requestId, runId: run.runId, sequence: sequence + 1, emittedAt: Date.now(), snapshot: interruptedSnapshot, reason: "interrupted" });
				}
				const designSession = designSessions.get(cacheKey);
				if (designSession) await designSession.abort();
				return success(id, "design_abort");
			}

			case "design_recover_draft": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				const cacheKey = designKey(projectPath, command.designId);
				const active = designRuns.get(cacheKey);
				if (active?.active) throw new Error("Design 草稿仍在运行中，请先停止当前任务");
				const metadata = readDraftMetadata(projectPath, command.designId, command.runId, "orphaned");
				if (!metadata) throw new Error("Design 草稿不存在或已被收口");
				if (command.action === "discard") {
					removeDraftJournal(projectPath, command.designId, command.runId);
					const canonical = loadDesignSnapshot(command.designId, projectPath) ?? getDesignSnapshot(command.designId, projectPath);
					designSnapshots.set(cacheKey, canonical);
					return success(id, "design_recover_draft", { designId: command.designId, action: "discard", snapshot: canonical, reason: "discarded" });
				}
				const current = loadDesignSnapshot(command.designId, projectPath) ?? getDesignSnapshot(command.designId, projectPath);
				const currentRevisionId = String((current.document.revisions as Array<Record<string, unknown>>).at(-1)?.id ?? "");
				if (currentRevisionId !== metadata.baseRevisionId) throw new Error(`Design 草稿基准 revision 已变化：当前为 ${currentRevisionId || "unknown"}`);
				const base = JSON.parse(readFileSync(draftBasePath(projectPath, command.designId, command.runId), "utf8")) as { canvas?: CanvasDesignDocument };
				if (!base.canvas) throw new Error("Design 草稿缺少 base 场景");
				let draftScene = base.canvas;
				const records = readDraftRecords(projectPath, command.designId, command.runId);
				for (const record of records) draftScene = applyNativeCanvasOperations(draftScene, record.transaction.operations);
				const recoveredRun: DesignRun = { designId: command.designId, requestId: metadata.requestId, runId: command.runId, pageId: draftScene.entryPageId, projectPath, sequence: metadata.lastSequence, active: false, baseRevisionId: metadata.baseRevisionId, workingRevisionId: metadata.draftRevisionId, draftScene, operationCount: records.length, hasChanges: records.length > 0, lastSummary: metadata.lastSummary, phase: "idle", planDecisionPending: false };
			designRuns.set(cacheKey, recoveredRun);
			designSnapshots.set(cacheKey, { ...current, document: { ...current.document, version: draftScene.revision, pages: draftScene.pages.map((page) => ({ id: page.id, name: page.name, route: page.route, rootNodeId: page.rootNodeId, entryFileId: "", fileIds: [] })), canvas: draftScene } });
			const snapshot = settleDesignRun(command.designId, cacheKey, "interrupted");
			designRuns.delete(cacheKey);
			return success(id, "design_recover_draft", { designId: command.designId, action: "keep", snapshot, reason: "interrupted" });
			}

			case "design_approval_response": {
				const approval = designApprovals.get(command.approvalId);
				if (!approval || approval.designId !== designKey(normalizeDesignProjectPath(command.projectPath), command.designId)) throw new Error("Design 审批请求已过期");
				approval.resolve(command.approved);
				const run = designRuns.get(approval.designId);
				if (run?.active) run.phase = "thinking";
				return success(id, "design_approval_response");
			}

			case "design_apply_patch": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				designProjects.set(command.designId, projectPath);
				const raw = command.patch;
				if (!raw || typeof raw !== "object" || typeof raw.baseRevisionId !== "string" || !Array.isArray(raw.operations) || !raw.operations.every(isDesignPatchOperation)) throw new Error("Design patch 参数非法");
				const patch = raw as unknown as DesignPatch;
				if (patch.risk === "high") {
					const approved = await requestDesignApproval(command.designId, patch, "该操作被标记为高风险，请确认是否继续。");
					if (!approved) throw new Error("用户拒绝了高风险设计修改");
				}
				const result = await applyDesignPatch(command.designId, command.pageId, patch);
				return success(id, "design_apply_patch", { snapshot: result.snapshot });
			}

			case "design_generate": {
				return success(id, "design_generate", await designGenerate(command));
			}

			case "design_preview": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				designProjects.set(command.designId, projectPath);
				return success(id, "design_preview", buildDesignPreview(projectPath, command.designId, command.pageId, command.revisionId));
			}

			case "design_check": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				designProjects.set(command.designId, projectPath);
				const preview = buildDesignPreview(projectPath, command.designId, command.pageId, command.revisionId);
				return success(id, "design_check", { snapshot: preview.snapshot, checks: [...preview.checks, { level: "info", message: "Responsive preview is available for all target profiles." }, { level: "info", message: preview.snapshot.guidelines ? "Project design guidelines loaded." : "Project design guidelines are using defaults." }] });
			}

			case "design_revert": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				const current = getDesignSnapshot(command.designId, projectPath);
				const source = loadDesignRevision(command.designId, command.revisionId, projectPath);
				const sourceCanvas = nativeCanvasFromSnapshot(source);
				const revisions = Array.isArray(current.document.revisions) ? current.document.revisions as Array<Record<string, unknown>> : [];
				const currentRevisionId = typeof revisions.at(-1)?.id === "string" ? String(revisions.at(-1)?.id) : "";
				const revisionId = `rev-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
				const summary = `已从历史修订 ${command.revisionId} 创建当前版本。`;
				// 回滚是一次新的可审计提交：沿用源修订的场景，但保留当前完整时间线。
				const canvas = { ...structuredClone(sourceCanvas), id: command.designId, name: String(current.document.name ?? sourceCanvas.name), revision: Number(nativeCanvasFromSnapshot(current).revision) + 1, updatedAt: new Date().toISOString() } as CanvasDesignDocument;
				const document = {
					...current.document,
					id: command.designId,
					name: canvas.name,
					version: Number(current.document.version ?? 1) + 1,
					pages: canvas.pages.map((page) => ({ id: page.id, name: page.name, route: page.route, rootNodeId: page.rootNodeId, entryFileId: "", fileIds: [] })),
					files: [],
					revisions: [...revisions, { id: revisionId, prompt: summary, summary, createdAt: new Date().toISOString(), parentRevisionId: currentRevisionId || undefined, sourceRevisionId: command.revisionId, kind: "rollback" }],
					canvas,
				};
				const snapshot = { document, files: [], context: current.context, guidelines: source.guidelines ?? current.guidelines } as DesignRpcSnapshot;
				designProjects.set(command.designId, projectPath);
				designSnapshots.set(designKey(projectPath, command.designId), snapshot);
				persistDesign(snapshot, projectPath);
				return success(id, "design_revert", { snapshot });
			}

			case "design_upload": {
				const projectPath = normalizeDesignProjectPath(command.projectPath);
				if (!Number.isInteger(command.platformProjectId) || command.platformProjectId <= 0) throw new Error("Web 项目选择无效");
				const platformUrl = getPlatformUrl();
				if (!platformUrl) throw new Error("请先在桌面端连接 GitPilot Web 账号");
				const token = await loadCliToken(platformUrl);
				if (!token) throw new Error("当前 CLI Token 不可用，请重新进行设备授权后上传设计版本");
				const snapshot = loadDesignRevision(command.designId, command.revisionId, projectPath);
				const canvasScene = snapshot.document.canvas;
				if (!canvasScene) throw new Error("当前修订不是 Canvas 原生场景，旧 HTML 工作区不支持上传");
				const totalSize = Buffer.byteLength(JSON.stringify(canvasScene), "utf8");
				if (totalSize > 10 * 1024 * 1024) throw new Error("Design 快照超过 10MB，无法上传到 Web 项目");
				const entryPageId = typeof snapshot.document.entryPageId === "string" ? snapshot.document.entryPageId : "";
				if (!entryPageId) throw new Error("Design 修订缺少入口页面，无法生成上传预览");
				const preview = buildDesignPreview(projectPath, command.designId, entryPageId, command.revisionId, snapshot);
				if (!command.previewPng?.startsWith("data:image/png;base64,")) throw new Error("上传前必须从 CanvasKit 导出 PNG 预览");
				const title = command.title?.trim() || String(snapshot.document.name || "GitPilot Design").trim() || "GitPilot Design";
				const summary = command.summary?.trim() || (Array.isArray(snapshot.document.revisions) ? String((snapshot.document.revisions as Array<Record<string, unknown>>).at(-1)?.summary ?? "") : "") || "从 GitPilot Desktop 上传的设计修订。";
				const upload = await uploadDesignVersion(platformUrl.replace(/\/$/, ""), token, {
					projectId: command.platformProjectId,
					designId: command.designId,
					revisionId: command.revisionId,
					name: title,
					summary,
					scene: preview.previewHandle.scene,
					previewPng: command.previewPng,
				});
				// 上传元数据不是设计内容，单独附在 current document，且不会改写 immutable revision 目录。
				const current = getDesignSnapshot(command.designId, projectPath);
				const existingUploads = Array.isArray(current.document.uploads) ? current.document.uploads as Array<Record<string, unknown>> : [];
				const uploadRecord = { projectId: upload.projectId, revisionId: upload.revisionId, versionId: upload.versionId, versionNumber: upload.versionNumber, status: upload.status, uploadedAt: upload.createdAt };
				const nextUploads = [...existingUploads.filter((item) => !(item.projectId === upload.projectId && item.revisionId === upload.revisionId)), uploadRecord];
				const next = { ...current, document: { ...current.document, uploads: nextUploads } };
				designSnapshots.set(designKey(projectPath, command.designId), next);
				persistDesign(next, projectPath);
				return success(id, "design_upload", { upload });
			}

			case "design_export": {
				const snapshot = getDesignSnapshot(command.designId, command.projectPath);
				if (command.outputPath) return success(id, "design_export", { path: await exportDesignArchive(command.projectPath, command.designId, command.outputPath) });
				persistDesign(snapshot, command.projectPath);
				return success(id, "design_export", { path: designPath(command.designId, command.projectPath) });
			}

			case "mcp_list": {
				return success(id, "mcp_list", { servers: listManagedMcpServers(runtimeHost.cwd, getAgentDir()) });
			}

			case "mcp_save_server": {
				saveManagedMcpServer(runtimeHost.cwd, command.name, command.definition as McpServerDefinition, command.modes as GitPilotAgentMode[], getAgentDir(), command.previousName);
				await reloadMcpSessions();
				return success(id, "mcp_save_server");
			}

			case "mcp_copy_server": {
				const name = copyManagedMcpServer(runtimeHost.cwd, command.name, getAgentDir());
				await reloadMcpSessions();
				return success(id, "mcp_copy_server", { name });
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

			case "skill_list": {
				return success(id, "skill_list", listManagedSkills(getAgentDir()));
			}

			case "skill_set_enabled": {
				setManagedSkillEnabled(getAgentDir(), command.name, command.enabled);
				return success(id, "skill_set_enabled", await reloadSkillSessions());
			}

			case "skill_set_modes": {
				setManagedSkillModes(getAgentDir(), command.name, command.modes as SkillMode[]);
				return success(id, "skill_set_modes", await reloadSkillSessions());
			}

			case "skill_reload": {
				return success(id, "skill_reload", await reloadSkillSessions());
			}

		case "new_work_session": {
			const work = await createWorkSession(command.taskId, command.workspacePath);
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
			// 工作项协同浏览：右侧栏只读分页，数据直接代理平台接口，不进模型上下文。
			// =================================================================
			case "work_project_list": {
				const platformUrl = getPlatformUrl();
				if (!platformUrl) return error(id, "work_project_list", "未配置 GitPilot 平台地址");
				const token = await loadCliToken(platformUrl);
				if (!token) return error(id, "work_project_list", "未登录 GitPilot 平台");
				const projects = await listProjects(platformUrl, token);
				return success(id, "work_project_list", { projects });
			}

			case "work_item_page": {
				const platformUrl = getPlatformUrl();
				if (!platformUrl) return error(id, "work_item_page", "未配置 GitPilot 平台地址");
				const token = await loadCliToken(platformUrl);
				if (!token) return error(id, "work_item_page", "未登录 GitPilot 平台");
				// 列表行剔除 requirementMarkdown 大字段；每页条数钳制在 1..100，防止一次性拉爆。
				const size = Math.min(Math.max(command.size ?? 20, 1), 100);
				const page = await listMyTasks(platformUrl, token, {
					page: command.page ?? 1,
					size,
					status: command.status,
					priority: command.priority,
					projectId: command.projectId,
					keyword: command.keyword,
					workItemType: command.workItemType,
				});
				return success(id, "work_item_page", {
					records: page.records.map(({ requirementMarkdown: _omit, ...item }) => item),
					total: page.total,
					page: page.page,
					size: page.size,
					totalPages: page.totalPages,
				});
			}

			case "work_item_detail": {
				const platformUrl = getPlatformUrl();
				if (!platformUrl) return error(id, "work_item_detail", "未配置 GitPilot 平台地址");
				const token = await loadCliToken(platformUrl);
				if (!token) return error(id, "work_item_detail", "未登录 GitPilot 平台");
				// 详情与关联并行拉取；详情失败时整个请求失败，关联失败则降级为空集合（详情主体仍可展示）。
				const [detail, links] = await Promise.all([
					getWorkItemDetail(platformUrl, token, command.workItemId),
					getWorkItemLinks(platformUrl, token, command.workItemId).catch(() => null),
				]);
				const emptyLinks = { children: [], parentWorkItems: [], relatedWorkItems: [], testCases: [], attachments: [] };
				return success(id, "work_item_detail", { detail, links: links ?? emptyLinks });
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

			case "approval_response": {
				const pending = pendingSecurityApprovals.get(command.approvalId);
				if (!pending || pending.sessionId !== session.sessionId) throw new Error("安全审批请求已过期");
				pending.resolve(command.decision);
				return success(id, "approval_response");
			}

			case "get_security_policy": {
				return success(id, "get_security_policy", {
					policy: cloneSecurityPolicy(securityPolicy),
					sandbox: sandboxExecutor.getStatus(),
					approvalMode: session.sessionApprovalMode,
					pendingApprovals: [...pendingSecurityApprovals.values()]
						.filter((pending) => pending.sessionId === session.sessionId)
						.map((pending) => pending.request),
				});
			}

			case "set_security_policy": {
				if (session.isStreaming) throw new Error("当前任务执行中，安全策略只能在新任务前切换");
				const nextPolicy = normalizeSecurityPolicy(command.policy);
				let nextReady = true;
				try {
					await initializeSandbox(nextPolicy, session.sessionManager.getCwd());
				} catch (error) {
					nextReady = false;
					output({ type: "sandbox_status", status: sandboxExecutor.getStatus(), error: error instanceof Error ? error.message : String(error) });
				}
				securityPolicy = nextPolicy;
				session.configureSecurityPolicy(securityPolicy, requestSecurityApproval, () => nextReady);
				return success(id, "set_security_policy", { policy: cloneSecurityPolicy(nextPolicy), sandbox: sandboxExecutor.getStatus() });
			}

			case "set_session_approval_mode": {
				const mode: SessionApprovalMode = command.mode === "full_access" ? "full_access" : "per_request";
				session.setSessionApprovalMode(mode);
				return success(id, "set_session_approval_mode", { approvalMode: session.sessionApprovalMode });
			}

			case "bash": {
				if (!(await session.authorizeToolExecution("bash", { command: command.command }))) {
					return error(id, "bash", "用户拒绝了桌面安全审批");
				}
				const result = await session.executeBash(command.command, undefined, {
					excludeFromContext: command.excludeFromContext,
					timeoutSeconds: command.timeout,
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
				denySecurityApprovals(session.sessionId);
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
				denySecurityApprovals(session.sessionId);
				const result = await runtimeHost.fork(command.entryId);
				if (!result.cancelled) {
					await rebindSession();
				}
				return success(id, "fork", { text: result.selectedText, cancelled: result.cancelled });
			}

			case "clone": {
				denySecurityApprovals(session.sessionId);
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
				// 空会话只是当前编辑上下文，不属于历史任务；首条 prompt 生成标题并落盘后才展示。
				const items: RpcSessionListItem[] = sessions.filter((item) => item.messageCount > 0).map((item) => ({
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

			// 桌面标题栏刷新按钮：强制联网重拉平台模型清单（refreshModels -> listModels -> GET /api/cli/models），
			// 让管理端修改 visionRouting、输入模态等能力后无需重启 sidecar 即可生效；
			// 随后重解析当前选中模型，使 agent.state.model 拿到新的 input 能力（决定图片是否内联）。
			case "refresh_models": {
				await session.modelRuntime.refresh({ allowNetwork: true });
				session.refreshCurrentModelFromRegistry();
				const models = await session.modelRuntime.getAvailable();
				return success(id, "refresh_models", { models });
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

			// Design 入口只读取项目名称与 ID，令牌和平台请求仍由 sidecar 持有。
			case "get_platform_projects": {
				const platformUrl = getPlatformUrl();
				if (!platformUrl) return error(id, "get_platform_projects", "未配置 GitPilot 平台地址");
				const token = await loadCliToken(platformUrl);
				if (!token) return error(id, "get_platform_projects", "未登录 GitPilot 平台");
				const projects = await listProjects(platformUrl, token, command.keyword);
				return success(id, "get_platform_projects", { projects });
			}

			// 输入框“工作项”页签只取当前账号负责的轻量摘要，令牌和平台请求始终留在 sidecar 内。
			case "get_platform_work_items": {
				const platformUrl = getPlatformUrl();
				if (!platformUrl) return error(id, "get_platform_work_items", "未配置 GitPilot 平台地址");
				const token = await loadCliToken(platformUrl);
				if (!token) return error(id, "get_platform_work_items", "未登录 GitPilot 平台");
				const page = await listMyTasks(platformUrl, token, { page: 1, size: 100 }, { timeoutMs: 10_000 });
				return success(id, "get_platform_work_items", { items: page.records });
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
					project: "查询项目列表并通过对话绑定当前工作区",
					requirement: "列出负责人是我的需求，选中后进行技术设计与开发",
					llama: "管理 llama.cpp 本地推理模型",
					rtk: "配置 RTK 命令重写与工具输出压缩优化",
					goal: "设定会话目标，持续执行直至目标完成",
					plan: "进入只读计划模式，探索代码并制定实施计划",
				};
				const commands: RpcSlashCommand[] = [];

				for (const command of session.extensionRunner.getRegisteredCommands()) {
					if (!isDesktopCommandVisible(command.invocationName)) continue;
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
				// Desktop 隐藏的命令不能通过手工构造 RPC 请求绕过命令面板继续调用。
				if (!isDesktopCommandVisible(name)) return error(id, "execute_command", `桌面端不支持扩展命令：/${name}`);
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
		denySecurityApprovals();
		await sandboxExecutor.shutdown();
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
