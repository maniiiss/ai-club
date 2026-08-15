import { describe, expect, it } from "vitest";
import { isDesktopCommandVisible } from "../src/extensions/gitpilot/desktop-command-visibility.ts";

describe("Desktop 命令可见性", () => {
	it("隐藏由智能体自动调用的配置与诊断命令", () => {
		for (const command of ["llama", "websearch", "curator", "google-account", "search", "mcp", "mcp-auth"]) {
			expect(isDesktopCommandVisible(command)).toBe(false);
		}
	});

	it("保留用户主动发起的业务命令", () => {
		expect(isDesktopCommandVisible("project")).toBe(true);
		expect(isDesktopCommandVisible("goal")).toBe(true);
		expect(isDesktopCommandVisible("plan")).toBe(true);
	});
});
