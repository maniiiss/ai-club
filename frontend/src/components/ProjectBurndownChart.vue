<template>
  <div class="burndown-card">
    <div class="burndown-header">
      <div>
        <div class="burndown-title">项目燃尽图</div>
        <div class="burndown-subtitle">{{ rangeText }}</div>
      </div>
      <div class="burndown-stats">
        <span>总工作项 {{ data?.totalWorkItemCount ?? 0 }}</span>
        <span>已完成 {{ data?.completedWorkItemCount ?? 0 }}</span>
        <span>剩余 {{ data?.remainingWorkItemCount ?? 0 }}</span>
      </div>
    </div>

    <div v-if="hasChartData" class="burndown-chart">
      <svg :viewBox="`0 0 ${width} ${height}`" class="chart-svg" preserveAspectRatio="none">
        <line :x1="paddingLeft" :y1="height - paddingBottom" :x2="width - paddingRight" :y2="height - paddingBottom" class="axis-line" />
        <line :x1="paddingLeft" :y1="paddingTop" :x2="paddingLeft" :y2="height - paddingBottom" class="axis-line" />

        <line
          v-for="tick in yTicks"
          :key="`grid-${tick.value}`"
          :x1="paddingLeft"
          :y1="tick.y"
          :x2="width - paddingRight"
          :y2="tick.y"
          class="grid-line"
        />

        <polyline :points="idealPoints" class="ideal-line" />
        <polyline :points="actualPoints" class="actual-line" />

        <circle
          v-for="point in actualPointList"
          :key="`${point.x}-${point.y}`"
          :cx="point.x"
          :cy="point.y"
          r="2.8"
          class="actual-point"
        />
      </svg>

      <div class="x-axis-labels">
        <span>{{ firstLabel }}</span>
        <span>{{ middleLabel }}</span>
        <span>{{ lastLabel }}</span>
      </div>

      <div class="chart-legend">
        <span><i class="legend-dot ideal"></i>理想剩余</span>
        <span><i class="legend-dot actual"></i>实际剩余</span>
      </div>
    </div>

    <div v-else class="burndown-empty">暂无足够数据生成燃尽图</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectBurndownItem } from '@/types/platform'

const props = defineProps<{
  data: ProjectBurndownItem | null
}>()

const width = 760
const height = 176
const paddingLeft = 36
const paddingRight = 12
const paddingTop = 18
const paddingBottom = 26

const hasChartData = computed(() => (props.data?.labels.length ?? 0) > 0)
const maxValue = computed(() => {
  const values = [...(props.data?.idealRemaining ?? []), ...(props.data?.actualRemaining ?? [])]
  const max = values.length ? Math.max(...values) : 0
  return Math.max(max, 1)
})

const rangeText = computed(() => {
  if (!props.data) return '暂无数据'
  return `${props.data.startDate} 至 ${props.data.endDate}`
})

const getX = (index: number, total: number) => {
  if (total <= 1) return paddingLeft
  const chartWidth = width - paddingLeft - paddingRight
  return paddingLeft + (chartWidth * index) / (total - 1)
}

const getY = (value: number) => {
  const chartHeight = height - paddingTop - paddingBottom
  return paddingTop + chartHeight * (1 - value / maxValue.value)
}

const buildPoints = (series: number[]) => series.map((value, index) => `${getX(index, series.length)},${getY(value)}`).join(' ')

const actualPointList = computed(() =>
  (props.data?.actualRemaining ?? []).map((value, index, list) => ({
    x: getX(index, list.length),
    y: getY(value)
  }))
)

const idealPoints = computed(() => buildPoints(props.data?.idealRemaining ?? []))
const actualPoints = computed(() => buildPoints(props.data?.actualRemaining ?? []))

const yTicks = computed(() => {
  const values = [maxValue.value, Math.round(maxValue.value / 2), 0]
  return values.map((value) => ({ value, y: getY(value) }))
})

const firstLabel = computed(() => props.data?.labels[0] ?? '-')
const middleLabel = computed(() => {
  const labels = props.data?.labels ?? []
  if (!labels.length) return '-'
  return labels[Math.floor((labels.length - 1) / 2)]
})
const lastLabel = computed(() => {
  const labels = props.data?.labels ?? []
  return labels.length ? labels[labels.length - 1] : '-'
})
</script>

<style scoped>
.burndown-card {
  width: 100%;
  min-height: 132px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  box-sizing: border-box;
}

.burndown-header,
.burndown-stats,
.x-axis-labels,
.chart-legend {
  display: flex;
  align-items: center;
}

.burndown-header {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.burndown-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.burndown-subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.burndown-stats {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
  font-size: 12px;
  color: #475569;
}

.burndown-chart {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chart-svg {
  width: 100%;
  height: 176px;
}

.axis-line {
  stroke: #cbd5e1;
  stroke-width: 1;
}

.grid-line {
  stroke: #e5edf6;
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.ideal-line,
.actual-line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}

.ideal-line {
  stroke: #94a3b8;
}

.actual-line,
.actual-point {
  stroke: #409eff;
  fill: #409eff;
}

.x-axis-labels,
.chart-legend {
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.chart-legend {
  justify-content: flex-start;
  gap: 18px;
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 999px;
}

.legend-dot.ideal {
  background: #94a3b8;
}

.legend-dot.actual {
  background: #409eff;
}

.burndown-empty {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

@media (max-width: 1200px) {
  .burndown-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .burndown-stats {
    justify-content: flex-start;
  }
}
</style>
