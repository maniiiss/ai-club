<template>
  <el-drawer
    v-model="drawerVisible"
    :direction="isMobileViewport ? 'btt' : 'rtl'"
    :size="isMobileViewport ? '100%' : '460px'"
    :show-close="false"
    :class="['hermes-drawer', { 'is-mobile': isMobileViewport }]"
  >
    <template #header>
      <div class="hermes-head">
        <div class="hermes-head-copy">
          <div class="hermes-title">Hermes 助手</div>
          <div class="hermes-subtitle">{{ drawerSubtitle }}</div>
        </div>
        <button class="hermes-close-button" type="button" @click="drawerVisible = false">关闭</button>
      </div>
    </template>

    <div class="hermes-panel">
      <div ref="messageScrollRef" class="hermes-body">
        <section v-if="isMobileViewport && !currentMessages.length" class="hermes-mobile-intro">
          <div class="hermes-mobile-intro-title">问你想问</div>
          <p class="hermes-mobile-intro-description">Hermes 会结合当前页面、项目和任务上下文继续回答你的问题。</p>
        </section>

        <section v-if="displayPrompts.length" class="hermes-quick-prompts">
          <div class="hermes-section-title">你可以这样问</div>
          <div class="hermes-chip-list">
            <button
              v-for="prompt in displayPrompts"
              :key="prompt"
              class="hermes-chip-button"
              type="button"
              :disabled="sending"
              @click="handleSubmit(prompt)"
            >
              {{ prompt }}
            </button>
          </div>
        </section>

        <section v-if="currentMessages.length" class="hermes-message-section">
          <div
            v-for="message in currentMessages"
            :key="message.id"
            class="hermes-message-row"
            :class="message.role === 'user' ? 'user' : 'assistant'"
          >
            <div class="hermes-message-label">
              {{ message.role === 'user' ? '我' : 'Hermes' }}
              <span v-if="message.role === 'assistant' && currentRoleName" class="hermes-role-tag">{{ currentRoleName }}</span>
            </div>
            <div class="hermes-message-bubble" :class="message.status">
              <pre v-if="message.role === 'user'">{{ message.content || (message.status === 'streaming' ? '正在整理回答...' : '暂无内容') }}</pre>
              <div
                v-else
                class="hermes-markdown-content"
                v-html="renderAssistantMessage(message)"
              ></div>
            </div>
          </div>
        </section>

        <section v-else class="hermes-empty-state">
          <div class="hermes-empty-kicker">问你想问</div>
          <div class="hermes-empty-title">把项目上下文交给 Hermes</div>
          <p class="hermes-empty-description">
            这里会结合当前页面、项目和任务的可见信息，帮你回顾进度、风险、决策和下一步建议。
          </p>
        </section>

        <section v-if="currentReferences.length" class="hermes-reference-section">
          <div class="hermes-section-title">引用来源</div>
          <div class="hermes-reference-list">
            <button
              v-for="reference in currentReferences"
              :key="`${reference.type}-${reference.id ?? reference.title}`"
              class="hermes-reference-item"
              type="button"
              @click="handleOpenReference(reference.route)"
            >
              <span class="hermes-reference-type">{{ reference.type }}</span>
              <span class="hermes-reference-title">{{ reference.title }}</span>
            </button>
          </div>
        </section>
      </div>

      <div class="hermes-footer">
        <el-input
          v-model="draftQuestion"
          type="textarea"
          :rows="3"
          resize="none"
          :disabled="sending"
          placeholder="问你想问"
          @keydown.enter.exact.prevent="handleSubmit()"
        />
        <div class="hermes-footer-actions">
          <span class="hermes-footer-tip">{{ sending ? 'Hermes 正在回答...' : 'Enter 发送，Shift+Enter 换行' }}</span>
          <button class="hermes-send-button" type="button" :disabled="sending" @click="handleSubmit()">
            {{ sending ? '回答中...' : '发送' }}
          </button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { streamHermesChat } from '@/api/hermes'
import { renderHermesMarkdownToHtml } from '@/utils/hermesMarkdown'
import type {
  HermesChatRequestPayload,
  HermesConversationSession,
  HermesMessageItem,
  HermesReferenceItem,
  HermesStreamDeltaEvent,
  HermesStreamDoneEvent,
  HermesStreamErrorEvent,
  HermesStreamMetaEvent
} from '@/types/hermes'

