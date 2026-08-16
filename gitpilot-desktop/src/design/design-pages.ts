import type { DesignFile, DesignPage } from './design-types';

const PAGE_FILE_PATTERN = /^pages\/([a-zA-Z0-9_-]+)\/(.+)$/;

/**
 * 从文件清单补齐页面元数据。
 * 业务意图：sidecar 在一次 patch 中可能返回多个新页面，桌面端收到增量文件
 * 后也要立即更新右侧页面树，不能等下一次完整恢复才能看到新页面。
 */
export function synchronizeDesignPages(pages: DesignPage[], files: DesignFile[]): DesignPage[] {
	const nextPages = pages.map(({ files: _legacyFiles, ...page }) => ({ ...page }));
	const pageIds = new Set(nextPages.map((page) => page.id));
	for (const file of files) {
		const match = file.path.match(PAGE_FILE_PATTERN);
		if (!match || match[2] !== 'index.html' || pageIds.has(match[1])) continue;
		pageIds.add(match[1]);
		nextPages.push({ id: match[1], name: match[1], route: `/${match[1]}`, entryFileId: file.id ?? file.path, fileIds: [] });
	}
	return nextPages.map((page) => {
		const prefix = `pages/${page.id}/`;
		const pageFiles = files.filter((file) => file.path.startsWith(prefix));
		const entry = pageFiles.find((file) => file.path === `${prefix}index.html`);
		return { ...page, ...(entry ? { entryFileId: entry.id ?? entry.path } : {}), fileIds: pageFiles.map((file) => file.id ?? file.path) };
	});
}
