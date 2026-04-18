<template>
  <el-drawer
    v-model="drawerVisible"
    :direction="isMobileViewport ? 'btt' : 'rtl'"
    :size="isMobileViewport ? '100%' : '880px'"
    :show-close="false"
    :class="['hermes-drawer', { 'is-mobile': isMobileViewport }]"
  >
    <template #header>
      <div class="hermes-head">
        <div>
          <div class="hermes-title">Hermes 助手</div>
        </div>
        <button class="hermes-close-button" type="button" @click="drawerVisible = false">关闭</button>
      </div>
    </template>

    <div class="hermes-panel">
      <aside class="hermes-session-sidebar">
        <div class="hermes-session-content">
          <div class="hermes-session-toolbar">
            <button class="hermes-primary-button" type="button" :disabled="sending" @click="handleCreateSession">新建会话</button>
            <div class="hermes-session-tabs">
              <button class="hermes-tab" :class="{ active: !archivedView }" type="button" :disabled="sending" @click="archivedView = false">当前</button>
              <button class="hermes-tab" :class="{ active: archivedView }" type="button" :disabled="sending" @click="archivedView = true">已归档</button>
            </div>
          </div>

          <div class="hermes-session-list">
            <div v-if="sessionLoading" class="hermes-muted-card">正在加载会话...</div>
            <template v-else-if="sessionSummaries.length">
              <div
                v-for="session in sessionSummaries"
                :key="session.id"
                class="hermes-session-item"
                :class="{ active: selectedSessionId === session.id }"
              >
                <button
                  class="hermes-session-main"
                  type="button"
                  :disabled="sending"
                  @click="handleSelectSession(session.id)"
                >
                  <strong>{{ session.title || '新会话' }}</strong>
                </button>
                <el-dropdown
                  trigger="click"
                  placement="bottom-end"
                  @command="handleSessionCommandEvent(session, $event)"
                >
                  <button class="hermes-session-more-button" type="button" :disabled="sending">
                    <el-icon class="hermes-session-more-icon"><MoreFilled /></el-icon>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="rename">重命名</el-dropdown-item>
                      <el-dropdown-item v-if="session.archived" command="restore">恢复</el-dropdown-item>
                      <el-dropdown-item v-else command="archive">归档</el-dropdown-item>
                      <el-dropdown-item command="delete">删除</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
              <button v-if="canLoadMoreSessions" class="hermes-load-more-button" type="button" :disabled="loadingMoreSessions" @click="loadMoreSessions">
                {{ loadingMoreSessions ? '加载中...' : '查看更多' }}
              </button>
            </template>
            <div v-else class="hermes-muted-card">{{ archivedView ? '暂无已归档会话' : '暂无会话记录' }}</div>
          </div>
        </div>
      </aside>

      <section class="hermes-chat-shell">
        <div ref="messageScrollRef" class="hermes-body" @click="handleThinkSummaryClick" @scroll="handleMessageScroll">
          <section v-if="!currentSessionDetail" class="hermes-empty-state">
            <div class="hermes-empty-kicker">云端会话</div>
            <div class="hermes-empty-title">选择历史会话，或从当前页面新建</div>
          </section>

          <section v-if="displayPrompts.length" class="hermes-section">
            <div class="hermes-section-title">你可以这样问</div>
            <div class="hermes-chip-list">
              <button v-for="prompt in displayPrompts" :key="prompt" class="hermes-chip-button" type="button" :disabled="footerDisabled" @click="handleSubmit(prompt)">
                {{ prompt }}
              </button>
            </div>
          </section>

          <section v-if="detailLoading" class="hermes-muted-card">正在读取会话记录...</section>

          <section v-if="currentMessages.length" class="hermes-message-section">
            <div v-for="message in currentMessages" :key="message.id" class="hermes-message-row" :class="message.role">
              <div class="hermes-message-label">
                {{ message.role === 'user' ? '我' : 'Hermes' }}
                <span v-if="message.role === 'assistant'" class="hermes-role-tag">{{ currentRoleName }}</span>
              </div>
              <div class="hermes-message-bubble" :class="message.status">
                <pre v-if="message.role === 'user'">{{ message.content || '暂无内容' }}</pre>
                <div v-else class="hermes-markdown-content" v-html="renderAssistantMessage(message)"></div>
                <div v-if="message.attachments?.length" class="hermes-chip-list">
                  <button
                    v-for="attachment in message.attachments"
                    :key="`${attachment.assetId}-${attachment.fileName}`"
                    class="hermes-reference-item"
                    type="button"
                    @click="handleDownloadAttachment(attachment)"
                  >
                    <span>{{ attachment.sourceFormat }}</span>
                    <strong>{{ attachment.fileName }}</strong>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section v-if="currentSessionDetail && !currentMessages.length && !detailLoading" class="hermes-empty-state compact">
            <div class="hermes-empty-kicker">新会话</div>
            <div class="hermes-empty-title">把当前上下文交给 Hermes</div>
            <p>发送第一条问题后，会话记录会保存在云端，后续可以从左侧列表继续打开。</p>
          </section>

          <section v-if="currentSelectionCards.length" class="hermes-section">
            <div class="hermes-section-title">需要你确认</div>
            <article v-for="(selectionCard, cardIndex) in currentSelectionCards" :key="`${selectionCard.slot}-${cardIndex}`" class="hermes-card">
              <strong>{{ selectionCard.title }}</strong>
              <span>{{ selectionCard.description }}</span>
              <div class="hermes-option-list">
                <article v-for="(option, optionIndex) in selectionCard.options" :key="`${option.entityType}-${option.entityId ?? optionIndex}`" class="hermes-option-card">
                  <div>
                    <strong>{{ option.title }}</strong>
                    <span>{{ option.subtitle }}</span>
                    <small v-if="option.matchReasons.length">{{ option.matchReasons.join(' / ') }}</small>
                  </div>
                  <div class="hermes-inline-actions">
                    <button v-if="option.route" class="hermes-inline-button secondary" type="button" @click="handleOpenReference(option.route)">查看</button>
                    <button class="hermes-inline-button" type="button" :disabled="footerDisabled || option.entityId == null" @click="handleSelectOption(selectionCard, option)">选择此项</button>
                  </div>
                </article>
              </div>
            </article>
          </section>

          <section v-if="currentActions.length" class="hermes-section">
            <div class="hermes-section-title">可执行动作</div>
            <article v-for="(action, index) in currentActions" :key="`${action.type}-${index}`" class="hermes-action-card">
              <div>
                <strong>{{ action.title }}</strong>
                <span>{{ action.description }}</span>
              </div>
              <button class="hermes-inline-button" type="button" :disabled="footerDisabled || executingActionKey === actionKey(action, index)" @click="handleConfirmAction(action, index)">
                {{ executingActionKey === actionKey(action, index) ? '执行中...' : '确认执行' }}
              </button>
            </article>
          </section>

          <section v-if="currentReferences.length" class="hermes-section">
            <div v-if="wikiReferences.length" class="hermes-section-title">相关 Wiki 页面</div>
            <div v-if="wikiReferences.length" class="hermes-chip-list">
              <button v-for="reference in wikiReferences" :key="`wiki-${reference.id ?? reference.title}`" class="hermes-reference-item" type="button" @click="handleOpenReference(reference.route)">
                <span>{{ reference.type }}</span>
                <strong>{{ reference.title }}</strong>
              </button>
            </div>

            <div class="hermes-section-title">引用来源</div>
            <div class="hermes-chip-list">
              <button v-for="reference in nonWikiReferences" :key="`${reference.type}-${reference.id ?? reference.title}`" class="hermes-reference-item" type="button" @click="handleOpenReference(reference.route)">
                <span>{{ reference.type }}</span>
                <strong>{{ reference.title }}</strong>
              </button>
            </div>
          </section>

          <section v-if="isDebugMode && currentDebug" class="hermes-section">
            <div class="hermes-section-title">调试轨迹</div>
            <pre class="hermes-debug-pre">{{ formatDebugInfo(currentDebug) }}</pre>
          </section>
        </div>

        <div class="hermes-footer">
          <div class="hermes-attachment-bar">
            <input ref="fileInputRef" type="file" multiple accept=".pdf,.docx,.pptx,.xlsx" style="display: none" @change="handleFileInputChange" />
            <button class="hermes-inline-button secondary" type="button" :disabled="footerDisabled" @click="openFilePicker">添加附件</button>
            <span class="hermes-attachment-tip">每次最多 3 个文档</span>
          </div>
          <div v-if="pendingFiles.length" class="hermes-pending-file-list">
            <div v-for="file in pendingFiles" :key="`${file.name}-${file.size}`" class="hermes-pending-file-chip">
              <span class="hermes-pending-file-name">{{ file.name }}</span>
              <button class="hermes-pending-file-remove-button" type="button" :disabled="footerDisabled" @click="removePendingFile(file)">移除</button>
            </div>
          </div>
          <el-input v-model="draftQuestion" type="textarea" :rows="3" resize="none" :disabled="footerDisabled" :placeholder="footerPlaceholder" @keydown.enter.exact.prevent="handleSubmit()" />
          <div class="hermes-footer-actions">
            <span>{{ footerTip }}</span>
            <button class="hermes-send-button" type="button" :disabled="footerDisabled" @click="handleSubmit()">{{ sending ? '回答中...' : '发送' }}</button>
          </div>
        </div>
      </section>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MoreFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { archiveHermesConversationSession, createHermesConversationSession, deleteHermesConversationSession, getHermesConversationDetail, pageHermesConversationSessions, renameHermesConversationSession, restoreHermesConversationSession, streamHermesSessionChat, streamHermesSessionChatWithFiles } from '@/api/hermes'
