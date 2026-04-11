<template>
  <div class="list-user-group-display" :class="`is-${size}`">
    <span v-if="!users.length" class="list-user-group-empty">{{ emptyText }}</span>
    <el-popover
      v-else
      trigger="click"
      :placement="placement"
      :width="popoverWidth"
      popper-class="list-user-group-display-popper"
    >
      <template #reference>
        <button class="list-user-group-trigger" type="button" :title="titleText">
          <span class="list-user-group-stack">
            <span
              v-for="(item, index) in visibleUsers"
              :key="item.id"
              class="list-user-group-avatar"
              :class="`is-${size}`"
              :style="{ zIndex: index + 1 }"
            >
              <img v-if="item.avatarUrl" class="list-user-group-avatar-image" :src="item.avatarUrl" :alt="item.name" />
              <span v-else class="list-user-group-avatar-text">{{ buildListUserAvatarText(item.name) }}</span>
            </span>
            <span
              v-if="hiddenUserCount > 0"
              class="list-user-group-avatar list-user-group-avatar-more"
              :style="{ zIndex: visibleUsers.length + 1 }"
            >
              +{{ hiddenUserCount }}
            </span>
          </span>
        </button>
      </template>

      <div class="list-user-group-panel">
        <div v-for="item in users" :key="item.id" class="list-user-group-panel-item">
          <span class="list-user-group-panel-avatar" :class="`is-${size}`">
            <img v-if="item.avatarUrl" class="list-user-group-avatar-image" :src="item.avatarUrl" :alt="item.name" />
            <span v-else class="list-user-group-avatar-text">{{ buildListUserAvatarText(item.name) }}</span>
          </span>
          <span class="list-user-group-panel-name">{{ item.name }}</span>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { buildListUserAvatarText, type ListUserDisplayItem } from './listUserDisplay'

interface ListUserGroupDisplayProps {
  /** 当前字段对应的用户集合。 */
  users: ListUserDisplayItem[]
  /** 空列表时的占位文案。 */
  emptyText?: string
  /** 列表中默认可见的头像数量。 */
  maxVisible?: number
  /** 列表尺寸，项目页使用 md，工作项列表使用 sm。 */
  size?: 'sm' | 'md'
  /** 弹层展开方向。 */
  placement?: 'bottom-start' | 'bottom-end'
}

const props = withDefaults(defineProps<ListUserGroupDisplayProps>(), {
  emptyText: '-',
  maxVisible: 3,
  size: 'sm',
  placement: 'bottom-start'
})

const visibleUsers = computed(() => props.users.slice(0, props.maxVisible))
const hiddenUserCount = computed(() => Math.max(0, props.users.length - visibleUsers.value.length))
const titleText = computed(() => props.users.map((item) => item.name).join('、'))
const popoverWidth = computed(() => (props.size === 'md' ? 260 : 220))
</script>

<style scoped>
.list-user-group-display {
  width: 100%;
  min-width: 0;
}

.list-user-group-trigger {
  width: 100%;
  display: inline-flex;
  justify-content: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.list-user-group-stack {
  display: inline-flex;
  align-items: center;
}

.list-user-group-avatar {
  width: 22px;
  height: 22px;
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 999px;
  border: 2px solid #fff;
  background: rgba(var(--app-primary-container-rgb), 0.14);
  color: var(--app-primary);
  font-weight: 800;
}

.list-user-group-avatar.is-md {
  width: 28px;
  height: 28px;
}

.list-user-group-avatar-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.list-user-group-avatar-text {
  line-height: 1;
}

.list-user-group-avatar + .list-user-group-avatar {
  margin-left: -6px;
}

.list-user-group-avatar-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: -6px;
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
  background: rgba(225, 227, 228, 0.92);
}

.list-user-group-empty {
  color: #758393;
  font-weight: 600;
}

.list-user-group-display.is-sm .list-user-group-empty {
  font-size: 11px;
}

.list-user-group-display.is-sm .list-user-group-avatar-text {
  font-size: 9px;
}

.list-user-group-display.is-md .list-user-group-empty {
  font-size: 12px;
  font-weight: 700;
}

.list-user-group-display.is-md .list-user-group-avatar-text {
  font-size: 10px;
}

.list-user-group-display.is-md .list-user-group-avatar + .list-user-group-avatar,
.list-user-group-display.is-md .list-user-group-avatar-more {
  margin-left: -7px;
}

.list-user-group-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
}

.list-user-group-panel-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
}

.list-user-group-panel-item:hover {
  background: rgba(248, 250, 252, 0.96);
}

.list-user-group-panel-avatar {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(var(--app-primary-container-rgb), 0.14);
  color: var(--app-primary);
  font-weight: 800;
}

.list-user-group-panel-avatar.is-md {
  width: 32px;
  height: 32px;
}

.list-user-group-panel-name {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 700;
}

:deep(.list-user-group-display-popper) {
  padding: 12px !important;
  border-radius: 14px !important;
}
</style>
