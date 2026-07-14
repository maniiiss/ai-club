<template>
  <el-drawer
    v-model="drawerVisible"
    :direction="isMobileViewport ? 'btt' : 'rtl'"
    :size="drawerPresentation.size"
    :show-close="false"
    :class="drawerPresentation.classNames"
  >
    <template #header>
      <div class="hermes-head">
        <div class="hermes-head-left">
          <button v-if="memoryViewVisible" class="hermes-back-button" type="button" @click="memoryViewVisible = false">返回</button>
          <div class="hermes-title-wrap">
            <div class="hermes-title">{{ memoryViewVisible ? '知识' : 'Hermes 助手' }}</div>
            <el-tooltip v-if="!memoryViewVisible" placement="bottom-start" effect="light">
              <button class="hermes-help-button" type="button" aria-label="查看 Hermes 能力边界说明">
                <el-icon><QuestionFilled /></el-icon>
              </button>
              <template #content>
                <div class="hermes-help-tooltip">
                  <p>{{ hermesAssistantTooltipCopy.intro }}</p>
                  <p>{{ hermesAssistantTooltipCopy.boundary }}</p>
                  <p>{{ hermesAssistantTooltipCopy.confirmation }}</p>
                </div>
              </template>
            </el-tooltip>
          </div>
        </div>
        <div class="hermes-head-right">
          <button v-if="!memoryViewVisible" class="hermes-memory-entry" type="button" @click="handleOpenMemoryView">知识</button>
          <button v-if="!isMobileViewport" class="hermes-close-button hermes-view-toggle-button" type="button" @click="toggleDesktopFullscreen">
            {{ desktopFullscreen ? '退出全屏' : '全屏' }}
          </button>
          <button class="hermes-close-button" type="button" @click="drawerVisible = false">关闭</button>
        </div>
      </div>
    </template>

    <div class="hermes-panel" :style="{ gridTemplateColumns: drawerPresentation.panelColumns }">
      <div
        v-if="isMobileViewport"
        class="hermes-mobile-session-backdrop"
        :class="{ visible: mobileSessionPanelVisible }"
        @click="closeMobileSessionPanel"
      ></div>

      <aside
        class="hermes-session-sidebar"
        :class="{ 'mobile-panel-open': isMobileViewport && mobileSessionPanelVisible }"
      >
        <div class="hermes-session-content">
          <div v-if="isMobileViewport" class="hermes-mobile-session-head">
            <div class="hermes-mobile-session-title">会话记录</div>
            <button class="hermes-mobile-session-close" type="button" @click="closeMobileSessionPanel">收起</button>
          </div>
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
                  :title="session.title || '新会话'"
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

      <!-- 记忆管理二级页面 -->
      <section v-if="memoryViewVisible" class="hermes-memory-view">
        <div class="hermes-memory-header">
          <div class="hermes-memory-tabs">
            <button class="hermes-tab" :class="{ active: knowledgeTab === 'memory' }" type="button" @click="knowledgeTab = 'memory'">会话记忆</button>
            <button class="hermes-tab" :class="{ active: knowledgeTab === 'fileLibrary' }" type="button" @click="handleOpenFileLibraryTab">文件库</button>
          </div>
          <div v-if="knowledgeTab === 'memory'" class="hermes-memory-tabs secondary">
            <button class="hermes-tab" :class="{ active: memoryTab === 'conversation' }" type="button" @click="memoryTab = 'conversation'">原始会话记忆</button>
            <button class="hermes-tab" :class="{ active: memoryTab === 'consolidated' }" type="button" @click="memoryTab = 'consolidated'">整理后摘要</button>
          </div>
          <div v-if="knowledgeTab === 'memory'" class="hermes-memory-search">
            <input
              v-model="memoryQuery"
              class="hermes-memory-search-input"
              type="text"
              placeholder="搜索记忆..."
              @input="handleMemorySearch"
            />
          </div>
          <div v-else class="hermes-memory-search">
            <input
              v-model="fileLibraryQuery"
              class="hermes-memory-search-input"
              type="text"
              placeholder="搜索文件库..."
              @input="handleFileLibrarySearch"
            />
          </div>
        </div>
        <div v-if="knowledgeTab === 'memory'" class="hermes-memory-body">
          <div v-if="memoryConsolidating" class="hermes-muted-card">{{ memoryConsolidationHint }}</div>
          <div v-if="memoryLoading" class="hermes-muted-card">正在加载记忆...</div>

          <!-- 原始会话记忆 -->
          <template v-if="memoryTab === 'conversation' && !memoryLoading && !memoryConsolidating">
            <template v-if="memoryConversationList.length">
              <div
                v-for="memory in memoryConversationList"
                :key="memory.documentId"
                class="hermes-memory-item"
                :class="{ expanded: expandedMemoryIds[memory.documentId] }"
              >
                <div class="hermes-memory-content">
                  <div v-if="memory.scene" class="hermes-memory-scene">{{ memory.scene }}</div>
                  <div class="hermes-memory-question">{{ memory.question || memory.title || '未命名记忆' }}</div>
                  <template v-if="expandedMemoryIds[memory.documentId]">
                    <div v-if="memory.answer" class="hermes-memory-answer-label">Hermes 回答</div>
                    <div v-if="memory.answer" class="hermes-memory-answer">{{ memory.answer }}</div>
                  </template>
                  <div v-if="memory.createdAt" class="hermes-memory-time">{{ formatMemoryTime(memory.createdAt) }}</div>
                </div>
                <div class="hermes-memory-actions">
                  <button
                    class="hermes-memory-toggle"
                    type="button"
                    @click="toggleMemoryExpand(memory.documentId)"
                  >{{ expandedMemoryIds[memory.documentId] ? '收起' : '展开' }}</button>
                  <button
                    class="hermes-memory-delete"
                    type="button"
                    title="删除这条记忆"
                    @click="handleDeleteMemory(memory)"
                  >删除</button>
                </div>
              </div>
            </template>
            <div v-else class="hermes-empty-state compact">
              <div class="hermes-empty-kicker">原始会话记忆</div>
              <div class="hermes-empty-title">暂无会话记忆</div>
              <p>Hermes 会自动记住你和它的对话要点，下次聊天时会参考这些记忆来回答。</p>
            </div>
          </template>

          <!-- 整理后摘要 -->
          <template v-if="memoryTab === 'consolidated' && !memoryLoading && !memoryConsolidating">
            <template v-if="memoryFactList.length">
              <article v-for="fact in memoryFactList" :key="fact.id" class="hermes-memory-fact-item">
                <div class="hermes-memory-fact-summary">{{ fact.summary || '未生成摘要' }}</div>
                <div v-if="fact.subject || fact.predicate || fact.object" class="hermes-memory-fact-meta">
                  {{ [fact.subject, fact.predicate, fact.object].filter(Boolean).join(' · ') }}
                </div>
                <div class="hermes-memory-fact-footer">
                  <div v-if="fact.tags.length" class="hermes-memory-fact-tags">
                    <span v-for="tag in fact.tags.slice(0, 6)" :key="`${fact.id}-${tag}`" class="hermes-memory-tag">{{ tag }}</span>
                  </div>
                  <div v-if="fact.createdAt" class="hermes-memory-time">{{ formatMemoryTime(fact.createdAt) }}</div>
                </div>
              </article>
            </template>
            <div v-else class="hermes-empty-state compact">
              <div class="hermes-empty-kicker">整理后摘要</div>
              <div class="hermes-empty-title">暂无结构化摘要</div>
              <p>先多聊几轮积累记忆，再点击下方"整理记忆"按钮，Hermes 会用 AI 将碎片记忆整合为结构化知识。</p>
            </div>
          </template>
        </div>
        <div v-if="knowledgeTab === 'memory'" class="hermes-memory-footer">
          <button class="hermes-primary-button" type="button" :disabled="memoryLoading || memoryConsolidating" @click="handleConsolidateMemories">{{ memoryConsolidating ? '整理中...' : '整理记忆' }}</button>
          <button v-if="memoryConversationList.length" class="hermes-danger-button" type="button" :disabled="memoryLoading || memoryConsolidating" @click="handleClearMemories">清空全部</button>
        </div>
        <div v-if="knowledgeTab === 'fileLibrary'" class="hermes-memory-body">
          <input ref="fileLibraryInputRef" type="file" accept=".pdf,.docx,.pptx,.xlsx" style="display: none" @change="handleFileLibraryInputChange" />
          <div v-if="fileLibraryLoading" class="hermes-muted-card">正在加载文件库...</div>
          <div v-if="fileLibraryUploading" class="hermes-muted-card">正在上传并索引文件...</div>
          <template v-if="!fileLibraryLoading && fileLibraryItems.length">
            <article v-for="item in fileLibraryItems" :key="item.id" class="hermes-memory-item">
              <div class="hermes-memory-content">
                <div class="hermes-memory-scene">{{ item.sourceFormat || 'FILE' }} · {{ formatFileSize(item.fileSize) }} · {{ resolveFileLibraryStatusText(item) }}</div>
                <div class="hermes-memory-question">{{ item.title || item.fileName || '未命名文件' }}</div>
                <div v-if="item.description" class="hermes-memory-answer">{{ item.description }}</div>
                <div v-if="item.warnings.length" class="hermes-memory-answer warning">转换警告：{{ item.warnings.join('；') }}</div>
                <div v-if="item.lastError" class="hermes-memory-answer warning">切片/向量化失败：{{ item.lastError }}</div>
                <div v-if="item.updatedAt" class="hermes-memory-time">{{ formatMemoryTime(item.updatedAt) }}</div>
              </div>
              <div class="hermes-memory-actions">
                <button class="hermes-memory-toggle" type="button" :disabled="fileLibraryUpdatingId === item.id" @click="handleToggleFileLibraryItem(item)">{{ item.enabled ? '停用' : '启用' }}</button>
                <button class="hermes-memory-toggle" type="button" :disabled="fileLibraryUpdatingId === item.id" @click="handleReindexFileLibraryItem(item)">重新向量化</button>
                <button class="hermes-memory-toggle" type="button" @click="handleDownloadFileLibraryItem(item)">下载</button>
                <button class="hermes-memory-delete" type="button" :disabled="fileLibraryUpdatingId === item.id" @click="handleDeleteFileLibraryItem(item)">删除</button>
              </div>
            </article>
          </template>
          <div v-if="!fileLibraryLoading && !fileLibraryItems.length" class="hermes-empty-state compact">
            <div class="hermes-empty-kicker">文件库</div>
            <div class="hermes-empty-title">暂无个人知识文件</div>
            <p>上传 PDF、Word、PPT 或 Excel 后，Hermes 会在普通问答中按需召回这些个人资料。</p>
          </div>
        </div>
        <div v-if="knowledgeTab === 'fileLibrary'" class="hermes-memory-footer">
          <button class="hermes-primary-button" type="button" :disabled="fileLibraryUploading" @click="openFileLibraryPicker">{{ fileLibraryUploading ? '上传中...' : '上传文件' }}</button>
        </div>
      </section>

      <section v-if="!memoryViewVisible" class="hermes-chat-shell">
        <div v-if="isMobileViewport" class="hermes-mobile-session-toggle-shell">
          <button
            class="hermes-mobile-session-toggle"
            type="button"
            :aria-expanded="mobileSessionPanelVisible"
            :disabled="sending"
            @click="toggleMobileSessionPanel"
          >
            <span class="hermes-mobile-session-toggle-label">
              {{ mobileSessionPanelVisible ? '收起会话记录' : '打开会话记录' }}
            </span>
            <strong class="hermes-mobile-session-toggle-value">{{ mobileSessionToggleValue }}</strong>
          </button>
        </div>

        <div ref="messageScrollRef" class="hermes-body" @click="handleThinkSummaryClick" @toggle.capture="handleThinkBlockToggle" @scroll="handleMessageScroll">
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
                <span v-if="message.role === 'assistant'" class="hermes-role-tag">协作助手</span>
              </div>
              <div class="hermes-message-bubble" :class="[message.status, { 'stream-loading': shouldShowInlineStreamStatus(message) && !message.content?.trim() }]">
                <pre v-if="message.role === 'user'">{{ message.content || '暂无内容' }}</pre>
                <template v-else>
                  <div v-if="shouldShowAssistantMarkdown(message)" class="hermes-markdown-content" v-html="renderAssistantMessage(message)"></div>
                  <div v-if="shouldShowInlineStreamStatus(message)" class="hermes-thinking-indicator" :class="{ compact: Boolean(message.content?.trim()) }">
                    <span class="hermes-thinking-icon" aria-hidden="true"></span>
                    <span class="hermes-thinking-text">{{ currentStreamStatusText }}</span>
                    <span class="hermes-thinking-dots"><span>.</span><span>.</span><span>.</span></span>
                  </div>
                  <details v-if="shouldShowProcessTrace(message)" class="hermes-process-trace" :class="`is-${resolveMessageProcessTraceSummary(message).tone}`">
                    <summary>
                      <span class="hermes-process-summary-main">
                        <span class="hermes-process-status-icon">{{ resolveProcessToneIcon(resolveMessageProcessTraceSummary(message).tone) }}</span>
                        <span>{{ resolveMessageProcessTraceSummary(message).title }}</span>
                      </span>
                      <span class="hermes-process-summary-meta">{{ resolveMessageProcessTraceSummary(message).countText }}</span>
                    </summary>
                    <div class="hermes-process-trace-body">
                      <p class="hermes-process-description">{{ resolveMessageProcessTraceSummary(message).description }}</p>
                      <p v-if="resolveMessageToolExecutionHint(message)" class="hermes-process-description muted">{{ resolveMessageToolExecutionHint(message) }}</p>
                    </div>
                  </details>
                </template>
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

          <section v-if="hasPendingUserConfirmation" class="hermes-confirmation-hint">
            <div>
              <strong>需要你确认后继续</strong>
              <span>{{ currentSelectionCards.length ? hermesAssistantTooltipCopy.confirmation : 'Hermes 已准备好动作，确认后才会真正执行。' }}</span>
            </div>
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
              <div class="hermes-action-copy">
                <strong>{{ action.title }}</strong>
                <span>{{ action.description }}</span>
              </div>
              <button class="hermes-inline-button" type="button" :disabled="footerDisabled || executingActionKey === actionKey(action, index) || executedActionKeys.has(actionKey(action, index))" @click="handleConfirmAction(action, index)">
                {{ executedActionKeys.has(actionKey(action, index)) ? '已执行' : (executingActionKey === actionKey(action, index) ? '执行中...' : '确认执行') }}
              </button>
            </article>
          </section>

          <section v-if="currentReferences.length" class="hermes-section">
            <div v-if="wikiReferences.length" class="hermes-section-title">相关 Wiki 页面</div>
            <div v-if="wikiReferences.length" class="hermes-chip-list">
              <button
                v-for="reference in wikiReferences"
                :key="`wiki-${reference.id ?? reference.title}`"
                class="hermes-reference-item"
                type="button"
                :title="formatReferenceDisplayText(reference)"
                @click="handleOpenReference(reference.route)"
              >
                <span v-if="shouldShowReferenceLabel(reference)" class="hermes-reference-label">{{ formatReferenceTypeLabel(reference.type) }}:</span>
                <strong class="hermes-reference-title">{{ reference.title }}</strong>
              </button>
            </div>

            <div class="hermes-section-title">引用来源</div>
            <div class="hermes-chip-list">
              <button
                v-for="reference in nonWikiReferences"
                :key="`${reference.type}-${reference.id ?? reference.title}`"
                class="hermes-reference-item"
                type="button"
                :title="formatReferenceDisplayText(reference)"
                @click="handleOpenReference(reference.route)"
              >
                <span v-if="shouldShowReferenceLabel(reference)" class="hermes-reference-label">{{ formatReferenceTypeLabel(reference.type) }}:</span>
                <strong class="hermes-reference-title">{{ reference.title }}</strong>
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
            <button
              class="hermes-inline-button secondary hermes-voice-button"
              type="button"
              :disabled="voiceButtonDisabled"
              :class="{ active: recording }"
              @click="handleVoiceButtonClick"
            >
              {{ transcribing ? '转写中...' : recording ? '结束录音' : '语音输入' }}
            </button>
            <div v-if="recording" class="hermes-voice-meter" :class="{ active: recording }">
              <div class="hermes-voice-meter-track" aria-hidden="true">
                <div class="hermes-voice-meter-fill" :style="{ width: `${voiceLevelBarWidth}%` }"></div>
              </div>
              <span class="hermes-voice-meter-label">{{ voiceLevelLabel }}</span>
            </div>
          </div>
          <div v-if="pendingFiles.length" class="hermes-pending-file-list">
            <div v-for="file in pendingFiles" :key="`${file.name}-${file.size}`" class="hermes-pending-file-chip">
              <span class="hermes-pending-file-name">{{ file.name }}</span>
              <button class="hermes-pending-file-remove-button" type="button" :disabled="footerDisabled" @click="removePendingFile(file)">移除</button>
            </div>
          </div>
          <div v-if="slashMenuVisible" class="hermes-slash-menu">
            <button
              v-for="(command, index) in slashCommands"
              :key="command.command"
              class="hermes-slash-item"
              :class="{ active: activeSlashCommandIndex === index }"
              type="button"
              :aria-selected="activeSlashCommandIndex === index"
              @mouseenter="activeSlashCommandIndex = index"
              @click="selectSlashCommand(command.command)"
            >
              <strong>{{ command.command }}</strong>
              <span>{{ command.label }}</span>
            </button>
          </div>
          <div v-if="selectedSlashCommand" class="hermes-selected-skill">
            <span class="hermes-selected-skill-kicker">Skill</span>
            <strong>{{ selectedSlashCommand }}</strong>
            <span>{{ resolveSlashCommandLabel(selectedSlashCommand) }}</span>
            <button type="button" title="移除已选 Skill" @click="clearSelectedSlashCommand">×</button>
          </div>
          <el-input ref="questionInputRef" v-model="draftQuestion" type="textarea" :rows="3" resize="none" :disabled="footerDisabled" :placeholder="footerPlaceholder" @keydown="handleQuestionInputKeydown" />
          <div class="hermes-footer-actions">
            <span>{{ footerTip }}</span>
            <button v-if="sending" class="hermes-ghost-button danger" type="button" :disabled="!activeStreamAbort" @click="handleStopStream">停止</button>
            <button v-else class="hermes-send-button" type="button" :disabled="footerDisabled" @click="handleSubmit()">发送</button>
          </div>
        </div>
      </section>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { MoreFilled, QuestionFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { downloadCommonFile, openCommonFileDownload } from '@/api/common'
import { archiveHermesConversationSession, clearHermesUserMemories, consolidateHermesUserMemories, createHermesConversationSession, deleteHermesConversationSession, deleteHermesFileLibraryItem, deleteHermesUserMemory, getHermesConversationDetail, getHermesMemoryConsolidationStatus, listHermesFileLibraryItems, listHermesUserMemories, markHermesActionExecuted, pageHermesConversationSessions, reindexHermesFileLibraryItem, renameHermesConversationSession, restoreHermesConversationSession, streamHermesSessionChat, streamHermesSessionChatWithFiles, transcribeHermesSpeech, updateHermesFileLibraryItem, uploadHermesFileLibraryItem } from '@/api/hermes'
import { createGitlabBindingScanTask } from '@/api/gitlab'
import { createExecutionTask, createTask, createTestPlan } from '@/api/platform'
import { renderHermesMarkdownToHtml } from '@/utils/hermesMarkdown'
import { resolveHermesDrawerPresentation } from '@/utils/hermesDrawerLayout'
import { buildHermesToolTraceSummary, normalizeHermesToolExecutions } from '@/utils/hermesProcessTrace'
import { DEFAULT_REQUIREMENT_TEMPLATE } from '@/utils/requirementTemplate'
import type { CreateHermesConversationSessionPayload, HermesActionItem, HermesAttachmentItem, HermesConversationDetailItem, HermesConversationSessionSummaryItem, HermesDebugInfoItem, HermesFileLibraryItem, HermesMemoryConsolidationStatus, HermesMemoryFactItem, HermesMessageItem, HermesReferenceItem, HermesSelectionCardItem, HermesSelectionOptionItem, HermesSelectionPayload, HermesSessionChatRequestPayload, HermesStreamDeltaEvent, HermesStreamDoneEvent, HermesStreamErrorEvent, HermesStreamMetaEvent, HermesStreamStatusEvent, HermesUserMemoryItem } from '@/types/hermes'
import type { HermesToolExecutionViewItem, HermesToolTraceSummary } from '@/utils/hermesProcessTrace'

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

interface HermesQuestionInputExpose {
  focus?: () => void
}

const props = defineProps<HermesDrawerProps>()
const drawerVisible = defineModel<boolean>({ default: false })
const router = useRouter()
const messageScrollRef = ref<HTMLDivElement>()
const questionInputRef = ref<HermesQuestionInputExpose | null>(null)
const fileInputRef = ref<HTMLInputElement>()
const fileLibraryInputRef = ref<HTMLInputElement>()
const isMobileViewport = ref(false)
// 桌面端全屏只影响当前抽屉展示，不做持久化，关闭后恢复默认宽度。
const desktopFullscreen = ref(false)
const draftQuestion = ref('')
const selectedSlashCommand = ref<string | null>(null)
const activeSlashCommandIndex = ref(0)
const pendingFiles = ref<File[]>([])
const sending = ref(false)
const recording = ref(false)
const transcribing = ref(false)
const voiceInputSupported = ref(false)
const mediaStream = ref<MediaStream | null>(null)
const voiceAudioContext = ref<AudioContext | null>(null)
const voiceSourceNode = ref<MediaStreamAudioSourceNode | null>(null)
const voiceProcessorNode = ref<ScriptProcessorNode | null>(null)
const audioChunks = ref<Float32Array[]>([])
const discardVoiceRecording = ref(false)
const voiceLevel = ref(0)
const voiceInputDetected = ref(false)
const sessionLoading = ref(false)
const loadingMoreSessions = ref(false)
const detailLoading = ref(false)
const archivedView = ref(false)
const sessionSummaries = ref<HermesConversationSessionSummaryItem[]>([])
const sessionPage = ref(1)
const sessionTotal = ref(0)
// 移动端优先把历史会话折叠成滑出面板，避免聊天首屏被顶部会话区挤占。
const mobileSessionPanelVisible = ref(false)
const selectedSessionId = ref<number | null>(readSelectedSessionId())
const currentSessionDetail = ref<HermesConversationDetailItem | null>(null)
const currentMessages = ref<HermesMessageItem[]>([])
const currentReferences = ref<HermesReferenceItem[]>([])
const currentSuggestions = ref<string[]>([])
const currentActions = ref<HermesActionItem[]>([])
const currentSelectionCards = ref<HermesSelectionCardItem[]>([])
const currentDebug = ref<HermesDebugInfoItem | null>(null)
const activeStreamAbort = ref<(() => void) | null>(null)
const currentStreamingAssistantMessageId = ref<string | null>(null)
const stopRequested = ref(false)
const thinkBlockOpenState = new Map<string, boolean>()
const executingActionKey = ref('')
// 已成功执行过的动作 key 集合，用于把按钮从"确认执行"切换到"已执行"，
// 避免用户在抽屉中重复触发同一个写入动作。
const executedActionKeys = ref<Set<string>>(new Set())
const HERMES_DEBUG_STORAGE_KEY = 'git-ai-club:hermes:debug'
const HERMES_SELECTED_SESSION_STORAGE_KEY = 'git-ai-club:hermes:selected-session'
const SESSION_PAGE_SIZE = 20
const isDebugMode = ref(false)
const currentStreamStatus = ref<HermesStreamStatusEvent | null>(null)
const isPinnedToBottom = ref(true)
const pendingSessionBottomScroll = ref(false)
const pendingStreamDeltaMap = new Map<string, string>()
const streamStartedAt = ref(0)
const lastStreamDeltaAt = ref(0)
const lastStreamStatusAt = ref(0)
const streamStatusHeartbeat = ref(0)
const STREAM_DRAIN_INTERVAL_MS = 20
const STREAM_DRAIN_CHARS_PER_TICK = 18
const STREAM_PUNCTUATION_PAUSE_MS = 36
const STREAM_LINE_BREAK_PAUSE_MS = 52
let pendingStreamDrainTimer: ReturnType<typeof setTimeout> | null = null
let streamStatusHeartbeatTimer: number | null = null
let hermesDrawerDisposed = false

// 记忆管理相关状态
const memoryViewVisible = ref(false)
const knowledgeTab = ref<'memory' | 'fileLibrary'>('memory')
const memoryTab = ref<'conversation' | 'consolidated'>('conversation')
const memoryList = ref<HermesUserMemoryItem[]>([])
const memoryFactList = ref<HermesMemoryFactItem[]>([])
const memoryLoading = ref(false)
const memoryConsolidating = ref(false)
const memoryConsolidationMessage = ref('')
const memoryQuery = ref('')
const memorySearchTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const expandedMemoryIds = reactive<Record<string, boolean>>({})
const fileLibraryItems = ref<HermesFileLibraryItem[]>([])
const fileLibraryLoading = ref(false)
const fileLibraryUploading = ref(false)
const fileLibraryUpdatingId = ref<number | null>(null)
const fileLibraryQuery = ref('')
const fileLibrarySearchTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const slashCommands = [
  { command: '/文件库', label: '个人文件库问答' },
  { command: '/wiki', label: 'Wiki 问答' },
  { command: '/需求', label: '创建或整理需求' },
  { command: '/仓库扫描', label: '发起仓库扫描' },
  { command: '/执行任务', label: '查询或发起执行任务' }
] as const

// 统一把 Hermes 返回的引用类型转成前端可读的中文标签，避免直接暴露后端枚举值。
const HERMES_REFERENCE_TYPE_LABELS: Record<string, string> = {
  DASHBOARD: '首页看板',
  EXECUTION_TASK: '执行任务',
  GITLAB_BINDING: 'GitLab绑定',
  GLOBAL: '全局工作台',
  ITERATION: '迭代',
  PLAN: '测试计划',
  PROJECT: '项目',
  TASK: '任务',
  TEST_PLAN: '测试计划',
  WIKI_PAGE: 'Wiki页面',
  WIKI_SPACE: 'Wiki空间',
  WORK_ITEM: '工作项'
}

/**
 * 将 Hermes 的能力边界与确认机制收口到标题旁提示里，避免在正文区重复铺开长文案。
 */
const HERMES_ASSISTANT_TOOLTIP_COPY = {
  intro: 'Hermes 是平台内协作助手，会优先结合当前页面上下文和平台内可用数据，协助查询项目、工作项、执行任务、测试计划、Wiki 和附件内容。',
  boundary: '它不会直接代替外部浏览器、联网搜索，也不会绕过确认直接创建或修改数据。',
  confirmation: '查到多个候选对象时会先等你选择；写操作会先生成待确认动作，确认后才会真正执行。'
} as const

const displayPrompts = computed(() => currentSuggestions.value.length ? currentSuggestions.value : props.fallbackPrompts || [])
const wikiReferences = computed(() => currentReferences.value.filter((item) => item.type === 'WIKI_PAGE'))
const nonWikiReferences = computed(() => currentReferences.value.filter((item) => item.type !== 'WIKI_PAGE'))
const hermesAssistantTooltipCopy = computed(() => HERMES_ASSISTANT_TOOLTIP_COPY)
const currentStreamingAssistantMessage = computed(() => {
  if (!currentStreamingAssistantMessageId.value) return null
  return currentMessages.value.find((item) => item.id === currentStreamingAssistantMessageId.value) || null
})
/**
 * 后端目前只在关键节点推送有限的 status 事件，因此这里根据最近一次 delta / status 时间推断更贴近用户体感的流式提示，
 * 避免调用工具或整理答案时界面长时间停在同一句文案上，看起来像“卡住”。
 */
const currentStreamStatusText = computed(() => {
  streamStatusHeartbeat.value
  const explicitMessage = (currentStreamStatus.value?.message || '').trim()
  const stage = (currentStreamStatus.value?.stage || '').trim().toLowerCase()
  const hasVisibleContent = Boolean(currentStreamingAssistantMessage.value?.content?.trim())
  const now = streamStatusHeartbeat.value || Date.now()
  const startedAt = streamStartedAt.value || now
  const lastProgressAt = Math.max(startedAt, lastStreamDeltaAt.value || 0, lastStreamStatusAt.value || 0)
  const elapsedMs = Math.max(0, now - startedAt)
  const idleMs = Math.max(0, now - lastProgressAt)

  if (stage === 'connecting') {
    return explicitMessage || 'Hermes 正在连接服务'
  }
  if (idleMs >= 4500) {
    return hasVisibleContent ? 'Hermes 正在调用工具补充细节' : 'Hermes 正在调用工具收集信息'
  }
  if (!hasVisibleContent) {
    if (stage === 'thinking' && elapsedMs >= 2200) {
      return 'Hermes 正在分析问题'
    }
    return explicitMessage || 'Hermes 正在准备回答'
  }
  if (idleMs >= 2200) {
    return 'Hermes 正在整理已收集的信息'
  }
  if (stage === 'thinking') {
    return 'Hermes 正在整理回答'
  }
  return explicitMessage || 'Hermes 正在整理回答'
})
const memoryConsolidationHint = computed(() => memoryConsolidationMessage.value || '正在整理记忆，这个过程通常需要几十秒。')
const memoryConversationList = computed(() => memoryList.value)
const slashMenuVisible = computed(() => {
  const normalized = draftQuestion.value.trimStart()
  return !footerDisabled.value && !selectedSlashCommand.value && normalized.startsWith('/') && !normalized.includes(' ')
})
watch(slashMenuVisible, (visible) => {
  if (visible) {
    activeSlashCommandIndex.value = 0
  }
})
const canLoadMoreSessions = computed(() => sessionSummaries.value.length < sessionTotal.value)
const mobileSessionToggleValue = computed(() => {
  const count = sessionTotal.value || sessionSummaries.value.length
  return `${archivedView.value ? '已归档' : '当前'} · ${count} 条`
})
const footerDisabled = computed(() => recording.value || transcribing.value || sending.value || detailLoading.value || Boolean(currentSessionDetail.value?.archived))
const voiceButtonDisabled = computed(() => transcribing.value || sending.value || detailLoading.value || Boolean(currentSessionDetail.value?.archived))
const footerPlaceholder = computed(() => currentSessionDetail.value?.archived ? '归档会话需要恢复后继续提问' : '问你想问')
const footerTip = computed(() => {
  if (recording.value) return '正在录音，再次点击语音输入结束并转写'
  if (transcribing.value) return '正在转写语音...'
  return sending.value
    ? (currentStreamingAssistantMessage.value ? '' : currentStreamStatusText.value)
    : currentSessionDetail.value?.archived
      ? '归档会话仅支持查看，恢复后可继续发送'
      : 'Enter 发送，Shift+Enter 换行'
})
const hasPendingUserConfirmation = computed(() => Boolean(currentSelectionCards.value.length || currentActions.value.length))
const voiceLevelPercent = computed(() => Math.min(100, Math.round(Math.sqrt(Math.max(voiceLevel.value, 0)) * 180)))
const voiceLevelBarWidth = computed(() => {
  if (!recording.value) return 0
  if (voiceInputDetected.value) return Math.max(10, voiceLevelPercent.value)
  return Math.max(4, voiceLevelPercent.value)
})
const voiceLevelLabel = computed(() => {
  if (voiceLevelPercent.value >= 18) return '已检测到声音'
  if (voiceInputDetected.value) return '声音较弱，请靠近麦克风'
  return '等待声音'
})
const drawerPresentation = computed(() => resolveHermesDrawerPresentation({
  isMobileViewport: isMobileViewport.value,
  desktopFullscreen: desktopFullscreen.value
}))
const currentContextKey = computed(() => JSON.stringify(buildCurrentRouteContext()))

watch(drawerVisible, (visible) => {
  if (visible) {
    pendingSessionBottomScroll.value = true
    void initializeDrawer()
    return
  }
  desktopFullscreen.value = false
  mobileSessionPanelVisible.value = false
  stopVoiceRecording(true)
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

watch(isMobileViewport, (mobile) => {
  if (mobile) {
    desktopFullscreen.value = false
    return
  }
  mobileSessionPanelVisible.value = false
})

onMounted(() => {
  hermesDrawerDisposed = false
  syncViewportMode()
  voiceInputSupported.value = resolveVoiceInputSupport()
  if (typeof window !== 'undefined') {
    isDebugMode.value = window.localStorage.getItem(HERMES_DEBUG_STORAGE_KEY) === '1'
    window.addEventListener('resize', syncViewportMode)
  }
})

onBeforeUnmount(() => {
  hermesDrawerDisposed = true
  stopVoiceRecording(true)
  flushPendingStreamDeltas(true)
  stopStreamStatusHeartbeat()
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
 * 加载用户记忆列表。
 */
const loadMemoryList = async (query?: string) => {
  memoryLoading.value = true
  try {
    const overview = await listHermesUserMemories(query || '', 50)
    memoryList.value = overview.conversationMemories || []
    memoryFactList.value = overview.consolidatedFacts || []
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载 Hermes 记忆失败')
  } finally {
    memoryLoading.value = false
  }
}

/**
 * 加载个人文件库列表，文件库与会话记忆共同组成 Hermes 的个人知识入口。
 */
const loadFileLibraryItems = async (query?: string) => {
  fileLibraryLoading.value = true
  try {
    fileLibraryItems.value = await listHermesFileLibraryItems(query)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载 Hermes 文件库失败')
  } finally {
    fileLibraryLoading.value = false
  }
}

/**
 * 搜索记忆，带 debounce。
 */
const handleMemorySearch = () => {
  if (memorySearchTimer.value) {
    clearTimeout(memorySearchTimer.value)
  }
  memorySearchTimer.value = setTimeout(() => {
    void loadMemoryList(memoryQuery.value)
  }, 300)
}

const handleFileLibrarySearch = () => {
  if (fileLibrarySearchTimer.value) {
    clearTimeout(fileLibrarySearchTimer.value)
  }
  fileLibrarySearchTimer.value = setTimeout(() => {
    void loadFileLibraryItems(fileLibraryQuery.value)
  }, 300)
}

const handleOpenFileLibraryTab = () => {
  knowledgeTab.value = 'fileLibrary'
  void loadFileLibraryItems(fileLibraryQuery.value)
}

const openFileLibraryPicker = () => {
  fileLibraryInputRef.value?.click()
}

const handleFileLibraryInputChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  fileLibraryUploading.value = true
  try {
    await uploadHermesFileLibraryItem(file)
    ElMessage.success('文件已加入 Hermes 文件库')
    await loadFileLibraryItems(fileLibraryQuery.value)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '上传文件库失败')
  } finally {
    fileLibraryUploading.value = false
  }
}

const handleToggleFileLibraryItem = async (item: HermesFileLibraryItem) => {
  fileLibraryUpdatingId.value = item.id
  try {
    await updateHermesFileLibraryItem(item.id, { enabled: !item.enabled })
    await loadFileLibraryItems(fileLibraryQuery.value)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '更新文件库失败')
  } finally {
    fileLibraryUpdatingId.value = null
  }
}

const handleReindexFileLibraryItem = async (item: HermesFileLibraryItem) => {
  fileLibraryUpdatingId.value = item.id
  try {
    await reindexHermesFileLibraryItem(item.id)
    ElMessage.success('已提交重新向量化')
    await loadFileLibraryItems(fileLibraryQuery.value)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '重新向量化失败')
  } finally {
    fileLibraryUpdatingId.value = null
  }
}

const handleDeleteFileLibraryItem = async (item: HermesFileLibraryItem) => {
  try {
    await ElMessageBox.confirm('确定删除这个文件库条目吗？删除后不可恢复。', '删除文件', { type: 'warning' })
    fileLibraryUpdatingId.value = item.id
    await deleteHermesFileLibraryItem(item.id)
    ElMessage.success('文件已删除')
    await loadFileLibraryItems(fileLibraryQuery.value)
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除文件失败')
    }
  } finally {
    fileLibraryUpdatingId.value = null
  }
}

