/**
 * 附件预处理共享核心。
 *
 * 业务意图：把「读取文件 / 解码内联数据 -> 判定类型 -> 解析为文本或图片」的流程收敛为单一入口，
 * 供三处复用，避免逻辑漂移：
 *  1. 桌面端上传 UI 经 prepare_attachments RPC 调用（路径来自文件选择器/拖拽，内联来自粘贴）；
 *  2. parse_attachment agent 工具（模型在对话中按路径主动解析）；
 *  3.（可选）重构后的 CLI @file 处理。
 *
 * 错误收敛为 warnings 字段返回，绝不抛 process.exit（修正 CLI 版 file-processor 的旧问题），
 * 保证 RPC/工具调用方能拿到结构化结果而非进程崩溃。
 */
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import { resolveReadPath } from "../tools/path-utils.ts";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "../tools/truncate.ts";
import { processImage } from "../../utils/image-process.ts";
import { detectSupportedImageMimeType } from "../../utils/mime.ts";
import { extractDocumentText, isDocumentExtension } from "../../utils/document-parser.ts";

/** 附件输入：可按路径提供（sidecar 读取本地文件），也可按内联 base64 提供（拖拽/粘贴的 blob）。 */
export type AttachmentInput =
	| { path: string; name?: string }
	| { name: string; data: string; mimeType?: string };

/** 预处理后的附件：图片带 image（ImageContent），文档/文本带 text，统一带元数据与 warnings。 */
export interface PreparedAttachment {
	name: string;
	/** 本地路径（仅路径输入时有值；内联输入为空）。 */
	path?: string;
	kind: "image" | "document" | "text";
	mimeType: string;
	sizeBytes: number;
	/** 文档/文本抽取结果；图片解析失败时也会带可读的失败说明。 */
	text?: string;
	/** 图片内容（pi-ai ImageContent，扁平结构 {type,data,mimeType}）。仅图片成功时存在。 */
	image?: ImageContent;
	truncated?: boolean;
	warnings?: string[];
}

export interface PrepareAttachmentOptions {
	cwd: string;
	/** 是否自动压缩图片到内联 provider 上限。默认 true。 */
	autoResizeImages?: boolean;
	/** 文档抽取文本字符上限。默认 15000（对齐后端 ASSISTANT_ATTACHMENT 场景）。 */
	maxDocChars?: number;
}

/**
 * 解析单个附件为 PreparedAttachment。
 * 路径输入：经 resolveReadPath 解析（含 macOS 截图名变体兼容）后读取本地文件。
 * 内联输入：base64 解码为 buffer（用于剪贴板粘贴的图片 blob）。
 */
export async function prepareAttachment(
	input: AttachmentInput,
	options: PrepareAttachmentOptions,
): Promise<PreparedAttachment> {
	const autoResizeImages = options.autoResizeImages ?? true;
	const maxDocChars = options.maxDocChars ?? 15_000;

	let buffer: Buffer;
	let name: string;
	let path: string | undefined;
	let hintedMimeType: string | undefined;

	if ("path" in input) {
		const absolutePath = resolveReadPath(input.path, options.cwd);
		path = absolutePath;
		name = input.name ?? basename(absolutePath);
		try {
			const stats = await stat(absolutePath);
			if (stats.size === 0) {
				return textAttachment(name, path, "", ["文件为空，已跳过。"]);
			}
			buffer = await readFile(absolutePath);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return textAttachment(name, path, "", [`读取文件失败: ${message}`]);
		}
	} else {
		name = input.name;
		hintedMimeType = input.mimeType;
		try {
			buffer = Buffer.from(input.data, "base64");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return textAttachment(name, undefined, "", [`解析内联数据失败: ${message}`]);
		}
	}

	const ext = extname(name).replace(/^\./, "").toLowerCase();

	// 1) 图片：以 buffer 魔数嗅探为准（比扩展名可靠，覆盖 png/jpg/gif/webp/bmp）。
	const sniffedImage = detectSupportedImageMimeType(buffer);
	if (sniffedImage) {
		return prepareImageAttachment(buffer, sniffedImage, name, path, autoResizeImages);
	}

	// 2) 文档：pdf/docx/xlsx/pptx 走 document-parser。
	if (isDocumentExtension(ext)) {
		const doc = await extractDocumentText(buffer, ext, maxDocChars);
		return {
			name,
			path,
			kind: "document",
			mimeType: mimeForDocument(ext),
			sizeBytes: buffer.length,
			text: doc.text,
			truncated: doc.truncated,
			warnings: doc.warnings.length ? doc.warnings : undefined,
		};
	}

	// 3) 文本/其它：按 utf-8 读取并截断（复用 read 工具的截断策略，含行/字节双限）。
	return prepareTextAttachment(buffer, name, path, hintedMimeType);
}

