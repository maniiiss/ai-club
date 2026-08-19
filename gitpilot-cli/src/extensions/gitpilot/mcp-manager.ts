/**
 * GitPilot MCP 配置与模式分配。
 *
 * 连接定义遵循通用 MCP JSON 格式；模式分配单独保存，避免把凭据和 UI 权限耦合在一起。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getAgentDir } from "../../config.ts";

export type GitPilotAgentMode = "code" | "work" | "design";
export const GITPILOT_AGENT_MODES: readonly GitPilotAgentMode[] = ["code", "work", "design"];
export type McpHttpTransport = "streamable-http" | "sse";
export type McpTransport = "stdio" | "http" | "sse" | "unknown";

/** JSON 脱敏占位符只在 sidecar 与 Desktop 之间传递，永远不会写入真实 MCP 配置。 */
export const MCP_REDACTED_VALUE = "__GITPILOT_REDACTED__";
export const DEFAULT_MCP_REQUEST_TIMEOUT_MS = 30_000;

export interface McpServerDefinition {
	command?: string;
	args?: string[];
	url?: string;
	env?: Record<string, string>;
	headers?: Record<string, string>;
	cwd?: string;
	httpTransport?: McpHttpTransport;
	requestTimeoutMs?: number;
	disabled?: boolean;
	[key: string]: unknown;
}

interface McpConfig { mcpServers: Record<string, McpServerDefinition>; settings?: Record<string, unknown> }
interface McpScopesFile { version: 1; servers: Record<string, GitPilotAgentMode[]> }

export interface ManagedMcpServer {
	name: string;
	source: "global" | "project" | "project-override";
	enabled: boolean;
	modes: GitPilotAgentMode[];
	/** 仅返回脱敏后的编辑副本，真实凭据始终留在 sidecar 配置文件中。 */
	definition: McpServerDefinition;
	transport: McpTransport;
}

function readJson(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {};
	const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`MCP 配置格式无效：${path}`);
	return parsed as Record<string, unknown>;
}

function serversOf(path: string): Record<string, McpServerDefinition> {
	const value = readJson(path).mcpServers;
	if (value === undefined) return {};
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`mcpServers 必须是对象：${path}`);
	return value as Record<string, McpServerDefinition>;
}

function paths(cwd: string, agentDir = getAgentDir()) {
	return {
		global: join(agentDir, "mcp.json"),
		project: join(resolve(cwd), ".mcp.json"),
		projectOverride: join(resolve(cwd), ".gitpilot", "mcp.json"),
		scopes: join(agentDir, "mcp-scopes.json"),
	};
}

