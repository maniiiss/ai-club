import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	copyManagedMcpServer,
	DEFAULT_MCP_REQUEST_TIMEOUT_MS,
	listManagedMcpServers,
	loadMcpConfigurationForMode,
	MCP_REDACTED_VALUE,
	normalizeMcpServerDefinition,
	saveManagedMcpServer,
	setManagedMcpEnabled,
	setManagedMcpModes,
} from "../src/extensions/gitpilot/mcp-manager.ts";

function readJson(path: string): Record<string, any> {
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
}

describe("GitPilot MCP 配置管理", () => {
	let root: string;
	let cwd: string;
	let agentDir: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "gitpilot-mcp-manager-"));
		cwd = join(root, "project");
		agentDir = join(root, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("保存 stdio 标准字段并按三种作用域过滤", () => {
		saveManagedMcpServer(cwd, "local-tools", {
			command: "node",
			args: ["server.js", "--workspace"],
			env: { API_KEY: "secret" },
			cwd: cwd,
		}, ["code", "work", "design"], agentDir);

		const stored = readJson(join(agentDir, "mcp.json")).mcpServers["local-tools"];
		expect(stored).toMatchObject({ command: "node", args: ["server.js", "--workspace"], env: { API_KEY: "secret" }, requestTimeoutMs: DEFAULT_MCP_REQUEST_TIMEOUT_MS });
		expect(listManagedMcpServers(cwd, agentDir)).toEqual([
			expect.objectContaining({ name: "local-tools", source: "global", transport: "stdio", modes: ["code", "work", "design"], definition: expect.objectContaining({ env: { API_KEY: MCP_REDACTED_VALUE } }) }),
		]);
		expect(Object.keys(loadMcpConfigurationForMode("code", cwd, agentDir).mcpServers)).toEqual(["local-tools"]);
		expect(Object.keys(loadMcpConfigurationForMode("work", cwd, agentDir).mcpServers)).toEqual(["local-tools"]);
		expect(Object.keys(loadMcpConfigurationForMode("design", cwd, agentDir).mcpServers)).toEqual(["local-tools"]);
	});

	it("支持 HTTP、SSE 和请求头，并写入默认超时", () => {
		saveManagedMcpServer(cwd, "remote-http", { url: "https://example.com/mcp", headers: { Authorization: "Bearer http-token" } }, ["work"], agentDir);
		saveManagedMcpServer(cwd, "remote-sse", { url: "https://example.com/sse", httpTransport: "sse", headers: { "X-Token": "sse-token" }, requestTimeoutMs: 12_000 }, ["design"], agentDir);

		const servers = listManagedMcpServers(cwd, agentDir);
		expect(servers.find((server) => server.name === "remote-http")).toMatchObject({ transport: "http", modes: ["work"], definition: { httpTransport: "streamable-http", requestTimeoutMs: DEFAULT_MCP_REQUEST_TIMEOUT_MS, headers: { Authorization: MCP_REDACTED_VALUE } } });
		expect(servers.find((server) => server.name === "remote-sse")).toMatchObject({ transport: "sse", modes: ["design"], definition: { httpTransport: "sse", requestTimeoutMs: 12_000, headers: { "X-Token": MCP_REDACTED_VALUE } } });
	});

	it("保留未修改凭据，只允许真实值新增敏感键", () => {
		saveManagedMcpServer(cwd, "secured", { command: "node", env: { TOKEN: "old-token" }, headers: { Authorization: "old-header" } }, ["code"], agentDir);
		const listed = listManagedMcpServers(cwd, agentDir)[0];
		saveManagedMcpServer(cwd, "secured", { ...listed.definition, args: ["server.js"], env: { TOKEN: MCP_REDACTED_VALUE, NEW_TOKEN: "new-token" }, headers: { Authorization: MCP_REDACTED_VALUE } }, ["code"], agentDir);

		const stored = readJson(join(agentDir, "mcp.json")).mcpServers.secured;
		expect(stored).toMatchObject({ args: ["server.js"], env: { TOKEN: "old-token", NEW_TOKEN: "new-token" }, headers: { Authorization: "old-header" } });
		expect(() => saveManagedMcpServer(cwd, "new-secured", { command: "node", env: { TOKEN: MCP_REDACTED_VALUE } }, ["code"], agentDir)).toThrow("不能直接使用脱敏占位符");
		expect(() => saveManagedMcpServer(cwd, "secured", { ...listed.definition, env: { TOKEN: MCP_REDACTED_VALUE, UNKNOWN: MCP_REDACTED_VALUE } }, ["code"], agentDir)).toThrow("新增项必须填写真实值");
	});

	it("脱敏 bearerToken 和 OAuth clientSecret，并在更新时保留", () => {
		saveManagedMcpServer(cwd, "oauth-server", { url: "https://example.com/mcp", bearerToken: "old-bearer", oauth: { clientId: "client", clientSecret: "old-client-secret" } }, ["code"], agentDir);
		const listed = listManagedMcpServers(cwd, agentDir)[0];
		expect(listed.definition).toMatchObject({ bearerToken: MCP_REDACTED_VALUE, oauth: { clientId: "client", clientSecret: MCP_REDACTED_VALUE } });
		saveManagedMcpServer(cwd, "oauth-server", { ...listed.definition, oauth: { clientId: "new-client" } }, ["code"], agentDir);
		expect(readJson(join(agentDir, "mcp.json")).mcpServers["oauth-server"]).toMatchObject({ bearerToken: "old-bearer", oauth: { clientId: "new-client", clientSecret: "old-client-secret" } });
	});

	it("项目服务只读，并可复制为全局服务", () => {
		writeFileSync(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: { "team-search": { url: "https://team.example.com/mcp", headers: { Authorization: "team-secret" } } } }), "utf8");
		const projectServer = listManagedMcpServers(cwd, agentDir).find((server) => server.name === "team-search");
		expect(projectServer).toMatchObject({ source: "project", transport: "http" });
		expect(() => setManagedMcpModes(cwd, "team-search", ["work"], agentDir)).toThrow("只能调整作用域");
		expect(() => setManagedMcpEnabled(cwd, "team-search", false, agentDir)).toThrow("只能启停未被项目配置覆盖");

		const copiedName = copyManagedMcpServer(cwd, "team-search", agentDir);
		expect(copiedName).toBe("team-search-global");
		expect(readJson(join(agentDir, "mcp.json")).mcpServers[copiedName]).toMatchObject({ url: "https://team.example.com/mcp", headers: { Authorization: "team-secret" }, requestTimeoutMs: DEFAULT_MCP_REQUEST_TIMEOUT_MS, httpTransport: "streamable-http" });
		expect(listManagedMcpServers(cwd, agentDir).find((server) => server.name === copiedName)).toMatchObject({ source: "global", modes: ["code"] });
	});

	it("复制时避开项目配置占用的目标名称", () => {
		writeFileSync(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: {
			"team-search": { url: "https://team.example.com/mcp" },
			"team-search-global": { url: "https://other.example.com/mcp" },
		} }), "utf8");
		expect(copyManagedMcpServer(cwd, "team-search", agentDir)).toBe("team-search-global-2");
	});

	it("拒绝非法传输、字段类型、作用域和地址", () => {
		expect(() => normalizeMcpServerDefinition({ command: "node", url: "https://example.com" })).toThrow("只能配置 command 或 url");
		expect(() => normalizeMcpServerDefinition({ command: "node", httpTransport: "sse" })).toThrow("不能配置 HTTP");
		expect(() => normalizeMcpServerDefinition({ command: "node", args: ["ok", 1 as never] })).toThrow("参数必须是字符串数组");
		expect(() => normalizeMcpServerDefinition({ url: "ftp://example.com" })).toThrow("有效的 HTTP(S)");
		expect(() => normalizeMcpServerDefinition({ url: "https://example.com", requestTimeoutMs: 0 })).toThrow("正整数");
		expect(() => normalizeMcpServerDefinition({ command: "node", disabled: "false" as never })).toThrow("disabled 必须是布尔值");
		saveManagedMcpServer(cwd, "invalid-update", { command: "node", env: { TOKEN: "secret" } }, ["code"], agentDir);
		const listed = listManagedMcpServers(cwd, agentDir)[0];
		expect(() => saveManagedMcpServer(cwd, "invalid-update", { ...listed.definition, env: null as never }, ["code"], agentDir)).toThrow("环境变量");
		expect(() => saveManagedMcpServer(cwd, "bad-scope", { command: "node" }, ["mobile" as never], agentDir)).toThrow("只能是 code、work 或 design");
	});

	it("检测损坏的 JSON 配置", () => {
		writeFileSync(join(agentDir, "mcp.json"), "{broken", "utf8");
		expect(() => listManagedMcpServers(cwd, agentDir)).toThrow();
		expect(existsSync(join(agentDir, "mcp.json"))).toBe(true);
	});
});
