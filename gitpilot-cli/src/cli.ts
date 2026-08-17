#!/usr/bin/env node
/**
 * CLI entry point for the refactored coding agent.
 * Uses main.ts with AgentSession and new mode modules.
 *
 * Test with: npx tsx src/cli-new.ts [args...]
 */
import { APP_NAME, getAgentDir } from "./config.ts";

process.title = APP_NAME;
// 用 APP_NAME 派生进程标识环境变量，fork 后不再硬编码 PI_CODING_AGENT。
process.env[`${APP_NAME.toUpperCase()}_CODING_AGENT`] = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;

// 在加载 pi-web-access 之前固定 GitPilot 配置目录，避免扩展初始化时回退到 ~/.pi。
process.env.PI_CODING_AGENT_DIR = getAgentDir();

const { configureHttpDispatcher } = await import("./core/http-dispatcher.ts");
const { main } = await import("./main.ts");

// Configure undici's global dispatcher before provider SDKs issue requests.
// Runtime settings are applied once SettingsManager has loaded global/project settings.
configureHttpDispatcher();

main(process.argv.slice(2));