import { createGitlabBindingScanTask } from '@/api/gitlab'
import { createExecutionTask, createTask, createTestPlan } from '@/api/platform'
import { useAuthStore } from '@/stores/auth'
import { renderHermesMarkdownToHtml } from '@/utils/hermesMarkdown'
import { DEFAULT_REQUIREMENT_TEMPLATE } from '@/utils/requirementTemplate'
import type { CreateHermesConversationSessionPayload, HermesActionItem, HermesAttachmentItem, HermesConversationDetailItem, HermesConversationSessionSummaryItem, HermesDebugInfoItem, HermesMessageItem, HermesReferenceItem, HermesSelectionCardItem, HermesSelectionOptionItem, HermesSelectionPayload, HermesSessionChatRequestPayload, HermesStreamDeltaEvent, HermesStreamDoneEvent, HermesStreamErrorEvent, HermesStreamMetaEvent, HermesStreamStatusEvent } from '@/types/hermes'

interface HermesDrawerProps {
  routeName: string
  projectId?: number | null
  taskId?: number | null
  iterationId?: number | null
  planId?: number | null
  wikiSpaceId?: number | null
  wikiPageId?: number | null
  fallbackPrompts?: string[]
}

const props = defineProps<HermesDrawerProps>()
const drawerVisible = defineModel<boolean>({ default: false })
const router = useRouter()
const authStore = useAuthStore()
const messageScrollRef = ref<HTMLDivElement>()
const fileInputRef = ref<HTMLInputElement>()
const isMobileViewport = ref(false)
const draftQuestion = ref('')
const pendingFiles = ref<File[]>([])
const sending = ref(false)
const sessionLoading = ref(false)
const loadingMoreSessions = ref(false)
const detailLoading = ref(false)
const archivedView = ref(false)
const sessionSummaries = ref<HermesConversationSessionSummaryItem[]>([])
const sessionPage = ref(1)
const sessionTotal = ref(0)
const selectedSessionId = ref<number | null>(readSelectedSessionId())
const currentSessionDetail = ref<HermesConversationDetailItem | null>(null)
const currentRoleName = ref(resolveCurrentRoleName())
const currentMessages = ref<HermesMessageItem[]>([])
const currentReferences = ref<HermesReferenceItem[]>([])
const currentSuggestions = ref<string[]>([])
const currentActions = ref<HermesActionItem[]>([])
const currentSelectionCards = ref<HermesSelectionCardItem[]>([])
const currentDebug = ref<HermesDebugInfoItem | null>(null)
const activeStreamAbort = ref<(() => void) | null>(null)
const thinkBlockOpenState = new Map<string, boolean>()
const executingActionKey = ref('')
const HERMES_DEBUG_STORAGE_KEY = 'git-ai-club:hermes:debug'
const HERMES_SELECTED_SESSION_STORAGE_KEY = 'git-ai-club:hermes:selected-session'
const SESSION_PAGE_SIZE = 20
const isDebugMode = ref(false)
const currentStreamStatus = ref<HermesStreamStatusEvent | null>(null)
const isPinnedToBottom = ref(true)
const pendingStreamDeltaMap = new Map<string, string>()
const STREAM_DRAIN_INTERVAL_MS = 20
const STREAM_DRAIN_CHARS_PER_TICK = 18
const STREAM_PUNCTUATION_PAUSE_MS = 36
const STREAM_LINE_BREAK_PAUSE_MS = 52
let pendingStreamDrainTimer: ReturnType<typeof setTimeout> | null = null

const displayPrompts = computed(() => currentSuggestions.value.length ? currentSuggestions.value : props.fallbackPrompts || [])
const wikiReferences = computed(() => currentReferences.value.filter((item) => item.type === 'WIKI_PAGE'))
const nonWikiReferences = computed(() => currentReferences.value.filter((item) => item.type !== 'WIKI_PAGE'))
const currentStreamStatusText = computed(() => {
  const message = currentStreamStatus.value?.message || 'Hermes 正在整理回答'
  return message + '...'
})
const canLoadMoreSessions = computed(() => sessionSummaries.value.length < sessionTotal.value)
const footerDisabled = computed(() => sending.value || detailLoading.value || Boolean(currentSessionDetail.value?.archived))
const footerPlaceholder = computed(() => currentSessionDetail.value?.archived ? '归档会话需要恢复后继续提问' : '问你想问')
const footerTip = computed(() => sending.value ? currentStreamStatusText.value : currentSessionDetail.value?.archived ? '归档会话仅支持查看，恢复后可继续发送' : 'Enter 发送，Shift+Enter 换行')
const currentContextKey = computed(() => JSON.stringify(buildCurrentRouteContext()))

