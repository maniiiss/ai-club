/**
 * 任务级工作区改动收集器。
 *
 * 业务意图：Code 任务展示的是“本次任务最终留下的改动”，而不是工具调用
 * 过程中每一次 edit/write 的行数累加。基线使用临时 Git index 生成，不触碰
 * 用户真实 index；最终 diff 只限定在本次任务工具调用声明过的路径内，避免把
 * 任务开始前的本地改动或其它任务修改的其它文件带进来。
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { execCommand } from "./exec.ts";
import type { SessionEntry } from "./session-manager.ts";

export type WorkspaceChangeStatus = "modified" | "added" | "deleted";

export interface WorkspaceChangedFile {
	path: string;
	status: WorkspaceChangeStatus;
	added: number;
	removed: number;
	/** 文本文件的最终 unified diff；二进制或仅模式变化可能没有该字段。 */
	diff?: string;
}

/** RPC 与桌面端展示使用的任务级最终改动集合。 */
export interface WorkspaceChangeSet {
	version: 1;
	source: "git";
	files: WorkspaceChangedFile[];
}

/** JSONL 只保存这份轻量引用，完整 diff 存放在压缩 artifact 中。 */
export interface WorkspaceChangeArtifactRef {
	version: 1;
	source: "git";
	path: string;
	bytes: number;
	sha256: string;
	fileCount: number;
	added: number;
	removed: number;
}

const GIT_TIMEOUT_MS = 20_000;
const ARTIFACT_DIR = "workspace-changes";

interface GitWorkspace {
	repoRoot: string;
	rootPath: string;
}

interface GitStatusEntry {
	status: WorkspaceChangeStatus;
	path: string;
}

function normalizeSlashes(value: string): string {
	return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function parseDiffStats(diff: string): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
		if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
	}
	return { added, removed };
}

function isInside(root: string, target: string): boolean {
	const rel = relative(root, target);
	return rel === "" || (rel !== ".." && !rel.startsWith(`..${target.includes("\\") ? "\\" : "/"}`) && !isAbsolute(rel));
}

function collectCandidatePaths(args: unknown): string[] {
	if (!args || typeof args !== "object") return [];
	const record = args as Record<string, unknown>;
	const keys = ["path", "filePath", "file_path", "file", "filename", "newPath", "new_path"];
	return keys.flatMap((key) => {
		const value = record[key];
		if (typeof value === "string") return [value];
		if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
		return [];
	});
}

async function runGit(args: string[], cwd: string, indexPath?: string) {
	return execCommand("git", args, cwd, {
		timeout: GIT_TIMEOUT_MS,
		env: indexPath ? { GIT_INDEX_FILE: indexPath } : undefined,
	});
}

async function resolveGitWorkspace(cwd: string): Promise<GitWorkspace | undefined> {
	const result = await runGit(["rev-parse", "--show-toplevel"], cwd);
	if (result.code !== 0) return undefined;
	const repoRoot = resolve(result.stdout.trim());
	// 后续 add/diff 统一从仓库根执行，避免 Code cwd 位于仓库子目录时
	// `git add -A` 受当前目录语义影响而漏掉基线文件。
	return repoRoot ? { repoRoot, rootPath: repoRoot } : undefined;
}

async function createTree(workspace: GitWorkspace, indexPath: string): Promise<string | undefined> {
	const add = await runGit(["add", "-A"], workspace.rootPath, indexPath);
	if (add.code !== 0) return undefined;
	const tree = await runGit(["write-tree"], workspace.rootPath, indexPath);
	if (tree.code !== 0) return undefined;
	const hash = tree.stdout.trim();
	return /^[0-9a-f]{40}$/.test(hash) ? hash : undefined;
}

function parseNameStatus(output: string): GitStatusEntry[] {
	return output
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter(Boolean)
		.map((line) => {
			const [rawStatus, ...pathParts] = line.split("\t");
			const status = rawStatus?.[0];
			const path = pathParts.join("\t");
			if (!path || (status !== "M" && status !== "A" && status !== "D")) return undefined;
			return { status: status === "A" ? "added" : status === "D" ? "deleted" : "modified", path };
		})
		.filter((entry): entry is GitStatusEntry => entry !== undefined);
}

function toRepoPath(workspace: GitWorkspace, workspacePath: string): string | undefined {
	const target = resolve(workspace.rootPath, workspacePath);
	if (!isInside(workspace.repoRoot, target)) return undefined;
	return normalizeSlashes(relative(workspace.repoRoot, target));
}

function toWorkspacePath(workspace: GitWorkspace, repoPath: string): string {
	const target = resolve(workspace.repoRoot, repoPath);
	return normalizeSlashes(relative(workspace.rootPath, target));
}

function safeArtifactPath(sessionFile: string, artifactPath: string): string | undefined {
	const sessionDir = resolve(dirname(sessionFile));
	const target = resolve(sessionDir, artifactPath);
	if (!isInside(sessionDir, target)) return undefined;
	return target;
}

