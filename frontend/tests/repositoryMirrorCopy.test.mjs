import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('admin GitLab mirror tab uses repository mirror copy once', async () => {
  const source = await readFile(new URL('../src/views/GitlabView.vue', import.meta.url), 'utf8')
  const ownerRepoPane = source.slice(source.indexOf('<el-tab-pane label="仓库镜像" name="ownerRepos">'))

  assert.ok(ownerRepoPane.includes('仓库镜像'))
  assert.equal(ownerRepoPane.includes('业主仓库'), false)
  assert.equal((ownerRepoPane.match(/>仓库镜像<\/button>/g) || []).length, 1)
})

test('every GitLab tab switcher exposes the repository mirror tab', async () => {
  const source = await readFile(new URL('../src/views/GitlabView.vue', import.meta.url), 'utf8')
  const switchers = source.match(/<div class="gitlab-tab-switcher"[\s\S]*?<\/div>/g) || []

  assert.ok(switchers.length >= 5)
  assert.equal(source.includes('gitlab-tab-group'), false)
  for (const switcher of switchers) {
    assert.ok(switcher.includes("activeTab === 'ownerRepos'"))
    assert.ok(switcher.includes('>仓库镜像</button>'))
  }
})

test('repository mirror binding pane follows project binding list interactions', async () => {
  const source = await readFile(new URL('../src/views/GitlabView.vue', import.meta.url), 'utf8')
  const ownerRepoPane = source.slice(
    source.indexOf('<el-tab-pane label="仓库镜像" name="ownerRepos">'),
    source.indexOf('</el-tab-pane>', source.indexOf('<el-tab-pane label="仓库镜像" name="ownerRepos">'))
  )

  assert.ok(ownerRepoPane.includes('class="management-list-table gitlab-owner-repo-table mobile-card-table"'))
  assert.ok(ownerRepoPane.includes('class="management-list-row"'))
  assert.ok(ownerRepoPane.includes('class="management-list-title-cell"'))
  assert.ok(ownerRepoPane.includes('@click="handleOwnerRepoCreate"'))
  assert.ok(ownerRepoPane.includes('@click="handleOwnerRepoReset"'))
  assert.ok(ownerRepoPane.includes('@click="handleOwnerRepoEdit(item)"'))
  assert.ok(ownerRepoPane.includes('<span>编辑</span>'))
})

test('repository mirror push mode fields expose hover explanations', async () => {
  const source = await readFile(new URL('../src/views/GitlabView.vue', import.meta.url), 'utf8')

  assert.ok(source.includes('owner-repo-push-mode-help'))
  assert.ok(source.includes('推到新分支：在仓库镜像创建或更新一个独立分支'))
  assert.ok(source.includes('创建 MR：推送到临时分支后创建合并请求'))
  assert.ok(source.includes('直接推送(覆盖)：直接覆盖目标分支历史'))
})
