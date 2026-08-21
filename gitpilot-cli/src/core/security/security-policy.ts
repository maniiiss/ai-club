/**
 * 桌面端安全策略模型。
 *
 * 业务意图：把“审批策略”和“执行边界”集中建模，避免 Bash、文件工具和
 * RPC 层各自维护一套不一致的安全默认值。
 */

export type SandboxMode = "windows-native" | "gondolin";

export type ApprovalPolicy = "read-auto-write-command-approve";

export type ApprovalDecision = "approve_once" | "approve_session" | "deny";

/** 会话级访问权限：分请求逐个审批，或本会话内一次授权全部放行。 */
export type SessionApprovalMode = "per_request" | "full_access";

export type ApprovalRisk = "write" | "command" | "outside_workspace" | "network" | "dangerous";

/** 当前桌面端采用的安全执行策略。 */
export interface SecurityPolicy {
	/** 当前任务使用的执行边界。 */
	sandboxMode: SandboxMode;
	/** 网络默认策略；原生模式通过风险审批执行，Gondolin 模式由沙箱执行器强制。 */
	network: "deny-by-default";
	/** 工具审批策略。 */
	approvalPolicy: ApprovalPolicy;
	/** 未指定 timeout 时使用的秒数。 */
	defaultTimeoutSeconds: number;
	/** 单次 Bash 命令允许的最大秒数。 */
	maxTimeoutSeconds: number;
}

/** 桌面端默认安全策略；任务创建时复制，避免执行中途被设置变更影响。 */
export const DEFAULT_SECURITY_POLICY: Readonly<SecurityPolicy> = Object.freeze({
	sandboxMode: "windows-native",
	network: "deny-by-default",
	approvalPolicy: "read-auto-write-command-approve",
	defaultTimeoutSeconds: 120,
	maxTimeoutSeconds: 600,
});

/** 对外暴露的沙箱能力状态。 */
export interface SandboxStatus {
	mode: SandboxMode;
	available: boolean;
	initialized: boolean;
	message?: string;
	workspacePath?: string;
	guestWorkspacePath?: string;
	/** 增强模式能力明细，供 Desktop 安装引导展示。 */
	wsl2Installed?: boolean;
	virtualizationReady?: boolean;
	distributionInstalled?: boolean;
	nodeInstalled?: boolean;
	gondolinWorkerInstalled?: boolean;
}

/** 交给桌面端审批卡片展示的工具请求摘要。 */
export interface SecurityApprovalRequest {
	approvalId: string;
	sessionId: string;
	toolName: string;
	risk: ApprovalRisk;
	title: string;
	summary: string;
	command?: string;
	paths?: string[];
	cwd: string;
	expiresAt: number;
}

/** 桌面端返回的审批结果；等待期间 Agent 工具调用保持暂停。 */
export type SecurityApprovalHandler = (request: SecurityApprovalRequest, signal?: AbortSignal) => Promise<ApprovalDecision>;

/** 预留给 Windows 原生和 Gondolin 执行器的统一工具请求。 */
export interface ToolExecutionRequest {
	requestId: string;
	toolName: string;
	params: unknown;
	cwd: string;
}

/** 执行器返回的最小结果，具体工具输出仍由 Agent 工具协议负责。 */
export interface ToolExecutionResult {
	exitCode?: number | null;
	output?: string;
}

/** 执行器的最小生命周期接口，为后续接入 Gondolin 保留稳定边界。 */
export interface SandboxExecutor {
	/** 初始化当前任务的执行环境；失败时必须阻断任务，不得静默降级。 */
	initialize(policy: SecurityPolicy): Promise<void>;
	/** 执行经过安全策略检查的工具请求。 */
	executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult>;
	/** 结束一个正在执行的工具请求。 */
	abort(requestId: string): Promise<void>;
	/** 关闭执行器并清理子进程或虚拟机。 */
	shutdown(): Promise<void>;
	/** 返回桌面端可展示的能力状态。 */
	getStatus(): SandboxStatus;
}

/** 复制策略，防止调用方修改全局默认对象。 */
export function cloneSecurityPolicy(policy: SecurityPolicy): SecurityPolicy {
	return { ...policy };
}

/** 校验并归一化桌面端传入的策略，非法值直接阻断而不是放宽权限。 */
export function normalizeSecurityPolicy(input: Partial<SecurityPolicy> | undefined): SecurityPolicy {
	const policy = { ...DEFAULT_SECURITY_POLICY, ...(input ?? {}) };
	if (policy.sandboxMode !== "windows-native" && policy.sandboxMode !== "gondolin") {
		throw new Error("不支持的沙箱模式");
	}
	if (policy.network !== "deny-by-default") {
		throw new Error("网络策略只能是 deny-by-default");
	}
	if (policy.approvalPolicy !== "read-auto-write-command-approve") {
		throw new Error("不支持的审批策略");
	}
	if (!Number.isInteger(policy.defaultTimeoutSeconds) || policy.defaultTimeoutSeconds <= 0) {
		throw new Error("默认 timeout 必须是正整数秒数");
	}
	if (!Number.isInteger(policy.maxTimeoutSeconds) || policy.maxTimeoutSeconds < policy.defaultTimeoutSeconds || policy.maxTimeoutSeconds > 600) {
		throw new Error("最大 timeout 必须不小于默认值且不超过 600 秒");
	}
	return policy;
}