interface HermesDrawerProps {
  routeName: string
  projectId?: number | null
  taskId?: number | null
  iterationId?: number | null
  planId?: number | null
  fallbackPrompts?: string[]
}

const props = defineProps<HermesDrawerProps>()
const drawerVisible = defineModel<boolean>({ default: false })
const router = useRouter()
const messageScrollRef = ref<HTMLDivElement>()
const isMobileViewport = ref(false)
const draftQuestion = ref('')
const sending = ref(false)
const currentRoleName = ref('协作成员')
const currentMessages = ref<HermesMessageItem[]>([])
const currentReferences = ref<HermesReferenceItem[]>([])
const currentSuggestions = ref<string[]>([])
const currentScopeKey = ref('')
const scopeKeyByFingerprint = new Map<string, string>()
const sessionCache = new Map<string, HermesConversationSession>()
const conversationIdByFingerprint = new Map<string, string>()
const activeStreamAbort = ref<(() => void) | null>(null)
const thinkBlockOpenState = new Map<string, boolean>()

const scopeFingerprint = computed(() => (props.projectId ? `project:${props.projectId}` : 'global'))
const drawerSubtitle = computed(() => {
  if (props.taskId) {
    return '任务执行上下文'
  }
  if (props.projectId) {
    return '项目工作区上下文'
  }
  return '顶部全局入口'
})
const displayPrompts = computed(() => {
  if (currentSuggestions.value.length) {
    return currentSuggestions.value
  }
  return props.fallbackPrompts || []
})

/**
 * 顶部抽屉只在当前浏览器会话内缓存可见消息，刷新页面后自然丢失，不恢复完整 transcript。
 */
const loadSessionForCurrentScope = () => {
  const resolvedScopeKey = scopeKeyByFingerprint.get(scopeFingerprint.value) || `pending:${scopeFingerprint.value}`
  currentScopeKey.value = resolvedScopeKey
  const cachedSession = sessionCache.get(resolvedScopeKey)
  currentMessages.value = cachedSession ? [...cachedSession.messages] : []
  currentReferences.value = cachedSession ? [...cachedSession.references] : []
  currentSuggestions.value = cachedSession ? [...cachedSession.suggestions] : []
  currentRoleName.value = cachedSession?.roleName || '协作成员'
  void restoreThinkBlocksAndScroll(false)
}

const saveCurrentSession = () => {
  if (!currentScopeKey.value) {
    return
  }
  sessionCache.set(currentScopeKey.value, {
    scopeKey: currentScopeKey.value,
    messages: [...currentMessages.value],
    references: [...currentReferences.value],
    suggestions: [...currentSuggestions.value],
    roleName: currentRoleName.value
  })
}

const scrollToBottom = async () => {
  await nextTick()
  if (!messageScrollRef.value) {
    return
  }
  messageScrollRef.value.scrollTop = messageScrollRef.value.scrollHeight
}

/**
 * 仅当用户仍停留在消息底部附近、且当前没有展开中的思考块时，才继续自动跟随流式输出滚动。
 * 否则用户正在阅读历史内容或思考过程，强制滚动会让人误以为思考面板被自动收起。
 */
const shouldAutoScrollWithStream = () => {
  if (!messageScrollRef.value) {
    return true
  }
  const scrollContainer = messageScrollRef.value
  const remainingDistance = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight
  const isNearBottom = remainingDistance <= 48
  const hasExpandedThinkBlock = Boolean(
    scrollContainer.querySelector('.hermes-think-block[open]')
  ) || Array.from(thinkBlockOpenState.values()).some(Boolean)
  return isNearBottom && !hasExpandedThinkBlock
}

/**
 * 流式输出会触发 `v-html` 整块重绘，这里在每次重绘后把用户刚刚展开的思考块状态恢复回来。
 */
const restoreThinkBlockOpenState = () => {
  if (!messageScrollRef.value) {
    return
  }
  const thinkBlocks = messageScrollRef.value.querySelectorAll<HTMLDetailsElement>('.hermes-think-block[data-think-key]')
  thinkBlocks.forEach((thinkBlock) => {
    const thinkKey = thinkBlock.dataset.thinkKey
    if (!thinkKey || !thinkBlockOpenState.has(thinkKey)) {
      return
    }
    thinkBlock.open = Boolean(thinkBlockOpenState.get(thinkKey))
  })
}

