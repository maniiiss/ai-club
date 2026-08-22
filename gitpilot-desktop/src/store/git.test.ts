import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rpc } from '@/src/rpc/bridge';
import type { GitRepositoryState, RpcResponse } from '@/src/rpc/types';
import { describeGitError, useGitStore } from './git';

function mockState(overrides: Partial<GitRepositoryState> = {}): GitRepositoryState {
	return {
		repositoryId: 'repo-1',
		repositoryVersion: 3,
		branch: 'main',
		detached: false,
		upstream: 'origin/main',
		ahead: 1,
		behind: 0,
		files: [
			{ path: 'src/a.ts', staged: null, worktree: 'M', untracked: false, conflicted: false, stagedCounts: null, worktreeCounts: { added: 5, removed: 2 } },
			{ path: 'src/b.ts', staged: 'A', worktree: null, untracked: false, conflicted: false, stagedCounts: { added: 10, removed: 0 }, worktreeCounts: null },
			{ path: 'notes.md', staged: null, worktree: null, untracked: true, conflicted: false, stagedCounts: null, worktreeCounts: null },
			{ path: 'conflict.txt', staged: 'U', worktree: 'U', untracked: false, conflicted: true, stagedCounts: null, worktreeCounts: null },
		],
		...overrides,
	};
}

function stateResponse(state: GitRepositoryState): RpcResponse {
	return { type: 'response', command: 'git_get_state', success: true, data: state } as unknown as RpcResponse;
}

function errorResponse(command: string, error: string): RpcResponse {
	return { type: 'response', command, success: false, error } as unknown as RpcResponse;
}

function resetStore(): void {
	useGitStore.setState({
		workspacePath: 'C:/work/project',
		state: mockState(),
		loading: false,
		error: null,
		branches: [],
		branchesLoading: false,
		diffs: {},
		busy: null,
		lastActionError: null,
	});
}

