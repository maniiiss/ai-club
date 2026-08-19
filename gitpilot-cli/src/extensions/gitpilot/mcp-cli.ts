import { getAgentDir } from "../../config.ts";
import { copyManagedMcpServer, deleteManagedMcpServer, listManagedMcpServers, saveManagedMcpServer, setManagedMcpEnabled, setManagedMcpModes, type GitPilotAgentMode, type McpServerDefinition } from "./mcp-manager.ts";

function parseModes(value: string | undefined): GitPilotAgentMode[] {
	if (value === undefined) return ["code"];
	const modes = value.split(",").filter((mode): mode is GitPilotAgentMode => mode === "code" || mode === "work" || mode === "design");
	if (modes.length === 0 || modes.length !== value.split(",").length) throw new Error("模式必须是 code、work 或 design，以逗号分隔");
	return modes;
}

function flag(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
}

function jsonRecord(value: string | undefined, label: string): Record<string, string> | undefined {
	if (!value) return undefined;
	const parsed: unknown = JSON.parse(value);
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((entry) => typeof entry !== "string")) throw new Error(`${label}必须是字符串键值 JSON`);
	return parsed as Record<string, string>;
}

/** GitPilot 管理标准 MCP 定义；上游 /mcp 只保留当前模式的运行态查看与操作。 */
export async function handleGitPilotMcpCommand(args: string[], cwd: string): Promise<boolean> {
	if (args[0] !== "mcp") return false;
	const action = args[1] ?? "list";
	const agentDir = getAgentDir();
	try {
		if (action === "list") {
			for (const server of listManagedMcpServers(cwd, agentDir)) console.log(`${server.name}\t${server.source}\t${server.enabled ? "enabled" : "disabled"}\t${server.modes.join(",")}\t${server.transport}`);
			return true;
		}
		const name = args[2];
		if (!name) throw new Error("缺少 MCP 服务名");
		if (action === "copy") {
			const copiedName = copyManagedMcpServer(cwd, name, agentDir);
			console.log(`MCP 服务已复制到全局：${copiedName}`);
			return true;
		}
		if (action === "remove") deleteManagedMcpServer(cwd, name, agentDir);
		else if (action === "enable" || action === "disable") setManagedMcpEnabled(cwd, name, action === "enable", agentDir);
		else if (action === "scopes") setManagedMcpModes(cwd, name, parseModes(args[3]), agentDir);
		else if (action === "add") {
			const command = flag(args, "--command");
			const url = flag(args, "--url");
			const transport = flag(args, "--transport");
			const timeoutText = flag(args, "--timeout");
			if (command && url) throw new Error("mcp add 不能同时配置 --command 和 --url");
			if (!command && !url) throw new Error("mcp add 需要 --command 或 --url");
			if (transport && transport !== "http" && transport !== "streamable-http" && transport !== "sse" && transport !== "stdio") throw new Error("--transport 只能是 stdio、http、streamable-http 或 sse");
			if (command && transport && transport !== "stdio") throw new Error("stdio MCP 服务不能配置 HTTP 传输类型");
			if (url && transport === "stdio") throw new Error("URL MCP 服务不能使用 stdio 传输类型");
			const definition: McpServerDefinition = command ? { command } : { url, httpTransport: transport === "sse" ? "sse" : "streamable-http" };
			const argsText = flag(args, "--args");
			if (argsText) definition.args = JSON.parse(argsText) as string[];
			const env = jsonRecord(flag(args, "--env"), "环境变量");
			const headers = jsonRecord(flag(args, "--headers"), "请求头");
			if (env) definition.env = env;
			if (headers) definition.headers = headers;
			if (timeoutText) definition.requestTimeoutMs = Number(timeoutText);
			saveManagedMcpServer(cwd, name, definition, parseModes(flag(args, "--modes")), agentDir);
		} else throw new Error(`未知 MCP 操作：${action}`);
		console.log(`MCP 服务已${action === "remove" ? "删除" : "更新"}：${name}`);
		return true;
	} catch (error) {
		console.error(`MCP 管理失败：${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
		return true;
	}
}
