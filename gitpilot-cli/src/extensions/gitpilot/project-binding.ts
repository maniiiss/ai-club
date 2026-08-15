/**
 * Code/Work 工作区的 Web 项目绑定扩展。
 * 业务意图：把平台项目绑定保存到当前工作区自己的 .gitpilot 目录，
 * 通过 /project 命令把项目列表交给智能体，再由智能体在用户确认后写入绑定文件。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Static, Type } from "typebox";
import type { ExtensionAPI, InlineExtension, ToolDefinition } from "../../core/extensions/types.ts";
import { getPlatformUrl } from "./config.ts";
import { getCachedCliToken, invalidateCliToken, loadCliToken } from "./credentials.ts";
import { listProjects, PlatformApiError, type CliProjectSummary } from "./api.ts";

export type ProjectBindingMode = "code" | "work";

export interface ProjectBindingDocument {
	schemaVersion: 1;
	boundAt: string;
	workspacePath: string;
	mode: ProjectBindingMode;
	project: CliProjectSummary;
	/** 基于当前工作区已读取代码事实得出的用途总结，帮助后续 Agent 理解本地目录职责。 */
	workspacePurpose?: string;
	/** 用户补充的项目上下文，区别于平台项目的权威 description。 */
	workspaceContext?: string;
}

const projectBindingParams = Type.Object({
	projectId: Type.Number({ description: "用户确认绑定的 GitPilot Web 项目 ID" }),
	workspacePurpose: Type.Optional(Type.String({ description: "先读取当前工作区代码、README、构建配置或入口文件后，基于实际内容总结的一句话用途；没有足够代码依据时不要传入" })),
	workspaceContext: Type.Optional(Type.String({ description: "用户补充的项目上下文或约束" })),
});

type ProjectBindingParams = Static<typeof projectBindingParams>;

export function projectBindingFilePath(cwd: string): string {
	return join(cwd, ".gitpilot", "project-binding.json");
}

async function loadProjects(keyword?: string): Promise<CliProjectSummary[]> {
	const platformUrl = getPlatformUrl();
	if (!platformUrl) throw new Error("未配置 GitPilot 平台地址，请先设置平台地址或运行 /login gitpilot");
	const token = getCachedCliToken(platformUrl) ?? (await loadCliToken(platformUrl));
	if (!token) throw new Error("未登录 GitPilot 平台，请运行 /login gitpilot");
	return listProjects(platformUrl, token, keyword);
}

function isInvalidCliToken(error: unknown): boolean {
	return error instanceof PlatformApiError
		&& (error.status === 401 || /invalid auth token|cli token.*(无效|过期|撤销)/i.test(error.message));
}

function projectDescription(project: CliProjectSummary): string {
	const description = project.description?.trim();
	return description ? `\n  - 项目说明：${description}` : "";
}

/** 将平台返回的项目清单转成仅供模型使用的绑定上下文，不直接作为用户气泡展示。 */
export function formatProjectListPrompt(projects: CliProjectSummary[], workspacePath: string): string {
	const lines = [
		"请协助用户绑定当前工作区对应的 GitPilot Web 项目。",
		`当前工作区：${workspacePath}`,
		"以下项目清单刚刚从平台接口获取，项目 ID 是唯一标识：",
		"",
	];
	for (const project of projects) {
		lines.push(`- [${project.id}] ${project.name}${project.status ? `（${project.status}）` : ""}${projectDescription(project)}`);
	}
	lines.push(
		"",
		"请先用中文向用户展示项目名称、ID 和项目说明，并请用户回复项目 ID 或名称进行确认。",
		"用户确认后，必须调用 gitpilot_project_bind 工具写入当前工作区绑定；如果需要填写 workspacePurpose，必须先读取当前工作区的实际代码、README、构建配置或入口文件，并仅据此总结一句话。严禁根据目录名、工作区路径、GitPilot Web 项目的名称、状态或说明推断；没有足够代码依据时省略 workspacePurpose。workspaceContext 可记录用户明确补充的上下文。不要只口头确认而不写文件。",
	);
	return lines.join("\n");
}

