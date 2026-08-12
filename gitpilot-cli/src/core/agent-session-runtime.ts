import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { resolvePath } from "../utils/paths.ts";
import type { AgentSession } from "./agent-session.ts";
import {
	EXECUTION_RUN_ENTRY_CUSTOM_TYPE,
	restoreExecutionSnapshotFromEntry,
	type AgentExecutionSnapshot,
	type AgentExecutionSummary,
} from "./agent-execution-state.ts";
import type { AgentSessionRuntimeDiagnostic, AgentSessionServices } from "./agent-session-services.ts";
import type {
	ProjectTrustContext,
	ReplacedSessionContext,
	SessionShutdownEvent,
	SessionStartEvent,
} from "./extensions/index.ts";
import { emitSessionShutdownEvent } from "./extensions/runner.ts";
import type { CreateAgentSessionResult } from "./sdk.ts";
import { assertSessionCwdExists } from "./session-cwd.ts";
import { SessionManager } from "./session-manager.ts";

/**
 * Result returned by runtime creation.
 *
 * The caller gets the created session, its cwd-bound services, and all
 * diagnostics collected during setup.
 */
export interface CreateAgentSessionRuntimeResult extends CreateAgentSessionResult {
	services: AgentSessionServices;
	diagnostics: AgentSessionRuntimeDiagnostic[];
}

/**
 * Creates a full runtime for a target cwd and session manager.
 *
 * The factory closes over process-global fixed inputs, recreates cwd-bound
 * services for the effective cwd, resolves session options against those
 * services, and finally creates the AgentSession.
 */
export type CreateAgentSessionRuntimeFactory = (options: {
	cwd: string;
	agentDir: string;
	sessionManager: SessionManager;
	sessionStartEvent?: SessionStartEvent;
	projectTrustContext?: ProjectTrustContext;
}) => Promise<CreateAgentSessionRuntimeResult>;

/**
 * 被桌面端暂时切离但仍在执行的会话快照。
 * 保留同一个 AgentSession 实例，切换任务时不能重新创建或 dispose，否则会触发 abort。
 */
interface SuspendedSessionRuntime {
	session: AgentSession;
	services: AgentSessionServices;
	diagnostics: readonly AgentSessionRuntimeDiagnostic[];
	modelFallbackMessage?: string;
}

/**
 * Thrown when /import references a JSONL file path that does not exist.
 */
export class SessionImportFileNotFoundError extends Error {
	readonly filePath: string;

	constructor(filePath: string) {
		super(`文件未找到：${filePath}`);
		this.name = "SessionImportFileNotFoundError";
		this.filePath = filePath;
	}
}

function extractUserMessageText(content: string | Array<{ type: string; text?: string }>): string {
	if (typeof content === "string") {
		return content;
	}

	return content
		.filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("");
}

/**
 * Owns the current AgentSession plus its cwd-bound services.
 *
 * Session replacement methods either tear down an idle runtime or suspend an
 * active one before creating/applying the next runtime. If creation fails, the
 * error is propagated to the caller. The caller is responsible for user-facing
 * error handling.
 */
export class AgentSessionRuntime {
	private rebindSession?: (session: AgentSession) => Promise<void>;
	private beforeSessionInvalidate?: () => void;
	private _session: AgentSession;
	private _services: AgentSessionServices;
	private readonly createRuntime: CreateAgentSessionRuntimeFactory;
	private _diagnostics: AgentSessionRuntimeDiagnostic[];
	private _modelFallbackMessage?: string;
	private readonly suspendedSessions = new Map<string, SuspendedSessionRuntime>();

	constructor(
		_session: AgentSession,
		_services: AgentSessionServices,
		createRuntime: CreateAgentSessionRuntimeFactory,
		_diagnostics: AgentSessionRuntimeDiagnostic[] = [],
		_modelFallbackMessage?: string,
	) {
		this._session = _session;
		this._services = _services;
		this.createRuntime = createRuntime;
		this._diagnostics = _diagnostics;
		this._modelFallbackMessage = _modelFallbackMessage;
	}

	get services(): AgentSessionServices {
		return this._services;
	}

	get session(): AgentSession {
		return this._session;
	}

	get cwd(): string {
		return this._services.cwd;
	}

