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

          <div v-if="visibleProjectWorkspaceMenus.length && !effectiveSidebarCollapsed" class="system-menu-group">
            <button
              class="sidebar-menu-button"
              :class="{ active: isProjectWorkspaceActive }"
              type="button"
              @click="projectWorkspaceExpanded = !projectWorkspaceExpanded"
            >
              <span class="menu-active-bar" aria-hidden="true"></span>
              <el-icon class="menu-icon"><Document /></el-icon>
              <span class="menu-label">当前项目</span>
              <el-icon class="menu-arrow">
                <ArrowDown v-if="projectWorkspaceExpanded" />
                <ArrowRight v-else />
              </el-icon>
            </button>

            <div v-show="projectWorkspaceExpanded" class="system-submenu">
              <button
                v-for="item in visibleProjectWorkspaceMenus"
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
            v-if="visibleProjectWorkspaceMenus.length && effectiveSidebarCollapsed"
            trigger="click"
            placement="right-start"
            :show-arrow="false"
            :width="220"
            popper-class="sidebar-system-popper"
          >
            <template #reference>
              <button
                class="sidebar-menu-button compact"
                :class="{ active: isProjectWorkspaceActive }"
                title="当前项目"
                type="button"
              >
                <span class="menu-active-bar" aria-hidden="true"></span>
                <el-icon class="menu-icon"><Document /></el-icon>
                <span class="menu-short-label">项目</span>
              </button>
            </template>

            <div class="system-popover-menu">
              <button
                v-for="item in visibleProjectWorkspaceMenus"
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

      <el-container
        class="layout-main-shell"
        :class="{ 'mobile-main-shell': isMobileViewport && !isIterationWorkspaceRoute, 'wiki-space-main-shell': isWikiSpaceRoute }"
      >
      <el-header v-if="!isIterationWorkspaceRoute" class="layout-header">
        <div class="header-search-group">
          <button v-if="isApiProjectDetailRoute" class="header-back-link" type="button" @click="goBackToApiGroups">
            <el-icon><ArrowLeft /></el-icon>
            <span>返回 API 项目</span>
          </button>
          <h1 class="header-page-title" :title="pageTitle">{{ pageTitle }}</h1>
        </div>

        <div class="header-actions">
          <div v-if="!isMobileViewport && canUseHermes" class="header-search-shell" @click="handleOpenHermesDrawer">
            <el-icon><Search /></el-icon>
            <input
              v-model="headerHermesQuestion"
              class="header-search-input"
              type="text"
              placeholder="问你想问"
              @click.stop
              @keyup.enter="handleAskHermes"
            />
            <button class="header-search-button" type="button" @click.stop="handleAskHermes">
              提问
            </button>
          </div>
          <div class="header-profile-group">
            <button
              v-if="isMobileViewport && canUseHermes"
              class="header-hermes-button"
              type="button"
              aria-label="打开 Hermes 助手"
              @click.stop="handleOpenHermesDrawer"
            >
              <el-icon><Search /></el-icon>
            </button>
            <button class="header-notification-button" type="button" aria-label="打开消息中心" @click.stop="handleOpenNotifications">
              <el-icon><Bell /></el-icon>
              <span v-if="notificationStore.unreadCount > 0" class="header-notification-dot"></span>
            </button>
            <span class="header-divider" aria-hidden="true"></span>
            <el-dropdown class="header-user-dropdown" @command="handleCommand">
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
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                  <el-dropdown-item command="feedback">反馈与建议</el-dropdown-item>
                  <el-dropdown-item command="roles" disabled>
                    {{ authStore.user?.roleNames?.join(' / ') || '暂无角色' }}
                  </el-dropdown-item>
                  <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

      </el-header>

      <el-main
        class="layout-main"
        :class="{
          'dashboard-main': isDashboardRoute,
          'iteration-main': isIterationWorkspaceRoute,
          'wiki-space-main': isWikiSpaceRoute,
          'mobile-main': isMobileViewport && !isIterationWorkspaceRoute
        }"
      >
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
          <button class="mobile-more-item" type="button" @click="handleMobileCommand('feedback')">
            <el-icon class="mobile-more-item-icon"><ChatDotRound /></el-icon>
            <span class="mobile-more-item-label">反馈与建议</span>
          </button>
          <button class="mobile-more-item" type="button" @click="handleMobileCommand('logout')">
            <el-icon class="mobile-more-item-icon"><SwitchButton /></el-icon>
            <span class="mobile-more-item-label">退出登录</span>
          </button>
        </div>
      </section>
    </div>
  </el-drawer>

  <HermesDrawer
    ref="hermesDrawerRef"
    v-model="hermesDrawerVisible"
    :route-name="hermesRouteName"
    :project-id="hermesProjectId"
    :task-id="hermesTaskId"
    :iteration-id="hermesIterationId"
    :plan-id="hermesPlanId"
    :wiki-space-id="hermesWikiSpaceId"
    :wiki-page-id="hermesWikiPageId"
    :fallback-prompts="hermesQuickPrompts"
  />

  <el-dialog
    v-model="feedbackDialogVisible"
    title="反馈与建议"
    width="640px"
    class="feedback-dialog"
    :close-on-click-modal="!feedbackSubmitting"
    :close-on-press-escape="!feedbackSubmitting"
    :show-close="!feedbackSubmitting"
    destroy-on-close
    @closed="handleFeedbackDialogClosed"
  >
    <div class="feedback-dialog-copy">
      <div class="feedback-dialog-title">欢迎告诉我们你的想法</div>
      <p class="feedback-dialog-subtitle">你可以反馈问题、优化建议或使用体验，我们会把内容保存到平台后台，方便后续统一跟进。</p>
    </div>

    <el-form ref="feedbackFormRef" :model="feedbackForm" :rules="feedbackRules" label-width="92px" class="feedback-dialog-form">
      <el-form-item label="反馈类型" prop="type">
        <el-select v-model="feedbackForm.type" placeholder="请选择反馈类型" style="width: 100%">
          <el-option
            v-for="item in feedbackTypeOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="反馈标题" prop="title">
        <el-input
          v-model="feedbackForm.title"
          maxlength="100"
          show-word-limit
          placeholder="请简要概括你的问题或建议"
        />
      </el-form-item>
      <el-form-item label="反馈内容" prop="content">
        <el-input
          v-model="feedbackForm.content"
          type="textarea"
          :rows="7"
          maxlength="2000"
          show-word-limit
          resize="none"
          placeholder="请尽量描述清楚问题场景、期望结果或改进建议"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="feedback-dialog-footer">
        <el-button :disabled="feedbackSubmitting" @click="feedbackDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="feedbackSubmitting" @click="handleSubmitFeedback">提交反馈</el-button>
      </div>
    </template>
  </el-dialog>

  <el-drawer
    v-model="notificationStore.drawerVisible"
    :direction="notificationDrawerDirection"
    :size="notificationDrawerSize"
    :show-close="false"
    :class="['message-center-drawer', { 'is-mobile': isMobileViewport }]"
  >
    <template #header>
      <div class="drawer-head">
        <div class="drawer-head-copy">
          <div class="drawer-title">消息中心</div>
          <div class="drawer-subtitle">智能协作工作台</div>
        </div>
        <div class="drawer-head-actions">
          <button class="drawer-mark-all-button" type="button" @click="notificationStore.markAllRead">
            <el-icon><Finished /></el-icon>
            <span>全部标记已读</span>
          </button>
          <button class="drawer-close-button" type="button" @click="notificationStore.drawerVisible = false">关闭</button>
        </div>
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
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bell,
  ChatDotRound,
  Connection,
  Cpu,
  DataAnalysis,
  Document,
  DocumentCopy,
  Expand,
  Finished,
  Fold,
  FolderOpened,
  Key,
  Link,
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
import type { FormInstance, FormRules } from 'element-plus'
import { listPermissionOptions } from '@/api/access'
import { createFeedbackApi } from '@/api/feedback'
import HermesDrawer from '@/components/HermesDrawer.vue'
import { HERMES_OPEN_EVENT_NAME, type HermesOpenEventDetail } from '@/constants/hermes'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import type { CreateFeedbackPayload, FeedbackType, NotificationItem, PermissionItem } from '@/types/platform'
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