watch(drawerVisible, (visible) => {
  if (visible) {
    void initializeDrawer()
  }
})

watch(archivedView, () => {
  if (drawerVisible.value) {
    void loadSessionList(true)
  }
})

watch(currentContextKey, () => {
  if (drawerVisible.value && !archivedView.value && !sending.value) {
    void reconcileSelectedSessionForCurrentContext()
  }
})

watch(() => authStore.user?.roleNames, () => {
  currentRoleName.value = resolveCurrentRoleName()
})

onMounted(() => {
  syncViewportMode()
  if (typeof window !== 'undefined') {
    isDebugMode.value = window.localStorage.getItem(HERMES_DEBUG_STORAGE_KEY) === '1'
    window.addEventListener('resize', syncViewportMode)
  }
})

onBeforeUnmount(() => {
  flushPendingStreamDeltas(true)
  if (typeof window !== 'undefined') {
    if (pendingStreamDrainTimer != null) {
      window.clearTimeout(pendingStreamDrainTimer)
      pendingStreamDrainTimer = null
    }
    window.removeEventListener('resize', syncViewportMode)
  }
  activeStreamAbort.value?.()
  activeStreamAbort.value = null
})

/**
 * 初始化抽屉时只从后端恢复会话列表和选中会话详情，不再恢复浏览器内存里的消息缓存。
 */
const initializeDrawer = async () => {
  await loadSessionList(true)
  await reconcileSelectedSessionForCurrentContext()
}

/**
 * 读取会话列表，支持当前会话和已归档会话两个视图。
 */
const loadSessionList = async (reset = false) => {
  if (reset) {
    sessionPage.value = 1
    sessionLoading.value = true
  } else {
    loadingMoreSessions.value = true
  }
  try {
    const pageData = await pageHermesConversationSessions({ page: reset ? 1 : sessionPage.value + 1, size: SESSION_PAGE_SIZE, archived: archivedView.value })
    sessionPage.value = pageData.page
    sessionTotal.value = pageData.total
    sessionSummaries.value = reset ? pageData.records : mergeSessionSummaries(sessionSummaries.value, pageData.records)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载 Hermes 会话失败')
  } finally {
    sessionLoading.value = false
    loadingMoreSessions.value = false
  }
}

const loadMoreSessions = async () => {
  if (canLoadMoreSessions.value && !loadingMoreSessions.value) {
    await loadSessionList(false)
  }
}

/**
 * 读取并应用指定会话详情，确保刷新页面后也能从云端回显历史消息。
 */
const loadSessionDetail = async (sessionId: number) => {
  detailLoading.value = true
  try {
    const detail = await getHermesConversationDetail(sessionId)
    applySessionDetail(detail)
    selectedSessionId.value = detail.id
    persistSelectedSessionId(detail.id)
    if (detail.archived !== archivedView.value) {
      archivedView.value = detail.archived
    }
  } catch (error: any) {
    clearSelectedSession()
    ElMessage.error(error?.response?.data?.message || '加载 Hermes 会话详情失败')
  } finally {
    detailLoading.value = false
  }
}

const handleSelectSession = async (sessionId: number) => {
  if (!sending.value) {
    await loadSessionDetail(sessionId)
  }
}

const handleCreateSession = async () => {
  if (sending.value) {
    return
  }
  // 不再立即创建会话，只是清空当前选中状态，等待用户发送消息时再创建
  clearSelectedSession()
}

/**
 * 创建新会话时固定保存当前页面上下文，后续继续聊天不再受页面切换影响。
 */
const createAndSelectSession = async () => {
  try {
    const createdSession = await createHermesConversationSession(buildCreateSessionPayload())
    archivedView.value = false
    sessionSummaries.value = mergeSessionSummaries([createdSession], sessionSummaries.value)
    sessionTotal.value = Math.max(sessionTotal.value, sessionSummaries.value.length)
    applySessionDetail({ ...createdSession, latestDisplayState: emptyLatestDisplayState(), messages: [] })
    selectedSessionId.value = createdSession.id
    persistSelectedSessionId(createdSession.id)
    void loadSessionList(true)
    return createdSession
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '创建 Hermes 会话失败')
    return null
  }
}

const handleRenameSession = async (sessionOverride?: HermesConversationSessionSummaryItem | HermesConversationDetailItem | null) => {
  const targetSession = sessionOverride ?? currentSessionDetail.value
  if (!targetSession) {
    return
  }
  try {
    const result = await ElMessageBox.prompt('请输入新的会话标题', '重命名会话', { inputValue: targetSession.title, inputPattern: /^.{1,100}$/, inputErrorMessage: '会话标题长度需要在 1-100 个字符之间' })
    const nextTitle = String(result.value || '').trim()
    if (!nextTitle) {
      return
    }
    const renamed = await renameHermesConversationSession(targetSession.id, { title: nextTitle })
    patchCurrentSessionSummary(renamed)
    if (currentSessionDetail.value?.id === renamed.id) {
      currentSessionDetail.value = { ...currentSessionDetail.value, ...renamed }
    }
    ElMessage.success('会话已重命名')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '重命名会话失败')
    }
  }
}

const handleArchiveSession = async (sessionOverride?: HermesConversationSessionSummaryItem | HermesConversationDetailItem | null) => {
  const targetSession = sessionOverride ?? currentSessionDetail.value
  if (!targetSession) {
    return
  }
  try {
    await ElMessageBox.confirm('归档后会话会从当前列表隐藏，可在“已归档”中恢复。', '归档会话', { type: 'warning' })
    await archiveHermesConversationSession(targetSession.id)
    if (currentSessionDetail.value?.id === targetSession.id) {
      clearSelectedSession()
    }
    await loadSessionList(true)
    ElMessage.success('会话已归档')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '归档会话失败')
    }
  }
}

const handleRestoreSession = async (sessionOverride?: HermesConversationSessionSummaryItem | HermesConversationDetailItem | null) => {
  const targetSession = sessionOverride ?? currentSessionDetail.value
  if (!targetSession) {
    return
  }
  try {
    const restored = await restoreHermesConversationSession(targetSession.id)
    archivedView.value = false
    patchCurrentSessionSummary(restored)
    await loadSessionList(true)
    await loadSessionDetail(restored.id)
    ElMessage.success('会话已恢复')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '恢复会话失败')
  }
}

