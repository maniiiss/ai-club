import { http } from './http'
import type { AiModelConfigItem, AiModelType, ApiResponse, ModelTestResult, OpenAiApiMode, PageResponse } from '@/types/platform'

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
