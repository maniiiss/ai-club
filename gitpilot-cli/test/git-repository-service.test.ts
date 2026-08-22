import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitServiceError } from "../src/core/git/git-types.ts";
import { RepositoryService } from "../src/core/git/repository-service.ts";

const temporaryDirectories: string[] = [];

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createDirectory(): string {
	const root = mkdtempSync(join(tmpdir(), "gitpilot-repo-service-test-"));
	temporaryDirectories.push(root);
	return root;
}

function createRepository(): string {
	const root = createDirectory();
	git(root, "init", "--quiet");
	git(root, "config", "user.email", "test@example.com");
	git(root, "config", "user.name", "GitPilot Test");
	return root;
}

function commitFile(root: string, path: string, content: string, message: string): void {
	writeFileSync(join(root, path), content, "utf8");
	git(root, "add", "--", path);
	git(root, "commit", "--quiet", "-m", message);
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function expectGitError(promise: Promise<unknown>, code: string): Promise<void> {
	try {
		await promise;
		expect.unreachable(`期望抛出 GitServiceError ${code}`);
	} catch (error) {
		expect(error).toBeInstanceOf(GitServiceError);
		expect((error as GitServiceError).code).toBe(code);
	}
}

describe("RepositoryService", () => {
	it("非仓库目录 getState 抛 NOT_A_REPOSITORY", async () => {
		const service = new RepositoryService();
		await expectGitError(service.getState(createDirectory()), "NOT_A_REPOSITORY");
	});

	it("状态 → 暂存 → 取消暂存 → 提交 闭环，版本自增且空提交被拒", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		commitFile(root, "base.ts", "one\n", "initial");
		writeFileSync(join(root, "feature.ts"), "new content\n", "utf8");

		const initial = await service.getState(root);
		expect(initial.files).toEqual([
			{ path: "feature.ts", staged: null, worktree: null, untracked: true, conflicted: false, stagedCounts: null, worktreeCounts: null },
		]);

		const staged = await service.stagePaths(root, ["feature.ts"]);
		expect(staged.state.files[0]).toMatchObject({ staged: "A", untracked: false });
		// numstat 计数随状态合并：暂存 1 行新增、工作区无差异。
		expect(staged.state.files[0].stagedCounts).toEqual({ added: 1, removed: 0 });
		expect(staged.state.files[0].worktreeCounts).toBeNull();
		expect(staged.repositoryVersion).toBe(initial.repositoryVersion + 1);

		const unstaged = await service.unstagePaths(root, ["feature.ts"]);
		expect(unstaged.state.files[0]).toMatchObject({ untracked: true, staged: null });

		await service.stagePaths(root, ["feature.ts"]);
		const committed = await service.commit(root, "add feature");
		expect(committed.commitSha).toMatch(/^[0-9a-f]{40}$/);
		expect(committed.state.files).toEqual([]);
		// staged 之后还有 unstage、stage、commit 三次写操作，版本自增 3。
		expect(committed.repositoryVersion).toBe(staged.repositoryVersion + 3);

		await expectGitError(service.commit(root, "empty"), "NOTHING_STAGED");
		await expectGitError(service.commit(root, "   "), "INVALID_INPUT");
	});

	it("unborn 仓库（尚无提交）取消暂存走 rm --cached 分支", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		writeFileSync(join(root, "first.ts"), "hello\n", "utf8");
		git(root, "add", "--", "first.ts");
		const result = await service.unstagePaths(root, ["first.ts"]);
		expect(result.state.files[0]).toMatchObject({ untracked: true });
	});

	it("误跟踪文件被标注 ignoredTracked，普通文件与被忽略的未跟踪文件不受影响", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		commitFile(root, "tracked.ts", "one\n", "initial");
		// 先提交再忽略：tracked.ts 成为误跟踪文件；skipped.log 未跟踪且被忽略，不应出现在状态里。
		commitFile(root, ".gitignore", "tracked.ts\nskipped.log\n", "ignore rules");
		writeFileSync(join(root, "tracked.ts"), "two\n", "utf8");
		writeFileSync(join(root, "skipped.log"), "noise\n", "utf8");
		writeFileSync(join(root, "fresh.ts"), "new\n", "utf8");

		const state = await service.getState(root);
		expect(state.files.find((file) => file.path === "tracked.ts")).toMatchObject({ worktree: "M", ignoredTracked: true });
		expect(state.files.find((file) => file.path === "fresh.ts")).toMatchObject({ untracked: true });
		expect(state.files.find((file) => file.path === "fresh.ts")?.ignoredTracked).toBeUndefined();
		expect(state.files.some((file) => file.path === "skipped.log")).toBe(false);
	});

	it("untrackPaths 解除误跟踪：本地文件保留、状态转已暂存删除、提交后退出状态", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		commitFile(root, "dist.js", "one\n", "initial");
		commitFile(root, ".gitignore", "dist.js\n", "ignore dist");
		writeFileSync(join(root, "dist.js"), "two\n", "utf8");
		expect((await service.getState(root)).files.find((file) => file.path === "dist.js")?.ignoredTracked).toBe(true);

		const untracked = await service.untrackPaths(root, ["dist.js"]);
		// 解除后 index 不再包含该文件：误跟踪标注消失，删除进入暂存区等待提交。
		expect(untracked.state.files.find((file) => file.path === "dist.js")).toMatchObject({ staged: "D", untracked: false });
		expect(existsSync(join(root, "dist.js"))).toBe(true);
		expect(git(root, "ls-files", "--", "dist.js")).toBe("");

		const committed = await service.commit(root, "untrack dist.js");
		// 提交删除后文件变为未跟踪且被忽略，彻底退出状态。
		expect(committed.state.files).toEqual([]);

		await expectGitError(service.untrackPaths(root, []), "INVALID_INPUT");
		await expectGitError(service.untrackPaths(root, ["../escape.js"]), "INVALID_INPUT");
		await expectGitError(service.untrackPaths(root, ["never-tracked.txt"]), "GIT_FAILED");
	});

	it("getDiff 返回工作区与暂存区 unified diff，二进制文件只探测不返回内容", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		commitFile(root, "a.txt", "line1\nline2\n", "initial");
		writeFileSync(join(root, "a.txt"), "line1\nchanged\n", "utf8");

		const worktree = await service.getDiff(root, "worktree", "a.txt");
		expect(worktree.binary).toBe(false);
		expect(worktree.diff).toContain("-line2");
		expect(worktree.diff).toContain("+changed");

		await service.stagePaths(root, ["a.txt"]);
		const staged = await service.getDiff(root, "staged", "a.txt");
		expect(staged.diff).toContain("+changed");
		// 暂存后再无工作区差异。
		const afterStage = await service.getDiff(root, "worktree", "a.txt");
		expect(afterStage.diff).toBe("");

		writeFileSync(join(root, "logo.bin"), Buffer.from([0x00, 0xff, 0x01, 0x02]));
		await service.stagePaths(root, ["logo.bin"]);
		const binary = await service.getDiff(root, "staged", "logo.bin");
		expect(binary.binary).toBe(true);
		expect(binary.diff).toBe("");
	});

	it("listBranches 区分本地/远程并标记当前分支", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		commitFile(root, "a.txt", "x\n", "initial");
		const current = git(root, "rev-parse", "--abbrev-ref", "HEAD");
		const bare = createDirectory();
		git(bare, "init", "--quiet", "--bare");
		git(root, "remote", "add", "origin", bare);
		git(root, "push", "--quiet", "--set-upstream", "origin", "HEAD");
		git(root, "branch", "feature/x");

		const branches = await service.listBranches(root);
		const local = branches.filter((branch) => branch.kind === "local");
		const remote = branches.filter((branch) => branch.kind === "remote");
		expect(local.map((branch) => branch.name).sort()).toEqual(["feature/x", current].sort());
		expect(remote.map((branch) => branch.name)).toEqual([`origin/${current}`]);
		expect(local.find((branch) => branch.name === current)?.current).toBe(true);
		expect(local.find((branch) => branch.name === "feature/x")?.upstream).toBeNull();
	});

	it("createBranch / switchBranch，本地变更会被覆盖时被 Git 阻断", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		commitFile(root, "shared.ts", "v1\n", "initial");
		const baseBranch = git(root, "rev-parse", "--abbrev-ref", "HEAD");
		await service.createBranch(root, "feature", true);
		expect((await service.getState(root)).branch).toBe("feature");
		commitFile(root, "shared.ts", "v2 from feature\n", "feature change");
		await service.switchBranch(root, baseBranch);
		expect((await service.getState(root)).branch).toBe(baseBranch);
		writeFileSync(join(root, "shared.ts"), "local edit on master\n", "utf8");
		await expectGitError(service.switchBranch(root, "feature"), "WORKTREE_WOULD_BE_OVERWRITTEN");
		await expectGitError(service.createBranch(root, "-bad-name", false), "INVALID_INPUT");
	});

	it("路径逃逸与非法路径被拒绝", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		await expectGitError(service.stagePaths(root, ["../escape.txt"]), "INVALID_INPUT");
		await expectGitError(service.stagePaths(root, ["C:/absolute.txt"]), "INVALID_INPUT");
		await expectGitError(service.stagePaths(root, []), "INVALID_INPUT");
		await expectGitError(service.getDiff(root, "worktree", "../../etc/passwd"), "INVALID_INPUT");
	});

	it("expectedVersion 过期时写操作被拒绝", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		commitFile(root, "a.txt", "x\n", "initial");
		writeFileSync(join(root, "b.txt"), "y\n", "utf8");
		// 先暂存，保证 commit 通过 NOTHING_STAGED 前置校验、命中版本守卫。
		git(root, "add", "--", "b.txt");
		await expectGitError(service.commit(root, "stale", 999), "STALE_REPOSITORY_VERSION");
	});

	it("写操作互斥：进行中时第二个写操作立即失败", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		commitFile(root, "a.txt", "x\n", "initial");
		writeFileSync(join(root, "b.txt"), "y\n", "utf8");
		// 直接注入互斥标记，模拟一个未结束的写操作，验证守卫语义而非时序；
		// key 必须用 rev-parse 解析后的仓库根（mkdtemp 短路径与 git 返回的长路径可能不同）。
		const resolvedRoot = git(root, "rev-parse", "--show-toplevel");
		(service as unknown as { activeWrites: Map<string, boolean> }).activeWrites.set(resolvedRoot, true);
		await expectGitError(service.stagePaths(root, ["b.txt"]), "OPERATION_IN_PROGRESS");
	});

	it("无远程 fetch 抛 NO_REMOTE；push 未设上游且未带 setUpstream 抛 NO_UPSTREAM", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		commitFile(root, "a.txt", "x\n", "initial");
		await expectGitError(service.fetch(root), "NO_REMOTE");

		const bare = createDirectory();
		git(bare, "init", "--quiet", "--bare");
		git(root, "remote", "add", "origin", bare);
		await expectGitError(service.push(root), "NO_UPSTREAM");
	});

	it("setUpstream 推送 → ff-only 拉取 → 分叉双向都被稳定阻断", async () => {
		const service = new RepositoryService();
		const root = createRepository();
		commitFile(root, "a.txt", "v1\n", "initial");
		const bare = createDirectory();
		git(bare, "init", "--quiet", "--bare");
		git(root, "remote", "add", "origin", bare);

		const branch = git(root, "rev-parse", "--abbrev-ref", "HEAD");
		const pushed = await service.push(root, undefined, true);
		expect(pushed.state.upstream).toBe(`origin/${branch}`);
		expect(pushed.state.ahead).toBe(0);

		// 第二个克隆推进远程一个提交，root 落后即可快进。
		const clone = createDirectory();
		git(clone, "clone", "--quiet", bare, clone);
		git(clone, "config", "user.email", "peer@example.com");
		git(clone, "config", "user.name", "Peer");
		commitFile(clone, "a.txt", "v2 from peer\n", "peer advance");
		git(clone, "push", "--quiet", "origin", branch);

		const pulled = await service.pullFfOnly(root);
		expect(pulled.state.behind).toBe(0);

		// 双向各自新提交造成分叉：pull 与 push 都必须被阻断。
		commitFile(root, "a.txt", "v3 local\n", "local diverge");
		commitFile(clone, "a.txt", "v3 peer\n", "peer diverge");
		git(clone, "push", "--quiet", "origin", branch);
		await service.fetch(root);
		await expectGitError(service.pullFfOnly(root), "NON_FAST_FORWARD");
		await expectGitError(service.push(root), "NON_FAST_FORWARD");
	});

	it("写操作完成后广播 started/completed/state_changed 事件", async () => {
		const service = new RepositoryService();
		const events: string[] = [];
		service.onEvent((event) => events.push(event.type));
		const root = createRepository();
		commitFile(root, "a.txt", "x\n", "initial");
		writeFileSync(join(root, "b.txt"), "y\n", "utf8");
		await service.stagePaths(root, ["b.txt"]);
		expect(events).toEqual(["git_operation_started", "git_operation_completed", "git_state_changed"]);
	});
});