const handleDeleteSession = async (sessionOverride?: HermesConversationSessionSummaryItem | HermesConversationDetailItem | null) => {
  const targetSession = sessionOverride ?? currentSessionDetail.value
  if (!targetSession) {
    return
  }
  try {
    await ElMessageBox.confirm('删除后会连同该会话的历史消息一起清空，且无法恢复。', '删除会话', { type: 'warning' })
    await deleteHermesConversationSession(targetSession.id)
    if (currentSessionDetail.value?.id === targetSession.id) {
      clearSelectedSession()
    }
    await loadSessionList(true)
    ElMessage.success('会话已删除')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除会话失败')
    }
  }
}

const handleSessionCommand = async (
  session: HermesConversationSessionSummaryItem,
  command: string
) => {
  if (command === 'rename') {
    await handleRenameSession(session)
    return
  }
  if (command === 'archive') {
    await handleArchiveSession(session)
    return
  }
  if (command === 'restore') {
    await handleRestoreSession(session)
    return
  }
  if (command === 'delete') {
    await handleDeleteSession(session)
  }
}

const handleSessionCommandEvent = async (
  session: HermesConversationSessionSummaryItem,
  command: string | number | object
) => {
  await handleSessionCommand(session, String(command))
}

const handleOpenReference = async (route: string) => {
  if (route) {
    await router.push(route)
  }
}

const actionKey = (action: HermesActionItem, index: number) => `${action.type}:${index}:${action.title}`

/**
 * Hermes 只负责给出动作建议，真正写入仍走平台执行中心接口并在用户确认后发生。
 */
const executeAction = async (action: { type: string; title: string; description: string; requiresConfirm: boolean; params: Record<string, unknown> }, key: string) => {
  try {
    if (action.requiresConfirm) {
      await ElMessageBox.confirm(action.description || `确认执行“${action.title}”吗？`, '确认执行动作', { type: 'warning' })
    }
    executingActionKey.value = key
    const params = action.params || {}
    if (action.type === 'CREATE_EXECUTION_TASK') {
      const executionTask = await createExecutionTask({ scenarioCode: String(params.scenarioCode || ''), projectId: Number(params.projectId), workItemId: params.workItemId == null ? null : Number(params.workItemId), triggerSource: String(params.triggerSource || 'HERMES'), inputPayload: (params.inputPayload || {}) as Record<string, unknown> })
      ElMessage.success('执行任务已创建')
      drawerVisible.value = false
      await router.push({ name: 'execution-task-detail', params: { executionTaskId: executionTask.id } })
      return
    }
    if (action.type === 'CREATE_REPOSITORY_SCAN_TASK') {
      const bindingId = Number(params.bindingId)
      const executionTask = await createGitlabBindingScanTask(bindingId, { branch: String(params.branch || ''), rulesetCode: String(params.rulesetCode || '') })
      ElMessage.success('仓库扫描任务已创建')
      drawerVisible.value = false
      await router.push({ name: 'execution-task-detail', params: { executionTaskId: executionTask.id } })
      return
    }
    if (action.type === 'CREATE_WORK_ITEM_DRAFT') {
      const workItemType = String(params.workItemType || '需求')
      const content = String(params.content || '')
      const name = String(params.name || (content.slice(0, 40) || `Hermes 创建的${workItemType}草稿`))
      const requirementMarkdown = workItemType === '需求' ? `${DEFAULT_REQUIREMENT_TEMPLATE}\n\n### 临时补充\n\n${content}` : ''
      await createTask({ name, workItemType: workItemType as '需求' | '任务' | '缺陷', status: '草稿', priority: '中', assignee: params.assigneeUserId ? '待确认' : '', assigneeUserId: params.assigneeUserId == null ? null : Number(params.assigneeUserId), collaboratorUserIds: [], description: workItemType === '需求' ? requirementMarkdown : content, requirementMarkdown, prototypeUrl: '', projectId: Number(params.projectId), agentId: null, iterationId: params.iterationId == null ? null : Number(params.iterationId), requirementTaskId: null })
      ElMessage.success('工作项草稿已创建')
      drawerVisible.value = false
      if (params.projectId) {
        await router.push({ name: 'project-iterations', params: { projectId: Number(params.projectId) } })
      }
      return
    }
    if (action.type === 'CREATE_TEST_PLAN_DRAFT') {
      await createTestPlan({ name: String(params.name || 'Hermes 测试计划草稿'), projectId: Number(params.projectId), iterationId: Number(params.iterationId), status: '草稿', description: String(params.description || ''), cases: [] })
      ElMessage.success('测试计划草稿已创建')
      drawerVisible.value = false
      await router.push({ name: 'tests' })
      return
    }
    ElMessage.warning('暂不支持该动作类型')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '执行动作失败')
    }
  } finally {
    executingActionKey.value = ''
  }
}

const handleConfirmAction = async (action: HermesActionItem, index: number) => executeAction(action, actionKey(action, index))

const updateMessage = (messageId: string, updater: (current: HermesMessageItem) => HermesMessageItem) => {
  const shouldScroll = shouldAutoScrollWithStream()
  currentMessages.value = currentMessages.value.map((item) => (item.id === messageId ? updater(item) : item))
  void restoreThinkBlocksAndScroll(shouldScroll)
}

/**
 * 把网络返回的流式分片先放进缓冲区，再按统一节奏吐字，体感会更接近 ChatGPT。
 */
const queueStreamDelta = (messageId: string, delta: string) => {
  if (!delta) return
  pendingStreamDeltaMap.set(messageId, `${pendingStreamDeltaMap.get(messageId) || ''}${delta}`)
  ensurePendingStreamDrainLoop()
}

const buildPayload = (question: string, selection?: HermesSelectionPayload | null): HermesSessionChatRequestPayload => ({ question, selection: selection || null, debug: isDebugMode.value })

/**
 * 流式阶段已经拿到的文本通常最完整地保留了 `<think>` 思考过程。
 */
const resolveAssistantFinalContent = (streamedContent: string, doneContent: string) => {
  const normalizedStreamed = streamedContent || ''
  const normalizedDone = doneContent || ''
  if (!normalizedDone.trim()) return normalizedStreamed
  const streamedHasUnclosedThink = /<think\b/i.test(normalizedStreamed) && !/<\/think>\s*$/i.test(normalizedStreamed.trim())
  if (streamedHasUnclosedThink) return normalizedDone
  const streamedHasThink = /<think\b/i.test(normalizedStreamed)
  const doneHasThink = /<think\b/i.test(normalizedDone)
  if (streamedHasThink && !doneHasThink) return normalizedStreamed
  if (normalizedDone.length < normalizedStreamed.length && normalizedStreamed.includes(normalizedDone)) return normalizedStreamed
  return normalizedDone
}

const renderAssistantMessage = (message: HermesMessageItem) => renderHermesMarkdownToHtml(message.content || (message.status === 'streaming' ? currentStreamStatusText.value : '暂无内容'), { thinkBlockKeyPrefix: message.id, isThinkBlockOpen: (thinkBlockKey: string) => Boolean(thinkBlockOpenState.get(thinkBlockKey)) })
const formatDebugInfo = (debug: HermesDebugInfoItem | null) => JSON.stringify(debug || {}, null, 2)

