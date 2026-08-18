import type { DesktopReleaseArtifact } from '@/src/types/desktop-release'

/** 公众页默认选择 NSIS，MSI 作为兼容 Windows 环境的备用下载。 */
export const selectDesktopInstaller = (installers: DesktopReleaseArtifact[], bundleType: 'nsis' | 'msi'): DesktopReleaseArtifact | null =>
  installers.find((artifact) => artifact.artifactKind === 'INSTALLER' && artifact.bundleType === bundleType && artifact.downloadStatus === 'READY') ?? null

export const formatDesktopArtifactSize = (size: number): string => {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}
