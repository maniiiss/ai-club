import { create } from 'zustand';
import { rpc } from '@/src/rpc/bridge';
import type { CodeProjectFileEntry } from '@/src/rpc/types';

/** 文件树与输入框之间的拖拽协议，内容仅包含路径元数据，不携带文件内容。 */
export const PROJECT_FILE_DRAG_MIME = 'application/x-gitpilot-project-file';

export interface ProjectFileTreeNode extends CodeProjectFileEntry {
	children: ProjectFileTreeNode[];
}

export type { ProjectFileAttachmentRequest } from './workbench';

function compareNodes(left: ProjectFileTreeNode, right: ProjectFileTreeNode): number {
	if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
	return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
}

/** 将 sidecar 的扁平相对路径转换为只读树，UI 不直接依赖本地文件系统。 */
export function buildProjectFileTree(entries: CodeProjectFileEntry[]): ProjectFileTreeNode[] {
	const nodes = new Map<string, ProjectFileTreeNode>();
	for (const entry of entries) nodes.set(entry.path, { ...entry, children: [] });
	const roots: ProjectFileTreeNode[] = [];
	for (const node of nodes.values()) {
		const parentPath = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : '';
		const parent = nodes.get(parentPath);
		if (parent?.kind === 'directory') parent.children.push(node);
		else roots.push(node);
	}
	const sortTree = (items: ProjectFileTreeNode[]) => {
		items.sort(compareNodes);
		for (const item of items) sortTree(item.children);
	};
	sortTree(roots);
	return roots;
}

/** 搜索时保留命中的目录及其祖先，避免用户失去文件在项目中的上下文。 */
export function filterProjectFileTree(nodes: ProjectFileTreeNode[], query: string): ProjectFileTreeNode[] {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return nodes;
	return nodes.flatMap((node) => {
		const children = filterProjectFileTree(node.children, query);
		const matched = node.name.toLocaleLowerCase().includes(needle) || node.path.toLocaleLowerCase().includes(needle);
		if (!matched && children.length === 0) return [];
		return [{ ...node, children: matched && node.kind === 'directory' && children.length === 0 ? node.children : children }];
	});
}

interface ProjectFilesState {
	workspacePath: string | null;
	rootPath: string | null;
	entries: CodeProjectFileEntry[];
	loading: boolean;
	error: string | null;
	truncated: boolean;
	refresh: (workspacePath: string | null) => Promise<void>;
	clear: () => void;
}

let refreshVersion = 0;

/** Code 文件树状态按工作目录更新，旧目录的异步响应不能覆盖新项目。 */
export const useProjectFilesStore = create<ProjectFilesState>((set, get) => ({
	workspacePath: null,
	rootPath: null,
	entries: [],
	loading: false,
	error: null,
	truncated: false,
	refresh: async (workspacePath) => {
		const version = ++refreshVersion;
		if (!workspacePath) {
			set({ workspacePath: null, rootPath: null, entries: [], loading: false, error: null, truncated: false });
			return;
		}
		const switchingWorkspace = get().workspacePath !== workspacePath;
		set(switchingWorkspace
			? { workspacePath, rootPath: null, entries: [], loading: true, error: null, truncated: false }
			: { workspacePath, loading: true, error: null });
		try {
			const response = await rpc.codeFileList();
			if (version !== refreshVersion) return;
			if (response.success && response.command === 'code_file_list') {
				set({ workspacePath, rootPath: response.data.rootPath, entries: response.data.entries, loading: false, error: null, truncated: response.data.truncated });
			} else {
				set({ loading: false, error: '项目文件加载失败', entries: [], rootPath: null });
			}
		} catch (error) {
			if (version !== refreshVersion) return;
			set({ loading: false, error: error instanceof Error ? error.message : String(error), entries: [], rootPath: null });
		}
	},
	clear: () => {
		refreshVersion += 1;
		set({ workspacePath: null, rootPath: null, entries: [], loading: false, error: null, truncated: false });
	},
}));
