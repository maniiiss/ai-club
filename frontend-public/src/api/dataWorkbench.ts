/**
 * 数据工作台 API。
 * 业务意图：公众端只访问项目内 DataWorkbench 能力，DataChange 全流程由后端生成参数化 SQL 并执行。
 */
import { http, unwrap, cleanParams } from './http'
import type { ApiResponse } from '@/src/types/api'
import type {
  DataChangeAuditItem,
  DataChangeDsl,
  DataChangePreviewResult,
  DataChangeRequestItem,
  DataChangeRequestPage,
  DataWorkbenchAppItem,
  DataWorkbenchEntityItem,
} from '@/src/types/dataWorkbench'

/** 获取项目内启用的数据工作台能力。 */
export const listProjectDataWorkbenchApps = async (
  projectId: number,
): Promise<DataWorkbenchAppItem[]> => {
  const res = await http.get<ApiResponse<DataWorkbenchAppItem[]>>(
    `/api/data-workbench/projects/${projectId}/apps`,
  )
  return unwrap(res)
}

/** 获取当前项目可提交的数据实体。 */
export const listProjectDataWorkbenchEntities = async (
  projectId: number,
): Promise<DataWorkbenchEntityItem[]> => {
  const res = await http.get<ApiResponse<DataWorkbenchEntityItem[]>>(
    `/api/data-workbench/projects/${projectId}/entities`,
  )
  return unwrap(res)
}

/** 解析自然语言为 DataChange DSL。 */
export const parseProjectDataChange = async (
  projectId: number,
  payload: { text: string; entityCode?: string; dsl?: Record<string, unknown> },
): Promise<DataChangeDsl> => {
  const res = await http.post<ApiResponse<DataChangeDsl>>(
    `/api/data-workbench/projects/${projectId}/data-change/parse`,
    payload,
  )
  return unwrap(res)
}

/** 预览 DataChange 影响范围与风险。 */
export const previewProjectDataChange = async (
  projectId: number,
  payload: { text: string; entityCode?: string; dsl?: Record<string, unknown> },
): Promise<DataChangePreviewResult> => {
  const res = await http.post<ApiResponse<DataChangePreviewResult>>(
    `/api/data-workbench/projects/${projectId}/data-change/preview`,
    payload,
  )
  return unwrap(res)
}

/** 提交 DataChange 工单。 */
export const submitProjectDataChange = async (
  projectId: number,
  payload: { text: string; entityCode?: string; dsl?: Record<string, unknown> },
): Promise<DataChangeRequestItem> => {
  const res = await http.post<ApiResponse<DataChangeRequestItem>>(
    `/api/data-workbench/projects/${projectId}/data-change/requests`,
    payload,
  )
  return unwrap(res)
}

/** 分页查询当前项目内 DataChange 工单。 */
export const pageProjectDataChangeRequests = async (
  projectId: number,
  query: { page: number; size: number },
): Promise<DataChangeRequestPage> => {
  const res = await http.get<ApiResponse<DataChangeRequestPage>>(
    `/api/data-workbench/projects/${projectId}/data-change/requests`,
    { params: cleanParams(query) },
  )
  return unwrap(res)
}

/** 查询指定 DataChange 工单的审计快照。 */
export const listDataChangeAudits = async (
  requestId: number,
): Promise<DataChangeAuditItem[]> => {
  const res = await http.get<ApiResponse<DataChangeAuditItem[]>>(
    `/api/data-workbench/data-change/requests/${requestId}/audits`,
  )
  return unwrap(res)
}
