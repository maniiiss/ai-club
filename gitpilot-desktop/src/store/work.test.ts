import { beforeEach, describe, expect, it } from 'vitest';
import { getWorkTaskTitle, PLACEHOLDER_TITLE, useWorkStore } from './work';

describe('GitPilot Work 独立文件任务', () => {
	beforeEach(() => useWorkStore.setState({ tasks: [], activeTaskId: null, workspaces: [], currentWorkspacePath: null, hydrated: true }));

	it('新建任务无需标题并立即成为当前任务', () => {
		const task = useWorkStore.getState().createTask();
		expect(task.title).toBe(PLACEHOLDER_TITLE);
		expect(task.title).toBe('未命名任务');
		expect(useWorkStore.getState().activeTaskId).toBe(task.id);
	});

	it('兼容旧的默认标题，并在首条响应后显示生成标题', () => {
		const task = useWorkStore.getState().createTask();
		expect(getWorkTaskTitle('新的 Work 任务')).toBe(PLACEHOLDER_TITLE);
		expect(getWorkTaskTitle('新的 Work 任务', '整理公众端协同')).toBe('整理公众端协同');
		useWorkStore.getState().updateTask(task.id, { title: '公众端协同方案' });
		expect(getWorkTaskTitle(useWorkStore.getState().tasks[0].title)).toBe('公众端协同方案');
	});

	it('文件索引与消息互相独立维护', () => {
		const task = useWorkStore.getState().createTask();
		useWorkStore.getState().appendMessage(task.id, { id: 'message-1', role: 'user', text: '推进协同', createdAt: 1 });
		useWorkStore.getState().upsertFile(task.id, { path: 'brief.md', name: 'brief.md', type: 'text/markdown', size: 8, updatedAt: 1, changeState: 'created', content: '# brief' });
		const saved = useWorkStore.getState().tasks[0];
		expect(saved.messages).toHaveLength(1);
		expect(saved.files[0].path).toBe('brief.md');
	});

	it('删除任务只影响 Work 索引', () => {
		const first = useWorkStore.getState().createTask();
		const second = useWorkStore.getState().createTask();
		useWorkStore.getState().deleteTask(second.id);
		expect(useWorkStore.getState().tasks).toHaveLength(1);
		expect(useWorkStore.getState().tasks[0].id).toBe(first.id);
	});

	it('新建任务继承当前工作空间归属，未选择时不带归属', () => {
		const unassigned = useWorkStore.getState().createTask();
		expect(unassigned.workspaceRootPath).toBeUndefined();
		useWorkStore.setState({ workspaces: [{ name: 'docs', path: 'C:\\docs', addedAt: 1 }], currentWorkspacePath: 'C:\\docs' });
		const assigned = useWorkStore.getState().createTask();
		expect(assigned.workspaceRootPath).toBe('C:\\docs');
	});

	it('顶部新对话明确不绑定当前工作空间', () => {
		useWorkStore.setState({ workspaces: [{ name: 'docs', path: 'C:\\docs', addedAt: 1 }], currentWorkspacePath: 'C:\\docs' });
		const task = useWorkStore.getState().createTask(null);
		expect(task.workspaceRootPath).toBeUndefined();
	});

	it('移除工作空间时任务保留原归属且不回落到未分组', () => {
		useWorkStore.setState({ workspaces: [{ name: 'docs', path: 'C:\\docs', addedAt: 1 }], currentWorkspacePath: 'C:\\docs' });
		const task = useWorkStore.getState().createTask();
		useWorkStore.getState().removeWorkspace('C:\\docs');
		const state = useWorkStore.getState();
		expect(state.workspaces).toHaveLength(0);
		expect(state.currentWorkspacePath).toBeNull();
		expect(state.tasks.find((item) => item.id === task.id)?.workspaceRootPath).toBe('C:\\docs');
	});

	it('assignTaskWorkspace 只改归属元数据，不动会话字段', () => {
		const task = useWorkStore.getState().createTask();
		useWorkStore.getState().updateTask(task.id, { sessionId: 'session-1', workspacePath: 'C:\\agent\\workspaces\\x' });
		useWorkStore.getState().assignTaskWorkspace(task.id, 'C:\\docs');
		const saved = useWorkStore.getState().tasks[0];
		expect(saved.workspaceRootPath).toBe('C:\\docs');
		expect(saved.sessionId).toBe('session-1');
		expect(saved.workspacePath).toBe('C:\\agent\\workspaces\\x');
	});
});