const handleDownloadFileLibraryItem = async (item: HermesFileLibraryItem) => {
  try {
    await downloadCommonFile(item.assetId, item.fileName || item.title || `file-${item.assetId}`)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '文件下载失败')
  }
}

const resolveFileLibraryStatusText = (item: HermesFileLibraryItem) => {
  const status = (item.indexStatus || '').toUpperCase()
  if (!item.enabled) return '已停用（不参与召回）'
  if (status === 'INDEXED') return '切片向量化完成'
  if (status === 'FAILED') return '切片向量化失败，请重新向量化'
  if (status === 'PENDING') return '切片向量化中'
  return '切片向量化状态未知，请重新向量化'
}

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 格式化记忆时间，将 ISO 时间转为可读格式。
 */
const formatMemoryTime = (time: string) => {
  if (!time) return ''
  try {
    const date = new Date(time)
    if (isNaN(date.getTime())) return time
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins} 分钟前`
    if (diffHours < 24) return `${diffHours} 小时前`
    if (diffDays < 7) return `${diffDays} 天前`
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  } catch {
    return time
  }
}

/**
 * 切换记忆条目展开/收起。
 */
const toggleMemoryExpand = (documentId: string) => {
  expandedMemoryIds[documentId] = !expandedMemoryIds[documentId]
}

/**
 * 删除单条记忆。
 */
const handleDeleteMemory = async (memory: HermesUserMemoryItem) => {
  try {
    await ElMessageBox.confirm('确定删除这条记忆吗？删除后不可恢复。', '删除记忆', { type: 'warning' })
    await deleteHermesUserMemory(memory.documentId)
    ElMessage.success('记忆已删除')
    void loadMemoryList(memoryQuery.value)
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除记忆失败')
    }
  }
}

/**
 * 清空全部记忆。
 */
const handleClearMemories = async () => {
  try {
    await ElMessageBox.confirm('确定清空全部 Hermes 记忆吗？此操作不可恢复。', '清空记忆', { type: 'warning' })
    const deletedCount = await clearHermesUserMemories()
    ElMessage.success(`已清空 ${deletedCount} 条记忆`)
    void loadMemoryList()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '清空记忆失败')
    }
  }
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/**
 * 把后端返回的整理状态转成前端可读提示，避免用户只能看到抽象状态码。
 */
const resolveMemoryConsolidationStatusText = (status: HermesMemoryConsolidationStatus) => {
  const normalizedStatus = (status.status || '').trim().toLowerCase()
  if (normalizedStatus === 'completed') return '记忆整理已完成，正在刷新列表...'
  if (normalizedStatus === 'failed') return status.errorMessage || '记忆整理失败'
  if (normalizedStatus === 'cancelled') return '记忆整理已取消'
  if (normalizedStatus === 'not_found') return '未找到这次记忆整理任务'
  if (normalizedStatus === 'pending') return '记忆整理任务已创建，正在等待执行...'
  if (normalizedStatus === 'processing') return 'Hindsight 正在整理记忆，请稍候...'
  return `记忆整理状态：${status.status || '未知'}`
}

/**
 * 轮询 Hindsight consolidation operation，只有真正进入终态后才给用户完成/失败反馈。
 */
const waitForMemoryConsolidation = async (operationId: string) => {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = await getHermesMemoryConsolidationStatus(operationId)
    memoryConsolidationMessage.value = resolveMemoryConsolidationStatusText(status)
    const normalizedStatus = (status.status || '').trim().toLowerCase()
    if (normalizedStatus === 'completed') {
      return status
    }
    if (normalizedStatus === 'failed' || normalizedStatus === 'cancelled' || normalizedStatus === 'not_found') {
      throw new Error(status.errorMessage || memoryConsolidationMessage.value)
    }
    await sleep(2000)
  }
  throw new Error('记忆整理仍在后台执行，请稍后重新打开记忆管理查看结果')
}

/**
 * 整理记忆：触发 Hindsight consolidation，将碎片记忆合并为结构化摘要。
 */
const handleConsolidateMemories = async () => {
  try {
    await ElMessageBox.confirm(
      '整理记忆会使用 AI 将碎片化的对话记忆合并为结构化的知识摘要，过程可能需要几十秒。确定继续？',
      '整理记忆',
      { type: 'info', confirmButtonText: '开始整理' }
    )
    memoryConsolidating.value = true
    memoryConsolidationMessage.value = '正在向 Hindsight 提交整理任务...'
    const task = await consolidateHermesUserMemories()
    memoryConsolidationMessage.value = task.deduplicated
      ? '检测到已有相同整理任务，正在跟踪这次后台执行...'
      : '整理任务已提交，正在等待 Hindsight 执行...'
    await waitForMemoryConsolidation(task.operationId)
    await loadMemoryList(memoryQuery.value)
    ElMessage.success('记忆整理完成')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || error?.message || '记忆整理失败，请检查 Hindsight LLM 配置')
    }
  } finally {
    memoryConsolidating.value = false
    memoryConsolidationMessage.value = ''
  }
}

/**
 * 打开记忆管理二级页面。
 */
const handleOpenMemoryView = () => {
  memoryViewVisible.value = true
  memoryTab.value = 'conversation'
  memoryQuery.value = ''
  void loadMemoryList()
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
    pendingSessionBottomScroll.value = true
    await loadSessionDetail(sessionId)
    closeMobileSessionPanel()
  }
}

const handleCreateSession = async () => {
  if (sending.value) {
    return
  }
  // 不再立即创建会话，只是清空当前选中状态，等待用户发送消息时再创建
  clearSelectedSession()
  closeMobileSessionPanel()
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

const formatReferenceTypeLabel = (type: string) => {
  const rawType = type.trim()
  if (!rawType) return '引用'
  const normalizedType = rawType.toUpperCase()
  return HERMES_REFERENCE_TYPE_LABELS[normalizedType] || rawType.replace(/_/g, ' ')
}

const shouldShowReferenceLabel = (reference: HermesReferenceItem) => {
  const label = formatReferenceTypeLabel(reference.type)
  const title = reference.title.trim()
  return Boolean(title) && title !== label
}

const formatReferenceDisplayText = (reference: HermesReferenceItem) => {
  const label = formatReferenceTypeLabel(reference.type)
  const title = reference.title.trim()
  if (!title) return label
  return title === label ? title : `${label}:${title}`
}

/**
 * 计算稳定的动作哈希，避免不同轮对话里恰巧 type+title+index 相同被误判已执行。
 * 使用按字段名排序后的 JSON 字符串配合 djb2 哈希，速度足够快、碰撞概率可接受。
 */
const computeActionParamsHash = (params: Record<string, unknown> | null | undefined) => {
  try {
    const sortedJson = JSON.stringify(params ?? {}, Object.keys(params ?? {}).sort())
    let hash = 5381
    for (let i = 0; i < sortedJson.length; i += 1) {
      hash = ((hash << 5) + hash + sortedJson.charCodeAt(i)) | 0
    }
    return (hash >>> 0).toString(36)
  } catch {
    return '0'
  }
}

/**
 * 动作的稳定唯一标识，由后端持久化以恢复"已执行"状态。
 * 同时拼上 paramsHash，避免不同轮里恰巧 type+title+index 相同的动作互相覆盖。
 */
const actionKey = (action: HermesActionItem, index: number) =>
  `${action.type}:${index}:${action.title}|${computeActionParamsHash(action.params as Record<string, unknown>)}`

/**
 * Hermes 只负责给出动作建议，真正写入仍走平台执行中心接口并在用户确认后发生。
 */
const executeAction = async (action: { type: string; title: string; description: string; requiresConfirm: boolean; params: Record<string, unknown> }, key: string) => {
  // 把当前动作 key 加入"已执行"集合；通过新建 Set 触发 ref 响应式刷新。
  // 同时尝试上报后端持久化，失败时静默退化为仅前端态，避免阻塞用户操作。
  const markExecuted = () => {
    const next = new Set(executedActionKeys.value)
    next.add(key)
    executedActionKeys.value = next
    const sessionId = selectedSessionId.value
    if (sessionId) {
      void markHermesActionExecuted(sessionId, key).catch(() => {
        // 后端记录失败不影响当前 UI 体验；下次刷新若仍未持久化，会回到"确认执行"再点一次。
      })
    }
  }
  try {
    if (action.requiresConfirm) {
      await ElMessageBox.confirm(action.description || `确认执行“${action.title}”吗？`, '确认执行动作', { type: 'warning' })
    }
    executingActionKey.value = key
    const params = action.params || {}
    if (action.type === 'CREATE_EXECUTION_TASK') {
      const executionTask = await createExecutionTask({ scenarioCode: String(params.scenarioCode || ''), projectId: Number(params.projectId), workItemId: params.workItemId == null ? null : Number(params.workItemId), triggerSource: String(params.triggerSource || 'HERMES'), inputPayload: (params.inputPayload || {}) as Record<string, unknown> })
      markExecuted()
      // 保留抽屉打开状态，让按钮直接呈现"已执行"，由用户决定是否查看任务详情。
      ElMessage.success(`执行任务已创建（#${executionTask.id}）`)
      return
    }
    if (action.type === 'CREATE_REPOSITORY_SCAN_TASK') {
      const bindingId = Number(params.bindingId)
      const executionTask = await createGitlabBindingScanTask(bindingId, { branch: String(params.branch || ''), rulesetCode: String(params.rulesetCode || '') })
      markExecuted()
      ElMessage.success(`仓库扫描任务已创建（#${executionTask.id}）`)
      return
    }
    if (action.type === 'CREATE_WORK_ITEM_DRAFT') {
      const workItemType = String(params.workItemType || '需求')
      const content = String(params.content || '')
      const name = String(params.name || (content.slice(0, 40) || `Hermes 创建的${workItemType}草稿`))
      const requirementMarkdown = workItemType === '需求' ? `${DEFAULT_REQUIREMENT_TEMPLATE}\n\n### 临时补充\n\n${content}` : ''
      await createTask({ name, workItemType: workItemType as '需求' | '任务' | '缺陷', status: '草稿', priority: '中', assignee: params.assigneeUserId ? '待确认' : '', assigneeUserId: params.assigneeUserId == null ? null : Number(params.assigneeUserId), collaboratorUserIds: [], description: workItemType === '需求' ? requirementMarkdown : content, requirementMarkdown, prototypeUrl: '', projectId: Number(params.projectId), agentId: null, iterationId: params.iterationId == null ? null : Number(params.iterationId), requirementTaskId: null })
      markExecuted()
      ElMessage.success('工作项草稿已创建')
      return
    }
    if (action.type === 'CREATE_TEST_PLAN_DRAFT') {
      await createTestPlan({ name: String(params.name || 'Hermes 测试计划草稿'), projectId: Number(params.projectId), iterationId: Number(params.iterationId), status: '草稿', description: String(params.description || ''), cases: [] })
      markExecuted()
      ElMessage.success('测试计划草稿已创建')
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
  if (stopRequested.value || messageId !== currentStreamingAssistantMessageId.value) return
  markStreamDeltaProgress()
  pendingStreamDeltaMap.set(messageId, `${pendingStreamDeltaMap.get(messageId) || ''}${delta}`)
  ensurePendingStreamDrainLoop()
}