const submitConversation = async (question: string, userContent: string, selection?: HermesSelectionPayload | null) => {
  const normalizedQuestion = question.trim()
  const normalizedUserContent = userContent.trim() || normalizedQuestion
  if (!normalizedQuestion || sending.value) return
  const writableSessionId = await ensureWritableSession()
  if (!writableSessionId) return

  drawerVisible.value = true
  sending.value = true
  activeStreamAbort.value?.()
  activeStreamAbort.value = null
  const userMessageId = `user-${Date.now()}`
  const assistantMessageId = `assistant-${Date.now()}`
  currentActions.value = []
  currentSelectionCards.value = []
  currentDebug.value = null
  currentStreamStatus.value = { stage: 'planning', message: 'Hermes 正在分析问题' }
  currentMessages.value = [
    ...currentMessages.value,
    { id: userMessageId, role: 'user', content: normalizedUserContent, status: 'done', attachments: pendingFiles.value.map(toAttachmentSummary) },
    { id: assistantMessageId, role: 'assistant', content: '', status: 'streaming', attachments: [] }
  ]
  isPinnedToBottom.value = true
  draftQuestion.value = ''
  void restoreThinkBlocksAndScroll()

  try {
    const payload = buildPayload(normalizedQuestion, selection)
    const streamController = pendingFiles.value.length
      ? await streamHermesSessionChatWithFiles(writableSessionId, payload, pendingFiles.value, {
          onStatus: (streamPayload: HermesStreamStatusEvent) => { currentStreamStatus.value = streamPayload },
          onMeta: (streamPayload: HermesStreamMetaEvent) => { applyStreamDisplayState(streamPayload.roleName, streamPayload.references, streamPayload.suggestions, streamPayload.actions, streamPayload.selectionCards, streamPayload.debug) },
          onDelta: (streamPayload: HermesStreamDeltaEvent) => queueStreamDelta(assistantMessageId, streamPayload.content || ''),
          onDone: (streamPayload: HermesStreamDoneEvent) => {
            flushPendingStreamDeltas(true)
            applyStreamDisplayState(streamPayload.roleName, streamPayload.references, streamPayload.suggestions, streamPayload.actions, streamPayload.selectionCards, streamPayload.debug)
            const shouldPreferTerminalContent = Boolean(streamPayload.actions?.length || streamPayload.selectionCards?.length)
        updateMessage(assistantMessageId, (current) => ({ ...current, content: shouldPreferTerminalContent ? (streamPayload.content || current.content) : resolveAssistantFinalContent(current.content, streamPayload.content), status: 'done', attachments: current.attachments || [] }))
            pendingFiles.value = []
            finishStream()
            void refreshCurrentSessionFromCloud()
          },
          onError: (streamPayload: HermesStreamErrorEvent) => {
            flushPendingStreamDeltas(true)
            updateMessage(assistantMessageId, (current) => ({ ...current, content: streamPayload.message || current.content || 'Hermes 助手暂时不可用', status: 'error', attachments: current.attachments || [] }))
            finishStream()
            ElMessage.error(streamPayload.message || 'Hermes 助手暂时不可用')
            void refreshCurrentSessionFromCloud()
          }
        })
      : await streamHermesSessionChat(writableSessionId, payload, {
      onStatus: (payload: HermesStreamStatusEvent) => { currentStreamStatus.value = payload },
      onMeta: (payload: HermesStreamMetaEvent) => { applyStreamDisplayState(payload.roleName, payload.references, payload.suggestions, payload.actions, payload.selectionCards, payload.debug) },
      onDelta: (payload: HermesStreamDeltaEvent) => queueStreamDelta(assistantMessageId, payload.content || ''),
      onDone: (payload: HermesStreamDoneEvent) => {
        flushPendingStreamDeltas(true)
        applyStreamDisplayState(payload.roleName, payload.references, payload.suggestions, payload.actions, payload.selectionCards, payload.debug)
        const shouldPreferTerminalContent = Boolean(payload.actions?.length || payload.selectionCards?.length)
        updateMessage(assistantMessageId, (current) => ({ ...current, content: shouldPreferTerminalContent ? (payload.content || current.content) : resolveAssistantFinalContent(current.content, payload.content), status: 'done', attachments: current.attachments || [] }))
        pendingFiles.value = []
        finishStream()
        void refreshCurrentSessionFromCloud()
      },
      onError: (payload: HermesStreamErrorEvent) => {
        flushPendingStreamDeltas(true)
        updateMessage(assistantMessageId, (current) => ({ ...current, content: payload.message || current.content || 'Hermes 助手暂时不可用', status: 'error', attachments: current.attachments || [] }))
        finishStream()
        ElMessage.error(payload.message || 'Hermes 助手暂时不可用')
        void refreshCurrentSessionFromCloud()
      }
    })
    activeStreamAbort.value = streamController.abort
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Hermes 助手暂时不可用'
    updateMessage(assistantMessageId, (current) => ({ ...current, content: message, status: 'error', attachments: current.attachments || [] }))
    finishStream()
    ElMessage.error(message)
  }
}

const handleSubmit = async (questionOverride?: string) => {
  const normalizedQuestion = (questionOverride ?? draftQuestion.value).trim()
  await submitConversation(normalizedQuestion, normalizedQuestion)
}

const handleSelectOption = async (selectionCard: HermesSelectionCardItem, option: HermesSelectionOptionItem) => {
  if (option.entityId == null) return
  await submitConversation((selectionCard.resumeQuestion || draftQuestion.value || option.title).trim(), `我选择了：${option.title}`, { slot: selectionCard.slot || option.slot, entityType: option.entityType, entityId: Number(option.entityId), resumeQuestion: selectionCard.resumeQuestion || undefined })
}

/**
 * 发送前确保存在可写入的当前会话；如果没有会话，就按当前页面上下文即时创建。
 */
const ensureWritableSession = async () => {
  if (selectedSessionId.value && (!currentSessionDetail.value || currentSessionDetail.value.id !== selectedSessionId.value)) {
    await loadSessionDetail(selectedSessionId.value)
  }
  if (currentSessionDetail.value && !currentSessionDetail.value.archived) return currentSessionDetail.value.id
  // 发送消息时才创建会话，不显示提示
  const createdSession = await createAndSelectSession()
  return createdSession?.id || null
}

const refreshCurrentSessionFromCloud = async () => {
  if (!selectedSessionId.value) return
  await Promise.all([loadSessionDetail(selectedSessionId.value), loadSessionList(true)])
}

const openDrawer = () => { drawerVisible.value = true }
const openWithQuestion = async (question: string) => {
  drawerVisible.value = true
  if (!question.trim()) return
  draftQuestion.value = question.trim()
  await nextTick()
  await handleSubmit(question.trim())
}

defineExpose({ openDrawer, openWithQuestion })

function applyStreamDisplayState(roleName: string, references: HermesReferenceItem[], suggestions: string[], actions: HermesActionItem[], selectionCards: HermesSelectionCardItem[], debug: HermesDebugInfoItem | null) {
  currentRoleName.value = roleName || resolveCurrentRoleName()
  currentReferences.value = references || []
  currentSuggestions.value = suggestions || []
  currentActions.value = actions || []
  currentSelectionCards.value = selectionCards || []
  currentDebug.value = debug || null
}

