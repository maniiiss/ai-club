/**
 * 文档文本抽取工具。
 *
 * 业务意图：把 pdf/docx/xlsx/pptx 二进制内容转为纯文本，供附件解析（桌面端上传）
 * 与 parse_attachment 工具（模型主动调用）复用，避免重复实现解析逻辑。
 *
 * 与后端 code-processing 的 markitdown 管线对齐：
 * - 单文件抽取文本上限默认 15000 字符（与 ASSISTANT_ATTACHMENT maxChars 一致）；
 * - 单文件二进制上限 20MB（与 platform.upload.max-document-size 一致），超限直接拒绝以防空内存。
 *
 * 解析均在本地 sidecar 完成，离线零网络，契合桌面端安全边界。
 */
import JSZip from "jszip";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractText as extractPdfText } from "unpdf";

/** 文档抽取结果：text 为纯文本，truncated 标识是否触及字符上限，warnings 收敛解析异常与提示。 */
export interface ExtractedDocument {
	text: string;
	truncated: boolean;
	warnings: string[];
}

/** 单文件抽取文本的默认字符上限（对齐后端 ASSISTANT_ATTACHMENT 场景的 15000）。 */
export const DEFAULT_MAX_DOC_CHARS = 15_000;

/** 单文件二进制上限：20MB（对齐 platform.upload.max-document-size 默认值）。 */
export const MAX_DOC_BYTES = 20 * 1024 * 1024;

/** 受支持的文档扩展名集合（不含点，小写）。 */
const DOCUMENT_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "pptx"]);

/** 判断扩展名（如 "pdf"、".PDF"）是否为受支持的文档格式。 */
export function isDocumentExtension(ext: string): boolean {
	return DOCUMENT_EXTENSIONS.has(ext.toLowerCase().replace(/^\./, ""));
}

/**
 * 从文档二进制中抽取纯文本。
 *
 * @param buffer 文档二进制内容
 * @param ext 扩展名（可带点，大小写不敏感）
 * @param maxChars 抽取文本字符上限，超出则截断并置 truncated=true
 */
export async function extractDocumentText(
	buffer: Buffer,
	ext: string,
	maxChars: number = DEFAULT_MAX_DOC_CHARS,
): Promise<ExtractedDocument> {
	const normalizedExt = ext.toLowerCase().replace(/^\./, "");

	if (buffer.length > MAX_DOC_BYTES) {
		return {
			text: "",
			truncated: false,
			warnings: [`文档过大（${formatMib(buffer.length)}），超过 ${formatMib(MAX_DOC_BYTES)} 上限，已跳过解析。`],
		};
	}

	let raw: string;
	const warnings: string[] = [];

	try {
		switch (normalizedExt) {
			case "pdf":
				raw = await extractPdf(buffer);
				break;
			case "docx":
				raw = await extractDocx(buffer);
				break;
			case "xlsx":
				raw = await extractXlsx(buffer);
				break;
			case "pptx":
				raw = await extractPptx(buffer);
				break;
			default:
				return { text: "", truncated: false, warnings: [`不支持的文档格式: .${normalizedExt}`] };
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { text: "", truncated: false, warnings: [`文档解析失败 (.${normalizedExt}): ${message}`] };
	}

	raw = raw.trim();
	if (raw.length === 0) {
		// 扫描件、纯图片 PDF 或空文档都可能抽取不到文本，作为提示而非错误返回。
		warnings.push("文档未提取到任何文本（可能为扫描件或纯图片内容）。");
		return { text: "", truncated: false, warnings };
	}

	if (raw.length > maxChars) {
		raw = `${raw.slice(0, maxChars)}\n\n[已截断：原文档共 ${raw.length} 字符，仅保留前 ${maxChars} 字符]`;
		return { text: raw, truncated: true, warnings };
	}

	return { text: raw, truncated: false, warnings };
}

// ============================================================================
// 各格式抽取实现
// ============================================================================

/** PDF：unpdf（pdfjs 服务端构建）抽取全量文本，合并多页。 */
async function extractPdf(buffer: Buffer): Promise<string> {
	const result = await extractPdfText(buffer, { mergePages: true });
	// unpdf 的 mergePages:true 重载声明返回 string，但保留对 string[] 的兼容处理以防运行时差异。
	const text = result.text as string | string[];
	return Array.isArray(text) ? text.join("\n\n") : text;
}

/** Word(docx)：mammoth 抽取纯文本（保留段落，去掉样式）。 */
async function extractDocx(buffer: Buffer): Promise<string> {
	const result = await mammoth.extractRawText({ buffer });
	return result.value;
}

/** Excel(xlsx)：逐 Sheet 转 CSV，每段加 "## Sheet: 名" 标题，便于模型区分工作表。 */
async function extractXlsx(buffer: Buffer): Promise<string> {
	const workbook = XLSX.read(buffer, { type: "buffer" });
	const sheets: string[] = [];
	for (const name of workbook.SheetNames) {
		const sheet = workbook.Sheets[name];
		if (!sheet) continue;
		const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
		if (csv && csv.trim()) {
			sheets.push(`## Sheet: ${name}\n${csv}`);
		}
	}
	return sheets.join("\n\n");
}

/** PPT(pptx)：OOXML zip，读取 ppt/slides/slideN.xml，抽取 <a:t> 文本节点（v1 仅文本，不含图片/图表）。 */
async function extractPptx(buffer: Buffer): Promise<string> {
	const zip = await JSZip.loadAsync(buffer);
	const slidePaths = Object.keys(zip.files)
		.filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
		.sort((a, b) => slideNumber(a) - slideNumber(b));

	const slides: string[] = [];
	for (const path of slidePaths) {
		const file = zip.file(path);
		if (!file) continue;
		const xml = await file.async("string");
		const texts = extractPptxTextNodes(xml);
		if (texts.length) {
			slides.push(`## Slide ${slideNumber(path)}\n${texts.join("\n")}`);
		}
	}
	return slides.join("\n\n");
}

/** 从 pptx slide XML 中抽取所有 <a:t>…</a:t> 文本节点并解码 XML 实体。 */
function extractPptxTextNodes(xml: string): string[] {
	const matches: string[] = [];
	const re = /<a:t>([\s\S]*?)<\/a:t>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(xml)) !== null) {
		const text = decodeXmlEntities(m[1]).trim();
		if (text) matches.push(text);
	}
	return matches;
}

/** 解码 OOXML 中常见的 XML 实体。 */
function decodeXmlEntities(value: string): string {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'");
}

/** 从 slide 路径（如 ppt/slides/slide3.xml）提取页码。 */
function slideNumber(path: string): number {
	const m = path.match(/slide(\d+)\.xml$/);
	return m ? parseInt(m[1], 10) : 0;
}

function formatMib(bytes: number): string {
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