const parseSlashQuestion = (rawQuestion: string) => {
  const normalized = (rawQuestion || '').trim()
  if (selectedSlashCommand.value) {
    return {
      slashCommand: selectedSlashCommand.value,
      question: normalized || resolveSlashCommandLabel(selectedSlashCommand.value)
    }
  }
  const matchedCommand = slashCommands.find((item) => normalized === item.command || normalized.startsWith(`${item.command} `))
  if (!matchedCommand) {
    return { slashCommand: null as string | null, question: normalized }
  }
  const strippedQuestion = normalized.slice(matchedCommand.command.length).trim()
  return {
    slashCommand: matchedCommand.command,
    question: strippedQuestion || matchedCommand.label
  }
}

const resolveSlashCommandLabel = (command: string) => slashCommands.find((item) => item.command === command)?.label || '业务 Skill'

const moveSlashCommandSelection = (direction: 1 | -1) => {
  const commandCount = slashCommands.length
  activeSlashCommandIndex.value = (activeSlashCommandIndex.value + direction + commandCount) % commandCount
}

const selectSlashCommand = (command: string) => {
  selectedSlashCommand.value = command
  draftQuestion.value = ''
  activeSlashCommandIndex.value = 0
  nextTick(() => questionInputRef.value?.focus?.())
}