// ============================================================================
// 各类型附件的具体处理
// ============================================================================

/** 图片附件：复用 image-process（photon-node WASM 压缩），失败时回退为带说明的文本附件。 */
async function prepareImageAttachment(
	buffer: Buffer,
	mimeType: string,
	name: string,
	path: string | undefined,
	autoResizeImages: boolean,
): Promise<PreparedAttachment> {
	const processed = await processImage(buffer, mimeType, { autoResizeImages });
	if (!processed.ok) {
		return textAttachment(name, path, "", [`图片处理失败: ${processed.message}`]);
	}
	return {
		name,
		path,
		kind: "image",
		mimeType: processed.mimeType,
		sizeBytes: buffer.length,
		image: { type: "image", data: processed.data, mimeType: processed.mimeType },
		warnings: processed.hints.length ? processed.hints : undefined,
	};
}

/** 文本附件：utf-8 读取 + 截断；二进制文件（含 NUL 字节）拒绝以避免垃圾注入上下文。 */
function prepareTextAttachment(
	buffer: Buffer,
	name: string,
	path: string | undefined,
	hintedMimeType?: string,
): PreparedAttachment {
	if (isLikelyBinary(buffer)) {
		return textAttachment(name, path, "", [
			`二进制文件无法解析为文本（${formatSize(buffer.length)}）。仅支持图片与 pdf/docx/xlsx/pptx 文档。`,
		]);
	}
	const content = buffer.toString("utf-8");
	const truncation = truncateHead(content);
	const warnings: string[] = [];
	if (truncation.truncated) {
		warnings.push(
			`文本已截断：原文 ${truncation.totalLines} 行 / ${formatSize(truncation.totalBytes)}，仅保留前 ${truncation.outputLines} 行（${DEFAULT_MAX_LINES} 行或 ${formatSize(DEFAULT_MAX_BYTES)} 上限）。`,
		);
	}
	return {
		name,
		path,
		kind: "text",
		mimeType: hintedMimeType && hintedMimeType.startsWith("text/") ? hintedMimeType : "text/plain",
		sizeBytes: buffer.length,
		text: truncation.content,
		truncated: truncation.truncated,
		warnings: warnings.length ? warnings : undefined,
	};
}

// ============================================================================
// 辅助
// ============================================================================

/** 构造一个仅含 warnings 的占位文本附件（用于空文件、读取失败、二进制拒绝等）。 */
function textAttachment(
	name: string,
	path: string | undefined,
	text: string,
	warnings: string[],
): PreparedAttachment {
	return {
		name,
		path,
		kind: "text",
		mimeType: "text/plain",
		sizeBytes: 0,
		text,
		warnings,
	};
}

/** 经验启发式：前 8KB 出现 NUL 字节视为二进制（图片/文档已在前面分流，此处仅兜底其它格式）。 */
function isLikelyBinary(buffer: Buffer): boolean {
	const sample = buffer.length > 8192 ? buffer.subarray(0, 8192) : buffer;
	return sample.includes(0);
}

/** 文档扩展名 -> MIME 映射（用于元数据展示，不影响解析）。 */
function mimeForDocument(ext: string): string {
	switch (ext) {
		case "pdf":
			return "application/pdf";
		case "docx":
			return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
		case "xlsx":
			return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
		case "pptx":
			return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
		default:
			return "application/octet-stream";
	}
}
