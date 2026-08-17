#!/usr/bin/env node
import { APP_NAME, getAgentDir } from "./config.ts";

process.title = `${APP_NAME}-rpc`;
process.env.PI_CODING_AGENT = "true";
// Web/MCP extension configuration belongs to GitPilot's agent directory in every sidecar startup path.
process.env.PI_CODING_AGENT_DIR = getAgentDir();
process.emitWarning = (() => {}) as typeof process.emitWarning;

// 延迟加载会间接导入 pi-web-access 的模块，确保它读取到 .gitpilot/agent 配置目录。
const { configureHttpDispatcher } = await import("./core/http-dispatcher.ts");
const { main } = await import("./main.ts");

configureHttpDispatcher();

main(["--mode", "rpc", ...process.argv.slice(2)]);
