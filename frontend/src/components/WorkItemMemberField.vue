<template>
  <div class="work-item-member-field">
    <el-popover
      v-model:visible="visible"
      trigger="click"
      placement="bottom-start"
      :width="popoverWidth"
      popper-class="work-item-member-popper"
    >
      <template #reference>
        <button
          class="work-item-member-reference"
          :class="{ 'is-open': visible, disabled, 'is-empty': !hasSelection }"
          type="button"
          :disabled="disabled"
          :title="selectionTitle"
        >
          <span v-if="hasSelection" class="work-item-member-inline">
            <span v-if="assigneeUser" class="work-item-member-inline-owner">
              <el-avatar :size="22" class="work-item-member-inline-avatar owner">
                {{ buildUserAvatar(assigneeUser) }}
              </el-avatar>
              <span class="work-item-member-inline-name">{{ buildUserName(assigneeUser) }}</span>
            </span>

            <span v-if="assigneeUser && inlineCollaboratorUsers.length" class="work-item-member-inline-separator">/</span>

            <span v-if="inlineCollaboratorUsers.length" class="work-item-member-inline-collaborators">
              <el-avatar
                v-for="item in inlineCollaboratorUsers"
                :key="item.id"
                :size="20"
                class="work-item-member-inline-avatar collaborator"
              >
                {{ buildUserAvatar(item) }}
              </el-avatar>
              <span v-if="hiddenCollaboratorCount > 0" class="work-item-member-inline-more">+{{ hiddenCollaboratorCount }}</span>
            </span>
          </span>
          <span v-else class="work-item-member-inline-placeholder">{{ placeholder }}</span>

          <el-icon class="work-item-member-arrow" :class="{ 'is-open': visible }">
            <ArrowDown />
          </el-icon>
        </button>
      </template>

      <div class="work-item-member-panel">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索成员"
          class="work-item-member-search"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-scrollbar max-height="300px" class="work-item-member-scroll">
          <template v-if="visibleSections.length">
            <section
              v-for="section in visibleSections"
              :key="section.key"
              class="work-item-member-section"
            >
              <header class="work-item-member-section-head">
                <span>{{ section.label }} {{ section.selectedCount }}/{{ section.totalCount }}</span>
              </header>

              <div class="work-item-member-section-body">
                <div
                  v-for="item in section.users"
                  :key="item.id"
                  class="work-item-member-row"
                  :class="rowStateClass(item.id)"
                >
                  <div class="work-item-member-user">
                    <el-avatar :size="26" class="work-item-member-avatar">
                      {{ buildUserAvatar(item) }}
                    </el-avatar>
                    <div class="work-item-member-user-copy">
                      <div class="work-item-member-user-name">{{ buildUserName(item) }}</div>
                    </div>
                  </div>

                  <div class="work-item-member-actions">
                    <el-button
                      plain
                      round
                      size="small"
                      type="primary"
                      class="work-item-member-action"
                      :class="['is-assignee', { 'is-active': isAssigneeSelected(item.id) }]"
                      @click.stop="toggleAssignee(item.id)"
                    >
                      负责
                    </el-button>
                    <el-button
                      plain
                      round
                      size="small"
                      type="success"
                      class="work-item-member-action"
                      :class="['is-collaborator', { 'is-active': isCollaboratorSelected(item.id) }]"
                      :disabled="isAssigneeSelected(item.id)"
                      @click.stop="toggleCollaborator(item.id)"
                    >
                      协作
                    </el-button>
                  </div>
                </div>
              </div>
            </section>
          </template>
          <el-empty v-else description="暂无匹配成员" :image-size="56" />
        </el-scrollbar>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDown, Search } from '@element-plus/icons-vue'
import type { UserOptionItem } from '@/types/platform'

