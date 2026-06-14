import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import AppLayout from '@/layout/AppLayout.vue'
import DashboardView from '@/views/DashboardView.vue'
import ProjectView from '@/views/ProjectView.vue'
import AgentView from '@/views/AgentView.vue'
import ExecutionTaskView from '@/views/ExecutionTaskView.vue'
import ExecutionTaskDetailView from '@/views/ExecutionTaskDetailView.vue'
import SelfUpgradeCenterView from '@/views/SelfUpgradeCenterView.vue'
import TestPlanView from '@/views/TestPlanView.vue'
import TestPlanDetailView from '@/views/TestPlanDetailView.vue'
import GitlabView from '@/views/GitlabView.vue'
const GitlabCodeStructureView = () => import('@/views/GitlabCodeStructureView.vue')
import JenkinsServerView from '@/views/JenkinsServerView.vue'
import PipelineBindingView from '@/views/PipelineBindingView.vue'
const ServerManagementView = () => import('@/views/ServerManagementView.vue')
const ServerDetailView = () => import('@/views/ServerDetailView.vue')
const AiClubPipelineDetailView = () => import('@/views/AiClubPipelineDetailView.vue')
const ObservabilityProjectListView = () => import('@/views/ObservabilityProjectListView.vue')
const ObservabilityProjectDetailView = () => import('@/views/ObservabilityProjectDetailView.vue')
import ModelView from '@/views/ModelView.vue'
const ApiGroupHomeView = () => import('@/views/ApiGroupHomeView.vue')
const ProjectApiManagementView = () => import('@/views/ProjectApiManagementView.vue')
import LoginView from '@/views/LoginView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import UserView from '@/views/UserView.vue'
import RoleView from '@/views/RoleView.vue'
import PermissionView from '@/views/PermissionView.vue'
import ToolConfigView from '@/views/ToolConfigView.vue'
import EnvironmentVariableManagementView from '@/views/EnvironmentVariableManagementView.vue'
import ShortcutEntryManagementView from '@/views/ShortcutEntryManagementView.vue'
import RepositoryScanRulesetView from '@/views/RepositoryScanRulesetView.vue'
import OperationLogView from '@/views/OperationLogView.vue'
import IterationView from '@/views/IterationView.vue'
import ProfileView from '@/views/ProfileView.vue'
import GitlabOauthCallbackView from '@/views/GitlabOauthCallbackView.vue'
import WikiHomeView from '@/views/WikiHomeView.vue'
import WikiSpaceView from '@/views/WikiSpaceView.vue'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
const PrReviewStatsView = () => import('@/views/PrReviewStatsView.vue')

