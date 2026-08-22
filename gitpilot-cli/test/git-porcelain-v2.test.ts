import { describe, expect, it } from "vitest";
import { parsePorcelainV2 } from "../src/core/git/porcelain-v2.ts";

/** 按 porcelain v2 -z 语义拼接夹具：每条记录以 NUL 结尾，无换行。 */
function fixture(records: string[]): string {
	return `${records.join("\0")}\0`;
}

describe("parsePorcelainV2", () => {
	it("解析分支头信息：分支名、upstream 与 ahead/behind", () => {
		const state = parsePorcelainV2(fixture([
			"# branch.oid 0123456789abcdef0123456789abcdef01234567",
			"# branch.head main",
			"# branch.upstream origin/main",
			"# branch.ab +2 -1",
		]));
		expect(state.branch).toBe("main");
		expect(state.detached).toBe(false);
		expect(state.upstream).toBe("origin/main");
		expect(state.ahead).toBe(2);
		expect(state.behind).toBe(1);
		expect(state.files).toEqual([]);
	});

	it("detached HEAD：branch 为 null 且 detached 为 true", () => {
		const state = parsePorcelainV2(fixture([
			"# branch.oid 0123456789abcdef0123456789abcdef01234567",
			"# branch.head (detached)",
		]));
		expect(state.branch).toBeNull();
		expect(state.detached).toBe(true);
		expect(state.upstream).toBeNull();
	});

	it("普通条目：XY 中的 '.' 表示该侧无变化", () => {
		const state = parsePorcelainV2(fixture([
			"# branch.head main",
			"1 .M N... 100644 100644 100644 aaaa bbbb src/modified.ts",
			"1 M. N... 100644 100644 100644 aaaa bbbb src/staged.ts",
			"1 MM N... 100644 100644 100644 aaaa bbbb src/both.ts",
			"1 .D N... 100644 100644 100644 aaaa bbbb src/deleted.ts",
		]));
		expect(state.files).toEqual([
			{ path: "src/modified.ts", staged: null, worktree: "M", untracked: false, conflicted: false, stagedCounts: null, worktreeCounts: null },
			{ path: "src/staged.ts", staged: "M", worktree: null, untracked: false, conflicted: false, stagedCounts: null, worktreeCounts: null },
			{ path: "src/both.ts", staged: "M", worktree: "M", untracked: false, conflicted: false, stagedCounts: null, worktreeCounts: null },
			{ path: "src/deleted.ts", staged: null, worktree: "D", untracked: false, conflicted: false, stagedCounts: null, worktreeCounts: null },
		]);
	});

	it("rename 条目：保留当前路径，跳过 NUL 后的原路径", () => {
		const state = parsePorcelainV2(fixture([
			"# branch.head main",
			"2 R. N... 100644 100644 100644 aaaa bbbb R100 src/renamed.ts",
			"src/orig.ts",
			"? untracked.md",
		]));
		expect(state.files).toEqual([
			{ path: "src/renamed.ts", staged: "R", worktree: null, untracked: false, conflicted: false, stagedCounts: null, worktreeCounts: null },
			{ path: "untracked.md", staged: null, worktree: null, untracked: true, conflicted: false, stagedCounts: null, worktreeCounts: null },
		]);
	});

	it("冲突条目归入 conflicted 组", () => {
		const state = parsePorcelainV2(fixture([
			"# branch.head main",
			"u UU N... 100644 100644 100644 100644 aaaa bbbb cccc conflict.txt",
			"u AA N... 100644 100644 100644 100644 aaaa bbbb cccc both-added.txt",
		]));
		expect(state.files).toEqual([
			{ path: "conflict.txt", staged: "U", worktree: "U", untracked: false, conflicted: true, stagedCounts: null, worktreeCounts: null },
			{ path: "both-added.txt", staged: "A", worktree: "A", untracked: false, conflicted: true, stagedCounts: null, worktreeCounts: null },
		]);
	});

	it("中文与空格路径不转义，忽略条目不返回", () => {
		const state = parsePorcelainV2(fixture([
			"# branch.head main",
			"1 .M N... 100644 100644 100644 aaaa bbbb 文档 目录/中文 文件.md",
			"1 .M N... 100644 100644 100644 aaaa bbbb path with space.txt",
			"! node_modules",
			"? 新建 未跟踪.txt",
		]));
		expect(state.files.map((file) => file.path)).toEqual([
			"文档 目录/中文 文件.md",
			"path with space.txt",
			"新建 未跟踪.txt",
		]);
	});

	it("未跟踪文件与 staged 新增文件并存", () => {
		const state = parsePorcelainV2(fixture([
			"# branch.head main",
			"1 A. N... 000000 100644 100644 000000 aaaa src/new-file.ts",
			"? notes.md",
		]));
		expect(state.files).toEqual([
			{ path: "src/new-file.ts", staged: "A", worktree: null, untracked: false, conflicted: false, stagedCounts: null, worktreeCounts: null },
			{ path: "notes.md", staged: null, worktree: null, untracked: true, conflicted: false, stagedCounts: null, worktreeCounts: null },
		]);
	});
});