/**
 * 将思考块状态恢复和滚动到底部合并，避免流式渲染时出现先恢复、再被下一次 DOM 更新打断的闪动。
 */
const restoreThinkBlocksAndScroll = async (shouldScroll = true) => {
  await nextTick()
  restoreThinkBlockOpenState()
  if (shouldScroll && messageScrollRef.value) {
    messageScrollRef.value.scrollTop = messageScrollRef.value.scrollHeight
  }
}

const syncViewportMode = () => {
  if (typeof window === 'undefined') {
    return
  }
  isMobileViewport.value = window.innerWidth <= 900
}

watch(
  () => scopeFingerprint.value,
  () => {
    loadSessionForCurrentScope()
  },
  { immediate: true }
)

onMounted(() => {
  syncViewportMode()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', syncViewportMode)
  }
  messageScrollRef.value?.addEventListener('click', handleThinkSummaryClick)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncViewportMode)
  }
  messageScrollRef.value?.removeEventListener('click', handleThinkSummaryClick)
  if (activeStreamAbort.value) {
    activeStreamAbort.value()
    activeStreamAbort.value = null
  }
})

/**
 * 使用事件代理记录 `<details>` 的展开状态，避免用户展开后在流式增量到达时被立即收起。
 */
const handleThinkSummaryClick = (event: Event) => {
  const clickTarget = event.target
  if (!(clickTarget instanceof HTMLElement)) {
    return
  }
  const summaryElement = clickTarget.closest('summary')
  if (!(summaryElement instanceof HTMLElement)) {
    return
  }
  const thinkBlock = summaryElement.parentElement
  if (!(thinkBlock instanceof HTMLDetailsElement)) {
    return
  }
  const thinkKey = thinkBlock.dataset.thinkKey
  if (!thinkKey) {
    return
  }

  /**
   * 这里直接记录“点击之后将要切换成的状态”，避免流式增量刚好在同一时刻到达时，
   * 由于 `setTimeout(0)` 尚未执行，导致新一轮 DOM 重绘把刚展开的思考面板又恢复成关闭状态。
   */
  thinkBlockOpenState.set(thinkKey, !thinkBlock.open)
}

const handleOpenReference = async (route: string) => {
  if (!route) {
    return
  }
  await router.push(route)
}

const updateMessage = (messageId: string, updater: (current: HermesMessageItem) => HermesMessageItem) => {
  const shouldScroll = shouldAutoScrollWithStream()
  currentMessages.value = currentMessages.value.map((item) => (item.id === messageId ? updater(item) : item))
  saveCurrentSession()
  void restoreThinkBlocksAndScroll(shouldScroll)
}

const resolveConversationId = () => {
  const existing = conversationIdByFingerprint.get(scopeFingerprint.value)
  if (existing) {
    return existing
  }
  const storageKey = `git-ai-club:hermes:conversation:${scopeFingerprint.value}`
  const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem(storageKey) : ''
  if (saved) {
    conversationIdByFingerprint.set(scopeFingerprint.value, saved)
    return saved
  }
  const nextId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `conversation-${Date.now()}`
  conversationIdByFingerprint.set(scopeFingerprint.value, nextId)
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(storageKey, nextId)
  }
  return nextId
}

/**
 * 后端返回真实 scopeKey 后，用它替换临时键，确保同项目范围内后续重开抽屉能续聊。
 */
const adoptScopeKey = (scopeKey: string) => {
  if (!scopeKey || currentScopeKey.value === scopeKey) {
    return
  }
  scopeKeyByFingerprint.set(scopeFingerprint.value, scopeKey)
  sessionCache.delete(scopeKey)
  currentScopeKey.value = scopeKey
  saveCurrentSession()
}

const buildPayload = (question: string): HermesChatRequestPayload => ({
  question,
  routeName: props.routeName,
  projectId: props.projectId ?? null,
  taskId: props.taskId ?? null,
  iterationId: props.iterationId ?? null,
  planId: props.planId ?? null,
  clientConversationId: resolveConversationId()
})

