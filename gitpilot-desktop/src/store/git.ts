/**
 * Code 模式右侧栏 Git 面板状态。
 *
 * 业务意图：按 project-files 的 refreshVersion 模式管理 sidecar Git 状态，
 * 项目切换/快速连续刷新时丢弃晚到响应；写操作携带 expectedVersion 做乐观并发，
 * 错误按稳定错误码映射中文文案（设计文档 §9），组件不直接触碰 bridge。
 */

import { create } from 'zustand';
import { onGitEvent, rpc } from '@/src/rpc/bridge';
import type { GitBranchInfo, GitDiffResult, GitRepositoryState, RpcGitEvent, RpcResponse } from '@/src/rpc/types';

/** 从判别联合中安全取出错误文本（成功分支无 error 字段）。 */
function responseError(response: RpcResponse): string {
	return 'error' in response && typeof response.error === 'string' ? response.error : '';
}

/** 从写操作响应中安全取出 { repositoryVersion, state } 载荷。 */
function writeResultOf(response: RpcResponse): { repositoryVersion: number; state: GitRepositoryState } | undefined {
	if (!response.success || !('data' in response) || response.data === undefined || response.data === null) return undefined;
	const data = response.data as { repositoryVersion?: unknown; state?: GitRepositoryState };
	if (typeof data.repositoryVersion !== 'number' || !data.state) return undefined;
	return { repositoryVersion: data.repositoryVersion, state: data.state };
}

/** Git 稳定错误码 -> 面板文案；未知错误保留 sidecar 原文。 */
export const GIT_ERROR_MESSAGES: Record<string, string> = {
	GIT_NOT_FOUND: '未找到可执行的 git，请确认已安装并加入 PATH',
	NOT_A_REPOSITORY: '当前工作空间不是 Git 仓库',
	STALE_REPOSITORY_VERSION: '仓库状态已变化，已自动刷新，请重试',
	OPERATION_IN_PROGRESS: '已有 Git 写操作进行中，请稍候',
	OPERATION_CANCELLED: '操作已取消',
	WORKTREE_WOULD_BE_OVERWRITTEN: '本地未提交变更会被覆盖，Git 已阻断该操作；可提交后再切换，或在终端处理',
	NON_FAST_FORWARD: '分支已分叉，无法快进合并；可交给 Agent 分析或在终端处理',
	AUTHENTICATION_FAILED: '远程凭据认证失败，请检查 credential helper 或 SSH 配置',
	NETWORK_FAILED: '网络访问失败，请检查远程地址与网络连接',
	OUTPUT_LIMIT_EXCEEDED: '输出超限，内容已截断',
	NO_REMOTE: '仓库没有配置远程 origin',
	NO_UPSTREAM: '当前分支没有配置上游分支',
	NOTHING_STAGED: '暂存区没有可提交的变更',
	INVALID_INPUT: '非法参数',
	GIT_FAILED: 'Git 操作失败',
};

/** sidecar 错误文本格式为 "CODE: message"；返回已知错误码或 null。 */
export function gitErrorCodeOf(raw: string): string | null {
	const code = raw.split(':')[0]?.trim();
	return code && GIT_ERROR_MESSAGES[code] ? code : null;
}

/** 把 sidecar 错误文本收敛为面板文案；GIT_FAILED 保留 sidecar 详情，未知错误保留原文。 */
export function describeGitError(raw: string): string {
	const code = gitErrorCodeOf(raw);
	const message = raw.split(':').slice(1).join(':').trim();
	if (code === 'GIT_FAILED') return message || GIT_ERROR_MESSAGES.GIT_FAILED;
	if (code) return GIT_ERROR_MESSAGES[code];
	return message || raw;
}

export type GitBusyKind = 'stage' | 'unstage' | 'untrack' | 'commit' | 'suggest' | 'create_branch' | 'switch_branch' | 'fetch' | 'pull' | 'push';

interface DiffCacheEntry extends GitDiffResult {
	/** 载入时的 repositoryVersion，写操作后整体失效。 */
	version: number;
}

