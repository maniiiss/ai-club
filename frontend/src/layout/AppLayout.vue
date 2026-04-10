<template>
  <el-container class="layout-shell" :class="{ collapsed: effectiveSidebarCollapsed, 'iteration-shell': isIterationWorkspaceRoute, 'mobile-shell': isMobileViewport && !isIterationWorkspaceRoute }">
    <el-aside v-if="!isIterationWorkspaceRoute && !isMobileViewport" :width="asideWidth" class="layout-aside">
      <div class="aside-head" :class="{ compact: effectiveSidebarCollapsed }">
        <div class="brand-mark" aria-hidden="true">
          <svg class="brand-logo-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="brandLogoGradient" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                <stop style="stop-color: var(--app-primary-container)" />
                <stop offset="1" style="stop-color: var(--app-primary)" />
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#brandLogoGradient)" />
            <path
              d="M18.8 20.7L26.8 26.9M16.2 35.6L26.4 34.3M27.8 13.8L31.5 26.8M28.5 49.3L30.4 38.6"
              stroke="white"
              stroke-width="2.5"
              stroke-linecap="round"
            />
            <circle cx="31.5" cy="33.5" r="5" fill="#fff" fill-opacity="0.24" stroke="white" stroke-width="2.5" />
            <circle cx="13" cy="36" r="3.4" fill="url(#brandLogoGradient)" stroke="white" stroke-width="2.5" />
            <circle cx="16.5" cy="20" r="3.4" fill="url(#brandLogoGradient)" stroke="white" stroke-width="2.5" />
            <circle cx="27" cy="10.5" r="3.4" fill="url(#brandLogoGradient)" stroke="white" stroke-width="2.5" />
            <circle cx="28" cy="53" r="3.4" fill="url(#brandLogoGradient)" stroke="white" stroke-width="2.5" />
            <path
              d="M35.2 18.3C34.5 16.4 35.9 14.4 38 14.4H38.5C39.8 14.4 41 15.2 41.5 16.4L48.6 48.2C49.1 50.4 46.2 51.8 44.8 50L39 42.7H25.5L21.4 49.8C20.2 51.8 17 50.8 17.2 48.4C17.3 47.4 17.8 46.5 18.6 45.9L25.7 40.4L26.9 36.2L35.2 18.3ZM33.7 29.7L31.1 36.9H36.7L33.7 29.7Z"
              fill="white"
            />
            <rect x="50.2" y="14.2" width="6.6" height="36.2" rx="3.3" fill="white" />
          </svg>
        </div>

        <div v-if="!effectiveSidebarCollapsed" class="brand-copy">
          <div class="brand-title">智能协作工作台</div>
          <div class="brand-subtitle">研发管理中枢</div>
        </div>

        <div v-else class="brand-copy compact-copy">
          <div class="brand-title-mini">智能</div>
          <div class="brand-subtitle-mini">工作台</div>
        </div>
      </div>

      <el-scrollbar class="aside-scroll">
        <nav class="sidebar-nav" aria-label="主导航">
          <button
            v-for="item in visiblePrimaryMenus"
            :key="item.path"
            class="sidebar-menu-button"
            :class="{ active: isMenuActive(item), compact: effectiveSidebarCollapsed }"
            :title="item.label"
            type="button"
            @click="handleNavigate(item.path)"
          >
            <span class="menu-active-bar" aria-hidden="true"></span>
            <el-icon class="menu-icon"><component :is="item.icon" /></el-icon>
            <span v-if="!effectiveSidebarCollapsed" class="menu-label">{{ item.label }}</span>
            <span v-else class="menu-short-label">{{ item.shortLabel }}</span>
          </button>

          <div v-if="visibleIntegrationMenus.length && !effectiveSidebarCollapsed" class="system-menu-group">
            <button
              class="sidebar-menu-button"
              :class="{ active: isIntegrationSectionActive }"
              type="button"
              @click="integrationMenuExpanded = !integrationMenuExpanded"
            >
              <span class="menu-active-bar" aria-hidden="true"></span>
              <el-icon class="menu-icon"><DataAnalysis /></el-icon>
              <span class="menu-label">集成</span>
              <el-icon class="menu-arrow">
                <ArrowDown v-if="integrationMenuExpanded" />
                <ArrowRight v-else />
              </el-icon>
            </button>

            <div v-show="integrationMenuExpanded" class="system-submenu">
              <button
                v-for="item in visibleIntegrationMenus"
                :key="item.path"
                class="system-submenu-button"
                :class="{ active: isMenuActive(item) }"
                type="button"
                @click="handleNavigate(item.path)"
              >
                <el-icon><component :is="item.icon" /></el-icon>
                <span>{{ item.label }}</span>
              </button>
            </div>
          </div>

          <el-popover
            v-if="visibleIntegrationMenus.length && effectiveSidebarCollapsed"
            trigger="click"
            placement="right-start"
            :show-arrow="false"
            :width="220"
            popper-class="sidebar-system-popper"
          >
            <template #reference>
              <button
                class="sidebar-menu-button compact"
                :class="{ active: isIntegrationSectionActive }"
                title="集成"
                type="button"
              >
                <span class="menu-active-bar" aria-hidden="true"></span>
                <el-icon class="menu-icon"><DataAnalysis /></el-icon>
                <span class="menu-short-label">集成</span>
              </button>
            </template>

            <div class="system-popover-menu">
              <button
                v-for="item in visibleIntegrationMenus"
                :key="item.path"
                class="system-popover-button"
                :class="{ active: isMenuActive(item) }"
                type="button"
                @click="handleNavigate(item.path)"
              >
                <el-icon><component :is="item.icon" /></el-icon>
                <span>{{ item.label }}</span>
              </button>
            </div>
          </el-popover>

          <button
            v-for="item in visibleTrailingMenus"
            :key="item.path"
            class="sidebar-menu-button"
            :class="{ active: isMenuActive(item), compact: effectiveSidebarCollapsed }"
            :title="item.label"
            type="button"
            @click="handleNavigate(item.path)"
          >
            <span class="menu-active-bar" aria-hidden="true"></span>
            <el-icon class="menu-icon"><component :is="item.icon" /></el-icon>
            <span v-if="!effectiveSidebarCollapsed" class="menu-label">{{ item.label }}</span>
            <span v-else class="menu-short-label">{{ item.shortLabel }}</span>
          </button>

          <div v-if="visibleSystemMenus.length && !effectiveSidebarCollapsed" class="system-menu-group">
            <button
              class="sidebar-menu-button"
              :class="{ active: isSystemSectionActive }"
              type="button"
              @click="systemMenuExpanded = !systemMenuExpanded"
            >
              <span class="menu-active-bar" aria-hidden="true"></span>
              <el-icon class="menu-icon"><Setting /></el-icon>
              <span class="menu-label">系统设置</span>
              <el-icon class="menu-arrow">
                <ArrowDown v-if="systemMenuExpanded" />
                <ArrowRight v-else />
              </el-icon>
            </button>

            <div v-show="systemMenuExpanded" class="system-submenu">
              <button
                v-for="item in visibleSystemMenus"
                :key="item.path"
                class="system-submenu-button"
                :class="{ active: isMenuActive(item) }"
                type="button"
                @click="handleNavigate(item.path)"
              >
                <el-icon><component :is="item.icon" /></el-icon>
                <span>{{ item.label }}</span>
              </button>
            </div>
          </div>

          <el-popover
            v-if="visibleSystemMenus.length && effectiveSidebarCollapsed"
            trigger="click"
            placement="right-start"
            :show-arrow="false"
            :width="220"
            popper-class="sidebar-system-popper"
          >
            <template #reference>
              <button
                class="sidebar-menu-button compact"
                :class="{ active: isSystemSectionActive }"
                title="系统设置"
                type="button"
              >
                <span class="menu-active-bar" aria-hidden="true"></span>
                <el-icon class="menu-icon"><Setting /></el-icon>
                <span class="menu-short-label">设置</span>
              </button>
            </template>

            <div class="system-popover-menu">
              <button
                v-for="item in visibleSystemMenus"
                :key="item.path"
                class="system-popover-button"
                :class="{ active: isMenuActive(item) }"
                type="button"
                @click="handleNavigate(item.path)"
              >
                <el-icon><component :is="item.icon" /></el-icon>
                <span>{{ item.label }}</span>
              </button>
            </div>
          </el-popover>
        </nav>
      </el-scrollbar>

      <div v-if="!isMobileViewport" class="aside-footer" :class="{ compact: effectiveSidebarCollapsed }">
        <button
          class="aside-action-button"
          type="button"
          :title="appStore.sidebarCollapsed ? '展开导航' : '收起导航'"
          :aria-label="appStore.sidebarCollapsed ? '展开导航' : '收起导航'"
          @click="appStore.toggleSidebarCollapsed"
        >
          <el-icon>
            <Expand v-if="appStore.sidebarCollapsed" />
            <Fold v-else />
          </el-icon>
          <span v-if="!appStore.sidebarCollapsed">{{ appStore.sidebarCollapsed ? '展开导航' : '收起导航' }}</span>
        </button>
      </div>
    </el-aside>

    <el-container class="layout-main-shell" :class="{ 'mobile-main-shell': isMobileViewport && !isIterationWorkspaceRoute }">
      <el-header v-if="!isIterationWorkspaceRoute" class="layout-header">
        <div class="header-search-group">
          <h1 class="header-page-title">{{ pageTitle }}</h1>
          <div v-if="!isMobileViewport" class="header-search-shell" aria-hidden="true">
            <el-icon><Search /></el-icon>
            <span>{{ headerSearchHint }}</span>
          </div>
        </div>

        <div class="header-actions">
          <el-dropdown @command="handleCommand">
            <div class="header-profile-group">
              <button class="header-notification-button" type="button" aria-label="打开消息中心" @click.stop="handleOpenNotifications">
                <el-icon><Bell /></el-icon>
                <span v-if="notificationStore.unreadCount > 0" class="header-notification-dot"></span>
              </button>
              <span class="header-divider" aria-hidden="true"></span>
              <button class="user-trigger" type="button">
                <span class="user-meta">
                  <strong>{{ authStore.user?.nickname || authStore.user?.username || '当前用户' }}</strong>
                  <small>{{ authStore.user?.roleNames?.[0] || '协作成员' }}</small>
                </span>
                <span class="user-avatar">
                  <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="当前用户头像" class="user-avatar-image" />
                  <span v-else>{{ userInitial }}</span>
                </span>
              </button>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                <el-dropdown-item command="roles" disabled>
                  {{ authStore.user?.roleNames?.join(' / ') || '暂无角色' }}
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="layout-main" :class="{ 'dashboard-main': isDashboardRoute, 'iteration-main': isIterationWorkspaceRoute, 'mobile-main': isMobileViewport && !isIterationWorkspaceRoute }">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>

  <nav v-if="isMobileViewport && !isIterationWorkspaceRoute" class="mobile-bottom-nav" aria-label="手机端主导航">
    <button
      v-for="item in mobileBottomNavItems"
      :key="item.path"
      class="mobile-nav-button"
      :class="{ active: isMenuActive(item) }"
      type="button"
      @click="handleMobileNavigate(item.path)"
    >
      <el-icon class="mobile-nav-icon"><component :is="item.icon" /></el-icon>
      <span class="mobile-nav-label">{{ item.shortLabel }}</span>
    </button>
    <button
      class="mobile-nav-button"
      :class="{ active: isMobileMoreActive }"
      type="button"
      @click="mobileMoreDrawerVisible = true"
    >
      <el-icon class="mobile-nav-icon"><MoreFilled /></el-icon>
      <span class="mobile-nav-label">更多</span>
    </button>
  </nav>

  <el-drawer
    v-model="mobileMoreDrawerVisible"
    direction="btt"
    size="72%"
    :show-close="false"
    class="mobile-more-drawer"
  >
    <template #header>
      <div class="mobile-more-head">
        <div class="mobile-more-title">更多入口</div>
        <button class="mobile-more-close" type="button" @click="mobileMoreDrawerVisible = false">收起</button>
      </div>
    </template>

    <div class="mobile-more-panel">
      <section v-if="mobileWorkspaceMoreItems.length" class="mobile-more-section">
        <div class="mobile-more-section-title">工作区</div>
        <div class="mobile-more-list">
          <button
            v-for="item in mobileWorkspaceMoreItems"
            :key="item.path"
            class="mobile-more-item"
            :class="{ active: isMenuActive(item) }"
            type="button"
            @click="handleMobileNavigate(item.path)"
          >
            <el-icon class="mobile-more-item-icon"><component :is="item.icon" /></el-icon>
            <span class="mobile-more-item-label">{{ item.label }}</span>
          </button>
        </div>
      </section>

      <section v-if="mobileSystemMoreItems.length" class="mobile-more-section">
        <div class="mobile-more-section-title">系统设置</div>
        <div class="mobile-more-list">
          <button
            v-for="item in mobileSystemMoreItems"
            :key="item.path"
            class="mobile-more-item"
            :class="{ active: isMenuActive(item) }"
            type="button"
            @click="handleMobileNavigate(item.path)"
          >
            <el-icon class="mobile-more-item-icon"><component :is="item.icon" /></el-icon>
            <span class="mobile-more-item-label">{{ item.label }}</span>
          </button>
        </div>
      </section>

      <section class="mobile-more-section">
        <div class="mobile-more-section-title">账户</div>
        <div class="mobile-more-list">
          <button class="mobile-more-item" :class="{ active: route.path === '/profile' }" type="button" @click="handleMobileCommand('profile')">
            <el-icon class="mobile-more-item-icon"><UserFilled /></el-icon>
            <span class="mobile-more-item-label">个人中心</span>
          </button>
          <button class="mobile-more-item" type="button" @click="handleMobileCommand('logout')">
            <el-icon class="mobile-more-item-icon"><SwitchButton /></el-icon>
            <span class="mobile-more-item-label">退出登录</span>
          </button>
        </div>
      </section>
    </div>
  </el-drawer>

  <el-drawer v-model="notificationStore.drawerVisible" :show-close="false" size="420px" class="message-center-drawer">
    <template #header>
      <div class="drawer-head">
        <div class="drawer-head-copy">
          <div class="drawer-title">消息中心</div>
          <div class="drawer-subtitle">智能协作工作台</div>
        </div>
        <button class="drawer-mark-all-button" type="button" @click="notificationStore.markAllRead">
          <el-icon><Finished /></el-icon>
          <span>全部标记已读</span>
        </button>
      </div>
    </template>

    <div class="notification-drawer">
      <nav class="notification-nav" aria-label="消息分类">
        <button class="notification-nav-button" :class="{ active: !notificationStore.unreadOnly }" type="button" @click="notificationStore.toggleUnreadOnly(false)">
          <el-icon><Message /></el-icon>
          <span>全部消息</span>
        </button>
        <button class="notification-nav-button" :class="{ active: notificationStore.unreadOnly }" type="button" @click="notificationStore.toggleUnreadOnly(true)">
          <el-icon><Bell /></el-icon>
          <span>未读消息</span>
        </button>
        <button class="notification-nav-button disabled" type="button" disabled>
          <el-icon><ChatDotRound /></el-icon>
          <span>提及我的</span>
        </button>
        <button class="notification-nav-button disabled" type="button" disabled>
          <el-icon><WarningFilled /></el-icon>
          <span>系统告警</span>
        </button>
      </nav>

      <div class="notification-list custom-scrollbar" v-loading="notificationStore.loading" @scroll.passive="handleNotificationListScroll">
        <button
          v-for="item in notificationStore.items"
          :key="item.id"
          class="notification-item"
          :class="{ unread: !item.read, muted: item.read }"
          type="button"
          @click="handleNotificationClick(item)"
        >
          <div class="notification-item-head">
            <div class="notification-item-source">
              <span class="notification-item-dot" :class="{ unread: !item.read }"></span>
              <span class="notification-item-source-text">{{ resolveNotificationSource(item) }}</span>
            </div>
            <span class="notification-item-time">{{ formatNotificationTime(item.createdAt) }}</span>
          </div>
          <div class="notification-item-title">{{ item.title }}</div>
          <div class="notification-item-content">{{ item.content }}</div>
          <div class="notification-item-footer">
            <span class="notification-item-chip" :class="resolveNotificationContextTone(item)">
              <el-icon><component :is="resolveNotificationContextIcon(item)" /></el-icon>
              <span>{{ resolveNotificationContextLabel(item) }}</span>
            </span>
            <span class="notification-item-separator">•</span>
            <span class="notification-item-level" :class="resolveNotificationLevelTone(item)">{{ resolveNotificationLevelLabel(item) }}</span>
          </div>
        </button>
        <el-empty v-if="!notificationStore.loading && !notificationStore.items.length" class="notification-empty" description="暂无消息" />
        <div v-if="notificationStore.loading && notificationStore.items.length" class="notification-load-more">加载中...</div>
        <div v-else-if="!canLoadMoreNotifications && notificationStore.items.length" class="notification-load-more muted">已加载全部消息</div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown,
  ArrowRight,
  Bell,
  ChatDotRound,
  Connection,
  Cpu,
  DataAnalysis,
  DocumentCopy,
  Expand,
  Finished,
  Fold,
  FolderOpened,
  Management,
  Message,
  MoreFilled,
  Odometer,
  Search,
  Setting,
  SwitchButton,
  Tickets,
  UserFilled,
  WarningFilled
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import type { NotificationItem } from '@/types/platform'
import { resolveAssetUrl } from '@/utils/asset'

