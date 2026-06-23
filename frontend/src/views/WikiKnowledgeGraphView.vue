<template>
  <div class="wiki-graph-page">
    <el-card class="page-card" shadow="never">
      <div class="page-header">
        <div>
          <el-button text @click="goBack">返回空间</el-button>
          <div class="page-title">{{ graph?.spaceName || 'Wiki 知识图谱' }}</div>
          <div class="page-subtitle">
            简单展示 Wiki 页面和目录之间的关系
          </div>
        </div>
        <el-space wrap>
          <el-select v-model="layoutMode" style="width: 150px">
            <el-option v-for="item in layoutOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-button :loading="loading" @click="loadGraph">刷新</el-button>
        </el-space>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">页面节点</span>
          <strong>{{ pageNodeCount }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">关系连线</span>
          <strong>{{ edgeCount }}</strong>
        </div>
      </div>
    </el-card>

    <el-card class="page-card graph-card" shadow="never">
      <template #header>
        <div class="section-header">
          <span>页面关系图</span>
        </div>
      </template>

      <div v-if="!graph" class="graph-empty">
        <el-empty description="暂无数据" />
      </div>
      <div v-else-if="graph.nodes.length === 0" class="graph-empty">
        <el-empty description="该空间暂无页面" />
      </div>
      <div v-else class="graph-container" ref="graphContainerRef"></div>
    </el-card>

    <div class="content-grid">
      <el-card class="page-card" shadow="never">
        <template #header>
          <div class="section-header">
            <span>页面列表</span>
            <el-tag type="info">{{ graph?.nodes.length || 0 }}</el-tag>
          </div>
        </template>

        <el-table v-loading="loading" :data="tableData" height="420" @row-click="handleRowClick">
          <el-table-column prop="name" label="页面名称" min-width="200" show-overflow-tooltip />
          <el-table-column label="类型" width="100">
            <template #default="{ row }">{{ row.type === 'WIKI_PAGE' ? '页面' : '目录' }}</template>
          </el-table-column>
          <el-table-column label="关联度" width="100">
            <template #default="{ row }">{{ row.degree }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { getWikiSpaceKnowledgeGraph } from '@/api/platform'
import type { WikiSpaceKnowledgeGraphItem } from '@/types/platform'

type LayoutMode = 'force' | 'hierarchical' | 'radial'

const layoutOptions: Array<{ label: string; value: LayoutMode }> = [
  { label: '力导向布局', value: 'force' },
  { label: '层次布局', value: 'hierarchical' },
  { label: '辐射布局', value: 'radial' }
]

const route = useRoute()
const router = useRouter()
const spaceId = Number(route.params.spaceId)

const graph = ref<WikiSpaceKnowledgeGraphItem | null>(null)
const loading = ref(false)
const layoutMode = ref<LayoutMode>('force')
const graphContainerRef = ref<HTMLDivElement | null>(null)

const loadGraph = async () => {
  loading.value = true
  try {
    graph.value = await getWikiSpaceKnowledgeGraph(spaceId)
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.push({ name: 'wiki-space', params: { spaceId } })
}

// 计算每个节点的连接数
const degreeMap = computed(() => {
  const map = new Map<number, number>()
  graph.value?.edges.forEach(edge => {
    map.set(edge.fromNodeId, (map.get(edge.fromNodeId) || 0) + 1)
    map.set(edge.toNodeId, (map.get(edge.toNodeId) || 0) + 1)
  })
  return map
})

// 简化的节点数据
const tableData = computed(() => {
  return (graph.value?.nodes || []).map(node => ({
    ...node,
    type: node.nodeType === 'WIKI_PAGE' ? '页面' : '目录',
    degree: degreeMap.value.get(node.id) || 0
  }))
})

const pageNodeCount = computed(() => (graph.value?.nodes || []).filter(n => n.nodeType === 'WIKI_PAGE').length)
const edgeCount = computed(() => (graph.value?.edges || []).length)

const handleRowClick = (row: any) => {
  // 简单交互：点击行选中对应节点（在图中高亮）
  ElMessage.info(`选中：${row.name}`)
}

onMounted(() => {
  if (Number.isNaN(spaceId) || spaceId <= 0) {
    ElMessage.error('空间参数不正确')
    goBack()
    return
  }
  loadGraph()
})
</script>

<style scoped>
.wiki-graph-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #17324d;
}

.page-subtitle {
  color: #6b7f91;
  font-size: 13px;
  margin-top: 2px;
}

.stats-grid {
  display: flex;
  gap: 16px;
  margin-top: 18px;
}

.stat-card {
  padding: 14px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f8fbff 0%, #eef4fb 100%);
  border: 1px solid #dbe7f3;
  min-width: 140px;
}

.stat-label {
  display: block;
  color: #6b7f91;
  font-size: 13px;
  margin-bottom: 4px;
}

.stat-card strong {
  font-size: 24px;
  font-weight: 600;
  color: #17324d;
}

.graph-container {
  width: 100%;
  height: 600px;
  border-radius: 16px;
  border: 1px solid rgba(191, 219, 254, 0.5);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.graph-empty {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.section-header {
  font-size: 14px;
  font-weight: 600;
  color: #385166;
}
</style>
