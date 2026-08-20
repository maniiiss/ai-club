/**
 * L1: 9router 代理感知 + 图片透传 单元测试
 *
 * 覆盖点：
 * - isNineRouterProxied 对默认 host 与环境变量扩展 host 的判定
 * - modelFromJson：provider/model 级别 visionRouting 声明 + 9router baseUrl → 注入 image 能力
 * - applyModelOverride：override 级别 visionRouting 声明 → 注入 image 能力
 * - 非 9router baseUrl / visionRouting 未声明 / 原生 input 含 image 的边界场景
 *
 * 详见 docs/design-docs/gitpilot-image-vision-fallback-technical-design-v1.md L1。
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelConfig } from "../src/core/model-config.ts";
import { composeModelProvider } from "../src/core/provider-composer.ts";
import { isNineRouterProxied } from "../src/core/provider-attribution.ts";

const NINEROUTER_BASE_URL = "http://localhost:20128/v1";
const NON_NINEROUTER_BASE_URL = "http://api.example.com/v1";

let tempDir: string;

beforeEach(async () => {
	tempDir = await mkdtemp(join(tmpdir(), "ninerouter-test-"));
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

/** 写入临时 models.json 并加载为 ModelConfig */
async function loadConfig(providers: object): Promise<ModelConfig> {
	const path = join(tempDir, "models.json");
	await writeFile(path, JSON.stringify({ providers }), "utf-8");
	return ModelConfig.load(path);
}

/** 构造一个 9router provider 配置 */
function ninerouterProvider(overrides: object = {}): object {
	return {
		baseUrl: NINEROUTER_BASE_URL,
		apiKey: "test-key",
		models: [
			{
				id: "test-model",
				name: "Test Model",
				api: "openai-completions",
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
		],
		...overrides,
	};
}

/** 获取 provider 下指定 id 的 model */
function getModel(provider: ReturnType<typeof composeModelProvider>, modelId: string) {
	const model = provider.getModels().find((m) => m.id === modelId);
	if (!model) throw new Error(`Model ${modelId} not found`);
	return model;
}

describe("isNineRouterProxied", () => {
	it("localhost:20128 → true", () => {
		expect(isNineRouterProxied("http://localhost:20128/v1")).toBe(true);
	});

	it("localhost 其他端口 → false", () => {
		expect(isNineRouterProxied("http://localhost:3000/v1")).toBe(false);
	});

	it("非 localhost → false", () => {
		expect(isNineRouterProxied("https://api.openai.com/v1")).toBe(false);
	});

	it("非法 URL → false", () => {
		expect(isNineRouterProxied("not-a-url")).toBe(false);
	});

	it("GITPILOT_NINEROUTER_HOSTS 扩展的 host → true", () => {
		process.env.GITPILOT_NINEROUTER_HOSTS = "192.168.1.100:20128,internal.9router.local:20128";
		try {
			expect(isNineRouterProxied("http://192.168.1.100:20128/v1")).toBe(true);
			expect(isNineRouterProxied("http://internal.9router.local:20128/v1")).toBe(true);
		} finally {
			delete process.env.GITPILOT_NINEROUTER_HOSTS;
		}
	});
});

describe("L1 visionRouting 注入", () => {
	it("provider 级别 visionRouting:true + 9router baseUrl → input 含 image", async () => {
		const config = await loadConfig({
			"9router": ninerouterProvider({ visionRouting: true }),
		});
		const provider = composeModelProvider("9router", undefined, config, { apiKey: "test-key" });
		const model = getModel(provider, "test-model");
		expect(model.input).toContain("image");
	});

	it("model 级别 visionRouting:true + 9router baseUrl → input 含 image", async () => {
		const config = await loadConfig({
			"9router": ninerouterProvider({
				models: [
					{
						id: "test-model",
						name: "Test Model",
						api: "openai-completions",
						input: ["text"],
						visionRouting: true,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128000,
						maxTokens: 8192,
					},
				],
			}),
		});
		const provider = composeModelProvider("9router", undefined, config, { apiKey: "test-key" });
		const model = getModel(provider, "test-model");
		expect(model.input).toContain("image");
	});

	it("visionRouting:true + 非 9router baseUrl → input 不含 image", async () => {
		const config = await loadConfig({
			"other": {
				baseUrl: NON_NINEROUTER_BASE_URL,
				apiKey: "test-key",
				visionRouting: true,
				models: [
					{
						id: "test-model",
						name: "Test Model",
						api: "openai-completions",
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128000,
						maxTokens: 8192,
					},
				],
			},
		});
		const provider = composeModelProvider("other", undefined, config, { apiKey: "test-key" });
		const model = getModel(provider, "test-model");
		expect(model.input).not.toContain("image");
	});

	it("visionRouting 未声明 + 9router baseUrl → input 不含 image", async () => {
		const config = await loadConfig({ "9router": ninerouterProvider() });
		const provider = composeModelProvider("9router", undefined, config, { apiKey: "test-key" });
		const model = getModel(provider, "test-model");
		expect(model.input).not.toContain("image");
	});

	it("原生 input 已含 image + visionRouting:true → 不重复注入", async () => {
		const config = await loadConfig({
			"9router": ninerouterProvider({
				visionRouting: true,
				models: [
					{
						id: "vision-model",
						name: "Vision Model",
						api: "openai-completions",
						input: ["text", "image"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128000,
						maxTokens: 8192,
					},
				],
			}),
		});
		const provider = composeModelProvider("9router", undefined, config, { apiKey: "test-key" });
		const model = getModel(provider, "vision-model");
		expect(model.input).toEqual(["text", "image"]);
	});

	it("model 级别 visionRouting:false 覆盖 provider 级别 visionRouting:true", async () => {
		const config = await loadConfig({
			"9router": ninerouterProvider({
				visionRouting: true,
				models: [
					{
						id: "test-model",
						name: "Test Model",
						api: "openai-completions",
						input: ["text"],
						visionRouting: false,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128000,
						maxTokens: 8192,
					},
				],
			}),
		});
		const provider = composeModelProvider("9router", undefined, config, { apiKey: "test-key" });
		const model = getModel(provider, "test-model");
		expect(model.input).not.toContain("image");
	});
});

describe("L1 modelOverrides visionRouting 注入", () => {
	it("override.visionRouting:true + 9router baseUrl → input 含 image", async () => {
		const config = await loadConfig({
			"9router": {
				baseUrl: NINEROUTER_BASE_URL,
				apiKey: "test-key",
				models: [
					{
						id: "test-model",
						name: "Test Model",
						api: "openai-completions",
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128000,
						maxTokens: 8192,
					},
				],
				modelOverrides: {
					"test-model": { visionRouting: true },
				},
			},
		});
		const provider = composeModelProvider("9router", undefined, config, { apiKey: "test-key" });
		const model = getModel(provider, "test-model");
		expect(model.input).toContain("image");
	});

	it("override.visionRouting:true + 非 9router baseUrl → input 不含 image", async () => {
		const config = await loadConfig({
			"other": {
				baseUrl: NON_NINEROUTER_BASE_URL,
				apiKey: "test-key",
				models: [
					{
						id: "test-model",
						name: "Test Model",
						api: "openai-completions",
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128000,
						maxTokens: 8192,
					},
				],
				modelOverrides: {
					"test-model": { visionRouting: true },
				},
			},
		});
		const provider = composeModelProvider("other", undefined, config, { apiKey: "test-key" });
		const model = getModel(provider, "test-model");
		expect(model.input).not.toContain("image");
	});
});
