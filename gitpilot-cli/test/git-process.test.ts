import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitServiceError } from "../src/core/git/git-types.ts";
import { classifyGitFailure, runGitProcess, runGitChecked } from "../src/core/git/git-process.ts";

const temporaryDirectories: string[] = [];

function createDirectory(): string {
	const root = mkdtempSync(join(tmpdir(), "gitpilot-git-process-test-"));
	temporaryDirectories.push(root);
	return root;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** classifyGitFailure 只依赖 stderr/stdout/退出码，用字符串夹具覆盖各错误码分支。 */
describe("classifyGitFailure", () => {
	it("非仓库目录映射 NOT_A_REPOSITORY", () => {
		const error = classifyGitFailure({ stdout: "", stderr: "fatal: not a git repository (or any of the parent directories): .git", code: 128, killed: false });
		expect(error).toBeInstanceOf(GitServiceError);
		expect(error.code).toBe("NOT_A_REPOSITORY");
	});

	it("切分支覆盖本地变更映射 WORKTREE_WOULD_BE_OVERWRITTEN", () => {
		const error = classifyGitFailure({ stdout: "", stderr: "error: Your local changes to the following files would be overwritten by checkout", code: 1, killed: false });
		expect(error.code).toBe("WORKTREE_WOULD_BE_OVERWRITTEN");
	});

	it("分叉 pull/push 映射 NON_FAST_FORWARD", () => {
		expect(classifyFailure("fatal: Not possible to fast-forward, aborting.")).toBe("NON_FAST_FORWARD");
		expect(classifyFailure("hint: Updates were rejected because the tip of your current branch is behind its remote counterpart")).toBe("NON_FAST_FORWARD");
	});

	it("凭据失败映射 AUTHENTICATION_FAILED", () => {
		expect(classifyFailure("fatal: Authentication failed for 'https://example.com/repo.git/'")).toBe("AUTHENTICATION_FAILED");
		expect(classifyFailure("fatal: could not read Username for 'https://example.com': terminal prompts disabled")).toBe("AUTHENTICATION_FAILED");
		expect(classifyFailure("git@example.com: Permission denied (publickey).")).toBe("AUTHENTICATION_FAILED");
	});

	it("网络失败映射 NETWORK_FAILED", () => {
		expect(classifyFailure("fatal: unable to access 'https://example.com/repo.git/': Could not resolve host: example.com")).toBe("NETWORK_FAILED");
	});

	it("上游/远程缺失与空提交映射稳定码", () => {
		expect(classifyFailure("fatal: The current branch feat/x has no upstream branch.")).toBe("NO_UPSTREAM");
		expect(classifyFailure("fatal: 'origin' does not appear to be a git repository\nfatal: Could not read from remote repository.") === "NO_REMOTE").toBe(false);
		expect(classifyFailure("error: failed to push some refs")).toBe("GIT_FAILED");
	});

	it("进程被终止映射 GIT_FAILED 超时文案", () => {
		const error = classifyGitFailure({ stdout: "", stderr: "", code: 1, killed: true });
		expect(error.code).toBe("GIT_FAILED");
		expect(error.message).toContain("超时");
	});

	it("未知失败保留 stderr 摘要", () => {
		const error = classifyGitFailure({ stdout: "", stderr: "fatal: some unknown failure", code: 128, killed: false });
		expect(error.code).toBe("GIT_FAILED");
		expect(error.message).toContain("some unknown failure");
	});

	function classifyFailure(stderr: string): string {
		return classifyGitFailure({ stdout: "", stderr, code: 128, killed: false }).code;
	}
});

describe("runGitProcess", () => {
	it("真实仓库内执行只读命令并返回 stdout", async () => {
		const root = createDirectory();
		execFileSync("git", ["init", "--quiet"], { cwd: root });
		const result = await runGitProcess({ cwd: root, args: ["rev-parse", "--is-inside-work-tree"], operationId: "smoke", readOnly: true, timeoutMs: 10_000 });
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe("true");
	});

	it("超出 maxOutputBytes 时截断并标记 truncated", async () => {
		const root = createDirectory();
		execFileSync("git", ["init", "--quiet"], { cwd: root });
		const result = await runGitProcess(
			{ cwd: root, args: ["--version"], operationId: "truncate", readOnly: true, timeoutMs: 10_000 },
			{ maxOutputBytes: 5 },
		);
		expect(result.truncated).toBe(true);
		expect(result.stdout.length).toBeLessThanOrEqual(5);
	});

	it("runGitChecked 非零退出码抛出 GitServiceError", async () => {
		const plain = createDirectory();
		// 真实存在但未 git init 的目录，保证 stderr 是稳定的 "not a git repository"。
		await expect(runGitChecked({ cwd: plain, args: ["rev-parse", "--show-toplevel"], operationId: "fail", readOnly: true, timeoutMs: 10_000 })).rejects.toMatchObject({ code: "NOT_A_REPOSITORY" });
	});
});
