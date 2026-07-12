<template>
  <section class="task-comment-timeline">
    <div v-if="loading" class="task-comment-state">正在加载评论…</div>
    <div v-else-if="error" class="task-comment-state">评论加载失败，请稍后重试</div>
    <div v-else-if="!comments.length" class="task-comment-state">暂无评论</div>
    <div v-else class="task-comment-list">
      <article v-for="comment in comments" :key="comment.id" class="task-comment-card">
        <div class="task-comment-card-head">
          <strong>{{ comment.authorName || '未知用户' }}</strong>
          <span>{{ formatDateTime(comment.createdAt) }}</span>
        </div>
        <div class="task-comment-card-content" v-html="renderMarkdownToHtml(comment.content)"></div>
      </article>
    </div>

    <div class="task-comment-editor">
      <MarkdownEditor
        v-model="draft"
        :height="180"
        :upload-image="uploadMarkdownImage"
        placeholder="输入评论内容"
      />
      <div class="task-comment-editor-footer">
        <span>评论会同时出现在更新记录时间线中</span>
        <el-button type="primary" :loading="submitting" :disabled="!draft.trim()" @click="submitComment">发表评论</el-button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { createTaskComment, listTaskComments } from '@/api/platform'
import type { TaskCommentItem } from '@/types/platform'
import { renderMarkdownToHtml } from '@/utils/markdown'
import { uploadMarkdownImage } from '@/utils/taskImageUpload'

const props = withDefaults(defineProps<{ taskId: number; refreshKey?: number }>(), { refreshKey: 0 })
const emit = defineEmits<{
  (event: 'count-change', count: number): void
  (event: 'comment-posted'): void
}>()

const comments = ref<TaskCommentItem[]>([])
const draft = ref('')
const loading = ref(false)
const submitting = ref(false)
const error = ref(false)

const formatDateTime = (value?: string | null) => value ? value.replace('T', ' ').slice(0, 16) : '-'

const loadComments = async () => {
  loading.value = true
  error.value = false
  try {
    comments.value = await listTaskComments(props.taskId)
    emit('count-change', comments.value.length)
  } catch {
    error.value = true
    emit('count-change', 0)
  } finally {
    loading.value = false
  }
}

const submitComment = async () => {
  const content = draft.value.trim()
  if (!content || submitting.value) return
  submitting.value = true
  try {
    await createTaskComment(props.taskId, content)
    draft.value = ''
    await loadComments()
    emit('comment-posted')
    ElMessage.success('评论已发布')
  } catch {
    ElMessage.error('评论发布失败')
  } finally {
    submitting.value = false
  }
}

watch(() => [props.taskId, props.refreshKey], loadComments, { immediate: true })
</script>

<style scoped>
.task-comment-timeline { padding-top: 14px; }
.task-comment-list { display: flex; flex-direction: column; gap: 10px; }
.task-comment-card { padding: 12px; border: 1px solid var(--app-border); border-radius: 10px; background: var(--app-surface-card); }
.task-comment-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--app-text-muted); font-size: 11px; }
.task-comment-card-head strong { color: var(--app-text); font-size: 12px; }
.task-comment-card-content { margin-top: 8px; color: var(--app-text-soft); font-size: 13px; line-height: 1.65; word-break: break-word; }
.task-comment-editor { margin-top: 14px; }
.task-comment-editor-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; color: var(--app-text-muted); font-size: 11px; }
.task-comment-state { padding: 24px 12px; border: 1px dashed var(--app-border-strong); border-radius: 10px; color: var(--app-text-muted); font-size: 12px; text-align: center; }
@media (max-width: 640px) { .task-comment-editor-footer { align-items: flex-start; flex-direction: column; } }
</style>
