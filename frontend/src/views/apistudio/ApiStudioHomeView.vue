<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { listProjectOptions } from '@/api/platform'
import type { ProjectItem } from '@/types/platform'

// 原生 API 工作台 - 项目入口页。
// 展示用户可见的平台项目卡片，点击进入项目级 API 工作台。
// 取代旧的 Yaade iframe 入口。

const router = useRouter()
const projects = ref<ProjectItem[]>([])
const keyword = ref('')
const loading = ref(false)

const filtered = computed(() => {
  if (!keyword.value.trim()) return projects.value
  const kw = keyword.value.toLowerCase()
  return projects.value.filter(
    (p) =>
      (p.name ?? '').toLowerCase().includes(kw) ||
      (p.description ?? '').toLowerCase().includes(kw) ||
      String(p.id).includes(kw)
  )
})

const loadProjects = async () => {
  loading.value = true
  try {
    projects.value = await listProjectOptions()
  } catch (e: any) {
    ElMessage.error('加载项目列表失败: ' + (e?.message ?? e))
  } finally {
    loading.value = false
  }
}

const openProject = (project: ProjectItem) => {
  router.push({ name: 'api-studio-workbench', params: { projectId: project.id } })
}

onMounted(loadProjects)
</script>

<template>
  <div class="api-studio-home" v-loading="loading">
    <div class="header">
      <div>
        <h2>API 管理</h2>
        <p class="subtitle">原生 API 工作台 · 选择项目进入接口资产、调试与版本管理</p>
      </div>
      <el-input v-model="keyword" placeholder="搜索项目名称或描述" clearable style="width: 320px" />
    </div>

    <el-empty v-if="!loading && filtered.length === 0" description="暂无可访问的项目" />

    <div v-else class="grid">
      <div
        v-for="project in filtered"
        :key="project.id"
        class="card"
        @click="openProject(project)"
      >
        <div class="card-title">{{ project.name || '未命名项目' }}</div>
        <div class="card-meta">
          <span>项目 ID：{{ project.id }}</span>
          <span v-if="project.status">状态：{{ project.status }}</span>
        </div>
        <div class="card-desc">{{ project.description || '点击进入工作台' }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.api-studio-home {
  padding: 24px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.header h2 {
  margin: 0;
}

.subtitle {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.card {
  padding: 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: all 0.2s;
}

.card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  transform: translateY(-2px);
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.card-meta {
  display: flex;
  gap: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-bottom: 8px;
}

.card-desc {
  color: var(--el-text-color-regular);
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
