/** GitPilot Desktop 发布中心的管理端数据模型。 */
export type DesktopReleaseStatus = 'DRAFT' | 'PUBLISHED' | 'REVOKED'
export type DesktopArtifactKind = 'INSTALLER' | 'UPDATER' | 'SIGNATURE'
export type DesktopBundleType = 'msi' | 'nsis'

export interface DesktopReleaseArtifact {
  id: number
  artifactKind: DesktopArtifactKind
  platform: 'windows'
  arch: 'x86_64'
  bundleType: DesktopBundleType
  fileName: string
  contentType: string
  fileSize: number
  sha256: string
  downloadStatus: 'READY' | 'DISABLED'
  downloadUrl: string
}

export interface DesktopReleaseSummary {
  id: number
  version: string
  channel: string
  title: string
  status: DesktopReleaseStatus
  publishedAt: string | null
  createdAt: string
  artifactCount: number
}

export interface DesktopReleaseDetail extends DesktopReleaseSummary {
  releaseNotes: string
  publisherUserId: number | null
  artifacts: DesktopReleaseArtifact[]
}

export interface DesktopReleaseRequest {
  version: string
  title: string
  releaseNotes: string
  channel: 'stable'
}
