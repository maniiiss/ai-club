/**
 * Work 模式的 Office 三件套生成工具。
 *
 * 业务意图：Skill 负责办公交付物的流程与质量约束，二进制 OOXML 文件必须由
 * 受限工具生成；模型不能把 Markdown/HTML 伪装成 docx、xlsx 或 pptx，也不能
 * 通过路径参数访问当前 Work 任务目录之外的文件。
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import ExcelJS from "exceljs";
import PptxGenJSImport from "pptxgenjs";
import { type Static, Type } from "typebox";
import type { ToolDefinition } from "../../core/extensions/types.ts";
import { extractDocumentText } from "../../utils/document-parser.ts";

const supportedOfficeFormats = ["docx", "xlsx", "pptx"] as const;
type OfficeFormat = (typeof supportedOfficeFormats)[number];

const tableSchema = Type.Object({
	headers: Type.Array(Type.String({ maxLength: 500 }), { minItems: 1, maxItems: 30 }),
	rows: Type.Array(Type.Array(Type.String({ maxLength: 10_000 }), { maxItems: 30 }), { maxItems: 500 }),
});

const docxSectionSchema = Type.Object({
	heading: Type.Optional(Type.String({ maxLength: 500 })),
	paragraphs: Type.Optional(Type.Array(Type.String({ maxLength: 10_000 }), { maxItems: 300 })),
	tables: Type.Optional(Type.Array(tableSchema, { maxItems: 20 })),
});

const spreadsheetCellSchema = Type.Object({
	value: Type.Optional(Type.Union([Type.String({ maxLength: 10_000 }), Type.Number(), Type.Boolean()])),
	formula: Type.Optional(Type.String({ maxLength: 2_000 })),
});

const spreadsheetSheetSchema = Type.Object({
	name: Type.String({ minLength: 1, maxLength: 31 }),
	rows: Type.Array(Type.Array(spreadsheetCellSchema, { maxItems: 100 }), { maxItems: 5_000 }),
});

const presentationSlideSchema = Type.Object({
	title: Type.String({ minLength: 1, maxLength: 500 }),
	bullets: Type.Optional(Type.Array(Type.String({ maxLength: 2_000 }), { maxItems: 20 })),
});

const createOfficeDocumentSchema = Type.Object({
	format: Type.Union([Type.Literal("docx"), Type.Literal("xlsx"), Type.Literal("pptx")]),
	outputPath: Type.String({ minLength: 1, maxLength: 240 }),
	title: Type.String({ minLength: 1, maxLength: 500 }),
	sections: Type.Optional(Type.Array(docxSectionSchema, { maxItems: 100 })),
	sheets: Type.Optional(Type.Array(spreadsheetSheetSchema, { maxItems: 30 })),
	slides: Type.Optional(Type.Array(presentationSlideSchema, { maxItems: 100 })),
	/** 覆盖已有文件需要再次经 Desktop 确认，默认 false 以保护用户手工内容。 */
	overwrite: Type.Optional(Type.Boolean()),
});

const inspectOfficeDocumentSchema = Type.Object({
	path: Type.String({ minLength: 1, maxLength: 240 }),
});

type CreateOfficeDocumentInput = Static<typeof createOfficeDocumentSchema>;
type InspectOfficeDocumentInput = Static<typeof inspectOfficeDocumentSchema>;

interface OfficeToolDetails {
	format: OfficeFormat;
	path: string;
	size: number;
	warnings?: string[];
}

/** PptxGenJS 的发布类型在 Node16 ESM 解析下把 default 解析为模块对象，运行时仍是构造器。 */
interface GeneratedPresentation {
	layout: string;
	author: string;
	subject: string;
	title: string;
	company: string;
	addSlide(): {
		background: { color: string };
		addText(text: string, options: Record<string, unknown>): void;
	};
	writeFile(options: { fileName: string }): Promise<unknown>;
}

const PptxGenJS = PptxGenJSImport as unknown as new () => GeneratedPresentation;

function isOfficeFormat(value: string): value is OfficeFormat {
	return (supportedOfficeFormats as readonly string[]).includes(value);
}

/** 只允许 Office 文件读写当前 Work 目录，且不暴露 AgentSession 内部文件。 */
function resolveOfficeWorkspacePath(workspacePath: string, rawPath: string): string {
	const root = resolve(workspacePath);
	if (isAbsolute(rawPath)) throw new Error("Office 文件路径必须使用当前 Work 工作区内的相对路径");
	const target = resolve(root, rawPath);
	const pathWithinWorkspace = relative(root, target).replaceAll("\\", "/");
	if (!pathWithinWorkspace || pathWithinWorkspace.startsWith("../") || pathWithinWorkspace === ".." || isAbsolute(pathWithinWorkspace)) {
		throw new Error("Office 文件路径必须位于当前 Work 工作区内");
	}
	const normalizedWorkspacePath = pathWithinWorkspace.toLocaleLowerCase();
	if (normalizedWorkspacePath === ".session" || normalizedWorkspacePath.startsWith(".session/")) {
		throw new Error("Office 文件不能写入 Work 会话目录");
	}
	return target;
}