function atomicWrite(path: string, value: object): void {
	mkdirSync(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	renameSync(temporary, path);
}

function readScopes(cwd: string, agentDir?: string): McpScopesFile {
	const raw = readJson(paths(cwd, agentDir).scopes);
	const input = raw.servers;
	if (!input || typeof input !== "object" || Array.isArray(input)) return { version: 1, servers: {} };
	const servers: Record<string, GitPilotAgentMode[]> = {};
	for (const [name, modes] of Object.entries(input as Record<string, unknown>)) {
		if (!Array.isArray(modes)) continue;
		servers[name] = modes.filter((mode): mode is GitPilotAgentMode => GITPILOT_AGENT_MODES.includes(mode as GitPilotAgentMode));
	}
	return { version: 1, servers };
}

/** 合并顺序与 GitPilot 的标准项目覆盖约定一致：全局 < .mcp.json < .gitpilot/mcp.json。 */
export function loadMcpConfiguration(cwd: string, agentDir?: string): McpConfig {
	const locations = paths(cwd, agentDir);
	return {
		mcpServers: { ...serversOf(locations.global), ...serversOf(locations.project), ...serversOf(locations.projectOverride) },
	};
}

/** 未分配的服务保守地仅用于 Code，防止 Work/Design 意外获得外部系统权限。 */
export function loadMcpConfigurationForMode(mode: GitPilotAgentMode, cwd: string, agentDir?: string): McpConfig {
	const config = loadMcpConfiguration(cwd, agentDir);
	const scopes = readScopes(cwd, agentDir);
	return {
		...config,
		mcpServers: Object.fromEntries(Object.entries(config.mcpServers).filter(([name]) => (scopes.servers[name] ?? ["code"]).includes(mode))),
	};
}

export function listManagedMcpServers(cwd: string, agentDir?: string): ManagedMcpServer[] {
	const locations = paths(cwd, agentDir);
	const byName = new Map<string, { definition: McpServerDefinition; source: ManagedMcpServer["source"] }>();
	for (const [source, path] of [["global", locations.global], ["project", locations.project], ["project-override", locations.projectOverride]] as const) {
		for (const [name, definition] of Object.entries(serversOf(path))) byName.set(name, { definition, source });
	}
	const scopes = readScopes(cwd, agentDir);
	return [...byName.entries()].map(([name, item]): ManagedMcpServer => ({
		name,
		source: item.source,
		enabled: item.definition.disabled !== true,
		modes: scopes.servers[name] ?? ["code"],
		definition: displayMcpServerDefinition(item.definition),
		transport: getMcpTransport(item.definition),
	})).sort((left, right) => left.name.localeCompare(right.name));
}

/** GitPilot 管理页只写全局 Pi 覆盖层，绝不改写共享或项目来源文件。 */
export function saveManagedMcpServer(
	cwd: string,
	name: string,
	definition: McpServerDefinition,
	modes: GitPilotAgentMode[],
	agentDir?: string,
	previousName?: string,
): void {
	if (typeof name !== "string" || !/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error("MCP 服务名只能包含字母、数字、点、下划线和短横线");
	if (!Array.isArray(modes) || modes.length === 0) throw new Error("至少需要选择一个 MCP 作用域");
	if (modes.some((mode) => !GITPILOT_AGENT_MODES.includes(mode))) throw new Error("MCP 作用域只能是 code、work 或 design");
	const locations = paths(cwd, agentDir);
	const config = readJson(locations.global);
	const servers = serversOf(locations.global);
	const sourceName = previousName?.trim() || name;
	const existing = servers[sourceName];
	const projectSource = serversOf(locations.project)[name] ?? serversOf(locations.projectOverride)[name];
	if (projectSource) throw new Error(`项目来源 MCP 服务只读，请先复制到全局：${name}`);
	// 先验证 RPC/CLI 的运行时输入，避免非法的 null、数组或字段类型在脱敏合并阶段产生原生 TypeError。
	const incomingDefinition = normalizeMcpServerDefinition(definition, { requireRedactedSource: existing !== undefined });
	const mergedDefinition = mergeRedactedSecrets(existing, incomingDefinition);
	const normalizedDefinition = normalizeMcpServerDefinition(mergedDefinition, { requireRedactedSource: existing !== undefined });
	if (sourceName !== name) {
		if (!existing) throw new Error(`只能重命名 GitPilot 全局 MCP 服务：${sourceName}`);
		if (servers[name] && name !== sourceName) throw new Error(`MCP 服务已存在：${name}`);
		delete servers[sourceName];
	}
	servers[name] = normalizedDefinition;
	atomicWrite(locations.global, { ...config, mcpServers: servers });
	const scopes = readScopes(cwd, agentDir);
	scopes.servers[name] = normalizeModes(modes.length > 0 ? modes : scopes.servers[sourceName] ?? ["code"]);
	if (sourceName !== name) delete scopes.servers[sourceName];
	atomicWrite(locations.scopes, scopes);
}

/** 将项目来源的有效定义复制为不会被项目同名配置遮蔽的全局服务。 */
export function copyManagedMcpServer(cwd: string, name: string, agentDir?: string): string {
	const locations = paths(cwd, agentDir);
	const projectOverride = serversOf(locations.projectOverride)[name];
	const project = serversOf(locations.project)[name];
	const global = serversOf(locations.global)[name];
	const source = projectOverride ?? project;
	if (!source && global) throw new Error(`只能复制项目来源 MCP 服务：${name}`);
	if (!source) throw new Error(`MCP 服务不存在：${name}`);
	const config = readJson(locations.global);
	const servers = serversOf(locations.global);
	const reservedNames = new Set([
		...Object.keys(servers),
		...Object.keys(serversOf(locations.project)),
		...Object.keys(serversOf(locations.projectOverride)),
	]);
	let targetName = `${name}-global`;
	let suffix = 2;
	while (reservedNames.has(targetName)) targetName = `${name}-global-${suffix++}`;
	servers[targetName] = normalizeMcpServerDefinition(source);
	atomicWrite(locations.global, { ...config, mcpServers: servers });
	const scopes = readScopes(cwd, agentDir);
	scopes.servers[targetName] = scopes.servers[name] ?? ["code"];
	atomicWrite(locations.scopes, scopes);
	return targetName;
}

export function deleteManagedMcpServer(cwd: string, name: string, agentDir?: string): void {
	const locations = paths(cwd, agentDir);
	const config = readJson(locations.global);
	const servers = assertGlobalManagedServer(cwd, name, agentDir, "删除");
	delete servers[name];
	atomicWrite(locations.global, { ...config, mcpServers: servers });
	const scopes = readScopes(cwd, agentDir);
	delete scopes.servers[name];
	atomicWrite(locations.scopes, scopes);
}

export function setManagedMcpModes(cwd: string, name: string, modes: GitPilotAgentMode[], agentDir?: string): void {
	if (!Array.isArray(modes) || modes.length === 0) throw new Error("至少需要选择一个 MCP 作用域");
	if (modes.some((mode) => !GITPILOT_AGENT_MODES.includes(mode))) throw new Error("MCP 作用域只能是 code、work 或 design");
	const locations = paths(cwd, agentDir);
	// 项目来源是团队/项目配置，Desktop 只能查看或复制；作用域调整必须落在全局副本上。
	assertGlobalManagedServer(cwd, name, agentDir, "调整作用域");
	const scopes = readScopes(cwd, agentDir);
	scopes.servers[name] = normalizeModes(modes);
	atomicWrite(locations.scopes, scopes);
}

/** 启停只写 GitPilot 全局覆盖层，避免修改团队共享的项目 MCP 定义。 */
export function setManagedMcpEnabled(cwd: string, name: string, enabled: boolean, agentDir?: string): void {
	if (typeof enabled !== "boolean") throw new Error("MCP enabled 必须是布尔值");
	const locations = paths(cwd, agentDir);
	const config = readJson(locations.global);
	const servers = assertGlobalManagedServer(cwd, name, agentDir, "启停");
	servers[name] = { ...servers[name], disabled: !enabled };
	atomicWrite(locations.global, { ...config, mcpServers: servers });
}

function normalizeModes(modes: GitPilotAgentMode[]): GitPilotAgentMode[] {
	return [...new Set(modes.filter((mode): mode is GitPilotAgentMode => GITPILOT_AGENT_MODES.includes(mode)))];
}

/** 列表响应补齐默认标准字段；配置本身若已损坏仍保留原定义，方便用户通过 JSON 模式修复。 */
function displayMcpServerDefinition(definition: McpServerDefinition): McpServerDefinition {
	try {
		return sanitizeMcpServerDefinition(normalizeMcpServerDefinition(definition, { requireRedactedSource: true }));
	} catch {
		return sanitizeMcpServerDefinition(definition);
	}
}

function assertGlobalManagedServer(cwd: string, name: string, agentDir: string | undefined, operation: string): Record<string, McpServerDefinition> {
	const locations = paths(cwd, agentDir);
	const servers = serversOf(locations.global);
	if (!servers[name] || serversOf(locations.project)[name] || serversOf(locations.projectOverride)[name]) throw new Error(`只能${operation}未被项目配置覆盖的 GitPilot 全局 MCP 服务：${name}`);
	return servers;
}

/** 根据标准 MCP 字段推导 Desktop 展示的传输类型。 */
export function getMcpTransport(definition: McpServerDefinition): McpTransport {
	if (typeof definition.command === "string" && definition.command.trim()) return "stdio";
	if (typeof definition.url === "string" && definition.url.trim()) return definition.httpTransport === "sse" ? "sse" : "http";
	return "unknown";
}

/** 校验并补齐标准 MCP 定义，保证表单和 JSON 编辑器落盘结果一致。 */
export function normalizeMcpServerDefinition(
	definition: McpServerDefinition,
	options: { requireRedactedSource?: boolean } = {},
): McpServerDefinition {
	if (!definition || typeof definition !== "object" || Array.isArray(definition)) throw new Error("MCP 服务定义必须是 JSON 对象");
	const normalized = { ...definition };
	if (normalized.command !== undefined && (typeof normalized.command !== "string" || !normalized.command.trim())) throw new Error("MCP command 必须是非空字符串");
	if (normalized.url !== undefined && (typeof normalized.url !== "string" || !normalized.url.trim())) throw new Error("MCP URL 必须是非空字符串");
	if (normalized.httpTransport !== undefined && normalized.httpTransport !== "streamable-http" && normalized.httpTransport !== "sse") throw new Error("HTTP MCP 传输类型只能是 streamable-http 或 sse");
	if (normalized.bearerToken !== undefined && typeof normalized.bearerToken !== "string") throw new Error("bearerToken 必须是字符串");
	if (normalized.oauth !== undefined && normalized.oauth !== false && (typeof normalized.oauth !== "object" || Array.isArray(normalized.oauth))) throw new Error("oauth 必须是对象或 false");
	if (normalized.disabled !== undefined && typeof normalized.disabled !== "boolean") throw new Error("MCP disabled 必须是布尔值");
	const hasCommand = typeof normalized.command === "string" && normalized.command.trim().length > 0;
	const hasUrl = typeof normalized.url === "string" && normalized.url.trim().length > 0;
	if (hasCommand === hasUrl) throw new Error("MCP 服务必须且只能配置 command 或 url");
	if (hasCommand && normalized.httpTransport !== undefined) throw new Error("stdio MCP 服务不能配置 HTTP 传输类型");
	if (normalized.args !== undefined) {
		if (!Array.isArray(normalized.args) || normalized.args.some((value) => typeof value !== "string")) throw new Error("MCP 参数必须是字符串数组");
	}
	if (normalized.env !== undefined) normalized.env = normalizeStringRecord(normalized.env, "环境变量", options.requireRedactedSource ?? false);
	if (normalized.headers !== undefined) normalized.headers = normalizeStringRecord(normalized.headers, "请求头", options.requireRedactedSource ?? false);
	if (normalized.cwd !== undefined && (typeof normalized.cwd !== "string" || !normalized.cwd.trim())) throw new Error("MCP 工作目录必须是非空字符串");
	if (normalized.requestTimeoutMs === undefined) normalized.requestTimeoutMs = DEFAULT_MCP_REQUEST_TIMEOUT_MS;
	if (!Number.isInteger(normalized.requestTimeoutMs) || normalized.requestTimeoutMs <= 0) throw new Error("MCP 超时时间必须是正整数毫秒");
	if (hasUrl) {
		try {
			const url = new URL(String(normalized.url));
			if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
		} catch {
			throw new Error("MCP URL 必须是有效的 HTTP(S) 地址");
		}
		const transport = normalized.httpTransport ?? "streamable-http";
		if (transport !== "streamable-http" && transport !== "sse") throw new Error("HTTP MCP 传输类型只能是 streamable-http 或 sse");
		normalized.httpTransport = transport;
	}
	if (!options.requireRedactedSource && containsRedactedValue(normalized)) throw new Error("新 MCP 服务不能使用脱敏占位符作为凭据");
	return normalized;
}

/** 返回可发送给 Desktop 的编辑副本；环境变量和请求头值统一脱敏。 */
export function sanitizeMcpServerDefinition(definition: McpServerDefinition): McpServerDefinition {
	const sanitized = { ...definition };
	if (sanitized.env) sanitized.env = Object.fromEntries(Object.keys(sanitized.env).map((key) => [key, MCP_REDACTED_VALUE]));
	if (sanitized.headers) sanitized.headers = Object.fromEntries(Object.keys(sanitized.headers).map((key) => [key, MCP_REDACTED_VALUE]));
	if (typeof sanitized.bearerToken === "string") sanitized.bearerToken = MCP_REDACTED_VALUE;
	if (sanitized.oauth && typeof sanitized.oauth === "object" && !Array.isArray(sanitized.oauth)) {
		const oauth = { ...(sanitized.oauth as Record<string, unknown>) };
		if (typeof oauth.clientSecret === "string") oauth.clientSecret = MCP_REDACTED_VALUE;
		sanitized.oauth = oauth;
	}
	return sanitized;
}

function normalizeStringRecord(value: unknown, label: string, allowRedacted: boolean): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}必须是字符串对象`);
	const result: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (!key.trim() || typeof entry !== "string") throw new Error(`${label}的键和值必须是字符串`);
		if (!allowRedacted && entry === MCP_REDACTED_VALUE) throw new Error(`${label}不能直接使用脱敏占位符`);
		result[key] = entry;
	}
	return result;
}

function mergeRedactedSecrets(existing: McpServerDefinition | undefined, incoming: McpServerDefinition): McpServerDefinition {
	if (!existing) return incoming;
	const merged = { ...incoming };
	// 表单没有暴露 cwd 等高级字段时保留旧定义，避免“完整编辑”意外丢失标准配置。
	if (existing.command && incoming.command && incoming.cwd === undefined && existing.cwd !== undefined) merged.cwd = existing.cwd;
	for (const field of ["env", "headers"] as const) {
		const incomingRecord = incoming[field];
		if (incomingRecord === undefined) {
			if (existing[field]) merged[field] = existing[field];
			continue;
		}
		const existingRecord = existing[field] ?? {};
		const nextRecord: Record<string, string> = {};
		for (const [key, value] of Object.entries(incomingRecord)) {
			if (value === MCP_REDACTED_VALUE) {
				// 列表响应中的占位符只代表“保留已有值”；新键没有可恢复的凭据，禁止把占位符落盘。
				if (!(key in existingRecord)) throw new Error(`${field === "env" ? "环境变量" : "请求头"}新增项必须填写真实值`);
				nextRecord[key] = existingRecord[key];
			} else {
				nextRecord[key] = value;
			}
		}
		merged[field] = nextRecord;
	}
	if (incoming.bearerToken === MCP_REDACTED_VALUE) {
		if (typeof existing.bearerToken !== "string") throw new Error("新增 bearerToken 必须填写真实值");
		merged.bearerToken = existing.bearerToken;
	} else if (incoming.bearerToken !== undefined && typeof incoming.bearerToken !== "string") {
		throw new Error("bearerToken 必须是字符串");
	} else if (incoming.bearerToken === undefined && typeof existing.bearerToken === "string") {
		merged.bearerToken = existing.bearerToken;
	}
	if (incoming.bearerToken !== undefined && typeof incoming.bearerToken !== "string") throw new Error("bearerToken 必须是字符串");
	if (existing.oauth && typeof existing.oauth === "object" && !Array.isArray(existing.oauth)) {
		if (incoming.oauth === undefined) {
			merged.oauth = existing.oauth;
		} else if (incoming.oauth && typeof incoming.oauth === "object" && !Array.isArray(incoming.oauth)) {
			const incomingOauth = { ...(incoming.oauth as Record<string, unknown>) };
			const existingOauth = existing.oauth as Record<string, unknown>;
			if (incomingOauth.clientSecret === MCP_REDACTED_VALUE && typeof existingOauth.clientSecret === "string") incomingOauth.clientSecret = existingOauth.clientSecret;
			if (incomingOauth.clientSecret === undefined && typeof existingOauth.clientSecret === "string") incomingOauth.clientSecret = existingOauth.clientSecret;
			merged.oauth = incomingOauth;
		}
	}
	if (incoming.oauth && typeof incoming.oauth === "object" && !Array.isArray(incoming.oauth) && (incoming.oauth as Record<string, unknown>).clientSecret === MCP_REDACTED_VALUE && !(existing.oauth && typeof existing.oauth === "object" && !Array.isArray(existing.oauth) && typeof (existing.oauth as Record<string, unknown>).clientSecret === "string")) {
		throw new Error("新增 OAuth clientSecret 必须填写真实值");
	}
	if (merged.oauth !== undefined && merged.oauth !== false && (typeof merged.oauth !== "object" || Array.isArray(merged.oauth))) throw new Error("oauth 必须是对象或 false");
	return merged;
}

function containsRedactedValue(definition: McpServerDefinition): boolean {
	if ([definition.env, definition.headers].some((record) => record ? Object.values(record).includes(MCP_REDACTED_VALUE) : false)) return true;
	if (definition.bearerToken === MCP_REDACTED_VALUE) return true;
	return Boolean(definition.oauth && typeof definition.oauth === "object" && !Array.isArray(definition.oauth) && (definition.oauth as Record<string, unknown>).clientSecret === MCP_REDACTED_VALUE);
}
