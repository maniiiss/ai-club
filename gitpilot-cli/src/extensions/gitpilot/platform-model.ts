/**
 * GitPilot 平台模型网关内置 extension。
 * 业务意图：把平台已配置的 CHAT 模型注册为自定义 provider，推理时用 gpt_ token 签发短期 gms_ 模型会话，
 * 再把请求改写到平台模型代理（OpenAI/Anthropic 兼容），使本地 gitpilot 复用平台模型治理与用量统计。
 */
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderModelConfig } from "../../core/extensions/types.ts";
import { openBrowser } from "../../utils/open-browser.ts";
import { getCachedCliToken, loadCliToken, saveCliToken } from "./credentials.ts";
import { getPlatformUrl, setPlatformUrl } from "./config.ts";
import {
	createDeviceAuthorization,
	listModels,
	type CliModel,
	PlatformApiError,
	pollDeviceToken,
} from "./api.ts";
import { ensureModelSession } from "./session-cache.ts";

export const GITPILOT_PROVIDER_ID = "gitpilot";

// 平台模型清单的进程内缓存。
// pi-ai 的 refresh 正常成功时只调一次 refreshModels(allowNetwork=true)；
// 仅当首次拉取抛异常时，才会在 catch 分支再调一次 allowNetwork=false 做 cache restoration。
// 此缓存保证异常恢复与 cache-only 调用都能返回上次拉到的模型，避免清空已就绪清单。
let cachedPlatformModels: ProviderModelConfig[] = [];
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;

// applyExtension（provider-composer）校验自定义 models 必填 baseUrl，否则抛
// "baseUrl is required when defining custom models" 而丢弃全部模型。
// streamGitPilotPlatform 实际用会话 proxyBaseUrl 覆盖 model.baseUrl，这里仅占位满足校验。
const GITPILOT_BASE_URL_PLACEHOLDER = "http://gitpilot.platform.local";

// 诊断日志：写 %TEMP%/gitpilot-debug.log，便于定位 refreshModels / applyExtension 链路。
// 仅二开调试用，正式发布前移除。
const DEBUG_LOG_PATH = join(tmpdir(), "gitpilot-debug.log");
function debugLog(message: string): void {
	try {
		appendFileSync(DEBUG_LOG_PATH, `[${new Date().toISOString()}] ${message}\n`);
	} catch {
		// 日志失败不影响主流程
	}
}

/** 已知支持推理（reasoning）的平台模型能力配置，复刻 pi-ai 原生 provider catalog（见 providers/data/deepseek.json）。
 *  平台 provider 名为 gitpilot、baseUrl 为代理地址，pi-ai 不会自动识别为 deepseek，故需在此显式声明
 *  reasoning + deepseek thinkingFormat，同时保留 supportsDeveloperRole:false 以走 system role，避免平台 400。 */
interface ReasoningProfile {
	reasoning: true;
	thinkingLevelMap: { minimal: null; low: null; medium: null; high: string; max: string };
	compat: {
		supportsStore: false;
		supportsDeveloperRole: false;
		requiresReasoningContentOnAssistantMessages: true;
		thinkingFormat: "deepseek";
	};
}