interface GitStoreState {
	workspacePath: string | null;
	state: GitRepositoryState | null;
	loading: boolean;
	/** 面板级错误（刷新/读取失败），空态与错误态据此切换。 */
	error: string | null;
	branches: GitBranchInfo[];
	branchesLoading: boolean;
	/** key 为 `${scope}:${path}`，写操作后随版本失效。 */
	diffs: Record<string, DiffCacheEntry>;
	/** 进行中的写操作类型；同一时间只有一个（sidecar 写锁保证）。 */
	busy: GitBusyKind | null;
	/** 最近一次写操作错误，UI 以 toast 呈现后调用 clearActionError。 */
	lastActionError: string | null;
	refresh: (workspacePath: string | null) => Promise<void>;
	loadBranches: () => Promise<void>;
	loadDiff: (scope: 'worktree' | 'staged', path: string) => Promise<GitDiffResult | null>;
	stagePaths: (paths: string[]) => Promise<boolean>;
	unstagePaths: (paths: string[]) => Promise<boolean>;
	/** 解除误跟踪（git rm --cached 保留本地文件）；提交删除后忽略规则才生效。 */
	untrackPaths: (paths: string[]) => Promise<boolean>;
	commit: (message: string) => Promise<boolean>;
	/** 空提交信息时的默认 AI 生成：调用 sidecar 一次性模型会话，失败返回 null 并写入 lastActionError。 */
	suggestCommitMessage: () => Promise<string | null>;
	createBranch: (name: string, switchTo: boolean) => Promise<boolean>;
	switchBranch: (name: string) => Promise<boolean>;
	fetchRemote: () => Promise<boolean>;
	pullFfOnly: () => Promise<boolean>;
	push: (setUpstream?: boolean) => Promise<boolean>;
	clearActionError: () => void;
	/** 桥接层 git_* 事件归约；组件不直接调用。 */
	applyGitEvent: (event: RpcGitEvent) => void;
}

let refreshVersion = 0;
/** git_state_changed 的去抖刷新句柄，只保留一次待执行刷新。 */
let stateChangeTimer: ReturnType<typeof setTimeout> | null = null;

function diffKey(scope: 'worktree' | 'staged', path: string): string {
	return `${scope}:${path}`;
}

/** 发起写操作并收敛结果：成功更新状态、失败映射文案，STALE 时自动刷新。 */
async function runWriteAction(
	kind: GitBusyKind,
	action: (expectedVersion: number | undefined) => Promise<RpcResponse>,
): Promise<boolean> {
	const store = useGitStore.getState();
	if (store.busy) {
		useGitStore.setState({ lastActionError: GIT_ERROR_MESSAGES.OPERATION_IN_PROGRESS });
		return false;
	}
	useGitStore.setState({ busy: kind, lastActionError: null });
	try {
		const response = await action(store.state?.repositoryVersion);
		if (!response.success) {
			const raw = responseError(response);
			useGitStore.setState({ busy: null, lastActionError: describeGitError(raw) });
			if (gitErrorCodeOf(raw) === 'STALE_REPOSITORY_VERSION') void useGitStore.getState().refresh(useGitStore.getState().workspacePath);
			return false;
		}
		useGitStore.setState({
			busy: null,
			state: writeResultOf(response)?.state ?? null,
			// 版本前进后旧 diff 全部失效。
			diffs: {},
		});
		return true;
	} catch (error) {
		useGitStore.setState({ busy: null, lastActionError: error instanceof Error ? describeGitError(error.message) : GIT_ERROR_MESSAGES.GIT_FAILED });
		return false;
	}
}

