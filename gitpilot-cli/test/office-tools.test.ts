import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfficeWorkToolDefinitions } from "../src/extensions/gitpilot/office-tools.ts";
import { createGitPilotWorkToolDefinitions } from "../src/extensions/gitpilot/work-tools.ts";

describe("Work Office 工具", () => {
	const temporaryDirectories: string[] = [];

	afterEach(() => {
		for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
	});

	function createWorkspace(): string {
		const workspace = mkdtempSync(join(tmpdir(), "gitpilot-office-tools-"));
		temporaryDirectories.push(workspace);
		return workspace;
	}

	function toolsFor(workspace: string) {
		const tools = createOfficeWorkToolDefinitions(workspace);
		const create = tools.find((tool) => tool.name === "office_create_document");
		const inspect = tools.find((tool) => tool.name === "office_inspect_document");
		if (!create || !inspect) throw new Error("Office 工具未注册");
		return { create, inspect };
	}

	const confirmedContext = { ui: { confirm: vi.fn().mockResolvedValue(true) } } as any;

	it("仅在 Work 会话注册 Office 工具", () => {
		const workspace = createWorkspace();
		const names = createGitPilotWorkToolDefinitions("work-office-test", workspace).map((tool) => tool.name);
		expect(names).toEqual(expect.arrayContaining(["office_create_document", "office_inspect_document"]));
		expect(names).not.toContain("bash");
	});

	it("生成并检查真实 Word、Excel 和 PowerPoint 文件", async () => {
		const workspace = createWorkspace();
		const { create, inspect } = toolsFor(workspace);
		const examples = [
			{
				format: "docx" as const,
				outputPath: "output/brief.docx",
				title: "项目简报",
				sections: [{ heading: "结论", paragraphs: ["这是可编辑的 Word 正文。"], tables: [{ headers: ["事项", "状态"], rows: [["测试", "完成"]] }] }],
				expectedText: "项目简报",
			},
			{
				format: "xlsx" as const,
				outputPath: "output/budget.xlsx",
				title: "预算台账",
				sheets: [{ name: "预算", rows: [[{ value: "项目" }, { value: "金额" }], [{ value: "开发" }, { value: 100 }], [{ value: "合计" }, { formula: "SUM(B2:B2)" }]] }],
				expectedText: "预算",
			},
			{
				format: "pptx" as const,
				outputPath: "output/review.pptx",
				title: "项目复盘",
				slides: [{ title: "复盘结论", bullets: ["按计划完成", "下一步待确认"] }],
				expectedText: "复盘结论",
			},
		];

		for (const example of examples) {
			await create.execute(`create-${example.format}`, example, undefined, undefined, confirmedContext);
			expect(existsSync(join(workspace, example.outputPath))).toBe(true);
			const inspection = await inspect.execute(`inspect-${example.format}`, { path: example.outputPath }, undefined, undefined, confirmedContext);
			expect(inspection.content[0]?.type).toBe("text");
			expect(inspection.content[0]?.text).toContain(example.expectedText);
		}
	});

	it("拒绝越界、会话目录、后缀不匹配和未经确认的覆盖", async () => {
		const workspace = createWorkspace();
		const { create, inspect } = toolsFor(workspace);
		const docxInput = { format: "docx" as const, outputPath: "result.docx", title: "测试", sections: [{ paragraphs: ["正文"] }] };

		await expect(create.execute("outside", { ...docxInput, outputPath: "../outside.docx" }, undefined, undefined, confirmedContext)).rejects.toThrow("Work 工作区内");
		await expect(create.execute("session", { ...docxInput, outputPath: ".session/hidden.docx" }, undefined, undefined, confirmedContext)).rejects.toThrow("会话目录");
		await expect(create.execute("session-case", { ...docxInput, outputPath: ".Session/hidden.docx" }, undefined, undefined, confirmedContext)).rejects.toThrow("会话目录");
		await expect(create.execute("absolute", { ...docxInput, outputPath: join(workspace, "absolute.docx") }, undefined, undefined, confirmedContext)).rejects.toThrow("相对路径");
		await expect(create.execute("extension", { ...docxInput, outputPath: "result.xlsx" }, undefined, undefined, confirmedContext)).rejects.toThrow(".docx 后缀");
		await expect(inspect.execute("unknown", { path: "notes.txt" }, undefined, undefined, confirmedContext)).rejects.toThrow("仅支持");

		await create.execute("original", docxInput, undefined, undefined, confirmedContext);
		await expect(create.execute("overwrite", docxInput, undefined, undefined, confirmedContext)).rejects.toThrow("目标文件已存在");
	});

	it("覆盖已有 Office 文件前必须等待 Desktop 确认", async () => {
		const workspace = createWorkspace();
		const { create } = toolsFor(workspace);
		const input = { format: "docx" as const, outputPath: "result.docx", title: "测试", sections: [{ paragraphs: ["正文"] }] };
		writeFileSync(join(workspace, input.outputPath), "旧内容", "utf8");
		const rejectedContext = { ui: { confirm: vi.fn().mockResolvedValue(false) } } as any;

		await expect(create.execute("reject", { ...input, overwrite: true }, undefined, undefined, rejectedContext)).rejects.toThrow("取消覆盖");
		expect(readFileSync(join(workspace, input.outputPath), "utf8")).toBe("旧内容");
		await create.execute("accept", { ...input, overwrite: true }, undefined, undefined, confirmedContext);
		expect(confirmedContext.ui.confirm).toHaveBeenCalled();
	});
});
