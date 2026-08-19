/**
 * 右侧「审查」页签的数据容器。
 *
 * 业务意图：代码修改完成后，聊天流会聚合出本轮改动文件清单（changed_files 虚拟消息）；
 * 审查页签与聊天卡片共用这份数据，由 ChatView 派生写入本 store，保证两处展示一致。
 * 纯内存状态，不持久化：切换会话后由历史回放链路重建最近一轮改动。
 */
import { create } from 'zustand';
import { useWorkbenchStore } from '@/src/store/workbench';
import type { ChangedFile } from '@/src/store/changed-files';

interface ReviewState {
	/** 数据来源会话路径；与当前会话不一致时视为过期数据。 */
	sessionPath: string | null;
	/** 最近一轮任务的改动文件（与聊天 changed_files 卡片同源）。 */
	files: ChangedFile[];
	/** 面板内已展开 diff 的文件路径集合（按 path 匹配）。 */
	expandedPaths: string[];
	/** ChatView 派生写入：会话变化时重置展开状态；空数组表示本轮无改动。 */
	setReviewFiles: (sessionPath: string | null, files: ChangedFile[]) => void;
	/** 聊天卡片点击文件：展开右侧栏、激活审查页签并展开该文件 diff。 */
	openReviewFile: (path: string) => void;
	/** 面板内点击文件行：展开/收起该文件 diff。 */
	toggleReviewFile: (path: string) => void;
	/** 清空审查内容（保留页签开关状态，由 workbench 管理）。 */
	clearReview: () => void;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
	sessionPath: null,
	files: [],
	expandedPaths: [],
	setReviewFiles: (sessionPath, files) => {
		const previous = get();
		// 同一会话且清单未变化时不重置展开状态，避免流式期间重复写入打断用户操作。
		if (previous.sessionPath === sessionPath && sameFiles(previous.files, files)) return;
		set({ sessionPath, files, expandedPaths: previous.sessionPath === sessionPath ? previous.expandedPaths : [] });
	},
	openReviewFile: (path) => {
		// 联动右侧栏：展开右栏并激活审查页签（与计划页签 openPlanPanelTab 同一模式）。
		useWorkbenchStore.getState().openReviewPanelTab();
		const expandedPaths = get().expandedPaths.includes(path) ? get().expandedPaths : [...get().expandedPaths, path];
		set({ expandedPaths });
	},
	toggleReviewFile: (path) => {
		const expandedPaths = get().expandedPaths.includes(path)
			? get().expandedPaths.filter((item) => item !== path)
			: [...get().expandedPaths, path];
		set({ expandedPaths });
	},
	clearReview: () => set({ sessionPath: null, files: [], expandedPaths: [] }),
}));

/** 浅比较改动文件清单（path + 统计 + diff 是否一致），用于跳过无效写入。 */
function sameFiles(a: ChangedFile[], b: ChangedFile[]): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	return a.every((file, index) => {
		const other = b[index];
		return file === other
			|| (file.path === other?.path && file.status === other?.status && file.added === other?.added
				&& file.removed === other?.removed && file.diff === other?.diff && file.editCount === other?.editCount && file.editable === other?.editable);
	});
}
