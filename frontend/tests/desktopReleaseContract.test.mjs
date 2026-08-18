import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('桌面发布 API 覆盖草稿、产物上传、发布和撤回生命周期', () => {
  const source = read('src/api/desktop-release.ts')
  assert.match(source, /GET|http\.get/)
  assert.match(source, /\/api\/desktop-releases/)
  assert.match(source, /\/artifacts/)
  assert.match(source, /\/publish/)
  assert.match(source, /\/revoke/)
  assert.match(source, /multipart\/form-data/)
})

test('桌面发布页面具备权限门控和完整六格产物校验', () => {
  const source = read('src/views/DesktopReleaseView.vue')
  assert.match(source, /system:desktop-release:manage/)
  assert.match(source, /\['msi', 'nsis'\]/)
  assert.match(source, /\['INSTALLER', 'UPDATER', 'SIGNATURE'\]/)
  assert.match(source, /artifactCells\.value\.every/)
  assert.match(source, /detail\.status === 'PUBLISHED'/)
})

test('桌面发布路由使用独立查看权限', () => {
  const source = read('src/router/index.ts')
  assert.match(source, /path: 'desktop-releases'/)
  assert.match(source, /permission: 'system:desktop-release:view'/)
})