function formatForPath(path: string): OfficeFormat {
	const extension = extname(path).slice(1).toLowerCase();
	if (!isOfficeFormat(extension)) throw new Error("仅支持 .docx、.xlsx 或 .pptx 文件");
	return extension;
}

function assertFormatMatchesPath(format: OfficeFormat, path: string): void {
	const actualFormat = formatForPath(path);
	if (actualFormat !== format) throw new Error(`输出路径必须使用 .${format} 后缀`);
}

function assertNotAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw new Error("Office 文档生成已取消");
}

function normalizeCellFormula(formula: string): string {
	const normalized = formula.trim().replace(/^=/, "");
	if (!normalized) throw new Error("Excel 公式不能为空");
	return normalized;
}

function createDocxChildren(input: CreateOfficeDocumentInput): Array<Paragraph | Table> {
	const children: Array<Paragraph | Table> = [
		new Paragraph({ text: input.title, heading: HeadingLevel.TITLE }),
	];
	for (const section of input.sections ?? []) {
		if (section.heading) children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
		for (const paragraph of section.paragraphs ?? []) children.push(new Paragraph({ text: paragraph }));
		for (const table of section.tables ?? []) {
			const rows = [
				new TableRow({ children: table.headers.map((header) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })] })) }),
				...table.rows.map((row) => new TableRow({
					children: table.headers.map((_, index) => new TableCell({ children: [new Paragraph(row[index] ?? "")] })),
				})),
			];
			children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
		}
	}
	return children;
}

async function writeDocx(target: string, input: CreateOfficeDocumentInput): Promise<void> {
	if (!input.sections?.length) throw new Error("Word 文档至少需要一个章节");
	const document = new Document({
		creator: "GitPilot",
		title: input.title,
		sections: [{ children: createDocxChildren(input) }],
	});
	const buffer = await Packer.toBuffer(document);
	await writeFile(target, buffer);
}

async function writeXlsx(target: string, input: CreateOfficeDocumentInput): Promise<void> {
	if (!input.sheets?.length) throw new Error("Excel 工作簿至少需要一个工作表");
	const seenSheetNames = new Set<string>();
	const workbook = new ExcelJS.Workbook();
	workbook.creator = "GitPilot";
	workbook.title = input.title;
	for (const sheet of input.sheets) {
		const normalizedName = sheet.name.trim();
		if (!normalizedName) throw new Error("Excel 工作表名称不能为空");
		if (seenSheetNames.has(normalizedName.toLocaleLowerCase())) throw new Error(`Excel 工作表名称重复：${normalizedName}`);
		seenSheetNames.add(normalizedName.toLocaleLowerCase());
		const worksheet = workbook.addWorksheet(normalizedName, { views: [{ state: "frozen", ySplit: sheet.rows.length > 1 ? 1 : 0 }] });
		let widestColumnCount = 0;
		for (const [rowIndex, row] of sheet.rows.entries()) {
			widestColumnCount = Math.max(widestColumnCount, row.length);
			for (const [columnIndex, sourceCell] of row.entries()) {
				if (sourceCell.value === undefined && sourceCell.formula === undefined) throw new Error(`Excel 单元格 ${normalizedName}!R${rowIndex + 1}C${columnIndex + 1} 缺少值或公式`);
				if (sourceCell.value !== undefined && sourceCell.formula !== undefined) throw new Error(`Excel 单元格 ${normalizedName}!R${rowIndex + 1}C${columnIndex + 1} 不能同时包含值和公式`);
				const cell = worksheet.getRow(rowIndex + 1).getCell(columnIndex + 1);
				cell.value = sourceCell.formula === undefined ? sourceCell.value ?? null : { formula: normalizeCellFormula(sourceCell.formula) };
				cell.alignment = { vertical: "top", wrapText: true };
			}
		}
		if (sheet.rows.length > 0) {
			worksheet.getRow(1).font = { bold: true };
			worksheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
		}
		for (let columnIndex = 1; columnIndex <= widestColumnCount; columnIndex += 1) worksheet.getColumn(columnIndex).width = 18;
	}
	await workbook.xlsx.writeFile(target);
}

