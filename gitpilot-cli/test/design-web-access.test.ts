import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rpcModeSource = readFileSync(new URL("../src/modes/rpc/rpc-mode.ts", import.meta.url), "utf8");

describe("Design Web 研究权限", () => {
	it("允许 Web/MCP 只读研究并保留本地工具边界", () => {
		expect(rpcModeSource).toContain("可以按需使用 Web/MCP 工具进行只读研究");
		expect(rpcModeSource).toContain("需要时可以使用 Web/MCP 工具进行只读研究");
		expect(rpcModeSource).not.toContain("任意文件工具或网络资源");
		expect(rpcModeSource).not.toContain("任意文件、网络资源");
		expect(rpcModeSource).toContain("不能使用 Shell、Git 或任意本地文件工具");
	});
});
