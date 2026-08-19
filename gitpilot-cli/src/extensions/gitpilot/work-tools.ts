import { access, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Type } from "typebox";
import type { ToolDefinition } from "../../core/extensions/types.ts";
import { getPlatformUrl } from "./config.ts";
import { loadCliToken } from "./credentials.ts";
import { requestJson } from "./api.ts";
import { createOfficeWorkToolDefinitions } from "./office-tools.ts";

const projectQuery = Type.Object({ keyword: Type.Optional(Type.String()) });
const taskQuery = Type.Object({ projectId: Type.Optional(Type.Number()), keyword: Type.Optional(Type.String()), page: Type.Optional(Type.Number()), size: Type.Optional(Type.Number()) });
const taskId = Type.Object({ taskId: Type.Number() });
const taskCreate = Type.Object({ projectId: Type.Number(), name: Type.String(), description: Type.Optional(Type.String()), status: Type.Optional(Type.String()), priority: Type.Optional(Type.String()) });
const taskUpdate = Type.Object({ taskId: Type.Number(), fields: Type.Record(Type.String(), Type.Unknown()) });
const commentWrite = Type.Object({ taskId: Type.Number(), content: Type.String() });
const attachment = Type.Object({ taskId: Type.Number(), attachmentId: Type.Optional(Type.Number()) });
const upload = Type.Object({ taskId: Type.Number(), path: Type.String() });

async function platform<T>(workTaskId: string, path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
	const platformUrl = getPlatformUrl();
	if (!platformUrl) throw new Error("未配置 GitPilot 平台地址");
	const token = await loadCliToken(platformUrl);
	if (!token) throw new Error("未登录 GitPilot 平台");
	return requestJson<T>(platformUrl, path, { ...options, token, headers: { "X-GitPilot-Work-Task-Id": workTaskId } });
}

function result(value: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(value) }], details: undefined }; }

export function createGitPilotWorkToolDefinitions(workTaskId: string, workspacePath: string): Array<ToolDefinition<any, any, any>> {
	const readTool = (name: string, description: string, parameters: any, execute: (params: any) => Promise<unknown>): ToolDefinition<any> => ({ name, label: name, description, promptSnippet: description, parameters, async execute(_id, params) { return result(await execute(params)); } });
	const writeTool = (name: string, description: string, parameters: any, execute: (params: any) => Promise<unknown>): ToolDefinition<any> => ({ name, label: name, description, promptSnippet: description, parameters, async execute(_id, params, _signal, _update, ctx) { if (!(await ctx.ui.confirm("确认 GitPilot 公众端操作", `${name}\n\n${JSON.stringify(params)}`))) throw new Error("用户取消了公众端写操作"); return result(await execute(params)); } });
	return [
		...createOfficeWorkToolDefinitions(workspacePath),
		readTool("gitpilot_project_query", "查询当前用户可访问的 GitPilot 公众端项目。", projectQuery, async (params) => platform(workTaskId, `/api/projects${params.keyword ? `?keyword=${encodeURIComponent(params.keyword)}` : ""}`)),
		readTool("gitpilot_work_item_query", "查询当前用户有权限访问的公众端工作项。", taskQuery, async (params) => { const query = new URLSearchParams(); for (const [key, value] of Object.entries(params)) if (value != null) query.set(key, String(value)); return platform(workTaskId, `/api/tasks?${query.toString()}`); }),
		readTool("gitpilot_work_item_get", "读取公众端工作项详情。", taskId, async (params) => platform(workTaskId, `/api/tasks/${params.taskId}`)),
		writeTool("gitpilot_work_item_create", "创建公众端工作项；执行前需要 Desktop 确认。", taskCreate, async (params) => platform(workTaskId, "/api/tasks", { method: "POST", body: { name: params.name, projectId: params.projectId, workItemType: "任务", taskType: "任务", status: params.status ?? "待处理", priority: params.priority ?? "中", description: params.description ?? "", collaboratorUserIds: [], devPassed: false, testPassed: false } })),
		writeTool("gitpilot_work_item_update", "更新公众端工作项；执行前需要 Desktop 确认。", taskUpdate, async (params) => platform(workTaskId, `/api/tasks/${params.taskId}`, { method: "PUT", body: params.fields })),
		readTool("gitpilot_work_item_comments", "读取公众端工作项评论。", taskId, async (params) => platform(workTaskId, `/api/tasks/${params.taskId}/comments`)),
		writeTool("gitpilot_work_item_comment_add", "追加公众端工作项评论；执行前需要 Desktop 确认。", commentWrite, async (params) => platform(workTaskId, `/api/tasks/${params.taskId}/comments`, { method: "POST", body: { content: params.content } })),
		readTool("gitpilot_work_item_attachments", "读取公众端工作项附件列表。", taskId, async (params) => platform(workTaskId, `/api/tasks/${params.taskId}/links`)),
		writeTool("gitpilot_work_item_attachment_delete", "删除公众端工作项附件；执行前需要 Desktop 确认。", attachment, async (params) => platform(workTaskId, `/api/tasks/${params.taskId}/attachments/${params.attachmentId}`, { method: "DELETE" })),
		writeTool("gitpilot_work_item_attachment_upload", "从当前 Work 工作区上传公众端工作项附件；执行前需要 Desktop 确认。", upload, async (params) => {
			const root = resolve(workspacePath);
			const target = resolve(root, params.path);
			const rel = relative(root, target);
			if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("附件路径必须位于当前 Work 工作区内");
			await access(target);
			const content = await readFile(target);
			return { path: params.path, size: content.byteLength, message: "已完成任务目录校验，平台 multipart 上传适配待接入" };
		}),
	];
}
