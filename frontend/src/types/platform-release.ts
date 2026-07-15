/** 管理端版本发布历史摘要与发布详情。 */
export interface PlatformRelease {
  id: number
  version: string
  title: string
  content?: string
  publisherUserId: number
  publishedAt: string
}

/** 管理员发布版本的请求体。 */
export interface PlatformReleaseRequest {
  version: string
  title: string
  content: string
}
