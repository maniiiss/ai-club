/**
 * GitPilot 平台模型网关内置 extension。
 * 业务意图：把平台已配置的 CHAT 模型注册为自定义 provider，推理时用 gpt_ token 签发短期 gms_ 模型会话，
 * 再把请求改写到平台模型代理（OpenAI/Anthropic 兼容），使本地 gitpilot 复用平台模型治理与用量统计。
 */
import {
	anthropicMessagesApi,
	type Api,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	type Model,
	openAICompletionsApi,
	type RefreshModelsContext,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ProviderModelConfig } from "../../core/extensions/types.ts";
import { getCachedCliToken, loadCliToken } from "./credentials.ts";
import { getPlatformUrl } from "./config.ts";
import { listModels, type CliModel } from "./api.ts";
import { ensureModelSession } from "./session-cache.ts";

export const GITPILOT_PROVIDER_ID = "gitpilot";
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;

/** 把平台模型配置映射为 pi provider 模型条目；api 按 provider 决定走 openai-completions 或 anthropic-messages。 */
function toModelConfig(model: CliModel): ProviderModelConfig {
	const api: Api = model.provider === "ANTHROPIC" ? "anthropic-messages" : "openai-completions";
	return {
		id: String(model.id),
		name: model.name,
		api,
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: DEFAULT_CONTEXT_WINDOW,
		maxTokens: DEFAULT_MAX_TOKENS,
	};
}

async function resolveCliToken(): Promise<string | undefined> {
	const platformUrl = getPlatformUrl();
	if (!platformUrl) return getCachedCliToken();
	return (getCachedCliToken() ?? (await loadCliToken(platformUrl))) ?? undefined;
}

/**
 * 平台模型流式推理：确保有效模型会话后，把 baseUrl 改写为平台代理地址、apiKey 换成 gms_ 会话令牌，
 * 委托 pi-ai 原生流式器（OpenAI 走 /chat/completions，Anthropic 走 /messages）。
 */
function streamGitPilotPlatform(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const stream = createAssistantMessageEventStream();

	void (async () => {
		try {
			const platformUrl = getPlatformUrl();
			if (!platformUrl) throw new Error("未配置平台地址，请先执行 /login");
			const cliToken = await resolveCliToken();
			if (!cliToken) throw new Error("尚未登录，请先执行 /login");

			const modelConfigId = Number(model.id);
			if (!Number.isInteger(modelConfigId) || modelConfigId <= 0) {
				throw new Error(`非法的平台模型 ID：${model.id}`);
			}

			const session = await ensureModelSession(platformUrl, cliToken, modelConfigId);
			const modelWithBaseUrl = { ...model, baseUrl: session.proxyBaseUrl };
			const streamOptions = { ...options, apiKey: session.accessToken };

			const api = (model.api ?? "openai-completions") as Api;
			const innerStream =
				api === "anthropic-messages"
					? anthropicMessagesApi().streamSimple(
							modelWithBaseUrl as Model<"anthropic-messages">,
							context,
							streamOptions,
						)
					: openAICompletionsApi().streamSimple(
							modelWithBaseUrl as Model<"openai-completions">,
							context,
							streamOptions,
						);

			for await (const event of innerStream) stream.push(event);
			stream.end();
		} catch (error) {
			stream.push({
				type: "error",
				reason: "error",
				error: {
					role: "assistant",
					content: [],
					api: model.api,
					provider: model.provider,
					model: model.id,
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: "error",
					errorMessage: error instanceof Error ? error.message : String(error),
					timestamp: Date.now(),
				},
			});
			stream.end();
		}
	})();

	return stream;
}

/** 平台模型 extension 工厂：注册 gitpilot provider 并在刷新时拉取平台模型清单。 */
export function platformModelExtension(pi: ExtensionAPI): void {
	pi.registerProvider(GITPILOT_PROVIDER_ID, {
		name: "GitPilot Platform",
		// gpt_ token 通过 ${GITPILOT_CLI_TOKEN} 解析；登录后由 credentials 装入环境。
		apiKey: "${GITPILOT_CLI_TOKEN}",
		api: "openai-completions",
		models: [],
		refreshModels: async (context: RefreshModelsContext): Promise<ProviderModelConfig[]> => {
			if (!context.allowNetwork || context.signal?.aborted) return [];
			const platformUrl = getPlatformUrl();
			if (!platformUrl) return [];
			const cliToken = getCachedCliToken() ?? (await loadCliToken(platformUrl));
			if (!cliToken) return [];
			try {
				const models = await listModels(platformUrl, cliToken);
				return models.map(toModelConfig);
			} catch {
				return [];
			}
		},
		streamSimple: streamGitPilotPlatform,
	});
}
