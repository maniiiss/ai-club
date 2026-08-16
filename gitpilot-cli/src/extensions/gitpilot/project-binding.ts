/**
 * Code/Work 工作区的 Web 项目绑定扩展。
 * 业务意图：把平台项目绑定保存到当前工作区自己的 .gitpilot 目录，
 * 通过 /project 命令把项目列表交给智能体，再由智能体在用户确认后写入绑定文件。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Static, Type } from "typebox";
import type { ExtensionAPI, InlineExtension, ToolDefinition } from "../../core/extensions/types.ts";
import { installProjectFrameworkSkills } from "../../core/bundled-skills.ts";
import { getPlatformUrl } from "./config.ts";
import { getCachedCliToken, invalidateCliToken, loadCliToken } from "./credentials.ts";
import { listProjects, PlatformApiError, type CliProjectSummary } from "./api.ts";
import { detectFrameworks, type FrameworkDetectionResult } from "./framework-detector.ts";
import {
	formatFrameworkProfilesPrompt,
	formatTechnologyStack,
	sanitizeFrameworkProfiles,
	type FrameworkProfile,
} from "./framework-profile.ts";

export type ProjectBindingMode = "code" | "work";

export interface ProjectBindingDocument {
	schemaVersion: 1;
	boundAt: string;
	workspacePath: string;
	mode: ProjectBindingMode;
	project: CliProjectSummary;
	/** 基于当前工作区已读取代码事实得出的用途总结，帮助后续 Agent 理解本地目录职责。 */
	workspacePurpose?: string;
	/** 基于当前工作区配置和源码确认的主要语言、框架及基础设施，帮助后续 Agent 选择正确的实现方式。 */
	technologyStack?: string;
	/** 本地规则识别出的框架族、版本、模块和 Coding 约束；证据保留在工作区，不上传平台。 */
	frameworkProfiles?: FrameworkProfile[];
	/** 用户补充的项目上下文，区别于平台项目的权威 description。 */
	workspaceContext?: string;
}

interface FrameworkProfileCacheDocument {
	profileSchemaVersion: 1;
	workspacePath: string;
	detectedAt: string;
	profiles: FrameworkProfile[];
}

const projectBindingParams = Type.Object({
	projectId: Type.Number({ description: "用户确认绑定的 GitPilot Web 项目 ID" }),
	workspacePurpose: Type.Optional(Type.String({ description: "先读取当前工作区代码、README、构建配置或入口文件后，基于实际内容总结的一句话用途；没有足够代码依据时不要传入" })),
	technologyStack: Type.Optional(Type.String({ description: "先读取当前工作区的实际配置和源码后，提炼已确认的主要语言、框架、ORM/数据库或构建工具，以逗号分隔的简短技术栈；证据不足时不要传入" })),
	workspaceContext: Type.Optional(Type.String({ description: "用户补充的项目上下文或约束" })),
});

const frameworkDetectParams = Type.Object({
	refresh: Type.Optional(Type.Boolean({ description: "重新读取当前工作区配置和源码并更新框架档案，默认执行刷新" })),
});

type ProjectBindingParams = Static<typeof projectBindingParams>;
type FrameworkDetectParams = Static<typeof frameworkDetectParams>;

export function projectBindingFilePath(cwd: string): string {
	return join(cwd, ".gitpilot", "project-binding.json");
}

