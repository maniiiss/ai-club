/**
 * /requirement 命令：列出负责人是当前 CLI 用户的需求，
 * 选中后构造“技术设计 + 开发”指令并触发 AI 推理。
 * 业务意图：在 CLI 内直接拉取分配给自己的需求并驱动 AI 设计开发，减少 Web 控制台切换。
 */
import type { ExtensionAPI } from "../../core/extensions/types.ts";
import { getCachedCliToken, loadCliToken } from "./credentials.ts";
import { getPlatformUrl } from "./config.ts";
import { listMyTasks, type CliTaskSummary, type PageResponse } from "./api.ts";

/** 注册 /requirement 命令。 */
export function registerRequirementCommand(pi: ExtensionAPI): void {
	pi.registerCommand("requirement", {
		description: "列出负责人是我的需求，选中后进行技术设计与开发",
		handler: async (_args, ctx) => {
			// 1. 校验平台配置与登录态
			const platformUrl = getPlatformUrl();
			if (!platformUrl) {
				ctx.ui.notify("未配置平台地址，请先设置 GITPILOT_PLATFORM_URL 或运行 /login gitpilot", "warning");
				return;
			}
			const token = getCachedCliToken() ?? (await loadCliToken(platformUrl));
			if (!token) {
				ctx.ui.notify("未登录平台，请运行 /login gitpilot", "warning");
				return;
			}

			// 2. 拉取需求首页
			let page: PageResponse<CliTaskSummary> | null = null;
			try {
				page = await listMyTasks(platformUrl, token, { page: 1, size: 50 }, { timeoutMs: 10_000 });
			} catch (err) {
				ctx.ui.notify(`拉取需求失败：${(err as Error).message}`, "error");
				return;
			}

			// 3. 空列表（records 缺失/为空都按空列表处理，避免判空逃逸成未捕获异常导致扩展静默失败）
			if (!page || !page.records.length) {
				ctx.ui.notify("暂无负责人是你的需求", "info");
				return;
			}

			// 4. 选择器展示（label 拼接关键字段便于一眼定位）
			const options = page.records.map((t) =>
				`[${t.workItemCode}] ${t.name} · ${t.status} · ${t.priority ?? "-"} · ${t.projectName ?? "-"}`,
			);
			const selected = await ctx.ui.select("选择要设计开发的需求", options);
			if (!selected) return; // 用户取消

			// 5. 回查选中项
			const idx = options.indexOf(selected);
			const task = page.records[idx];
			if (!task) return;

			// 6. 构造“技术设计 + 开发”指令并触发 AI（idle 立即发，忙则排队）
			const prompt = buildDesignDevPrompt(task);
			if (ctx.isIdle()) {
				pi.sendUserMessage(prompt);
			} else {
				pi.sendUserMessage(prompt, { deliverAs: "followUp" });
				ctx.ui.notify("已排队，当前任务结束后开始", "info");
			}
		},
	});
}

/** 构造“基于需求进行技术设计与开发”的指令 prompt。 */
function buildDesignDevPrompt(task: CliTaskSummary): string {
	const lines: string[] = [];
	lines.push("请基于以下需求完成技术设计与开发实现：");
	lines.push("");
	lines.push(`# [${task.workItemCode}] ${task.name}`);
	lines.push(`- 状态：${task.status} | 优先级：${task.priority ?? "-"}`);
	if (task.projectName) lines.push(`- 项目：${task.projectName}`);
	if (task.iterationName) lines.push(`- 迭代：${task.iterationName}`);
	if (task.planStartDate || task.planEndDate) {
		lines.push(`- 计划周期：${task.planStartDate ?? "?"} ~ ${task.planEndDate ?? "?"}`);
	}
	lines.push("");
	lines.push("## 需求描述");
	lines.push(
		task.requirementMarkdown?.trim()
			? task.requirementMarkdown.trim()
			: "（无详细需求描述，请基于需求名称与项目上下文推断，必要时先与我对齐需求范围）",
	);
	lines.push("");
	lines.push("请先给出技术设计方案（涉及模块、接口、数据结构、风险点），再进行开发实现。");
	return lines.join("\n");
}