	get diagnostics(): readonly AgentSessionRuntimeDiagnostic[] {
		return this._diagnostics;
	}

	get modelFallbackMessage(): string | undefined {
		return this._modelFallbackMessage;
	}

	setRebindSession(rebindSession?: (session: AgentSession) => Promise<void>): void {
		this.rebindSession = rebindSession;
	}

	/**
	 * Set a synchronous callback that runs after `session_shutdown` handlers finish
	 * but before the current session is invalidated.
	 *
	 * This is for host-owned UI teardown that must not yield to the event loop,
	 * such as detaching extension-provided TUI components before the old extension
	 * context becomes stale.
	 */
	setBeforeSessionInvalidate(beforeSessionInvalidate?: () => void): void {
		this.beforeSessionInvalidate = beforeSessionInvalidate;
	}

	private async emitBeforeSwitch(
		reason: "new" | "resume",
		targetSessionFile?: string,
	): Promise<{ cancelled: boolean }> {
		const runner = this.session.extensionRunner;
		if (!runner.hasHandlers("session_before_switch")) {
			return { cancelled: false };
		}

		const result = await runner.emit({
			type: "session_before_switch",
			reason,
			targetSessionFile,
		});
		return { cancelled: result?.cancel === true };
	}

	private async emitBeforeFork(
		entryId: string,
		options: { position: "before" | "at" },
	): Promise<{ cancelled: boolean }> {
		const runner = this.session.extensionRunner;
		if (!runner.hasHandlers("session_before_fork")) {
			return { cancelled: false };
		}

		const result = await runner.emit({
			type: "session_before_fork",
			entryId,
			...options,
		});
		return { cancelled: result?.cancel === true };
	}

	private async teardownCurrent(reason: SessionShutdownEvent["reason"], targetSessionFile?: string): Promise<void> {
		await emitSessionShutdownEvent(this.session.extensionRunner, {
			type: "session_shutdown",
			reason,
			targetSessionFile,
		});
		this.beforeSessionInvalidate?.();
		this.session.dispose();
	}

	private apply(result: CreateAgentSessionRuntimeResult): void {
		this._session = result.session;
		this._services = result.services;
		this._diagnostics = result.diagnostics;
		this._modelFallbackMessage = result.modelFallbackMessage;
	}

	private applySuspended(snapshot: SuspendedSessionRuntime): void {
		this._session = snapshot.session;
		this._services = snapshot.services;
		this._diagnostics = [...snapshot.diagnostics];
		this._modelFallbackMessage = snapshot.modelFallbackMessage;
	}

	/** 当前会话正在运行或等待宿主交互时只摘下 UI 订阅，保留 Agent 上下文。 */
	private suspendCurrentIfRunning(preserveForInteraction = false): boolean {
		const sessionFile = this.session.sessionFile;
		if (!sessionFile || (!this.session.isStreaming && !preserveForInteraction)) return false;
		this.suspendedSessions.set(resolvePath(sessionFile), {
			session: this.session,
			services: this.services,
			diagnostics: this.diagnostics,
			modelFallbackMessage: this.modelFallbackMessage,
		});
		return true;
	}

	/** 供 RPC 列表返回任务运行态，桌面侧栏可在当前任务离开视口后继续显示 loading。 */
	isSessionStreaming(sessionPath: string): boolean {
		const normalizedPath = resolvePath(sessionPath);
		if (this.session.sessionFile && resolvePath(this.session.sessionFile) === normalizedPath) return this.session.isStreaming;
		return this.suspendedSessions.get(normalizedPath)?.session.isStreaming ?? false;
	}

	/**
	 * 查询目标会话的权威执行快照。
	 *
	 * 查询规则（设计文档 §7）：
	 * 1. 目标是当前 session，直接读取内存快照；
	 * 2. 目标在 suspendedSessions，读取保存的同一 AgentSession 实例的内存快照；
	 * 3. 目标未加载，从 SessionManager 最后一条 `gitpilot.execution-run.v1` 恢复终态摘要；
	 *    不为仅查看而创建完整 AgentSession runtime。
	 */
	getSessionExecutionSnapshot(sessionPath: string): AgentExecutionSnapshot | undefined {
		const normalizedPath = resolvePath(sessionPath);
		if (this.session.sessionFile && resolvePath(this.session.sessionFile) === normalizedPath) {
			return this.session.executionSnapshot;
		}
		const suspended = this.suspendedSessions.get(normalizedPath);
		if (suspended) {
			return suspended.session.executionSnapshot;
		}
		return this._restoreExecutionSnapshotFromHistory(sessionPath);
	}

