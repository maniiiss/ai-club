import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// 本地化改动（fork 自 @narumitw/pi-plan-mode@0.44.0）：
// showPlanModeMenu / showReadyPlanMenu 不再走 pi-tui-kit 的 runMenu/runDialogMenu，
// 改为直接调 ctx.ui.select。原因：runDialogMenu 用 rows.find(label === choice) 精确匹配，
// 自定义 choice 会被丢弃并 continue 重弹（死循环）。直接 select 后，非预设 choice 视为
// 用户在输入框上方浮层"手动输入"提交的自定义反馈，交 refine 回调连同原计划发给 AI 修改。
// stay/close 语义保留自原 runMenu action 的 transition（tools 返回 stay -> continue，其余 close -> return）。
// 选项与标题改为中文，对齐桌面端 UI 语言。

interface MenuLifecycle {
	signal: AbortSignal;
	isCurrent(): boolean;
}

interface PlanMenuOptions extends MenuLifecycle {
	statusText: string;
	hasReadyPlan: boolean;
	show(): void;
	finalize(): void;
	implement(): void | Promise<void>;
	save(): void;
	tools(): Promise<void>;
	stay(): void;
	exit(): void;
	/** 用户"手动输入"提交的自定义反馈（仅 hasReadyPlan 时触发）：连同原计划发给 AI 修改。 */
	refine(feedback: string): void;
}

/**
 * Plan mode 主菜单（/plan 命令触发）。
 * 直接 ctx.ui.select 呈现，非预设 choice 视为自定义反馈（仅 hasReadyPlan 时交 refine）。
 */
export async function showPlanModeMenu(ctx: ExtensionContext, options: PlanMenuOptions) {
	const hasReady = options.hasReadyPlan;
	while (true) {
		const labels = hasReady
			? [
					"查看最新计划",
					"执行此计划",
					"保存以备后用",
					"配置计划模式工具",
					"留在计划模式",
					"退出计划模式",
				]
			: [
					"请求最终计划",
					"配置计划模式工具",
					"留在计划模式",
					"退出计划模式",
				];
		const choice = await ctx.ui.select("计划模式", labels, { signal: options.signal });
		if (!options.isCurrent()) return;
		if (choice === "查看最新计划") {
			options.show();
			return;
		}
		if (choice === "请求最终计划") {
			options.finalize();
			return;
		}
		if (choice === "执行此计划") {
			await options.implement();
			return;
		}
		if (choice === "保存以备后用") {
			options.save();
			return;
		}
		if (choice === "配置计划模式工具") {
			// 原 runMenu action 返回 stay：配置工具后留在菜单继续选择。
			await options.tools();
			if (!options.isCurrent()) return;
			continue;
		}
		if (choice === "留在计划模式") {
			options.stay();
			return;
		}
		if (choice === "退出计划模式") {
			options.exit();
			return;
		}
		// choice === undefined（用户取消）-> 关闭菜单。
		if (choice === undefined) return;
		// 自定义反馈：有 ready plan 时连同原计划发给 AI（refine 触发新回合，菜单关闭）；否则忽略、留在菜单。
		if (hasReady) {
			options.refine(choice);
			return;
		}
		// 无 ready plan 时的自定义文本无意义，留在菜单继续选择。
		continue;
	}
}

interface ReadyPlanMenuOptions extends MenuLifecycle {
	implement(): void | Promise<void>;
	save(): void;
	stay(): void;
	exit(): void;
	/** 用户"手动输入"提交的自定义反馈：连同原计划发给 AI 修改，plan 模式继续。 */
	refine(feedback: string): void;
}

/**
 * 计划就绪确认菜单（agent_end 后 onAgentSettled 自动触发）。
 * 直接 ctx.ui.select 呈现，预设选项走对应 action，自定义 choice 走 refine，undefined（取消）当 stay。
 */
export async function showReadyPlanMenu(ctx: ExtensionContext, options: ReadyPlanMenuOptions) {
	const labels = [
		"执行此计划",
		"保存以备后用",
		"留在计划模式",
		"退出计划模式",
	];
	const choice = await ctx.ui.select("计划已就绪，下一步？", labels, { signal: options.signal });
	if (!options.isCurrent()) return;
	if (choice === "执行此计划") {
		await options.implement();
		return;
	}
	if (choice === "保存以备后用") {
		options.save();
		return;
	}
	if (choice === "留在计划模式") {
		options.stay();
		return;
	}
	if (choice === "退出计划模式") {
		options.exit();
		return;
	}
	// choice === undefined（取消）-> 当 stay，不操作。
	// 自定义反馈 -> 连同原计划发给 AI 修改，plan 模式继续。
	if (choice) options.refine(choice);
}
