<template>
  <!--
    移动端通用「表单底部抽屉」外壳。
    桌面端不强制使用本组件，调用方应在 isMobileViewport 为 true 时再渲染本组件，
    桌面端继续保持各自的 el-dialog 形态，避免改动既有视觉。
    形态约定：
      - direction = btt（从下往上弹出）
      - 默认高度 88%，最高 100%（由调用方通过 size 调整）
      - 顶部圆角 24px、自绘 header / footer、底部 safe-area 适配
      - 不展示 Element 默认关闭按钮，避免与自绘头部冲突
  -->
  <el-drawer
    v-model="visible"
    direction="btt"
    :size="size"
    :show-close="false"
    :close-on-click-modal="closeOnClickModal"
    :close-on-press-escape="closeOnPressEscape"
    :destroy-on-close="destroyOnClose"
    :append-to-body="appendToBody"
    :class="['mobile-form-drawer', drawerClass]"
  >
    <template #header>
      <slot name="header">
        <div class="mobile-form-drawer-header">
          <span class="mobile-form-drawer-handle" aria-hidden="true"></span>
          <div class="mobile-form-drawer-header-main">
            <span v-if="headerIcon" class="mobile-form-drawer-header-icon">
              <el-icon>
                <component :is="headerIcon" />
              </el-icon>
            </span>
            <div class="mobile-form-drawer-header-copy">
              <div class="mobile-form-drawer-header-title">{{ title }}</div>
              <p v-if="subtitle" class="mobile-form-drawer-header-subtitle">{{ subtitle }}</p>
            </div>
            <button
              v-if="showCloseButton"
              type="button"
              class="mobile-form-drawer-close"
              @click="handleCancel"
            >
              收起
            </button>
          </div>
        </div>
      </slot>
    </template>

    <div class="mobile-form-drawer-body">
      <slot />
    </div>

    <template #footer>
      <slot name="footer" :submit="handleSubmit" :cancel="handleCancel">
        <div class="mobile-form-drawer-footer">
          <el-button class="mobile-form-drawer-footer-btn" @click="handleCancel">
            {{ cancelText }}
          </el-button>
          <el-button
            class="mobile-form-drawer-footer-btn is-primary"
            type="primary"
            :loading="submitting"
            :disabled="submitDisabled"
            @click="handleSubmit"
          >
            {{ submitText }}
          </el-button>
        </div>
      </slot>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import { ElButton, ElDrawer, ElIcon } from 'element-plus'

/**
 * 移动端表单抽屉的属性约定。
 * 仅描述「形态」，不绑定任何业务字段，便于多页面复用。
 */
interface Props {
  /** 抽屉是否打开，配合 v-model 使用。 */
  modelValue: boolean
  /** 标题，必填。 */
  title: string
  /** 副标题，描述当前操作上下文，可选。 */
  subtitle?: string
  /** 主按钮文案。 */
  submitText?: string
  /** 取消按钮文案。 */
  cancelText?: string
  /** 主按钮 loading 状态。 */
  submitting?: boolean
  /** 主按钮禁用态。 */
  submitDisabled?: boolean
  /** 抽屉高度，支持 Element Plus 的 size 写法。 */
  size?: string | number
  /** 自定义 header 内的图标组件，例如 FolderOpened。 */
  headerIcon?: Component | null
  /** 是否显示头部「收起」按钮。 */
  showCloseButton?: boolean
  /** 点击遮罩是否关闭，默认 false 避免长表单误触。 */
  closeOnClickModal?: boolean
  /** ESC 是否关闭。 */
  closeOnPressEscape?: boolean
  /** 关闭后是否销毁内部 DOM。 */
  destroyOnClose?: boolean
  /** 是否挂载到 body。 */
  appendToBody?: boolean
  /** 额外 class，便于业务页面做局部样式覆盖。 */
  drawerClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  subtitle: '',
  submitText: '确定',
  cancelText: '取消',
  submitting: false,
  submitDisabled: false,
  size: '88%',
  headerIcon: null,
  showCloseButton: true,
  closeOnClickModal: false,
  closeOnPressEscape: true,
  destroyOnClose: true,
  appendToBody: false,
  drawerClass: ''
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'submit'): void
  (event: 'cancel'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const handleSubmit = () => {
  emit('submit')
}

const handleCancel = () => {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<style scoped>
.mobile-form-drawer-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
}

.mobile-form-drawer-handle {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: rgba(25, 28, 29, 0.18);
  align-self: center;
}

.mobile-form-drawer-header-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mobile-form-drawer-header-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(25, 28, 29, 0.06);
  color: #191c1d;
  font-size: 18px;
  flex-shrink: 0;
}

.mobile-form-drawer-header-copy {
  flex: 1;
  min-width: 0;
}

.mobile-form-drawer-header-title {
  font-size: 18px;
  font-weight: 600;
  color: #191c1d;
  line-height: 1.3;
}

.mobile-form-drawer-header-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(25, 28, 29, 0.6);
  line-height: 1.5;
}

.mobile-form-drawer-close {
  flex-shrink: 0;
  border: 0;
  background: rgba(25, 28, 29, 0.06);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  color: rgba(25, 28, 29, 0.7);
  cursor: pointer;
  transition: background 0.2s;
}

.mobile-form-drawer-close:active {
  background: rgba(25, 28, 29, 0.12);
}

.mobile-form-drawer-body {
  height: 100%;
  overflow-y: auto;
  padding: 4px 0 12px;
  -webkit-overflow-scrolling: touch;
}

.mobile-form-drawer-footer {
  display: flex;
  gap: 10px;
  width: 100%;
}

.mobile-form-drawer-footer-btn {
  flex: 1;
  min-height: 40px;
  border-radius: 12px;
  font-size: 14px;
}

.mobile-form-drawer-footer-btn.is-primary {
  font-weight: 600;
}
</style>

<style>
/*
  全局样式（非 scoped）覆写 Element Plus 抽屉外壳，
  控制圆角、padding 与底部 safe-area 适配。
  使用 .mobile-form-drawer 作为命名空间，避免影响其他抽屉。
*/
.mobile-form-drawer {
  --el-drawer-bg-color: rgba(248, 249, 250, 0.98);
}

.mobile-form-drawer .el-drawer {
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -20px 60px -15px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.mobile-form-drawer .el-drawer__header {
  margin-bottom: 0;
  padding: 12px 18px 8px;
}

.mobile-form-drawer .el-drawer__body {
  padding: 0 18px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.mobile-form-drawer .el-drawer__footer {
  padding: 12px 18px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(25, 28, 29, 0.06);
  background: #ffffff;
}
</style>
