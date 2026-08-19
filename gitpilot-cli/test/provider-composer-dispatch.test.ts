import type { Api, AssistantMessage, Context, Model, Provider } from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { ModelConfig } from "../src/core/model-config.ts";
import { composeModelProvider } from "../src/core/provider-composer.ts";

/**
 * 覆盖 provider-composer 的流分发（streamWith）逻辑：
 * - 纯扩展 provider（无内置 base，例如 gitpilot 平台网关）的全部模型都应走扩展自己的
 *   streamSimple，无论 model.api 是否等于 extension.api。
 * - 覆盖内置 provider（base 存在）时，api 不匹配扩展声明的模型仍走 base，不受此改动影响。
 * 背景：gitpilot 扩展声明 api="openai-completions"，但 ANTHROPIC 平台模型的 api 是
 * "anthropic-messages"，旧分发条件漏判导致其被交到 pi-ai 内置客户端、用占位 baseUrl 请求而失败。
 */

const emptyContext: Context = { messages: [] };

function baseModel(api: Api, id: string): Model<Api> {
	return {
		id,
		name: id,
		provider: "test-prov",
		api,
		baseUrl: "http://placeholder.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 8192,
	};
}

function doneStream(providerId: string, text: string): ReturnType<typeof createAssistantMessageEventStream> {
	const stream = createAssistantMessageEventStream();
	const message: AssistantMessage = {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages",
		provider: providerId,
		model: "test",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		timestamp: Date.now(),
	};
	stream.end(message);
	return stream;
}

async function result(stream: { result(): Promise<AssistantMessage> }): Promise<AssistantMessage> {
	return await stream.result();
}

describe("provider-composer streamWith 分发", () => {
	it("纯扩展 provider：ANTHROPIC 协议模型走到扩展自己的 streamSimple（修复的核心场景）", async () => {
		const modelConfig = await ModelConfig.load(undefined);
		const model = { ...baseModel("anthropic-messages", "claude-opus-4-8"), provider: "gitpilot-test" };
		const provider = composeModelProvider(
			"gitpilot-test",
			undefined,
			modelConfig,
			{
				name: "GitPilot Test",
				// 扩展声明的 api，与平台上 ANTHROPIC 模型的 api 不一致，正是旧逻辑漏判的原因。
				api: "openai-completions",
				apiKey: "test-key",
				models: [model],
				streamSimple: (_m, _c, _o) => doneStream("gitpilot-test", "走扩展 streamSimple"),
			},
		);

		const message = await result(provider.streamSimple(model, emptyContext, {}));
		expect(message.provider).toBe("gitpilot-test");
		expect(message.content[0]?.type).toBe("text");
		expect((message.content[0] as { type: "text"; text: string }).text).toBe("走扩展 streamSimple");
	});

	it("纯扩展 provider：OpenAI 协议模型同样走扩展自己的 streamSimple", async () => {
		const modelConfig = await ModelConfig.load(undefined);
		const model = { ...baseModel("openai-completions", "gpt-test"), provider: "gitpilot-test" };
		const provider = composeModelProvider(
			"gitpilot-test",
			undefined,
			modelConfig,
			{
				api: "openai-completions",
				apiKey: "test-key",
				models: [model],
				streamSimple: (_m, _c, _o) => doneStream("gitpilot-test", "openai 也走扩展"),
			},
		);

		const message = await result(provider.streamSimple(model, emptyContext, {}));
		expect((message.content[0] as { type: "text"; text: string }).text).toBe("openai 也走扩展");
	});

	it("覆盖内置 provider 且 base 存在时：api 不匹配扩展声明的模型仍走 base，不受改动影响", async () => {
		const modelConfig = await ModelConfig.load(undefined);
		const anthropicModel = baseModel("anthropic-messages", "claude-sonnet-4-5");
		// 内置 base provider 只有 anthropic-messages 模型；扩展声明 api="openai-completions" 并带 streamSimple。
		const base: Provider = {
			id: "test-prov",
			name: "Base Provider",
			baseUrl: "http://base.invalid",
			auth: { apiKey: { name: "key", resolve: async () => ({ auth: { apiKey: "k" }, source: "base" }) } },
			getModels: () => [anthropicModel],
			stream: () => {
				throw new Error("base stream");
			},
			streamSimple: () => {
				throw new Error("base streamSimple");
			},
		};
		const provider = composeModelProvider(
			"test-prov",
			base,
			modelConfig,
			{
				api: "openai-completions",
				apiKey: "ext-key",
				models: [baseModel("openai-completions", "gpt-ext")],
				streamSimple: (_m, _c, _o) => {
					throw new Error("extension streamSimple");
				},
			},
		);

		// anthropic 模型与扩展 api 不匹配且 base 存在 -> 应走 base，而不是扩张到扩展。
		// base.streamSimple 抛错会被 lazyStream 转成一条 error 消息返回（而非 reject）。
		const message = await result(provider.streamSimple(anthropicModel, emptyContext, {}));
		expect(message.stopReason).toBe("error");
		expect(message.errorMessage).toBe("base streamSimple");
		expect(message.provider).toBe("test-prov");
	});
});