const clearSelectedSlashCommand = () => {
  selectedSlashCommand.value = null
  nextTick(() => questionInputRef.value?.focus?.())
}

const handleQuestionInputKeydown = (event: KeyboardEvent) => {
  if (event.isComposing) return
  if (slashMenuVisible.value && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault()
    moveSlashCommandSelection(event.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (slashMenuVisible.value && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    selectSlashCommand(slashCommands[activeSlashCommandIndex.value]?.command || slashCommands[0].command)
    return
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void handleSubmit()
  }
}

const buildPayload = (question: string, selection?: HermesSelectionPayload | null, slashCommand?: string | null): HermesSessionChatRequestPayload => ({
  question,
  selection: selection || null,
  debug: isDebugMode.value,
  slashCommand: slashCommand || null
})

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

const resolveAssistantRenderableContent = (message: HermesMessageItem) => {
  if (message.content) return message.content
  return '暂无内容'
}

const renderAssistantMessage = (message: HermesMessageItem) => renderHermesMarkdownToHtml(resolveAssistantRenderableContent(message), { thinkBlockKeyPrefix: message.id, isThinkBlockOpen: (thinkBlockKey: string) => Boolean(thinkBlockOpenState.get(thinkBlockKey)) })
const formatDebugInfo = (debug: HermesDebugInfoItem | null) => JSON.stringify(debug || {}, null, 2)

/**
 * 流式等待阶段没有真实回答内容时，仅展示过程状态，避免伪造成可展开的思考过程。
 */
const shouldShowAssistantMarkdown = (message: HermesMessageItem) => {
  if (message.status === 'streaming' && !message.content?.trim()) return false
  return true
}

/**
 * 当前正在流式输出的助手消息承担唯一状态展示，底部输入区不再重复提示。
 */
const shouldShowInlineStreamStatus = (message: HermesMessageItem) => {
  return message.status === 'streaming' && message.id === currentStreamingAssistantMessageId.value
}

const resolveMessageToolExecutionItems = (message: HermesMessageItem): HermesToolExecutionViewItem[] =>
  normalizeHermesToolExecutions(message.toolExecutions || [])

const resolveMessageProcessTraceSummary = (message: HermesMessageItem): HermesToolTraceSummary =>
  buildHermesToolTraceSummary(resolveMessageToolExecutionItems(message)) || {
    title: '工具调用',
    description: '',
    countText: '0 次',
    tone: 'muted'
  }

const shouldShowProcessTrace = (message: HermesMessageItem) =>
  message.role === 'assistant' && resolveMessageToolExecutionItems(message).length > 0

const resolveMessageToolExecutionHint = (message: HermesMessageItem) => {
  const items = resolveMessageToolExecutionItems(message)
  if (!items.length) return ''
  return items
    .slice(0, 3)
    .map((item) => item.compactLabel)
    .join(' / ')
}

const resolveProcessToneIcon = (tone: HermesToolTraceSummary['tone']) => {
  if (tone === 'success') return '✓'
  if (tone === 'warning') return '!'
  if (tone === 'danger') return '×'
  if (tone === 'running') return '↯'
  return '·'
}

const resolveDebugToolExecutions = (debug: HermesDebugInfoItem | null | undefined): Array<Record<string, unknown>> =>
  debug?.toolExecutions || []

/**
 * 流式状态心跳只在前端本地运转，用来驱动“正在思考 / 调工具 / 整理答案”的文案切换。
 */
function startStreamStatusHeartbeat() {
  stopStreamStatusHeartbeat()
  const now = Date.now()
  streamStartedAt.value = now
  lastStreamStatusAt.value = now
  lastStreamDeltaAt.value = 0
  streamStatusHeartbeat.value = now
  if (typeof window === 'undefined') {
    return
  }
  streamStatusHeartbeatTimer = window.setInterval(() => {
    streamStatusHeartbeat.value = Date.now()
  }, 800)
}

function stopStreamStatusHeartbeat() {
  if (typeof window !== 'undefined' && streamStatusHeartbeatTimer != null) {
    window.clearInterval(streamStatusHeartbeatTimer)
  }
  streamStatusHeartbeatTimer = null
  streamStartedAt.value = 0
  lastStreamStatusAt.value = 0
  lastStreamDeltaAt.value = 0
  streamStatusHeartbeat.value = 0
}

function markStreamStatusProgress() {
  const now = Date.now()
  lastStreamStatusAt.value = now
  streamStatusHeartbeat.value = now
}

function markStreamDeltaProgress() {
  const now = Date.now()
  lastStreamDeltaAt.value = now
  streamStatusHeartbeat.value = now
}

function applyStreamStatus(payload: HermesStreamStatusEvent) {
  currentStreamStatus.value = payload
  markStreamStatusProgress()
}

/**
 * 将流式错误统一转换成前端更容易理解的提示，优先说明“可重试/可继续使用已有确认结果”，
 * 避免所有异常都落成“助手不可用”。
 */
function resolveHermesStreamErrorMessage(message?: string) {
  const normalized = (message || '').trim()
  if (!normalized) {
    return 'Hermes 本轮连接已中断，可直接重试；如果页面里已经出现确认卡片，也可以继续使用当前结果'
  }
  if (/中断|断开|连接|stream/i.test(normalized)) {
    return normalized
  }
  return normalized
}

const submitConversation = async (question: string, userContent: string, selection?: HermesSelectionPayload | null, slashCommand?: string | null) => {
  const normalizedQuestion = question.trim()
  const normalizedUserContent = userContent.trim() || normalizedQuestion
  if (!normalizedQuestion || sending.value) return
  const writableSessionId = await ensureWritableSession()
  if (!writableSessionId) return

  drawerVisible.value = true
  sending.value = true
  stopRequested.value = false
  activeStreamAbort.value?.()
  activeStreamAbort.value = null
  const userMessageId = `user-${Date.now()}`
  const assistantMessageId = `assistant-${Date.now()}`
  currentStreamingAssistantMessageId.value = assistantMessageId
  currentActions.value = []
  currentSelectionCards.value = []
  currentDebug.value = null
  // 已执行集合是会话维度的累积属性，由后端持久化和详情回显维护，这里不再重置；
  // actionKey 已经带 paramsHash 不会串号，新轮次新动作会得到不同 key。
  currentStreamStatus.value = { stage: 'planning', message: 'Hermes 正在分析问题' }
  startStreamStatusHeartbeat()
  currentMessages.value = [
    ...currentMessages.value,
    { id: userMessageId, role: 'user', content: normalizedUserContent, status: 'done', attachments: pendingFiles.value.map(toAttachmentSummary) },
    { id: assistantMessageId, role: 'assistant', content: '', status: 'streaming', attachments: [], toolExecutions: [] }
  ]
  isPinnedToBottom.value = true
  draftQuestion.value = ''
  selectedSlashCommand.value = null
  void restoreThinkBlocksAndScroll()

  try {
    const payload = buildPayload(normalizedQuestion, selection, slashCommand)
    const streamController = pendingFiles.value.length
      ? await streamHermesSessionChatWithFiles(writableSessionId, payload, pendingFiles.value, {
          onStatus: (streamPayload: HermesStreamStatusEvent) => { applyStreamStatus(streamPayload) },
          onMeta: (streamPayload: HermesStreamMetaEvent) => { applyStreamDisplayState(streamPayload.references, streamPayload.suggestions, streamPayload.actions, streamPayload.selectionCards, streamPayload.debug) },
          onDelta: (streamPayload: HermesStreamDeltaEvent) => queueStreamDelta(assistantMessageId, streamPayload.content || ''),
          onDone: (streamPayload: HermesStreamDoneEvent) => {
            if (stopRequested.value) {
              finishStream({ preserveStopRequested: true })
              return
            }
            flushPendingStreamDeltas(true)
            applyStreamDisplayState(streamPayload.references, streamPayload.suggestions, streamPayload.actions, streamPayload.selectionCards, streamPayload.debug)
            const shouldPreferTerminalContent = Boolean(streamPayload.actions?.length || streamPayload.selectionCards?.length)
        updateMessage(assistantMessageId, (current) => ({ ...current, content: shouldPreferTerminalContent ? (streamPayload.content || current.content) : resolveAssistantFinalContent(current.content, streamPayload.content), status: 'done', attachments: current.attachments || [], toolExecutions: resolveDebugToolExecutions(streamPayload.debug) }))
            pendingFiles.value = []
            finishStream()
            void refreshCurrentSessionFromCloud()
          },
          onError: (streamPayload: HermesStreamErrorEvent) => {
            if (stopRequested.value) {
              finishStream({ preserveStopRequested: true })
              return
            }
            flushPendingStreamDeltas(true)
            const errorMessage = resolveHermesStreamErrorMessage(streamPayload.message) || currentStreamStatusText.value
            updateMessage(assistantMessageId, (current) => ({ ...current, content: errorMessage || current.content || 'Hermes 本轮连接已中断，可直接重试', status: 'error', attachments: current.attachments || [], toolExecutions: current.toolExecutions || resolveDebugToolExecutions(currentDebug.value) }))
            finishStream()
            ElMessage.error(errorMessage || 'Hermes 本轮连接已中断，可直接重试')
            void refreshCurrentSessionFromCloud()
          }
        })
      : await streamHermesSessionChat(writableSessionId, payload, {
      onStatus: (payload: HermesStreamStatusEvent) => { applyStreamStatus(payload) },
      onMeta: (payload: HermesStreamMetaEvent) => { applyStreamDisplayState(payload.references, payload.suggestions, payload.actions, payload.selectionCards, payload.debug) },
      onDelta: (payload: HermesStreamDeltaEvent) => queueStreamDelta(assistantMessageId, payload.content || ''),
      onDone: (payload: HermesStreamDoneEvent) => {
        if (stopRequested.value) {
          finishStream({ preserveStopRequested: true })
          return
        }
        flushPendingStreamDeltas(true)
        applyStreamDisplayState(payload.references, payload.suggestions, payload.actions, payload.selectionCards, payload.debug)
        const shouldPreferTerminalContent = Boolean(payload.actions?.length || payload.selectionCards?.length)
        updateMessage(assistantMessageId, (current) => ({ ...current, content: shouldPreferTerminalContent ? (payload.content || current.content) : resolveAssistantFinalContent(current.content, payload.content), status: 'done', attachments: current.attachments || [], toolExecutions: resolveDebugToolExecutions(payload.debug) }))
        pendingFiles.value = []
        finishStream()
        void refreshCurrentSessionFromCloud()
      },
      onError: (payload: HermesStreamErrorEvent) => {
        if (stopRequested.value) {
          finishStream({ preserveStopRequested: true })
          return
        }
        flushPendingStreamDeltas(true)
        const errorMessage = resolveHermesStreamErrorMessage(payload.message) || currentStreamStatusText.value
        updateMessage(assistantMessageId, (current) => ({ ...current, content: errorMessage || current.content || 'Hermes 本轮连接已中断，可直接重试', status: 'error', attachments: current.attachments || [], toolExecutions: current.toolExecutions || resolveDebugToolExecutions(currentDebug.value) }))
        finishStream()
        ElMessage.error(errorMessage || 'Hermes 本轮连接已中断，可直接重试')
        void refreshCurrentSessionFromCloud()
      }
    })
    activeStreamAbort.value = streamController.abort
  } catch (error: unknown) {
    const message = resolveHermesStreamErrorMessage(error instanceof Error ? error.message : '')
    updateMessage(assistantMessageId, (current) => ({ ...current, content: message, status: 'error', attachments: current.attachments || [], toolExecutions: current.toolExecutions || resolveDebugToolExecutions(currentDebug.value) }))
    finishStream()
    ElMessage.error(message)
  }
}

const handleSubmit = async (questionOverride?: string) => {
  const parsed = parseSlashQuestion(questionOverride ?? draftQuestion.value)
  await submitConversation(parsed.question, parsed.question, null, parsed.slashCommand)
}

const handleSelectOption = async (selectionCard: HermesSelectionCardItem, option: HermesSelectionOptionItem) => {
  if (option.entityId == null) return
  await submitConversation((selectionCard.resumeQuestion || draftQuestion.value || option.title).trim(), `我选择了：${option.title}`, { slot: selectionCard.slot || option.slot, entityType: option.entityType, entityId: Number(option.entityId), resumeQuestion: selectionCard.resumeQuestion || undefined })
}

/**
 * 发送前确保存在可写入的当前会话；如果没有会话，就按当前页面上下文即时创建。
 * 如果当前选中的会话与页面锚点不一致，也要自动切回当前上下文，避免沿用旧会话造成“当前迭代”失真。
 */
const ensureWritableSession = async () => {
  if (selectedSessionId.value && (!currentSessionDetail.value || currentSessionDetail.value.id !== selectedSessionId.value)) {
    await loadSessionDetail(selectedSessionId.value)
  }
  if (currentSessionDetail.value && !currentSessionDetail.value.archived && isSessionAlignedWithCurrentContext(currentSessionDetail.value)) {
    return currentSessionDetail.value.id
  }
  if (currentSessionDetail.value && !currentSessionDetail.value.archived && !isSessionAlignedWithCurrentContext(currentSessionDetail.value)) {
    clearSelectedSession()
  }
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

/**
 * 桌面端允许在默认 880px 抽屉和铺满应用窗口之间切换，移动端始终保持既有全屏样式。
 */
function toggleDesktopFullscreen() {
  if (isMobileViewport.value) {
    return
  }
  desktopFullscreen.value = !desktopFullscreen.value
}

function handleStopStream() {
  if (!sending.value) {
    return
  }
  stopRequested.value = true
  pendingStreamDeltaMap.clear()
  if (pendingStreamDrainTimer != null) {
    clearTimeout(pendingStreamDrainTimer)
    pendingStreamDrainTimer = null
  }
  if (currentStreamingAssistantMessageId.value) {
    updateMessage(currentStreamingAssistantMessageId.value, (current) => ({
      ...current,
      content: current.content?.trim() ? current.content : '已停止生成',
      status: 'done',
      attachments: current.attachments || []
    }))
  }
  activeStreamAbort.value?.()
  finishStream({ preserveStopRequested: true })
}

function applyStreamDisplayState(references: HermesReferenceItem[], suggestions: string[], actions: HermesActionItem[], selectionCards: HermesSelectionCardItem[], debug: HermesDebugInfoItem | null) {
  currentReferences.value = references || []
  currentSuggestions.value = suggestions || []
  currentActions.value = actions || []
  currentSelectionCards.value = selectionCards || []
  currentDebug.value = debug || null
}

function finishStream(options: { preserveStopRequested?: boolean } = {}) {
  flushPendingStreamDeltas(true)
  stopStreamStatusHeartbeat()
  currentStreamStatus.value = null
  sending.value = false
  activeStreamAbort.value = null
  currentStreamingAssistantMessageId.value = null
  if (!options.preserveStopRequested) {
    stopRequested.value = false
  }
}

function handleThinkSummaryClick(event: Event) {
  const targetElement = event.target instanceof HTMLElement
    ? event.target
    : event.target instanceof Node
      ? event.target.parentElement
      : null
  const summaryElement = targetElement?.closest('summary') || null
  const thinkBlock = summaryElement instanceof HTMLElement ? summaryElement.parentElement : null
  if (thinkBlock instanceof HTMLDetailsElement && thinkBlock.dataset.thinkKey) {
    queueMicrotask(() => {
      thinkBlockOpenState.set(thinkBlock.dataset.thinkKey || '', thinkBlock.open)
    })
  }
}

function handleThinkBlockToggle(event: Event) {
  const thinkBlock = event.target instanceof HTMLDetailsElement ? event.target : null
  if (thinkBlock?.dataset.thinkKey) {
    thinkBlockOpenState.set(thinkBlock.dataset.thinkKey, thinkBlock.open)
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
    if (stopRequested.value || messageId !== currentStreamingAssistantMessageId.value) {
      pendingStreamDeltaMap.delete(messageId)
      return
    }
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
    if (stopRequested.value || item.id !== currentStreamingAssistantMessageId.value) return item
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
  const latestDisplayState = detail.latestDisplayState || emptyLatestDisplayState()
  const messages: HermesMessageItem[] = detail.messages.map((message) => ({ id: `cloud-${message.id}`, role: message.role === 'user' ? 'user' : 'assistant', content: message.content || '', status: message.status === 'error' ? 'error' : 'done', attachments: message.attachments || [] }))
  const latestAssistantIndex = [...messages].reverse().findIndex((message) => message.role === 'assistant')
  if (latestAssistantIndex >= 0) {
    const targetIndex = messages.length - 1 - latestAssistantIndex
    messages[targetIndex] = {
      ...messages[targetIndex],
      toolExecutions: resolveDebugToolExecutions(latestDisplayState.debug)
    }
  }
  currentMessages.value = messages
  currentReferences.value = latestDisplayState.references || []
  currentSuggestions.value = latestDisplayState.suggestions || []
  currentActions.value = latestDisplayState.actions || []
  currentSelectionCards.value = latestDisplayState.selectionCards || []
  currentDebug.value = latestDisplayState.debug || null
  // 从后端持久化的已执行 key 列表恢复，避免刷新或换设备后按钮回到"确认执行"。
  executedActionKeys.value = new Set(detail.executedActionKeys || [])
  const shouldScrollToBottom = pendingSessionBottomScroll.value
  pendingSessionBottomScroll.value = false
  void restoreThinkBlocksAndScroll(shouldScrollToBottom)
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
  // 没有当前会话时，已执行集合也应跟随清空。
  executedActionKeys.value = new Set()
  persistSelectedSessionId(null)
}

function resolveVoiceInputSupport() {
  const AudioContextCtor = typeof window === 'undefined'
    ? undefined
    : (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  return typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && typeof AudioContextCtor !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

function resolveVoiceInputErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return '未获得麦克风权限，请先允许浏览器访问麦克风'
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return '未检测到可用麦克风设备'
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return '麦克风当前不可用，请检查是否被其他应用占用'
    }
  }
  return error instanceof Error && error.message ? error.message : '语音输入暂时不可用'
}

function resolveVoiceInputUnavailableMessage() {
  if (typeof window === 'undefined') {
    return '当前环境暂不支持语音输入'
  }
  if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return '当前页面不是安全上下文，移动端请改用 HTTPS 地址后再尝试语音输入'
  }
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    return '当前浏览器不支持麦克风采集，请尝试使用系统浏览器打开'
  }
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) {
    return '当前浏览器不支持音频处理，请尝试使用系统浏览器打开'
  }
  return '当前环境暂不支持语音输入'
}