beforeEach(() => {
	vi.restoreAllMocks();
	resetStore();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('describeGitError', () => {
	it('已知错误码映射为中文文案', () => {
		expect(describeGitError('NON_FAST_FORWARD: hint: Updates were rejected')).toBe('分支已分叉，无法快进合并；可交给 Agent 分析或在终端处理');
		expect(describeGitError('NOT_A_REPOSITORY: fatal')).toBe('当前工作空间不是 Git 仓库');
	});

	it('未知错误保留原文摘要', () => {
		expect(describeGitError('some unexpected failure')).toBe('some unexpected failure');
	});
});

describe('useGitStore.refresh', () => {
	it('成功后更新仓库状态', async () => {
		const spy = vi.spyOn(rpc, 'gitGetState').mockResolvedValue(stateResponse(mockState({ branch: 'develop' })));
		await useGitStore.getState().refresh('C:/work/project');
		expect(spy).toHaveBeenCalled();
		expect(useGitStore.getState().state?.branch).toBe('develop');
		expect(useGitStore.getState().error).toBeNull();
	});

	it('项目切换后晚到响应被丢弃，不覆盖新项目状态', async () => {
		let resolveFirst: (value: RpcResponse) => void = () => {};
		const first = new Promise<RpcResponse>((resolve) => { resolveFirst = resolve; });
		vi.spyOn(rpc, 'gitGetState')
			.mockReturnValueOnce(first as Promise<RpcResponse>)
			.mockResolvedValueOnce(stateResponse(mockState({ repositoryId: 'repo-2', branch: 'second' })));
		const firstCall = useGitStore.getState().refresh('C:/work/project-a');
		const secondCall = useGitStore.getState().refresh('C:/work/project-b');
		await secondCall;
		resolveFirst(stateResponse(mockState({ repositoryId: 'repo-1', branch: 'first' })));
		await firstCall;
		expect(useGitStore.getState().state?.repositoryId).toBe('repo-2');
	});

	it('非仓库错误映射为中文文案并进入错误态', async () => {
		vi.spyOn(rpc, 'gitGetState').mockResolvedValue(errorResponse('git_get_state', 'NOT_A_REPOSITORY: fatal'));
		await useGitStore.getState().refresh('C:/work/plain');
		expect(useGitStore.getState().state).toBeNull();
		expect(useGitStore.getState().error).toBe('当前工作空间不是 Git 仓库');
	});
});

describe('useGitStore 写操作', () => {
	it('成功后更新状态并失效 diff 缓存', async () => {
		useGitStore.setState({ diffs: { 'worktree:src/a.ts': { path: 'src/a.ts', scope: 'worktree', diff: 'old', truncated: false, binary: false, version: 3 } } });
		const next = mockState({ repositoryVersion: 4, files: [] });
		vi.spyOn(rpc, 'gitCommit').mockResolvedValue({ type: 'response', command: 'git_commit', success: true, data: { repositoryVersion: 4, state: next, commitSha: 'a'.repeat(40) } } as unknown as RpcResponse);
		const ok = await useGitStore.getState().commit('feat: x');
		expect(ok).toBe(true);
		expect(useGitStore.getState().state?.repositoryVersion).toBe(4);
		expect(useGitStore.getState().diffs).toEqual({});
		expect(useGitStore.getState().busy).toBeNull();
	});

	it('提交携带 expectedVersion 做乐观并发保护', async () => {
		const spy = vi.spyOn(rpc, 'gitCommit').mockResolvedValue({ type: 'response', command: 'git_commit', success: true, data: { repositoryVersion: 4, state: mockState() } } as unknown as RpcResponse);
		await useGitStore.getState().commit('feat: x');
		expect(spy).toHaveBeenCalledWith('feat: x', 3);
	});

	it('失败时映射稳定错误码文案且不更新状态', async () => {
		vi.spyOn(rpc, 'gitPullFfOnly').mockResolvedValue(errorResponse('git_pull_ff_only', 'NON_FAST_FORWARD: divergent'));
		const ok = await useGitStore.getState().pullFfOnly();
		expect(ok).toBe(false);
		expect(useGitStore.getState().lastActionError).toBe('分支已分叉，无法快进合并；可交给 Agent 分析或在终端处理');
	});

	it('STALE_REPOSITORY_VERSION 失败后自动刷新', async () => {
		const refreshSpy = vi.spyOn(rpc, 'gitGetState').mockResolvedValue(stateResponse(mockState({ repositoryVersion: 9 })));
		vi.spyOn(rpc, 'gitPush').mockResolvedValue(errorResponse('git_push', 'STALE_REPOSITORY_VERSION: mismatch'));
		const ok = await useGitStore.getState().push();
		expect(ok).toBe(false);
		expect(refreshSpy).toHaveBeenCalled();
	});

	it('busy 期间第二个写操作直接失败', async () => {
		let release: (value: RpcResponse) => void = () => {};
		vi.spyOn(rpc, 'gitFetch').mockReturnValue(new Promise<RpcResponse>((resolve) => { release = resolve; }) as Promise<RpcResponse>);
		const first = useGitStore.getState().fetchRemote();
		const second = await useGitStore.getState().stagePaths(['a.ts']);
		expect(second).toBe(false);
		expect(useGitStore.getState().lastActionError).toBe('已有 Git 写操作进行中，请稍候');
		release({ type: 'response', command: 'git_fetch', success: true, data: { repositoryVersion: 4, state: mockState() } } as unknown as RpcResponse);
		await first;
		expect(useGitStore.getState().busy).toBeNull();
	});
});

describe('useGitStore.applyGitEvent', () => {
	it('git_state_changed 触发 500ms 去抖刷新，期间多次事件只刷新一次', async () => {
		vi.useFakeTimers();
		const spy = vi.spyOn(rpc, 'gitGetState').mockResolvedValue(stateResponse(mockState()));
		useGitStore.getState().applyGitEvent({ type: 'git_state_changed', repositoryVersion: 5 });
		useGitStore.getState().applyGitEvent({ type: 'git_state_changed', repositoryVersion: 6 });
		expect(spy).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(600);
		expect(spy).toHaveBeenCalledTimes(1);
	});
});

describe('useGitStore.suggestCommitMessage', () => {
	it('成功返回 AI 建议文本', async () => {
		vi.spyOn(rpc, 'gitSuggestCommitMessage').mockResolvedValue({ type: 'response', command: 'git_suggest_commit_message', success: true, data: { message: 'feat: 新增导出接口' } } as unknown as RpcResponse);
		const message = await useGitStore.getState().suggestCommitMessage();
		expect(message).toBe('feat: 新增导出接口');
		expect(useGitStore.getState().busy).toBeNull();
	});

	it('失败返回 null 并保留 sidecar 详情文案', async () => {
		vi.spyOn(rpc, 'gitSuggestCommitMessage').mockResolvedValue(errorResponse('git_suggest_commit_message', 'GIT_FAILED: AI 未能生成有效的提交信息，请手动填写'));
		const message = await useGitStore.getState().suggestCommitMessage();
		expect(message).toBeNull();
		expect(useGitStore.getState().lastActionError).toBe('AI 未能生成有效的提交信息，请手动填写');
	});
});
