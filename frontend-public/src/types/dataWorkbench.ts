/**
 * 数据工作台类型定义。
 * 业务意图：对齐后端 DataWorkbench / DataChange 协议，公众端只提交 DSL，不接收或发送原始 SQL。
 */
import type { PageResponse } from './api'

/** DataWorkbench 能力入口。 */
export interface DataWorkbenchAppItem {
  code: string
  name: string
  description: string
  enabled: boolean
}

/** DataWorkbench 字段映射配置。 */
export interface DataWorkbenchFieldItem {
  id: number
  fieldCode: string
  fieldName: string
  columnName: string
  dataType: string
  synonyms: string
  updatable: boolean
  locator: boolean
  sensitive: boolean
  enabled: boolean
  sortOrder: number
}

/** DataWorkbench 业务实体配置。 */
export interface DataWorkbenchEntityItem {
  id: number
  entityCode: string
  entityName: string
  description: string
  tableName: string
  primaryKeyColumn: string
  projectIdColumn: string
  maxAffectedRows: number
  requestScope: string
  executeScope: string
  rollbackScope: string
  enabled: boolean
  fields: DataWorkbenchFieldItem[]
}

/** DataChange v1 DSL，仅支持单实体 UPDATE。 */
export interface DataChangeDsl {
  version: string
  operation: string
  entityCode: string
  set: Record<string, unknown>
  where: Record<string, unknown>
}

/** DataChange 预览结果。 */
export interface DataChangePreviewResult {
  dsl: DataChangeDsl
  entity: DataWorkbenchEntityItem
  sqlSummary: string
  affectedRows: number
  riskLevel: string
  riskReasons: string[]
  approvalRequired: boolean
}

/** DataChange 工单列表项。 */
export interface DataChangeRequestItem {
  id: number
  projectId: number
  projectName: string
  entityId: number
  entityCode: string
  entityName: string
  originalText: string
  dsl: DataChangeDsl
  previewSqlSummary: string
  riskLevel: string
  approvalStatus: string
  executionStatus: string
  rollbackStatus: string | null
  affectedRows: number | null
  riskReasons: string[]
  rejectReason: string
  rollbackConflictReason: string
  requesterName: string
  approverName: string
  executorName: string
  rollbackUserName: string
  createdAt: string
  approvedAt: string
  executedAt: string
  rolledBackAt: string
}

/** DataChange 审计快照。 */
export interface DataChangeAuditItem {
  id: number
  requestId: number
  entityName: string
  primaryKeyValue: string
  beforeSnapshot: Record<string, unknown>
  afterSnapshot: Record<string, unknown>
  sqlSummary: string
  rollbackStatus: string
  rollbackConflictReason: string
  createdAt: string
  rolledBackAt: string
}

/** 项目内 DataChange 工单分页。 */
export type DataChangeRequestPage = PageResponse<DataChangeRequestItem>

/** 语义查询运行时协议：前端只展示 DSL 和 SQL 摘要，绝不接收数据库凭据。 */
export interface SemanticModelItem { id: number; dataSourceId: number; name: string; versionNo: number; status: string; modelConfigId: number | null; draftDefinitionJson: string; publishedDefinitionJson: string }
export interface SemanticQueryDsl { version: string; semanticModelId: number; measures: string[]; dimensions: string[]; filters: Record<string, unknown>; limit: number }
export interface QueryInterpretation { requestId: number; status: string; normalizedTerms: string[]; usedConcepts: string[]; clarifications: string[]; dsl: SemanticQueryDsl }
export interface QueryPreview { requestId: number; previewToken: string; dsl: SemanticQueryDsl; sqlSummary: string; usedDefinitions: string[]; clarifications: string[] }
export interface QueryExecution { requestId: number; status: string; rows: Array<Record<string, unknown>>; summary: string; sqlSummary: string }
