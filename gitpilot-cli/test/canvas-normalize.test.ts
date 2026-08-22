import { describe, expect, it } from "vitest";
import { isCanonicalCanvasNode, normalizeCanvasOperations, normalizeNativeCanvasDocument } from "../src/modes/rpc/canvas-normalize.ts";

function legacyScene() {
	return {
		schemaVersion: 2,
		id: "legacy-design",
		name: "Legacy",
		revision: 1,
		updatedAt: "2026-08-22T00:00:00.000Z",
		entryPageId: "canvas",
		pages: [{ id: "canvas", name: "无限画板", route: "", rootNodeId: "root", width: 100000, height: 100000, background: { kind: "solid", color: "#ffffff" }, isInfinite: true }],
		nodes: {
			root: { id: "root", type: "page", name: "无限画板", parentId: null, childIds: ["bg"], visible: true, locked: false, opacity: 1, layout: { mode: "absolute", width: 100000, height: 100000, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: "column", align: "start", justify: "start" }, transform: { x: 0, y: 0, width: 100000, height: 100000, rotation: 0, scaleX: 1, scaleY: 1 } },
			bg: { id: "bg", type: "rectangle", name: "背景", parentId: "root", childIds: [], fill: "#2563EB", transform: { x: 0, y: 0, width: 1440, height: 900, rotation: 0, scaleX: 1, scaleY: 1 } },
		},
		assets: {},
	};
}

describe("Canvas legacy payload normalization", () => {
	it("normalizes legacy rectangle and default render fields", () => {
		const scene = normalizeNativeCanvasDocument(legacyScene());
		expect(scene.nodes.bg).toMatchObject({ type: "rect", visible: true, locked: false, opacity: 1, layout: { mode: "absolute", width: 1440, height: 900 }, paint: { fill: { kind: "solid", color: "#2563EB" } } });
		expect(isCanonicalCanvasNode(scene.nodes.bg)).toBe(true);
	});

	it("normalizes legacy patch nodes before journaling", () => {
		const scene = normalizeNativeCanvasDocument(legacyScene());
		const operations = normalizeCanvasOperations([{ op: "create_node", node: { id: "title", type: "text", name: "标题", parentId: "root", childIds: [], text: "登录", fill: "#1E293B", transform: { x: 100, y: 100, width: 300, height: 40, rotation: 0, scaleX: 1, scaleY: 1 } }, parentId: "root" }], scene);
		expect(operations[0]).toMatchObject({ op: "create_node", node: { type: "text", visible: true, layout: { width: 300, height: 40 }, text: { text: "登录", color: "#1E293B" } } });
	});

	it("rejects unsupported node types with actionable error", () => {
		expect(() => normalizeNativeCanvasDocument({ ...legacyScene(), nodes: { ...legacyScene().nodes, bad: { id: "bad", type: "html", childIds: [] } } })).toThrow(/bad.*不支持/);
	});
});
