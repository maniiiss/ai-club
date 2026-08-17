/**
 * CLI argument parsing and help display
 */

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import chalk from "chalk";
import { APP_NAME, CONFIG_DIR_NAME, ENV_AGENT_DIR, ENV_SESSION_DIR } from "../config.ts";
import type { ExtensionFlag } from "../core/extensions/types.ts";

export type Mode = "text" | "json" | "rpc";

export interface Args {
	provider?: string;
	model?: string;
	apiKey?: string;
	systemPrompt?: string;
	appendSystemPrompt?: string[];
	thinking?: ThinkingLevel;
	continue?: boolean;
	resume?: boolean;
	help?: boolean;
	version?: boolean;
	mode?: Mode;
	name?: string;
	noSession?: boolean;
	session?: string;
	sessionId?: string;
	fork?: string;
	sessionDir?: string;
	models?: string[];
	tools?: string[];
	excludeTools?: string[];
	noTools?: boolean;
	noBuiltinTools?: boolean;
	extensions?: string[];
	noExtensions?: boolean;
	print?: boolean;
	export?: string;
	noSkills?: boolean;
	skills?: string[];
	promptTemplates?: string[];
	noPromptTemplates?: boolean;
	themes?: string[];
	noThemes?: boolean;
	noContextFiles?: boolean;
	listModels?: string | true;
	offline?: boolean;
	verbose?: boolean;
	projectTrustOverride?: boolean;
	messages: string[];
	fileArgs: string[];
	/** Unknown flags (potentially extension flags) - map of flag name to value */
	unknownFlags: Map<string, boolean | string>;
	diagnostics: Array<{ type: "warning" | "error"; message: string }>;
}

const VALID_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export function isValidThinkingLevel(level: string): level is ThinkingLevel {
	return VALID_THINKING_LEVELS.includes(level as ThinkingLevel);
}

