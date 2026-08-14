import { getAgentDir } from "../../config.ts";
import { deleteManagedMcpServer, listManagedMcpServers, saveManagedMcpServer, setManagedMcpEnabled, setManagedMcpModes, type GitPilotAgentMode } from "./mcp-manager.ts";

function parseModes(value: string | undefined): GitPilotAgentMode[] {
	const modes = (value ?? "code").split(",").filter((mode): mode is GitPilotAgentMode => mode === "code" || mode === "work" || mode === "design");
	if (modes.length === 0) throw new Error("模式必须是 code、work 或 design，以逗号分隔");
	return modes;
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
		if (action === "remove") deleteManagedMcpServer(cwd, name, agentDir);
		else if (action === "enable" || action === "disable") setManagedMcpEnabled(cwd, name, action === "enable", agentDir);
		else if (action === "scopes") setManagedMcpModes(cwd, name, parseModes(args[3]), agentDir);
		else if (action === "add") {
			const commandIndex = args.indexOf("--command");
			const urlIndex = args.indexOf("--url");
			const modesIndex = args.indexOf("--modes");
			const command = commandIndex >= 0 ? args[commandIndex + 1] : undefined;
			const url = urlIndex >= 0 ? args[urlIndex + 1] : undefined;
			if (!command && !url) throw new Error("mcp add 需要 --command 或 --url");
			saveManagedMcpServer(cwd, name, command ? { command } : { url }, parseModes(modesIndex >= 0 ? args[modesIndex + 1] : undefined), agentDir);
		} else throw new Error(`未知 MCP 操作：${action}`);
		console.log(`MCP 服务已${action === "remove" ? "删除" : "更新"}：${name}`);
		return true;
	} catch (error) {
		console.error(`MCP 管理失败：${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
		return true;
	}
}