interface MenuItem {
  /** 菜单路由路径。 */
  path: string
  /** 菜单显示文案。 */
  label: string
  /** 收起态短标签。 */
  shortLabel: string
  /** 菜单权限码。 */
  permission: string
  /** 菜单图标组件。 */
  icon: unknown
  /** 需要一并高亮的路由名称。 */
  matchNames?: string[]
}

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()
const systemMenuExpanded = ref(false)
const integrationMenuExpanded = ref(false)
const isMobileViewport = ref(false)
const mobileMoreDrawerVisible = ref(false)

const primaryMenuItems: MenuItem[] = [
  { path: '/dashboard', label: '首页看板', shortLabel: '首页', permission: 'dashboard:view', icon: Odometer, matchNames: ['dashboard'] },
  { path: '/projects', label: '项目管理', shortLabel: '项目', permission: 'project:view', icon: FolderOpened, matchNames: ['projects', 'project-iterations', 'project-knowledge-graph'] },
  { path: '/agents', label: '智能体管理', shortLabel: '智能体', permission: 'agent:view', icon: Connection, matchNames: ['agents'] },
  { path: '/tasks', label: '任务管理', shortLabel: '任务', permission: 'task:view', icon: Tickets, matchNames: ['tasks'] },
  { path: '/tests', label: '测试管理', shortLabel: '测试', permission: 'test:view', icon: Finished, matchNames: ['tests', 'test-plan-detail'] },
  { path: '/gitlab', label: '代码仓库', shortLabel: '仓库', permission: 'gitlab:view', icon: DocumentCopy, matchNames: ['gitlab'] }
]

