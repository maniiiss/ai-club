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

describe("Canvas 图标名硬校验", () => {
	function iconNode(id: string, name: string, extra = {}) {
		return { id, type: "icon", name: id, parentId: "root", childIds: [], icon: { name, ...extra }, transform: { x: 0, y: 0, width: 24, height: 24, rotation: 0, scaleX: 1, scaleY: 1 } };
	}

	it("拒绝不在 Phosphor 图标库中的名称并给出近似候选", () => {
		const scene = normalizeNativeCanvasDocument(legacyScene());
		expect(() => normalizeCanvasOperations([{ op: "create_node", node: iconNode("icon-bad", "phoen"), parentId: "root" }], scene)).toThrow(/phoen.*phone|phone.*phoen/);
	});

	it("合法 Phosphor 名称与自定义 svgPath 透过校验", () => {
		const scene = normalizeNativeCanvasDocument(legacyScene());
		const operations = normalizeCanvasOperations([
			{ op: "create_node", node: iconNode("icon-phone", "phone"), parentId: "root" },
			{ op: "create_node", node: iconNode("icon-custom", "my-badge", { library: "custom", svgPath: "M4 4h16v16H4z" }), parentId: "root" },
		], scene);
		expect(operations[0]).toMatchObject({ op: "create_node", node: { icon: { name: "phone" } } });
		expect(operations[1]).toMatchObject({ op: "create_node", node: { icon: { library: "custom", svgPath: "M4 4h16v16H4z" } } });
	});

	it("update_node 仅在改写 icon 时校验，旧场景遗留名称不阻断更新", () => {
		const scene = normalizeNativeCanvasDocument({
			...legacyScene(),
			nodes: {
				...legacyScene().nodes,
				"icon-legacy": { id: "icon-legacy", type: "icon", name: "legacy-icon", parentId: "root", childIds: [], icon: { name: "some-legacy-name" }, transform: { x: 10, y: 10, width: 24, height: 24, rotation: 0, scaleX: 1, scaleY: 1 } },
			},
		});
		const moved = normalizeCanvasOperations([{ op: "update_node", nodeId: "icon-legacy", changes: { transform: { x: 99, y: 10, width: 24, height: 24, rotation: 0, scaleX: 1, scaleY: 1 } } }], scene);
		expect(moved[0]).toMatchObject({ op: "update_node", changes: { transform: { x: 99 } } });
		expect(() => normalizeCanvasOperations([{ op: "update_node", nodeId: "icon-legacy", changes: { icon: { name: "not-exist-icon" } } }], scene)).toThrow(/not-exist-icon/);
	});
});