	/** 查询目标会话的执行摘要（不含活动工具参数与输出），供 list_sessions 使用。 */
	getSessionExecutionSummary(sessionPath: string): AgentExecutionSummary | undefined {
		const snapshot = this.getSessionExecutionSnapshot(sessionPath);
		if (!snapshot) return undefined;
		return {
			runId: snapshot.runId,
			status: snapshot.status,
			phase: snapshot.phase,
			startedAt: snapshot.startedAt,
			endedAt: snapshot.endedAt,
			updatedAt: snapshot.updatedAt,
			sequence: snapshot.sequence,
			activeToolCount: snapshot.activeTools.length,
			activeToolName: snapshot.activeTools[0]?.toolName,
		};
	}

	/**
	 * 从未加载会话的 JSONL 历史恢复终态快照。
	 * 只读取最后一条 `gitpilot.execution-run.v1` custom entry；没有则返回 undefined
	 * （旧会话由调用方降级到首尾消息时间戳推断）。
	 */
	private _restoreExecutionSnapshotFromHistory(sessionPath: string): AgentExecutionSnapshot | undefined {
		try {
			const sessionManager = SessionManager.open(sessionPath);
			const entries = sessionManager.getEntries();
			for (let i = entries.length - 1; i >= 0; i -= 1) {
				const entry = entries[i];
				if (entry.type === "custom" && entry.customType === EXECUTION_RUN_ENTRY_CUSTOM_TYPE) {
					const timestamp = new Date(entry.timestamp).getTime();
					const restored = restoreExecutionSnapshotFromEntry(timestamp, entry.data);
					if (restored) return restored;
				}
			}
			return undefined;
		} catch {
			// 会话文件不存在或无法解析时静默降级。
			return undefined;
		}
	}

	private async finishSessionReplacement(withSession?: (ctx: ReplacedSessionContext) => Promise<void>): Promise<void> {
		if (this.rebindSession) {
			await this.rebindSession(this.session);
		}
		if (withSession) {
			await withSession(this.session.createReplacedSessionContext());
		}
	}

	async switchSession(
		sessionPath: string,
		options?: {
			cwdOverride?: string;
			withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
			/** 等待宿主确认的交互也必须保留原 extension 上下文，避免确认后无法继续。 */
			preserveCurrentForInteraction?: boolean;
			projectTrustContextFactory?: (cwd: string) => ProjectTrustContext;
		},
	): Promise<{ cancelled: boolean }> {
		const beforeResult = await this.emitBeforeSwitch("resume", sessionPath);
		if (beforeResult.cancelled) {
			return beforeResult;
		}

		const previousSessionFile = this.session.sessionFile;
		const sessionManager = SessionManager.open(sessionPath, undefined, options?.cwdOverride);
		assertSessionCwdExists(sessionManager, this.cwd);
		const sessionFile = sessionManager.getSessionFile();
		if (!sessionFile) {
			throw new Error("目标会话缺少 session 文件路径");
		}
		const targetSessionFile = resolvePath(sessionFile);
		// 重复点击当前任务时保持现有 Agent，不创建第二个 runtime，也不改变执行状态。
		if (this.session.sessionFile && resolvePath(this.session.sessionFile) === targetSessionFile) {
			return { cancelled: false };
		}
		const suspended = this.suspendedSessions.get(targetSessionFile);
		if (!this.suspendCurrentIfRunning(options?.preserveCurrentForInteraction)) {
			await this.teardownCurrent("resume", sessionManager.getSessionFile());
		}
		if (suspended) {
			this.suspendedSessions.delete(targetSessionFile);
			this.applySuspended(suspended);
		} else {
			this.apply(
				await this.createRuntime({
					cwd: sessionManager.getCwd(),
					agentDir: this.services.agentDir,
					sessionManager,
					sessionStartEvent: { type: "session_start", reason: "resume", previousSessionFile },
					projectTrustContext: options?.projectTrustContextFactory?.(sessionManager.getCwd()),
				}),
			);
		}
		await this.finishSessionReplacement(options?.withSession);
		return { cancelled: false };
	}

