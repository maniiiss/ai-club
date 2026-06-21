/**
 * Markdown 编辑器图片上传工具。
 * 封装后端 POST /api/common/files/upload 接口，校验文件类型和大小后上传并返回 URL。
 */
import { http } from '@/src/api/http'

/** 允许上传的图片 MIME 类型。 */
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

/** 图片最大体积（字节），5MB。 */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

/**
 * 校验并上传图片文件，返回可访问的 URL。
 * @throws 校验失败或上传失败时抛出错误。
 */
export const uploadMarkdownImage = async (file: File): Promise<string> => {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('仅支持 PNG、JPG、GIF、WebP 格式的图片')
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('图片大小不能超过 5MB')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('directory', 'markdown-images')

  const response = await http.post<{
    success: boolean
    message: string
    data: { url: string }
  }>('/api/common/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  if (!response.data.success) {
    throw new Error(response.data.message || '图片上传失败')
  }

  return response.data.data.url
}
