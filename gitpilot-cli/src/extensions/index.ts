import type { InlineExtension } from "../core/extensions/types.ts";
import gitpilotPlatformExtension from "./gitpilot/index.ts";
import llamaExtension from "./llama/index.ts";

// gitpilot 平台对接 extension 随源码编译并默认加载；llama.cpp 作为可选本地推理 provider 保留。
export const builtInExtensions: InlineExtension[] = [
	{ name: "gitpilot-platform", factory: gitpilotPlatformExtension },
	{ name: "llama.cpp", factory: llamaExtension, hidden: true },
];

// 内置精选扩展（curated extensions）清单与启用解析。
// 精选扩展的 factory 由 loader 在运行时通过 jiti.import(packageName) 加载，
// 不在此处静态导入，避免 tsc 将 .ts 源码包纳入类型检查。
export * from "./curated-extension-manifest.ts";
