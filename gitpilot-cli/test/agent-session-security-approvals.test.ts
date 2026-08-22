import { Agent } from "@earendil-works/pi-agent-core";
import { getModel, streamSimple } from "@earendil-works/pi-ai/compat";
import { describe, expect, it } from "vitest";
import { AgentSession } from "../src/core/agent-session.ts";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { DEFAULT_SECURITY_POLICY, type SecurityApprovalHandler } from "../src/core/security/security-policy.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { createInMemoryModelRegistry, getModelRuntime } from "./model-runtime-test-utils.ts";
import { createTestResourceLoader } from "./utilities.ts";

const model = getModel("anthropic", "claude-sonnet-4-5")!;

/**
 * 构造仅用于审批链路验证的最小 AgentSession；
 * 不发起真实模型请求，只驱动 authorizeToolExecution 的策略判断。
 */
async function createSession() {
	const settingsManager = SettingsManager.inMemory();
	const sessionManager = SessionManager.inMemory();
	const authStorage = AuthStorage.inMemory();
	await authStorage.modify("anthropic", async () => ({ type: "api_key", key: "test-key" }));
	const session = new AgentSession({
		agent: new Agent({
			getApiKey: () => "test-key",
			streamFn: streamSimple,
			initialState: {
				model,
				systemPrompt: "You are a helpful assistant.",
				tools: [],
				thinkingLevel: "high",
			},
		}),
		sessionManager,
		settingsManager,
		cwd: process.cwd(),
		modelRuntime: getModelRuntime(await createInMemoryModelRegistry(authStorage)),
		resourceLoader: createTestResourceLoader(),
	});
	return { session };
}

/** 记录调用次数的审批回调；桌面端审批卡片在实现里对应这里的同步返回值。 */
function createCountingHandler(decision: Awaited<ReturnType<SecurityApprovalHandler>>): {
	handler: SecurityApprovalHandler;
	calls: () => number;
} {
	let calls = 0;
	const handler: SecurityApprovalHandler = async () => {
		calls += 1;
		return decision;
	};
	return { handler, calls: () => calls };
}

const BASH_PARAMS = { command: "echo hello" };

describe("AgentSession 会话审批模式", () => {
	it("新会话默认 per_request，Bash 命令触发桌面审批回调", async () => {
		const { session } = await createSession();
		try {
			const { handler, calls } = createCountingHandler("approve_once");
			session.configureSecurityPolicy(DEFAULT_SECURITY_POLICY, handler, () => true);
			expect(session.sessionApprovalMode).toBe("per_request");
			await expect(session.authorizeToolExecution("bash", BASH_PARAMS)).resolves.toBe(true);
			expect(calls()).toBe(1);
		} finally {
			session.dispose();
		}
	});

	it("审批拒绝时工具被阻断", async () => {
		const { session } = await createSession();
		try {
			const { handler } = createCountingHandler("deny");
			session.configureSecurityPolicy(DEFAULT_SECURITY_POLICY, handler, () => true);
			await expect(session.authorizeToolExecution("bash", BASH_PARAMS)).resolves.toBe(false);
		} finally {
			session.dispose();
		}
	});

	it("approve_session 授权在本会话内缓存，同类命令不再重复弹卡", async () => {
		const { session } = await createSession();
		try {
			const { handler, calls } = createCountingHandler("approve_session");
			session.configureSecurityPolicy(DEFAULT_SECURITY_POLICY, handler, () => true);
			await expect(session.authorizeToolExecution("bash", BASH_PARAMS)).resolves.toBe(true);
			await expect(session.authorizeToolExecution("bash", BASH_PARAMS)).resolves.toBe(true);
			expect(calls()).toBe(1);
		} finally {
			session.dispose();
		}
	});

	it("full_access 下需审批工具直接放行，不再触发审批回调", async () => {
		const { session } = await createSession();
		try {
			const { handler, calls } = createCountingHandler("approve_once");
			session.configureSecurityPolicy(DEFAULT_SECURITY_POLICY, handler, () => true);
			session.setSessionApprovalMode("full_access");
			expect(session.sessionApprovalMode).toBe("full_access");
			await expect(session.authorizeToolExecution("bash", BASH_PARAMS)).resolves.toBe(true);
			expect(calls()).toBe(0);
		} finally {
			session.dispose();
		}
	});

	it("页面刷新重推安全策略（configureSecurityPolicy）不重置完全访问模式", async () => {
		const { session } = await createSession();
		try {
			const { handler, calls } = createCountingHandler("approve_once");
			session.configureSecurityPolicy(DEFAULT_SECURITY_POLICY, handler, () => true);
			session.setSessionApprovalMode("full_access");
			// 桌面端 onReady 会重推 set_security_policy，这里对应其副作用 configureSecurityPolicy。
			session.configureSecurityPolicy(DEFAULT_SECURITY_POLICY, handler, () => true);
			expect(session.sessionApprovalMode).toBe("full_access");
			await expect(session.authorizeToolExecution("bash", BASH_PARAMS)).resolves.toBe(true);
			expect(calls()).toBe(0);
		} finally {
			session.dispose();
		}
	});

	it("重推策略仍会清空逐任务审批缓存，approve_session 授权需要重新确认", async () => {
		const { session } = await createSession();
		try {
			const { handler, calls } = createCountingHandler("approve_session");
			session.configureSecurityPolicy(DEFAULT_SECURITY_POLICY, handler, () => true);
			await expect(session.authorizeToolExecution("bash", BASH_PARAMS)).resolves.toBe(true);
			session.configureSecurityPolicy(DEFAULT_SECURITY_POLICY, handler, () => true);
			await expect(session.authorizeToolExecution("bash", BASH_PARAMS)).resolves.toBe(true);
			expect(calls()).toBe(2);
		} finally {
			session.dispose();
		}
	});
});