export function parseArgs(args: string[]): Args {
	const result: Args = {
		messages: [],
		fileArgs: [],
		unknownFlags: new Map(),
		diagnostics: [],
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			result.help = true;
		} else if (arg === "--version" || arg === "-v") {
			result.version = true;
		} else if (arg === "--mode" && i + 1 < args.length) {
			const mode = args[++i];
			if (mode === "text" || mode === "json" || mode === "rpc") {
				result.mode = mode;
			}
		} else if (arg === "--continue" || arg === "-c") {
			result.continue = true;
		} else if (arg === "--resume" || arg === "-r") {
			result.resume = true;
		} else if (arg === "--provider" && i + 1 < args.length) {
			result.provider = args[++i];
		} else if (arg === "--model" && i + 1 < args.length) {
			result.model = args[++i];
		} else if (arg === "--api-key" && i + 1 < args.length) {
			result.apiKey = args[++i];
		} else if (arg === "--system-prompt" && i + 1 < args.length) {
			result.systemPrompt = args[++i];
		} else if (arg === "--append-system-prompt" && i + 1 < args.length) {
			result.appendSystemPrompt = result.appendSystemPrompt ?? [];
			result.appendSystemPrompt.push(args[++i]);
		} else if (arg === "--name" || arg === "-n") {
			if (i + 1 < args.length) {
				result.name = args[++i];
			} else {
				result.diagnostics.push({ type: "error", message: "--name requires a value" });
			}
		} else if (arg === "--no-session") {
			result.noSession = true;
		} else if (arg === "--session" && i + 1 < args.length) {
			result.session = args[++i];
		} else if (arg === "--session-id" && i + 1 < args.length) {
			result.sessionId = args[++i];
		} else if (arg === "--fork" && i + 1 < args.length) {
			result.fork = args[++i];
		} else if (arg === "--session-dir" && i + 1 < args.length) {
			result.sessionDir = args[++i];
		} else if (arg === "--models" && i + 1 < args.length) {
			result.models = args[++i].split(",").map((s) => s.trim());
		} else if (arg === "--no-tools" || arg === "-nt") {
			result.noTools = true;
		} else if (arg === "--no-builtin-tools" || arg === "-nbt") {
			result.noBuiltinTools = true;
		} else if ((arg === "--tools" || arg === "-t") && i + 1 < args.length) {
			result.tools = args[++i]
				.split(",")
				.map((s) => s.trim())
				.filter((name) => name.length > 0);
		} else if ((arg === "--exclude-tools" || arg === "-xt") && i + 1 < args.length) {
			result.excludeTools = args[++i]
				.split(",")
				.map((s) => s.trim())
				.filter((name) => name.length > 0);
		} else if (arg === "--thinking" && i + 1 < args.length) {
			const level = args[++i];
			if (isValidThinkingLevel(level)) {
				result.thinking = level;
			} else {
				result.diagnostics.push({
					type: "warning",
					message: `Invalid thinking level "${level}". Valid values: ${VALID_THINKING_LEVELS.join(", ")}`,
				});
			}
		} else if (arg === "--print" || arg === "-p") {
			result.print = true;
			const next = args[i + 1];
			if (next !== undefined && !next.startsWith("@") && (!next.startsWith("-") || next.startsWith("---"))) {
				result.messages.push(next);
				i++;
			}
		} else if (arg === "--export" && i + 1 < args.length) {
			result.export = args[++i];
		} else if ((arg === "--extension" || arg === "-e") && i + 1 < args.length) {
			result.extensions = result.extensions ?? [];
			result.extensions.push(args[++i]);
		} else if (arg === "--no-extensions" || arg === "-ne") {
			result.noExtensions = true;
		} else if (arg === "--skill" && i + 1 < args.length) {
			result.skills = result.skills ?? [];
			result.skills.push(args[++i]);
		} else if (arg === "--prompt-template" && i + 1 < args.length) {
			result.promptTemplates = result.promptTemplates ?? [];
			result.promptTemplates.push(args[++i]);
		} else if (arg === "--theme" && i + 1 < args.length) {
			result.themes = result.themes ?? [];
			result.themes.push(args[++i]);
		} else if (arg === "--no-skills" || arg === "-ns") {
			result.noSkills = true;
		} else if (arg === "--no-prompt-templates" || arg === "-np") {
			result.noPromptTemplates = true;
		} else if (arg === "--no-themes") {
			result.noThemes = true;
		} else if (arg === "--no-context-files" || arg === "-nc") {
			result.noContextFiles = true;
		} else if (arg === "--list-models") {
			// Check if next arg is a search pattern (not a flag or file arg)
			if (i + 1 < args.length && !args[i + 1].startsWith("-") && !args[i + 1].startsWith("@")) {
				result.listModels = args[++i];
			} else {
				result.listModels = true;
			}
		} else if (arg === "--verbose") {
			result.verbose = true;
		} else if (arg === "--approve" || arg === "-a") {
			result.projectTrustOverride = true;
		} else if (arg === "--no-approve" || arg === "-na") {
			result.projectTrustOverride = false;
		} else if (arg === "--offline") {
			result.offline = true;
		} else if (arg.startsWith("@")) {
			result.fileArgs.push(arg.slice(1)); // Remove @ prefix
		} else if (arg.startsWith("--")) {
			const eqIndex = arg.indexOf("=");
			if (eqIndex !== -1) {
				result.unknownFlags.set(arg.slice(2, eqIndex), arg.slice(eqIndex + 1));
			} else {
				const flagName = arg.slice(2);
				const next = args[i + 1];
				if (next !== undefined && !next.startsWith("-") && !next.startsWith("@")) {
					result.unknownFlags.set(flagName, next);
					i++;
				} else {
					result.unknownFlags.set(flagName, true);
				}
			}
		} else if (arg.startsWith("-") && !arg.startsWith("--")) {
			result.diagnostics.push({ type: "error", message: `Unknown option: ${arg}` });
		} else if (!arg.startsWith("-")) {
			result.messages.push(arg);
		}
	}

	return result;
}