function releaseVoiceStreamTracks() {
  mediaStream.value?.getTracks().forEach((track) => track.stop())
  mediaStream.value = null
}

function resetVoiceRecorderState() {
  voiceProcessorNode.value?.disconnect()
  voiceSourceNode.value?.disconnect()
  if (voiceAudioContext.value && voiceAudioContext.value.state !== 'closed') {
    void voiceAudioContext.value.close()
  }
  voiceAudioContext.value = null
  voiceSourceNode.value = null
  voiceProcessorNode.value = null
  audioChunks.value = []
  voiceLevel.value = 0
  voiceInputDetected.value = false
  recording.value = false
}

function appendTranscribedText(text: string) {
  const normalizedText = text.trim()
  if (!normalizedText) {
    return
  }
  const currentDraft = draftQuestion.value.trimEnd()
  draftQuestion.value = currentDraft ? `${currentDraft}\n${normalizedText}` : normalizedText
}

function mergeAudioChunks(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0
  chunks.forEach((chunk) => {
    merged.set(chunk, offset)
    offset += chunk.length
  })
  return merged
}

function resolveSamplesPeak(samples: Float32Array) {
  let peak = 0
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    peak = Math.max(peak, Math.abs(samples[sampleIndex]))
  }
  return peak
}

function downsamplePcmSamples(samples: Float32Array, sourceSampleRate: number, targetSampleRate: number) {
  if (sourceSampleRate <= targetSampleRate) {
    return samples
  }
  const ratio = sourceSampleRate / targetSampleRate
  const resultLength = Math.max(1, Math.round(samples.length / ratio))
  const result = new Float32Array(resultLength)
  let resultOffset = 0
  let sourceOffset = 0

  while (resultOffset < result.length) {
    const nextSourceOffset = Math.min(samples.length, Math.round((resultOffset + 1) * ratio))
    let total = 0
    let count = 0
    for (let index = sourceOffset; index < nextSourceOffset; index += 1) {
      total += samples[index]
      count += 1
    }
    result[resultOffset] = count > 0 ? total / count : 0
    resultOffset += 1
    sourceOffset = nextSourceOffset
  }

  return result
}