const REASONING_MODEL_PROFILES: Record<string, ReasoningProfile> = {
	// DeepSeek V4 系列：原生即 reasoning，仅支持 off/high/max（minimal/low/medium 不支持，置 null）。
	"deepseek-v4-flash": {
		reasoning: true,
		thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" },
		compat: { supportsStore: false, supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek" },
	},
	"deepseek-v4-pro": {
		reasoning: true,
		thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" },
		compat: { supportsStore: false, supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek" },
	},
};

/** 按平台模型名（modelName，大小写不敏感）解析推理能力配置；未命中返回 undefined，调用方按非推理模型处理。 */
export function resolveReasoningProfile(modelName: string | undefined | null): ReasoningProfile | undefined {
	const key = (modelName ?? "").trim().toLowerCase();
	return key ? REASONING_MODEL_PROFILES[key] : undefined;
}

/** 把平台模型配置映射为 pi provider 模型条目；api 按 provider 决定走 openai-completions 或 anthropic-messages。 */
function toModelConfig(model: CliModel): ProviderModelConfig {
	const api: Api = model.provider === "ANTHROPIC" ? "anthropic-messages" : "openai-completions";
	// 命中推理能力映射表的模型按 pi-ai 原生配置启用思考（reasoning + deepseek thinkingFormat + system role）；
	// 其余平台模型保持 reasoning:false，避免向不支持思考的模型发送 reasoning/thinking 参数。
	const profile = resolveReasoningProfile(model.modelName);
	return {
		// id 用平台数据库 ID（streamSimple 据此 Number(id) 调 createModelSession）。
		id: String(model.id),
		// 显示名优先取平台 name，缺失则回退到实际模型标识，避免 /model 列表全部显示 provider 名。
		name: model.name?.trim() || model.modelName?.trim() || String(model.id),
		api,
		// applyExtension 必填；streamSimple 实际用会话 proxyBaseUrl 覆盖。
		baseUrl: GITPILOT_BASE_URL_PLACEHOLDER,
		reasoning: profile?.reasoning ?? false,
		thinkingLevelMap: profile?.thinkingLevelMap,
		compat: profile?.compat,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: model.contextLength ?? DEFAULT_CONTEXT_WINDOW,
		maxTokens: model.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
	};
}

async function resolveCliToken(): Promise<string | undefined> {
	const platformUrl = getPlatformUrl();
	if (!platformUrl) return getCachedCliToken();
	return (getCachedCliToken(platformUrl) ?? (await loadCliToken(platformUrl))) ?? undefined;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 平台设备授权登录流程，对接 Pi 原生 /login。
 * 业务意图：通过平台 /api/cli/device/* 走设备授权，拿到长期 gpt_ token 后存入系统凭据库，
 * 同时以 OAuthCredentials 形式返回给 Pi，使平台作为登录项出现在 /login 列表。
 * gpt_ token 长期有效，refreshToken 为 no-op；推理时仍由 streamSimple 用 gpt_ 换短期 gms_ 会话。
 */
async function loginPlatform(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
	let platformUrl = getPlatformUrl();
	if (!platformUrl) {
		const input = await callbacks.onPrompt({
			message: "请输入 AI Club 平台地址",
			placeholder: "https://gitpilot.example.com",
		});
		const trimmed = input?.trim();
		if (!trimmed) throw new Error("未提供平台地址");
		platformUrl = setPlatformUrl(trimmed);
	}

	const authorization = await createDeviceAuthorization(platformUrl);
	callbacks.onDeviceCode({
		userCode: authorization.userCode,
		verificationUri: authorization.verificationUri,
		intervalSeconds: authorization.intervalSeconds,
		expiresInSeconds: authorization.expiresInSeconds,
	});
	try {
		await openBrowser(authorization.verificationUri);
	} catch {
		callbacks.onProgress?.(`无法自动打开浏览器，请手动访问：${authorization.verificationUri}`);
	}

	const deadline = Date.now() + authorization.expiresInSeconds * 1000;
	while (Date.now() < deadline) {
		if (callbacks.signal?.aborted) throw new Error("登录已取消");
		await sleep(authorization.intervalSeconds * 1000);
		if (callbacks.signal?.aborted) throw new Error("登录已取消");
		try {
			const result = await pollDeviceToken(platformUrl, authorization.deviceCode);
			await saveCliToken(platformUrl, result.accessToken);
			callbacks.onProgress?.(`登录成功：${result.user.nickname || result.user.username}`);
			return {
				access: result.accessToken,
				refresh: result.accessToken,
				expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
			};
		} catch (error) {
			// 428=授权等待中，429=slow_down，400=继续轮询；其余（如 410 已过期）直接抛出
			if (error instanceof PlatformApiError && [400, 428, 429].includes(error.status)) continue;
			throw error;
		}
	}
	throw new Error("设备授权已过期，请重新执行 /login");
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
			debugLog(`refreshModels start allowNetwork=${context.allowNetwork} aborted=${context.signal?.aborted === true} cachedLen=${cachedPlatformModels.length}`);
			// 优先从 pi 的持久化 ModelsStore 读取，重启后 allowNetwork=false 也能复用上次拉到的模型，
			// 避免模块级 cachedPlatformModels 重置为空导致启动时无模型。
			let storedModels: ProviderModelConfig[] = [];
			try {
				const entry = await context.store.read();
				storedModels = (entry?.models ?? []) as unknown as ProviderModelConfig[];
			} catch (error) {
				debugLog(`refreshModels store.read error: ${error instanceof Error ? error.message : String(error)}`);
			}
			// cache-only（allowNetwork=false）或被中断时：优先用 store 持久化模型，回退到进程缓存。
			if (!context.allowNetwork || context.signal?.aborted) {
				const result = storedModels.length > 0 ? storedModels : cachedPlatformModels;
				debugLog(`refreshModels cache-only return store=${storedModels.length} cached=${cachedPlatformModels.length} -> ${result.length}`);
				return result;
			}
			const platformUrl = getPlatformUrl();
			if (!platformUrl) {
				debugLog(`refreshModels no platformUrl, return cached len=${cachedPlatformModels.length}`);
				return cachedPlatformModels;
			}
			const cliToken = getCachedCliToken(platformUrl) ?? (await loadCliToken(platformUrl));
			if (!cliToken) {
				debugLog(`refreshModels no cliToken, return cached len=${cachedPlatformModels.length}`);
				return cachedPlatformModels;
			}
			try {
				const models = await listModels(platformUrl, cliToken);
				cachedPlatformModels = models.map(toModelConfig);
				// 持久化到 pi 的 ModelsStore，重启后 allowNetwork=false 可直接复用，避免启动时无模型。
				try {
					await context.store.write({
						models: cachedPlatformModels as unknown as Model<Api>[],
						checkedAt: Date.now(),
					});
				} catch (error) {
					debugLog(`refreshModels store.write error: ${error instanceof Error ? error.message : String(error)}`);
				}
				debugLog(`refreshModels listModels ok n=${models.length} returnLen=${cachedPlatformModels.length} firstBaseUrl=${cachedPlatformModels[0]?.baseUrl ?? "(none)"} storeWritten`);
				return cachedPlatformModels;
			} catch (error) {
				// 拉取失败时优先用 store 持久化模型，回退到进程缓存，避免清空已就绪的平台模型。
				debugLog(`refreshModels listModels error: ${error instanceof Error ? error.message : String(error)}`);
				return storedModels.length > 0 ? storedModels : cachedPlatformModels;
			}
		},
		streamSimple: streamGitPilotPlatform,
		// 平台作为 OAuth 登录项接入 Pi 原生 /login：login 走设备授权，gpt_ token 长期有效故 refresh 为 no-op。
		oauth: {
			name: "GitPilot 平台",
			async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
				return loginPlatform(callbacks);
			},
			async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
				return credentials;
			},
			getApiKey(credentials: OAuthCredentials): string {
				return credentials.access;
			},
		},
	});
}
