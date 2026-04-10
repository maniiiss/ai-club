<template>
  <el-popover
    v-model:visible="visible"
    trigger="click"
    placement="bottom-start"
    :width="popoverWidth"
    popper-class="compact-select-popper"
  >
    <template #reference>
      <button class="compact-select-trigger" :class="[sizeClass, { disabled }]" type="button" :disabled="disabled">
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
import { computed, ref } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'

type SelectValue = string | number
type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info'

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
}>(), {
  placeholder: '请选择',
  disabled: false,
  popoverWidth: 180,
  size: 'small'
})

const emit = defineEmits<{
  'update:modelValue': [value: SelectValue]
  change: [value: SelectValue]
}>()

const visible = ref(false)

const selectedOption = computed(() => props.options.find((item) => item.value === props.modelValue))
const selectedToneClass = computed(() => toneClass(selectedOption.value?.tone))
const sizeClass = computed(() => (props.size === 'default' ? 'is-default' : 'is-small'))

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
  gap: 10px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: rgba(243, 244, 245, 0.92);
  color: var(--app-text, #191c1d);
  cursor: pointer;
  transition: transform 0.18s ease, background-color 0.18s ease, color 0.18s ease;
}

.compact-select-trigger.is-small {
  min-height: 34px;
  font-size: 12px;
}

.compact-select-trigger.is-default {
  min-height: 38px;
  font-size: 13px;
}

.compact-select-trigger:hover {
  background: rgba(255, 220, 195, 0.72);
  color: var(--app-primary, #904d00);
  transform: translateY(-1px);
}

.compact-select-trigger.disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
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
}

.compact-select-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
}

.tone-primary {
  background: #3b82f6;
}

.tone-success {
  background: #22c55e;
}

.tone-warning {
  background: #f59e0b;
}

.tone-danger {
  background: #ef4444;
}

.tone-info {
  background: #94a3b8;
}

.compact-select-menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.compact-select-item {
  width: 100%;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--app-text, #191c1d);
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.compact-select-item:hover {
  background: rgba(243, 244, 245, 0.94);
  transform: translateY(-1px);
}

.compact-select-item.active {
  background: rgba(255, 220, 195, 0.76);
}

.compact-select-check {
  color: var(--app-primary, #904d00);
  font-size: 12px;
  font-weight: 700;
}
</style>
