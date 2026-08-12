/**
 * @narumitw/pi-plan-mode 的类型声明（仅供 tsc 类型检查）。
 *
 * pi-plan-mode 发布 .ts 源码且无 main/exports，入口为 "包名/src/index.ts"。
 * tsconfig.build.json（tsc）通过 paths 映射到此声明，避免检查上游源码；
 * tsconfig.json（bun build）不映射，使用实际源码打包进 sidecar。
 */
declare module "@narumitw/pi-plan-mode/src/index.ts" {
	import type { ExtensionFactory } from "../core/extensions/types.ts";
	const factory: ExtensionFactory;
	export default factory;
}
