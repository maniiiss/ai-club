import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listCodeProjectFiles, parseGitignoreRules } from "../src/modes/rpc/project-files.ts";

describe("Code 项目文件扫描", () => {
	let root = "";

	afterEach(() => {
		if (root) rmSync(root, { recursive: true, force: true });
		// 上限用例会创建两万多个文件；全量并行时 Windows 上清理耗时波动大，需要更宽的钩子超时。
	}, 120_000);

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
		for (let index = 0; index < 18; index += 1) {
			nested = join(nested, `level-${index}`);
			mkdirSync(nested);
		}
		writeFileSync(join(nested, "too-deep.txt"), "");
		for (let index = 0; index < 20_005; index += 1) writeFileSync(join(root, `file-${String(index).padStart(5, "0")}.txt`), "");

		const result = listCodeProjectFiles(root);

		expect(result.truncated).toBe(true);
		expect(result.entries.length).toBeLessThanOrEqual(20_000);
		// 深度上限 16：level-16 可见，level-17 及其下文件被截断。
		expect(result.entries.some((entry) => entry.path.endsWith("level-15/level-16"))).toBe(true);
		expect(result.entries.some((entry) => entry.path.endsWith("level-16/level-17"))).toBe(false);
		expect(result.entries.some((entry) => entry.path.endsWith("too-deep.txt"))).toBe(false);
		// 两万多个文件的创建/扫描在全量并行时波动大，单独放宽超时避免抖动。
	}, 120_000);

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

	it("遵循各级 .gitignore：通配、锚定、目录后缀、嵌套与取反", () => {
		root = mkdtempSync(join(tmpdir(), "gitpilot-project-files-gitignore-"));
		mkdirSync(join(root, "src", "local"), { recursive: true });
		mkdirSync(join(root, "vendored"));
		mkdirSync(join(root, "docs", "api", "generated"), { recursive: true });
		writeFileSync(join(root, "app.log"), "");
		writeFileSync(join(root, "keep.log"), "");
		writeFileSync(join(root, "src", "main.ts"), "");
		writeFileSync(join(root, "src", "local", "x.ts"), "");
		writeFileSync(join(root, "vendored", "lib.js"), "");
		writeFileSync(join(root, "docs", "api", "index.md"), "");
		writeFileSync(join(root, "docs", "api", "generated", "out.md"), "");
		writeFileSync(join(root, ".gitignore"), ["*.log", "!keep.log", "/vendored/", "docs/**/generated/"].join("\n"));
		// 嵌套 .gitignore 只作用于 src 之内。
		writeFileSync(join(root, "src", ".gitignore"), "local/\n");

		const paths = listCodeProjectFiles(root).entries.map((entry) => entry.path);

		expect(paths).toContain("keep.log");
		expect(paths).not.toContain("app.log");
		expect(paths).toContain("src/main.ts");
		expect(paths).toContain("src/.gitignore");
		expect(paths).not.toContain("src/local");
		expect(paths).not.toContain("src/local/x.ts");
		expect(paths).not.toContain("vendored");
		expect(paths).not.toContain("vendored/lib.js");
		expect(paths).toContain("docs/api");
		expect(paths).toContain("docs/api/index.md");
		expect(paths).not.toContain("docs/api/generated");
		expect(paths).not.toContain("docs/api/generated/out.md");
	});

	it("gitignore 固定忽略名单不参与取反", () => {
		root = mkdtempSync(join(tmpdir(), "gitpilot-project-files-hardignore-"));
		mkdirSync(join(root, "node_modules"));
		writeFileSync(join(root, "node_modules", "dep.js"), "");
		writeFileSync(join(root, ".gitignore"), "!node_modules/\n");

		const paths = listCodeProjectFiles(root).entries.map((entry) => entry.path);

		expect(paths).not.toContain("node_modules");
		expect(paths).not.toContain("node_modules/dep.js");
	});

	it("解析 gitignore 模式为任意层级或锚定匹配", () => {
		const rules = parseGitignoreRules([".scan-workspace", "/code-processing/.venv/", "*.log", "**/temp"].join("\n"), "");
		const [anyName, anchored, wildcard, doubleStar] = rules;
		expect(anyName?.regex.test("code-processing/.scan-workspace")).toBe(true);
		expect(anchored?.regex.test("code-processing/.venv")).toBe(true);
		expect(anchored?.regex.test("other/.venv")).toBe(false);
		expect(wildcard?.regex.test("a/b/debug.log")).toBe(true);
		expect(doubleStar?.regex.test("x/y/temp")).toBe(true);
		expect(doubleStar?.regex.test("x/y/temporary")).toBe(false);
	});
});
