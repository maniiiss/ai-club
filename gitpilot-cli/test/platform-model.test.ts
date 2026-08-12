import { describe, expect, it } from "vitest";
import { resolveReasoningProfile } from "../src/extensions/gitpilot/platform-model.ts";

describe("平台模型推理能力解析", () => {
	it("已知 DeepSeek V4 模型命中 reasoning 配置，复刻 pi-ai 原生 deepseek 能力", () => {
		const flash = resolveReasoningProfile("deepseek-v4-flash");
		expect(flash).toBeDefined();
		expect(flash?.reasoning).toBe(true);
		expect(flash?.compat.thinkingFormat).toBe("deepseek");
		// 保留 system role，避免平台 messages.role=developer 400。
		expect(flash?.compat.supportsDeveloperRole).toBe(false);
		expect(flash?.compat.requiresReasoningContentOnAssistantMessages).toBe(true);
		// 仅支持 off/high/max；minimal/low/medium 显式置 null 表示不支持。
		expect(flash?.thinkingLevelMap).toEqual({ minimal: null, low: null, medium: null, high: "high", max: "max" });

		const pro = resolveReasoningProfile("deepseek-v4-pro");
		expect(pro?.reasoning).toBe(true);
		expect(pro?.compat.thinkingFormat).toBe("deepseek");
	});

	it("按 modelName 大小写不敏感解析，并忽略首尾空白", () => {
		expect(resolveReasoningProfile("DeepSeek-V4-Flash")?.reasoning).toBe(true);
		expect(resolveReasoningProfile("  deepseek-v4-flash  ")?.reasoning).toBe(true);
	});

	it("非推理模型与未知模型名返回 undefined，交由调用方按 reasoning:false 处理", () => {
		expect(resolveReasoningProfile("gpt-4o")).toBeUndefined();
		expect(resolveReasoningProfile("claude-3-5-haiku")).toBeUndefined();
		expect(resolveReasoningProfile("deepseek-chat")).toBeUndefined();
		expect(resolveReasoningProfile(undefined)).toBeUndefined();
		expect(resolveReasoningProfile("")).toBeUndefined();
		expect(resolveReasoningProfile(null)).toBeUndefined();
	});
});