/** Code Git 面板状态；晚到响应按 refreshVersion 丢弃，不覆盖新项目。 */
export const useGitStore = create<GitStoreState>((set, get) => ({
	workspacePath: null,
	state: null,
	loading: false,
	error: null,
	branches: [],
	branchesLoading: false,
	diffs: {},
	busy: null,
	lastActionError: null,

	refresh: async (workspacePath) => {
		const version = ++refreshVersion;
		if (!workspacePath) {
			set({ workspacePath: null, state: null, loading: false, error: null, branches: [], diffs: {} });
			return;
		}
		set(get().workspacePath !== workspacePath
			? { workspacePath, state: null, loading: true, error: null, branches: [], diffs: {} }
			: { workspacePath, loading: true, error: null });
		try {
			const response = await rpc.gitGetState();
			if (version !== refreshVersion) return;
			if (response.success && response.command === 'git_get_state') {
				set({ state: response.data, loading: false, error: null });
			} else {
				set({ state: null, loading: false, error: describeGitError(responseError(response)) });
			}
		} catch (error) {
			if (version !== refreshVersion) return;
			set({ state: null, loading: false, error: error instanceof Error ? error.message : String(error) });
		}
	},

	loadBranches: async () => {
		if (!get().workspacePath) return;
		set({ branchesLoading: true });
		try {
			const response = await rpc.gitListBranches();
			if (response.success && response.command === 'git_list_branches') set({ branches: response.data.branches, branchesLoading: false });
			else set({ branchesLoading: false });
		} catch {
			set({ branchesLoading: false });
		}
	},

	loadDiff: async (scope, path) => {
		const key = diffKey(scope, path);
		const version = get().state?.repositoryVersion;
		if (version !== undefined && get().diffs[key]?.version === version) return get().diffs[key];
		try {
			const response = await rpc.gitGetDiff(scope, path);
			if (response.success && response.command === 'git_get_diff') {
				const entry: DiffCacheEntry = { ...response.data, version: get().state?.repositoryVersion ?? 0 };
				set({ diffs: { ...get().diffs, [key]: entry } });
				return response.data;
			}
			return null;
		} catch {
			return null;
		}
	},

	stagePaths: (paths) => runWriteAction('stage', () => rpc.gitStagePaths(paths)),
	unstagePaths: (paths) => runWriteAction('unstage', () => rpc.gitUnstagePaths(paths)),
	untrackPaths: (paths) => runWriteAction('untrack', () => rpc.gitUntrackPaths(paths)),
	commit: (message) => runWriteAction('commit', (expectedVersion) => rpc.gitCommit(message, expectedVersion)),
	suggestCommitMessage: async () => {
		if (get().busy) {
			set({ lastActionError: GIT_ERROR_MESSAGES.OPERATION_IN_PROGRESS });
			return null;
		}
		set({ busy: 'suggest', lastActionError: null });
		try {
			const response = await rpc.gitSuggestCommitMessage();
			if (response.success && response.command === 'git_suggest_commit_message') {
				set({ busy: null });
				return response.data.message;
			}
			set({ busy: null, lastActionError: describeGitError(responseError(response)) });
			return null;
		} catch (error) {
			set({ busy: null, lastActionError: error instanceof Error ? describeGitError(error.message) : GIT_ERROR_MESSAGES.GIT_FAILED });
			return null;
		}
	},
	createBranch: (name, switchTo) => runWriteAction('create_branch', () => rpc.gitCreateBranch(name, switchTo)),
	switchBranch: (name) => runWriteAction('switch_branch', (expectedVersion) => rpc.gitSwitchBranch(name, expectedVersion)),
	fetchRemote: () => runWriteAction('fetch', () => rpc.gitFetch()),
	pullFfOnly: () => runWriteAction('pull', (expectedVersion) => rpc.gitPullFfOnly(expectedVersion)),
	push: (setUpstream) => runWriteAction('push', (expectedVersion) => rpc.gitPush({ expectedVersion, setUpstream })),

	clearActionError: () => set({ lastActionError: null }),

	applyGitEvent: (event) => {
		if (event.type !== 'git_state_changed') return;
		// 外部变化（应用外 git 操作等）触发的刷新：500ms 去抖，避免高频抖动。
		if (stateChangeTimer) clearTimeout(stateChangeTimer);
		const workspacePath = get().workspacePath;
		if (!workspacePath) return;
		stateChangeTimer = setTimeout(() => {
			stateChangeTimer = null;
			void useGitStore.getState().refresh(useGitStore.getState().workspacePath);
		}, 500);
	},
}));

// 桥接层事件接线：git_* 事件独立分流，不进入 Code 会话 reducer。
onGitEvent((event) => useGitStore.getState().applyGitEvent(event));
