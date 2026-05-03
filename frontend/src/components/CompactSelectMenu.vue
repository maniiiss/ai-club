<template>
  <el-popover
    v-model:visible="visible"
    trigger="click"
    placement="bottom-start"
    :width="popoverWidth"
    popper-style="padding: 4px;"
    popper-class="compact-select-popper"
    :offset="4"
    :show-arrow="false"
  >
    <template #reference>
      <button
        class="compact-select-trigger"
        :class="[sizeClass, variantClass, selectedToneVariantClass, { disabled, 'is-open': visible }]"
        type="button"
        :disabled="disabled"
      >
        <span class="compact-select-value">
          <i v-if="selectedToneClass" class="compact-select-dot" :class="selectedToneClass"></i>
          <span>{{ selectedOption?.label || placeholder }}</span>
        </span>
        <el-icon class="compact-select-arrow"><ArrowDown /></el-icon>
      </button>
    </template>

    <div class="compact-select-menu">
      <button
        v-for="item in options"
        :key="String(item.value)"
        class="compact-select-item"
        :class="{ active: item.value === modelValue }"
        type="button"
        @click="handleSelect(item.value)"
      >
        <span class="compact-select-item-main">
          <i v-if="toneClass(item.tone)" class="compact-select-dot" :class="toneClass(item.tone)"></i>
          <span>{{ item.label }}</span>
        </span>
        <span v-if="item.value === modelValue" class="compact-select-check">✓</span>
      </button>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'

type SelectValue = string | number
type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

export interface CompactSelectOption {
  label: string
  value: SelectValue
  tone?: Tone
}

const props = withDefaults(defineProps<{
  modelValue: SelectValue | null | undefined
  options: CompactSelectOption[]
  placeholder?: string
  disabled?: boolean
  popoverWidth?: number | string
  size?: 'small' | 'default'
  variant?: 'default' | 'inline-pill'
  openOnMount?: boolean
}>(), {
  placeholder: '请选择',
  disabled: false,
  popoverWidth: 160,
  size: 'small',
  variant: 'default',
  openOnMount: false
})

const emit = defineEmits<{
  'update:modelValue': [value: SelectValue]
  change: [value: SelectValue]
  'visible-change': [value: boolean]
}>()

const visible = ref(false)

const selectedOption = computed(() => props.options.find((item) => item.value === props.modelValue))
const selectedToneClass = computed(() => toneClass(selectedOption.value?.tone))
const selectedToneVariantClass = computed(() => (selectedOption.value?.tone ? `selected-${toneClass(selectedOption.value.tone)}` : ''))
const sizeClass = computed(() => (props.size === 'default' ? 'is-default' : 'is-small'))
const variantClass = computed(() => `variant-${props.variant}`)

onMounted(() => {
  if (!props.openOnMount || props.disabled) {
    return
  }
  // 列表内编辑态挂载后立即展开，减少用户从“显示态”切换到“编辑态”的额外点击。
  nextTick(() => {
    visible.value = true
  })
})

watch(visible, (value) => {
  emit('visible-change', value)
})

function toneClass(tone?: Tone) {
  if (!tone) return ''
  return `tone-${tone}`
}

function handleSelect(value: SelectValue) {
  emit('update:modelValue', value)
  emit('change', value)
  visible.value = false
}
</script>

<style scoped>
.compact-select-trigger,
.compact-select-value,
.compact-select-item,
.compact-select-item-main {
  display: flex;
  align-items: center;
}

.compact-select-trigger {
  width: 100%;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--app-text, #191c1d);
  cursor: pointer;
  transition: all 0.2s ease;
}

.compact-select-trigger.is-small {
  min-height: 28px;
  font-size: 12px;
}

.compact-select-trigger.is-default {
  min-height: 32px;
  font-size: 13px;
}

.compact-select-trigger:hover,
.compact-select-trigger.is-open {
  background: rgba(var(--app-primary-rgb, 144, 77, 0), 0.08); /* 统一的主题色微透底底色 */
  color: var(--app-primary, #904d00);
}

.compact-select-trigger.disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.compact-select-trigger.variant-inline-pill {
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--el-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--app-border, rgba(137, 115, 98, 0.12));
}

.compact-select-trigger.variant-inline-pill.is-small,
.compact-select-trigger.variant-inline-pill.is-default {
  min-height: 24px;
  font-size: 11px;
}

.compact-select-trigger.variant-inline-pill:hover,
.compact-select-trigger.variant-inline-pill.is-open {
  background: rgba(var(--app-primary-rgb, 144, 77, 0), 0.08);
  color: var(--app-primary, #904d00);
  box-shadow: inset 0 0 0 1px rgba(var(--app-primary-rgb), 0.18);
}

.compact-select-trigger.variant-inline-pill .compact-select-value,
.compact-select-trigger.variant-inline-pill .compact-select-item-main {
  gap: 6px;
}

.compact-select-trigger.variant-inline-pill .compact-select-dot {
  width: 6px;
  height: 6px;
}

.compact-select-trigger.variant-inline-pill .compact-select-arrow {
  font-size: 11px;
}

.compact-select-value,
.compact-select-item-main {
  gap: 8px;
  min-width: 0;
}

.compact-select-value span,
.compact-select-item-main span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-select-arrow {
  color: var(--app-text-muted, #758393);
  font-size: 12px;
  transition: transform 0.2s ease;
}

.compact-select-trigger.is-open .compact-select-arrow {
  transform: rotate(180deg);
}

.compact-select-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
}

.tone-primary {
  background: var(--el-color-primary, #409eff);
}

.tone-success {
  background: var(--el-color-success, #67c23a);
}

.tone-warning {
  background: var(--el-color-warning, #e6a23c);
}

.tone-danger {
  background: var(--el-color-danger, #f56c6c);
}

.tone-info {
  background: var(--el-color-info, #909399);
}

.tone-accent {
  background: #8b5cf6;
}

.compact-select-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.compact-select-item {
  width: 100%;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-text, #191c1d);
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.compact-select-item:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}

.compact-select-item.active {
  background: rgba(var(--app-primary-rgb, 144, 77, 0), 0.06);
  color: var(--app-primary, #904d00);
  font-weight: 600;
}

.compact-select-check {
  color: var(--app-primary, #904d00);
  font-size: 13px;
  font-weight: 700;
}
</style>
