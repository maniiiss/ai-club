import { describe, expect, it } from "vitest";
import { normalizeCanvasNode, normalizeCanvasOperations } from "./canvas-normalize.ts";

describe("Canvas icon protocol", () => {
	it("accepts semantic icon nodes and canonicalizes defaults", () => {
		const node = normalizeCanvasNode({
			id: "icon-home",
			type: "icon",
			name: "Home",
			parentId: "root",
			childIds: [],
			transform: { x: 0, y: 0, width: 24, height: 24 },
			icon: { name: "house", library: "lucide" },
		});

		expect(node).toMatchObject({ type: "icon", icon: { name: "house", library: "lucide", weight: "regular", style: "stroke" } });
	});

	it("normalizes icon create operations before journal/revision handling", () => {
		const source = normalizeCanvasNode({
			id: "root", type: "page", name: "Canvas", parentId: null, childIds: [],
			transform: { x: 0, y: 0, width: 1000, height: 800 },
		});
		const document = {
			schemaVersion: 2 as const, id: "design", name: "Design", revision: 1, updatedAt: new Date().toISOString(), entryPageId: "canvas",
			pages: [{ id: "canvas", name: "Canvas", route: "", rootNodeId: "root", width: 1000, height: 800, background: { kind: "solid", color: "#fff" } }],
			nodes: { root: source }, assets: {},
		};
		const [operation] = normalizeCanvasOperations([{
			op: "create_node", parentId: "root", node: { id: "icon-search", type: "icon", name: "Search", parentId: "root", childIds: [], visible: true, locked: false, opacity: 1, transform: { x: 0, y: 0, width: 24, height: 24 }, layout: { mode: "absolute", width: 24, height: 24, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: "column", align: "start", justify: "start" }, icon: { name: "search" } },
		}], document);

		expect(operation).toMatchObject({ op: "create_node", node: { type: "icon", icon: { name: "search", library: "phosphor" } } });
	});
});
