import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// GitPilot CLI 二开配置：fork 自 pi-coding-agent，依赖 @earendil-works/* 通过 node_modules 解析，
// 不再使用 pi-mono monorepo 的 sibling src 别名。
export default defineConfig({
	resolve: {
		alias: {
			// pi-rtk-optimizer 等精选扩展发布 .ts 源码，其 peerDependency
			// @earendil-works/pi-coding-agent 由本仓提供（fork 自身）。测试时需将该
			// specifier 别名到 src/index.ts，否则 vitest 无法解析扩展源码的 import。
			"@earendil-works/pi-coding-agent": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
		},
	},
	test: {
		globals: true,
		environment: "node",
		env: {
			// 测试环境禁用内置精选扩展，避免 rtk-optimizer 的 tool_call/tool_result
			// 钩子改变 AgentSession 与 resource-loader 测试的行为预期。
			PI_DISABLE_CURATED_EXTENSIONS: "1",
		},
		testTimeout: 30000,
		reporters: process.env.GITHUB_ACTIONS ? ["dot", "github-actions"] : ["dot"],
		silent: "passed-only",
		server: {
			deps: {
				external: [/@silvia-odwyer\/photon-node/],
				// pi-tui-kit 以 dist 形态引用旧包名 @earendil-works/pi-coding-agent；
				// inline 后由 vite 转换其产物，上述 alias 才能将其解析到本仓 src/index.ts，
				// 否则任何导入 sdk.ts / resource-loader 的测试都会在模块解析阶段失败。
				inline: [/@narumitw\/pi-tui-kit/],
			},
		},
	},
});
