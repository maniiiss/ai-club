import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import { handleGitPilotMcpCommand } from "../src/extensions/gitpilot/mcp-cli.ts";

describe("GitPilot MCP CLI", () => {
	let root: string;
	let cwd: string;
	let previousAgentDir: string | undefined;
	let previousExitCode: typeof process.exitCode;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "gitpilot-mcp-cli-"));
		cwd = join(root, "project");
		mkdirSync(cwd, { recursive: true });
		previousAgentDir = process.env[ENV_AGENT_DIR];
		process.env[ENV_AGENT_DIR] = join(root, "agent");
		previousExitCode = process.exitCode;
		process.exitCode = undefined;
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (previousAgentDir === undefined) delete process.env[ENV_AGENT_DIR];
		else process.env[ENV_AGENT_DIR] = previousAgentDir;
		process.exitCode = previousExitCode;
		rmSync(root, { recursive: true, force: true });
	});

	it("保存三种传输类型及标准字段", async () => {
		expect(await handleGitPilotMcpCommand(["mcp", "add", "stdio-server", "--command", "node", "--args", '["server.js","hello world"]', "--env", '{"TOKEN":"secret"}', "--timeout", "1200", "--modes", "code,work,design"], cwd)).toBe(true);
		expect(await handleGitPilotMcpCommand(["mcp", "add", "http-server", "--url", "https://example.com/mcp", "--transport", "http", "--headers", '{"Authorization":"Bearer secret"}', "--modes", "work"], cwd)).toBe(true);
		expect(await handleGitPilotMcpCommand(["mcp", "add", "sse-server", "--url", "https://example.com/sse", "--transport", "sse", "--modes", "design"], cwd)).toBe(true);

		const config = JSON.parse(readFileSync(join(root, "agent", "mcp.json"), "utf8")) as { mcpServers: Record<string, Record<string, unknown>> };
		expect(config.mcpServers["stdio-server"]).toMatchObject({ command: "node", args: ["server.js", "hello world"], env: { TOKEN: "secret" }, requestTimeoutMs: 1200 });
		expect(config.mcpServers["http-server"]).toMatchObject({ url: "https://example.com/mcp", httpTransport: "streamable-http", headers: { Authorization: "Bearer secret" } });
		expect(config.mcpServers["sse-server"]).toMatchObject({ url: "https://example.com/sse", httpTransport: "sse" });
	});

	it("拒绝传输边界和非法 JSON", async () => {
		expect(await handleGitPilotMcpCommand(["mcp", "add", "ambiguous", "--command", "node", "--url", "https://example.com"], cwd)).toBe(true);
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		expect(await handleGitPilotMcpCommand(["mcp", "add", "bad-transport", "--url", "https://example.com", "--transport", "websocket"], cwd)).toBe(true);
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		expect(await handleGitPilotMcpCommand(["mcp", "add", "bad-json", "--command", "node", "--env", "{broken"], cwd)).toBe(true);
		expect(process.exitCode).toBe(1);
	});
});
