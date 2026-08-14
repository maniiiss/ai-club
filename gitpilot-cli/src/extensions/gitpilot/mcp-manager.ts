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

export interface McpServerDefinition {
	command?: string;
	args?: string[];
	url?: string;
	env?: Record<string, string>;
	headers?: Record<string, string>;
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
	/** 不向 RPC 返回 headers/env 等潜在敏感定义。 */
	transport: "stdio" | "http" | "unknown";
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
		transport: typeof item.definition.command === "string" ? "stdio" : typeof item.definition.url === "string" ? "http" : "unknown",
	})).sort((left, right) => left.name.localeCompare(right.name));
}

/** GitPilot 管理页只写全局 Pi 覆盖层，绝不改写共享或项目来源文件。 */
export function saveManagedMcpServer(cwd: string, name: string, definition: McpServerDefinition, modes: GitPilotAgentMode[], agentDir?: string): void {
	if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw new Error("MCP 服务名只能包含字母、数字、点、下划线和短横线");
	if (typeof definition.command !== "string" && typeof definition.url !== "string") throw new Error("MCP 服务需要 command 或 url");
	const locations = paths(cwd, agentDir);
	const config = readJson(locations.global);
	const servers = serversOf(locations.global);
	servers[name] = definition;
	atomicWrite(locations.global, { ...config, mcpServers: servers });
	const scopes = readScopes(cwd, agentDir);
	scopes.servers[name] = normalizeModes(modes);
	atomicWrite(locations.scopes, scopes);
}

export function deleteManagedMcpServer(cwd: string, name: string, agentDir?: string): void {
	const locations = paths(cwd, agentDir);
	const config = readJson(locations.global);
	const servers = serversOf(locations.global);
	if (!servers[name]) throw new Error(`只能删除 GitPilot 全局 MCP 服务：${name}`);
	delete servers[name];
	atomicWrite(locations.global, { ...config, mcpServers: servers });
	const scopes = readScopes(cwd, agentDir);
	delete scopes.servers[name];
	atomicWrite(locations.scopes, scopes);
}

export function setManagedMcpModes(cwd: string, name: string, modes: GitPilotAgentMode[], agentDir?: string): void {
	const config = loadMcpConfiguration(cwd, agentDir);
	if (!config.mcpServers[name]) throw new Error(`MCP 服务不存在：${name}`);
	const locations = paths(cwd, agentDir);
	const scopes = readScopes(cwd, agentDir);
	scopes.servers[name] = normalizeModes(modes);
	atomicWrite(locations.scopes, scopes);
}

/** 启停只写 GitPilot 全局覆盖层，避免修改团队共享的项目 MCP 定义。 */
export function setManagedMcpEnabled(cwd: string, name: string, enabled: boolean, agentDir?: string): void {
	const locations = paths(cwd, agentDir);
	const config = readJson(locations.global);
	const servers = serversOf(locations.global);
	if (!servers[name]) throw new Error(`只能启停 GitPilot 全局 MCP 服务：${name}`);
	servers[name] = { ...servers[name], disabled: !enabled };
	atomicWrite(locations.global, { ...config, mcpServers: servers });
}

function normalizeModes(modes: GitPilotAgentMode[]): GitPilotAgentMode[] {
	return [...new Set(modes.filter((mode): mode is GitPilotAgentMode => GITPILOT_AGENT_MODES.includes(mode)))];
}
