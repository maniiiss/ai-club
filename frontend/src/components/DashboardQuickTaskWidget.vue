<template>
  <div class="dashboard-quick-task-widget">
    <div v-if="saveStatusText" class="dashboard-quick-task-status-row">
      <span class="dashboard-quick-task-save-status" :class="saveState">{{ saveStatusText }}</span>
    </div>

    <div v-if="loading" class="dashboard-quick-task-empty">正在加载快捷任务...</div>
    <div v-else-if="quickTaskDrafts.length" class="dashboard-quick-task-list-shell">
      <VueDraggable
        v-model="quickTaskDrafts"
        class="dashboard-quick-task-list"
        item-key="localKey"
        handle=".dashboard-quick-task-drag-handle"
        :animation="180"
        :disabled="saveState === 'saving'"
        @end="handleSortEnd"
      >
        <article
          v-for="item in quickTaskDrafts"
          :key="item.localKey"
          class="dashboard-quick-task-item"
          :class="{ completed: item.checked, editing: editingLocalKey === item.localKey }"
        >
          <button
            class="dashboard-quick-task-drag-handle"
            type="button"
            aria-label="拖拽调整顺序"
            :disabled="saveState === 'saving'"
          >
            ⋮⋮
          </button>
          <input
            v-model="item.checked"
            class="dashboard-quick-task-checkbox"
            type="checkbox"
            :disabled="saveState === 'saving'"
            @change="handleCheckedChange"
          />
          <input
            :ref="setInputRef(item.localKey)"
            v-model="item.content"
            class="dashboard-quick-task-input"
            :class="{ completed: item.checked }"
            type="text"
            maxlength="200"
            placeholder="输入一条临时任务或备忘..."
            :disabled="saveState === 'saving'"
            @focus="editingLocalKey = item.localKey"
            @input="handleDraftInput"
            @blur="handleTaskBlur(item.localKey)"
            @keydown.enter.prevent="handleTaskEnter(item.localKey)"
          />
          <button
            class="dashboard-quick-task-delete"
            type="button"
            aria-label="删除快捷任务"
            :disabled="saveState === 'saving'"
            @mousedown.prevent="handleDeleteTask(item.localKey)"
          >
            删除
          </button>
        </article>
      </VueDraggable>
    </div>
    <div v-else class="dashboard-quick-task-empty">
      <p>暂无快捷任务，点击右上角 + 开始记录。</p>
      <span>内容留空并失焦后会自动撤销，不会生成空白脏数据。</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { ElMessage } from 'element-plus'
import { VueDraggable } from 'vue-draggable-plus'
import { listDashboardQuickTasks, saveDashboardQuickTasks } from '@/api/platform'
import type { DashboardQuickTaskItem } from '@/types/platform'

interface DashboardQuickTaskDraftItem {
  /** 后端持久化ID；新建但尚未保存时为空。 */
  id: number | null
  /** 前端本地唯一键，用来回填保存结果与维持拖拽稳定性。 */
  localKey: string
  /** 用户填写的临时笔记内容。 */
  content: string
  /** 是否已完成。 */
  checked: boolean
}

type QuickTaskSaveState = 'idle' | 'saving' | 'saved' | 'error'

const QUICK_TASK_LIMIT = 20
const loading = ref(false)
const saveState = ref<QuickTaskSaveState>('idle')
const quickTaskDrafts = ref<DashboardQuickTaskDraftItem[]>([])
const editingLocalKey = ref('')
const inputElementMap = new Map<string, HTMLInputElement>()
let saveStateResetTimer: number | null = null
let draftRevision = 0

const saveStatusText = computed(() => {
  if (saveState.value === 'saving') return '保存中...'
  if (saveState.value === 'saved') return '已自动保存'
  if (saveState.value === 'error') return '保存失败'
  return ''
})

/**
 * 统一生成本地草稿键，保证新增项在后端分配ID前也能稳定拖拽和回填。
 */