function encodePcmSamplesToWav(samples: Float32Array, sampleRate: number) {
  const channelCount = 1
  const format = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = channelCount * bytesPerSample
  const dataLength = samples.length * blockAlign
  const wavBuffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(wavBuffer)
  let offset = 0

  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
    offset += value.length
  }

  writeString('RIFF')
  view.setUint32(offset, 36 + dataLength, true)
  offset += 4
  writeString('WAVE')
  writeString('fmt ')
  view.setUint32(offset, 16, true)
  offset += 4
  view.setUint16(offset, format, true)
  offset += 2
  view.setUint16(offset, channelCount, true)
  offset += 2
  view.setUint32(offset, sampleRate, true)
  offset += 4
  view.setUint32(offset, sampleRate * blockAlign, true)
  offset += 4
  view.setUint16(offset, blockAlign, true)
  offset += 2
  view.setUint16(offset, bitsPerSample, true)
  offset += 2
  writeString('data')
  view.setUint32(offset, dataLength, true)
  offset += 4

  const peak = resolveSamplesPeak(samples)
  // 浏览器录音在部分设备上振幅会偏低，先做轻量归一化，减少 ASR 返回空文本的概率。
  const gain = peak > 0.0001 ? Math.min(0.92 / peak, 12) : 1
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const sample = Math.max(-1, Math.min(1, samples[sampleIndex] * gain))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }

  return new Blob([wavBuffer], { type: 'audio/wav' })
}

/**
 * 直接从麦克风流采集 PCM，再压成 16k 单声道 WAV，避免 MediaRecorder 转码链路产出静音文件。
 */
function buildVoiceWavBlob(sourceSampleRate: number, chunks: Float32Array[]) {
  const mergedSamples = mergeAudioChunks(chunks)
  const normalizedSamples = downsamplePcmSamples(mergedSamples, sourceSampleRate, 16000)
  const peak = resolveSamplesPeak(normalizedSamples)
  if (peak < 0.001) {
    throw new Error('未采集到有效麦克风声音，请检查浏览器麦克风权限、输入设备和系统静音设置')
  }
  return encodePcmSamplesToWav(normalizedSamples, 16000)
}

/**
 * 录音结束后统一在这里转写并回填草稿，保证关闭抽屉时可以通过 discard 标记安全丢弃结果。
 */
async function handleVoiceRecorderStop(sourceSampleRate: number) {
  const shouldDiscard = discardVoiceRecording.value
  const collectedChunks = [...audioChunks.value]
  discardVoiceRecording.value = false
  resetVoiceRecorderState()
  releaseVoiceStreamTracks()

  if (shouldDiscard || !collectedChunks.length) {
    transcribing.value = false
    return
  }

  try {
    const voiceBlob = buildVoiceWavBlob(sourceSampleRate, collectedChunks)
    const voiceFile = new File(
      [voiceBlob],
      `hermes-voice-${Date.now()}.wav`,
      { type: 'audio/wav' }
    )
    const transcribedText = (await transcribeHermesSpeech(voiceFile)).trim()
    if (!transcribedText) {
      throw new Error('Hermes 未返回可用的转写文本')
    }
    if (hermesDrawerDisposed || !drawerVisible.value) {
      return
    }
    appendTranscribedText(transcribedText)
    await nextTick()
    questionInputRef.value?.focus?.()
  } catch (error: any) {
    if (!hermesDrawerDisposed && drawerVisible.value) {
      ElMessage.error(error?.response?.data?.message || error?.message || 'Hermes 语音转写失败')
    }
  } finally {
    transcribing.value = false
  }
}

async function startVoiceRecording() {
  if (!voiceInputSupported.value || recording.value || transcribing.value) {
    return
  }
  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) {
      throw new Error('当前浏览器不支持语音输入')
    }
    const audioContext = new AudioContextCtor()
    await audioContext.resume()
    const sourceNode = audioContext.createMediaStreamSource(stream)
    const processorNode = audioContext.createScriptProcessor(4096, 1, 1)
    discardVoiceRecording.value = false
    audioChunks.value = []
    mediaStream.value = stream
    voiceAudioContext.value = audioContext
    voiceSourceNode.value = sourceNode
    voiceProcessorNode.value = processorNode
    processorNode.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0)
      const chunk = new Float32Array(samples)
      const peak = resolveSamplesPeak(chunk)
      if (peak >= 0.005) {
        voiceInputDetected.value = true
      }
      voiceLevel.value = Math.max(peak, voiceLevel.value * 0.78)
      audioChunks.value.push(chunk)
    }
    sourceNode.connect(processorNode)
    processorNode.connect(audioContext.destination)
    recording.value = true
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop())
    releaseVoiceStreamTracks()
    resetVoiceRecorderState()
    ElMessage.error(resolveVoiceInputErrorMessage(error))
  }
}

function stopVoiceRecording(discard: boolean) {
  discardVoiceRecording.value = discard
  const sourceSampleRate = voiceAudioContext.value?.sampleRate || 16000
  if (!voiceAudioContext.value) {
    resetVoiceRecorderState()
    releaseVoiceStreamTracks()
    transcribing.value = false
    return
  }
  recording.value = false
  transcribing.value = !discard
  void handleVoiceRecorderStop(sourceSampleRate)
}

