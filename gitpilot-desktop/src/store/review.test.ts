import { beforeEach, describe, expect, it } from 'vitest';
import { useReviewStore } from './review';
import { useWorkbenchStore } from './workbench';
import type { ChangedFile } from './changed-files';

function file(path: string, overrides: Partial<ChangedFile> = {}): ChangedFile {
	return { path, status: 'modified', added: 3, removed: 1, diff: `--- a/${path}\n+++ b/${path}\n@@ -1 +1,2 @@\n-old\n+new\n+line`, editCount: 1, editable: true, ...overrides };
}

describe('右侧审查页签数据容器', () => {
	beforeEach(() => {
		useReviewStore.setState({ sessionPath: null, files: [], expandedPaths: [] });
		useWorkbenchStore.setState({
			layout: { leftWidth: 272, rightWidth: 344, bottomOpen: false, bottomHeight: 220, leftCollapsed: false, rightCollapsed: true },
			rightPanelTabs: { plans: [], executionOpen: true, filesOpen: false, reviewOpen: false, gitOpen: false, activeTabId: 'execution' },
		});
	});

	it('写入最近一轮改动文件，同会话重复相同清单不重置展开状态', () => {
		const files = [file('src/App.tsx'), file('src/main.tsx')];
		useReviewStore.getState().setReviewFiles('/sessions/a.jsonl', files);
		expect(useReviewStore.getState().files).toHaveLength(2);

		// 面板内先展开一个文件，再收到同源相同清单的派生写入，展开状态应保留。
		useReviewStore.getState().toggleReviewFile('src/App.tsx');
		expect(useReviewStore.getState().expandedPaths).toEqual(['src/App.tsx']);
		useReviewStore.getState().setReviewFiles('/sessions/a.jsonl', [file('src/App.tsx'), file('src/main.tsx')]);
		expect(useReviewStore.getState().expandedPaths).toEqual(['src/App.tsx']);
	});

	it('切换会话写入时重置展开状态，空清单表示本轮无改动', () => {
		useReviewStore.getState().setReviewFiles('/sessions/a.jsonl', [file('src/App.tsx')]);
		useReviewStore.getState().toggleReviewFile('src/App.tsx');

		useReviewStore.getState().setReviewFiles('/sessions/b.jsonl', [file('src/other.ts')]);
		expect(useReviewStore.getState().sessionPath).toBe('/sessions/b.jsonl');
		expect(useReviewStore.getState().files.map((item) => item.path)).toEqual(['src/other.ts']);
		expect(useReviewStore.getState().expandedPaths).toEqual([]);

		useReviewStore.getState().setReviewFiles('/sessions/b.jsonl', []);
		expect(useReviewStore.getState().files).toEqual([]);
	});

	it('openReviewFile 展开右侧栏、激活审查页签并展开该文件', () => {
		useReviewStore.getState().setReviewFiles('/sessions/a.jsonl', [file('src/App.tsx'), file('src/main.tsx')]);
		useReviewStore.getState().openReviewFile('src/main.tsx');

		expect(useWorkbenchStore.getState().layout.rightCollapsed).toBe(false);
		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({ reviewOpen: true, activeTabId: 'review' });
		expect(useReviewStore.getState().expandedPaths).toEqual(['src/main.tsx']);

		// 重复打开同一文件不产生重复展开项。
		useReviewStore.getState().openReviewFile('src/main.tsx');
		expect(useReviewStore.getState().expandedPaths).toEqual(['src/main.tsx']);
	});

	it('toggleReviewFile 切换展开与收起，clearReview 清空数据', () => {
		useReviewStore.getState().setReviewFiles('/sessions/a.jsonl', [file('src/App.tsx')]);
		useReviewStore.getState().toggleReviewFile('src/App.tsx');
		expect(useReviewStore.getState().expandedPaths).toEqual(['src/App.tsx']);
		useReviewStore.getState().toggleReviewFile('src/App.tsx');
		expect(useReviewStore.getState().expandedPaths).toEqual([]);

		useReviewStore.getState().clearReview();
		expect(useReviewStore.getState()).toMatchObject({ sessionPath: null, files: [], expandedPaths: [] });
	});
});
