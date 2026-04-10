import { uploadTaskImage } from '@/api/platform'

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif']
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

export const uploadMarkdownImage = async (file: File) => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('仅支持 PNG、JPG、GIF 图片')
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('图片大小不能超过 5MB')
  }

  try {
    const uploaded = await uploadTaskImage(file)
    return uploaded.url
  } catch (error: any) {
    throw new Error(error?.response?.data?.message || '图片上传失败')
  }
}
