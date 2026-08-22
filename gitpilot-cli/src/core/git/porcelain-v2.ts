/**
 * git status --porcelain=v2 -z --branch 输出解析器。
 *
 * 业务意图：把 porcelain v2 的机器可读格式收敛为 Git 面板需要的结构化状态，
 * 使用 -z（NUL 分隔）保证中文、空格、rename 双路径不被引号转义干扰。
 * 纯函数无 IO，便于用字符串夹具完整覆盖边界路径。
 */

import type { GitFileStatus, GitStagedStatus, GitWorktreeStatus } from "./git-types.ts";

/** porcelain v2 解析结果（不含 repositoryId/Version 等服务层字段）。 */
export interface ParsedPorcelainState {
	branch: string | null;
	detached: boolean;
	upstream: string | null;
	ahead: number;
	behind: number;
	files: GitFileStatus[];
}

const STAGED_LETTERS: readonly string[] = ["A", "M", "D", "R", "C", "U"];
const WORKTREE_LETTERS: readonly string[] = ["M", "D", "U", "A"];

function stagedLetter(x: string): GitStagedStatus | null {
	// '.' 表示该侧无变化，其它非法字母按无变化处理，避免 UI 崩溃。
	return STAGED_LETTERS.includes(x) ? (x as GitStagedStatus) : null;
}

function worktreeLetter(y: string): GitWorktreeStatus | null {
	return WORKTREE_LETTERS.includes(y) ? (y as GitWorktreeStatus) : null;
}

/**
 * 解析 porcelain v2 -z 输出。每条记录以 NUL 结尾：
 * - `# branch.head/branch.upstream/branch.ab` 头信息
 * - `1 <XY> ... <path>` 普通变更
 * - `2 <XY> ... <X><score> <path>\0<origPath>` rename/copy（原路径丢弃，仅保留当前路径）
 * - `u <XY> ... <path>` 冲突
 * - `? <path>` 未跟踪、`! <path>` 已忽略（忽略条目不返回）
 */
export function parsePorcelainV2(raw: string): ParsedPorcelainState {
	const state: ParsedPorcelainState = {
		branch: null,
		detached: false,
		upstream: null,
		ahead: 0,
		behind: 0,
		files: [],
	};
	const records = raw.split("\0");
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		if (!record) continue;
		if (record.startsWith("# branch.head ")) {
			const head = record.slice("# branch.head ".length).trim();
			if (head === "(detached)") {
				state.detached = true;
				state.branch = null;
			} else {
				state.branch = head;
			}
			continue;
		}
		if (record.startsWith("# branch.upstream ")) {
			state.upstream = record.slice("# branch.upstream ".length).trim() || null;
			continue;
		}
		if (record.startsWith("# branch.ab ")) {
			const counters = record.slice("# branch.ab ".length).trim().split(/\s+/);
			for (const counter of counters) {
				if (counter.startsWith("+")) state.ahead = Number.parseInt(counter.slice(1), 10) || 0;
				if (counter.startsWith("-")) state.behind = Number.parseInt(counter.slice(1), 10) || 0;
			}
			continue;
		}
		if (record.startsWith("1 ") || record.startsWith("2 ") || record.startsWith("u ")) {
			const kind = record[0];
			const fields = record.split(" ");
			if (record.startsWith("u ")) {
				// 冲突条目：`u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`，路径在第 10 个字段之后。
				const xy = fields[1] ?? "..";
				const pathStart = fields.slice(0, 10).join(" ").length + 1;
				state.files.push({
					path: record.slice(pathStart).trim(),
					staged: stagedLetter(xy[0]),
					worktree: worktreeLetter(xy[1]),
					untracked: false,
					conflicted: true,
					// 行数统计由 repository-service 用 numstat 合并，解析层置空。
					stagedCounts: null,
					worktreeCounts: null,
				});
				continue;
			}
			// 普通与 rename/copy 条目：XY 中 '.' 表示该侧无变化。
			const xy = fields[1] ?? "..";
			const pathStart = fields.slice(0, kind === "2" ? 9 : 8).join(" ").length + 1;
			const path = record.slice(pathStart).trim();
			if (!path) continue;
			if (kind === "2") {
				// rename/copy 条目的原路径在下一条 NUL 记录里，跳过避免误当独立条目。
				const renameToken = fields[8];
				if (renameToken && /^[RC]\d*$/.test(renameToken)) index += 1;
			}
			state.files.push({
				path,
				staged: stagedLetter(xy[0]),
				worktree: worktreeLetter(xy[1]),
				untracked: false,
				conflicted: false,
				stagedCounts: null,
				worktreeCounts: null,
			});
			continue;
		}
		if (record.startsWith("? ")) {
			state.files.push({
				path: record.slice(2),
				staged: null,
				worktree: null,
				untracked: true,
				conflicted: false,
				stagedCounts: null,
				worktreeCounts: null,
			});
		}
		// `! ` 忽略条目与未知行直接丢弃。
	}
	return state;
}