/** 将完整结果压缩到 session JSONL 外的独立 artifact，JSONL 仅保留引用。 */
export function persistWorkspaceChangeArtifact(
	sessionFile: string | undefined,
	set: WorkspaceChangeSet,
): WorkspaceChangeArtifactRef | undefined {
	if (!sessionFile || set.files.length === 0) return undefined;
	try {
		const artifactPath = `${ARTIFACT_DIR}/${set.files.length}-${Date.now()}.json.gz`;
		const absolutePath = safeArtifactPath(sessionFile, artifactPath);
		if (!absolutePath) return undefined;
		mkdirSync(dirname(absolutePath), { recursive: true });
		const payload = Buffer.from(JSON.stringify(set), "utf8");
		const compressed = gzipSync(payload, { level: 9 });
		writeFileSync(absolutePath, compressed, { mode: 0o600 });
		return {
			version: 1,
			source: "git",
			path: artifactPath,
			bytes: compressed.byteLength,
			sha256: createHash("sha256").update(compressed).digest("hex"),
			fileCount: set.files.length,
			added: set.files.reduce((total, file) => total + file.added, 0),
			removed: set.files.reduce((total, file) => total + file.removed, 0),
		};
	} catch {
		return undefined;
	}
}

/** 从历史 custom entry 引用读取最近一次任务的完整改动。 */
export function restoreWorkspaceChangeSetFromEntries(entries: SessionEntry[], sessionFile?: string): WorkspaceChangeSet | undefined {
	if (!sessionFile) return undefined;
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index];
		if (entry.type !== "custom" || entry.customType !== "gitpilot.execution-run.v1") continue;
		const ref = (entry.data as { workspaceChanges?: unknown } | undefined)?.workspaceChanges;
		if (!ref || typeof ref !== "object") return undefined;
		const record = ref as Partial<WorkspaceChangeArtifactRef>;
		if (record.version !== 1 || record.source !== "git" || typeof record.path !== "string") return undefined;
		const absolutePath = safeArtifactPath(sessionFile, record.path);
		if (!absolutePath || !existsSync(absolutePath)) return undefined;
		try {
			const compressed = readFileSync(absolutePath);
			if (typeof record.sha256 === "string" && createHash("sha256").update(compressed).digest("hex") !== record.sha256) return undefined;
			const parsed = JSON.parse(gunzipSync(compressed).toString("utf8")) as WorkspaceChangeSet;
			return parsed.version === 1 && parsed.source === "git" && Array.isArray(parsed.files) ? parsed : undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

/**
 * 每个 AgentSession 实例只维护当前 run 的临时基线与路径集合。
 * 任务结束后立即清理临时 index；不会留下工作区快照或改变真实 index。
 */
export class WorkspaceChangeTracker {
	private readonly cwd: string;
	private workspace: GitWorkspace | undefined;
	private temporaryDirectory: string | undefined;
	private baselineTree: string | undefined;
	private taskPaths = new Set<string>();

	constructor(cwd: string) {
		this.cwd = resolve(cwd);
	}

	async beginRun(): Promise<void> {
		this.cleanup();
		try {
			this.workspace = await resolveGitWorkspace(this.cwd);
			if (!this.workspace) return;
			this.temporaryDirectory = mkdtempSync(join(tmpdir(), "gitpilot-workspace-"));
			this.baselineTree = await createTree(this.workspace, join(this.temporaryDirectory, "baseline.index"));
			if (!this.baselineTree) this.cleanup();
		} catch {
			this.cleanup();
		}
	}

	recordToolArguments(args: unknown): void {
		if (!this.workspace || !this.baselineTree) return;
		for (const candidate of collectCandidatePaths(args)) {
			const rawPath = candidate.trim();
			if (!rawPath) continue;
			const target = isAbsolute(candidate) ? resolve(candidate) : resolve(this.cwd, candidate);
			if (!isInside(this.cwd, target) || !isInside(this.workspace.repoRoot, target)) continue;
			const path = normalizeSlashes(relative(this.cwd, target));
			if (path && path !== ".") this.taskPaths.add(path);
		}
	}

	async finalize(): Promise<WorkspaceChangeSet | undefined> {
		if (!this.workspace || !this.baselineTree || this.taskPaths.size === 0) {
			this.cleanup();
			return undefined;
		}
		try {
			const finalIndex = join(this.temporaryDirectory ?? "", "final.index");
			const finalTree = await createTree(this.workspace, finalIndex);
			if (!finalTree) return undefined;
			const repoPaths = [...this.taskPaths].map((path) => toRepoPath(this.workspace!, path)).filter((path): path is string => Boolean(path));
			if (repoPaths.length === 0) return undefined;
			const status = await runGit(["-c", "core.quotePath=false", "diff", "--no-ext-diff", "--no-renames", "--no-color", "--name-status", this.baselineTree, finalTree, "--", ...repoPaths], this.workspace.rootPath);
			if (status.code !== 0) return undefined;
			const files: WorkspaceChangedFile[] = [];
			for (const entry of parseNameStatus(status.stdout)) {
				const diff = await runGit(["-c", "core.quotePath=false", "diff", "--no-ext-diff", "--no-renames", "--no-color", "--unified=3", this.baselineTree, finalTree, "--", entry.path], this.workspace.rootPath);
				const text = diff.code === 0 && diff.stdout.trim() ? diff.stdout : undefined;
				const stats = text ? parseDiffStats(text) : { added: 0, removed: 0 };
				files.push({
					path: toWorkspacePath(this.workspace, entry.path),
					status: entry.status,
					added: stats.added,
					removed: stats.removed,
					diff: text,
				});
			}
			return files.length > 0 ? { version: 1, source: "git", files } : undefined;
		} finally {
			this.cleanup();
		}
	}

	private cleanup(): void {
		if (this.temporaryDirectory) {
			try {
				rmSync(this.temporaryDirectory, { recursive: true, force: true });
			} catch {
				// 临时目录清理失败不影响任务结果；下次 beginRun 会再次尝试清理。
			}
		}
		this.temporaryDirectory = undefined;
		this.baselineTree = undefined;
		this.workspace = undefined;
		this.taskPaths.clear();
	}
}