const integrationMenuItems: MenuItem[] = [
  { path: '/cicd/jenkins-servers', label: 'Jenkins 服务', shortLabel: 'Jenkins', permission: 'cicd:view', icon: Connection, matchNames: ['cicd-servers'] },
  { path: '/cicd/pipeline-bindings', label: '项目流水线', shortLabel: '流水线', permission: 'cicd:view', icon: DataAnalysis, matchNames: ['cicd-pipelines'] }
]

const trailingMenuItems: MenuItem[] = [
  { path: '/models', label: '模型管理', shortLabel: '模型', permission: 'model:view', icon: Cpu, matchNames: ['models'] }
]

const systemMenuItems: MenuItem[] = [
  { path: '/users', label: '用户管理', shortLabel: '用户', permission: 'system:user:view', icon: UserFilled, matchNames: ['users'] },
  { path: '/roles', label: '角色管理', shortLabel: '角色', permission: 'system:role:view', icon: Management, matchNames: ['roles'] },
  { path: '/permissions', label: '功能管理', shortLabel: '功能', permission: 'system:permission:view', icon: Setting, matchNames: ['permissions'] }
]

const pageTitle = computed(() => (route.meta.title as string) || 'AI代理工程管理平台')
const visiblePrimaryMenus = computed(() => primaryMenuItems.filter((item) => authStore.hasPermission(item.permission)))
const visibleIntegrationMenus = computed(() => integrationMenuItems.filter((item) => authStore.hasPermission(item.permission)))
const visibleTrailingMenus = computed(() => trailingMenuItems.filter((item) => authStore.hasPermission(item.permission)))
const visibleSystemMenus = computed(() => systemMenuItems.filter((item) => authStore.hasPermission(item.permission)))
const isDashboardRoute = computed(() => route.name === 'dashboard')
const isIterationWorkspaceRoute = computed(() => route.name === 'project-iterations')
const effectiveSidebarCollapsed = computed(() => isMobileViewport.value || appStore.sidebarCollapsed)
const asideWidth = computed(() => (effectiveSidebarCollapsed.value ? '80px' : '256px'))
const todayLabel = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(new Date())
)
const userInitial = computed(() => (authStore.user?.nickname || authStore.user?.username || 'U').slice(0, 1).toUpperCase())
const userAvatarUrl = computed(() => resolveAssetUrl(authStore.user?.avatarUrl))
const headerSearchHint = computed(() => {
  const searchHints: Record<string, string> = {
    dashboard: '搜索项目、智能体或任务...',
    agents: '搜索智能体、模型或项目...',
    gitlab: '搜索仓库、分支或日志...',
    'cicd-servers': '搜索 Jenkins 服务、地址或用户名...',
    'cicd-pipelines': '搜索项目流水线、任务或分支...',
    tests: '搜索测试计划、用例或结果...',
    'project-iterations': '搜索工作项、需求或负责人...'
  }
  return searchHints[String(route.name || '')] || '搜索页面、数据或工作项...'
})
const canLoadMoreNotifications = computed(() => notificationStore.items.length < notificationStore.total)
const mobilePrimaryMenuPaths = ['/dashboard', '/projects', '/tasks', '/tests']
const mobileBottomNavItems = computed(() =>
  mobilePrimaryMenuPaths
    .map((path) => visiblePrimaryMenus.value.find((item) => item.path === path))
    .filter((item): item is MenuItem => Boolean(item))
)
const mobileWorkspaceMoreItems = computed(() => [
  ...visiblePrimaryMenus.value.filter((item) => !mobilePrimaryMenuPaths.includes(item.path)),
  ...visibleIntegrationMenus.value,
  ...visibleTrailingMenus.value
])
const mobileSystemMoreItems = computed(() => visibleSystemMenus.value)
const isMobileMoreActive = computed(() =>
  route.path === '/profile'
  || mobileWorkspaceMoreItems.value.some((item) => isMenuActive(item))
  || mobileSystemMoreItems.value.some((item) => isMenuActive(item))
)

