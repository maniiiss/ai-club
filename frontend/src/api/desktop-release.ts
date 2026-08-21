import { http } from './http'
import type { ApiResponse, PageResponse } from '@/types/platform'
import type { DesktopArtifactKind, DesktopBundleType, DesktopReleaseDetail, DesktopReleaseRequest, DesktopReleaseSummary } from '@/types/desktop-release'

/** 分页读取独立的 Desktop 发布生命周期，不与平台版本公告混用。 */
export const pageDesktopReleases = async (page = 1, size = 10) => {
  const { data } = await http.get<ApiResponse<PageResponse<DesktopReleaseSummary>>>('/api/desktop-releases', { params: { page, size } })
  return data.data
}

export const getDesktopRelease = async (id: number) => {
  const { data } = await http.get<ApiResponse<DesktopReleaseDetail>>(`/api/desktop-releases/admin/${id}`)
  return data.data
}

export const createDesktopRelease = async (payload: DesktopReleaseRequest) => {
  const { data } = await http.post<ApiResponse<DesktopReleaseDetail>>('/api/desktop-releases', payload)
  return data.data
}

/** 上传单个发布矩阵产物；文件由后端流式写入私有 MinIO。onUploadProgress 供批量目录上传展示当前文件进度。 */
export const uploadDesktopReleaseArtifact = async (releaseId: number, artifactKind: DesktopArtifactKind, bundleType: DesktopBundleType, file: File, onUploadProgress?: (percent: number) => void) => {
  const formData = new FormData()
  formData.append('artifactKind', artifactKind)
  formData.append('platform', 'windows')
  formData.append('arch', 'x86_64')
  formData.append('bundleType', bundleType)
  formData.append('file', file)
  const { data } = await http.post<ApiResponse<DesktopReleaseDetail['artifacts'][number]>>(`/api/desktop-releases/${releaseId}/artifacts`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 5 * 60 * 1000,
    onUploadProgress: onUploadProgress ? (event) => onUploadProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0) : undefined
  })
  return data.data
}

export const publishDesktopRelease = async (id: number) => {
  const { data } = await http.post<ApiResponse<DesktopReleaseDetail>>(`/api/desktop-releases/${id}/publish`)
  return data.data
}

export const revokeDesktopRelease = async (id: number) => {
  const { data } = await http.post<ApiResponse<DesktopReleaseDetail>>(`/api/desktop-releases/${id}/revoke`)
  return data.data
}

/** 删除已撤回的桌面版本记录，释放版本号以便重建同版本草稿。 */
export const deleteDesktopRelease = async (id: number) => {
  await http.delete<ApiResponse<null>>(`/api/desktop-releases/${id}`)
}
