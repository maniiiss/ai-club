/**
 * 受限 Git 服务门面：状态、Diff、分支、暂存、解除误跟踪、提交与远程同步的统一编排层。
 *
 * 业务意图：
 * - RPC 层只做参数解包与本类调用，git 业务全部收敛在 core/git（避免 rpc-mode 继续膨胀）。
 * - 每个写操作对应固定的参数模板；路径必须为仓库相对路径（拒绝绝对路径与 .. 逃逸）。
 * - 同一仓库同时只允许一个写操作（OPERATION_IN_PROGRESS），写前校验 expectedVersion，
 *   写成功后 repositoryVersion 自增并强制重读状态，向 UI 返回新快照。
 */

import { createHash } from "node:crypto";
import { GitServiceError } from "./git-types.ts";
import type { GitBranchInfo, GitChangeCounts, GitDiffResult, GitFileStatus, GitRepositoryState } from "./git-types.ts";
import { GIT_READ_TIMEOUT_MS, GIT_WRITE_TIMEOUT_MS, runGitChecked, runGitProcess } from "./git-process.ts";
import { parsePorcelainV2 } from "./porcelain-v2.ts";

/** 单文件 diff 的截断上限（1MB），保护 WebView 不被超大 diff 撑爆。 */
const DIFF_MAX_BYTES = 1024 * 1024;
/** 提交信息生成用的整体暂存 diff 上限（24KB），控制进入模型上下文的体积。 */
const STAGED_SUMMARY_MAX_BYTES = 24 * 1024;
/** 变更文件超过该数量时状态进入摘要模式：只返回前 N 条，UI 提示分页。 */
const STATUS_FILE_LIMIT = 2000;

/** 服务向 RPC 层广播的操作/状态事件，由 rpc-mode 转成 git_* 事件输出。 */
export type GitServiceEvent =
	| { type: "git_operation_started"; operationId: string; kind: string }
	| { type: "git_operation_completed"; operationId: string; kind: string; repositoryVersion: number }
	| { type: "git_operation_failed"; operationId: string; kind: string; errorCode: string; message: string }
	| { type: "git_operation_cancelled"; operationId: string; kind: string }
	| { type: "git_state_changed"; repositoryVersion: number };

/** 写操作返回：新版本号 + 强制重读后的完整状态，UI 无需再发一次 get_state。 */
export interface GitWriteResult {
	repositoryVersion: number;
	state: GitRepositoryState;
}

