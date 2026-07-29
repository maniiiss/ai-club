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
}

function isWithinProject(path: string, projectPath: string): boolean {
	const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
	const target = normalize(path);
	const root = normalize(projectPath);
	return target === root || target.startsWith(`${root}/`);
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
	const standalonePaths = new Set(standaloneTaskPaths);

	for (const task of tasks) {
		if (standalonePaths.has(task.path)) {
			standaloneTasks.push(task);
			continue;
		}
		const owner = projectTree
			.filter((node) => isWithinProject(task.cwd, node.project.path))
			.sort((left, right) => right.project.path.length - left.project.path.length)[0];
		if (owner) owner.tasks.push(task);
		else standaloneTasks.push(task);
	}

	return {
		projectTree: projectTree.map((node) => ({ ...node, tasks: sortByModified(node.tasks) })),
		standaloneTasks: sortByModified(standaloneTasks),
	};
}
