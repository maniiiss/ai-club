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
import type { AgentSessionEvent } from "../../core/agent-session.ts";
import type { AgentSessionRuntime } from "../../core/agent-session-runtime.ts";
import { prepareAttachment } from "../../core/attachments/prepare-attachment.ts";
import { SessionManager } from "../../core/session-manager.ts";
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
		{ resolve: (value: any) => void; reject: (error: Error) => void }
	>();

	// Shutdown request flag
	let shutdownRequested = false;
	let shuttingDown = false;
	const signalCleanupHandlers: Array<() => void> = [];

	/** Helper for dialog methods with signal/timeout support */
	function createDialogPromise<T>(
		opts: ExtensionUIDialogOptions | undefined,
		defaultValue: T,
		request: Record<string, unknown>,
		parseResponse: (response: RpcExtensionUIResponse) => T,
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
			});
			output({ type: "extension_ui_request", id, ...request } as RpcExtensionUIRequest);
		});
	}

	/**
	 * Create an extension UI context that uses the RPC protocol.
	 */
	const createExtensionUIContext = (): ExtensionUIContext => ({
		select: (title, options, opts) =>
			createDialogPromise(opts, undefined, { method: "select", title, options, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? undefined : "value" in r ? r.value : undefined,
			),

		confirm: (title, message, opts) =>
			createDialogPromise(opts, false, { method: "confirm", title, message, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? false : "confirmed" in r ? r.confirmed : false,
			),

		input: (title, placeholder, opts) =>
			createDialogPromise(opts, undefined, { method: "input", title, placeholder, timeout: opts?.timeout }, (r) =>
				"cancelled" in r && r.cancelled ? undefined : "value" in r ? r.value : undefined,
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
				});
				output({ type: "extension_ui_request", id, method: "editor", title, prefill } as RpcExtensionUIRequest);
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
	});

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
						}
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
				const result = await runtimeHost.switchSession(command.sessionPath);
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
