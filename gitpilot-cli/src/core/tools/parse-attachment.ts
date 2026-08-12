/**
 * parse_attachment 工具：模型在对话中主动解析附件文件。
 *
 * 与 read 工具互补：read 适合查看源码/文本（带行号、offset/limit 分页），
 * parse_attachment 面向「用户上传或提及的任意文件」：
 *  - 图片（png/jpg/gif/webp/bmp）-> 以 ImageContent 内联返回给模型（支持视觉）；
 *  - 文档（pdf/docx/xlsx/pptx）-> 抽取纯文本返回；
 *  - 其它文本/源码 -> utf-8 读取并截断返回。
 *
 * 解析逻辑复用 core/attachments/prepare-attachment 共享核心，保证与桌面端上传路径一致。
 */
import type { Api, ImageContent, Model, TextContent } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { type Static, Type } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import { prepareAttachment } from "../attachments/prepare-attachment.ts";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { getTextOutput, renderToolPath, str } from "./render-utils.ts";
import { formatSize } from "./truncate.ts";

const parseAttachmentSchema = Type.Object({
	path: Type.String({ description: "Path to the attachment file to parse (relative or absolute)" }),
	maxChars: Type.Optional(
		Type.Number({
			description: "Maximum characters to extract from documents (pdf/docx/xlsx/pptx). Default: 15000.",
		}),
	),
});
export type ParseAttachmentToolInput = Static<typeof parseAttachmentSchema>;

/** 工具结果元信息，供 UI/日志展示文件名、类型与是否截断。 */
export interface ParseAttachmentToolDetails {
	name?: string;
	kind?: "image" | "document" | "text";
	mimeType?: string;
	truncated?: boolean;
}

/** 非视觉模型不支持图片输入时给出提示，避免静默丢弃。 */
function getNonVisionImageNote(model: Model<Api> | undefined): string | undefined {
	if (!model || model.input.includes("image")) return undefined;
	return "[Current model does not support images. The image will be omitted from this request.]";
}

export function createParseAttachmentToolDefinition(): ToolDefinition<
	typeof parseAttachmentSchema,
	ParseAttachmentToolDetails | undefined
> {
	return {
		name: "parse_attachment",
		label: "parse_attachment",
		description:
			"Parse an attachment file and return its contents. Supports images (png/jpg/gif/webp/bmp, returned as inline image content), documents (pdf/docx/xlsx/pptx, extracted to text), and text/source files (utf-8). Use this when the user references an uploaded file or asks you to read a document you have not yet examined. Document text is truncated to 15000 chars by default; pass maxChars to adjust.",
		promptSnippet: "Parse attachment files (images, pdf, docx, xlsx, pptx, text)",
		promptGuidelines: ["Use parse_attachment to inspect user-uploaded files or referenced documents instead of read for non-code formats."],
		parameters: parseAttachmentSchema,
		async execute(
			_toolCallId,
			{ path, maxChars }: { path: string; maxChars?: number },
			signal?: AbortSignal,
			_onUpdate?,
			ctx?,
		) {
			if (!path) throw new Error("path is required");
			if (signal?.aborted) throw new Error("Operation aborted");

			// cwd 取自运行时上下文（扩展工具在多 cwd 会话下复用，不能在构造期闭包）。
			const cwd = ctx?.cwd ?? process.cwd();
			const result = await prepareAttachment(
				{ path },
				{ cwd, maxDocChars: maxChars },
			);
			if (signal?.aborted) throw new Error("Operation aborted");

			const content: (TextContent | ImageContent)[] = [];
			const header = `Parsed attachment [${result.mimeType}] (${formatSize(result.sizeBytes)})${result.truncated ? " [truncated]" : ""}`;
			const notes: string[] = [header];
			if (result.warnings && result.warnings.length > 0) notes.push(result.warnings.join("\n"));

			if (result.kind === "image" && result.image) {
				const nonVisionNote = getNonVisionImageNote(ctx?.model);
				if (nonVisionNote) notes.push(nonVisionNote);
				content.push({ type: "text", text: notes.join("\n") });
				content.push({ type: "image", data: result.image.data, mimeType: result.image.mimeType });
			} else if (result.text && result.text.length > 0) {
				// 与 CLI @file 一致的 <file> 包裹约定，便于模型区分附件边界。
				content.push({ type: "text", text: `${notes.join("\n")}\n<file name="${result.name}">\n${result.text}\n</file>` });
			} else {
				// 无文本（如空文件、二进制拒绝、解析失败）：仅返回头部与 warnings。
				content.push({ type: "text", text: notes.join("\n") });
			}

			return {
				content,
				details: {
					name: result.name,
					kind: result.kind,
					mimeType: result.mimeType,
					truncated: result.truncated,
				},
			};
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			const rawPath = str((args as { path?: string })?.path);
			text.setText(
				`${theme.fg("toolTitle", theme.bold("parse_attachment"))} ${renderToolPath(rawPath, theme, context.cwd)}`,
			);
			return text;
		},
		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			if (!options.expanded && !context.isError) {
				text.setText("");
				return text;
			}
			const output = getTextOutput(result, context.showImages);
			text.setText(output ? `\n${output}` : "");
			return text;
		},
	};
}
