import { describe, expect, it } from "vitest";
import { evaluateCommandPolicy, evaluateToolRisk, isPathInsideWorkspace } from "./command-policy.ts";

const workspace = "C:/work/project";

describe("桌面端命令安全策略", () => {
	it("在进程启动前拒绝根目录全盘扫描", () => {
		expect(evaluateCommandPolicy({ workspacePath: workspace, command: 'find / -name "*.vue"' }).allowed).toBe(false);
		expect(evaluateCommandPolicy({ workspacePath: workspace, command: "grep -r / src" }).allowed).toBe(false);
		expect(evaluateCommandPolicy({ workspacePath: workspace, command: "rg /" }).allowed).toBe(false);
	});

	it("允许工作区内搜索并要求写入和 Bash 审批", () => {
		expect(evaluateToolRisk("find", { path: "src" }, workspace).needsApproval).toBe(false);
		expect(evaluateToolRisk("find", { path: "/" }, workspace).allowed).toBe(false);
		expect(evaluateToolRisk("write", { path: "src/app.ts" }, workspace).needsApproval).toBe(true);
		expect(evaluateToolRisk("bash", { command: "npm test" }, workspace).risk).toBe("network");
	});

	it("识别工作区外路径且避免前缀目录绕过", () => {
		expect(isPathInsideWorkspace(workspace, "C:/work/project-other/file.ts")).toBe(false);
		expect(evaluateToolRisk("read", { path: "../secrets.txt" }, workspace).risk).toBe("outside_workspace");
	});
});
