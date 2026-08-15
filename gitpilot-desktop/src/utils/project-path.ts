/**
 * 项目路径比较工具。
 *
 * 业务意图：Tauri 在 Windows 上可能返回 `\\?\\C:\\...` 扩展路径，而项目选择器
 * 和历史会话可能保存普通 `C:\\...` 路径。项目归属判断必须先消除这个表示差异，
 * 否则会话不会进入对应项目树，而会被错误放入独立任务列表。
 */
export function normalizeProjectPath(value: string): string {
	let normalized = value.trim();
	if (/^\\\\\?\\UNC\\/i.test(normalized)) {
		normalized = `\\\\${normalized.slice(8)}`;
	} else if (/^\\\\\?\\/i.test(normalized) || /^\\\\\.\\/i.test(normalized)) {
		normalized = normalized.slice(4);
	}
	normalized = normalized.replace(/\\/g, '/').toLowerCase();
	if (normalized.length > 3) normalized = normalized.replace(/\/+$/, '');
	return normalized;
}

export function isProjectPathWithin(path: string | undefined, projectPath: string): boolean {
	if (!path || !projectPath) return false;
	const target = normalizeProjectPath(path);
	const root = normalizeProjectPath(projectPath);
	return target === root || target.startsWith(`${root}/`);
}

export function isSameProjectPath(left: string | null | undefined, right: string): boolean {
	return Boolean(left) && normalizeProjectPath(left!) === normalizeProjectPath(right);
}

/**
 * 判断是否为测试或执行器产生的临时工作目录。
 *
 * 业务意图：临时执行目录可能被写入旧版 currentProjectPath；应用重启后不能继续
 * 把它当作用户当前项目，否则状态栏会显示临时路径并掩盖真正的项目任务。
 */
export function isTemporaryWorkspacePath(value: string | null | undefined): boolean {
	if (!value) return false;
	const normalized = normalizeProjectPath(value);
	return /\/appdata\/local\/temp\/pi-(?:exec-snap|runtime-suite|\d+)(?:[-/]|$)/i.test(normalized);
}
