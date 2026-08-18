import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listCodeProjectFiles } from "../src/modes/rpc/project-files.ts";

describe("Code 项目文件扫描", () => {
	let root = "";

	afterEach(() => {
		if (root) rmSync(root, { recursive: true, force: true });
	});

	it("忽略运行时目录并按目录优先、名称自然排序", () => {
		root = mkdtempSync(join(tmpdir(), "gitpilot-project-files-"));
		mkdirSync(join(root, "src"));
		mkdirSync(join(root, "node_modules"));
		mkdirSync(join(root, ".git"));
		writeFileSync(join(root, "z10.ts"), "");
		writeFileSync(join(root, "z2.ts"), "");
		writeFileSync(join(root, "node_modules", "hidden.js"), "");
		writeFileSync(join(root, "src", "App.tsx"), "123");

		const result = listCodeProjectFiles(root);

		expect(result.truncated).toBe(false);
		expect(result.entries.map((entry) => entry.path)).toEqual(["src", "src/App.tsx", "z2.ts", "z10.ts"]);
		expect(result.entries.find((entry) => entry.path === "src/App.tsx")).toMatchObject({ kind: "file", size: 3 });
	});

	it("在超过深度或条目上限时截断结果", () => {
		root = mkdtempSync(join(tmpdir(), "gitpilot-project-files-limit-"));
		let nested = root;
		for (let index = 0; index < 14; index += 1) {
			nested = join(nested, `level-${index}`);
			mkdirSync(nested);
		}
		writeFileSync(join(nested, "too-deep.txt"), "");
		for (let index = 0; index < 10_005; index += 1) writeFileSync(join(root, `file-${String(index).padStart(5, "0")}.txt`), "");

		const result = listCodeProjectFiles(root);

		expect(result.truncated).toBe(true);
		expect(result.entries.length).toBeLessThanOrEqual(10_000);
		expect(result.entries.some((entry) => entry.path === "level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9/level-10/level-11/level-12")).toBe(true);
		expect(result.entries.some((entry) => entry.path === "level-0/level-1/level-2/level-3/level-4/level-5/level-6/level-7/level-8/level-9/level-10/level-11/level-12/level-13/too-deep.txt")).toBe(false);
	});

	it("不跟随项目内符号链接", () => {
		root = mkdtempSync(join(tmpdir(), "gitpilot-project-files-link-"));
		mkdirSync(join(root, "real"));
		writeFileSync(join(root, "real", "visible.txt"), "");
		try {
			symlinkSync(join(root, "real"), join(root, "linked"), "junction");
		} catch {
			// Windows 未开启创建符号链接权限时跳过环境限制，不影响其它扫描契约。
			return;
		}

		const result = listCodeProjectFiles(root);

		expect(result.entries.map((entry) => entry.path)).toEqual(["real", "real/visible.txt"]);
	});
});