interface HermesDrawerExpose {
  openDrawer: () => void
  openWithQuestion: (question: string) => Promise<void>
}

interface MenuSeed {
  /** 菜单权限码。 */
  permission: string
  /** 默认路径，后端未配置菜单路由时兜底。 */
  fallbackPath: string
  /** 默认文案，后端未配置名称时兜底。 */
  fallbackLabel: string
  /** 收起态短标签。 */
  shortLabel: string
  /** 默认图标组件。 */
  fallbackIcon: unknown
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
const projectWorkspaceExpanded = ref(false)
const isMobileViewport = ref(false)
const mobileMoreDrawerVisible = ref(false)
const hermesDrawerVisible = ref(false)
const feedbackDialogVisible = ref(false)
const feedbackSubmitting = ref(false)
const headerHermesQuestion = ref('')
const hermesDrawerRef = ref<HermesDrawerExpose | null>(null)
const feedbackFormRef = ref<FormInstance>()
const permissionOptions = ref<PermissionItem[]>([])

/**
 * 反馈表单固定采用结构化字段，方便后端后续按类型和标题检索问题。
 */
const feedbackForm = reactive<CreateFeedbackPayload>({
  type: 'SUGGESTION',
  title: '',
  content: ''
})

/** 反馈类型选项。 */
const feedbackTypeOptions: Array<{ label: string; value: FeedbackType }> = [
  { label: '问题反馈', value: 'BUG' },
  { label: '功能建议', value: 'SUGGESTION' },
  { label: '体验优化', value: 'EXPERIENCE' },
  { label: '其他', value: 'OTHER' }
]

/** 反馈弹窗的前端校验规则。 */
const feedbackRules: FormRules<typeof feedbackForm> = {
  type: [{ required: true, message: '请选择反馈类型', trigger: 'change' }],
  title: [
    { required: true, message: '请输入反馈标题', trigger: 'blur' },
    { max: 100, message: '反馈标题长度不能超过100', trigger: 'blur' }
  ],
  content: [
    { required: true, message: '请输入反馈内容', trigger: 'blur' },
    { max: 2000, message: '反馈内容长度不能超过2000', trigger: 'blur' }
  ]
}

const iconRegistry: Record<string, unknown> = {
  Bell,
  ChatDotRound,
  Connection,
  Cpu,
  DataAnalysis,
  Document,
  DocumentCopy,
  Finished,
  FolderOpened,
  Link,
  Management,
  Odometer,
  Search,
  Setting,
  Tickets,
  UserFilled,
  WarningFilled
}

const primaryMenuSeeds: MenuSeed[] = [
  { permission: 'dashboard:view', fallbackPath: '/dashboard', fallbackLabel: '首页看板', shortLabel: '首页', fallbackIcon: Odometer, matchNames: ['dashboard'] },
  { permission: 'project:view', fallbackPath: '/projects', fallbackLabel: '项目管理', shortLabel: '项目', fallbackIcon: FolderOpened, matchNames: ['projects', 'project-iterations'] },
  { permission: 'api:view', fallbackPath: '/apis', fallbackLabel: 'API管理', shortLabel: 'API', fallbackIcon: Connection, matchNames: ['api-groups', 'api-project-detail'] },
  { permission: 'wiki:view', fallbackPath: '/wiki', fallbackLabel: 'Wiki 中心', shortLabel: 'Wiki', fallbackIcon: Document, matchNames: ['wiki-home', 'wiki-space', 'wiki-space-page', 'wiki-space-memory-fact-graph', 'project-memory-fact-graph'] },
  { permission: 'agent:view', fallbackPath: '/agents', fallbackLabel: '智能体管理', shortLabel: '智能体', fallbackIcon: Connection, matchNames: ['agents'] },
  { permission: 'task:view', fallbackPath: '/tasks', fallbackLabel: '执行中心', shortLabel: '执行', fallbackIcon: Tickets, matchNames: ['tasks', 'execution-task-detail'] },
  { permission: 'self-upgrade:view', fallbackPath: '/self-upgrade', fallbackLabel: '自升级中心', shortLabel: '自升级', fallbackIcon: Connection, matchNames: ['self-upgrade'] },
  { permission: 'test:view', fallbackPath: '/tests', fallbackLabel: '测试管理', shortLabel: '测试', fallbackIcon: Finished, matchNames: ['tests', 'test-plan-detail'] },
  { permission: 'gitlab:view', fallbackPath: '/gitlab', fallbackLabel: '代码仓库', shortLabel: '仓库', fallbackIcon: DocumentCopy, matchNames: ['gitlab'] }
]

const integrationMenuSeeds: MenuSeed[] = [
  { permission: 'server:view', fallbackPath: '/servers', fallbackLabel: '服务器管理', shortLabel: '服务器', fallbackIcon: Connection, matchNames: ['servers', 'server-detail'] },
  { permission: 'observability:view', fallbackPath: '/observability', fallbackLabel: '可观测性中心', shortLabel: '观测', fallbackIcon: DataAnalysis, matchNames: ['observability-projects', 'observability-project-detail'] },
  { permission: 'cicd:view', fallbackPath: '/cicd/pipeline-bindings', fallbackLabel: '流水线中心', shortLabel: '流水线', fallbackIcon: DataAnalysis, matchNames: ['cicd-pipelines', 'cicd-pipeline-detail'] },
  { permission: 'cicd:view', fallbackPath: '/cicd/jenkins-servers', fallbackLabel: 'Jenkins 服务管理', shortLabel: 'Jenkins', fallbackIcon: DataAnalysis, matchNames: ['cicd-servers'] }
]

const trailingMenuSeeds: MenuSeed[] = [
  { permission: 'model:view', fallbackPath: '/models', fallbackLabel: '模型管理', shortLabel: '模型', fallbackIcon: Cpu, matchNames: ['models', 'model-benchmark-configs'] },
  { permission: 'system:pr-review:view', fallbackPath: '/pr-review-stats', fallbackLabel: 'PR评审统计', shortLabel: 'PR评审', fallbackIcon: DataAnalysis, matchNames: ['pr-review-stats'] }
]

const systemMenuSeeds: MenuSeed[] = [
  { permission: 'system:user:view', fallbackPath: '/users', fallbackLabel: '用户管理', shortLabel: '用户', fallbackIcon: UserFilled, matchNames: ['users'] },
  { permission: 'system:role:view', fallbackPath: '/roles', fallbackLabel: '角色管理', shortLabel: '角色', fallbackIcon: Management, matchNames: ['roles'] },
  { permission: 'system:permission:view', fallbackPath: '/permissions', fallbackLabel: '功能管理', shortLabel: '功能', fallbackIcon: Setting, matchNames: ['permissions'] },
  { permission: 'system:tool:view', fallbackPath: '/tools', fallbackLabel: '工具配置', shortLabel: '工具', fallbackIcon: Connection, matchNames: ['tools'] },
  { permission: 'system:env:view', fallbackPath: '/env-vars', fallbackLabel: '环境变量管理', shortLabel: '变量', fallbackIcon: Key, matchNames: ['env-vars'] },
  { permission: 'system:shortcut:view', fallbackPath: '/shortcuts', fallbackLabel: '快捷入口管理', shortLabel: '入口', fallbackIcon: Link, matchNames: ['shortcuts'] },
  { permission: 'scan:ruleset:view', fallbackPath: '/scan-rulesets', fallbackLabel: '扫描规则集', shortLabel: '规则集', fallbackIcon: Search, matchNames: ['scan-rulesets'] },
  { permission: 'system:operation-log:view', fallbackPath: '/operation-logs', fallbackLabel: '操作日志', shortLabel: '日志', fallbackIcon: Document, matchNames: ['operation-logs'] }
]

const menuPermissionMap = computed(() => {
  const map = new Map<string, PermissionItem>()
  permissionOptions.value
    .filter((item) => item.type === 'MENU' && item.enabled)
    .forEach((item) => {
      if (!map.has(item.code)) {
        map.set(item.code, item)
      }
    })
  return map
})

function resolveMenuIcon(iconName: string | null | undefined, fallbackIcon: unknown) {
  if (iconName && iconRegistry[iconName]) {
    return iconRegistry[iconName]
  }
  return fallbackIcon
}

function buildMenuItems(seeds: MenuSeed[]) {
  return seeds.map<MenuItem>((seed) => {
    const configured = menuPermissionMap.value.get(seed.permission)
    const uniquePermissionSeed = seeds.filter((item) => item.permission === seed.permission).length === 1
    return {
      path: uniquePermissionSeed ? (configured?.path || seed.fallbackPath) : seed.fallbackPath,
      label: uniquePermissionSeed ? (configured?.name || seed.fallbackLabel) : seed.fallbackLabel,
      shortLabel: seed.shortLabel,
      permission: seed.permission,
      icon: uniquePermissionSeed ? resolveMenuIcon(configured?.icon, seed.fallbackIcon) : seed.fallbackIcon,
      matchNames: seed.matchNames
    }
  })
}

const primaryMenuItems = computed(() => buildMenuItems(primaryMenuSeeds))
const integrationMenuItems = computed(() => buildMenuItems(integrationMenuSeeds))
const trailingMenuItems = computed(() => buildMenuItems(trailingMenuSeeds))
const systemMenuItems = computed(() => buildMenuItems(systemMenuSeeds))

const pageTitle = computed(() => {
  if (appStore.dynamicPageTitle && appStore.dynamicPageTitleRouteName === String(route.name || '')) {
    return appStore.dynamicPageTitle
  }
  return (route.meta.title as string) || 'AI代理工程管理平台'
})
const visiblePrimaryMenus = computed(() => primaryMenuItems.value.filter((item) => authStore.hasPermission(item.permission)))
const visibleIntegrationMenus = computed(() =>
  integrationMenuItems.value.filter((item) => {
    if (!authStore.hasPermission(item.permission)) {
      return false
    }
    if (item.permission === 'server:view' && !appStore.serverManagementEnabled) {
      return false
    }
    return true
  })
)
const visibleTrailingMenus = computed(() => trailingMenuItems.value.filter((item) => authStore.hasPermission(item.permission)))
const visibleSystemMenus = computed(() => systemMenuItems.value.filter((item) => authStore.hasPermission(item.permission)))
const isDashboardRoute = computed(() => route.name === 'dashboard')
const isIterationWorkspaceRoute = computed(() => route.name === 'project-iterations')
const isWikiSpaceRoute = computed(() => route.name === 'wiki-space' || route.name === 'wiki-space-page')
const isApiProjectDetailRoute = computed(() => route.name === 'api-project-detail')
const effectiveSidebarCollapsed = computed(() => isMobileViewport.value || appStore.sidebarCollapsed)
const asideWidth = computed(() => (effectiveSidebarCollapsed.value ? '80px' : '256px'))
const userInitial = computed(() => (authStore.user?.nickname || authStore.user?.username || 'U').slice(0, 1).toUpperCase())
const userAvatarUrl = computed(() => resolveAssetUrl(authStore.user?.avatarUrl))
const canUseHermes = computed(() => authStore.hasPermission('hermes:chat'))
const hermesRouteName = computed(() => String(route.name || ''))
const hermesProjectId = computed(() => {
  const projectId = Number(route.params.projectId)
  return Number.isNaN(projectId) || projectId <= 0 ? null : projectId
})
const hermesTaskId = computed(() => {
  const taskId = Number(route.query.openTaskId)
  return Number.isNaN(taskId) || taskId <= 0 ? null : taskId
})
const hermesIterationId = computed(() => {
  const iterationId = Number(route.query.iterationId)
  return Number.isNaN(iterationId) || iterationId <= 0 ? null : iterationId
})
const hermesPlanId = computed(() => {
  const planId = Number(route.params.planId)
  return Number.isNaN(planId) || planId <= 0 ? null : planId
})
const hermesWikiPageId = computed(() => {
  const wikiPageId = Number(route.params.pageId || route.query.wikiPageId)
  return Number.isNaN(wikiPageId) || wikiPageId <= 0 ? null : wikiPageId
})
const hermesWikiSpaceId = computed(() => {
  const wikiSpaceId = Number(route.params.spaceId)
  return Number.isNaN(wikiSpaceId) || wikiSpaceId <= 0 ? null : wikiSpaceId
})
const currentProjectId = computed(() => {
  const projectId = Number(route.params.projectId)
  return Number.isNaN(projectId) || projectId <= 0 ? null : projectId
})
const projectWorkspaceMenus = computed<MenuItem[]>(() => {
  if (!currentProjectId.value) {
    return []
  }
  return [
    {
      path: `/projects/${currentProjectId.value}/iterations`,
      label: '迭代管理',
      shortLabel: '迭代',
      permission: 'project:view',
      icon: Tickets,
      matchNames: ['project-iterations']
    },
    {
      path: `/wiki?projectId=${currentProjectId.value}`,
      label: '关联 Wiki',
      shortLabel: 'Wiki',
      permission: 'wiki:view',
      icon: Document,
      matchNames: ['wiki-home', 'wiki-space', 'wiki-space-page', 'wiki-space-memory-fact-graph']
    },
    {
      path: `/observability/projects/${currentProjectId.value}`,
      label: '应用观测',
      shortLabel: '观测',
      permission: 'observability:view',
      icon: DataAnalysis,
      matchNames: ['observability-project-detail']
    }
  ]
})
const visibleProjectWorkspaceMenus = computed(() => projectWorkspaceMenus.value.filter((item) => authStore.hasPermission(item.permission)))
const hermesQuickPrompts = computed(() => {
  const quickPromptMap: Record<string, string[]> = {
    dashboard: ['我今天最该推进什么', '哪些项目本周有延期风险', '最近有哪些需要我关注的异常'],
    projects: ['这个项目当前最大的阻塞是什么', '最近这个项目有哪些关键变化', '这个项目本周最值得关注的风险是什么'],
    'project-iterations': hermesIterationId.value
      ? ['帮我总结当前迭代发版内容', '当前迭代修复了多少缺陷', '当前迭代开发了哪些需求']
      : ['这个项目当前最大的阻塞是什么', '最近这个项目有哪些关键变化', '这个任务为什么延期了'],
    'project-memory-fact-graph': ['这个项目里最近形成了哪些稳定事实', '哪些实体和当前项目关系最紧密', '从这些事实里能看出什么风险或机会'],
    'api-groups': ['哪些项目还没初始化 API 工作台', '帮我找某个项目的 API GROUP', '最近哪个项目接口最需要同步'],
    'api-project-detail': ['帮我总结当前项目的接口资产', '这个项目有哪些接口同步风险', '当前 API 工作台下一步该检查什么'],
    'wiki-home': ['有哪些空间与当前项目相关', '帮我找某个项目关联的知识目录', '当前最值得看的空间是哪个'],
    'wiki-space': ['这个空间最近有哪些知识更新', '帮我梳理这个空间里的重点内容', '这个空间目前最值得关注的页面是什么'],
    'wiki-space-memory-fact-graph': ['这个空间里最近形成了哪些稳定事实', '哪些实体和当前空间关系最紧密', '从这些事实里能看出什么风险或机会'],
    'wiki-space-page': ['帮我总结当前 Wiki 页面', '这个页面和哪些知识有关', '基于 Wiki 内容下一步应该做什么'],
    tasks: ['最近有哪些执行任务失败了', '哪些智能体任务还在运行', '帮我总结执行中心的风险'],
    'self-upgrade': ['最近有哪些新建议值得优先处理', '夜间巡检都发现了什么问题', '哪些整改工作项最值得先做'],
    'execution-task-detail': ['这次执行失败的原因是什么', '帮我总结当前执行结果', '这次执行下一步该做什么']
  }
  return quickPromptMap[hermesRouteName.value] || ['我今天最该推进什么', '帮我总结当前最值得关注的事项', '最近有哪些需要我关注的异常']
})
// 消息中心在桌面端保持右侧抽屉，在手机端切换成与 Hermes 一致的底部全屏抽屉，保证交互预期统一。
const notificationDrawerDirection = computed(() => (isMobileViewport.value ? 'btt' : 'rtl'))
const notificationDrawerSize = computed(() => (isMobileViewport.value ? '100%' : '420px'))
const canLoadMoreNotifications = computed(() => notificationStore.items.length < notificationStore.total)
const mobilePrimaryMenuPaths = ['/dashboard', '/projects', '/tasks', '/tests']
const mobileBottomNavItems = computed(() =>
  mobilePrimaryMenuPaths
    .map((path) => visiblePrimaryMenus.value.find((item) => item.path === path))
    .filter((item): item is MenuItem => Boolean(item))
)
const mobileWorkspaceMoreItems = computed(() => [
  ...visibleProjectWorkspaceMenus.value,
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
let runtimeCapabilityTimer: number | null = null

const isProjectWorkspaceActive = computed(() => visibleProjectWorkspaceMenus.value.some((item) => isMenuActive(item)))
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

async function goBackToApiGroups() {
  await router.push({ name: 'api-groups' })
}

/**
 * 手机端底部导航与更多面板统一复用同一套路由跳转，避免两套导航高亮与行为脱节。
 */
async function handleMobileNavigate(path: string) {
  await handleNavigate(path)
}

/**
 * 顶部 Hermes 入口统一走抽屉承载，桌面端输入框和手机端图标复用同一套打开逻辑。
 */
const handleOpenHermesDrawer = () => {
  if (!canUseHermes.value) {
    return
  }
  hermesDrawerVisible.value = true
  hermesDrawerRef.value?.openDrawer()
}

/**
 * 头部输入框按回车或点击按钮时，直接打开抽屉并把当前问题送入 Hermes。
 */
const handleAskHermes = async () => {
  if (!canUseHermes.value) {
    return
  }
  const question = headerHermesQuestion.value.trim()
  hermesDrawerVisible.value = true
  await nextTick()
  await hermesDrawerRef.value?.openWithQuestion(question)
  headerHermesQuestion.value = ''
}

/**
 * 业务工作台通过全局事件复用布局层唯一的 Hermes 抽屉，避免页面各自重复挂载一份助手实例。
 */
const handleExternalHermesOpen = async (event: Event) => {
  if (!canUseHermes.value) {
    return
  }
  const customEvent = event as CustomEvent<HermesOpenEventDetail | undefined>
  const question = customEvent.detail?.question?.trim() || ''
  if (question) {
    hermesDrawerVisible.value = true
    await nextTick()
    await hermesDrawerRef.value?.openWithQuestion(question)
    return
  }
  handleOpenHermesDrawer()
}

const handleCommand = async (command: string) => {
  mobileMoreDrawerVisible.value = false
  if (command === 'profile') {
    await router.push('/profile')
    return
  }
  if (command === 'feedback') {
    openFeedbackDialog()
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

async function handleMobileCommand(command: 'profile' | 'feedback' | 'logout') {
  await handleCommand(command)
}

const handleOpenNotifications = async () => {
  await notificationStore.openDrawer()
}

/**
 * 每次打开反馈弹窗前都重置表单，避免把上一次未提交内容带入下一次操作。
 */
const openFeedbackDialog = () => {
  resetFeedbackForm()
  feedbackDialogVisible.value = true
}

/**
 * 统一清空表单内容与校验状态，保证主动取消和提交成功后的交互一致。
 */
const resetFeedbackForm = () => {
  feedbackForm.type = 'SUGGESTION'
  feedbackForm.title = ''
  feedbackForm.content = ''
  feedbackFormRef.value?.clearValidate()
}

/**
 * 对话框完全关闭后再清理校验，避免关闭动画期间表单状态闪烁。
 */
const handleFeedbackDialogClosed = () => {
  resetFeedbackForm()
}

/**
 * 提交时先走表单校验，再调用后端接口真实入库，成功后关闭弹窗并恢复初始状态。
 */
const handleSubmitFeedback = async () => {
  const valid = await feedbackFormRef.value?.validate().catch(() => false)
  if (!valid) {
    return
  }

  feedbackSubmitting.value = true
  try {
    await createFeedbackApi({
      type: feedbackForm.type,
      title: feedbackForm.title.trim(),
      content: feedbackForm.content.trim()
    })
    ElMessage.success('反馈已提交')
    feedbackDialogVisible.value = false
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '反馈提交失败，请稍后再试')
  } finally {
    feedbackSubmitting.value = false
  }
}

// 将后端通知业务类型统一翻译为中文，避免抽屉里直接显示英文枚举值。
const NOTIFICATION_BIZ_TYPE_LABELS: Record<string, string> = {
  TASK: '工作项通知',
  TASK_ASSIGNED: '负责人分配',
  TASK_UNASSIGNED: '取消分配',
  TASK_STATUS_CHANGED: '状态变更',
  TASK_COMMENT: '任务评论',
  TASK_COLLABORATOR_ADDED: '协作通知',
  TASK_OVERDUE: '逾期提醒',
  CHANGE_REQUEST: '变更申请',
  AI_CLUB_PIPELINE: 'AI Club Pipeline',
  PIPELINE_BINDING: '外部 Jenkins 绑定',
  GITLAB_MERGED: '自动合并成功',
  GITLAB_AI_REJECTED: 'AI 审核拒绝',
  GITLAB_BRANCH_BEHIND: '分支落后提醒',
  GITLAB_AUTO_MERGE_LOG: '合并请求',
  DEVELOPMENT_EXECUTION_COMPLETED: '开发执行完成',
  DEVELOPMENT_EXECUTION_FAILED: '开发执行失败',
  DEVELOPMENT_EXECUTION_CANCELED: '开发执行已取消',
  DEVELOPMENT_EXECUTION_PLAN_CONFIRM: '开发执行待确认',
  TEST_AUTOMATION_COMPLETED: '自动化测试完成',
  TEST_AUTOMATION_FAILED: '自动化测试失败',
  TEST_AUTOMATION_CANCELED: '自动化测试已取消',
  CODEBASE_SCAN_COMPLETED: '仓库扫描完成',
  CODEBASE_SCAN_FAILED: '仓库扫描失败',
  CODEBASE_SCAN_CANCELED: '仓库扫描已取消',
  EXECUTION_COMPLETED: '执行完成',
  EXECUTION_FAILED: '执行失败',
  EXECUTION_CANCELED: '执行已取消',
  SYSTEM_ANNOUNCEMENT: '系统公告'
}

// 按业务类型和通知来源决定标签色调，让消息标签随全局主题变量联动变化。
const resolveNotificationBizKey = (item: NotificationItem) => {
  const bizType = item.bizType?.trim()
  if (bizType) {
    return bizType.toUpperCase()
  }
  return item.type?.trim().toUpperCase() || 'SYSTEM'
}

const resolveNotificationSource = (item: NotificationItem) => {
  if (item.senderName?.trim()) {
    return item.senderName.trim()
  }
  if (item.type === 'GITLAB') return '代码仓库协作'
  if (item.type === 'CICD') return '流水线中心'
  if (item.type === 'TASK') return '任务中心'
  return '系统消息'
}

const resolveNotificationContextLabel = (item: NotificationItem) => {
  const bizKey = resolveNotificationBizKey(item)
  if (NOTIFICATION_BIZ_TYPE_LABELS[bizKey]) {
    return NOTIFICATION_BIZ_TYPE_LABELS[bizKey]
  }
  if (item.type === 'TASK') return '工作项中心'
  if (item.type === 'GITLAB') return '代码协作'
  if (item.type === 'CICD') return '流水线监控'
  return '系统消息'
}

const resolveNotificationContextTone = (item: NotificationItem) => {
  const bizKey = resolveNotificationBizKey(item)
  if (bizKey === 'CHANGE_REQUEST') return 'warning'
  if (bizKey === 'TASK_UNASSIGNED' || bizKey === 'TASK_OVERDUE' || bizKey === 'GITLAB_BRANCH_BEHIND') return 'warning'
  if (bizKey === 'TASK_COMMENT') return 'info'
  if (bizKey === 'DEVELOPMENT_EXECUTION_PLAN_CONFIRM') return 'warning'
  if (bizKey.endsWith('_FAILED') || bizKey.endsWith('_CANCELED')) return 'warning'
  if (bizKey.endsWith('_COMPLETED')) return 'secondary'
  if (bizKey === 'DEVELOPMENT_EXECUTION_COMPLETED') return 'secondary'
  if (bizKey === 'TASK_ASSIGNED' || bizKey === 'TASK_STATUS_CHANGED' || bizKey === 'TASK_COLLABORATOR_ADDED') return 'secondary'
  if (bizKey === 'GITLAB_MERGED' || bizKey === 'GITLAB_AI_REJECTED' || bizKey === 'GITLAB_AUTO_MERGE_LOG') return 'tertiary'
  if (bizKey === 'SYSTEM_ANNOUNCEMENT') return 'neutral'
  if (item.type === 'TASK') return 'secondary'
  if (item.type === 'GITLAB') return 'tertiary'
  if (item.type === 'CICD') return 'info'
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

async function loadMenuPermissions() {
  try {
    permissionOptions.value = await listPermissionOptions()
  } catch {
    permissionOptions.value = []
  }
}

async function refreshRuntimeCapabilities() {
  try {
    await appStore.refreshRuntimeCapabilities()
  } catch {
    // ignore
  }
}

// 当用户进入系统管理子页时，展开态自动展开对应分组，避免丢失当前定位。
watch(
  [
    () => route.fullPath,
    () => effectiveSidebarCollapsed.value,
    () => visibleProjectWorkspaceMenus.value.length,
    () => visibleIntegrationMenus.value.length,
    () => visibleSystemMenus.value.length
  ],
  () => {
    if (effectiveSidebarCollapsed.value) {
      projectWorkspaceExpanded.value = false
      integrationMenuExpanded.value = false
      systemMenuExpanded.value = false
      return
    }
    if (isProjectWorkspaceActive.value) {
      projectWorkspaceExpanded.value = true
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
  loadMenuPermissions().catch(() => undefined)
  refreshRuntimeCapabilities().catch(() => undefined)
  syncViewportMode()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', syncViewportMode)
    window.addEventListener(HERMES_OPEN_EVENT_NAME, handleExternalHermesOpen as EventListener)
    runtimeCapabilityTimer = window.setInterval(() => {
      refreshRuntimeCapabilities().catch(() => undefined)
    }, 15000)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncViewportMode)
    window.removeEventListener(HERMES_OPEN_EVENT_NAME, handleExternalHermesOpen as EventListener)
    if (runtimeCapabilityTimer !== null) {
      window.clearInterval(runtimeCapabilityTimer)
      runtimeCapabilityTimer = null
    }
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

watch(
  [() => appStore.serverManagementEnabled, () => route.name],
  ([enabled, routeName]) => {
    if (enabled || (routeName !== 'servers' && routeName !== 'server-detail')) {
      return
    }
    ElMessage.warning('服务器管理模块当前已关闭')
    void router.replace('/dashboard')
  }
)

watch(
  pageTitle,
  (title) => {
    document.title = title ? `${title} - AI代理工程管理平台` : 'AI代理工程管理平台'
  },
  { immediate: true }
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

.layout-main-shell.wiki-space-main-shell {
  height: 100%;
  min-height: 0;
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

.header-back-link {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: rgba(243, 244, 245, 0.96);
  color: #516072;
  font-size: 13px;
  font-weight: 800;
}

.header-back-link:hover,
.header-back-link:focus-visible {
  background: rgba(var(--app-primary-container-rgb), 0.14);
  color: var(--app-primary);
}

.header-page-title {
  margin: 0;
  min-width: 0;
  max-width: min(46vw, 520px);
  flex: 0 1 520px;
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-search-shell {
  min-width: 300px;
  max-width: 540px;
  flex: 0 1 auto;
  width: clamp(300px, 32vw, 540px);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  background: rgba(243, 244, 245, 0.96);
  color: var(--app-text-muted);
  font-size: 13px;
  cursor: text;
}

.header-search-input,
.header-search-button,
.header-hermes-button {
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  font: inherit;
}

.header-search-input {
  flex: 1 1 auto;
  min-width: 0;
  background: transparent;
  color: var(--app-text);
  font-size: 13px;
}

.header-search-input::placeholder {
  color: var(--app-text-muted);
}

.header-search-button {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: #191c1d;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  flex: 0 1 auto;
  min-width: 0;
}

.header-profile-group {
  display: inline-flex;
  align-items: center;
  gap: 16px;
}

.header-user-dropdown {
  display: inline-flex;
  align-items: center;
}

.header-hermes-button,
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

.header-hermes-button:hover,
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

.layout-main.wiki-space-main {
  height: 100%;
  min-height: 0;
  padding: 16px 0 24px;
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

.feedback-dialog-copy {
  margin-bottom: 18px;
}

.feedback-dialog-title {
  color: var(--app-text);
  font-family: var(--app-font-heading);
  font-size: 20px;
  font-weight: 800;
}

.feedback-dialog-subtitle {
  margin: 8px 0 0;
  color: var(--app-text-soft);
  font-size: 13px;
  line-height: 1.7;
}

.feedback-dialog-form {
  margin-top: 4px;
}

.feedback-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 20px 8px;
  background: #f8f9fa;
}

.drawer-head-copy {
  min-width: 0;
}

.drawer-head-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
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
  margin-top: 4px;
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

.drawer-close-button {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: #191c1d;
  font-size: 12px;
  font-weight: 700;
}

.drawer-close-button:hover {
  background: rgba(15, 23, 42, 0.14);
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
  padding: 8px 14px 18px;
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
  border: 1px solid transparent;
}

.notification-item-chip.tertiary {
  background: rgba(var(--app-tertiary-rgb), 0.14);
  border-color: rgba(var(--app-tertiary-rgb), 0.22);
  color: var(--app-tertiary);
}

.notification-item-chip.secondary {
  background: rgba(var(--app-primary-container-rgb), 0.16);
  border-color: rgba(var(--app-primary-rgb), 0.18);
  color: var(--app-primary);
}

.notification-item-chip.info {
  background: rgba(var(--app-tertiary-rgb), 0.12);
  border-color: rgba(var(--app-tertiary-rgb), 0.2);
  color: var(--app-tertiary);
}

.notification-item-chip.warning {
  background: rgba(var(--app-secondary-rgb), 0.12);
  border-color: rgba(var(--app-secondary-rgb), 0.2);
  color: var(--app-secondary);
}

.notification-item-chip.neutral {
  background: var(--app-surface-muted);
  border-color: rgba(var(--app-outline-rgb), 0.16);
  color: var(--app-text-soft);
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

:deep(.message-center-drawer.is-mobile .el-drawer) {
  border-left: 0;
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -20px 60px -15px rgba(0, 0, 0, 0.18);
}

@media (max-width: 900px) {
  .drawer-head {
    align-items: stretch;
    flex-direction: column;
  }

  .drawer-head-actions {
    width: 100%;
    justify-content: space-between;
  }

  .drawer-mark-all-button,
  .drawer-close-button {
    flex: 1 1 calc(50% - 5px);
    justify-content: center;
  }
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

:deep(.feedback-dialog .el-dialog) {
  border-radius: 22px;
  overflow: hidden;
}

:deep(.feedback-dialog .el-dialog__header) {
  margin-right: 0;
  padding: 22px 24px 0;
}

:deep(.feedback-dialog .el-dialog__body) {
  padding: 12px 24px 10px;
}

:deep(.feedback-dialog .el-dialog__footer) {
  padding: 0 24px 24px;
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
    width: clamp(180px, 24vw, 360px);
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
  :deep(.feedback-dialog .el-dialog) {
    width: calc(100vw - 24px) !important;
    margin-top: 8vh !important;
  }

  .layout-header {
    flex-wrap: wrap;
    padding: 12px 16px;
    gap: 12px;
  }

  .header-search-group {
    gap: 10px;
    flex: 1 1 auto;
  }

  .header-actions {
    flex: 0 0 auto;
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
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }

  .header-search-shell {
    min-width: 120px;
    max-width: 220px;
    width: clamp(120px, 40vw, 220px);
    padding: 0 12px;
  }

  .header-search-button {
    padding-left: 10px;
    padding-right: 10px;
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