/**
 * 流式阶段已经拿到的文本通常最完整地保留了 `<think>` 思考过程。
 * 如果完成事件返回的是去掉思考过程的“净化版答案”，这里优先保留流式阶段的原文，
 * 避免用户刚展开的思考面板在完成瞬间直接消失，看起来像被自动关闭。
 */
const resolveAssistantFinalContent = (streamedContent: string, doneContent: string) => {
  const normalizedStreamed = streamedContent || ''
  const normalizedDone = doneContent || ''
  if (!normalizedDone.trim()) {
    return normalizedStreamed
  }
  const streamedHasThink = /<think\b/i.test(normalizedStreamed)
  const doneHasThink = /<think\b/i.test(normalizedDone)
  if (streamedHasThink && !doneHasThink) {
    return normalizedStreamed
  }
  if (normalizedDone.length < normalizedStreamed.length && normalizedStreamed.includes(normalizedDone)) {
    return normalizedStreamed
  }
  return normalizedDone
}

/**
 * 为每条消息生成带稳定思考块键的 HTML，确保思考面板在流式渲染过程中可以保持用户手动展开的状态。
 */
const renderAssistantMessage = (message: HermesMessageItem) =>
  renderHermesMarkdownToHtml(message.content || (message.status === 'streaming' ? '正在整理回答...' : '暂无内容'), {
    thinkBlockKeyPrefix: message.id,
    /**
     * 在 HTML 生成阶段直接补回 open 属性，避免流式增量导致 `<details>` 被重绘后出现“刚展开又关闭”的闪动。
     */
    isThinkBlockOpen: (thinkBlockKey: string) => Boolean(thinkBlockOpenState.get(thinkBlockKey))
  })

const handleSubmit = async (questionOverride?: string) => {
  const normalizedQuestion = (questionOverride ?? draftQuestion.value).trim()
  if (!normalizedQuestion) {
    drawerVisible.value = true
    return
  }
  if (sending.value) {
    return
  }

  drawerVisible.value = true
  sending.value = true
  if (activeStreamAbort.value) {
    activeStreamAbort.value()
    activeStreamAbort.value = null
  }
  const userMessageId = `user-${Date.now()}`
  const assistantMessageId = `assistant-${Date.now()}`
  currentMessages.value = [
    ...currentMessages.value,
    { id: userMessageId, role: 'user', content: normalizedQuestion, status: 'done' },
    { id: assistantMessageId, role: 'assistant', content: '', status: 'streaming' }
  ]
  draftQuestion.value = ''
  saveCurrentSession()
  void restoreThinkBlocksAndScroll()

  try {
    const streamController = await streamHermesChat(buildPayload(normalizedQuestion), {
      onMeta: (payload: HermesStreamMetaEvent) => {
        adoptScopeKey(payload.scopeKey)
        currentRoleName.value = payload.roleName || '协作成员'
        currentReferences.value = payload.references || []
        currentSuggestions.value = payload.suggestions || []
        saveCurrentSession()
      },
      onDelta: (payload: HermesStreamDeltaEvent) => {
        updateMessage(assistantMessageId, (current) => ({
          ...current,
          content: `${current.content}${payload.content || ''}`,
          status: 'streaming'
        }))
      },
      onDone: (payload: HermesStreamDoneEvent) => {
        adoptScopeKey(payload.scopeKey)
        currentRoleName.value = payload.roleName || currentRoleName.value
        currentReferences.value = payload.references || []
        currentSuggestions.value = payload.suggestions || []
        updateMessage(assistantMessageId, (current) => ({
          ...current,
          content: resolveAssistantFinalContent(current.content, payload.content),
          status: 'done'
        }))
        sending.value = false
        activeStreamAbort.value = null
      },
      onError: (payload: HermesStreamErrorEvent) => {
        updateMessage(assistantMessageId, (current) => ({
          ...current,
          content: payload.message || current.content || 'Hermes 助手暂时不可用',
          status: 'error'
        }))
        sending.value = false
        activeStreamAbort.value = null
        ElMessage.error(payload.message || 'Hermes 助手暂时不可用')
      }
    })
    activeStreamAbort.value = streamController.abort
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Hermes 助手暂时不可用'
    updateMessage(assistantMessageId, (current) => ({
      ...current,
      content: message,
      status: 'error'
    }))
    sending.value = false
    ElMessage.error(message)
  }
}

const openDrawer = () => {
  drawerVisible.value = true
}