interface WorkItemMemberFieldProps {
  /** 当前选中的负责人用户ID。 */
  assigneeUserId: number | null
  /** 当前选中的协作者用户ID列表。 */
  collaboratorUserIds: number[]
  /** 当前项目可选的全量用户列表。 */
  userOptions: UserOptionItem[]
  /** 当前项目成员ID列表，用于分组展示。 */
  projectMemberUserIds: number[]
  /** 触发器占位提示。 */
  placeholder?: string
  /** 是否禁用当前字段。 */
  disabled?: boolean
  /** 下拉浮层宽度。 */
  popoverWidth?: number | string
}

interface MemberPickerSection {
  /** 分组唯一标识。 */
  key: 'project' | 'enterprise'
  /** 分组标题。 */
  label: string
  /** 当前分组展示的用户列表。 */
  users: UserOptionItem[]
  /** 当前分组已选中的人数。 */
  selectedCount: number
  /** 当前分组总人数。 */
  totalCount: number
}

const props = withDefaults(defineProps<WorkItemMemberFieldProps>(), {
  placeholder: '指派负责人/协作者',
  disabled: false,
  popoverWidth: 220
})

const emit = defineEmits<{
  'update:assigneeUserId': [value: number | null]
  'update:collaboratorUserIds': [value: number[]]
  change: [value: { assigneeUserId: number | null; collaboratorUserIds: number[] }]
}>()

const visible = ref(false)
const keyword = ref('')

const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase())
const projectMemberIdSet = computed(() => new Set(props.projectMemberUserIds))

const assigneeUser = computed(() =>
  props.assigneeUserId
    ? props.userOptions.find((item) => item.id === props.assigneeUserId) || null
    : null
)

const collaboratorUsers = computed(() =>
  props.collaboratorUserIds
    .map((id) => props.userOptions.find((item) => item.id === id) || null)
    .filter((item): item is UserOptionItem => Boolean(item))
)

/**
 * 表单态只展示“负责人头像+名字 / 协作人头像组”，
 * 保持字段信息足够清晰，同时尽量贴近用户给出的紧凑视觉参考。
 */
const inlineCollaboratorUsers = computed(() => collaboratorUsers.value.slice(0, 3))
const hiddenCollaboratorCount = computed(() => Math.max(0, collaboratorUsers.value.length - inlineCollaboratorUsers.value.length))
const hasSelection = computed(() => Boolean(assigneeUser.value || collaboratorUsers.value.length))
const selectionTitle = computed(() => {
  const titleParts: string[] = []
  if (assigneeUser.value) {
    titleParts.push(`负责人：${buildUserName(assigneeUser.value)}`)
  }
  if (collaboratorUsers.value.length) {
    titleParts.push(`协作人：${collaboratorUsers.value.map((item) => buildUserName(item)).join('、')}`)
  }
  return titleParts.join('；') || props.placeholder
})

/**
 * 按“项目成员 / 企业成员”分组，并在每个分组内带上已选数量，
 * 让一个字段里同时承载负责人与协作者的配置语义。
 */
const visibleSections = computed<MemberPickerSection[]>(() => {
  const isMatchedUser = (item: UserOptionItem) => {
    if (!normalizedKeyword.value) {
      return true
    }
    const searchableText = `${item.nickname} ${item.username}`.toLowerCase()
    return searchableText.includes(normalizedKeyword.value)
  }

  const buildSection = (key: MemberPickerSection['key'], label: string, users: UserOptionItem[]) => ({
    key,
    label,
    users: users.filter(isMatchedUser),
    selectedCount: users.filter((item) => item.id === props.assigneeUserId || props.collaboratorUserIds.includes(item.id)).length,
    totalCount: users.length
  })

  const projectUsers = props.userOptions.filter((item) => projectMemberIdSet.value.has(item.id))
  const enterpriseUsers = props.userOptions.filter((item) => !projectMemberIdSet.value.has(item.id))

  return [
    buildSection('project', '项目成员', projectUsers),
    buildSection('enterprise', '企业成员', enterpriseUsers)
  ].filter((item) => item.users.length > 0)
})

watch(visible, (nextVisible) => {
  if (!nextVisible) {
    keyword.value = ''
  }
})

