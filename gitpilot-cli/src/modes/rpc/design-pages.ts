import type { DesignRpcFile } from "./rpc-types.ts";

const PAGE_FILE_PATTERN = /^pages\/([a-zA-Z0-9_-]+)\/(.+)$/;

/**
 * 根据 canonical 文件清单补齐页面索引。
 * 业务意图：一次 patch 可以同时创建多个页面，页面树必须和已落盘的
 * pages/<pageId>/index.html 保持一致，不能只依赖当前运行上下文的 pageId。
 */
export function synchronizeDesignPages(
	pages: Array<Record<string, unknown>>,
	files: DesignRpcFile[],
): Array<Record<string, unknown>> {
	const nextPages = pages
		.filter((page) => Boolean(page && typeof page === "object"))
		.map((page) => {
			const { files: _legacyFiles, ...metadata } = page;
			return { ...metadata };
		});
	const pageIds = new Set(nextPages.map((page) => typeof page.id === "string" ? page.id : ""));

	for (const file of files) {
		const match = file.path.match(PAGE_FILE_PATTERN);
		if (!match || match[2] !== "index.html" || pageIds.has(match[1])) continue;
		pageIds.add(match[1]);
		nextPages.push({ id: match[1], name: match[1], route: `/${match[1]}`, entryFileId: file.id ?? file.path, fileIds: [] });
	}

	return nextPages.map((page) => {
		const pageId = typeof page.id === "string" ? page.id : "";
		const prefix = `pages/${pageId}/`;
		const pageFiles = files.filter((file) => file.path.startsWith(prefix));
		const entry = pageFiles.find((file) => file.path === `${prefix}index.html`);
		return {
			...page,
			...(entry ? { entryFileId: entry.id ?? entry.path } : {}),
			fileIds: pageFiles.map((file) => file.id ?? file.path),
		};
	});
}