function operationId(): string {
	return `git-op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 校验路径为仓库相对路径：非空、非绝对、无 .. 段；统一为正斜杠。 */
function normalizeRepoPath(input: string): string {
	const path = input.replaceAll("\\", "/").trim();
	if (!path || path.startsWith("/") || path.startsWith("~") || /^[A-Za-z]:/.test(path)) {
		throw new GitServiceError("INVALID_INPUT", `非法路径：${input}`);
	}
	const segments = path.split("/");
	if (segments.some((segment) => segment === "..")) {
		throw new GitServiceError("INVALID_INPUT", `路径不能包含 ..：${input}`);
	}
	return path;
}

export class RepositoryService {
	/** 事件回调由 rpc-mode 注入，用于向 Desktop 广播 git_* 事件。 */
	private eventHandler: ((event: GitServiceEvent) => void) | undefined;
	/** cwd -> 仓库根 缓存，避免每次操作重复 rev-parse。 */
	private readonly rootCache = new Map<string, string>();
	/** 仓库根 -> repositoryVersion，写操作成功后自增。 */
	private readonly versions = new Map<string, number>();
	/** 仓库根 -> 是否有写操作进行中；同一仓库写操作互斥，不排队。 */
	private readonly activeWrites = new Map<string, boolean>();
	/** operationId -> AbortController，供 git_cancel_operation 取消。 */
	private readonly cancellable = new Map<string, AbortController>();

	onEvent(handler: (event: GitServiceEvent) => void): void {
		this.eventHandler = handler;
	}

	private emit(event: GitServiceEvent): void {
		this.eventHandler?.(event);
	}

	cancelOperation(id: string): boolean {
		const controller = this.cancellable.get(id);
		if (!controller) return false;
		controller.abort();
		return true;
	}

	/** 解析 cwd 所在仓库根；非仓库抛 NOT_A_REPOSITORY。 */
	private async resolveRoot(cwd: string): Promise<string> {
		const cached = this.rootCache.get(cwd);
		if (cached) return cached;
		const result = await runGitChecked({ cwd, args: ["rev-parse", "--show-toplevel"], operationId: operationId(), readOnly: true, timeoutMs: GIT_READ_TIMEOUT_MS });
		const root = result.stdout.trim();
		if (!root) throw new GitServiceError("NOT_A_REPOSITORY", "当前目录不是 Git 仓库");
		this.rootCache.set(cwd, root);
		return root;
	}

	private repositoryId(root: string): string {
		return createHash("sha256").update(root).digest("hex").slice(0, 12);
	}

	private versionOf(root: string): number {
		return this.versions.get(root) ?? 0;
	}

	/** 读取仓库完整状态；超过 2000 个变更文件进入摘要模式。 */
	async getState(cwd: string): Promise<GitRepositoryState> {
		const root = await this.resolveRoot(cwd);
		return this.readState(root);
	}

	private async readState(root: string): Promise<GitRepositoryState> {
		const result = await runGitChecked({ cwd: root, args: ["status", "--porcelain=v2", "-z", "--branch"], operationId: operationId(), readOnly: true, timeoutMs: GIT_READ_TIMEOUT_MS });
		const parsed = parsePorcelainV2(result.stdout);
		// 每文件增删行数：worktree 与 staged 各查一次 numstat（-M 对齐状态的重命名检测）。
		const worktreeCounts = await this.readNumstat(root, false);
		const stagedCounts = await this.readNumstat(root, true);
		const ignoredTracked = await this.readIgnoredTracked(root);
		const files: GitFileStatus[] = parsed.files.slice(0, STATUS_FILE_LIMIT).map((file) => ({
			...file,
			...(ignoredTracked.has(file.path) ? { ignoredTracked: true } : {}),
			worktreeCounts: worktreeCounts.get(file.path) ?? null,
			stagedCounts: stagedCounts.get(file.path) ?? null,
		}));
		return {
			repositoryId: this.repositoryId(root),
			repositoryVersion: this.versionOf(root),
			branch: parsed.branch,
			detached: parsed.detached,
			upstream: parsed.upstream,
			ahead: parsed.ahead,
			behind: parsed.behind,
			files,
		};
	}

	/** 解析 numstat 输出为 路径 -> 增删行数；失败或 unborn 仓库返回空表（计数可缺省）。 */
	private async readNumstat(root: string, staged: boolean): Promise<Map<string, GitChangeCounts>> {
		const counts = new Map<string, GitChangeCounts>();
		const args = ["diff", "--numstat", "-M"];
		if (staged) args.push("--cached");
		const result = await runGitProcess({ cwd: root, args, operationId: operationId(), readOnly: true, timeoutMs: GIT_READ_TIMEOUT_MS });
		if (result.code !== 0) return counts;
		for (const line of result.stdout.split(/\r?\n/)) {
			if (!line.trim()) continue;
			const [added, removed, ...pathParts] = line.split("\t");
			const path = pathParts.join("\t");
			if (!path) continue;
			// 二进制文件显示 "-\t-\t"，无法给出行数。
			if (!/^\d+$/.test(added) || !/^\d+$/.test(removed)) continue;
			counts.set(path, { added: Number.parseInt(added, 10), removed: Number.parseInt(removed, 10) });
		}
		return counts;
	}

	/**
	 * 误跟踪集合：已进 index 但命中排除标准（.gitignore / .git/info/exclude / core.excludesFile）的路径。
	 * 命令失败时返回空集合降级（只是少了新分组，不阻断状态读取），与 readNumstat 策略一致。
	 */
	private async readIgnoredTracked(root: string): Promise<Set<string>> {
		const ignored = new Set<string>();
		const result = await runGitProcess({ cwd: root, args: ["ls-files", "--cached", "--ignored", "--exclude-standard", "-z"], operationId: operationId(), readOnly: true, timeoutMs: GIT_READ_TIMEOUT_MS });
		if (result.code !== 0) return ignored;
		for (const entry of result.stdout.split("\0")) {
			if (entry) ignored.add(entry);
		}
		return ignored;
	}

	/** 单文件 unified diff；scope=staged 读暂存区，untracked 文件返回空 diff 由 UI 占位。 */
	async getDiff(cwd: string, scope: "worktree" | "staged", path: string): Promise<GitDiffResult> {
		const root = await this.resolveRoot(cwd);
		const repoPath = normalizeRepoPath(path);
		const args = ["diff", "--no-ext-diff", "--unified=3", "--no-color"];
		if (scope === "staged") args.push("--cached");
		args.push("--", repoPath);
		const result = await runGitChecked(
			{ cwd: root, args, operationId: operationId(), readOnly: true, timeoutMs: GIT_READ_TIMEOUT_MS },
			{ maxOutputBytes: DIFF_MAX_BYTES },
		);
		const binary = result.stdout.includes("Binary files") && result.stdout.includes("differ");
		return {
			path: repoPath,
			scope,
			diff: binary ? "" : result.stdout,
			truncated: result.truncated,
			binary,
		};
	}

	/** 供提交信息生成：暂存文件清单 + 截断的整体暂存 diff（只读，不经过写锁）。 */
	async getStagedDiffSummary(cwd: string): Promise<{ files: string[]; diff: string; truncated: boolean; binary: boolean }> {
		const root = await this.resolveRoot(cwd);
		const names = await runGitChecked({
			cwd: root,
			args: ["diff", "--cached", "--name-only"],
			operationId: operationId(),
			readOnly: true,
			timeoutMs: GIT_READ_TIMEOUT_MS,
		});
		const files = names.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
		if (files.length === 0) throw new GitServiceError("NOTHING_STAGED", "暂存区没有可提交的变更");
		const result = await runGitChecked(
			{ cwd: root, args: ["diff", "--cached", "--no-ext-diff", "--unified=3", "--no-color"], operationId: operationId(), readOnly: true, timeoutMs: GIT_READ_TIMEOUT_MS },
			{ maxOutputBytes: STAGED_SUMMARY_MAX_BYTES },
		);
		const binary = result.stdout.includes("Binary files") && result.stdout.includes("differ");
		return { files, diff: binary ? "" : result.stdout, truncated: result.truncated, binary };
	}

	/** 分支列表：本地可切换、远程只读；本地与远程分两次查询，避免按名字猜类型。 */
	async listBranches(cwd: string): Promise<GitBranchInfo[]> {
		const root = await this.resolveRoot(cwd);
		const local = await runGitChecked({
			cwd: root,
			args: ["for-each-ref", "--format=%(refname:short)%09%(HEAD)%09%(upstream:short)", "refs/heads"],
			operationId: operationId(),
			readOnly: true,
			timeoutMs: GIT_READ_TIMEOUT_MS,
		});
		const remote = await runGitChecked({
			cwd: root,
			args: ["for-each-ref", "--format=%(refname:short)", "refs/remotes"],
			operationId: operationId(),
			readOnly: true,
			timeoutMs: GIT_READ_TIMEOUT_MS,
		});
		const branches: GitBranchInfo[] = [];
		for (const line of local.stdout.split(/\r?\n/)) {
			if (!line.trim()) continue;
			const [name, headMark, upstream] = line.split("\t");
			if (!name) continue;
			branches.push({ name, kind: "local", current: headMark === "*", upstream: upstream || null });
		}
		for (const line of remote.stdout.split(/\r?\n/)) {
			const name = line.trim();
			if (!name || name.endsWith("/HEAD")) continue;
			branches.push({ name, kind: "remote", current: false, upstream: null });
		}
		return branches;
	}

	/** 写操作统一入口：互斥校验、版本校验、事件广播与强制状态刷新。 */
	private async runWrite<T>(root: string, kind: string, expectedVersion: number | undefined, action: (signal: AbortSignal, id: string) => Promise<T>): Promise<GitWriteResult> {
		if (this.activeWrites.get(root)) {
			throw new GitServiceError("OPERATION_IN_PROGRESS", "已有 Git 写操作进行中，请稍候");
		}
		if (expectedVersion !== undefined && expectedVersion !== this.versionOf(root)) {
			throw new GitServiceError("STALE_REPOSITORY_VERSION", "仓库状态已变化，请刷新后重试");
		}
		const id = operationId();
		const controller = new AbortController();
		this.cancellable.set(id, controller);
		this.activeWrites.set(root, true);
		this.emit({ type: "git_operation_started", operationId: id, kind });
		try {
			await action(controller.signal, id);
			const nextVersion = this.versionOf(root) + 1;
			this.versions.set(root, nextVersion);
			const state = await this.readState(root);
			this.emit({ type: "git_operation_completed", operationId: id, kind, repositoryVersion: nextVersion });
			this.emit({ type: "git_state_changed", repositoryVersion: nextVersion });
			return { repositoryVersion: nextVersion, state };
		} catch (error) {
			if (controller.signal.aborted) {
				this.emit({ type: "git_operation_cancelled", operationId: id, kind });
				throw new GitServiceError("OPERATION_CANCELLED", "操作已取消");
			}
			const code = error instanceof GitServiceError ? error.code : "GIT_FAILED";
			const message = error instanceof Error ? error.message : String(error);
			this.emit({ type: "git_operation_failed", operationId: id, kind, errorCode: code, message });
			throw error instanceof GitServiceError ? error : new GitServiceError("GIT_FAILED", message);
		} finally {
			this.cancellable.delete(id);
			this.activeWrites.set(root, false);
		}
	}

	/** 暂存明确路径；路径先经仓库相对校验，git add 自身也会拒绝仓库外路径。 */
	async stagePaths(cwd: string, paths: string[]): Promise<GitWriteResult> {
		const root = await this.resolveRoot(cwd);
		const repoPaths = paths.map((path) => normalizeRepoPath(path));
		if (repoPaths.length === 0) throw new GitServiceError("INVALID_INPUT", "没有可暂存的路径");
		return this.runWrite(root, "stage", undefined, async (signal, id) => {
			await runGitChecked({ cwd: root, args: ["add", "--", ...repoPaths], operationId: id, readOnly: false, timeoutMs: GIT_READ_TIMEOUT_MS }, { signal });
		});
	}

	/** 取消暂存：常规仓库 reset HEAD，unborn 仓库（尚无提交）用 rm --cached。 */
	async unstagePaths(cwd: string, paths: string[]): Promise<GitWriteResult> {
		const root = await this.resolveRoot(cwd);
		const repoPaths = paths.map((path) => normalizeRepoPath(path));
		if (repoPaths.length === 0) throw new GitServiceError("INVALID_INPUT", "没有可取消暂存的路径");
		return this.runWrite(root, "unstage", undefined, async (signal, id) => {
			// unborn 探测预期可能失败，必须用不抛错的 runGitProcess 判断退出码。
			const hasHead = await runGitProcess({ cwd: root, args: ["rev-parse", "--verify", "--quiet", "HEAD"], operationId: id, readOnly: true, timeoutMs: GIT_READ_TIMEOUT_MS });
			if (hasHead.code === 0) {
				await runGitChecked({ cwd: root, args: ["reset", "--quiet", "HEAD", "--", ...repoPaths], operationId: id, readOnly: false, timeoutMs: GIT_READ_TIMEOUT_MS }, { signal });
			} else {
				await runGitChecked({ cwd: root, args: ["rm", "--cached", "--quiet", "-r", "--", ...repoPaths], operationId: id, readOnly: false, timeoutMs: GIT_READ_TIMEOUT_MS }, { signal });
			}
		});
	}

	/**
	 * 解除误跟踪：git rm --cached 只从 index 移除，工作区文件保留。
	 * 解除后文件以"已暂存删除"形态出现，提交该删除后忽略规则才真正生效。
	 */
	async untrackPaths(cwd: string, paths: string[]): Promise<GitWriteResult> {
		const root = await this.resolveRoot(cwd);
		const repoPaths = paths.map((path) => normalizeRepoPath(path));
		if (repoPaths.length === 0) throw new GitServiceError("INVALID_INPUT", "没有可解除跟踪的路径");
		return this.runWrite(root, "untrack", undefined, async (signal, id) => {
			await runGitChecked({ cwd: root, args: ["rm", "--cached", "--quiet", "-r", "--", ...repoPaths], operationId: id, readOnly: false, timeoutMs: GIT_READ_TIMEOUT_MS }, { signal });
		});
	}

	/** 提交暂存区：消息非空、暂存区非空（依据 porcelain 状态）双校验。 */
	async commit(cwd: string, message: string, expectedVersion?: number): Promise<GitWriteResult & { commitSha: string }> {
		const root = await this.resolveRoot(cwd);
		const trimmed = message.trim();
		if (!trimmed) throw new GitServiceError("INVALID_INPUT", "提交消息不能为空");
		const current = await this.readState(root);
		if (!current.files.some((file) => file.staged)) {
			throw new GitServiceError("NOTHING_STAGED", "暂存区没有可提交的变更");
		}
		return this.runWrite(root, "commit", expectedVersion, async (signal, id) => {
			await runGitChecked({ cwd: root, args: ["commit", "-m", trimmed], operationId: id, readOnly: false, timeoutMs: GIT_READ_TIMEOUT_MS }, { signal });
		}).then(async (result) => {
			const head = await runGitChecked({ cwd: root, args: ["rev-parse", "HEAD"], operationId: operationId(), readOnly: true, timeoutMs: GIT_READ_TIMEOUT_MS });
			return { ...result, commitSha: head.stdout.trim() };
		});
	}

	/** 创建分支（可选同时切换）；名称先经 git check-ref-format 校验。 */
	async createBranch(cwd: string, name: string, switchTo: boolean): Promise<GitWriteResult> {
		const root = await this.resolveRoot(cwd);
		const trimmed = name.trim();
		if (!trimmed) throw new GitServiceError("INVALID_INPUT", "分支名不能为空");
		return this.runWrite(root, "create_branch", undefined, async (signal, id) => {
			const check = await runGitProcess({ cwd: root, args: ["check-ref-format", "--branch", trimmed], operationId: id, readOnly: true, timeoutMs: GIT_READ_TIMEOUT_MS });
			if (check.code !== 0) throw new GitServiceError("INVALID_INPUT", `非法分支名：${trimmed}`);
			await runGitChecked({ cwd: root, args: ["branch", trimmed], operationId: id, readOnly: false, timeoutMs: GIT_READ_TIMEOUT_MS }, { signal });
			if (switchTo) {
				await runGitChecked({ cwd: root, args: ["switch", trimmed], operationId: id, readOnly: false, timeoutMs: GIT_READ_TIMEOUT_MS }, { signal });
			}
		});
	}

	/** 切换分支；本地变更会被覆盖时由 Git 阻断并映射 WORKTREE_WOULD_BE_OVERWRITTEN。 */
	async switchBranch(cwd: string, name: string, expectedVersion?: number): Promise<GitWriteResult> {
		const root = await this.resolveRoot(cwd);
		const trimmed = name.trim();
		if (!trimmed) throw new GitServiceError("INVALID_INPUT", "分支名不能为空");
		return this.runWrite(root, "switch_branch", expectedVersion, async (signal, id) => {
			await runGitChecked({ cwd: root, args: ["switch", trimmed], operationId: id, readOnly: false, timeoutMs: GIT_READ_TIMEOUT_MS }, { signal });
		});
	}

	/** 解析默认远程：优先 origin，否则第一个远程，没有则抛 NO_REMOTE。 */
	private async defaultRemote(root: string, id: string): Promise<string> {
		const result = await runGitChecked({ cwd: root, args: ["remote"], operationId: id, readOnly: true, timeoutMs: GIT_READ_TIMEOUT_MS });
		const names = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
		if (names.length === 0) throw new GitServiceError("NO_REMOTE", "仓库没有配置远程");
		return names.includes("origin") ? "origin" : names[0];
	}

	/** fetch 远程 refs；只更新 remote-tracking，不触碰工作区。 */
	async fetch(cwd: string, remote?: string): Promise<GitWriteResult> {
		const root = await this.resolveRoot(cwd);
		return this.runWrite(root, "fetch", undefined, async (signal, id) => {
			const target = remote?.trim() || (await this.defaultRemote(root, id));
			await runGitChecked({ cwd: root, args: ["fetch", "--quiet", target], operationId: id, readOnly: false, timeoutMs: GIT_WRITE_TIMEOUT_MS }, { signal });
		});
	}

	/** 仅快进拉取；分叉时由 Git 阻断并映射 NON_FAST_FORWARD。 */
	async pullFfOnly(cwd: string, expectedVersion?: number): Promise<GitWriteResult> {
		const root = await this.resolveRoot(cwd);
		return this.runWrite(root, "pull_ff_only", expectedVersion, async (signal, id) => {
			await runGitChecked({ cwd: root, args: ["pull", "--ff-only", "--quiet"], operationId: id, readOnly: false, timeoutMs: GIT_WRITE_TIMEOUT_MS }, { signal });
		});
	}

	/**
	 * 普通推送当前分支；setUpstream 为 true 时用 --set-upstream 绑定默认远程，
	 * 不支持任何 force/refspec 删除参数（安全矩阵见设计文档 §5.3）。
	 */
	async push(cwd: string, expectedVersion?: number, setUpstream?: boolean): Promise<GitWriteResult> {
		const root = await this.resolveRoot(cwd);
		return this.runWrite(root, "push", expectedVersion, async (signal, id) => {
			if (!setUpstream) {
				await runGitChecked({ cwd: root, args: ["push", "--quiet"], operationId: id, readOnly: false, timeoutMs: GIT_WRITE_TIMEOUT_MS }, { signal });
				return;
			}
			const state = await this.readState(root);
			if (!state.branch) throw new GitServiceError("INVALID_INPUT", "detached HEAD 无法设置上游推送");
			const remote = await this.defaultRemote(root, id);
			await runGitChecked({ cwd: root, args: ["push", "--quiet", "--set-upstream", remote, state.branch], operationId: id, readOnly: false, timeoutMs: GIT_WRITE_TIMEOUT_MS }, { signal });
		});
	}
}
