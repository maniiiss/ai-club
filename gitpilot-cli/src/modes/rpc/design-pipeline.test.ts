import { describe, expect, it } from "vitest";
import { createDesignFoundationOperations } from "./design-pipeline.ts";
import type { CanvasDesignDocument } from "./rpc-types.ts";

function emptyDocument(infinite = true): CanvasDesignDocument {
	return {
		schemaVersion: 2,
		id: "design",
		name: "Design",
		revision: 1,
		updatedAt: "2026-08-23T00:00:00.000Z",
		entryPageId: "canvas",
		pages: [{ id: "canvas", name: "画布", route: "", rootNodeId: "root", width: infinite ? 100_000 : 1440, height: infinite ? 100_000 : 900, isInfinite: infinite }],
		nodes: {
			root: { id: "root", type: "page", parentId: null, childIds: [], visible: true, locked: false, opacity: 1, transform: { x: 0, y: 0, width: 100_000, height: 100_000, rotation: 0, scaleX: 1, scaleY: 1 }, layout: { mode: "absolute", width: 100_000, height: 100_000, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: "column", align: "start", justify: "start" } },
		},
		assets: {},
	};
}

describe("Design foundation pipeline", () => {
	it("先创建稳定的桌面页面容器，而不是一次生成元素", () => {
		const [operation] = createDesignFoundationOperations(emptyDocument(), "canvas");
		expect(operation?.op).toBe("create_node");
		if (operation?.op !== "create_node") return;
		expect(operation.node.type).toBe("frame");
		expect(operation.node.transform).toEqual({ x: 0, y: 0, width: 1440, height: 900, rotation: 0, scaleX: 1, scaleY: 1 });
		expect(operation.node.childIds).toEqual([]);
	});

	it("已有页面元素时不重复插入容器", () => {
		const document = emptyDocument();
		document.nodes.root.childIds = ["existing"];
		document.nodes.existing = { id: "existing", type: "frame", parentId: "root", childIds: [], visible: true, locked: false, opacity: 1 };
		expect(createDesignFoundationOperations(document, "canvas")).toEqual([]);
	});
});

