/**
 * 工作区路径和 Shell 命令安全策略。
 *
 * 业务意图：在启动 Bash 前拒绝最危险的全盘扫描与明显越界命令，
 * 防止模型错误生成的命令再次占满整台 Windows 机器。
 */

import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ApprovalRisk } from "./security-policy.ts";

export interface CommandPolicyContext {
	workspacePath: string;
	command: string;
	requestedPath?: string;
}

export interface CommandPolicyResult {
	allowed: boolean;
	needsApproval: boolean;
	risk?: ApprovalRisk;
	reason?: string;
}

const ROOT_SCAN_PATTERNS: RegExp[] = [
	/(?:^|\s)(?:find|grep|rg)\s+(?:-[^\s]+\s+)*\/(?:\s|$)/i,
	/(?:^|\s)(?:find|grep|rg)\s+(?:-[^\s]+\s+)*[A-Za-z]:[\\/]/i,
	/(?:^|\s)(?:Get-ChildItem|gci|dir)\s+(?:-[^\s]+\s+)*[A-Za-z]:[\\/]/i,
];

const DANGEROUS_COMMAND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	{ pattern: /(?:^|\s)(?:sudo|runas|Start-Process\s+.*-Verb\s+RunAs)(?:\s|$)/i, reason: "提权命令必须由用户明确处理" },
	{ pattern: /(?:^|\s)(?:rm\s+-rf|rmdir\s+\/s|Remove-Item\s+.*-Recurse)(?:\s|$)/i, reason: "递归删除命令需要显式审批" },
	{ pattern: /(?:^|\s)(?:curl|wget|Invoke-WebRequest|iwr|git|npm|pnpm|yarn|pip)(?:\s|$)/i, reason: "可能访问网络的命令需要审批" },
];

const SENSITIVE_PATH_COMMAND_PATTERN = /(?:^|\s)(?:[A-Za-z]:[\\/](?:Windows|Program Files(?: \(x86\))?|Users[\\/]Public)|\/(?:etc|proc|sys|dev|boot))(?:[\\/]|\s|$)/i;

/** 判断候选路径是否位于工作区内，避免前缀相同目录绕过校验。 */
export function isPathInsideWorkspace(workspacePath: string, candidatePath: string): boolean {
	const root = resolve(workspacePath);
	const candidate = resolve(workspacePath, candidatePath);
	const relativePath = relative(root, candidate);
	return relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath));
}

/** 规范化工作区内的相对路径；越界路径返回 null。 */
export function normalizeWorkspacePath(workspacePath: string, candidatePath: string): string | null {
	if (!isPathInsideWorkspace(workspacePath, candidatePath)) return null;
	return resolve(workspacePath, candidatePath);
}

/** 系统敏感目录即使用户误选也不允许通过普通工具访问。 */
function isSensitiveSystemPath(candidatePath: string): boolean {
	const normalized = candidatePath.replaceAll("\\", "/").toLowerCase();
	return /^(?:[a-z]:\/windows(?:\/|$)|[a-z]:\/program files(?: \(x86\))?(?:\/|$)|[a-z]:\/users\/public(?:\/|$)|\/(?:etc|proc|sys|dev|boot)(?:\/|$))/.test(normalized);
}

/** 工具参数直接指向根目录时视为全盘扫描企图，而不是普通工作区外读取。 */
function isFilesystemRoot(candidatePath: string): boolean {
	const normalized = candidatePath.trim().replaceAll("\\", "/");
	return normalized === "/" || /^[A-Za-z]:\/$/.test(normalized);
}

/** 从工具参数中提取常见路径字段，统一应用工作区边界判断。 */
function collectToolPaths(params: unknown): string[] {
	if (!params || typeof params !== "object") return [];
	const record = params as Record<string, unknown>;
	return ["path", "filePath", "file_path", "target", "cwd"].flatMap((key) => {
		const value = record[key];
		return typeof value === "string" && value.trim() ? [value.trim()] : [];
	});
}

/** 对 Bash 命令做启动前策略判断；此处不是完整 Shell 解析器，强规则优先拒绝。 */
export function evaluateCommandPolicy(context: CommandPolicyContext): CommandPolicyResult {
	const command = context.command.trim();
	if (!command) return { allowed: false, needsApproval: false, reason: "命令不能为空" };
	for (const pattern of ROOT_SCAN_PATTERNS) {
		if (pattern.test(command)) {
			return { allowed: false, needsApproval: false, risk: "dangerous", reason: "禁止扫描工作区之外的整台磁盘" };
		}
	}
	if (SENSITIVE_PATH_COMMAND_PATTERN.test(command)) {
		return { allowed: false, needsApproval: false, risk: "dangerous", reason: "禁止访问系统敏感目录" };
	}
	for (const item of DANGEROUS_COMMAND_PATTERNS) {
		if (item.pattern.test(command)) {
			return { allowed: true, needsApproval: true, risk: item.pattern.source.includes("curl|wget|Invoke") ? "network" : "dangerous", reason: item.reason };
		}
	}
	return { allowed: true, needsApproval: true, risk: "command", reason: "Bash 命令需要桌面审批" };
}

/** 工具级风险判断：读取和搜索自动执行，修改与 Bash 需要审批。 */
export function evaluateToolRisk(toolName: string, params: unknown, workspacePath = "."): CommandPolicyResult {
	const paths = collectToolPaths(params);
	if ((toolName === "find" || toolName === "grep") && paths.some(isFilesystemRoot)) {
		return { allowed: false, needsApproval: false, risk: "dangerous", reason: "禁止使用搜索工具扫描整台磁盘" };
	}
	if (paths.some((path) => isSensitiveSystemPath(path))) {
		return { allowed: false, needsApproval: false, risk: "dangerous", reason: "禁止访问系统敏感目录" };
	}
	if (paths.some((path) => !isPathInsideWorkspace(workspacePath, path))) {
		return {
			allowed: true,
			needsApproval: true,
			risk: "outside_workspace",
			reason: "目标路径位于当前工作区之外，需要桌面审批",
		};
	}
	if (toolName === "read" || toolName === "grep" || toolName === "find" || toolName === "ls") {
		return { allowed: true, needsApproval: false };
	}
	if (toolName === "bash") {
		const command = typeof (params as { command?: unknown })?.command === "string" ? String((params as { command: string }).command) : "";
		return evaluateCommandPolicy({ workspacePath, command });
	}
	if (toolName === "edit" || toolName === "write") {
		return { allowed: true, needsApproval: true, risk: "write", reason: "文件修改需要桌面审批" };
	}
	return { allowed: true, needsApproval: true, risk: "dangerous", reason: "未识别的工具需要桌面审批" };
}