function finishStream() {
  flushPendingStreamDeltas(true)
  currentStreamStatus.value = null
  sending.value = false
  activeStreamAbort.value = null
}

function handleThinkSummaryClick(event: Event) {
  const summaryElement = event.target instanceof HTMLElement ? event.target.closest('summary') : null
  const thinkBlock = summaryElement instanceof HTMLElement ? summaryElement.parentElement : null
  if (thinkBlock instanceof HTMLDetailsElement && thinkBlock.dataset.thinkKey) {
    thinkBlockOpenState.set(thinkBlock.dataset.thinkKey, !thinkBlock.open)
  }
}

function handleMessageScroll() {
  isPinnedToBottom.value = resolveRemainingScrollDistance() <= 72
}

function shouldAutoScrollWithStream() {
  if (!messageScrollRef.value) return true
  return isPinnedToBottom.value
}

function resolveRemainingScrollDistance() {
  if (!messageScrollRef.value) return 0
  return messageScrollRef.value.scrollHeight - messageScrollRef.value.scrollTop - messageScrollRef.value.clientHeight
}

function schedulePendingStreamDrain(delay = STREAM_DRAIN_INTERVAL_MS) {
  if (!pendingStreamDeltaMap.size || pendingStreamDrainTimer != null) return
  pendingStreamDrainTimer = setTimeout(() => {
    pendingStreamDrainTimer = null
    const extraDelay = flushPendingStreamDeltas()
    if (!pendingStreamDeltaMap.size) return
    schedulePendingStreamDrain(extraDelay > 0 ? extraDelay : STREAM_DRAIN_INTERVAL_MS)
  }, delay)
}

function ensurePendingStreamDrainLoop() {
  schedulePendingStreamDrain()
}

/**
 * 根据换行、标点和长度做平滑分段，让流式输出既连贯又不会一坨一坨地跳。
 */
function takeStreamDisplayChunk(content: string) {
  if (!content) return ''
  const newlineIndex = content.indexOf('\n')
  if (newlineIndex >= 0 && newlineIndex < 10) {
    return content.slice(0, newlineIndex + 1)
  }
  const punctuationMatch = content.match(/^.{1,24}?[，。！？；：,.!?;:]/u)
  if (punctuationMatch?.[0]) {
    return punctuationMatch[0]
  }
  return content.slice(0, Math.min(content.length, STREAM_DRAIN_CHARS_PER_TICK))
}

function resolveChunkPause(chunk: string) {
  if (!chunk) return 0
  if (/\n\s*$/.test(chunk)) return STREAM_LINE_BREAK_PAUSE_MS
  if (/[，。！？；：,.!?;:]\s*$/u.test(chunk)) return STREAM_PUNCTUATION_PAUSE_MS
  return 0
}

function flushPendingStreamDeltas(flushAll = false) {
  if (pendingStreamDrainTimer != null) {
    clearTimeout(pendingStreamDrainTimer)
    pendingStreamDrainTimer = null
  }
  if (!pendingStreamDeltaMap.size) return 0
  const shouldScroll = shouldAutoScrollWithStream()
  const pendingChunks = new Map<string, string>()
  let extraDelay = 0
  pendingStreamDeltaMap.forEach((content, messageId) => {
    if (!content) return
    if (flushAll) {
      pendingChunks.set(messageId, content)
      return
    }
    const chunk = takeStreamDisplayChunk(content)
    if (!chunk) return
    pendingChunks.set(messageId, chunk)
    extraDelay = Math.max(extraDelay, resolveChunkPause(chunk))
    const rest = content.slice(chunk.length)
    if (rest) {
      pendingStreamDeltaMap.set(messageId, rest)
    } else {
      pendingStreamDeltaMap.delete(messageId)
    }
  })
  if (flushAll) pendingStreamDeltaMap.clear()
  if (!pendingChunks.size) return 0
  currentMessages.value = currentMessages.value.map((item) => {
    const pendingChunk = pendingChunks.get(item.id)
    if (!pendingChunk) return item
    return { ...item, content: `${item.content}${pendingChunk}`, status: 'streaming', attachments: item.attachments || [] }
  })
  void restoreThinkBlocksAndScroll(shouldScroll)
  return extraDelay
}

async function restoreThinkBlocksAndScroll(shouldScroll = true) {
  await nextTick()
  if (messageScrollRef.value) {
    messageScrollRef.value.querySelectorAll<HTMLDetailsElement>('.hermes-think-block[data-think-key]').forEach((thinkBlock) => {
      const thinkKey = thinkBlock.dataset.thinkKey
      if (thinkKey && thinkBlockOpenState.has(thinkKey)) thinkBlock.open = Boolean(thinkBlockOpenState.get(thinkKey))
    })
    if (shouldScroll) {
      messageScrollRef.value.scrollTop = messageScrollRef.value.scrollHeight
      isPinnedToBottom.value = true
    }
  }
}

function applySessionDetail(detail: HermesConversationDetailItem) {
  currentSessionDetail.value = detail
  currentMessages.value = detail.messages.map((message) => ({ id: `cloud-${message.id}`, role: message.role === 'user' ? 'user' : 'assistant', content: message.content || '', status: message.status === 'error' ? 'error' : 'done', attachments: message.attachments || [] }))
  const latestDisplayState = detail.latestDisplayState || emptyLatestDisplayState()
  currentReferences.value = latestDisplayState.references || []
  currentSuggestions.value = latestDisplayState.suggestions || []
  currentActions.value = latestDisplayState.actions || []
  currentSelectionCards.value = latestDisplayState.selectionCards || []
  currentDebug.value = latestDisplayState.debug || null
  currentRoleName.value = resolveCurrentRoleName()
  void restoreThinkBlocksAndScroll(false)
}

function clearSelectedSession() {
  selectedSessionId.value = null
  currentSessionDetail.value = null
  currentMessages.value = []
  currentReferences.value = []
  currentSuggestions.value = []
  currentActions.value = []
  currentSelectionCards.value = []
  currentDebug.value = null
  persistSelectedSessionId(null)
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  pendingFiles.value = files.slice(0, 3)
  if (files.length > 3) {
    ElMessage.warning('Hermes 第一版每次最多上传 3 个文档')
  }
  input.value = ''
}

function removePendingFile(target: File) {
  pendingFiles.value = pendingFiles.value.filter((file) => file !== target)
}

function handleDownloadAttachment(attachment: HermesAttachmentItem) {
  if (!selectedSessionId.value || attachment.id == null) {
    return
  }
  window.open(`/api/hermes/sessions/${selectedSessionId.value}/attachments/${attachment.id}/download`, '_blank')
}

function toAttachmentSummary(file: File): HermesAttachmentItem {
  const extension = file.name.split('.').pop()?.toUpperCase() || ''
  return {
    id: null,
    assetId: 0,
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
    sourceFormat: extension,
    suggestedTitle: '',
    truncated: false,
    warnings: [],
    createdAt: null
  }
}

