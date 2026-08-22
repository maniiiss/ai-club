/**
 * GitPilot 桌面端沙箱能力探测与生命周期边界。
 *
 * 业务意图：Windows 原生模式提供策略防护；Gondolin 模式在 WSL2 条件不满足时
 * 明确返回不可用，禁止调用方悄悄回退到无限制本机执行。
 */

import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { promisify } from "node:util";
import { resolve } from "node:path";
import type {
	SandboxExecutor,
	SandboxStatus,
	SecurityPolicy,
	ToolExecutionRequest,
	ToolExecutionResult,
} from "./security-policy.ts";

const execFileAsync = promisify(execFile);

/** Windows 原生模式：不伪装成系统级网络隔离，只负责策略状态和任务边界。 */
export class WindowsNativeExecutor implements SandboxExecutor {
	private status: SandboxStatus = { mode: "windows-native", available: true, initialized: false };
	private readonly workspacePath: string;

	constructor(workspacePath: string) {
		this.workspacePath = workspacePath;
	}

	async initialize(_policy: SecurityPolicy): Promise<void> {
		const workspace = resolve(this.workspacePath);
		if (!existsSync(workspace) || !statSync(workspace).isDirectory()) {
			this.status = { mode: "windows-native", available: false, initialized: false, message: "工作区目录不存在" };
			throw new Error("Windows 原生安全执行器初始化失败：工作区目录不存在");
		}
		this.status = {
			mode: "windows-native",
			available: true,
			initialized: true,
			workspacePath: workspace,
			message: "Windows 原生模式提供命令和路径策略防护，不承诺任意子进程的网络隔离",
		};
	}

	async executeTool(_request: ToolExecutionRequest): Promise<ToolExecutionResult> {
		if (!this.status.initialized) throw new Error("安全执行器尚未初始化，已阻断工具执行");
		throw new Error("Windows 原生执行器由 Agent 内置工具负责实际执行");
	}

	async abort(_requestId: string): Promise<void> {}

	async shutdown(): Promise<void> {
		this.status = { ...this.status, initialized: false };
	}

	getStatus(): SandboxStatus {
		return { ...this.status };
	}
}

interface WslProbeResult {
	wslInstalled: boolean;
	virtualizationReady: boolean;
	distributionInstalled: boolean;
	nodeInstalled: boolean;
	workerInstalled: boolean;
}

/** WSL2 + Gondolin 模式：只做能力检测和阻断，不后台安装系统组件。 */
export class GondolinExecutor implements SandboxExecutor {
	private status: SandboxStatus = { mode: "gondolin", available: false, initialized: false };
	private readonly workspacePath: string;

	constructor(workspacePath: string) {
		this.workspacePath = workspacePath;
	}

	private async probe(): Promise<WslProbeResult> {
		if (process.platform !== "win32") return { wslInstalled: false, virtualizationReady: false, distributionInstalled: false, nodeInstalled: false, workerInstalled: false };
		try {
			await execFileAsync("wsl.exe", ["--status"], { timeout: 5_000, windowsHide: true });
		} catch {
			return { wslInstalled: false, virtualizationReady: false, distributionInstalled: false, nodeInstalled: false, workerInstalled: false };
		}
		let distributionInstalled = false;
		try {
			const result = await execFileAsync("wsl.exe", ["-l", "-q"], { timeout: 5_000, windowsHide: true });
			distributionInstalled = result.stdout.split(/\r?\n/).some((line) => line.trim().length > 0);
		} catch {
			distributionInstalled = false;
		}
		let nodeInstalled = false;
		if (distributionInstalled) {
			try {
				await execFileAsync("wsl.exe", ["--", "node", "--version"], { timeout: 5_000, windowsHide: true });
				nodeInstalled = true;
			} catch {
				nodeInstalled = false;
			}
		}
		// Gondolin worker 的正式打包目录由 Desktop 安装器注入；环境变量只用于开发和测试探测。
		const workerInstalled = Boolean(process.env.GITPILOT_GONDOLIN_WORKER);
		return { wslInstalled: true, virtualizationReady: true, distributionInstalled, nodeInstalled, workerInstalled };
	}

	async initialize(_policy: SecurityPolicy): Promise<void> {
		const workspace = resolve(this.workspacePath);
		const probe = await this.probe();
		const available = probe.wslInstalled && probe.virtualizationReady && probe.distributionInstalled && probe.nodeInstalled && probe.workerInstalled && existsSync(workspace);
		this.status = {
			mode: "gondolin",
			available,
			initialized: available,
			workspacePath: workspace,
			guestWorkspacePath: "/workspace",
			wsl2Installed: probe.wslInstalled,
			virtualizationReady: probe.virtualizationReady,
			distributionInstalled: probe.distributionInstalled,
			nodeInstalled: probe.nodeInstalled,
			gondolinWorkerInstalled: probe.workerInstalled,
			message: available
				? "Gondolin 增强隔离已就绪"
				: !probe.wslInstalled
					? "未检测到 WSL2，请安装后重新检测"
					: !probe.distributionInstalled
						? "未检测到 Linux 发行版，请完成 WSL2 初始化"
						: !probe.nodeInstalled
							? "Linux 发行版中未检测到 Node.js worker 运行环境"
							: !probe.workerInstalled
							? "未检测到 Gondolin worker，请安装 GitPilot 沙箱组件"
							: "Gondolin 工作区不可用",
		};
		if (!available) throw new Error(`Gondolin 安全执行器初始化失败：${this.status.message}`);
	}

	async executeTool(_request: ToolExecutionRequest): Promise<ToolExecutionResult> {
		if (!this.status.initialized) throw new Error("Gondolin 未初始化，已阻断工具执行");
		throw new Error("Gondolin worker 尚未接入当前构建");
	}

	async abort(_requestId: string): Promise<void> {}

	async shutdown(): Promise<void> {
		this.status = { ...this.status, initialized: false };
	}

	getStatus(): SandboxStatus {
		return { ...this.status };
	}
}
