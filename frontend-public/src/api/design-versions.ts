/** 项目 Design 版本 API。 */
import { http, unwrap } from './http'
import type { ApiResponse } from '@/src/types/api'
import type { DesignVersionDetail, DesignVersionList } from '@/src/types/design-version'

const base = (projectId: number) => `/api/projects/${projectId}/design-versions`

export const listDesignVersions = async (projectId: number): Promise<DesignVersionList> => {
  const response = await http.get<ApiResponse<DesignVersionList>>(base(projectId))
  return unwrap(response)
}

export const getDesignVersion = async (projectId: number, versionId: number): Promise<DesignVersionDetail> => {
  const response = await http.get<ApiResponse<DesignVersionDetail>>(`${base(projectId)}/${versionId}`)
  return unwrap(response)
}

export const activateDesignVersion = async (projectId: number, versionId: number): Promise<DesignVersionDetail> => {
  const response = await http.post<ApiResponse<DesignVersionDetail>>(`${base(projectId)}/${versionId}/activate`)
  return unwrap(response)
}

export const restoreDesignVersion = async (projectId: number, versionId: number): Promise<DesignVersionDetail> => {
  const response = await http.post<ApiResponse<DesignVersionDetail>>(`${base(projectId)}/${versionId}/restore`)
  return unwrap(response)
}
