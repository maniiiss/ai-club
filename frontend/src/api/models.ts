import { http } from './http'
import type { AiModelConfigItem, AiModelInputModality, AiModelType, ApiResponse, ModelPricingBaseItem, ModelTestResult, OpenAiApiMode, PageResponse } from '@/types/platform'

export interface AiModelConfigPayload {
  name: string
  modelType: AiModelType
  provider: 'OPENAI' | 'ANTHROPIC'
  apiBaseUrl: string
  modelName: string
  openaiApiMode: OpenAiApiMode
  apiKey: string
  description: string
  enabled: boolean
  /** 模型可接收的输入模态；未勾选图片时平台仅向下游声明 text。 */
  inputModalities: AiModelInputModality[]
  contextLength?: number
  maxOutputTokens?: number
  /** 是否启用 token 计费（灰度开关）。 */
  tokenBillingEnabled?: boolean
  /** 相对平台 1x 基准价的模型倍率；启用计费时由后端换算实际输入/输出单价。 */
  billingMultiplier?: number
  /** 每千输入 token 积分单价。 */
  inputCreditPer1k?: number
  /** 每千输出 token 积分单价。 */
  outputCreditPer1k?: number
  /** 每千缓存命中输入 token 单价；为空时按输入单价 ×0.5 兜底。 */
  cachedInputCreditPer1k?: number
}

export interface AiModelConfigQuery {
  page: number
  size: number
  keyword?: string
  modelType?: AiModelType
  provider?: 'OPENAI' | 'ANTHROPIC'
  enabled?: boolean
}

const cleanParams = <T extends object>(params: T) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )

export const pageModelConfigs = async (query: AiModelConfigQuery) => {
  const { data } = await http.get<ApiResponse<PageResponse<AiModelConfigItem>>>('/api/model-configs', {
    params: cleanParams(query)
  })
  return data.data
}

export const listModelConfigOptions = async (modelType: AiModelType | undefined = 'CHAT') => {
  const { data } = await http.get<ApiResponse<AiModelConfigItem[]>>('/api/model-configs/options', {
    params: cleanParams({ modelType })
  })
  return data.data
}

export const createModelConfig = async (payload: AiModelConfigPayload) => {
  const { data } = await http.post<ApiResponse<AiModelConfigItem>>('/api/model-configs', payload)
  return data.data
}

export const updateModelConfig = async (id: number, payload: AiModelConfigPayload) => {
  const { data } = await http.put<ApiResponse<AiModelConfigItem>>(`/api/model-configs/${id}`, payload)
  return data.data
}

export const deleteModelConfig = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/model-configs/${id}`)
}

export const testModelConfig = async (id: number) => {
  const { data } = await http.post<ApiResponse<ModelTestResult>>(`/api/model-configs/${id}/test`)
  return data.data
}

export interface ModelPricingBasePayload {
  inputCreditPer1k: number
  outputCreditPer1k: number
}

/** 获取平台级模型 1x 基准价。 */
export const getModelPricingBase = async () => {
  const { data } = await http.get<ApiResponse<ModelPricingBaseItem>>('/api/model-configs/pricing-base')
  return data.data
}

/** 更新平台级模型 1x 基准价，并同步重算已有模型的实际输入/输出单价。 */
export const updateModelPricingBase = async (payload: ModelPricingBasePayload) => {
  const { data } = await http.put<ApiResponse<ModelPricingBaseItem>>('/api/model-configs/pricing-base', payload)
  return data.data
}
