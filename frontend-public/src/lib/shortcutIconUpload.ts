/**
 * 快捷入口图标上传工具。
 * 封装后端 POST /api/common/files/upload 接口，校验文件类型和大小后上传并返回 URL。
 * 与管理端首页入口图标上传复用同一接口，directory 使用 'dashboard-shortcuts' 便于归档管理。
 */
import { http } from '@/src/api/http'

/** 允许上传的图标 MIME 类型。 */
const ALLOWED_ICON_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

/** 图标最大体积（字节），5MB。 */
const MAX_ICON_SIZE = 5 * 1024 * 1024

/**
 * 校验并上传图标文件，返回可访问的 URL。
 * @throws 校验失败或上传失败时抛出错误。
 */
export const uploadShortcutIcon = async (file: File): Promise<string> => {
  if (!ALLOWED_ICON_TYPES.has(file.type)) {
    throw new Error('仅支持 PNG、JPG、GIF、WebP 格式的图片')
  }
  if (file.size > MAX_ICON_SIZE) {
    throw new Error('图标大小不能超过 5MB')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('directory', 'dashboard-shortcuts')

  const response = await http.post<{
    success: boolean
    message: string
    data: { url: string }
  }>('/api/common/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  if (!response.data.success) {
    throw new Error(response.data.message || '图标上传失败')
  }

  return response.data.data.url
}

/** 判断 icon 字段是否为上传后的图片 URL（http/https 开头）。 */
export const isImageIcon = (icon?: string | null): boolean => {
  if (!icon) return false
  return icon.startsWith('http://') || icon.startsWith('https://')
}
