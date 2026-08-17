/**
 * 内置精选扩展清单（curated extension manifest）。
 *
 * 精选扩展在构建期打入 CLI/sidecar，版本精确锁定，不依赖用户机 npm 或公网。
 * 用户执行 `pi install npm:<同名包>` 时，包管理器比对本清单并提示"已由当前 GitPilot 版本内置"。
 * 扩展级开关由 settings.json 的 bundledExtensions 字段控制，受 --no-extensions 影响。
 *
 * 详见 docs/design-docs/gitpilot-pi-productivity-extensions-technical-design-v1.md §5。
 */

/** 精选扩展唯一标识。v1 四扩展预留，本阶段首批落地 rtk-optimizer。 */
export type CuratedExtensionId = "slopchop" | "goal" | "plan-mode" | "subagents" | "rtk-optimizer" | "plannotator";

/** 内置精选扩展定义。factory 由 loader 在运行时通过 jiti.import(packageName) 加载。 */
export interface CuratedExtensionDefinition {
	/** 精选扩展 id，同时作为内置 InlineExtension 的 name */
	id: CuratedExtensionId;
	/** npm 包名（保留 pi 前缀，重复安装保护比对需要） */
	packageName: string;
	/** 用户可见品牌名（不带 pi 前缀，用于提示、诊断与 UI 展示） */
	displayName: string;
	/** 模块入口 specifier：有 main 的包用包名，无 main 的包用 "包名/src/index.ts" 路径形式 */
	entry: string;
	/** 精确锁定版本（不用 ^ 或 latest） */
	version: string;
	/** 默认是否启用；用户可在 settings.json bundledExtensions 覆盖 */
	defaultEnabled: boolean;
	/** 适用的宿主面：cli-tui 原生 TUI、rpc 标准 RPC、desktop-native 原生 GUI 适配 */
	surfaces: Array<"cli-tui" | "rpc" | "desktop-native">;
}

/**
 * 精选扩展清单。
 *
 * v1 设计的 slopchop/goal/plan-mode/subagents 预留位置，待后续 P1+ 阶段补充依赖与 Desktop 适配。
 * 本阶段首批落地 RTK Optimizer（命令重写与输出压缩，后台事件钩子型，可独立闭环）。
 */
export const curatedExtensions: CuratedExtensionDefinition[] = [
	// TODO(P1+): pi-slopchop@0.10.1（SlopChop）- /slopchop、/diff，复用 Git Review Workbench
	// TODO(P1+): @narumitw/pi-subagents@0.43.1（Subagents）- /subagents、blocking/stateful/consultation 工具
	{
		id: "rtk-optimizer",
		packageName: "pi-rtk-optimizer",
		displayName: "RTK Optimizer",
		entry: "pi-rtk-optimizer",
		version: "0.9.0",
		defaultEnabled: true,
		surfaces: ["cli-tui", "rpc", "desktop-native"],
	},
	{
		id: "goal",
		packageName: "@narumitw/pi-goal",
		displayName: "Goal",
		entry: "@narumitw/pi-goal/src/index.ts",
		version: "0.43.0",
		defaultEnabled: true,
		surfaces: ["cli-tui", "rpc", "desktop-native"],
	},
	{
		id: "plan-mode",
		packageName: "@narumitw/pi-plan-mode",
		displayName: "Plan Mode",
		entry: "@narumitw/pi-plan-mode/src/index.ts",
		version: "0.44.0",
		defaultEnabled: true,
		surfaces: ["cli-tui", "rpc", "desktop-native"],
	},
	{
		id: "plannotator",
		packageName: "@plannotator/pi-extension",
		displayName: "Plannotator",
		entry: "@plannotator/pi-extension",
		version: "0.27.3",
		defaultEnabled: true,
		surfaces: ["cli-tui", "rpc", "desktop-native"],
	},
];

/** 按 packageName 查找精选扩展定义（用于重复安装保护） */
export function findCuratedByPackageName(packageName: string): CuratedExtensionDefinition | undefined {
	return curatedExtensions.find((ext) => ext.packageName === packageName);
}

/** 按 id 查找精选扩展定义 */
export function findCuratedById(id: string): CuratedExtensionDefinition | undefined {
	return curatedExtensions.find((ext) => ext.id === id);
}

/**
 * 解析当前应启用的精选扩展 id 集合。
 *
 * 优先使用 settings.json bundledExtensions 的用户配置；未配置的 id 回退到 defaultEnabled。
 * noExtensions=true 时返回空集合（与 --no-extensions 语义一致，curated 扩展也受控）。
 */
export function resolveEnabledCuratedIds(
	bundledExtensions: Record<string, boolean> | undefined,
	noExtensions: boolean,
): Set<CuratedExtensionId> {
	if (noExtensions) {
		return new Set();
	}
	// 测试环境通过 PI_DISABLE_CURATED_EXTENSIONS=1 禁用内置精选扩展，
	// 避免 rtk-optimizer 的 tool_call/tool_result 钩子改变 AgentSession 测试行为。
	// 与 Pi 既有的 PI_OFFLINE、PI_TELEMETRY 等环境变量开关风格一致。
	if (process.env.PI_DISABLE_CURATED_EXTENSIONS === "1") {
		return new Set();
	}
	const enabled = new Set<CuratedExtensionId>();
	for (const ext of curatedExtensions) {
		const userOverride = bundledExtensions?.[ext.id];
		const isEnabled = userOverride ?? ext.defaultEnabled;
		if (isEnabled) {
			enabled.add(ext.id);
		}
	}
	return enabled;
}