const isIntegrationSectionActive = computed(() => visibleIntegrationMenus.value.some((item) => isMenuActive(item)))
const isSystemSectionActive = computed(() => visibleSystemMenus.value.some((item) => isMenuActive(item)))

// 手机端强制使用折叠导航，只影响当前视口展示，不覆盖用户桌面端保存的侧边栏偏好。
function syncViewportMode() {
  if (typeof window === 'undefined') {
    return
  }
  isMobileViewport.value = window.innerWidth <= 900
  if (!isMobileViewport.value) {
    mobileMoreDrawerVisible.value = false
  }
}

function isMenuActive(item: MenuItem) {
  const currentName = String(route.name || '')
  if (route.path === item.path) {
    return true
  }
  return Boolean(item.matchNames?.includes(currentName))
}

async function handleNavigate(path: string) {
  mobileMoreDrawerVisible.value = false
  if (route.path === path) {
    return
  }
  await router.push(path)
}

/**
 * 手机端底部导航与更多面板统一复用同一套路由跳转，避免两套导航高亮与行为脱节。
 */
async function handleMobileNavigate(path: string) {
  await handleNavigate(path)
}

const handleCommand = async (command: string) => {
  mobileMoreDrawerVisible.value = false
  if (command === 'profile') {
    await router.push('/profile')
    return
  }
  if (command !== 'logout') {
    return
  }
  notificationStore.disconnect()
  await authStore.logout()
  ElMessage.success('已退出登录')
  await router.replace('/login')
}