function buildUserName(item: UserOptionItem | null) {
  if (!item) {
    return ''
  }
  return item.nickname?.trim() || item.username
}

function buildUserAvatar(item: UserOptionItem) {
  return buildUserName(item).slice(0, 1).toUpperCase()
}

function isAssigneeSelected(userId: number) {
  return props.assigneeUserId === userId
}

function isCollaboratorSelected(userId: number) {
  return props.collaboratorUserIds.includes(userId)
}

function rowStateClass(userId: number) {
  return {
    'is-selected': isAssigneeSelected(userId) || isCollaboratorSelected(userId),
    'is-assignee-selected': isAssigneeSelected(userId),
    'is-collaborator-selected': isCollaboratorSelected(userId)
  }
}

/**
 * 统一处理组合字段的双向绑定输出，保证负责人和协作者互斥，
 * 避免父级表单里留下同一用户同时承担两种角色的脏数据。
 */
function emitMemberChange(nextAssigneeUserId: number | null, nextCollaboratorUserIds: number[]) {
  const normalizedCollaborators = Array.from(new Set(nextCollaboratorUserIds))
    .filter((item) => Number.isFinite(item))
    .filter((item) => item !== nextAssigneeUserId)

  emit('update:assigneeUserId', nextAssigneeUserId)
  emit('update:collaboratorUserIds', normalizedCollaborators)
  emit('change', {
    assigneeUserId: nextAssigneeUserId,
    collaboratorUserIds: normalizedCollaborators
  })
}

/**
 * 点击负责人按钮时允许重复点击取消，这样单字段交互也保留清空负责人能力。
 */
function toggleAssignee(userId: number) {
  const nextAssigneeUserId = props.assigneeUserId === userId ? null : userId
  emitMemberChange(nextAssigneeUserId, props.collaboratorUserIds)
}

/**
 * 协作者支持多选；当用户已被设置为负责人时，不再允许追加为协作者。
 */
function toggleCollaborator(userId: number) {
  if (props.assigneeUserId === userId) {
    return
  }
  const nextCollaboratorUserIds = props.collaboratorUserIds.includes(userId)
    ? props.collaboratorUserIds.filter((item) => item !== userId)
    : [...props.collaboratorUserIds, userId]
  emitMemberChange(props.assigneeUserId, nextCollaboratorUserIds)
}
</script>

<style scoped>
.work-item-member-field {
  width: 100%;
}

