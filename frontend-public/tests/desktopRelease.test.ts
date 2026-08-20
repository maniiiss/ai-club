import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { formatDesktopArtifactSize, selectDesktopInstaller } from '../src/lib/desktop-release.ts'

const installers = [
  { id: 1, artifactKind: 'INSTALLER' as const, platform: 'windows' as const, arch: 'x86_64' as const, bundleType: 'nsis' as const, fileName: 'GitPilot.exe', contentType: 'application/octet-stream', fileSize: 3 * 1024 * 1024, sha256: 'nsis-sha', downloadStatus: 'READY' as const, downloadUrl: '/nsis' },
  { id: 2, artifactKind: 'INSTALLER' as const, platform: 'windows' as const, arch: 'x86_64' as const, bundleType: 'msi' as const, fileName: 'GitPilot.msi', contentType: 'application/x-msi', fileSize: 2 * 1024 * 1024, sha256: 'msi-sha', downloadStatus: 'READY' as const, downloadUrl: '/msi' },
]

test('公众页默认使用 NSIS，同时保留 MSI 备用下载', () => {
  assert.equal(selectDesktopInstaller(installers, 'nsis')?.downloadUrl, '/nsis')
  assert.equal(selectDesktopInstaller(installers, 'msi')?.downloadUrl, '/msi')
})

test('公众页不展示被禁用的安装包并格式化文件大小', () => {
  assert.equal(selectDesktopInstaller([{ ...installers[0], downloadStatus: 'DISABLED' as const }], 'nsis'), null)
  assert.equal(formatDesktopArtifactSize(3 * 1024 * 1024), '3.0 MB')
})

test('宣传页读取最新版本时绕过发布前的空结果缓存', () => {
  const source = readFileSync(new URL('../src/api/desktop-release.ts', import.meta.url), 'utf8')
  assert.match(source, /'Cache-Control': 'no-cache'/)
})