async function handleMobileCommand(command: 'profile' | 'logout') {
  await handleCommand(command)
}

const handleOpenNotifications = async () => {
  await notificationStore.openDrawer()
}

const resolveNotificationSource = (item: NotificationItem) => {
  if (item.senderName?.trim()) {
    return item.senderName.trim()
  }
  if (item.type === 'GITLAB') return '代码仓库协作'
  if (item.type === 'CICD') return '持续集成流水线'
  if (item.type === 'TASK') return '任务中心'
  return '系统消息'
}

const resolveNotificationContextLabel = (item: NotificationItem) => {
  if (item.bizType?.trim()) {
    return item.bizType.trim()
  }
  if (item.type === 'TASK') return '工作项中心'
  if (item.type === 'GITLAB') return '代码协作'
  if (item.type === 'CICD') return '流水线监控'
  return '系统消息'
}

const resolveNotificationContextTone = (item: NotificationItem) => {
  if (item.type === 'TASK') return 'secondary'
  if (item.type === 'GITLAB') return 'tertiary'
  if (item.type === 'CICD') return 'neutral'
  return 'neutral'
}

const resolveNotificationContextIcon = (item: NotificationItem) => {
  if (item.type === 'TASK') return Tickets
  if (item.type === 'GITLAB') return Connection
  if (item.type === 'CICD') return DataAnalysis
  return Message
}