function patchCurrentSessionSummary(summary: HermesConversationSessionSummaryItem) {
  sessionSummaries.value = mergeSessionSummaries([summary], sessionSummaries.value)
}

function mergeSessionSummaries(base: HermesConversationSessionSummaryItem[], incoming: HermesConversationSessionSummaryItem[]) {
  const seen = new Set<number>()
  return [...base, ...incoming].filter((item) => seen.has(item.id) ? false : (seen.add(item.id), true))
}

interface HermesRouteContextSnapshot {
  routeName: string
  projectId: number | null
  taskId: number | null
  iterationId: number | null
  planId: number | null
  wikiSpaceId: number | null
  wikiPageId: number | null
}

/**
 * Hermes 会话会把页面锚点固化到服务端，因此打开抽屉时需要优先恢复与当前路由一致的会话，
 * 避免沿用其他页面留下的旧会话，导致“当前 Wiki 页面”被误判成全局搜索。
 */
async function reconcileSelectedSessionForCurrentContext() {
  const preferredSessionId = resolvePreferredSessionIdForCurrentContext()
  if (!preferredSessionId) {
    clearSelectedSession()
    return
  }
  if (currentSessionDetail.value?.id === preferredSessionId && isSessionAlignedWithCurrentContext(currentSessionDetail.value)) {
    selectedSessionId.value = preferredSessionId
    persistSelectedSessionId(preferredSessionId)
    return
  }
  await loadSessionDetail(preferredSessionId)
}

function resolvePreferredSessionIdForCurrentContext() {
  const currentSelectedSummary = sessionSummaries.value.find((item) => item.id === selectedSessionId.value)
  if (currentSelectedSummary && isSessionAlignedWithCurrentContext(currentSelectedSummary)) {
    return currentSelectedSummary.id
  }
  const matchedSession = sessionSummaries.value.find((item) => isSessionAlignedWithCurrentContext(item))
  return matchedSession?.id ?? null
}

function isSessionAlignedWithCurrentContext(session: Pick<HermesConversationSessionSummaryItem, 'routeName' | 'projectId' | 'taskId' | 'iterationId' | 'planId' | 'wikiSpaceId' | 'wikiPageId'>) {
  const currentContext = buildCurrentRouteContext()
  return session.routeName === currentContext.routeName
    && (session.projectId ?? null) === currentContext.projectId
    && (session.taskId ?? null) === currentContext.taskId
    && (session.iterationId ?? null) === currentContext.iterationId
    && (session.planId ?? null) === currentContext.planId
    && (session.wikiSpaceId ?? null) === currentContext.wikiSpaceId
    && (session.wikiPageId ?? null) === currentContext.wikiPageId
}

function buildCurrentRouteContext(): HermesRouteContextSnapshot {
  return {
    routeName: props.routeName,
    projectId: props.projectId ?? null,
    taskId: props.taskId ?? null,
    iterationId: props.iterationId ?? null,
    planId: props.planId ?? null,
    wikiSpaceId: props.wikiSpaceId ?? null,
    wikiPageId: props.wikiPageId ?? null
  }
}

function buildCreateSessionPayload(): CreateHermesConversationSessionPayload {
  return buildCurrentRouteContext()
}

function emptyLatestDisplayState() {
  return { references: [], suggestions: [], actions: [], selectionCards: [], debug: null }
}

function formatSessionContext(session: Pick<HermesConversationSessionSummaryItem, 'routeName' | 'projectId' | 'taskId' | 'iterationId' | 'planId' | 'wikiSpaceId' | 'wikiPageId'>) {
  if (session.taskId) return `任务 #${session.taskId}`
  if (session.planId) return `测试计划 #${session.planId}`
  if (session.iterationId) return `迭代 #${session.iterationId}`
  if (session.wikiSpaceId && session.wikiPageId) return `Wiki 页面 #${session.wikiPageId}`
  if (session.wikiSpaceId) return `Wiki 空间 #${session.wikiSpaceId}`
  if (session.wikiPageId) return `Wiki #${session.wikiPageId}`
  if (session.projectId) return `项目 #${session.projectId}`
  if (session.routeName === 'dashboard') return '首页看板'
  return '全局入口'
}

function formatSessionTime(session: HermesConversationSessionSummaryItem) {
  return session.lastMessageAt || session.updatedAt || session.createdAt || ''
}

function syncViewportMode() {
  if (typeof window !== 'undefined') isMobileViewport.value = window.innerWidth <= 900
}

function resolveCurrentRoleName() {
  return authStore.user?.roleNames?.[0] || '协作成员'
}

function readSelectedSessionId() {
  if (typeof window === 'undefined') return null
  const parsed = Number(window.sessionStorage.getItem(HERMES_SELECTED_SESSION_STORAGE_KEY))
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed
}

function persistSelectedSessionId(sessionId: number | null) {
  if (typeof window === 'undefined') return
  if (!sessionId) window.sessionStorage.removeItem(HERMES_SELECTED_SESSION_STORAGE_KEY)
  else window.sessionStorage.setItem(HERMES_SELECTED_SESSION_STORAGE_KEY, String(sessionId))
}
</script>

<style scoped>
.hermes-head,
.hermes-current-session-card,
.hermes-footer-actions,
.hermes-option-card,
.hermes-action-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.hermes-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 24px;
  font-weight: 900;
}

.hermes-subtitle,
.hermes-section-title {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hermes-close-button,
.hermes-primary-button,
.hermes-tab,
.hermes-session-item,
.hermes-load-more-button,
.hermes-ghost-button,
.hermes-chip-button,
.hermes-inline-button,
.hermes-send-button,
.hermes-reference-item {
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  font: inherit;
}

.hermes-close-button,
.hermes-ghost-button,
.hermes-tab,
.hermes-chip-button,
.hermes-reference-item,
.hermes-load-more-button {
  padding: 8px 12px;
  border-radius: 999px;
  background: #eef2f7;
  color: #334155;
  font-size: 12px;
  font-weight: 800;
}

.hermes-primary-button,
.hermes-send-button,
.hermes-inline-button {
  padding: 10px 14px;
  border-radius: 999px;
  background: #191c1d;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.hermes-primary-button.compact {
  align-self: flex-start;
}

.hermes-panel {
  display: grid;
  grid-template-columns: 164px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: #f3f4f5;
}

.hermes-session-sidebar {
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  padding: 0 7px;
  border-right: 1px solid rgba(var(--app-outline-rgb), 0.12);
  background: rgba(248, 250, 252, 0.95);
  display: block;
}

.hermes-session-content {
  width: 100%;
  min-height: 0;
  margin: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  transform: translateX(-8px);
}

.hermes-session-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 0;
  border-bottom: 1px solid rgba(var(--app-outline-rgb), 0.1);
}

.hermes-session-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.hermes-tab.active {
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary);
}

