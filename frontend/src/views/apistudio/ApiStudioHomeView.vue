<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Connection, RefreshRight, Search } from '@element-plus/icons-vue'
import { listProjectOptions } from '@/api/platform'
import type { ProjectItem } from '@/types/platform'

// 原生 API 工作台 - 项目入口页。
// 模仿 ApiGroupHomeView / ProjectView 的 management-list-* 设计系统，
// 让原生工作台入口与平台其他模块在视觉与交互上保持一致。

const router = useRouter()
const projects = ref<ProjectItem[]>([])
const keyword = ref('')
const loading = ref(false)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return projects.value
  return projects.value.filter((p) => {
    const owner = (p as ProjectItem & { owner?: string }).owner ?? ''
    return (
      (p.name ?? '').toLowerCase().includes(kw) ||
      ((p as ProjectItem & { description?: string }).description ?? '').toLowerCase().includes(kw) ||
      owner.toLowerCase().includes(kw) ||
      String(p.id).includes(kw)
    )
  })
})

const loadProjects = async () => {
  loading.value = true
  try {
    projects.value = await listProjectOptions()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error('加载项目列表失败: ' + msg)
  } finally {
    loading.value = false
  }
}

const handleReset = () => {
  keyword.value = ''
}

const openProject = (project: ProjectItem) => {
  router.push({ name: 'api-studio-workbench', params: { projectId: project.id } })
}

const ownerName = (project: ProjectItem) => {
  const owner = (project as ProjectItem & { owner?: string }).owner
  return owner && owner.trim() ? owner : '未设置'
}

const projectStatusTone = (status?: string) => {
  switch (status) {
    case 'RUNNING':
    case 'IN_PROGRESS':
      return 'success'
    case 'DELAYED':
    case 'BLOCKED':
      return 'danger'
    case 'ON_HOLD':
    case 'PAUSED':
      return 'warning'
    case 'COMPLETED':
    case 'CLOSED':
      return 'neutral'
    default:
      return 'info'
  }
}

const projectStatusLabel = (status?: string) => {
  if (!status) return '未设置'
  const map: Record<string, string> = {
    RUNNING: '运行中',
    IN_PROGRESS: '推进中',
    DELAYED: '已延期',
    BLOCKED: '阻塞',
    ON_HOLD: '暂停',
    PAUSED: '暂停',
    COMPLETED: '已完成',
    CLOSED: '已关闭'
  }
  return map[status] ?? status
}

onMounted(loadProjects)
</script>

<template>
  <div class="api-studio-home-page">
    <section class="management-list-toolbar api-studio-home-toolbar">
      <div class="management-list-toolbar-main">
        <div class="management-list-search-shell">
          <el-icon class="management-list-search-icon"><Search /></el-icon>
          <input
            v-model="keyword"
            class="management-list-search-input"
            type="text"
            placeholder="搜索项目名、负责人或描述..."
          />
        </div>

        <span class="management-list-toolbar-divider" aria-hidden="true"></span>

        <button class="management-list-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
        <button class="management-list-toolbar-button" type="button" @click="loadProjects">
          <el-icon><Connection /></el-icon>
          <span>刷新列表</span>
        </button>
      </div>
    </section>

    <section
      class="api-studio-home-grid"
      :class="{ 'api-studio-home-grid-empty': !loading && !filtered.length }"
      v-loading="loading"
    >
      <article
        v-for="project in filtered"
        :key="project.id"
        class="api-studio-home-card"
        @click="openProject(project)"
      >
        <header class="api-studio-home-card-head">
          <div>
            <span class="api-studio-home-kicker">API 工作台</span>
            <h2>{{ project.name || '未命名项目' }}</h2>
          </div>
          <div class="api-studio-home-tag-group">
            <span class="management-list-pill" :class="projectStatusTone((project as any).status)">
              {{ projectStatusLabel((project as any).status) }}
            </span>
          </div>
        </header>

        <div class="api-studio-home-meta-line">
          <span>项目 ID：{{ project.id }}</span>
          <span>负责人：{{ ownerName(project) }}</span>
        </div>

        <p class="api-studio-home-desc">
          {{ (project as any).description?.trim() || '点击进入项目级 API 工作台，管理目录、API、环境、调试与版本。' }}
        </p>

        <div class="api-studio-home-chip-list">
          <span class="management-list-chip">任务 {{ (project as any).taskCount ?? 0 }}</span>
          <span class="management-list-chip">仓库 {{ (project as any).repoCount ?? 0 }}</span>
          <span class="management-list-chip">智能体 {{ (project as any).agentCount ?? 0 }}</span>
        </div>

        <div class="api-studio-home-card-actions">
          <button class="management-list-toolbar-button" type="button" @click.stop="openProject(project)">
            <el-icon><Connection /></el-icon>
            <span>进入工作台</span>
          </button>
        </div>
      </article>

      <el-empty
        v-if="!loading && !filtered.length"
        description="暂无可访问的项目"
      />
    </section>
  </div>
</template>

<style scoped>
.api-studio-home-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 100%;
}

.api-studio-home-toolbar {
  margin-bottom: 0;
}

.api-studio-home-grid {
  --api-studio-card-width: 360px;
  --api-studio-card-height: 250px;

  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--api-studio-card-width)), var(--api-studio-card-width)));
  grid-auto-rows: var(--api-studio-card-height);
  gap: 14px;
  align-items: stretch;
}

.api-studio-home-grid-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 300px);
}

.api-studio-home-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  height: 100%;
  padding: 18px;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 8px;
  cursor: pointer;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(247, 250, 252, 0.92)),
    radial-gradient(circle at 88% 0%, rgba(42, 157, 143, 0.12), transparent 34%);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.api-studio-home-card:hover {
  transform: translateY(-3px);
  border-color: rgba(144, 77, 0, 0.4);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
}

.api-studio-home-card-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  align-items: flex-start;
}

.api-studio-home-card-head > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.api-studio-home-kicker {
  width: fit-content;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(144, 77, 0, 0.08);
  color: var(--app-primary);
  font-family: var(--app-font-heading);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.api-studio-home-card-head h2 {
  margin: 0;
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 800;
  color: var(--app-text);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.api-studio-home-tag-group {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.api-studio-home-meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--app-text-soft);
}

.api-studio-home-desc {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-soft);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.api-studio-home-chip-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.api-studio-home-card-actions {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
}
</style>