const resolveNotificationLevelLabel = (item: NotificationItem) => {
  if (item.level === 'ERROR') return '优先级：高'
  if (item.level === 'WARNING') return '优先级：中'
  if (item.level === 'SUCCESS') return '处理结果：成功'
  return '优先级：普通'
}

const resolveNotificationLevelTone = (item: NotificationItem) => {
  if (item.level === 'ERROR') return 'high'
  if (item.level === 'WARNING') return 'medium'
  if (item.level === 'SUCCESS') return 'success'
  return 'normal'
}

// 将通知时间转换为参考稿风格的相对时间文案，避免在抽屉里直接暴露原始时间串。
const formatNotificationTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000))
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) {
    return '昨天'
  }
  return `${diffDays} 天前`
}

const handleNotificationClick = async (item: NotificationItem) => {
  await notificationStore.markRead(item.id)
  notificationStore.drawerVisible = false
  if (item.actionUrl) {
    await router.push(item.actionUrl)
  }
}

const handleNotificationPageChange = async () => {
  await notificationStore.loadNotifications()
}

const handleNotificationSizeChange = async () => {
  notificationStore.page = 1
  await notificationStore.loadNotifications()
}

const handleNotificationListScroll = async (event: Event) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }
  if (notificationStore.loading || !canLoadMoreNotifications.value) {
    return
  }
  const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 120
  if (!nearBottom) {
    return
  }
  notificationStore.page += 1
  await notificationStore.loadNotifications(true)
}

// 当用户进入系统管理子页时，展开态自动展开对应分组，避免丢失当前定位。
watch(
  [
    () => route.fullPath,
    () => effectiveSidebarCollapsed.value,
    () => visibleIntegrationMenus.value.length,
    () => visibleSystemMenus.value.length
  ],
  () => {
    if (effectiveSidebarCollapsed.value) {
      integrationMenuExpanded.value = false
      systemMenuExpanded.value = false
      return
    }
    if (isIntegrationSectionActive.value) {
      integrationMenuExpanded.value = true
    }
    if (isSystemSectionActive.value) {
      systemMenuExpanded.value = true
    }
  },
  { immediate: true }
)

onMounted(() => {
  notificationStore.bootstrap().catch(() => undefined)
  syncViewportMode()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', syncViewportMode)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncViewportMode)
  }
})

watch(
  () => authStore.token,
  (token) => {
    if (!token) {
      notificationStore.disconnect()
    }
  }
)
</script>

<style scoped>
.layout-shell {
  height: 100vh;
  background:
    radial-gradient(circle at top left, var(--app-page-accent-a), transparent 22%),
    radial-gradient(circle at top right, var(--app-page-accent-b), transparent 26%),
    linear-gradient(180deg, var(--app-page-gradient-start) 0%, var(--app-page-gradient-end) 100%);
}

.layout-shell.iteration-shell {
  display: block;
  overflow: hidden;
}

.layout-aside {
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  transition: width 0.22s ease;
}

.aside-head {
  padding: 24px 24px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.aside-head.compact {
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 16px 10px 10px;
}

.brand-mark {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 12px;
  box-shadow: 0 12px 24px rgba(var(--app-primary-rgb), 0.16);
}

.brand-logo-svg {
  display: block;
  width: 100%;
  height: 100%;
}

.brand-copy {
  min-width: 0;
}

.brand-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 900;
  line-height: 1.08;
}

.brand-subtitle {
  margin-top: 6px;
  color: #7c8794;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}

.compact-copy {
  text-align: center;
}

.brand-title-mini {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 11px;
  font-weight: 900;
  line-height: 1.1;
}

.brand-subtitle-mini {
  margin-top: 2px;
  color: #9aa4af;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.aside-scroll {
  flex: 1 1 auto;
  min-height: 0;
}

.sidebar-nav {
  padding: 10px 0 16px;
}

.sidebar-menu-button,
.system-submenu-button,
.system-popover-button {
  width: 100%;
  border: 0;
  background: transparent;
  color: #64748b;
  font-family: var(--app-font-body);
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  box-shadow: none;
}

.sidebar-menu-button {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 0 24px 0 20px;
  text-align: left;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.sidebar-menu-button:focus,
.sidebar-menu-button:focus-visible,
.system-submenu-button:focus,
.system-submenu-button:focus-visible,
.system-popover-button:focus,
.system-popover-button:focus-visible,
.aside-action-button:focus,
.aside-action-button:focus-visible {
  outline: none;
  box-shadow: none;
}

.sidebar-menu-button:hover,
.system-submenu-button:hover,
.system-popover-button:hover {
  background: rgba(226, 232, 240, 0.45);
  color: #334155;
}

.sidebar-menu-button.active {
  background: rgba(255, 255, 255, 0.72);
  color: #111827;
  font-weight: 800;
}

.menu-active-bar {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  border-radius: 0 999px 999px 0;
  background: transparent;
}

.sidebar-menu-button.active .menu-active-bar {
  background: var(--app-primary-container);
}

.menu-icon {
  flex: 0 0 auto;
  font-size: 18px;
}

.menu-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: inherit;
}

.menu-arrow {
  flex: 0 0 auto;
  font-size: 14px;
}

.sidebar-menu-button.compact {
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-height: 58px;
  padding: 8px 0;
  text-align: center;
}

.sidebar-menu-button.compact .menu-active-bar {
  top: 6px;
  bottom: 6px;
}

.menu-short-label {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.system-menu-group {
  margin-top: 4px;
}

.system-submenu {
  padding: 4px 0 0 18px;
}

.system-submenu-button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 24px 0 20px;
  text-align: left;
  font-size: 13px;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.system-submenu-button.active,
.system-popover-button.active {
  color: #111827;
  font-weight: 800;
}

.system-popover-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.system-popover-button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  text-align: left;
  font-size: 13px;
}

.aside-footer {
  margin-top: auto;
  padding: 18px 24px 24px;
}

.aside-footer.compact {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 16px 10px 18px;
}

.aside-action-button {
  width: 100%;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--app-primary-container) 0%, var(--app-primary) 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  box-shadow: 0 12px 24px rgba(var(--app-primary-rgb), 0.22);
  appearance: none;
  -webkit-appearance: none;
  outline: none;
}

