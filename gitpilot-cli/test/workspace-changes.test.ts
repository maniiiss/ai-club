import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { persistWorkspaceChangeArtifact, restoreWorkspaceChangeSetFromEntries, WorkspaceChangeTracker } from "../src/core/workspace-changes.ts";

const temporaryDirectories: string[] = [];

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createRepository(): string {
	const root = mkdtempSync(join(tmpdir(), "gitpilot-workspace-test-"));
	temporaryDirectories.push(root);
	git(root, "init", "--quiet");
	git(root, "config", "user.email", "test@example.com");
	git(root, "config", "user.name", "GitPilot Test");
	return root;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("WorkspaceChangeTracker", () => {
	it("只返回任务路径相对基线的最终净 diff，不带入本地已有和其它路径改动", async () => {
		const root = createRepository();
		writeFileSync(join(root, "existing.ts"), "one\n", "utf8");
		writeFileSync(join(root, "other.ts"), "original\n", "utf8");
		git(root, "add", "existing.ts", "other.ts");
		git(root, "commit", "--quiet", "-m", "initial");

		// 任务开始前已有的 tracked 修改和 untracked 文件都必须进入临时基线。
		writeFileSync(join(root, "existing.ts"), "one\nlocal\n", "utf8");
		writeFileSync(join(root, "preexisting.ts"), "local-only\n", "utf8");
		const realIndexBefore = git(root, "diff", "--cached");

		const tracker = new WorkspaceChangeTracker(root);
		await tracker.beginRun();
		tracker.recordToolArguments({ path: "existing.ts" });
		tracker.recordToolArguments({ path: "task.ts" });

		writeFileSync(join(root, "existing.ts"), "one\nlocal\ntask\n", "utf8");
		writeFileSync(join(root, "task.ts"), "created\nsecond\n", "utf8");
		// 其它任务修改了未被本次工具调用声明的路径，不能出现在结果里。
		writeFileSync(join(root, "other.ts"), "other-task\n", "utf8");

		const changes = await tracker.finalize();
		expect(changes?.files).toEqual([
			{ path: "existing.ts", status: "modified", added: 1, removed: 0, diff: expect.stringContaining("+task") },
			{ path: "task.ts", status: "added", added: 2, removed: 0, diff: expect.stringContaining("+created") },
		]);
		expect(changes?.files.some((file) => file.path === "other.ts" || file.path === "preexisting.ts")).toBe(false);
		// 临时 index 不能污染用户实际 index。
		expect(git(root, "diff", "--cached")).toBe(realIndexBefore);
	});

	it("同一文件多次写入只计算最终状态", async () => {
		const root = createRepository();
		writeFileSync(join(root, "file.ts"), "before\n", "utf8");
		git(root, "add", "file.ts");
		git(root, "commit", "--quiet", "-m", "initial");
		const tracker = new WorkspaceChangeTracker(root);
		await tracker.beginRun();
		tracker.recordToolArguments({ path: "file.ts" });
		writeFileSync(join(root, "file.ts"), "intermediate\nextra\n", "utf8");
		writeFileSync(join(root, "file.ts"), "final\n", "utf8");

		const changes = await tracker.finalize();
		expect(changes?.files[0]).toMatchObject({ path: "file.ts", added: 1, removed: 1 });
		expect(changes?.files[0]?.diff).toContain("+final");
		expect(changes?.files[0]?.diff).not.toContain("+extra");
	});

	it("持久化只写压缩 artifact，能够从 execution entry 恢复完整 diff", () => {
		const root = createRepository();
		const sessionFile = join(root, "session.jsonl");
		writeFileSync(sessionFile, "{}\n", "utf8");
		const changes = { version: 1 as const, source: "git" as const, files: [{ path: "large.ts", status: "modified" as const, added: 1, removed: 1, diff: "-old\n+new" }] };
		const ref = persistWorkspaceChangeArtifact(sessionFile, changes);
		expect(ref?.bytes).toBeGreaterThan(0);
		const restored = restoreWorkspaceChangeSetFromEntries([
			{ type: "custom", customType: "gitpilot.execution-run.v1", data: { workspaceChanges: ref } } as never,
		], sessionFile);
		expect(restored).toEqual(changes);
	});
});
