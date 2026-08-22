/**
 * Git 面板分组纯函数测试。
 *
 * 业务意图：固化 v2 分组契约--误跟踪文件进入独立分组且不进入自动暂存路径，
 * 手动暂存的误跟踪文件留在已暂存组（尊重显式操作），旧 sidecar 无
 * ignoredTracked 字段时按 v1 四组行为降级。
 */
import { describe, expect, it } from 'vitest';
import { groupGitFiles } from './TargetGitPanel';
import type { GitFileStatus } from '@/src/rpc/types';

function file(partial: Partial<GitFileStatus> & Pick<GitFileStatus, 'path'>): GitFileStatus {
	return { staged: null, worktree: null, untracked: false, conflicted: false, stagedCounts: null, worktreeCounts: null, ...partial };
}

describe('Git 面板分组', () => {
	it('误跟踪文件进入独立分组，不进入未暂存组（自动暂存路径天然排除）', () => {
		const groups = groupGitFiles([
			file({ path: 'dist.js', worktree: 'M', ignoredTracked: true }),
			file({ path: 'src/a.ts', worktree: 'M' }),
		]);
		expect(groups.ignoredTracked.map((row) => row.file.path)).toEqual(['dist.js']);
		expect(groups.ignoredTracked[0].letter).toBe('M');
		expect(groups.unstaged.map((row) => row.file.path)).toEqual(['src/a.ts']);
	});

	it('手动暂存的误跟踪文件留在已暂存组，尊重显式操作', () => {
		// 只暂存、工作区无剩余改动：不进误跟踪组，等同普通已暂存文件。
		const groups = groupGitFiles([file({ path: 'dist.js', staged: 'M', ignoredTracked: true })]);
		expect(groups.staged.map((row) => row.file.path)).toEqual(['dist.js']);
		expect(groups.ignoredTracked).toEqual([]);
		expect(groups.unstaged).toEqual([]);
		// 暂存后工作区仍有改动的，沿用 v1 语义同时出现在已暂存与未暂存两组。
		const both = groupGitFiles([file({ path: 'build.js', staged: 'M', worktree: 'M', ignoredTracked: true })]);
		expect(both.staged.map((row) => row.file.path)).toEqual(['build.js']);
		expect(both.unstaged.map((row) => row.file.path)).toEqual(['build.js']);
		expect(both.ignoredTracked).toEqual([]);
	});

	it('冲突路由优先；普通未跟踪/已暂存行为与 v1 一致', () => {
		const groups = groupGitFiles([
			file({ path: 'conflict.ts', staged: 'U', worktree: 'U', conflicted: true }),
			file({ path: 'new.ts', untracked: true }),
			file({ path: 'staged.ts', staged: 'A' }),
		]);
		expect(groups.conflicted.map((row) => row.file.path)).toEqual(['conflict.ts']);
		expect(groups.untracked.map((row) => row.file.path)).toEqual(['new.ts']);
		expect(groups.staged.map((row) => row.file.path)).toEqual(['staged.ts']);
		expect(groups.ignoredTracked).toEqual([]);
	});
});