async function handleVoiceButtonClick() {
  if (recording.value) {
    stopVoiceRecording(false)
    return
  }
  if (!voiceInputSupported.value) {
    ElMessage.warning(resolveVoiceInputUnavailableMessage())
    return
  }
  await startVoiceRecording()
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
  if (!attachment.assetId) {
    return
  }
  openCommonFileDownload(attachment.assetId)
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
  if (matchedSession) {
    return matchedSession.id
  }
  // 没有匹配当前上下文的会话时，选择最新的会话
  return sessionSummaries.value.length > 0 ? sessionSummaries.value[0].id : null
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

function toggleMobileSessionPanel() {
  if (!isMobileViewport.value) {
    return
  }
  mobileSessionPanelVisible.value = !mobileSessionPanelVisible.value
}

function closeMobileSessionPanel() {
  mobileSessionPanelVisible.value = false
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

.hermes-head {
  width: 100%;
  align-items: center;
}

.hermes-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}

.hermes-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.hermes-back-button {
  padding: 4px 12px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.2);
  border-radius: 6px;
  background: transparent;
  color: var(--app-text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.hermes-back-button:hover {
  background: rgba(var(--app-outline-rgb), 0.06);
}

.hermes-memory-entry {
  padding: 4px 14px;
  border: 1px solid rgba(var(--app-primary-rgb), 0.3);
  border-radius: 6px;
  background: transparent;
  color: var(--app-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.hermes-memory-entry:hover {
  background: rgba(var(--app-primary-rgb), 0.08);
  border-color: rgba(var(--app-primary-rgb), 0.5);
}

.hermes-view-toggle-button {
  min-width: 74px;
  text-align: center;
}

.hermes-memory-view {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.hermes-memory-header {
  padding: 12px 18px;
  border-bottom: 1px solid rgba(var(--app-outline-rgb), 0.1);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hermes-memory-tabs {
  display: flex;
  gap: 8px;
}

.hermes-memory-tabs .hermes-tab {
  flex: 1;
  text-align: center;
}

.hermes-memory-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scrollbar-gutter: stable;
}

.hermes-memory-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hermes-memory-section-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hermes-memory-section-title {
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
}

.hermes-memory-section-caption {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.hermes-memory-inline-empty {
  padding: 12px 14px;
  border: 1px dashed rgba(var(--app-outline-rgb), 0.18);
  border-radius: 10px;
  color: #64748b;
  font-size: 12px;
  background: rgba(var(--app-primary-rgb), 0.03);
}

.hermes-memory-fact-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(241, 245, 249, 0.9), rgba(255, 255, 255, 0.98));
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}

.hermes-memory-fact-summary {
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.hermes-memory-fact-meta {
  color: #475569;
  font-size: 12px;
  line-height: 1.5;
}

.hermes-memory-fact-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.hermes-memory-fact-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.hermes-memory-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.08);
  color: var(--app-primary);
  font-size: 11px;
  font-weight: 600;
}

.hermes-memory-footer {
  padding: 12px 18px;
  border-top: 1px solid rgba(var(--app-outline-rgb), 0.1);
  display: flex;
  gap: 10px;
}

.hermes-memory-footer .hermes-primary-button {
  flex: 1;
}

.hermes-memory-footer .hermes-danger-button {
  flex: 0 0 auto;
  width: auto;
}

.hermes-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 24px;
  font-weight: 900;
}

.hermes-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.hermes-help-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.1);
  color: var(--app-primary);
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-rgb), 0.14);
  transition: background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.hermes-help-button:hover {
  background: rgba(var(--app-primary-rgb), 0.16);
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-rgb), 0.22);
  transform: translateY(-1px);
}

.hermes-help-button :deep(svg) {
  width: 14px;
  height: 14px;
}

.hermes-help-tooltip {
  max-width: 280px;
  color: #334155;
  font-size: 12px;
  line-height: 1.65;
}

.hermes-help-tooltip p {
  margin: 0;
}

.hermes-help-tooltip p + p {
  margin-top: 8px;
}

