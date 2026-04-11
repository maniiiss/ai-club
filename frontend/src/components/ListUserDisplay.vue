<template>
  <div class="list-user-display" :class="[`is-${size}`, { 'is-empty': !user }]">
    <template v-if="user">
      <span class="list-user-display-avatar" :class="`is-${size}`">
        <img v-if="user.avatarUrl" class="list-user-display-avatar-image" :src="user.avatarUrl" :alt="user.name" />
        <span v-else class="list-user-display-avatar-text">{{ avatarText }}</span>
      </span>
      <span class="list-user-display-name" :title="user.name">{{ user.name }}</span>
    </template>
    <span v-else class="list-user-display-empty">{{ emptyText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { buildListUserAvatarText, type ListUserDisplayItem } from './listUserDisplay'

interface ListUserDisplayProps {
  /** 当前展示的单个人员信息；为空时显示空态文案。 */
  user: ListUserDisplayItem | null
  /** 空数据时的占位文案。 */
  emptyText?: string
  /** 列表尺寸，项目页使用 md，工作项列表使用 sm。 */
  size?: 'sm' | 'md'
}

const props = withDefaults(defineProps<ListUserDisplayProps>(), {
  emptyText: '-',
  size: 'sm'
})

const avatarText = computed(() => buildListUserAvatarText(props.user?.name))
</script>

<style scoped>
.list-user-display {
  width: 100%;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.list-user-display-avatar {
  width: 22px;
  height: 22px;
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

.list-user-display-avatar.is-md {
  width: 28px;
  height: 28px;
}

.list-user-display-avatar-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.list-user-display-avatar-text {
  line-height: 1;
}

.list-user-display-name {
  min-width: 0;
  overflow: hidden;
  color: var(--app-text);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
}

.list-user-display-empty {
  color: #758393;
  font-weight: 600;
}

.list-user-display.is-sm .list-user-display-name {
  font-size: 12px;
}

.list-user-display.is-sm .list-user-display-avatar-text {
  font-size: 9px;
}

.list-user-display.is-sm .list-user-display-empty {
  font-size: 11px;
}

.list-user-display.is-md {
  gap: 10px;
}

.list-user-display.is-md .list-user-display-name {
  font-size: 13px;
}

.list-user-display.is-md .list-user-display-avatar-text {
  font-size: 10px;
}

.list-user-display.is-md .list-user-display-empty {
  font-size: 12px;
  font-weight: 700;
}
</style>
