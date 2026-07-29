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
	/** 平台用户中心配置的头像地址，允许为空。 */
	avatarUrl?: string;
}

export interface CliTokenResult {
	accessToken: string;
	expiresAt: string;
	user: CliUser;
	scopes: string[];
}

/** 当前 CLI 用户的积分账户摘要，仅供桌面端展示余额，不提供任何扣减能力。 */
export interface CliCreditAccount {
	balance: number;
}

export type CliProvider = "OPENAI" | "ANTHROPIC";

export interface CliModel {
	id: number;
	name: string;
	provider: CliProvider;
	modelName: string;
	description?: string;
	openaiApiMode?: string;
	/** 平台配置的上下文窗口长度（token），未配置时为 undefined，toModelConfig 回退默认。 */
	contextLength?: number;
	/** 平台配置的最大输出 token 数，未配置时为 undefined，toModelConfig 回退默认。 */
	maxOutputTokens?: number;
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

/** 读取当前 CLI 用户的积分余额，复用平台既有的只读积分接口。 */
export const getCurrentCreditAccount = (platformUrl: string, token: string) =>
	requestJson<CliCreditAccount>(platformUrl, "/api/cli/me/credits", { token });

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

/** 平台分页响应（与后端 PageResponse<T> 对应）。 */
export interface PageResponse<T> {
	records: T[];
	total: number;
	page: number;
	size: number;
	totalPages: number;
}

/** CLI 需求列表项（与后端 CliDtos.CliTaskSummary 对应）。 */
export interface CliTaskSummary {
	id: number;
	workItemCode: string;
	name: string;
	status: string;
	priority: string | null;
	assignee: string | null;
	taskType: string | null;
	projectId: number | null;
	projectName: string | null;
	iterationId: number | null;
	iterationName: string | null;
	planStartDate: string | null;
	planEndDate: string | null;
	requirementMarkdown: string | null;
}

/** /requirement 命令查询参数（首版仅交互式使用，全部可空）。 */
export interface ListMyTasksParams {
	page?: number;
	size?: number;
	status?: string;
	priority?: string;
	projectId?: number;
	keyword?: string;
}

/** 列出当前 CLI 用户负责的需求（workItemType=需求）。 */
export const listMyTasks = (platformUrl: string, token: string, params: ListMyTasksParams = {}) => {
	const query = new URLSearchParams();
	if (params.page != null) query.set("page", String(params.page));
	if (params.size != null) query.set("size", String(params.size));
	if (params.status) query.set("status", params.status);
	if (params.priority) query.set("priority", params.priority);
	if (params.projectId != null) query.set("projectId", String(params.projectId));
	if (params.keyword) query.set("keyword", params.keyword);
	const qs = query.toString();
	return requestJson<PageResponse<CliTaskSummary>>(platformUrl, `/api/cli/tasks${qs ? `?${qs}` : ""}`, { token });
};
