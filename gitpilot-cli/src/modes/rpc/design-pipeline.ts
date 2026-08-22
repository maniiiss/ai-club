import type { CanvasDesignDocument, CanvasDesignOperation } from "./rpc-types.ts";

const DEFAULT_DESIGN_FRAME_WIDTH = 1440;
const DEFAULT_DESIGN_FRAME_HEIGHT = 900;

/**
 * 为新建或空白页面生成第一阶段的 UI 容器。
 * 业务意图：页面尺寸和绘制坐标先稳定下来，模型后续只提交元素 patch，
 * Desktop 才能在容器出现后按视觉区域渐进渲染，而不是首批同时组织整页骨架。
 */
export function createDesignFoundationOperations(document: CanvasDesignDocument, pageId: string): CanvasDesignOperation[] {
	const page = document.pages.find((candidate) => candidate.id === pageId) as Record<string, unknown> | undefined;
	const rootNodeId = typeof page?.rootNodeId === "string" ? page.rootNodeId : undefined;
	if (!page || !rootNodeId) return [];
	const root = document.nodes[rootNodeId];
	if (!root || !Array.isArray(root.childIds) || root.childIds.length > 0) return [];
	const pageWidth = Number(page.width);
	const pageHeight = Number(page.height);
	const width = page.isInfinite === true || pageWidth >= 10_000 ? DEFAULT_DESIGN_FRAME_WIDTH : Math.max(1, pageWidth || DEFAULT_DESIGN_FRAME_WIDTH);
	const height = page.isInfinite === true || pageHeight >= 10_000 ? DEFAULT_DESIGN_FRAME_HEIGHT : Math.max(1, pageHeight || DEFAULT_DESIGN_FRAME_HEIGHT);
	const id = `${pageId}-screen-frame`;
	if (document.nodes[id]) return [];
	return [{
		op: "create_node",
		parentId: rootNodeId,
		node: {
			id,
			type: "frame",
			name: "页面容器",
			parentId: rootNodeId,
			childIds: [],
			visible: true,
			locked: false,
			opacity: 1,
			transform: { x: 0, y: 0, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
			layout: { mode: "absolute", width, height, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: "column", align: "start", justify: "start" },
			paint: { fill: { kind: "solid", color: "#ffffff" } },
		},
	}];
}
