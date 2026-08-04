/**
 * pi-rtk-optimizer 的类型声明（仅供 tsc 类型检查）。
 *
 * pi-rtk-optimizer 发布 .ts 源码，其 tool_result handler 返回 string content，
 * 与宿主 ToolResultEventResult.content（数组形式）类型细微不兼容（运行时 Pi 归一化处理，无影响）。
 * tsconfig.build.json（tsc）通过 paths 映射到此声明，避免检查上游源码；
 * tsconfig.json（bun build）不映射 pi-rtk-optimizer，使用实际源码打包进 sidecar。
 */
declare module "pi-rtk-optimizer" {
	import type { ExtensionFactory } from "../core/extensions/types.ts";
	const factory: ExtensionFactory;
	export default factory;
}
