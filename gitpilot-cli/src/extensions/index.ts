import type { InlineExtension } from "../core/extensions/types.ts";
import gitpilotPlatformExtension from "./gitpilot/index.ts";
import llamaExtension from "./llama/index.ts";

// gitpilot 平台对接 extension 随源码编译并默认加载；llama.cpp 作为可选本地推理 provider 保留。
export const builtInExtensions: InlineExtension[] = [
	{ name: "gitpilot-platform", factory: gitpilotPlatformExtension },
	{ name: "llama.cpp", factory: llamaExtension, hidden: true },
];
