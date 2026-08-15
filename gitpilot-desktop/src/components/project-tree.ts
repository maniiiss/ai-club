import { isProjectPathWithin, normalizeProjectPath } from '@/src/utils/project-path';

/**
 * 项目树将项目与其项目任务建立展示关系；独立任务不会进入该树。
 */
export interface ProjectTreeProject {
	name: string;
	path: string;
}

export interface ProjectTreeNode {
	project: ProjectTreeProject;
	tasks: ProjectTreeTask[];
}

export interface ProjectTreeTask {
	path: string;
	name?: string;
	firstMessage: string;
	cwd: string;
	modified?: string;
	messageCount: number;
	/** 任务是否正在流式执行，用于侧栏显示“进行中”加载图标。 */
	isStreaming?: boolean;
}

function sortByModified<T extends { modified?: string }>(items: T[]): T[] {
	return [...items].sort((left, right) => Date.parse(right.modified ?? '') - Date.parse(left.modified ?? ''));
}

/**
 * 每个任务最多归属一个最接近的项目根目录；没有归属的任务作为独立任务返回。
 * 这样项目树和任务列表是两套互不重复的展示集合。
 */
export function buildProjectTree(projects: ProjectTreeProject[], tasks: ProjectTreeTask[], standaloneTaskPaths: string[] = []): { projectTree: ProjectTreeNode[]; standaloneTasks: ProjectTreeTask[] } {
	const projectTree = projects.map((project) => ({ project, tasks: [] as ProjectTreeTask[] }));
	const standaloneTasks: ProjectTreeTask[] = [];
	const standaloneTaskSet = new Set(standaloneTaskPaths);

	for (const task of tasks) {
		if (standaloneTaskSet.has(task.path)) {
			// 底部“任务”入口是明确的独立任务语义；即使它的 cwd 恰好落在某个项目目录内，
			// 也不能仅凭路径前缀把它重新归入项目，否则新建任务会从底部列表跳到项目下面。
			standaloneTasks.push(task);
			continue;
		}
		const owner = projectTree
			.filter((node) => isProjectPathWithin(task.cwd, node.project.path))
			.sort((left, right) => normalizeProjectPath(right.project.path).length - normalizeProjectPath(left.project.path).length)[0];
		if (owner) {
			// 未被独立任务入口标记的会话，才按 cwd 归属最近的项目根目录。
			owner.tasks.push(task);
			continue;
		}
		standaloneTasks.push(task);
	}

	return {
		projectTree: projectTree.map((node) => ({ ...node, tasks: sortByModified(node.tasks) })),
		standaloneTasks: sortByModified(standaloneTasks),
	};
}
