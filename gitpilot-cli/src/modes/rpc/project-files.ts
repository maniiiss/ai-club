import { readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import type { CodeProjectFileEntry, CodeProjectFileList } from "./rpc-types.ts";

/**
 * Code 文件树的默认边界：只展示源码工作区的轻量元数据，不把依赖目录和运行时目录
 * 递归推送到 Desktop，避免一次刷新阻塞 sidecar 或把内部状态暴露给渲染层。
 */
const IGNORED_DIRECTORY_NAMES = new Set([
	".git",
	".gitpilot",
	"node_modules",
	"dist",
	"build",
	"target",
	".venv",
	"__pycache__",
]);
const MAX_ENTRIES = 10_000;
const MAX_DEPTH = 12;

function compareNames(left: string, right: string): number {
	return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * 按当前 Code session cwd 构造文件树。
 *
 * 业务意图：Desktop 只能看到 sidecar 当前工作目录内的只读目录元数据；符号链接不跟随，
 * 目录深度和条目数有硬上限，用户真正引用文件时再复用现有受控附件读取链路。
 */
export function listCodeProjectFiles(workspacePath: string): CodeProjectFileList {
	const rootPath = resolve(workspacePath);
	const rootStat = statSync(rootPath);
	if (!rootStat.isDirectory()) throw new Error("当前 Code 工作目录不是文件夹");

	const entries: CodeProjectFileEntry[] = [];
	let truncated = false;

	const visit = (directory: string, depth: number): void => {
		if (depth > MAX_DEPTH || entries.length >= MAX_ENTRIES) {
			truncated = true;
			return;
		}
		let children;
		try {
			children = readdirSync(directory, { withFileTypes: true }).sort((left, right) => {
				if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
				return compareNames(left.name, right.name);
			});
		} catch {
			// 单个目录无权限时不影响其它目录展示，只标记结果可能不完整。
			truncated = true;
			return;
		}

		for (const child of children) {
			if (entries.length >= MAX_ENTRIES) {
				truncated = true;
				return;
			}
			const target = join(directory, child.name);
			// 不跟随符号链接，避免项目内链接把读取范围带到工作目录之外。
			if (child.isSymbolicLink()) continue;
			if (child.isDirectory() && IGNORED_DIRECTORY_NAMES.has(child.name)) continue;

			const path = relative(rootPath, target).replaceAll("\\", "/");
			if (!path) continue;
			if (child.isDirectory()) {
				entries.push({ path, name: child.name, kind: "directory" });
				visit(target, depth + 1);
				continue;
			}
			if (!child.isFile()) continue;
			try {
				const stat = statSync(target);
				entries.push({ path, name: basename(target), kind: "file", size: stat.size, updatedAt: stat.mtimeMs });
			} catch {
				truncated = true;
			}
		}
	};

	visit(rootPath, 0);
	return { rootPath, entries, truncated };
}