const openWithQuestion = async (question: string) => {
  drawerVisible.value = true
  if (!question.trim()) {
    return
  }
  draftQuestion.value = question.trim()
  await nextTick()
  await handleSubmit(question.trim())
}

defineExpose({
  openDrawer,
  openWithQuestion
})
</script>

<style scoped>
.hermes-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.hermes-head-copy {
  min-width: 0;
}

.hermes-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 24px;
  font-weight: 900;
  line-height: 1.05;
}

.hermes-subtitle {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hermes-close-button,
.hermes-chip-button,
.hermes-reference-item,
.hermes-send-button {
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  font: inherit;
}

.hermes-close-button {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(243, 244, 245, 0.96);
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.hermes-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #f3f4f5;
}

.hermes-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 10px 18px 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hermes-section-title {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hermes-quick-prompts,
.hermes-reference-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hermes-chip-list,
.hermes-reference-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hermes-chip-button {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: var(--app-text);
  font-size: 12px;
  font-weight: 700;
}

.hermes-chip-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hermes-message-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hermes-message-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hermes-message-row.user {
  align-items: flex-end;
}

.hermes-message-row.assistant {
  align-items: flex-start;
}

.hermes-message-row.assistant .hermes-message-bubble {
  width: 100%;
  box-sizing: border-box;
}

.hermes-message-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.hermes-role-tag {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 220, 195, 0.72);
  color: #8b5e34;
  font-size: 10px;
}

.hermes-message-bubble {
  max-width: 100%;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
}

.hermes-message-row.user .hermes-message-bubble {
  background: linear-gradient(135deg, rgba(var(--app-primary-container-rgb), 0.92) 0%, rgba(var(--app-primary-rgb), 0.92) 100%);
  color: #fff;
}

.hermes-message-bubble.streaming {
  border: 1px dashed rgba(var(--app-primary-rgb), 0.26);
}

.hermes-message-bubble.error {
  background: rgba(255, 218, 214, 0.86);
  color: #93000a;
}

.hermes-message-bubble pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.8;
}

.hermes-markdown-content {
  color: inherit;
  font-size: 13px;
  line-height: 1.85;
  word-break: break-word;
}

.hermes-markdown-content :deep(p),
.hermes-markdown-content p {
  margin: 0 0 10px;
}

.hermes-markdown-content :deep(p:last-child),
.hermes-markdown-content p:last-child {
  margin-bottom: 0;
}

.hermes-markdown-content :deep(ul),
.hermes-markdown-content :deep(ol),
.hermes-markdown-content ul,
.hermes-markdown-content ol {
  margin: 0 0 10px;
  padding-left: 20px;
}

.hermes-markdown-content :deep(li),
.hermes-markdown-content li {
  margin: 4px 0;
}

.hermes-markdown-content :deep(blockquote),
.hermes-markdown-content blockquote {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-left: 3px solid rgba(var(--app-primary-rgb), 0.38);
  background: rgba(var(--app-primary-container-rgb), 0.1);
  border-radius: 0 12px 12px 0;
}

.hermes-markdown-content :deep(pre),
.hermes-markdown-content pre {
  margin: 0 0 10px;
  padding: 12px 14px;
  overflow: auto;
  border-radius: 14px;
  background: #141b22;
  color: #f8fafc;
}

.hermes-markdown-content :deep(code),
.hermes-markdown-content code {
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.08);
  font-family: var(--app-font-mono, 'Consolas');
  font-size: 12px;
}

.hermes-markdown-content :deep(pre code),
.hermes-markdown-content pre code {
  padding: 0;
  background: transparent;
  color: inherit;
}

.hermes-markdown-content :deep(h1),
.hermes-markdown-content :deep(h2),
.hermes-markdown-content :deep(h3),
.hermes-markdown-content :deep(h4),
.hermes-markdown-content h1,
.hermes-markdown-content h2,
.hermes-markdown-content h3,
.hermes-markdown-content h4 {
  margin: 0 0 10px;
  color: inherit;
  font-family: var(--app-font-heading);
  line-height: 1.35;
}

.hermes-markdown-content :deep(a),
.hermes-markdown-content a {
  color: var(--app-primary);
  text-decoration: underline;
}

