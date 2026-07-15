/** 公众端待展示的平台版本发布内容。 */
export interface PlatformRelease {
  id: number
  version: string
  title: string
  content: string
  publisherUserId: number
  publishedAt: string
}
