import { describe, expect, it } from 'vitest';
import { buildProjectTree } from './project-tree';

describe('项目树', () => {
	it('独立任务标记优先于 cwd，未标记的会话按项目归属', () => {
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

	it('保留 50+ 任务和超长名称的归属数据，交给侧栏负责截断与滚动', () => {
		// 业务意图：大列表压力应先在树模型层保持完整顺序与归属，不能为了视觉截断丢失会话。
		const tasks = Array.from({ length: 60 }, (_, index) => ({
			path: `session-${index}`,
			name: `这是一个用于验证侧栏最大宽度限制的超长任务名称-${index}-${'长'.repeat(24)}`,
			firstMessage: '',
			cwd: 'C:\\workspace\\a-very-long-project-directory-name\\nested',
			modified: `2026-07-29T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
			messageCount: index + 1,
		}));
		const { projectTree } = buildProjectTree([
			{ name: `一个用于验证项目名称截断的超长项目文件夹-${'项'.repeat(20)}`, path: 'C:\\workspace\\a-very-long-project-directory-name' },
		], tasks);

		expect(projectTree).toHaveLength(1);
		expect(projectTree[0].tasks).toHaveLength(60);
		expect(projectTree[0].tasks[0].name).toContain('超长任务名称');
		expect(new Set(projectTree[0].tasks.map((task) => task.path))).toEqual(new Set(tasks.map((task) => task.path)));
	});

	it('将 Windows 扩展路径会话归入普通路径项目', () => {
		const { projectTree, standaloneTasks } = buildProjectTree([
			{ name: 'git-ai-club', path: 'C:\\workspace\\git-ai-club' },
		], [
			{ path: 'session-extended', name: '扩展路径任务', firstMessage: '', cwd: '\\\\?\\C:\\workspace\\git-ai-club\\gitpilot-desktop', messageCount: 1 },
		]);

		expect(projectTree[0].tasks.map((task) => task.path)).toEqual(['session-extended']);
		expect(standaloneTasks).toEqual([]);
	});

	it('已移除工作空间的任务不会回落到独立任务列表', () => {
		const { projectTree, standaloneTasks } = buildProjectTree([], [
			{ path: 'session-removed', name: '已归档项目任务', firstMessage: '', cwd: 'C:\\workspace\\archived\\src', messageCount: 2 },
		], [], ['C:\\workspace\\archived']);

		expect(projectTree).toEqual([]);
		expect(standaloneTasks).toEqual([]);
	});
});