function createLocalKey(seed?: string) {
  if (seed && seed.trim()) {
    return seed.trim()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `draft-${crypto.randomUUID()}`
  }
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function buildDraftItem(item: DashboardQuickTaskItem): DashboardQuickTaskDraftItem {
  return {
    id: item.id,
    localKey: createLocalKey(item.clientKey || `server-${item.id}`),
    content: item.content,
    checked: item.checked
  }
}

function setInputRef(localKey: string) {
  return (element: Element | ComponentPublicInstance | null) => {
    if (element instanceof HTMLInputElement) {
      inputElementMap.set(localKey, element)
    } else {
      inputElementMap.delete(localKey)
    }
  }
}

function focusTaskInput(localKey: string) {
  const element = inputElementMap.get(localKey)
  if (!element) {
    return
  }
  element.focus()
  element.select()
}

function clearSaveStateResetTimer() {
  if (!saveStateResetTimer) {
    return
  }
  window.clearTimeout(saveStateResetTimer)
  saveStateResetTimer = null
}

function scheduleSaveStateReset() {
  clearSaveStateResetTimer()
  saveStateResetTimer = window.setTimeout(() => {
    if (saveState.value === 'saved') {
      saveState.value = 'idle'
    }
  }, 1800)
}

function markDraftChanged() {
  draftRevision += 1
  if (saveState.value === 'saved') {
    saveState.value = 'idle'
  }
}

function normalizeDrafts(items: DashboardQuickTaskDraftItem[]) {
  return items
    .map((item) => ({
      ...item,
      content: item.content.trim()
    }))
    .filter((item) => item.content !== '')
}

/**
 * 当保存响应晚于本地继续编辑时，只把新分配的ID回填给对应草稿行，
 * 避免用旧响应覆盖用户已经继续输入的新内容。
 */
function patchDraftIdsFromServer(savedItems: DashboardQuickTaskItem[]) {
  const serverIdMap = new Map(savedItems.map((item) => [item.clientKey, item.id]))
  quickTaskDrafts.value = quickTaskDrafts.value.map((item) => ({
    ...item,
    id: serverIdMap.get(item.localKey) ?? item.id
  }))
}

async function loadQuickTasks() {
  loading.value = true
  try {
    quickTaskDrafts.value = (await listDashboardQuickTasks()).map(buildDraftItem)
  } catch (error: any) {
    quickTaskDrafts.value = []
    ElMessage.error(error?.response?.data?.message || '加载快捷任务失败')
  } finally {
    loading.value = false
  }
}

/**
 * 把当前清单整体保存到后端：
 * 1. 先清洗空白项，避免把无效内容送到后端；
 * 2. 保存成功后按 clientKey 回填最新ID；
 * 3. 如果保存期间用户又继续改动，则只补ID，不覆盖本地新草稿内容。
 */
async function persistQuickTasks() {
  if (loading.value || saveState.value === 'saving') {
    return
  }

  clearSaveStateResetTimer()
  const blankDrafts = quickTaskDrafts.value.filter((item) => item.content.trim() === '')
  const normalizedDrafts = normalizeDrafts(quickTaskDrafts.value)
  const requestRevision = draftRevision
  saveState.value = 'saving'

  try {
    const savedItems = await saveDashboardQuickTasks(
      normalizedDrafts.map((item) => ({
        id: item.id,
        clientKey: item.localKey,
        content: item.content,
        checked: item.checked
      }))
    )

    if (requestRevision !== draftRevision) {
      patchDraftIdsFromServer(savedItems)
      saveState.value = 'idle'
      return
    }

    const savedDrafts: DashboardQuickTaskDraftItem[] = savedItems.map((item) => ({
      id: item.id,
      localKey: createLocalKey(item.clientKey),
      content: item.content,
      checked: item.checked
    }))
    quickTaskDrafts.value = [...savedDrafts, ...blankDrafts]
    saveState.value = 'saved'
    scheduleSaveStateReset()
  } catch (error: any) {
    saveState.value = 'error'
    ElMessage.error(error?.response?.data?.message || '保存快捷任务失败')
  }
}

function handleAddTask() {
  if (loading.value || saveState.value === 'saving') {
    return
  }

  if (quickTaskDrafts.value.length >= QUICK_TASK_LIMIT) {
    ElMessage.warning(`快捷任务最多保留 ${QUICK_TASK_LIMIT} 条`)
    return
  }

  const blankDraft = quickTaskDrafts.value.find((item) => !item.content.trim())
  if (blankDraft) {
    editingLocalKey.value = blankDraft.localKey
    void nextTick(() => focusTaskInput(blankDraft.localKey))
    return
  }

  const localKey = createLocalKey()
  quickTaskDrafts.value = [
    ...quickTaskDrafts.value,
    {
      id: null,
      localKey,
      content: '',
      checked: false
    }
  ]
  editingLocalKey.value = localKey
  markDraftChanged()
  void nextTick(() => focusTaskInput(localKey))
}

function handleDraftInput() {
  markDraftChanged()
  if (saveState.value === 'error') {
    saveState.value = 'idle'
  }
}

function handleTaskEnter(localKey: string) {
  inputElementMap.get(localKey)?.blur()
}

async function handleTaskBlur(localKey: string) {
  const draftItem = quickTaskDrafts.value.find((item) => item.localKey === localKey)
  if (!draftItem) {
    return
  }

  draftItem.content = draftItem.content.trim()
  if (editingLocalKey.value === localKey) {
    editingLocalKey.value = ''
  }

  if (!draftItem.content) {
    quickTaskDrafts.value = quickTaskDrafts.value.filter((item) => item.localKey !== localKey)
    markDraftChanged()
    if (draftItem.id !== null) {
      await persistQuickTasks()
    }
    return
  }

  markDraftChanged()
  await persistQuickTasks()
}

async function handleCheckedChange() {
  markDraftChanged()
  await persistQuickTasks()
}

async function handleSortEnd() {
  markDraftChanged()
  await persistQuickTasks()
}

async function handleDeleteTask(localKey: string) {
  if (loading.value || saveState.value === 'saving') {
    return
  }

  const draftItem = quickTaskDrafts.value.find((item) => item.localKey === localKey)
  if (!draftItem) {
    return
  }

  quickTaskDrafts.value = quickTaskDrafts.value.filter((item) => item.localKey !== localKey)
  if (editingLocalKey.value === localKey) {
    editingLocalKey.value = ''
  }
  markDraftChanged()

  if (draftItem.id !== null || quickTaskDrafts.value.some((item) => item.content.trim())) {
    await persistQuickTasks()
  }
}

onMounted(async () => {
  await loadQuickTasks()
})

onBeforeUnmount(() => {
  clearSaveStateResetTimer()
  inputElementMap.clear()
})

/**
 * 暴露给首页看板头部的新增动作，让标题栏的 + 号可以直接驱动组件新增一条草稿。
 */
defineExpose({
  addTask: handleAddTask
})
</script>

<style scoped>
.dashboard-quick-task-widget {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 12px;
}

.dashboard-quick-task-status-row {
  display: flex;
  justify-content: flex-end;
}

.dashboard-quick-task-save-status {
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.dashboard-quick-task-save-status.saved {
  color: var(--app-success);
}

.dashboard-quick-task-save-status.error {
  color: var(--app-danger);
}

.dashboard-quick-task-drag-handle,
.dashboard-quick-task-delete {
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  cursor: pointer;
}

.dashboard-quick-task-drag-handle:disabled,
.dashboard-quick-task-delete:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.dashboard-quick-task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dashboard-quick-task-item {
  display: grid;
  grid-template-columns: 28px 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(var(--app-outline-rgb), 0.04);
  transition: background 0.2s ease, box-shadow 0.2s ease;
}

.dashboard-quick-task-item.editing {
  background: rgba(var(--app-primary-container-rgb), 0.12);
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-rgb), 0.14);
}

