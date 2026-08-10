import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkStore } from './work';

describe('GitPilot Work 本机任务空间', () => {
	beforeEach(() => useWorkStore.setState({ tasks: [], activeTaskId: null, hydrated: true }));

	it('创建任务后独立维护消息与三个成果区', () => {
		const task = useWorkStore.getState().createTask('学习 Rust');
		useWorkStore.getState().appendMessage(task.id, { id: 'message-1', role: 'user', text: '帮我安排学习计划', createdAt: 1 });
		useWorkStore.getState().appendArtifact(task.id, 'plan', '第一周：所有权');
		const saved = useWorkStore.getState().tasks[0];
		expect(saved.title).toBe('学习 Rust');
		expect(saved.messages).toHaveLength(1);
		expect(saved.artifacts.plan).toContain('第一周');
		expect(saved.artifacts.notes).toBe('');
	});

	it('归档任务不会影响其他任务，永久删除会选择下一个可用任务', () => {
		const first = useWorkStore.getState().createTask('任务一');
		const second = useWorkStore.getState().createTask('任务二');
		useWorkStore.getState().updateTask(first.id, { status: 'archived' });
		useWorkStore.getState().deleteTask(second.id);
		expect(useWorkStore.getState().tasks).toHaveLength(1);
		expect(useWorkStore.getState().activeTaskId).toBeNull();
	});
});