.hermes-subtitle,
.hermes-section-title {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hermes-confirmation-hint {
  padding: 12px 14px;
  border: 1px solid rgba(20, 184, 166, 0.24);
  border-radius: 16px;
  background: rgba(240, 253, 250, 0.9);
}

.hermes-confirmation-hint div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hermes-confirmation-hint strong {
  color: #0f766e;
  font-size: 13px;
  font-weight: 900;
}

.hermes-confirmation-hint span {
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
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

.hermes-tab {
  display: inline-flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  text-align: center;
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
  position: relative;
  display: grid;
  grid-template-columns: 164px minmax(0, 1fr);
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #f3f4f5;
}

.hermes-session-sidebar {
  --hermes-session-scroll-gutter: 14px;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0 7px;
  border-right: 1px solid rgba(var(--app-outline-rgb), 0.12);
  background: rgba(248, 250, 252, 0.95);
}

.hermes-mobile-session-backdrop,
.hermes-mobile-session-head,
.hermes-mobile-session-toggle-shell {
  display: none;
}

.hermes-session-content {
  width: 100%;
  height: 100%;
  min-height: 0;
  margin: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}

.hermes-session-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 10px var(--hermes-session-scroll-gutter) 10px 0;
  border-bottom: 1px solid rgba(var(--app-outline-rgb), 0.1);
}

.hermes-session-tabs {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.hermes-tab.active {
  background: rgba(var(--app-primary-rgb), 0.12);
  color: var(--app-primary);
}

.hermes-memory-search {
  width: 100%;
}

.hermes-memory-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 14px;
  border: 1px solid rgba(var(--app-outline-rgb), 0.2);
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  background: #fff;
}

.hermes-memory-search-input:focus {
  border-color: rgba(var(--app-primary-rgb), 0.5);
}

.hermes-memory-item {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}

.hermes-memory-content {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hermes-memory-scene {
  display: inline-block;
  align-self: flex-start;
  padding: 1px 8px;
  border-radius: 4px;
  background: rgba(var(--app-primary-rgb), 0.08);
  color: var(--app-primary);
  font-size: 11px;
  font-weight: 600;
}

.hermes-memory-question {
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  word-break: break-all;
}

.hermes-memory-answer-label {
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  margin-top: 4px;
}

.hermes-memory-answer {
  color: #475569;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.hermes-memory-time {
  color: #94a3b8;
  font-size: 11px;
}

.hermes-memory-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  align-items: flex-end;
}

.hermes-memory-toggle {
  padding: 2px 10px;
  border: 1px solid rgba(var(--app-primary-rgb), 0.3);
  border-radius: 6px;
  background: transparent;
  color: var(--app-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.hermes-memory-toggle:hover {
  background: rgba(var(--app-primary-rgb), 0.08);
  border-color: rgba(var(--app-primary-rgb), 0.5);
}

.hermes-memory-delete {
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  background: transparent;
  color: #ef4444;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.hermes-memory-delete:hover {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.5);
}

.hermes-danger-button {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  background: transparent;
  color: #ef4444;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.hermes-danger-button:hover {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.5);
}

.hermes-danger-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hermes-session-list,
.hermes-body {
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.hermes-session-list {
  flex: 1 1 auto;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px var(--hermes-session-scroll-gutter) 8px 0;
  align-items: stretch;
  scrollbar-gutter: stable;
}

.hermes-session-item {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
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
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.hermes-mobile-session-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 46px;
  padding: 0 16px;
  border: 0;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(241, 245, 249, 0.98) 100%);
  color: #0f172a;
  box-shadow:
    0 12px 30px rgba(15, 23, 42, 0.08),
    inset 0 0 0 1px rgba(var(--app-outline-rgb), 0.08);
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  font: inherit;
}

.hermes-mobile-session-toggle-label,
.hermes-mobile-session-title {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hermes-mobile-session-toggle-value {
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.hermes-mobile-session-head {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0 12px;
}

.hermes-mobile-session-close {
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: rgba(241, 245, 249, 0.96);
  color: #334155;
  font-size: 12px;
  font-weight: 800;
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

.hermes-action-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.hermes-action-copy strong {
  display: block;
  color: #0f172a;
  font-size: 14px;
  line-height: 1.45;
}

.hermes-reference-label {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.hermes-reference-item {
  display: inline-flex;
  max-width: min(100%, 420px);
  min-width: 0;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
}

.hermes-reference-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #0f172a;
  font-size: 12px;
  font-weight: 800;
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

.hermes-voice-meter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 220px;
  min-width: 180px;
  padding: 8px 12px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.04);
}

.hermes-voice-meter.active {
  background: rgba(15, 118, 110, 0.08);
}

.hermes-voice-meter-track {
  position: relative;
  flex: 1 1 auto;
  min-width: 120px;
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background:
    linear-gradient(90deg, rgba(15, 118, 110, 0.18) 0%, rgba(14, 165, 233, 0.18) 52%, rgba(249, 115, 22, 0.24) 100%);
  box-shadow: inset 0 0 0 1px rgba(var(--app-outline-rgb), 0.08);
}

.hermes-voice-meter-track::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.22) 0,
      rgba(255, 255, 255, 0.22) 10px,
      transparent 10px,
      transparent 16px
    );
  pointer-events: none;
}

.hermes-voice-meter-fill {
  height: 100%;
  min-width: 6px;
  border-radius: inherit;
  background: linear-gradient(90deg, #0f766e 0%, #06b6d4 60%, #f97316 100%);
  box-shadow: 0 0 14px rgba(6, 182, 212, 0.32);
  transition: width 0.08s linear, box-shadow 0.12s ease;
}

.hermes-voice-meter-label {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.hermes-voice-button.active {
  background: #93000a;
  color: #fff;
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
  display: flex;
  flex-direction: column;
  justify-content: center;
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

.hermes-message-bubble.stream-loading {
  position: relative;
  border: 3px solid transparent;
  background:
    linear-gradient(#fff, #fff) padding-box,
    conic-gradient(from 0deg, transparent 0deg, rgba(var(--app-primary-rgb), 0.35) 60deg, var(--app-primary) 100deg, rgba(var(--app-primary-container-rgb), 0.98) 140deg, transparent 200deg, rgba(var(--app-primary-rgb), 0.3) 360deg) border-box;
  box-shadow: 0 14px 36px rgba(var(--app-primary-rgb), 0.22), 0 0 0 6px rgba(var(--app-primary-rgb), 0.08);
  animation: hermes-loading-border 2s linear infinite;
}

.hermes-thinking-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  color: var(--app-primary);
  font-size: 13px;
}

.hermes-thinking-indicator.compact {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(var(--app-outline-rgb), 0.12);
  font-size: 12px;
}

.hermes-thinking-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  border: 2px solid rgba(var(--app-primary-rgb), 0.18);
  border-top-color: var(--app-primary);
  border-radius: 50%;
  box-sizing: border-box;
  line-height: 0;
  transform-origin: 50% 50%;
  animation: hermes-spin 1.2s linear infinite;
}

.hermes-process-trace {
  position: relative;
  margin-top: 12px;
  width: max-content;
  max-width: 100%;
  border: 1px solid rgba(51, 65, 85, 0.12);
  border-left: 3px solid rgba(51, 65, 85, 0.26);
  border-radius: 10px;
  background:
    linear-gradient(90deg, rgba(248, 250, 252, 0.94), rgba(255, 255, 255, 0.78)),
    repeating-linear-gradient(135deg, rgba(100, 116, 139, 0.08) 0 1px, transparent 1px 8px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.hermes-process-trace summary {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-height: 32px;
  box-sizing: border-box;
  padding: 8px 11px;
  color: #334155;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  list-style: none;
}

.hermes-process-trace summary::-webkit-details-marker {
  display: none;
}

.hermes-process-summary-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  letter-spacing: 0;
  white-space: nowrap;
}

.hermes-process-status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  flex: 0 0 16px;
  font-size: 10px;
  font-weight: 900;
}

.hermes-process-summary-meta {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.62);
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.hermes-process-trace summary::after {
  content: '展开';
  flex: 0 0 auto;
  padding-left: 2px;
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.hermes-process-trace[open] summary::after {
  content: '收起';
}

.hermes-process-trace[open] {
  width: 100%;
  max-width: 520px;
  border-radius: 10px;
}

.hermes-process-trace-body {
  padding: 0 14px 12px 18px;
  border-top: 1px solid rgba(51, 65, 85, 0.08);
}

.hermes-process-description {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.hermes-process-description.muted {
  color: #94a3b8;
}

.hermes-process-trace.is-running {
  border-color: rgba(37, 99, 235, 0.22);
  border-left-color: #2563eb;
  background:
    linear-gradient(90deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.82)),
    repeating-linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0 1px, transparent 1px 8px);
}

.hermes-process-trace.is-success {
  border-color: rgba(15, 118, 110, 0.2);
  border-left-color: #0f766e;
  background:
    linear-gradient(90deg, rgba(236, 253, 245, 0.96), rgba(255, 255, 255, 0.82)),
    repeating-linear-gradient(135deg, rgba(15, 118, 110, 0.08) 0 1px, transparent 1px 8px);
}

.hermes-process-trace.is-warning {
  border-color: rgba(245, 158, 11, 0.26);
  border-left-color: #d97706;
  background:
    linear-gradient(90deg, rgba(255, 251, 235, 0.98), rgba(255, 255, 255, 0.82)),
    repeating-linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0 1px, transparent 1px 8px);
}

.hermes-process-trace.is-danger {
  border-color: rgba(220, 38, 38, 0.22);
  border-left-color: #dc2626;
  background:
    linear-gradient(90deg, rgba(254, 242, 242, 0.98), rgba(255, 255, 255, 0.82)),
    repeating-linear-gradient(135deg, rgba(220, 38, 38, 0.08) 0 1px, transparent 1px 8px);
}

.hermes-process-trace.is-running .hermes-process-status-icon {
  border: 2px solid rgba(37, 99, 235, 0.16);
  border-top-color: #2563eb;
  background: transparent;
  color: transparent;
  font-size: 0;
  line-height: 0;
  transform-origin: 50% 50%;
  animation: hermes-spin 1.2s linear infinite;
}

.hermes-process-trace.is-success .hermes-process-status-icon {
  background: rgba(15, 118, 110, 0.14);
  color: #0f766e;
}

.hermes-process-trace.is-warning .hermes-process-status-icon {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.hermes-process-trace.is-danger .hermes-process-status-icon {
  background: rgba(220, 38, 38, 0.12);
  color: #dc2626;
}

@keyframes hermes-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@property --hermes-loading-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

@keyframes hermes-loading-border {
  from {
    --hermes-loading-angle: 0deg;
    background:
      linear-gradient(#fff, #fff) padding-box,
      conic-gradient(from var(--hermes-loading-angle), transparent 0deg, rgba(var(--app-primary-rgb), 0.35) 60deg, var(--app-primary) 100deg, rgba(var(--app-primary-container-rgb), 0.98) 140deg, transparent 200deg, rgba(var(--app-primary-rgb), 0.3) 360deg) border-box;
  }
  to {
    --hermes-loading-angle: 360deg;
    background:
      linear-gradient(#fff, #fff) padding-box,
      conic-gradient(from var(--hermes-loading-angle), transparent 0deg, rgba(var(--app-primary-rgb), 0.35) 60deg, var(--app-primary) 100deg, rgba(var(--app-primary-container-rgb), 0.98) 140deg, transparent 200deg, rgba(var(--app-primary-rgb), 0.3) 360deg) border-box;
  }
}

.hermes-thinking-text {
  color: #64748b;
}

.hermes-thinking-dots {
  display: inline-flex;
  gap: 2px;
}

.hermes-thinking-dots span {
  animation: hermes-dot-blink 1.4s infinite;
  opacity: 0;
}

.hermes-thinking-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.hermes-thinking-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes hermes-dot-blink {
  0%, 20% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0; }
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

.hermes-markdown-content :deep(h1),
.hermes-markdown-content :deep(h2),
.hermes-markdown-content :deep(h3),
.hermes-markdown-content :deep(h4) {
  margin: 0 0 12px;
  color: #0f172a;
  font-family: var(--app-font-heading);
  line-height: 1.45;
}

.hermes-markdown-content :deep(h1) { font-size: 20px; }
.hermes-markdown-content :deep(h2) { font-size: 18px; }
.hermes-markdown-content :deep(h3) { font-size: 16px; }
.hermes-markdown-content :deep(h4) { font-size: 15px; }

.hermes-markdown-content :deep(p) {
  margin: 0 0 10px;
}

.hermes-markdown-content :deep(h1:last-child),
.hermes-markdown-content :deep(h2:last-child),
.hermes-markdown-content :deep(h3:last-child),
.hermes-markdown-content :deep(h4:last-child),
.hermes-markdown-content :deep(p:last-child),
.hermes-markdown-content :deep(ul:last-child),
.hermes-markdown-content :deep(ol:last-child),
.hermes-markdown-content :deep(blockquote:last-child),
.hermes-markdown-content :deep(pre:last-child),
.hermes-markdown-content :deep(hr:last-child),
.hermes-markdown-content :deep(img:last-child),
.hermes-markdown-content :deep(.hermes-table-wrap:last-child),
.hermes-message-bubble > :last-child {
  margin-bottom: 0;
}

.hermes-markdown-content :deep(ul),
.hermes-markdown-content :deep(ol) {
  margin: 0 0 10px;
  padding-left: 20px;
}

.hermes-markdown-content :deep(ul ul),
.hermes-markdown-content :deep(ul ol),
.hermes-markdown-content :deep(ol ul),
.hermes-markdown-content :deep(ol ol) {
  margin-top: 6px;
  margin-bottom: 0;
}

.hermes-markdown-content :deep(li + li) {
  margin-top: 4px;
}

.hermes-markdown-content :deep(a) {
  color: var(--app-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.hermes-markdown-content :deep(blockquote) {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-left: 4px solid rgba(var(--app-primary-rgb), 0.28);
  border-radius: 0 12px 12px 0;
  background: rgba(var(--app-primary-rgb), 0.06);
  color: #475569;
}

.hermes-markdown-content :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

.hermes-markdown-content :deep(code) {
  padding: 2px 6px;
  border-radius: 8px;
  background: rgba(var(--app-primary-rgb), 0.08);
  color: #0f172a;
  font-family: var(--app-font-mono);
  font-size: 12px;
}

.hermes-markdown-content :deep(pre) {
  margin: 0 0 10px;
  padding: 12px;
  overflow: auto;
  border-radius: 14px;
  background: #141b22;
  color: #f8fafc;
}

.hermes-markdown-content :deep(pre code) {
  padding: 0;
  background: transparent;
  color: inherit;
  font-size: 12px;
}

.hermes-markdown-content :deep(hr) {
  margin: 14px 0;
  border: 0;
  border-top: 1px solid rgba(var(--app-outline-rgb), 0.12);
}

.hermes-markdown-content :deep(img) {
  display: block;
  max-width: 100%;
  margin: 0 0 10px;
  border-radius: 12px;
}

.hermes-markdown-content :deep(.hermes-table-wrap) {
  margin: 0 0 10px;
  overflow: auto;
  border: 1px solid rgba(var(--app-outline-rgb), 0.12);
  border-radius: 14px;
  background: #fff;
}

.hermes-markdown-content :deep(.hermes-table-wrap table) {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
}

.hermes-markdown-content :deep(.hermes-table-wrap th),
.hermes-markdown-content :deep(.hermes-table-wrap td) {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--app-outline-rgb), 0.08);
  text-align: left;
  vertical-align: top;
}

.hermes-markdown-content :deep(.hermes-table-wrap th) {
  background: #f8fafc;
  color: #334155;
  font-weight: 800;
  white-space: nowrap;
}

.hermes-markdown-content :deep(.hermes-table-wrap tbody tr:nth-child(even)) {
  background: rgba(248, 250, 252, 0.72);
}

.hermes-markdown-content :deep(.hermes-table-wrap tbody tr:last-child td) {
  border-bottom: 0;
}

.hermes-markdown-content :deep(.task-list-item) {
  list-style: none;
  margin-left: -20px;
}

.hermes-markdown-content :deep(.task-list-item-label) {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
}

.hermes-markdown-content :deep(.task-list-item-checkbox) {
  margin-top: 4px;
  accent-color: var(--app-primary);
  pointer-events: none;
}

.hermes-markdown-content :deep(.hermes-think-block) {
  margin: 0 0 12px;
  border: 1px solid rgba(51, 65, 85, 0.12);
  border-left: 3px solid #2563eb;
  border-radius: 10px;
  background:
    linear-gradient(90deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.82)),
    repeating-linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0 1px, transparent 1px 8px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.hermes-markdown-content :deep(.hermes-think-block summary) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 13px;
  color: #1e3a8a;
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
  box-sizing: border-box;
  flex: 0 0 18px;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}

.hermes-markdown-content :deep(.hermes-think-status-icon.thinking) {
  border: 2px solid rgba(var(--app-primary-rgb), 0.16);
  border-top-color: rgba(var(--app-primary-rgb), 0.92);
  color: rgba(var(--app-primary-rgb), 0.92);
  background: transparent;
  font-size: 0;
  line-height: 0;
  transform-origin: 50% 50%;
  animation: hermes-spin 1.2s linear infinite;
}

.hermes-markdown-content :deep(.hermes-think-status-icon.done) {
  color: #0f766e;
  background: rgba(15, 118, 110, 0.14);
}

.hermes-markdown-content :deep(.hermes-think-block.is-done) {
  border-color: rgba(15, 118, 110, 0.2);
  border-left-color: #0f766e;
  background:
    linear-gradient(90deg, rgba(236, 253, 245, 0.96), rgba(255, 255, 255, 0.82)),
    repeating-linear-gradient(135deg, rgba(15, 118, 110, 0.08) 0 1px, transparent 1px 8px);
}

.hermes-markdown-content :deep(.hermes-think-block.is-done .hermes-think-summary-label) {
  color: #0f766e;
}

.hermes-markdown-content :deep(.hermes-think-summary-label) {
  letter-spacing: 0;
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
  padding: 0 14px 13px 18px;
  border-top: 1px solid rgba(51, 65, 85, 0.08);
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
}

.hermes-markdown-content :deep(.hermes-react-process-block .hermes-think-content p) {
  margin: 10px 0 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.7;
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

.hermes-slash-menu {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid rgba(var(--app-primary-rgb), 0.18);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
}

.hermes-slash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #475569;
  text-align: left;
}

.hermes-slash-item:hover,
.hermes-slash-item.active {
  background: rgba(var(--app-primary-rgb), 0.08);
}

.hermes-slash-item strong {
  color: #0f172a;
  font-size: 13px;
}

.hermes-slash-item span {
  color: #64748b;
  font-size: 12px;
}

.hermes-selected-skill {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid rgba(var(--app-primary-rgb), 0.28);
  border-radius: 999px;
  background: rgba(var(--app-primary-rgb), 0.08);
  color: #334155;
  font-size: 12px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.62);
}

.hermes-selected-skill-kicker {
  color: var(--app-primary);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hermes-selected-skill strong {
  color: #0f172a;
  font-weight: 900;
}

.hermes-selected-skill button {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: #475569;
  line-height: 1;
}

:deep(.hermes-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 14px 18px 6px;
}

:deep(.hermes-drawer .el-drawer__body) {
  display: flex;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

:deep(.hermes-drawer.is-desktop-fullscreen .el-drawer) {
  width: 100% !important;
  max-width: 100%;
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
    position: relative;
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr);
  }

  .hermes-session-sidebar {
    --hermes-session-scroll-gutter: 0px;
    position: absolute;
    top: 12px;
    left: 12px;
    right: 12px;
    z-index: 20;
    height: min(42vh, 340px);
    padding: 10px 12px 12px;
    border: 1px solid rgba(var(--app-outline-rgb), 0.1);
    border-radius: 24px;
    background: rgba(248, 250, 252, 0.98);
    box-shadow: 0 20px 44px rgba(15, 23, 42, 0.16);
    transform: translateY(calc(-100% - 18px));
    opacity: 0;
    pointer-events: none;
    transition: transform 0.26s ease, opacity 0.22s ease;
  }

  .hermes-session-sidebar.mobile-panel-open {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
  }

  .hermes-mobile-session-backdrop {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 10;
    background: rgba(15, 23, 42, 0.18);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.22s ease;
    backdrop-filter: blur(2px);
  }

  .hermes-mobile-session-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .hermes-mobile-session-head,
  .hermes-mobile-session-toggle-shell {
    display: flex;
  }

  .hermes-mobile-session-toggle-shell {
    padding: 12px 14px 0;
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
