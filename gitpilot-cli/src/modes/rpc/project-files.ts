import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import type { CodeProjectFileEntry, CodeProjectFileList } from "./rpc-types.ts";

/**
 * Code 文件树的默认边界：只展示源码工作区的轻量元数据，不把依赖目录和运行时目录
 * 递归推送到 Desktop，避免一次刷新阻塞 sidecar 或把内部状态暴露给渲染层。
 *
 * 除固定名单外同时遵循工作区各级 .gitignore：运行时工件（如 .scan-workspace）常被
 * gitignore 覆盖却不在固定名单里，不读 .gitignore 时大仓库会被条目上限过早截断，
 * 文件树与 @ 提及都会"显示不全"。
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
const MAX_ENTRIES = 20_000;
const MAX_DEPTH = 16;

function compareNames(left: string, right: string): number {
	return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

// ============================================================================
// .gitignore 子集解析（覆盖常见语法：注释、取反、目录后缀、锚定、* ? ** 与字符类）
// ============================================================================

/** 单条 .gitignore 规则；base 为规则所属目录相对工作区根的路径（"" 表示根）。 */
interface IgnoreRule {
	base: string;
	negated: boolean;
	/** 仅匹配目录（模式以斜杠结尾）。 */
	dirOnly: boolean;
	/** 对相对 base 的路径做全匹配；非锚定模式的正则已内置任意层级前缀。 */
	regex: RegExp;
}

/**
 * 把 glob 风格模式翻译为正则片段。内部先以罕见占位符替换三种双星形态再逐字符翻译，
 * 避免在转义过程中把星号、问号与字符类一并转义。
 * anyDepth 为 true 时（双星前缀或非锚定模式）由调用方补任意层级前缀。
 */
function translateGlob(pattern: string): { body: string; anyDepth: boolean } {
	const PREFIX = "\u0001";
	const TAIL = "\u0002";
	const MID = "\u0003";
	let rest = pattern
		.replace(/^\*\*\//, `${PREFIX}/`)
		.replace(/\/\*\*$/, `/${TAIL}`)
		.replace(/\/\*\*\//, `/${MID}`);
	let anyDepth = false;
	if (rest.startsWith(`${PREFIX}/`)) {
		anyDepth = true;
		rest = rest.slice(PREFIX.length + 1);
	}
	let out = "";
	for (let i = 0; i < rest.length; i += 1) {
		const ch = rest[i]!;
		if (ch === TAIL) {
			out += ".+";
			continue;
		}
		if (ch === MID) {
			out += "(?:.*/)?";
			continue;
		}
		if (ch === "*") {
			out += "[^/]*";
			continue;
		}
		if (ch === "?") {
			out += "[^/]";
			continue;
		}
		if (ch === "[") {
			// 字符类按正则语法透传（gitignore 类语法与正则子集兼容）；未闭合时按字面量处理。
			const end = rest.indexOf("]", i + 1);
			if (end > i + 1) {
				out += rest.slice(i, end + 1);
				i = end;
				continue;
			}
			out += "\\[";
			continue;
		}
		if ("\\^$.+(){}|".includes(ch)) {
			out += `\\${ch}`;
			continue;
		}
		out += ch;
	}
	return { body: out, anyDepth };
}

/** 解析单个 .gitignore 文本为规则列表；base 为该 .gitignore 所在目录的相对路径。 */
export function parseGitignoreRules(content: string, base: string): IgnoreRule[] {
	const rules: IgnoreRule[] = [];
	for (const rawLine of content.split(/\r?\n/)) {
		if (!rawLine || rawLine.startsWith("#")) continue;
		let pattern = rawLine.replace(/(?<!\\)\s+$/, "");
		const negated = pattern.startsWith("!");
		if (negated) pattern = pattern.slice(1);
		if (!pattern || pattern === "/" || pattern === "\\") continue;
		const dirOnly = pattern.endsWith("/");
		if (dirOnly) pattern = pattern.slice(0, -1);
		if (!pattern) continue;
		const anchored = pattern.includes("/");
		pattern = pattern.replace(/^\//, "");
		const { body, anyDepth } = translateGlob(pattern);
		// 锚定模式相对 base 全路径匹配；**/ 前缀与非锚定模式可命中任意层级。
		const anyLevel = anyDepth || !anchored;
		const regex = new RegExp(`^${anyLevel ? "(?:.*/)?" : ""}${body}$`);
		rules.push({ base, negated, dirOnly, regex });
	}
	return rules;
}

/**
 * 判断条目是否被忽略：按 gitignore 语义，后命中的规则覆盖先命中的规则（取反可恢复）。
 * 固定忽略名单不参与取反，始终生效。
 */
function isEntryIgnored(relPath: string, isDirectory: boolean, rules: readonly IgnoreRule[]): boolean {
	if (isDirectory && IGNORED_DIRECTORY_NAMES.has(relPath.slice(relPath.lastIndexOf("/") + 1))) return true;
	let ignored = false;
	for (const rule of rules) {
		if (rule.dirOnly && !isDirectory) continue;
		const relToBase = rule.base === "" ? relPath : relPath.startsWith(`${rule.base}/`) ? relPath.slice(rule.base.length + 1) : null;
		if (relToBase === null) continue;
		if (rule.regex.test(relToBase)) ignored = !rule.negated;
	}
	return ignored;
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

	const visit = (directory: string, relBase: string, depth: number, parentRules: readonly IgnoreRule[]): void => {
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

		// 嵌套 .gitignore 只作用于其所在目录之内；父目录规则继续生效，同层级后声明者覆盖先声明者。
		const rules = children.some((child) => child.isFile() && child.name === ".gitignore")
			? (() => {
				try {
					return [...parentRules, ...parseGitignoreRules(readFileSync(join(directory, ".gitignore"), "utf-8"), relBase)];
				} catch {
					return parentRules;
				}
			})()
			: parentRules;

		for (const child of children) {
			if (entries.length >= MAX_ENTRIES) {
				truncated = true;
				return;
			}
			const target = join(directory, child.name);
			// 不跟随符号链接，避免项目内链接把读取范围带到工作目录之外。
			if (child.isSymbolicLink()) continue;
			if (child.isDirectory() && IGNORED_DIRECTORY_NAMES.has(child.name)) continue;

			const path = `${relBase}${relBase ? "/" : ""}${child.name}`;
			if (isEntryIgnored(path, child.isDirectory(), rules)) continue;
			if (child.isDirectory()) {
				entries.push({ path, name: child.name, kind: "directory" });
				visit(target, path, depth + 1, rules);
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

	visit(rootPath, "", 0, []);
	return { rootPath, entries, truncated };
}
