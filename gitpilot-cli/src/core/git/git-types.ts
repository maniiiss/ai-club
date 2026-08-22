/**
 * Git 面板跨进程共享类型。
 *
 * 业务意图：CLI sidecar 的受限 Git 服务与 Desktop 右侧栏 Git 页板之间的稳定契约，
 * 与 gitpilot-desktop/src/rpc/types.ts 中的镜像保持手工同步（协议两端不共享包）。
 */

/** 暂存区状态字母：新增/修改/删除/重命名/复制/冲突。 */
export type GitStagedStatus = "A" | "M" | "D" | "R" | "C" | "U";

/** 工作区状态字母：修改/删除/冲突（A 仅出现在冲突条目 AA/AU/UA 的 Y 侧）。 */
export type GitWorktreeStatus = "M" | "D" | "U" | "A";

/** 单文件的增删行数统计（来自 git diff --numstat）；二进制/未知时为 null。 */
export interface GitChangeCounts {
	added: number;
	removed: number;
}

/** 单个文件的 Git 状态，路径为仓库相对路径（正斜杠分隔）。 */
export interface GitFileStatus {
	path: string;
	/** 暂存区相对 HEAD 的状态；null 表示暂存区无变化。 */
	staged: GitStagedStatus | null;
	/** 工作区相对暂存区的状态；null 表示工作区无变化。 */
	worktree: GitWorktreeStatus | null;
	/** 未跟踪文件（git status 的 ? 条目）。 */
	untracked: boolean;
	/** 处于合并/变基冲突中（u 条目），UI 中归入冲突组置顶。 */
	conflicted: boolean;
	/**
	 * 误跟踪文件：已进 index 但命中忽略规则（.gitignore 等排除标准）。
	 * 仅在为 true 时写入（undefined 等价 false），旧 Desktop/旧 sidecar 混布时天然兼容。
	 */
	ignoredTracked?: boolean;
	/** 暂存区增删行数（相对 HEAD）。 */
	stagedCounts: GitChangeCounts | null;
	/** 工作区增删行数（相对暂存区）。 */
	worktreeCounts: GitChangeCounts | null;
}

/** 仓库整体状态快照，Git 面板所有视图的单一数据源。 */
export interface GitRepositoryState {
	/** 规范化仓库根路径哈希，用于多仓库识别，不向 UI 暴露绝对路径语义。 */
	repositoryId: string;
	/** 每次写操作成功后自增；UI 写请求携带 expectedVersion 做乐观并发保护。 */
	repositoryVersion: number;
	branch: string | null;
	/** 处于 detached HEAD 时 branch 为 null 且 detached 为 true。 */
	detached: boolean;
	upstream: string | null;
	ahead: number;
	behind: number;
	files: GitFileStatus[];
}

/** 分支条目：本地分支可切换，远程分支只读展示。 */
export interface GitBranchInfo {
	name: string;
	kind: "local" | "remote";
	current: boolean;
	upstream: string | null;
}

/** 单文件 unified diff 结果，原文返回由前端渲染，服务端只做截断与二进制探测。 */
export interface GitDiffResult {
	path: string;
	scope: "worktree" | "staged";
	diff: string;
	/** 超过字节上限被截断时为 true，UI 必须提示不完整。 */
	truncated: boolean;
	binary: boolean;
}

/** Git 服务稳定错误码；UI 按 code 映射文案与后续动作，不解析 stderr 原文。 */
export type GitErrorCode =
	| "GIT_NOT_FOUND"
	| "NOT_A_REPOSITORY"
	| "STALE_REPOSITORY_VERSION"
	| "OPERATION_IN_PROGRESS"
	| "OPERATION_CANCELLED"
	| "WORKTREE_WOULD_BE_OVERWRITTEN"
	| "NON_FAST_FORWARD"
	| "AUTHENTICATION_FAILED"
	| "NETWORK_FAILED"
	| "OUTPUT_LIMIT_EXCEEDED"
	| "NO_REMOTE"
	| "NO_UPSTREAM"
	| "NOTHING_STAGED"
	| "INVALID_INPUT"
	| "GIT_FAILED";

/** 携带稳定错误码的 Git 服务异常；RPC 层转为 "CODE: message" 文本。 */
export class GitServiceError extends Error {
	readonly code: GitErrorCode;

	constructor(code: GitErrorCode, message: string) {
		super(message);
		this.name = "GitServiceError";
		this.code = code;
	}
}

/** 类型守卫：把未知异常收敛为 GitServiceError。 */
export function isGitServiceError(error: unknown): error is GitServiceError {
	return error instanceof GitServiceError;
}
