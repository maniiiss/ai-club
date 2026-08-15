import { describe, expect, it } from "vitest";
import {
	formatProjectListPrompt,
	formatProjectSelectionMessage,
	projectBindingFilePath,
	validateWorkspacePurpose,
} from "../src/extensions/gitpilot/project-binding.ts";

describe("Code/Work 项目绑定扩展", () => {
	it("把项目 ID、名称和平台说明交给后续对话", () => {
		const prompt = formatProjectListPrompt([
			{ id: 12, name: "订单中心", status: "进行中", description: "承载订单创建与履约流程" },
		], "C:\\workspace\\orders");

		expect(prompt).toContain("[12] 订单中心（进行中）");
		expect(prompt).toContain("项目说明：承载订单创建与履约流程");
		expect(prompt).toContain("gitpilot_project_bind");
		expect(prompt).toContain("先读取当前工作区的实际代码、README、构建配置或入口文件");
		expect(prompt).toContain("严禁根据目录名、工作区路径、GitPilot Web 项目的名称、状态或说明推断");
	});

	it("拒绝按目录名或不确定措辞推测的工作区用途", () => {
		expect(() => validateWorkspacePurpose("CRM 项目相关工作区（目录名 crm-agent-qa 推测与 CRM 项目的 QA/测试相关）")).toThrow("必须基于已读取的工作区代码");
		expect(() => validateWorkspacePurpose("可能是订单服务的测试工程")).toThrow("必须基于已读取的工作区代码");
	});

	it("保留基于已读取代码的一句话工作区用途", () => {
		expect(validateWorkspacePurpose("提供订单创建、支付与履约流程的 Spring Boot 后端服务")).toBe("提供订单创建、支付与履约流程的 Spring Boot 后端服务");
		expect(validateWorkspacePurpose("   ")).toBeUndefined();
	});

	it("绑定文件位于当前工作区自己的 .gitpilot 目录", () => {
		expect(projectBindingFilePath("C:\\workspace\\orders")).toBe("C:\\workspace\\orders\\.gitpilot\\project-binding.json");
	});

	it("用户可见引导不包含内部工具调用规则", () => {
		const message = formatProjectSelectionMessage();

		expect(message).toContain("项目 ID 或名称");
		expect(message).not.toContain("gitpilot_project_bind");
	});
});