.hermes-session-list,
.hermes-body {
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.hermes-session-list {
  flex: 1 1 auto;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 0;
  align-items: stretch;
}

.hermes-session-item {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.04);
}

.hermes-session-item.active {
  box-shadow: inset 0 0 0 2px rgba(var(--app-primary-rgb), 0.22);
}

.hermes-session-main,
.hermes-session-more-button {
  border: 0;
  background: transparent;
  padding: 0;
}

.hermes-session-main {
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
}

.hermes-session-main strong {
  display: block;
  overflow: hidden;
  color: #0f172a;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.hermes-session-more-button {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #94a3b8;
}

.hermes-session-more-button:hover {
  background: rgba(226, 232, 240, 0.8);
  color: #334155;
}

.hermes-session-more-icon {
  font-size: 16px;
  transform: rotate(90deg);
}

.hermes-muted-card {
  color: #94a3b8;
  font-size: 11px;
}

.hermes-chat-shell {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.hermes-body {
  flex: 1 1 auto;
  min-height: 0;
  gap: 16px;
  padding: 12px 18px 10px;
}

.hermes-current-session-card,
.hermes-empty-state,
.hermes-card,
.hermes-action-card,
.hermes-muted-card {
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
}

.hermes-current-session-copy,
.hermes-card,
.hermes-section,
.hermes-option-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.hermes-current-session-copy strong,
.hermes-empty-title {
  color: #0f172a;
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 900;
}

.hermes-current-session-actions,
.hermes-inline-actions,
.hermes-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hermes-attachment-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.hermes-attachment-tip {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
}

.hermes-pending-file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hermes-pending-file-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 8px 10px 8px 12px;
  border-radius: 999px;
  background: #eef2f7;
  color: #334155;
}

.hermes-pending-file-name {
  overflow: hidden;
  max-width: 220px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hermes-pending-file-remove-button {
  flex: 0 0 auto;
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  padding: 2px 0;
  background: transparent;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.hermes-pending-file-remove-button:hover {
  color: #64748b;
}

.hermes-ghost-button.primary,
.hermes-inline-button {
  background: #0f766e;
  color: #fff;
}

.hermes-ghost-button.danger {
  background: rgba(255, 218, 214, 0.86);
  color: #93000a;
}

.hermes-empty-kicker {
  color: #8b5e34;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hermes-empty-state p,
.hermes-card span,
.hermes-action-card span,
.hermes-option-card span {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.hermes-option-card {
  align-items: center;
  padding: 12px;
  border-radius: 14px;
  background: #eef2f7;
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
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 220, 195, 0.72);
  color: #8b5e34;
  font-size: 10px;
}

.hermes-message-bubble {
  max-width: 100%;
  padding: 14px 16px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.hermes-message-row.user .hermes-message-bubble {
  background: linear-gradient(135deg, rgba(var(--app-primary-container-rgb), 0.92), rgba(var(--app-primary-rgb), 0.92));
  color: #fff;
}

.hermes-message-bubble.streaming {
  border: 1px dashed rgba(var(--app-primary-rgb), 0.26);
  box-shadow: 0 10px 22px rgba(var(--app-primary-rgb), 0.08);
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
  font-size: 13px;
  line-height: 1.85;
  word-break: break-word;
}

.hermes-markdown-content :deep(p) {
  margin: 0 0 10px;
}

.hermes-markdown-content :deep(ul),
.hermes-markdown-content :deep(ol) {
  margin: 0 0 10px;
  padding-left: 20px;
}

.hermes-markdown-content :deep(pre) {
  padding: 12px;
  overflow: auto;
  border-radius: 14px;
  background: #141b22;
  color: #f8fafc;
}

.hermes-markdown-content :deep(.hermes-think-block) {
  margin: 0 0 10px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.12);
  border-radius: 16px;
  background: rgba(243, 244, 245, 0.78);
  overflow: hidden;
}

.hermes-markdown-content :deep(.hermes-think-block summary) {
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

.hermes-markdown-content :deep(.hermes-think-summary-main) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.hermes-markdown-content :deep(.hermes-think-status-icon) {
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

.hermes-markdown-content :deep(.hermes-think-status-icon.thinking) {
  color: rgba(var(--app-primary-rgb), 0.92);
  background: rgba(var(--app-primary-rgb), 0.12);
}

.hermes-markdown-content :deep(.hermes-think-status-icon.done) {
  color: #0f766e;
  background: rgba(15, 118, 110, 0.14);
}

.hermes-markdown-content :deep(.hermes-think-block.is-done) {
  border-color: rgba(15, 118, 110, 0.18);
  background: rgba(236, 253, 245, 0.88);
}

.hermes-markdown-content :deep(.hermes-think-block.is-done .hermes-think-summary-label) {
  color: #0f766e;
}

.hermes-markdown-content :deep(.hermes-think-summary-label) {
  letter-spacing: 0.02em;
}

.hermes-markdown-content :deep(.hermes-think-dots) {
  display: inline-flex;
  align-items: flex-end;
  gap: 1px;
  color: rgba(var(--app-primary-rgb), 0.86);
}

.hermes-markdown-content :deep(.hermes-think-dots span) {
  display: inline-block;
  min-width: 4px;
  animation: hermes-think-dot-bounce 1.1s ease-in-out infinite;
  transform-origin: center bottom;
}

.hermes-markdown-content :deep(.hermes-think-dots span:nth-child(2)) {
  animation-delay: 0.16s;
}

.hermes-markdown-content :deep(.hermes-think-dots span:nth-child(3)) {
  animation-delay: 0.32s;
}

.hermes-markdown-content :deep(.hermes-think-block summary::-webkit-details-marker) {
  display: none;
}

.hermes-markdown-content :deep(.hermes-think-block summary::after) {
  content: '展开';
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.hermes-markdown-content :deep(.hermes-think-block[open] summary::after) {
  content: '收起';
}

.hermes-markdown-content :deep(.hermes-think-content) {
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

.hermes-debug-pre {
  margin: 0;
  padding: 12px;
  border-radius: 16px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 11px;
  white-space: pre-wrap;
}

.hermes-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px calc(18px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(var(--app-outline-rgb), 0.12);
  background: #fff;
}

.hermes-footer-actions span {
  color: #94a3b8;
  font-size: 11px;
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

button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .hermes-panel {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(180px, 32vh) minmax(0, 1fr);
  }

  .hermes-session-sidebar {
    border-right: 0;
    border-bottom: 1px solid rgba(var(--app-outline-rgb), 0.12);
  }

  .hermes-body {
    padding: 12px 14px 8px;
  }

  .hermes-option-card,
  .hermes-action-card,
  .hermes-footer-actions {
    align-items: stretch;
    flex-direction: column;
  }

  :deep(.hermes-drawer.is-mobile .el-drawer) {
    border-radius: 24px 24px 0 0;
    overflow: hidden;
  }

  :deep(.hermes-drawer.is-mobile .el-drawer__body) {
    display: flex;
    min-height: 0;
    padding: 0;
  }
}
</style>
