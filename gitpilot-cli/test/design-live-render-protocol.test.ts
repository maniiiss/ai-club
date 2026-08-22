import { describe, expect, it } from "vitest";
import type { DesignOpenData, DesignPatchAppliedEvent, DesignRunSettledEvent } from "../src/modes/rpc/rpc-types.ts";

describe("Design live render protocol", () => {
	it("接受增量 patch 的可选 draft 字段，同时保留旧字段兼容", () => {
		const legacy = {
			type: "design_patch_applied" as const, projectId: "project", projectPath: "/tmp/project", designId: "design", requestId: "request", runId: "run", sequence: 1, emittedAt: Date.now(), operationId: "operation", revisionId: "draft-run", pageId: "canvas", summary: "创建画布", transaction: { transactionId: "operation", baseRevision: 1, source: "ai" as const, operations: [], summary: "创建画布", createdAt: new Date().toISOString() }, affectedNodeIds: [], isDraft: true,
		} satisfies DesignPatchAppliedEvent;
		const enriched: DesignPatchAppliedEvent = { ...legacy, draftRevisionId: "draft-run", operationIndex: 1, dirtyRects: [{ x: 0, y: 0, width: 100, height: 80 }] };
		expect(enriched.revisionId).toBe("draft-run");
		expect(enriched.operationIndex).toBe(1);
	});

	it("settled 事件的 reason 缺省为兼容 completed，interrupted 可显式传输", () => {
		const event: DesignRunSettledEvent = { type: "design_run_settled", designId: "design", requestId: "request", sequence: 2, emittedAt: Date.now(), snapshot: { document: {}, files: [] } };
		const interrupted: DesignRunSettledEvent = { ...event, reason: "interrupted" };
		expect(event.reason).toBeUndefined();
		expect(interrupted.reason).toBe("interrupted");
	});

	it("design_open 可携带 active draft 的一次性场景快照", () => {
		const data: DesignOpenData = { designId: "design", snapshot: { document: {}, files: [] }, draft: { status: "active", runId: "design-run-1", requestId: "request", baseRevisionId: "rev-1", draftRevisionId: "draft-design-run-1", operationCount: 3, lastSequence: 9 }, draftSnapshot: { document: { canvas: { schemaVersion: 2, id: "design", name: "Design", revision: 4, updatedAt: new Date().toISOString(), entryPageId: "canvas", pages: [], nodes: {}, assets: {} } }, files: [] } };
		expect(data.draftSnapshot?.document.canvas?.revision).toBe(4);
	});
});