.hermes-markdown-content :deep(.hermes-think-block),
.hermes-markdown-content .hermes-think-block {
  width: 100%;
  margin: 0 0 10px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.12);
  border-radius: 16px;
  background: rgba(243, 244, 245, 0.78);
  box-sizing: border-box;
  overflow: hidden;
}

.hermes-markdown-content :deep(.hermes-think-block summary),
.hermes-markdown-content .hermes-think-block summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  color: var(--app-text);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  list-style: none;
}

.hermes-markdown-content :deep(.hermes-think-summary-main),
.hermes-markdown-content .hermes-think-summary-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.hermes-markdown-content :deep(.hermes-think-status-icon),
.hermes-markdown-content .hermes-think-status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  flex: 0 0 18px;
  font-size: 11px;
  font-weight: 900;
}

.hermes-markdown-content :deep(.hermes-think-status-icon.thinking),
.hermes-markdown-content .hermes-think-status-icon.thinking {
  color: rgba(var(--app-primary-rgb), 0.92);
  background: rgba(var(--app-primary-rgb), 0.12);
}

.hermes-markdown-content :deep(.hermes-think-status-icon.done),
.hermes-markdown-content .hermes-think-status-icon.done {
  color: #0f766e;
  background: rgba(15, 118, 110, 0.14);
}

.hermes-markdown-content :deep(.hermes-think-block.is-done),
.hermes-markdown-content .hermes-think-block.is-done {
  border-color: rgba(15, 118, 110, 0.18);
  background: rgba(236, 253, 245, 0.88);
}

.hermes-markdown-content :deep(.hermes-think-block.is-done .hermes-think-summary-label),
.hermes-markdown-content .hermes-think-block.is-done .hermes-think-summary-label {
  color: #0f766e;
}

.hermes-markdown-content :deep(.hermes-think-summary-label),
.hermes-markdown-content .hermes-think-summary-label {
  letter-spacing: 0.02em;
}

.hermes-markdown-content :deep(.hermes-think-dots),
.hermes-markdown-content .hermes-think-dots {
  display: inline-flex;
  align-items: flex-end;
  gap: 1px;
  color: rgba(var(--app-primary-rgb), 0.86);
}

.hermes-markdown-content :deep(.hermes-think-dots span),
.hermes-markdown-content .hermes-think-dots span {
  display: inline-block;
  min-width: 4px;
  animation: hermes-think-dot-bounce 1.1s ease-in-out infinite;
  transform-origin: center bottom;
}

.hermes-markdown-content :deep(.hermes-think-dots span:nth-child(2)),
.hermes-markdown-content .hermes-think-dots span:nth-child(2) {
  animation-delay: 0.16s;
}

.hermes-markdown-content :deep(.hermes-think-dots span:nth-child(3)),
.hermes-markdown-content .hermes-think-dots span:nth-child(3) {
  animation-delay: 0.32s;
}

.hermes-markdown-content :deep(.hermes-think-block summary::-webkit-details-marker),
.hermes-markdown-content .hermes-think-block summary::-webkit-details-marker {
  display: none;
}

.hermes-markdown-content :deep(.hermes-think-block summary::after),
.hermes-markdown-content .hermes-think-block summary::after {
  content: '展开';
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.hermes-markdown-content :deep(.hermes-think-block[open] summary::after),
.hermes-markdown-content .hermes-think-block[open] summary::after {
  content: '收起';
}

.hermes-markdown-content :deep(.hermes-think-content),
.hermes-markdown-content .hermes-think-content {
  padding: 0 14px 14px;
  border-top: 1px solid rgba(var(--app-outline-rgb), 0.08);
}

@keyframes hermes-think-dot-bounce {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

.hermes-markdown-content :deep(.hermes-table-wrap),
.hermes-markdown-content .hermes-table-wrap {
  width: 100%;
  margin: 0 0 10px;
  overflow-x: auto;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: inset 0 0 0 1px rgba(var(--app-outline-rgb), 0.12);
}

.hermes-markdown-content :deep(table),
.hermes-markdown-content table {
  width: 100%;
  min-width: 480px;
  border-collapse: collapse;
}

.hermes-markdown-content :deep(th),
.hermes-markdown-content :deep(td),
.hermes-markdown-content th,
.hermes-markdown-content td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--app-outline-rgb), 0.08);
  text-align: left;
  vertical-align: top;
  font-size: 12px;
  line-height: 1.7;
}

