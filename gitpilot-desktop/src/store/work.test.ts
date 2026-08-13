import { beforeEach, describe, expect, it } from 'vitest';
import { PLACEHOLDER_TITLE, useWorkStore } from './work';

describe('GitPilot Work 独立文件任务', () => {
	beforeEach(() => useWorkStore.setState({ tasks: [], activeTaskId: null, hydrated: true }));

	it('新建任务无需标题并立即成为当前任务', () => {
		const task = useWorkStore.getState().createTask();
		expect(task.title).toBe(PLACEHOLDER_TITLE);
		expect(useWorkStore.getState().activeTaskId).toBe(task.id);
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
});
