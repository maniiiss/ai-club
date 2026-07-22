/**
 * AI Club 平台 CLI HTTP 客户端。
 * 业务意图：封装设备授权、模型会话签发与平台查询，统一解包 {success,message,data} 响应包络。
 */
export const CLI_CLIENT_VERSION = "0.1.0";

export interface DeviceAuthorization {
	deviceCode: string;
	userCode: string;
	verificationUri: string;
	expiresInSeconds: number;
	intervalSeconds: number;
}

export interface CliUser {
	id: number;
	username: string;
	nickname?: string;
}

export interface CliTokenResult {
	accessToken: string;
	expiresAt: string;
	user: CliUser;
	scopes: string[];
}

export type CliProvider = "OPENAI" | "ANTHROPIC";

export interface CliModel {
	id: number;
	name: string;
	provider: CliProvider;
	modelName: string;
	description?: string;
	openaiApiMode?: string;
}

export interface ModelSession {
	sessionId: string;
	accessToken: string;
	expiresAt: string;
	provider: CliProvider;
	modelName: string;
	proxyBaseUrl: string;
}

export class PlatformApiError extends Error {
	readonly status: number;
	readonly code?: string;
	constructor(status: number, message: string, code?: string) {
		super(message);
		this.name = "PlatformApiError";
		this.status = status;
		this.code = code;
	}
}

interface PlatformResponse<T> {
	success?: boolean;
	message?: string;
	data?: T;
}

interface RequestOptions {
	method?: string;
	body?: unknown;
	token?: string;
}

/** 发起平台请求并解包响应包络；非 2xx 或 success=false 抛 PlatformApiError。 */
export async function requestJson<T>(platformUrl: string, path: string, options: RequestOptions = {}): Promise<T> {
	const headers: Record<string, string> = { accept: "application/json" };
	if (options.body !== undefined) headers["content-type"] = "application/json";
	if (options.token) headers.authorization = `Bearer ${options.token}`;

	const response = await fetch(`${platformUrl}${path}`, {
		method: options.method ?? "GET",
		headers,
		body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
	});
	const text = await response.text();
	let parsed: PlatformResponse<T>;
	try {
		parsed = text ? (JSON.parse(text) as PlatformResponse<T>) : {};
	} catch {
		throw new PlatformApiError(response.status, `平台返回非 JSON 响应：${text.slice(0, 200)}`);
	}
	if (!response.ok || parsed.success === false) {
		const code = (parsed as { code?: string }).code;
		throw new PlatformApiError(response.status, parsed.message || `平台请求失败：${response.status}`, code);
	}
	return parsed.data as T;
}

export const createDeviceAuthorization = (platformUrl: string) =>
	requestJson<DeviceAuthorization>(platformUrl, "/api/cli/device/authorizations", {
		method: "POST",
		body: { clientVersion: CLI_CLIENT_VERSION },
	});

/** 轮询设备令牌；pending 返回 status 428，expired 返回 410，由调用方按状态判断。 */
export const pollDeviceToken = (platformUrl: string, deviceCode: string) =>
	requestJson<CliTokenResult>(platformUrl, "/api/cli/device/token", {
		method: "POST",
		body: { deviceCode },
	});

export const getCurrentUser = (platformUrl: string, token: string) =>
	requestJson<CliUser>(platformUrl, "/api/cli/me", { token });

export const revokeCliToken = (platformUrl: string, token: string) =>
	requestJson<void>(platformUrl, "/api/cli/logout", { method: "POST", token });

export const listModels = (platformUrl: string, token: string) =>
	requestJson<CliModel[]>(platformUrl, "/api/cli/models", { token });

export const createModelSession = (platformUrl: string, token: string, modelConfigId: number) =>
	requestJson<ModelSession>(platformUrl, "/api/cli/model-sessions", {
		method: "POST",
		body: { modelConfigId, clientVersion: CLI_CLIENT_VERSION },
		token,
	});