.dashboard-quick-task-item.completed {
  background: rgba(var(--app-outline-rgb), 0.025);
}

.dashboard-quick-task-drag-handle {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background: rgba(var(--app-outline-rgb), 0.08);
  color: var(--app-text-muted);
  font-size: 13px;
}

.dashboard-quick-task-checkbox {
  width: 16px;
  height: 16px;
}

.dashboard-quick-task-input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--app-text);
  font-size: 14px;
  line-height: 1.6;
}

.dashboard-quick-task-input::placeholder {
  color: var(--app-text-muted);
}

.dashboard-quick-task-input.completed {
  color: var(--app-text-muted);
  text-decoration: line-through;
}

.dashboard-quick-task-delete {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(186, 26, 26, 0.08);
  color: var(--app-danger);
  font-size: 12px;
  font-weight: 800;
}

.dashboard-quick-task-empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border-radius: 16px;
  background: rgba(var(--app-outline-rgb), 0.04);
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.7;
}

.dashboard-quick-task-empty p {
  margin: 0;
  color: var(--app-text-soft);
  font-weight: 700;
}

.dashboard-quick-task-empty span {
  color: var(--app-text-muted);
}

@media (max-width: 900px) {
  .dashboard-quick-task-status-row {
    justify-content: flex-start;
  }

  .dashboard-quick-task-item {
    grid-template-columns: 28px 20px minmax(0, 1fr);
  }

  .dashboard-quick-task-delete {
    grid-column: 1 / -1;
    justify-self: flex-end;
  }
}
</style>
