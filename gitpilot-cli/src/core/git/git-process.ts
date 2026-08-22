/**
 * Git 子进程唯一执行入口与稳定错误分类。
 *
 * 业务意图：所有 git 调用都必须经过本模块构造的 GitInvocation（参数只能由
 * repository-service 内部模板拼装），保证 React/RPC 调用方无法注入任意 git 参数。
 * 复用 core/exec.ts 的 shell:false + 超时 SIGTERM→SIGKILL 底座；输出字节上限采用
 * 完成后截断 + 标记（配合超时兜底），目标是保护 WebView 不被超大输出撑爆。
 */

import { execCommand } from "../exec.ts";
import { GitServiceError } from "./git-types.ts";

/** 内部构造的 Git 调用描述；readOnly 决定是否设置 GIT_OPTIONAL_LOCKS=0。 */
export interface GitInvocation {
	cwd: string;
	args: readonly string[];
	operationId: string;
	readOnly: boolean;
	timeoutMs: number;
}

export interface GitProcessResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
	/** stdout 超过 maxOutputBytes 被截断时为 true。 */
	truncated: boolean;
}

/** 只读命令默认输出上限 2MB；diff 场景由 repository-service 传更小上限。 */
export const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

/** 只读命令超时；写操作（fetch/pull/push）由调用方传更长超时。 */
export const GIT_READ_TIMEOUT_MS = 20_000;
export const GIT_WRITE_TIMEOUT_MS = 120_000;

let gitAvailable: boolean | undefined;

/** 惰性探测系统 git 是否可用；结果在进程内缓存。 */
export async function checkGitAvailable(): Promise<boolean> {
	if (gitAvailable !== undefined) return gitAvailable;
	try {
		const probe = await execCommand("git", ["--version"], process.cwd(), { timeout: 5_000 });
		gitAvailable = probe.code === 0 && probe.stdout.includes("git version");
	} catch {
		gitAvailable = false;
	}
	return gitAvailable;
}

/**
 * 执行一次受限 git 调用。
 * - LC_ALL=C 强制英文错误消息，保证 stderr 关键词分类不被本地化干扰。
 * - 只读命令设置 GIT_OPTIONAL_LOCKS=0，避免 status/diff 触发 index 刷新锁。
 */
export async function runGitProcess(
	invocation: GitInvocation,
	options?: { signal?: AbortSignal; maxOutputBytes?: number },
): Promise<GitProcessResult> {
	const env: NodeJS.ProcessEnv = { LC_ALL: "C" };
	if (invocation.readOnly) env.GIT_OPTIONAL_LOCKS = "0";
	const result = await execCommand("git", [...invocation.args], invocation.cwd, {
		timeout: invocation.timeoutMs,
		signal: options?.signal,
		env,
	});
	const limit = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
	const truncated = result.stdout.length > limit;
	return {
		stdout: truncated ? result.stdout.slice(0, limit) : result.stdout,
		stderr: result.stderr,
		code: result.code,
		killed: result.killed,
		truncated,
	};
}

/** 把 git 退出结果收敛为稳定错误码；仅在非零退出码时调用。 */
export function classifyGitFailure(result: { stdout: string; stderr: string; code: number; killed: boolean }): GitServiceError {
	const text = `${result.stderr}\n${result.stdout}`.toLowerCase();
	if (result.killed) {
		return new GitServiceError("GIT_FAILED", "Git 命令超时或被终止，请重试");
	}
	if (text.includes("not a git repository")) {
		return new GitServiceError("NOT_A_REPOSITORY", "当前目录不是 Git 仓库");
	}
	if (text.includes("would be overwritten") || (text.includes("local changes") && text.includes("would be lost"))) {
		return new GitServiceError("WORKTREE_WOULD_BE_OVERWRITTEN", "本地未提交变更会被覆盖，Git 已阻断该操作");
	}
	if (
		text.includes("not fast forward")
		|| text.includes("fast-forward")
		|| text.includes("fetch first")
		|| text.includes("divergent")
		|| text.includes("behind its remote counterpart")
	) {
		return new GitServiceError("NON_FAST_FORWARD", "分支已分叉，无法快进合并");
	}
	if (
		text.includes("authentication failed")
		|| text.includes("invalid username or password")
		|| text.includes("could not read username")
		|| text.includes("permission denied")
		|| text.includes("publickey")
		|| text.includes("403")
	) {
		return new GitServiceError("AUTHENTICATION_FAILED", "远程凭据认证失败，请检查 credential helper 或 SSH 配置");
	}
	if (
		text.includes("could not resolve host")
		|| text.includes("connection timed out")
		|| text.includes("failed to connect")
		|| text.includes("timed out")
		|| text.includes("unable to access")
		|| text.includes("connection was closed")
	) {
		return new GitServiceError("NETWORK_FAILED", "网络访问失败，请检查远程地址与网络连接");
	}
	if (text.includes("no upstream") || text.includes("no tracking information")) {
		return new GitServiceError("NO_UPSTREAM", "当前分支没有配置上游分支");
	}
	if (text.includes("no such remote") || text.includes("no configured push destination")) {
		return new GitServiceError("NO_REMOTE", "仓库没有配置远程 origin");
	}
	if (text.includes("nothing to commit")) {
		return new GitServiceError("NOTHING_STAGED", "暂存区没有可提交的变更");
	}
	const detail = result.stderr.trim() || result.stdout.trim() || `git 退出码 ${result.code}`;
	return new GitServiceError("GIT_FAILED", detail.slice(0, 400));
}

/** 统一的"执行并校验退出码"封装：非零退出码抛出稳定分类错误。 */
export async function runGitChecked(
	invocation: GitInvocation,
	options?: { signal?: AbortSignal; maxOutputBytes?: number },
): Promise<GitProcessResult> {
	if (!(await checkGitAvailable())) {
		throw new GitServiceError("GIT_NOT_FOUND", "未找到可执行的 git，请确认已安装并在 PATH 中");
	}
	const result = await runGitProcess(invocation, options);
	if (result.code !== 0) throw classifyGitFailure(result);
	return result;
}
