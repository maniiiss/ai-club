/** 公众端展示的 GitPilot Desktop 最新 stable 版本模型。 */
export interface DesktopReleaseArtifact {
  id: number
  artifactKind: 'INSTALLER' | 'UPDATER' | 'SIGNATURE'
  platform: 'windows'
  arch: 'x86_64'
  bundleType: 'msi' | 'nsis'
  fileName: string
  contentType: string
  fileSize: number
  sha256: string
  downloadStatus: 'READY' | 'DISABLED'
  downloadUrl: string
}

export interface DesktopReleaseLatest {
  version: string
  channel: string
  title: string
  releaseNotes: string
  publishedAt: string | null
  installers: DesktopReleaseArtifact[]
}