/**
 * 生成用户可见的简短引导，避免把工具调用规则、工作区路径等内部提示词打印到对话气泡。
 */
export function formatProjectSelectionMessage(): string {
	return "已获取当前账号可访问的 GitPilot Web 项目，请回复项目 ID 或名称，确认要绑定到这个工作区的项目。";
}

function bindingToolResult(value: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], details: undefined };
}

const speculativeWorkspacePurposePattern = /推测|猜测|目录名|路径名|可能是|大概|看起来像|似乎是/i;

/**
 * workspacePurpose 只能是 Agent 阅读本地代码后得到的结论。
 * 这里拦截可识别的推测性措辞，防止目录名等弱信号被写入长期绑定信息。
 */
export function validateWorkspacePurpose(workspacePurpose: string | undefined): string | undefined {
	const normalized = workspacePurpose?.trim();
	if (!normalized) return undefined;
	if (speculativeWorkspacePurposePattern.test(normalized)) {
		throw new Error("workspacePurpose 必须基于已读取的工作区代码、README、构建配置或入口文件总结；请勿依据目录名或路径推测，无法确认时省略该字段");
	}
	return normalized;
}

function createProjectBindingTool(cwd: string, mode: ProjectBindingMode, getRecentProjects: () => CliProjectSummary[]): ToolDefinition<typeof projectBindingParams> {
	return {
		name: "gitpilot_project_bind",
		label: "绑定 GitPilot 项目",
		description: "将用户确认的 GitPilot Web 项目绑定到当前工作区的 .gitpilot/project-binding.json。只能绑定平台项目列表中的项目；workspacePurpose 必须是读取当前工作区实际代码后得出的一句话总结，证据不足时省略。用户确认后必须调用此工具，不要只在回复中声称已绑定。",
		promptSnippet: "将确认的 Web 项目绑定到当前工作区 JSON",
		promptGuidelines: [
			"用户确认项目 ID 或名称后调用 gitpilot_project_bind，不能凭空猜测项目 ID。",
			"填写 workspacePurpose 前，先用 read、rg 或 ls 审查当前工作区的实际代码、README、构建配置或入口文件；只写一条有代码依据的用途总结。",
			"严禁依据目录名、工作区路径、GitPilot Web 项目名称、状态或说明推断 workspacePurpose；没有足够代码证据时不要传入该字段，也不要写“推测”“可能”等表述。",
		],
		parameters: projectBindingParams,
		async execute(_toolCallId, params: ProjectBindingParams, _signal, _onUpdate, _ctx) {
			const recentProjects = getRecentProjects();
			const projects = recentProjects.length > 0 ? recentProjects : await loadProjects();
			const project = projects.find((candidate) => candidate.id === params.projectId);
			if (!project) throw new Error(`项目 ID ${params.projectId} 不在当前用户可访问的项目列表中，请先运行 /project 刷新列表`);

			const workspacePurpose = validateWorkspacePurpose(params.workspacePurpose);
			const document: ProjectBindingDocument = {
				schemaVersion: 1,
				boundAt: new Date().toISOString(),
				workspacePath: cwd,
				mode,
				project,
				...(workspacePurpose ? { workspacePurpose } : {}),
				...(params.workspaceContext?.trim() ? { workspaceContext: params.workspaceContext.trim() } : {}),
			};
			const filePath = projectBindingFilePath(cwd);
			await mkdir(join(cwd, ".gitpilot"), { recursive: true });
			await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
			return bindingToolResult({
				bound: true,
				filePath,
				project: { id: project.id, name: project.name, description: project.description ?? "" },
				message: "已写入当前工作区项目绑定。后续回合会自动收到该项目上下文。",
			});
		},
	};
}