async function writePptx(target: string, input: CreateOfficeDocumentInput): Promise<void> {
	if (!input.slides?.length) throw new Error("PowerPoint 至少需要一页幻灯片");
	const presentation = new PptxGenJS();
	presentation.layout = "LAYOUT_WIDE";
	presentation.author = "GitPilot";
	presentation.subject = input.title;
	presentation.title = input.title;
	presentation.company = "AI Club";
	for (const [index, sourceSlide] of input.slides.entries()) {
		const slide = presentation.addSlide();
		slide.background = { color: "F8FAFC" };
		slide.addText(sourceSlide.title, {
			x: 0.7, y: 0.45, w: 11.8, h: 0.6,
			fontFace: "Microsoft YaHei", fontSize: 28, bold: true, color: "102A43", margin: 0,
		});
		const bullets = sourceSlide.bullets ?? [];
		if (bullets.length > 0) {
			slide.addText(bullets.map((bullet) => `• ${bullet}`).join("\n"), {
				x: 0.9, y: 1.45, w: 11.4, h: 4.9,
				fontFace: "Microsoft YaHei", fontSize: 18, color: "243B53", breakLine: false,
				margin: 0.08, valign: "top", paraSpaceAfterPt: 12,
			});
		}
		slide.addText(`${index + 1}`, { x: 12.35, y: 6.9, w: 0.35, h: 0.2, fontSize: 9, color: "829AB1", margin: 0, align: "right" });
	}
	await presentation.writeFile({ fileName: target });
}

async function createOfficeDocument(target: string, input: CreateOfficeDocumentInput): Promise<void> {
	switch (input.format) {
		case "docx":
			await writeDocx(target, input);
			return;
		case "xlsx":
			await writeXlsx(target, input);
			return;
		case "pptx":
			await writePptx(target, input);
			return;
	}
}

/** Work 专属 Office 工具：没有 Shell、没有外部网络，只有当前任务工作区的二进制读写。 */
export function createOfficeWorkToolDefinitions(workspacePath: string): Array<ToolDefinition<any, OfficeToolDetails>> {
	const createTool: ToolDefinition<typeof createOfficeDocumentSchema, OfficeToolDetails> = {
		name: "office_create_document",
		label: "office_create_document",
		description: "Create a real editable Office document in the current Work workspace. Supports docx with sections/tables, xlsx with sheets/cells/formulas, and pptx with slides/bullets. The extension must match the requested format. Existing files are protected unless overwrite is true, which asks the user for confirmation.",
		promptSnippet: "Create editable Word, Excel, or PowerPoint files in the current Work workspace",
		promptGuidelines: ["Use office_create_document for .docx/.xlsx/.pptx; never create Office files by writing plain text with a renamed extension."],
		parameters: createOfficeDocumentSchema,
		async execute(_id, input, signal, _update, ctx) {
			assertNotAborted(signal);
			const target = resolveOfficeWorkspacePath(workspacePath, input.outputPath);
			assertFormatMatchesPath(input.format, target);
			if (existsSync(target)) {
				if (!input.overwrite) throw new Error("目标文件已存在；请改用新版本文件名，或在用户明确同意后设置 overwrite=true");
				const approved = await ctx.ui.confirm("确认覆盖 Office 文件", `将覆盖当前 Work 工作区中的 ${input.outputPath}。该操作不可自动撤销，是否继续？`);
				if (!approved) throw new Error("用户取消覆盖 Office 文件");
			}
			mkdirSync(dirname(target), { recursive: true });
			await createOfficeDocument(target, input);
			assertNotAborted(signal);
			const stat = statSync(target);
			const format = input.format;
			return {
				content: [{ type: "text", text: `已生成可编辑的 ${format.toUpperCase()} 文件：${input.outputPath}（${stat.size} 字节）。建议使用 office_inspect_document 检查生成结果。` }],
				details: { format, path: input.outputPath, size: stat.size },
			};
		},
	};

	const inspectTool: ToolDefinition<typeof inspectOfficeDocumentSchema, OfficeToolDetails> = {
		name: "office_inspect_document",
		label: "office_inspect_document",
		description: "Inspect a docx, xlsx, or pptx inside the current Work workspace by extracting its text. Use this after creation or before reporting that an Office document is ready.",
		promptSnippet: "Inspect an Office document created in the current Work workspace",
		parameters: inspectOfficeDocumentSchema,
		async execute(_id, input, signal) {
			assertNotAborted(signal);
			const target = resolveOfficeWorkspacePath(workspacePath, input.path);
			const format = formatForPath(target);
			if (!existsSync(target) || !statSync(target).isFile()) throw new Error("Office 文件不存在");
			const buffer = await readFile(target);
			const extracted = await extractDocumentText(buffer, format);
			assertNotAborted(signal);
			const stat = statSync(target);
			const warningText = extracted.warnings.length ? `\n\n检查提示：${extracted.warnings.join("；")}` : "";
			return {
				content: [{ type: "text", text: `已检查 ${input.path}：\n${extracted.text || "[未提取到正文]"}${warningText}` }],
				details: { format, path: input.path, size: stat.size, ...(extracted.warnings.length ? { warnings: extracted.warnings } : {}) },
			};
		},
	};

	return [createTool, inspectTool];
}