	async newSession(options?: {
		parentSession?: string;
		/** 任务工作目录；不传则用当前 runtime cwd。桌面版按项目/子目录创建任务时传入。 */
		cwd?: string;
		setup?: (sessionManager: SessionManager) => Promise<void>;
		withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
	}): Promise<{ cancelled: boolean }> {
		const beforeResult = await this.emitBeforeSwitch("new");
		if (beforeResult.cancelled) {
			return beforeResult;
		}

		const previousSessionFile = this.session.sessionFile;
		// 任务工作目录：默认当前 runtime cwd，可由调用方指定；切换后 services 与会话目录都归属该 cwd
		const targetCwd = options?.cwd ?? this.cwd;
		const sessionManager = this.session.sessionManager.isPersisted()
			? SessionManager.create(targetCwd)
			: SessionManager.inMemory(targetCwd);
		if (options?.parentSession) {
			sessionManager.newSession({ parentSession: options.parentSession });
		}

		if (!this.suspendCurrentIfRunning()) {
			await this.teardownCurrent("new", sessionManager.getSessionFile());
		}
		this.apply(
			await this.createRuntime({
				cwd: targetCwd,
				agentDir: this.services.agentDir,
				sessionManager,
				sessionStartEvent: { type: "session_start", reason: "new", previousSessionFile },
			}),
		);
		if (options?.setup) {
			await options.setup(this.session.sessionManager);
			this.session.agent.state.messages = this.session.sessionManager.buildSessionContext().messages;
		}
		await this.finishSessionReplacement(options?.withSession);
		return { cancelled: false };
	}

	async fork(
		entryId: string,
		options?: { position?: "before" | "at"; withSession?: (ctx: ReplacedSessionContext) => Promise<void> },
	): Promise<{ cancelled: boolean; selectedText?: string }> {
		const position = options?.position ?? "before";
		const beforeResult = await this.emitBeforeFork(entryId, { position });
		if (beforeResult.cancelled) {
			return { cancelled: true };
		}
		let targetLeafId: string | null;
		let selectedText: string | undefined;

		const selectedEntry = this.session.sessionManager.getEntry(entryId);
		if (!selectedEntry) {
			throw new Error("Invalid entry ID for forking");
		}

		if (position === "at") {
			targetLeafId = selectedEntry.id;
		} else {
			if (selectedEntry.type !== "message" || selectedEntry.message.role !== "user") {
				throw new Error("Invalid entry ID for forking");
			}
			targetLeafId = selectedEntry.parentId;
			selectedText = extractUserMessageText(selectedEntry.message.content);
		}

		const previousSessionFile = this.session.sessionFile;
		if (this.session.sessionManager.isPersisted()) {
			const currentSessionFile = this.session.sessionFile;
			if (!currentSessionFile) {
				throw new Error("持久化会话缺少会话文件");
			}
			const sessionDir = this.session.sessionManager.getSessionDir();
			if (!targetLeafId) {
				const sessionManager = SessionManager.create(this.cwd, sessionDir);
				sessionManager.newSession({ parentSession: currentSessionFile });
				await this.teardownCurrent("fork", sessionManager.getSessionFile());
				this.apply(
					await this.createRuntime({
						cwd: this.cwd,
						agentDir: this.services.agentDir,
						sessionManager,
						sessionStartEvent: { type: "session_start", reason: "fork", previousSessionFile },
					}),
				);
				await this.finishSessionReplacement(options?.withSession);
				return { cancelled: false, selectedText };
			}

			if (!existsSync(currentSessionFile)) {
				throw new Error(
					"此会话尚未保存。请等待首次智能体响应后再克隆或分叉。",
				);
			}
			const sessionManager = SessionManager.open(currentSessionFile, sessionDir);
			const forkedSessionPath = sessionManager.createBranchedSession(targetLeafId);
			if (!forkedSessionPath) {
				throw new Error("创建分叉会话失败");
			}
			await this.teardownCurrent("fork", sessionManager.getSessionFile());
			this.apply(
				await this.createRuntime({
					cwd: sessionManager.getCwd(),
					agentDir: this.services.agentDir,
					sessionManager,
					sessionStartEvent: { type: "session_start", reason: "fork", previousSessionFile },
				}),
			);
			await this.finishSessionReplacement(options?.withSession);
			return { cancelled: false, selectedText };
		}

		const sessionManager = this.session.sessionManager;
		if (!targetLeafId) {
			sessionManager.newSession({ parentSession: this.session.sessionFile });
		} else {
			sessionManager.createBranchedSession(targetLeafId);
		}
		await this.teardownCurrent("fork", sessionManager.getSessionFile());
		this.apply(
			await this.createRuntime({
				cwd: this.cwd,
				agentDir: this.services.agentDir,
				sessionManager,
				sessionStartEvent: { type: "session_start", reason: "fork", previousSessionFile },
			}),
		);
		await this.finishSessionReplacement(options?.withSession);
		return { cancelled: false, selectedText };
	}

