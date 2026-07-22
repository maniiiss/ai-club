import { defineConfig } from "vitest/config";

// GitPilot CLI 二开配置：fork 自 pi-coding-agent，依赖 @earendil-works/* 通过 node_modules 解析，
// 不再使用 pi-mono monorepo 的 sibling src 别名。
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000,
		reporters: process.env.GITHUB_ACTIONS ? ["dot", "github-actions"] : ["dot"],
		silent: "passed-only",
		server: {
			deps: {
				external: [/@silvia-odwyer\/photon-node/],
			},
		},
	},
});
