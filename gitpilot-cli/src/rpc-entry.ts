#!/usr/bin/env node
import { APP_NAME, getAgentDir } from "./config.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";

process.title = `${APP_NAME}-rpc`;
process.env.PI_CODING_AGENT = "true";
// Web/MCP extension configuration belongs to GitPilot's agent directory in every sidecar startup path.
process.env.PI_CODING_AGENT_DIR = getAgentDir();
process.emitWarning = (() => {}) as typeof process.emitWarning;

configureHttpDispatcher();

main(["--mode", "rpc", ...process.argv.slice(2)]);