	/**
	 * Import a session JSONL file and switch runtime state to the imported session.
	 *
	 * @returns `{ cancelled: true }` when cancelled by `session_before_switch`, otherwise `{ cancelled: false }`.
	 * @throws {SessionImportFileNotFoundError} When the input path does not exist.
	 * @throws {MissingSessionCwdError} When the imported session cwd cannot be resolved and no override is provided.
	 */
	async importFromJsonl(inputPath: string, cwdOverride?: string): Promise<{ cancelled: boolean }> {
		const resolvedPath = resolvePath(inputPath);
		if (!existsSync(resolvedPath)) {
			throw new SessionImportFileNotFoundError(resolvedPath);
		}

		const sessionDir = this.session.sessionManager.getSessionDir();
		if (!existsSync(sessionDir)) {
			mkdirSync(sessionDir, { recursive: true });
		}

		const destinationPath = join(sessionDir, basename(resolvedPath));
		const beforeResult = await this.emitBeforeSwitch("resume", destinationPath);
		if (beforeResult.cancelled) {
			return beforeResult;
		}

		const previousSessionFile = this.session.sessionFile;
		if (resolve(destinationPath) !== resolvedPath) {
			copyFileSync(resolvedPath, destinationPath);
		}

		const sessionManager = SessionManager.open(destinationPath, sessionDir, cwdOverride);
		assertSessionCwdExists(sessionManager, this.cwd);
		await this.teardownCurrent("resume", sessionManager.getSessionFile());
		this.apply(
			await this.createRuntime({
				cwd: sessionManager.getCwd(),
				agentDir: this.services.agentDir,
				sessionManager,
				sessionStartEvent: { type: "session_start", reason: "resume", previousSessionFile },
			}),
		);
		await this.finishSessionReplacement();
		return { cancelled: false };
	}

	async dispose(): Promise<void> {
		await emitSessionShutdownEvent(this.session.extensionRunner, {
			type: "session_shutdown",
			reason: "quit",
		});
		this.beforeSessionInvalidate?.();
		this.session.dispose();
		for (const suspended of this.suspendedSessions.values()) {
			if (suspended.session === this.session) continue;
			await emitSessionShutdownEvent(suspended.session.extensionRunner, {
				type: "session_shutdown",
				reason: "quit",
			});
			suspended.session.dispose();
		}
		this.suspendedSessions.clear();
	}
}

/**
 * Create the initial runtime from a runtime factory and initial session target.
 *
 * The same factory is stored on the returned AgentSessionRuntime and reused for
 * later /new, /resume, /fork, and import flows.
 */
export async function createAgentSessionRuntime(
	createRuntime: CreateAgentSessionRuntimeFactory,
	options: {
		cwd: string;
		agentDir: string;
		sessionManager: SessionManager;
		sessionStartEvent?: SessionStartEvent;
	},
): Promise<AgentSessionRuntime> {
	assertSessionCwdExists(options.sessionManager, options.cwd);
	const result = await createRuntime(options);
	return new AgentSessionRuntime(
		result.session,
		result.services,
		createRuntime,
		result.diagnostics,
		result.modelFallbackMessage,
	);
}

export {
	type AgentSessionRuntimeDiagnostic,
	type AgentSessionServices,
	type CreateAgentSessionFromServicesOptions,
	type CreateAgentSessionServicesOptions,
	createAgentSessionFromServices,
	createAgentSessionServices,
} from "./agent-session-services.ts";
