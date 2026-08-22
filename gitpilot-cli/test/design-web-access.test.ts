import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rpcModeSource = readFileSync(new URL("../src/modes/rpc/rpc-mode.ts", import.meta.url), "utf8");
const modeExtensionsSource = readFileSync(new URL("../src/extensions/gitpilot/mode-extensions.ts", import.meta.url), "utf8");

describe("Design Web 研究权限", () => {
	it("Web 工具常驻 Design 会话，由智能体自行判断是否联网", () => {
		// 不再用关键字预判是否加载 Web 工具，联网意图识别交给智能体本身。
		expect(rpcModeSource).not.toContain("designPromptNeedsWebAccess");
		expect(modeExtensionsSource).toContain("options.includeWebAccess ?? true");
		// 系统提示词要求智能体按需求自行决定联网时机，并保留本地工具边界。
		expect(rpcModeSource).toContain("是否联网由你根据需求自行判断");
		expect(rpcModeSource).toContain("不能使用 Shell、Git 或任意本地文件工具");
		expect(rpcModeSource).not.toContain("任意文件工具或网络资源");
		expect(rpcModeSource).not.toContain("任意文件、网络资源");
	});
});