export function frameworkProfileFilePath(cwd: string): string {
	return join(cwd, ".gitpilot", "framework-profile.json");
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
		"用户确认后，必须调用 gitpilot_project_bind 工具写入当前工作区绑定；工具会自动读取有限的配置和源码（包括 pom.xml、build.gradle、package.json、requirements.txt、README 等）识别已注册框架并生成 frameworkProfiles/technologyStack。若需要填写 workspacePurpose，必须先读取当前工作区的实际代码、README、构建配置或入口文件，并仅据此总结一句话；人工补充 technologyStack 也必须来自实际配置或源码。严禁根据目录名、工作区路径、GitPilot Web 项目的名称、状态或说明推断技术栈或框架版本；识别状态为 ambiguous/unknown 时不要套用版本特有模板。workspaceContext 可记录用户明确补充的上下文。不要只口头确认而不写文件。",
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

/**
 * technologyStack 只能来自工作区中已读取的配置或源码事实，不能把目录名或项目名称当成技术栈。
 * 绑定信息会被注入后续 Agent 上下文，因此这里过滤明显的推测性表述。
 */
export function validateTechnologyStack(technologyStack: string | undefined): string | undefined {
	const normalized = technologyStack?.trim();
	if (!normalized) return undefined;
	if (speculativeWorkspacePurposePattern.test(normalized)) {
		throw new Error("technologyStack 必须基于已读取的工作区配置或源码总结；请勿依据目录名或项目名称推测，无法确认时省略该字段");
	}
	return normalized;
}

/** 合并用户手写技术栈和本地识别摘要，避免自动识别覆盖用户补充内容。 */
export function mergeTechnologyStack(manual: string | undefined, detected: string | undefined): string | undefined {
	const values = new Set<string>();
	for (const item of `${manual ?? ""}、${detected ?? ""}`.split(/[、,，]/)) {
		const normalized = item.trim();
		if (normalized) values.add(normalized);
	}
	return values.size > 0 ? Array.from(values).join("、") : undefined;
}

async function readFrameworkProfileCache(cwd: string): Promise<FrameworkProfile[]> {
	try {
		const raw = await readFile(frameworkProfileFilePath(cwd), "utf8");
		const parsed = JSON.parse(raw) as Partial<FrameworkProfileCacheDocument>;
		return sanitizeFrameworkProfiles(parsed.profiles);
	} catch {
		return [];
	}
}

async function writeFrameworkProfileCache(cwd: string, profiles: FrameworkProfile[]): Promise<void> {
	const document: FrameworkProfileCacheDocument = {
		profileSchemaVersion: 1,
		workspacePath: cwd,
		detectedAt: new Date().toISOString(),
		profiles: sanitizeFrameworkProfiles(profiles),
	};
	await mkdir(join(cwd, ".gitpilot"), { recursive: true });
	await writeFile(frameworkProfileFilePath(cwd), `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

async function detectWorkspaceFrameworks(cwd: string): Promise<FrameworkDetectionResult> {
	try {
		return await detectFrameworks(cwd);
	} catch {
		// 框架识别失败不能阻断项目绑定；绑定仍可保存人工技术栈和项目上下文。
		return { profiles: [], technologyStack: [], scannedFiles: 0, scannedBytes: 0, partial: true, fingerprint: "scan-error" };
	}
}

/** 刷新框架档案；已有绑定更新绑定文件，没有绑定则写入独立缓存供后续回合使用。 */
export async function refreshFrameworkProfiles(cwd: string): Promise<FrameworkDetectionResult> {
	const detection = await detectWorkspaceFrameworks(cwd);
	installProjectFrameworkSkills(cwd, detection.profiles);
	const detectedStack = mergeTechnologyStack(detection.technologyStack.join("、"), formatTechnologyStack(detection.profiles));
	try {
		const raw = await readFile(projectBindingFilePath(cwd), "utf8");
		const parsed = JSON.parse(raw) as Partial<ProjectBindingDocument>;
		if (parsed.schemaVersion === 1 && parsed.project && typeof parsed.project.id === "number" && typeof parsed.project.name === "string") {
			const existingStack = typeof parsed.technologyStack === "string" ? parsed.technologyStack : undefined;
			const updated: ProjectBindingDocument = {
				...(parsed as ProjectBindingDocument),
				frameworkProfiles: detection.profiles,
				...(mergeTechnologyStack(existingStack, detectedStack) ? { technologyStack: mergeTechnologyStack(existingStack, detectedStack) } : {}),
			};
			await writeFile(projectBindingFilePath(cwd), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
			return detection;
		}
	} catch {
		// 没有有效绑定时落到独立缓存，避免刷新命令改变项目绑定语义。
	}
	await writeFrameworkProfileCache(cwd, detection.profiles);
	return detection;
}

function createProjectBindingTool(cwd: string, mode: ProjectBindingMode, getRecentProjects: () => CliProjectSummary[]): ToolDefinition<typeof projectBindingParams> {
	return {
		name: "gitpilot_project_bind",
		label: "绑定 GitPilot 项目",
		description: "将用户确认的 GitPilot Web 项目绑定到当前工作区的 .gitpilot/project-binding.json。只能绑定平台项目列表中的项目；workspacePurpose 和 technologyStack 必须是读取当前工作区实际代码或配置后得出的总结，证据不足时省略。用户确认后必须调用此工具，不要只在回复中声称已绑定。",
		promptSnippet: "将确认的 Web 项目绑定到当前工作区 JSON",
		promptGuidelines: [
			"用户确认项目 ID 或名称后调用 gitpilot_project_bind，不能凭空猜测项目 ID。",
			"填写 workspacePurpose 前，先用 read、rg 或 ls 审查当前工作区的实际代码、README、构建配置或入口文件；只写一条有代码依据的用途总结。",
			"严禁依据目录名、工作区路径、GitPilot Web 项目名称、状态或说明推断 workspacePurpose；没有足够代码证据时不要传入该字段，也不要写“推测”“可能”等表述。",
			"填写 technologyStack 前，先审查 pom.xml、build.gradle、package.json、requirements.txt、README 或其他实际配置；只写已确认的主要语言、框架、ORM/数据库或构建工具，并用逗号分隔成简短列表。",
			"严禁依据目录名、工作区路径或项目名称推断 technologyStack；没有足够代码证据时不要传入该字段，也不要写“推测”“可能”等表述。",
			"项目绑定工具会自动扫描当前工作区识别快开及其它已注册框架；不要手工伪造 frameworkProfiles，也不要把资料目录名当成版本。",
		],
		parameters: projectBindingParams,
		async execute(_toolCallId, params: ProjectBindingParams, _signal, _onUpdate, _ctx) {
			const recentProjects = getRecentProjects();
			const projects = recentProjects.length > 0 ? recentProjects : await loadProjects();
			const project = projects.find((candidate) => candidate.id === params.projectId);
			if (!project) throw new Error(`项目 ID ${params.projectId} 不在当前用户可访问的项目列表中，请先运行 /project 刷新列表`);

			const workspacePurpose = validateWorkspacePurpose(params.workspacePurpose);
			const detection = await detectWorkspaceFrameworks(cwd);
			installProjectFrameworkSkills(cwd, detection.profiles);
			const detectedTechnologyStack = mergeTechnologyStack(detection.technologyStack.join("、"), formatTechnologyStack(detection.profiles));
			const technologyStack = validateTechnologyStack(mergeTechnologyStack(params.technologyStack, detectedTechnologyStack));
			const document: ProjectBindingDocument = {
				schemaVersion: 1,
				boundAt: new Date().toISOString(),
				workspacePath: cwd,
				mode,
				project,
				...(workspacePurpose ? { workspacePurpose } : {}),
				...(technologyStack ? { technologyStack } : {}),
				...(detection.profiles.length > 0 ? { frameworkProfiles: detection.profiles } : {}),
				...(params.workspaceContext?.trim() ? { workspaceContext: params.workspaceContext.trim() } : {}),
			};
			const filePath = projectBindingFilePath(cwd);
			await mkdir(join(cwd, ".gitpilot"), { recursive: true });
			await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
			return bindingToolResult({
				bound: true,
				filePath,
				project: { id: project.id, name: project.name, description: project.description ?? "" },
				technologyStack: technologyStack ?? "",
				frameworks: detection.profiles.map((profile) => ({
					familyId: profile.familyId,
					adapterId: profile.adapterId ?? "",
					version: profile.version,
					status: profile.status,
					confidence: profile.confidence,
				})),
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
		const profiles = sanitizeFrameworkProfiles(binding.frameworkProfiles);
		if (profiles.length > 0) binding.frameworkProfiles = profiles;
		else delete binding.frameworkProfiles;
		if (!binding.frameworkProfiles) {
			const cachedProfiles = await readFrameworkProfileCache(cwd);
			if (cachedProfiles.length > 0) binding.frameworkProfiles = cachedProfiles;
		}
		// 兼容早期版本写入的目录名推测，不把这类历史值再次注入 Agent 上下文。
		if (typeof binding.workspacePurpose === "string" && speculativeWorkspacePurposePattern.test(binding.workspacePurpose)) {
			delete binding.workspacePurpose;
		}
		// 绑定文件可能被用户手工编辑；技术栈不是字符串或包含推测性措辞时，不注入后续 Agent 上下文。
		if (typeof binding.technologyStack === "string") {
			try {
				binding.technologyStack = validateTechnologyStack(binding.technologyStack);
			} catch {
				delete binding.technologyStack;
			}
		} else if (binding.technologyStack !== undefined) {
			delete binding.technologyStack;
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
		binding.technologyStack ? `- 技术栈：${binding.technologyStack}` : "",
		binding.workspaceContext ? `- 补充上下文：${binding.workspaceContext}` : "",
		binding.frameworkProfiles ? formatFrameworkProfilesPrompt(binding.frameworkProfiles) : "",
		"该绑定来自当前工作区的 .gitpilot/project-binding.json；涉及项目范围时优先遵循这些上下文，若用户要求更换项目则先确认后调用 gitpilot_project_bind 更新文件。",
	].filter(Boolean).join("\n");
}

function frameworkDetectionTool(cwd: string): ToolDefinition<typeof frameworkDetectParams> {
	return {
		name: "gitpilot_framework_detect",
		label: "识别工作区框架",
		description: "读取当前工作区的有限配置和源码证据，识别已注册的自研框架并更新 .gitpilot 档案；不会联网、执行 Shell 或记录凭据。",
		promptSnippet: "刷新当前工作区的框架识别档案",
		promptGuidelines: [
			"需要确认或刷新技术栈时调用 gitpilot_framework_detect，不要根据目录名或项目名猜测框架版本。",
			"识别状态为 ambiguous 或版本 unknown 时，只使用公共编码规则，先读取同类源码再实现版本特有代码。",
		],
		parameters: frameworkDetectParams,
		async execute(_toolCallId, _params: FrameworkDetectParams, _signal, _onUpdate, _ctx) {
			const detection = await refreshFrameworkProfiles(cwd);
			return bindingToolResult({
				refreshed: true,
				filePath: projectBindingFilePath(cwd),
				profileCachePath: frameworkProfileFilePath(cwd),
				scannedFiles: detection.scannedFiles,
				scannedBytes: detection.scannedBytes,
				partial: detection.partial,
				technologyStack: detection.technologyStack,
				frameworks: detection.profiles.map((profile) => ({
					familyId: profile.familyId,
					adapterId: profile.adapterId ?? "",
					version: profile.version,
					status: profile.status,
					confidence: profile.confidence,
					modules: profile.modules,
				})),
				message: "已刷新当前工作区框架档案；后续 Coding 回合会按已确认版本和模块注入规则。",
			});
		},
	};
}

/** 创建按模式隔离 cwd 的 Code/Work 项目绑定 extension。 */
export function createProjectBindingExtension(mode: ProjectBindingMode, cwd: string): InlineExtension {
	return {
		name: `gitpilot-project-binding-${mode}`,
		factory: (pi: ExtensionAPI) => {
			let recentProjects: CliProjectSummary[] = [];
			let pendingProjectPrompt: string | undefined;
			pi.registerTool(createProjectBindingTool(cwd, mode, () => recentProjects));
			pi.registerTool(frameworkDetectionTool(cwd));
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
				const cachedProfiles = binding ? [] : await readFrameworkProfileCache(cwd);
				const projectPrompt = pendingProjectPrompt;
				pendingProjectPrompt = undefined;
				const additions = [
					binding ? bindingSystemPrompt(binding) : "",
					!binding && cachedProfiles.length > 0 ? formatFrameworkProfilesPrompt(cachedProfiles) : "",
					projectPrompt ?? "",
				].filter(Boolean);
				if (additions.length === 0) return;
				return { systemPrompt: `${event.systemPrompt}\n${additions.join("\n\n")}` };
			});
		},
	};
}
