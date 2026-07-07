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
  const query = inline ? '?inline=true' : '?inline=false'
  window.open(`/api/common/files/${fileId}${query}`, '_blank')
}

export const downloadCommonFile = async (fileId: number, fileName?: string, inline = false) => {
  const { data, headers } = await http.get<Blob>(`/api/common/files/${fileId}`, {
    params: { inline },
    responseType: 'blob'
  })
  const blob = data instanceof Blob ? data : new Blob([data])
  const disposition = String(headers['content-disposition'] || '')
  const resolvedName = fileName || parseFileName(disposition) || `file-${fileId}`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = resolvedName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const parseFileName = (contentDisposition: string) => {
  const utf8Match = /filename\\*=UTF-8''([^;]+)/i.exec(contentDisposition)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }
  const quotedMatch = /filename="([^"]+)"/i.exec(contentDisposition)
  return quotedMatch?.[1] || ''
}