async function readBinding(cwd: string): Promise<ProjectBindingDocument | null> {
	try {
		const raw = await readFile(projectBindingFilePath(cwd), "utf8");
		const parsed = JSON.parse(raw) as Partial<ProjectBindingDocument>;
		if (parsed.schemaVersion !== 1 || !parsed.project || typeof parsed.project.id !== "number" || typeof parsed.project.name !== "string") return null;
		const binding = parsed as ProjectBindingDocument;
		// 兼容早期版本写入的目录名推测，不把这类历史值再次注入 Agent 上下文。
		if (typeof binding.workspacePurpose === "string" && speculativeWorkspacePurposePattern.test(binding.workspacePurpose)) {
			delete binding.workspacePurpose;
		}
		return binding;
	} catch {
		return null;
	}
}

function bindingSystemPrompt(binding: ProjectBindingDocument): string {
	const project = binding.project;
	return [
		"",
		"## 当前工作区的 GitPilot Web 项目绑定",
		`- 项目 ID：${project.id}`,
		`- 项目名称：${project.name}`,
		project.status ? `- 项目状态：${project.status}` : "",
		project.description?.trim() ? `- 项目说明：${project.description.trim()}` : "",
		binding.workspacePurpose ? `- 本地工作区用途：${binding.workspacePurpose}` : "",
		binding.workspaceContext ? `- 补充上下文：${binding.workspaceContext}` : "",
		"该绑定来自当前工作区的 .gitpilot/project-binding.json；涉及项目范围时优先遵循这些上下文，若用户要求更换项目则先确认后调用 gitpilot_project_bind 更新文件。",
	].filter(Boolean).join("\n");
}

/** 创建按模式隔离 cwd 的 Code/Work 项目绑定 extension。 */
export function createProjectBindingExtension(mode: ProjectBindingMode, cwd: string): InlineExtension {
	return {
		name: `gitpilot-project-binding-${mode}`,
		factory: (pi: ExtensionAPI) => {
			let recentProjects: CliProjectSummary[] = [];
			let pendingProjectPrompt: string | undefined;
			pi.registerTool(createProjectBindingTool(cwd, mode, () => recentProjects));
			pi.registerCommand("project", {
				description: "查询并通过对话绑定当前工作区的 GitPilot Web 项目",
				handler: async (args, ctx) => {
					try {
						recentProjects = await loadProjects(args.trim() || undefined);
					} catch (error) {
						if (isInvalidCliToken(error)) {
							const platformUrl = getPlatformUrl();
							if (platformUrl) await invalidateCliToken(platformUrl);
							ctx.ui.notify("平台登录已失效，请运行 /login gitpilot 重新登录", "error");
							return;
						}
						ctx.ui.notify(`获取项目列表失败：${error instanceof Error ? error.message : String(error)}`, "error");
						return;
					}
					if (recentProjects.length === 0) {
						ctx.ui.notify(args.trim() ? `没有匹配“${args.trim()}”的项目` : "当前账号没有可访问的项目", "info");
						return;
					}
					// 项目清单和工具调用约束只注入本轮 system prompt，避免作为用户消息回显。
					pendingProjectPrompt = formatProjectListPrompt(recentProjects, cwd);
					const visibleMessage = formatProjectSelectionMessage();
					if (ctx.isIdle()) pi.sendUserMessage(visibleMessage);
					else pi.sendUserMessage(visibleMessage, { deliverAs: "followUp" });
				},
			});
			pi.on("before_agent_start", async (event) => {
				const binding = await readBinding(cwd);
				const projectPrompt = pendingProjectPrompt;
				pendingProjectPrompt = undefined;
				const additions = [
					binding ? bindingSystemPrompt(binding) : "",
					projectPrompt ?? "",
				].filter(Boolean);
				if (additions.length === 0) return;
				return { systemPrompt: `${event.systemPrompt}\n${additions.join("\n\n")}` };
			});
		},
	};
}