const APP_TITLE = 'AI代理工程管理平台'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { requiresAuth: false, title: '登录' }
    },
    {
      path: '/403',
      name: 'forbidden',
      component: ForbiddenView,
      meta: { requiresAuth: false, title: '无权限' }
    },
    {
      path: '/gitlab/bindings/:id/code-structure',
      name: 'gitlab-binding-code-structure',
      component: GitlabCodeStructureView,
      meta: { requiresAuth: true, title: '代码结构', permission: 'gitlab:view' }
    },
    {
      path: '/',
      component: AppLayout,
      redirect: '/dashboard',
      meta: { requiresAuth: true },
      children: [
        { path: 'dashboard', name: 'dashboard', component: DashboardView, meta: { title: '首页看板', permission: 'dashboard:view' } },
        { path: 'projects', name: 'projects', component: ProjectView, meta: { title: '项目管理', permission: 'project:view' } },
        {
          path: 'apis',
          name: 'api-groups',
          component: ApiGroupHomeView,
          meta: { title: 'API 项目', permission: 'api:view' },
          beforeEnter: (to) => {
            const projectId = Number(to.query.projectId ?? '')
            if (Number.isFinite(projectId) && projectId > 0) {
              return { name: 'api-project-detail', params: { projectId: String(projectId) } }
            }
            return true
          }
        },
        { path: 'apis/projects/:projectId', name: 'api-project-detail', component: ProjectApiManagementView, meta: { title: 'API 工作台', permission: 'api:view', activeMenu: '/apis' } },
        { path: 'wiki', name: 'wiki-home', component: WikiHomeView, meta: { title: 'Wiki 中心', permission: 'wiki:view' } },
        { path: 'wiki/spaces/:spaceId', name: 'wiki-space', component: WikiSpaceView, meta: { title: 'Wiki 空间', permission: 'wiki:view' } },
        { path: 'wiki/spaces/:spaceId/pages/:pageId', name: 'wiki-space-page', component: WikiSpaceView, meta: { title: 'Wiki 页面', permission: 'wiki:view' } },
        { path: 'projects/:projectId/iterations', name: 'project-iterations', component: IterationView, meta: { title: '迭代管理', permission: 'project:view' } },
        { path: 'projects/:projectId/knowledge-graph', redirect: (to) => ({ name: 'project-iterations', params: { projectId: to.params.projectId } }), meta: { requiresAuth: true, permission: 'project:view' } },
        { path: 'agents', name: 'agents', component: AgentView, meta: { title: '智能体管理', permission: 'agent:view' } },
        { path: 'tasks', name: 'tasks', component: ExecutionTaskView, meta: { title: '执行中心', permission: 'task:view' } },
        { path: 'tasks/:executionTaskId', name: 'execution-task-detail', component: ExecutionTaskDetailView, meta: { title: '执行详情', permission: 'task:view', activeMenu: '/tasks' } },
        { path: 'self-upgrade', name: 'self-upgrade', component: SelfUpgradeCenterView, meta: { title: '自升级中心', permission: 'self-upgrade:view' } },
        { path: 'tests', name: 'tests', component: TestPlanView, meta: { title: '测试管理', permission: 'test:view' } },
        { path: 'tests/:planId', name: 'test-plan-detail', component: TestPlanDetailView, meta: { title: '测试计划详情', permission: 'test:view', activeMenu: '/tests' } },
        { path: 'models', name: 'models', component: ModelView, meta: { title: '模型管理', permission: 'model:view' } },
        { path: 'gitlab', name: 'gitlab', component: GitlabView, meta: { title: '代码仓库管理', permission: 'gitlab:view' } },
        { path: 'servers', name: 'servers', component: ServerManagementView, meta: { title: '服务器管理', permission: 'server:view', requiresServerManagement: true } },
        { path: 'servers/:serverId', name: 'server-detail', component: ServerDetailView, meta: { title: '服务器详情', permission: 'server:view', activeMenu: '/servers', requiresServerManagement: true } },
        { path: 'cicd', redirect: { name: 'cicd-pipelines' } },
        { path: 'cicd/jenkins-servers', name: 'cicd-servers', component: JenkinsServerView, meta: { title: 'Jenkins 服务管理', permission: 'cicd:view' } },
        { path: 'cicd/pipeline-bindings', name: 'cicd-pipelines', component: PipelineBindingView, meta: { title: '流水线中心', permission: 'cicd:view' } },
        { path: 'cicd/pipelines/:entryType/:entryId', name: 'cicd-pipeline-detail', component: AiClubPipelineDetailView, meta: { title: '流水线详情', permission: 'cicd:view', activeMenu: '/cicd/pipeline-bindings' } },
        { path: 'observability', name: 'observability-projects', component: ObservabilityProjectListView, meta: { title: '可观测性中心', permission: 'observability:view' } },
        { path: 'observability/projects/:projectId', name: 'observability-project-detail', component: ObservabilityProjectDetailView, meta: { title: '项目观测详情', permission: 'observability:view', activeMenu: '/observability' } },
        { path: 'profile', name: 'profile', component: ProfileView, meta: { title: '个人中心' } },
        { path: 'profile/gitlab-callback', name: 'profile-gitlab-callback', component: GitlabOauthCallbackView, meta: { title: 'GitLab 授权回调' } },
        { path: 'users', name: 'users', component: UserView, meta: { title: '用户管理', permission: 'system:user:view' } },
        { path: 'roles', name: 'roles', component: RoleView, meta: { title: '角色管理', permission: 'system:role:view' } },
        { path: 'permissions', name: 'permissions', component: PermissionView, meta: { title: '功能管理', permission: 'system:permission:view' } },
        { path: 'tools', name: 'tools', component: ToolConfigView, meta: { title: '工具配置', permission: 'system:tool:view' } },
        { path: 'env-vars', name: 'env-vars', component: EnvironmentVariableManagementView, meta: { title: '环境变量管理', permission: 'system:env:view' } },
        { path: 'shortcuts', name: 'shortcuts', component: ShortcutEntryManagementView, meta: { title: '快捷入口管理', permission: 'system:shortcut:view' } },
        { path: 'pr-review-stats', name: 'pr-review-stats', component: PrReviewStatsView, meta: { title: 'PR评审统计', permission: 'system:pr-review:view' } },
        { path: 'scan-rulesets', name: 'scan-rulesets', component: RepositoryScanRulesetView, meta: { title: '扫描规则集', permission: 'scan:ruleset:view' } },
        { path: 'operation-logs', name: 'operation-logs', component: OperationLogView, meta: { title: '操作日志', permission: 'system:operation-log:view' } }
      ]
    }
  ]
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const appStore = useAppStore()
  const requiresAuth = to.meta.requiresAuth !== false

  if (!requiresAuth) {
    if (to.path === '/login' && authStore.isLoggedIn) {
      await authStore.restoreSession()
      if (authStore.isLoggedIn) {
        return '/dashboard'
      }
    }
    return true
  }

  const profile = await authStore.restoreSession()
  if (!authStore.isLoggedIn || !profile) {
    return {
      path: '/login',
      query: to.fullPath === '/' ? undefined : { redirect: to.fullPath }
    }
  }

  const permission = to.meta.permission as string | string[] | undefined
  if (permission && !authStore.hasPermission(permission)) {
    ElMessage.warning('当前账号没有访问该页面的权限')
    return '/403'
  }

  try {
    await appStore.refreshRuntimeCapabilities()
  } catch {
    // 忽略运行时能力拉取失败，默认沿用上一次能力状态或回退值。
  }

  if (to.meta.requiresServerManagement && !appStore.serverManagementEnabled) {
    ElMessage.warning('服务器管理模块当前已关闭')
    return '/dashboard'
  }

  return true
})

router.afterEach((to) => {
  const routeTitle = to.meta.title as string | undefined
  document.title = routeTitle ? `${routeTitle} - ${APP_TITLE}` : APP_TITLE
})

export default router