.hermes-markdown-content :deep(th),
.hermes-markdown-content th {
  background: rgba(243, 244, 245, 0.9);
  color: var(--app-text);
  font-weight: 800;
  white-space: nowrap;
}

.hermes-markdown-content :deep(tr:last-child td),
.hermes-markdown-content tr:last-child td {
  border-bottom: 0;
}

.hermes-empty-state {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.98);
}

.hermes-empty-kicker {
  color: #8b5e34;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hermes-empty-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 26px;
  font-weight: 900;
  line-height: 1.1;
}

.hermes-empty-description {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.8;
}

.hermes-mobile-intro {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(var(--app-primary-container-rgb), 0.14) 0%, rgba(var(--app-primary-rgb), 0.08) 100%);
}

.hermes-mobile-intro-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 20px;
  font-weight: 900;
  line-height: 1.1;
}

.hermes-mobile-intro-description {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.hermes-reference-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  text-align: left;
}

.hermes-reference-type {
  color: var(--app-primary);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hermes-reference-title {
  color: var(--app-text);
  font-size: 12px;
  font-weight: 700;
}

.hermes-footer {
  flex: 0 0 auto;
  padding: 14px 18px calc(18px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(var(--app-outline-rgb), 0.12);
  background: rgba(255, 255, 255, 0.98);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hermes-footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hermes-footer-tip {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
}

.hermes-send-button {
  min-height: 38px;
  padding: 0 16px;
  border-radius: 999px;
  background: #191c1d;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.hermes-send-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

:deep(.hermes-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 14px 18px 6px;
}

:deep(.hermes-drawer .el-drawer__body) {
  padding: 0;
}

:deep(.hermes-drawer .el-textarea__inner) {
  min-height: 94px !important;
  border-radius: 18px;
  background: #f8fafc;
  box-shadow: inset 0 0 0 1px rgba(var(--app-outline-rgb), 0.12);
}

@media (max-width: 900px) {
  .hermes-head {
    align-items: center;
  }

  .hermes-title {
    font-size: 22px;
  }

  .hermes-subtitle {
    margin-top: 2px;
    font-size: 10px;
  }

  .hermes-close-button {
    min-height: 30px;
    padding: 0 10px;
  }

  .hermes-body {
    padding: 14px 14px 8px;
  }

  .hermes-footer {
    padding: 12px 14px calc(16px + env(safe-area-inset-bottom));
    gap: 8px;
  }

  .hermes-empty-title {
    font-size: 22px;
  }

  .hermes-message-bubble {
    padding: 12px 14px;
    border-radius: 16px;
  }

  .hermes-message-bubble pre,
  .hermes-markdown-content {
    font-size: 12px;
    line-height: 1.75;
  }

  .hermes-markdown-content :deep(.hermes-think-block summary),
  .hermes-markdown-content .hermes-think-block summary,
  .hermes-markdown-content :deep(th),
  .hermes-markdown-content :deep(td),
  .hermes-markdown-content th,
  .hermes-markdown-content td {
    font-size: 11px;
  }

  .hermes-chip-list,
  .hermes-reference-list {
    gap: 8px;
  }

  .hermes-chip-button,
  .hermes-reference-item {
    min-height: 32px;
    padding: 0 10px;
  }

  .hermes-send-button {
    min-height: 36px;
    padding: 0 14px;
  }

  .hermes-footer-actions {
    align-items: flex-end;
    flex-direction: column;
  }

  :deep(.hermes-drawer.is-mobile .el-drawer) {
    border-radius: 24px 24px 0 0;
    overflow: hidden;
    background: rgba(248, 249, 250, 0.98);
  }

  :deep(.hermes-drawer.is-mobile .el-drawer__header) {
    margin-bottom: 0;
    padding: 12px 16px 6px;
    border-bottom: 1px solid rgba(var(--app-outline-rgb), 0.08);
    background: rgba(248, 249, 250, 0.96);
    backdrop-filter: blur(18px);
  }

  :deep(.hermes-drawer.is-mobile .el-drawer__body) {
    display: flex;
    min-height: 0;
    padding: 0;
  }

  :deep(.hermes-drawer.is-mobile .el-textarea__inner) {
    min-height: 88px !important;
    border-radius: 16px;
    background: #fff;
  }
}
</style>
