import { describe, expect, it } from "vitest";
import { buildCommitMessagePrompt, extractCommitMessage, COMMIT_MESSAGE_SYSTEM_PROMPT } from "../src/modes/rpc/git-commit-message.ts";

describe("buildCommitMessagePrompt", () => {
	it("包含文件清单与 diff，并标注截断", () => {
		const prompt = buildCommitMessagePrompt({ files: ["src/a.ts", "src/b.ts"], diff: "+new", truncated: true, binary: false });
		expect(prompt).toContain("- src/a.ts");
		expect(prompt).toContain("- src/b.ts");
		expect(prompt).toContain("+new");
		expect(prompt).toContain("diff 超长已截断");
	});

	it("二进制内容不携带 diff", () => {
		const prompt = buildCommitMessagePrompt({ files: ["logo.bin"], diff: "", truncated: false, binary: true });
		expect(prompt).toContain("二进制文件");
		expect(prompt).not.toContain("```diff");
	});
});

describe("extractCommitMessage", () => {
	it("提取单行提交信息，剥离标签与引号", () => {
		expect(extractCommitMessage("提交信息：修复登录跳转丢失回调")).toBe("修复登录跳转丢失回调");
		expect(extractCommitMessage('"新增导出接口"')).toBe("新增导出接口");
	});

	it("保留标题后紧跟的要点列表，忽略之后的解释段落", () => {
		const message = extractCommitMessage([
			"重构会话恢复逻辑",
			"",
			"- 拆分快照构造",
			"- 补充重连测试",
			"",
			"以上就是我的建议，希望有帮助。",
		].join("\n"));
		expect(message).toBe("重构会话恢复逻辑\n\n- 拆分快照构造\n- 补充重连测试");
	});

	it("剥离代码块围栏", () => {
		const message = extractCommitMessage("```\n新增用户导出\n```");
		expect(message).toBe("新增用户导出");
	});

	it("空回复与超长回复的安全处理", () => {
		expect(extractCommitMessage("   \n``` \n")).toBe("");
		const long = extractCommitMessage(`${"很".repeat(600)}长提交信息`);
		expect(long.length).toBeLessThanOrEqual(500);
	});

	it("系统提示限定只输出提交信息本身", () => {
		expect(COMMIT_MESSAGE_SYSTEM_PROMPT).toContain("只输出提交信息本身");
	});
});