.work-item-member-reference {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  padding: 7px 10px;
  border: 1px solid var(--app-border, rgba(137, 115, 98, 0.12));
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--app-text, #191c1d);
  cursor: pointer;
  box-shadow: var(--app-shadow-soft, 0 6px 18px rgba(25, 28, 29, 0.04));
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.work-item-member-reference:hover,
.work-item-member-reference.is-open {
  border-color: rgba(var(--app-primary-container-rgb), 0.42);
  background: rgba(var(--app-primary-container-rgb), 0.08);
}

.work-item-member-reference.disabled {
  opacity: 0.66;
  cursor: not-allowed;
  box-shadow: none;
}

.work-item-member-reference.is-empty {
  color: var(--app-text-muted, #758393);
}

.work-item-member-inline {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.work-item-member-inline-owner,
.work-item-member-inline-collaborators {
  display: flex;
  align-items: center;
}

.work-item-member-inline-owner {
  gap: 6px;
  min-width: 0;
}

.work-item-member-inline-name,
.work-item-member-inline-placeholder {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.work-item-member-inline-name {
  color: var(--app-text, #191c1d);
  font-weight: 600;
}

.work-item-member-inline-placeholder {
  flex: 1 1 auto;
}

.work-item-member-inline-separator {
  flex: 0 0 auto;
  color: var(--app-text-muted, #758393);
  font-size: 13px;
}

.work-item-member-inline-collaborators {
  flex: 0 0 auto;
}

.work-item-member-inline-avatar {
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.92);
  box-shadow: 0 2px 8px rgba(25, 28, 29, 0.08);
}

.work-item-member-inline-avatar.owner {
  background: linear-gradient(135deg, var(--app-primary-container, #ff8c00) 0%, var(--app-primary, #904d00) 100%);
  color: #fff;
}

.work-item-member-inline-avatar.collaborator {
  margin-left: -4px;
  background: var(--app-info-soft, #d3ebf8);
  color: var(--app-tertiary, #00658f);
}

.work-item-member-inline-collaborators .work-item-member-inline-avatar:first-child {
  margin-left: 0;
}

.work-item-member-inline-more {
  margin-left: 4px;
  color: var(--app-text-muted, #758393);
  font-size: 11px;
  font-weight: 700;
}

.work-item-member-arrow {
  flex: 0 0 auto;
  color: var(--app-text-muted, #758393);
  font-size: 12px;
  transition: transform 0.2s ease;
}

.work-item-member-arrow.is-open {
  transform: rotate(180deg);
}

.work-item-member-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.work-item-member-search :deep(.el-input__wrapper) {
  min-height: 30px;
  padding: 0 8px;
  border-radius: 10px;
}

.work-item-member-scroll {
  padding-right: 0;
}

.work-item-member-section + .work-item-member-section {
  margin-top: 8px;
}

.work-item-member-section-head {
  margin-bottom: 4px;
  color: var(--app-text-soft, #556474);
  font-size: 12px;
  font-weight: 600;
}

.work-item-member-section-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.work-item-member-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 5px 6px;
  border: 1px solid var(--app-border, rgba(137, 115, 98, 0.12));
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.work-item-member-row:hover {
  background: var(--el-fill-color-light);
  border-color: var(--app-border-strong, rgba(137, 115, 98, 0.22));
}

.work-item-member-row.is-selected {
  box-shadow: 0 6px 16px rgba(25, 28, 29, 0.05);
}

.work-item-member-row.is-assignee-selected {
  border-color: rgba(var(--app-primary-rgb), 0.22);
  background: rgba(var(--app-primary-container-rgb), 0.1);
}

.work-item-member-row.is-collaborator-selected {
  border-color: var(--app-border-strong, rgba(137, 115, 98, 0.22));
  background: var(--app-info-soft, #d3ebf8);
}

.work-item-member-user {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.work-item-member-avatar {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  background: linear-gradient(135deg, var(--app-primary-container, #ff8c00) 0%, var(--app-primary, #904d00) 100%);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.work-item-member-user-copy {
  min-width: 0;
}

.work-item-member-user-name {
  color: var(--app-text, #191c1d);
  font-size: 12px;
  font-weight: 600;
}

.work-item-member-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.work-item-member-action {
  min-width: 42px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  transition: box-shadow 0.18s ease, background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.work-item-member-action.is-assignee {
  border-color: rgba(var(--app-primary-rgb), 0.22);
  background: rgba(var(--app-primary-container-rgb), 0.12);
  color: var(--app-primary, #904d00);
}

.work-item-member-action.is-collaborator {
  border-color: var(--app-border, rgba(137, 115, 98, 0.12));
  background: var(--app-info-soft, #d3ebf8);
  color: var(--app-tertiary, #00658f);
}

.work-item-member-action.is-active {
  font-weight: 700;
}

.work-item-member-action.is-assignee.is-active {
  border-color: var(--app-primary, #904d00);
  background: var(--app-primary, #904d00);
  color: #fff;
  box-shadow: 0 6px 14px rgba(var(--app-primary-rgb), 0.18);
}

.work-item-member-action.is-collaborator.is-active {
  border-color: var(--app-tertiary, #00658f);
  background: var(--app-tertiary, #00658f);
  color: #fff;
  box-shadow: 0 6px 14px rgba(0, 101, 143, 0.18);
}

.work-item-member-action:disabled,
.work-item-member-action.is-disabled {
  opacity: 0.56;
  box-shadow: none;
  transform: none;
}

:deep(.work-item-member-popper) {
  padding: 8px !important;
  border-radius: 12px !important;
}

@media (max-width: 768px) {
  .work-item-member-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .work-item-member-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
