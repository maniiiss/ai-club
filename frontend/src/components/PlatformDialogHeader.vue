<template>
  <div class="platform-dialog-header">
    <span class="platform-dialog-header-icon">
      <el-icon><component :is="icon" /></el-icon>
    </span>
    <div class="platform-dialog-header-copy">
      <div class="platform-dialog-header-title">{{ title }}</div>
      <p class="platform-dialog-header-subtitle">{{ subtitle }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

interface PlatformDialogHeaderProps {
  /** 弹窗标题。 */
  title: string
  /** 弹窗副标题。 */
  subtitle: string
  /** 标题前图标。 */
  icon: Component
}

defineProps<PlatformDialogHeaderProps>()
</script>

<style scoped>
.platform-dialog-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-right: 28px;
}

.platform-dialog-header-icon {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(var(--app-primary-container-rgb), 0.18) 0%, rgba(var(--app-primary-rgb), 0.14) 100%);
  color: var(--app-primary);
  font-size: 20px;
}

.platform-dialog-header-copy {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
}

.platform-dialog-header-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 24px;
  font-weight: 800;
  line-height: 1.12;
}

.platform-dialog-header-subtitle {
  margin: 0;
  color: var(--app-text-soft);
  font-size: 12px;
  line-height: 1.65;
}

@media (max-width: 680px) {
  .platform-dialog-header {
    gap: 10px;
    padding-right: 22px;
  }

  .platform-dialog-header-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    font-size: 18px;
  }

  .platform-dialog-header-title {
    font-size: 21px;
  }
}
</style>