.aside-footer.compact .aside-action-button {
  width: 48px;
  min-height: 48px;
  border-radius: 14px;
  padding: 0;
}

.layout-main-shell {
  min-width: 0;
}

.layout-shell.iteration-shell .layout-main-shell {
  width: 100%;
  height: 100vh;
}

.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 64px;
  padding: 10px 24px;
  background: rgba(255, 255, 255, 0.76);
  backdrop-filter: blur(18px);
}

.header-search-group {
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;
  flex: 1 1 auto;
}

.header-page-title {
  margin: 0;
  flex: 0 0 auto;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
}

.header-search-shell {
  min-width: 300px;
  max-width: 540px;
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  background: rgba(243, 244, 245, 0.96);
  color: var(--app-text-muted);
  font-size: 13px;
}

.header-search-shell span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
  flex: 0 0 auto;
  min-width: 0;
}

.header-profile-group {
  display: inline-flex;
  align-items: center;
  gap: 16px;
}

.header-notification-button {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #64748b;
  position: relative;
}

.header-notification-button:hover {
  background: rgba(226, 232, 240, 0.55);
  color: var(--app-primary);
}

.header-notification-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--app-primary-container);
  box-shadow: 0 0 0 2px #fff;
}

.header-divider {
  width: 1px;
  height: 28px;
  background: rgba(var(--app-outline-rgb), 0.12);
}

.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-text);
  min-width: 0;
}

.user-avatar {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--app-primary-container) 0%, var(--app-primary) 100%);
  color: #fff;
  font-weight: 800;
}

.user-avatar-image {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: inherit;
  object-fit: cover;
}

.user-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 0;
}

.user-meta strong {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 800;
}

.user-meta small {
  margin-top: 2px;
  color: var(--app-text-muted);
  font-size: 10px;
}

.layout-main {
  min-width: 0;
  padding: 16px 0 24px;
  overflow: auto;
}

.layout-main.mobile-main {
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
}

.layout-main.iteration-main {
  height: 100%;
  padding: 0 !important;
  overflow: hidden;
}

.dashboard-main {
  overflow: auto;
}

.mobile-bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(var(--app-outline-rgb), 0.12);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(18px);
}

.mobile-nav-button {
  flex: 1 1 0;
  min-width: 0;
  min-height: 54px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 4px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: #64748b;
}

.mobile-nav-button.active {
  background: rgba(255, 220, 195, 0.22);
  color: var(--app-primary);
}

.mobile-nav-icon {
  font-size: 18px;
}

.mobile-nav-label {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 800;
}

.mobile-more-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.mobile-more-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 18px;
  font-weight: 800;
}

.mobile-more-close {
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: rgba(243, 244, 245, 0.96);
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.mobile-more-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.mobile-more-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-more-section-title {
  color: #94a3b8;
  font-family: var(--app-font-heading);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.mobile-more-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-more-item {
  width: 100%;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border: 0;
  border-radius: 14px;
  background: rgba(243, 244, 245, 0.78);
  color: var(--app-text);
  text-align: left;
}

.mobile-more-item.active {
  background: rgba(255, 220, 195, 0.32);
  color: var(--app-primary);
}

.mobile-more-item-icon {
  flex: 0 0 auto;
  font-size: 18px;
}

.mobile-more-item-label {
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px 10px;
  background: #f8f9fa;
}

.drawer-head-copy {
  min-width: 0;
}

.drawer-title {
  color: #191c1d;
  font-family: var(--app-font-heading);
  font-size: 24px;
  font-weight: 900;
  line-height: 0.94;
  letter-spacing: -0.03em;
}

.drawer-subtitle {
  margin-top: 6px;
  color: #94a3b8;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.drawer-mark-all-button {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #564334;
  font-size: 11px;
  font-weight: 700;
}

.drawer-mark-all-button:hover {
  background: rgba(231, 232, 233, 0.9);
  color: var(--app-primary);
}

.notification-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #f3f4f5;
}

.notification-nav {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 0 8px;
  border-bottom: 1px solid rgba(221, 193, 174, 0.24);
  background: #f8f9fa;
}

.notification-nav-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 58px;
  padding: 6px 0 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #64748b;
  font-family: var(--app-font-heading);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.01em;
}

