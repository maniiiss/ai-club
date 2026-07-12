import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = async (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('管理端工作项详情将评论和更新记录作为带数量的双 Tab', async () => {
  const taskView = await readSource('../src/views/TaskView.vue')
  const iterationView = await readSource('../src/views/IterationView.vue')

  for (const source of [taskView, iterationView]) {
    assert.match(source, /TaskCommentTimeline/)
    assert.match(source, /TaskUpdateTimeline/)
    assert.match(source, /评论/)
    assert.match(source, /更新记录/)
  }
  assert.match(taskView, /detailActiveTab\s*=\s*ref\('detail'\)/)
  assert.match(taskView, /task-detail-activity-tabs/)
  assert.match(taskView, /detailActivityTab\s*=\s*ref\('comments'\)/)
  assert.match(taskView, /task-detail-activity-tabs[\s\S]*min-height:\s*420px/)
  assert.doesNotMatch(iterationView, /<\/div>\s*<div v-if="workItemEditing && currentDialogWorkItem" class="work-item-activity-tabs">/)
})

test('管理端活动时间线使用管理端主题变量', async () => {
  const commentTimeline = await readSource('../src/components/TaskCommentTimeline.vue')
  const updateTimeline = await readSource('../src/components/TaskUpdateTimeline.vue')

  for (const source of [commentTimeline, updateTimeline]) {
    assert.match(source, /--app-/)
    assert.doesNotMatch(source, /--platform-(?:border|bg|text|primary)/)
  }
})
