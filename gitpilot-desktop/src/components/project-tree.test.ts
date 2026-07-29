import { describe, expect, it } from 'vitest';
import { buildProjectTree } from './project-tree';

describe('项目树', () => {
	it('将项目任务归入项目树，未关联项目的任务保留为独立任务', () => {
		const { projectTree, standaloneTasks } = buildProjectTree([
			{ name: 'git-ai-club', path: 'C:\\workspace\\git-ai-club' },
			{ name: 'crm-ai', path: 'C:\\workspace\\crm-ai' },
		], [
			{ path: 'session-1', name: '修复登录', firstMessage: '', cwd: 'C:\\workspace\\git-ai-club\\frontend', modified: '2026-07-29T12:00:00.000Z', messageCount: 2 },
			{ path: 'session-2', name: '独立讨论', firstMessage: '', cwd: 'C:\\other', modified: '2026-07-29T13:00:00.000Z', messageCount: 1 },
			{ path: 'session-3', name: '项目需求', firstMessage: '', cwd: 'C:\\workspace\\crm-ai', modified: '2026-07-29T11:00:00.000Z', messageCount: 1 },
		], ['session-1']);

		expect(projectTree.map((node) => ({ project: node.project.name, taskPaths: node.tasks.map((task) => task.path) }))).toEqual([
			{ project: 'git-ai-club', taskPaths: [] },
			{ project: 'crm-ai', taskPaths: ['session-3'] },
		]);
		expect(standaloneTasks.map((task) => task.path)).toEqual(['session-2', 'session-1']);
	});
});