.notification-nav-button .el-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
  margin: 0 auto;
}

.notification-nav-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
}

.notification-nav-button.active {
  border-bottom-color: var(--app-primary-container);
  background: rgba(255, 255, 255, 0.5);
  color: #191c1d;
}

.notification-nav-button.disabled {
  color: #94a3b8;
}

.notification-nav-button:disabled {
  cursor: default !important;
}

.notification-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e7e8e9;
  border-radius: 999px;
}

.notification-item {
  width: 100%;
  padding: 16px 16px 14px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: #fff;
  text-align: left;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

.notification-item:hover {
  border-color: rgba(221, 193, 174, 0.36);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
}

.notification-item.unread {
  opacity: 1;
}

.notification-item.muted {
  opacity: 0.82;
}

.notification-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.notification-item-source {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.notification-item-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #e2e8f0;
}

.notification-item-dot.unread {
  background: var(--app-primary-container);
}

.notification-item-source-text {
  overflow: hidden;
  color: #191c1d;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--app-font-heading);
  font-size: 12px;
  font-weight: 800;
}

.notification-item-time {
  flex: 0 0 auto;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 500;
}

.notification-item-title {
  color: #191c1d;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
}

.notification-item-content {
  margin-top: 6px;
  color: #556474;
  font-size: 12px;
  line-height: 1.7;
}

.notification-item-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.notification-item-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 800;
}

.notification-item-chip.tertiary {
  background: #c7e7ff;
  color: #004c6c;
}

.notification-item-chip.secondary {
  background: #ffdcc3;
  color: #78471a;
}

.notification-item-chip.neutral {
  background: #e7e8e9;
  color: #564334;
}

.notification-item-separator {
  color: #cbd5e1;
  font-size: 10px;
}

.notification-item-level {
  font-size: 10px;
  font-weight: 700;
}

.notification-item-level.high {
  color: var(--app-primary);
}

.notification-item-level.medium {
  color: #8b5e34;
}

.notification-item-level.success {
  color: #2f6f3e;
}

.notification-item-level.normal {
  color: #64748b;
}

.notification-empty {
  padding-top: 72px;
  padding-bottom: 72px;
}

.notification-load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.notification-load-more.muted {
  color: #94a3b8;
}

:deep(.message-center-drawer) {
  --el-drawer-bg-color: #f3f4f5;
}

:deep(.message-center-drawer .el-drawer) {
  border-left: 1px solid rgba(221, 193, 174, 0.18);
  box-shadow: -20px 0 60px -15px rgba(0, 0, 0, 0.15);
}

:deep(.message-center-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 0;
}

:deep(.message-center-drawer .el-drawer__body) {
  padding: 0;
}

:deep(.sidebar-system-popper.el-popper) {
  border: 0 !important;
  border-radius: 16px !important;
  background: rgba(255, 255, 255, 0.98) !important;
  box-shadow: 0 16px 28px rgba(25, 28, 29, 0.12) !important;
}

:deep(.sidebar-system-popper .el-popper__arrow) {
  display: none;
}

:deep(.mobile-more-drawer) {
  --el-drawer-bg-color: rgba(248, 249, 250, 0.98);
}

:deep(.mobile-more-drawer .el-drawer) {
  border-radius: 24px 24px 0 0;
}

:deep(.mobile-more-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 18px 18px 8px;
}

:deep(.mobile-more-drawer .el-drawer__body) {
  padding: 10px 18px calc(18px + env(safe-area-inset-bottom));
}

@media (max-width: 1200px) {
  .layout-header {
    align-items: center;
    gap: 16px;
  }

  .header-search-group {
    width: auto;
    gap: 14px;
  }

  .header-actions {
    width: auto;
    justify-content: flex-end;
  }

  .header-search-shell {
    min-width: 180px;
    max-width: 360px;
    flex-basis: 260px;
  }

  .user-meta strong,
  .user-meta small {
    max-width: 108px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (max-width: 900px) {
  .layout-header {
    padding: 12px 16px;
    gap: 12px;
  }

  .header-search-group {
    gap: 10px;
    flex: 1 1 auto;
  }

  .header-page-title {
    font-size: 18px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .layout-main {
    padding: 12px 0 20px;
  }

  .layout-main.iteration-main {
    padding: 0 !important;
  }

  .header-search-shell {
    min-width: 120px;
    max-width: 220px;
    flex-basis: 160px;
    padding: 0 12px;
  }

  .header-profile-group {
    gap: 8px;
  }

  .header-divider,
  .user-meta small {
    display: none;
  }

  .user-trigger {
    gap: 8px;
  }

  .user-meta strong {
    max-width: 72px;
  }

  .mobile-bottom-nav {
    gap: 6px;
    padding-left: 10px;
    padding-right: 10px;
  }

  .mobile-nav-button {
    min-height: 52px;
    border-radius: 12px;
  }
}
</style>
