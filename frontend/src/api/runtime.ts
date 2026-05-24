import { http } from './http'
import type { ApiResponse, RuntimeCapabilitiesItem } from '@/types/platform'

export const getRuntimeCapabilities = async () => {
  const { data } = await http.get<ApiResponse<RuntimeCapabilitiesItem>>('/api/runtime-capabilities')
  return data.data
}
