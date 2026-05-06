import { http } from './http'
import type { ApiResponse, DocumentAssetItem, UploadedFileItem } from '@/types/platform'

export interface CommonFileUploadItem {
  id: number
  fileName: string
  contentType: string
  fileSize: number
  sourceFormat: string
  bindingStatus: string
  url: string
}

export const uploadCommonFile = async (file: File, directory?: string) => {
  const formData = new FormData()
  formData.append('file', file)
  if (directory) {
    formData.append('directory', directory)
  }
  const { data } = await http.post<ApiResponse<CommonFileUploadItem>>('/api/common/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  return data.data
}

export const uploadCommonImage = async (file: File, directory?: string): Promise<UploadedFileItem> => {
  const uploaded = await uploadCommonFile(file, directory)
  return {
    url: uploaded.url,
    fileName: uploaded.fileName,
    size: uploaded.fileSize
  }
}

export const uploadCommonDocumentAsset = async (file: File, directory?: string): Promise<DocumentAssetItem> => {
  const uploaded = await uploadCommonFile(file, directory)
  return {
    id: uploaded.id,
    fileName: uploaded.fileName,
    contentType: uploaded.contentType,
    fileSize: uploaded.fileSize,
    sourceFormat: uploaded.sourceFormat,
    bindingStatus: uploaded.bindingStatus,
    url: uploaded.url
  }
}

export const openCommonFileDownload = (fileId: number, inline = false) => {
  const query = inline ? '?inline=true' : ''
  window.open(`/api/common/files/${fileId}${query}`, '_blank')
}