export function printHelp(extensionFlags?: ExtensionFlag[]): void {
	const extensionFlagsText =
		extensionFlags && extensionFlags.length > 0
			? `\n${chalk.bold("Extension CLI Flags:")}\n${extensionFlags
					.map((flag) => {
						const value = flag.type === "string" ? " <value>" : "";
						const description = flag.description ?? `Registered by ${flag.extensionPath}`;
						return `  --${flag.name}${value}`.padEnd(30) + description;
					})
					.join("\n")}\n`
			: "";
	console.log(`${chalk.bold(APP_NAME)} - 具备 read、bash、edit、write 工具的 AI 编程助手

${chalk.bold("用法：")}
  ${APP_NAME} [选项] [@文件...] [消息...]

${chalk.bold("命令：")}
  ${APP_NAME} install <source> [-l]     安装扩展源并加入设置
  ${APP_NAME} remove <source> [-l]      从设置中移除扩展源
  ${APP_NAME} uninstall <source> [-l]   remove 的别名
  ${APP_NAME} update [source|self|pi]   更新 gitpilot、扩展或模型目录
  ${APP_NAME} list                      列出设置中已安装的扩展
  ${APP_NAME} config [-l]               打开 TUI 启用/禁用包资源（Tab 切换作用域）
  ${APP_NAME} <command> --help          显示 install/remove/uninstall/update/list/config 的帮助

${chalk.bold("选项：")}
  --provider <name>              提供商名称（默认：google）
  --model <pattern>              模型模式或 ID（支持 "provider/id" 及可选的 ":<thinking>"）
  --api-key <key>                API 密钥（默认取自环境变量）
  --system-prompt <text>         系统提示（默认：编程助手提示）
  --append-system-prompt <text>  向系统提示追加文本或文件内容（可多次使用）
  --mode <mode>                  输出模式：text（默认）、json 或 rpc
  --print, -p                    非交互模式：处理提示后退出
  --continue, -c                 继续上一个会话
  --resume, -r                   选择一个会话来恢复
  --session <path|id>            使用指定会话文件或部分 UUID
  --session-id <id>              使用确切的项目会话 ID，不存在则创建
  --fork <path|id>               将指定会话文件或部分 UUID 分叉到新会话
  --session-dir <dir>            会话存储与查找目录
  --no-session                   不保存会话（临时会话）
  --name, -n <name>              设置会话显示名称
  --models <patterns>            用于 Ctrl+P 切换的逗号分隔模型模式
                                 支持通配符（anthropic/*、*sonnet*）和模糊匹配
  --no-tools, -nt                默认禁用所有工具（内置与扩展）
  --no-builtin-tools, -nbt       默认禁用内置工具，但保留扩展/自定义工具启用
  --tools, -t <tools>            启用的工具名逗号分隔白名单
                                 适用于内置、扩展和自定义工具
  --exclude-tools, -xt <tools>   禁用的工具名逗号分隔黑名单
                                 适用于内置、扩展和自定义工具
  --thinking <level>             设置思考级别：off、minimal、low、medium、high、xhigh、max
  --extension, -e <path>         加载扩展文件（可多次使用）
  --no-extensions, -ne           禁用扩展发现（显式 -e 路径仍生效）
  --skill <path>                 加载技能文件或目录（可多次使用）
  --no-skills, -ns               禁用技能发现与加载
  --prompt-template <path>       加载提示模板文件或目录（可多次使用）
  --no-prompt-templates, -np     禁用提示模板发现与加载
  --theme <path>                 加载主题文件或目录（可多次使用）
  --no-themes                    禁用主题发现与加载
  --no-context-files, -nc        禁用 AGENTS.md 和 CLAUDE.md 发现与加载
  --export <file>                将会话文件导出为 HTML 并退出
  --list-models [search]         列出可用模型（可选模糊搜索）
  --verbose                      强制详细启动（覆盖 quietStartup 设置）
  --approve, -a                  本次运行信任项目本地文件
  --no-approve, -na              本次运行忽略项目本地文件
  --offline                      禁用启动网络操作（等同于 PI_OFFLINE=1）
  --help, -h                     显示此帮助
  --version, -v                  显示版本号

扩展可以注册额外参数（例如 Plannotator 的 --plan、Plan Mode 的 --plan-mode）。${extensionFlagsText}

${chalk.bold("示例：")}
  # 交互模式
  ${APP_NAME}

  # 带初始提示的交互模式
  ${APP_NAME} "列出 src/ 下所有 .ts 文件"

  # 在初始消息中包含文件
  ${APP_NAME} @prompt.md @image.png "天空是什么颜色？"

  # 非交互模式（处理后退出）
  ${APP_NAME} -p "列出 src/ 下所有 .ts 文件"

  # 多条消息（交互）
  ${APP_NAME} "读取 package.json" "我们有哪些依赖？"

  # 继续上一个会话
  ${APP_NAME} --continue "我们讨论了什么？"

  # 启动一个命名会话
  ${APP_NAME} --name "重构认证模块"

  # 使用不同模型
  ${APP_NAME} --provider openai --model gpt-4o-mini "帮我重构这段代码"

  # 使用带提供商前缀的模型（无需 --provider）
  ${APP_NAME} --model openai/gpt-4o "帮我重构这段代码"

  # 使用带思考级别简写的模型
  ${APP_NAME} --model sonnet:high "解决这个复杂问题"

  # 将模型切换限制为指定模型
  ${APP_NAME} --models claude-sonnet,claude-haiku,gpt-4o

  # 用通配符模式限定到指定提供商
  ${APP_NAME} --models "github-copilot/*"

  # 以固定思考级别切换模型
  ${APP_NAME} --models sonnet:high,haiku:low

  # 以指定思考级别启动
  ${APP_NAME} --thinking high "解决这个复杂问题"

  # 只读模式（无法修改文件）
  ${APP_NAME} --tools read,grep,find,ls -p "审查 src/ 下的代码"

  # 禁用某个工具但保留其余可用
  ${APP_NAME} --exclude-tools ask_question

  # 将会话文件导出为 HTML
  ${APP_NAME} --export ~/${CONFIG_DIR_NAME}/agent/sessions/--path--/session.jsonl
  ${APP_NAME} --export session.jsonl output.html

${chalk.bold("环境变量：")}
  ANTHROPIC_API_KEY                - Anthropic Claude API 密钥
  ANTHROPIC_OAUTH_TOKEN            - Anthropic OAuth 令牌（API 密钥的替代）
  ANT_LING_API_KEY                 - Ant Ling API 密钥
  OPENAI_API_KEY                   - OpenAI GPT API 密钥
  AZURE_OPENAI_API_KEY             - Azure OpenAI API 密钥
  AZURE_OPENAI_BASE_URL            - Azure OpenAI/Cognitive Services 基础 URL（如 https://{resource}.openai.azure.com）
  AZURE_OPENAI_RESOURCE_NAME       - Azure OpenAI 资源名（基础 URL 的替代）
  AZURE_OPENAI_API_VERSION         - Azure OpenAI API 版本（默认：v1）
  AZURE_OPENAI_DEPLOYMENT_NAME_MAP - Azure OpenAI 模型=部署映射（逗号分隔）
  DEEPSEEK_API_KEY                 - DeepSeek API 密钥
  NVIDIA_API_KEY                   - NVIDIA NIM API 密钥
  GEMINI_API_KEY                   - Google Gemini API 密钥
  GROQ_API_KEY                     - Groq API 密钥
  CEREBRAS_API_KEY                 - Cerebras API 密钥
  XAI_API_KEY                      - xAI Grok API 密钥
  FIREWORKS_API_KEY                - Fireworks API 密钥
  TOGETHER_API_KEY                 - Together AI API 密钥
  OPENROUTER_API_KEY               - OpenRouter API 密钥
  AI_GATEWAY_API_KEY               - Vercel AI Gateway API 密钥
  ZAI_API_KEY                      - ZAI Coding Plan API 密钥（国际区）
  ZAI_CODING_CN_API_KEY            - ZAI Coding Plan API 密钥（中国区）
  MISTRAL_API_KEY                  - Mistral API 密钥
  MINIMAX_API_KEY                  - MiniMax API 密钥
  MOONSHOT_API_KEY                 - Moonshot AI API 密钥
  OPENCODE_API_KEY                 - OpenCode Zen/OpenCode Go API 密钥
  KIMI_API_KEY                     - Kimi For Coding API 密钥
  CLOUDFLARE_API_KEY               - Cloudflare API 令牌（Workers AI 和 AI Gateway）
  CLOUDFLARE_ACCOUNT_ID            - Cloudflare 账户 ID（两者均需）
  CLOUDFLARE_GATEWAY_ID            - Cloudflare AI Gateway slug（AI Gateway 必需）
  QWEN_TOKEN_PLAN_API_KEY          - Qwen Token Plan API 密钥（国际区）
  QWEN_TOKEN_PLAN_CN_API_KEY       - Qwen Token Plan API 密钥（中国区）
  XIAOMI_API_KEY                   - Xiaomi MiMo API 密钥（api.xiaomimimo.com 计费）
  XIAOMI_TOKEN_PLAN_CN_API_KEY     - Xiaomi MiMo Token Plan API 密钥（中国区）
  XIAOMI_TOKEN_PLAN_AMS_API_KEY    - Xiaomi MiMo Token Plan API 密钥（阿姆斯特丹区）
  XIAOMI_TOKEN_PLAN_SGP_API_KEY    - Xiaomi MiMo Token Plan API 密钥（新加坡区）
  AWS_PROFILE                      - Amazon Bedrock 的 AWS 配置档案
  AWS_ACCESS_KEY_ID                - Amazon Bedrock 的 AWS 访问密钥
  AWS_SECRET_ACCESS_KEY            - Amazon Bedrock 的 AWS 秘密密钥
  AWS_BEARER_TOKEN_BEDROCK         - Bedrock API 密钥（bearer 令牌）
  AWS_REGION                       - Amazon Bedrock 的 AWS 区域（如 us-east-1）
  ${ENV_AGENT_DIR.padEnd(32)} - 配置目录（默认：~/${CONFIG_DIR_NAME}/agent）
  ${ENV_SESSION_DIR.padEnd(32)} - 会话存储目录（被 --session-dir 覆盖）
  PI_PACKAGE_DIR                   - 覆盖包目录（用于 Nix/Guix store 路径）
  PI_OFFLINE                       - 设为 1/true/yes 时禁用启动网络操作
  PI_TELEMETRY                     - 设为 1/true/yes 或 0/false/no 时覆盖安装遥测
  PI_SHARE_VIEWER_URL              - /share 命令的基础 URL（默认：https://pi.dev/session/）

${chalk.bold("内置工具名：")}
  read   - 读取文件内容
  bash   - 执行 bash 命令
  edit   - 通过查找/替换编辑文件
  write  - 写入文件（创建/覆盖）
  grep   - 搜索文件内容（只读，默认关闭）
  find   - 按通配符模式查找文件（只读，默认关闭）
  ls     - 列出目录内容（只读，默认关闭）
`);
}
