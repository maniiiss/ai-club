<template>
  <div class="work-list-page">
    <section class="work-list-toolbar">
      <div class="work-list-toolbar-main">
        <div class="work-list-search-shell">
          <el-icon class="work-list-search-icon"><Search /></el-icon>
          <input
            v-model="filters.keyword"
            class="work-list-search-input"
            type="text"
            placeholder="搜索服务器名称、地址、用户或说明..."
            @keyup.enter="handleSearch"
          />
        </div>
        <span class="work-list-toolbar-divider" aria-hidden="true"></span>
        <el-popover v-model:visible="filterPopoverVisible" trigger="click" placement="bottom-start" :width="320" popper-class="work-list-filter-popper">
          <template #reference>
            <button class="work-list-toolbar-button" type="button">
              <el-icon><Filter /></el-icon>
              <span>筛选</span>
            </button>
          </template>
          <div class="work-list-filter-panel work-list-compact-input">
            <div class="work-list-filter-field">
              <label>启用状态</label>
              <el-select v-model="filters.enabled" clearable placeholder="启用状态" style="width: 100%" :teleported="false">
                <el-option label="启用" :value="true" />
                <el-option label="停用" :value="false" />
              </el-select>
            </div>
            <div class="work-list-filter-actions">
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </div>
          </div>
        </el-popover>
        <button class="work-list-toolbar-button" type="button" @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>重置</span>
        </button>
        <button v-if="canManage && isMobileViewport" class="work-list-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新增服务器</span>
        </button>
      </div>

      <div v-if="canManage && !isMobileViewport" class="work-list-toolbar-side">
        <button class="work-list-create-button" type="button" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          <span>新增服务器</span>
        </button>
      </div>
    </section>

    <el-alert
      v-if="!appStore.serverManagementEnabled"
      type="warning"
      show-icon
      :closable="false"
      title="服务器管理模块当前已关闭"
      description="后台已停用服务器管理能力，当前页面只保留概览与入口提示。"
      class="server-disabled-alert"
    />

    <section class="work-list-shell">
      <div class="work-list-scroll mobile-card-scroll" v-loading="loading">
        <section v-if="serverList.length" class="server-card-grid">
          <article
            v-for="item in serverList"
            :key="item.id"
            class="server-card"
            role="button"
            tabindex="0"
            @click="openDetail(item.id)"
            @keyup.enter="openDetail(item.id)"
          >
            <header class="server-card-head">
              <div class="server-card-heading">
                <h2>{{ item.name }}</h2>
                <div class="server-card-subtitle">{{ item.description || `${item.username}@${item.host}` }}</div>
              </div>
              <div class="server-card-tag-group">
                <span class="management-list-pill success">{{ item.osType }}</span>
                <span class="management-list-pill info">{{ item.authType === 'PASSWORD' ? '密码' : '私钥' }}</span>
                <span class="management-list-pill" :class="item.enabled ? 'success' : 'neutral'">
                  {{ item.enabled ? '启用' : '停用' }}
                </span>
                <span class="management-list-pill" :class="probeTone(item.lastProbeStatus)">
                  {{ probeLabel(item.lastProbeStatus) }}
                </span>
              </div>
            </header>

            <div class="server-card-meta-line">
              <span>地址：{{ item.host }}:{{ item.port }}</span>
              <span>用户：{{ item.username }}</span>
              <span>最近采样：{{ item.lastProbedAt || '-' }}</span>
            </div>

            <div class="server-card-info-grid">
              <div class="server-card-info-item">
                <span class="server-card-info-label">最新 CPU</span>
                <div class="server-card-info-value">
                  <strong>{{ percentText(item.lastCpuUsagePercent) }}</strong>
                </div>
              </div>
              <div class="server-card-info-item">
                <span class="server-card-info-label">最新内存</span>
                <div class="server-card-info-value">
                  <strong>{{ percentText(item.lastMemoryUsagePercent) }}</strong>
                </div>
              </div>
              <div class="server-card-info-item">
                <span class="server-card-info-label">最新磁盘</span>
                <div class="server-card-info-value">
                  <strong>{{ percentText(item.lastDiskUsagePercent) }}</strong>
                </div>
              </div>
              <div class="server-card-info-item">
                <span class="server-card-info-label">活跃告警</span>
                <div class="server-card-info-value">
                  <strong>{{ item.activeAlertCount }}</strong>
                </div>
              </div>
              <div class="server-card-info-item server-card-info-item-full">
                <span class="server-card-info-label">接入特性</span>
                <div class="server-card-info-value">
                  <span class="management-list-empty">
                    {{ item.jumpHostEnabled ? '经跳板机接入' : '直连接入' }} ·
                    主机{{ item.passwordConfigured || item.privateKeyConfigured ? '已配置凭据' : '未配置凭据' }}
                    <template v-if="item.jumpHostEnabled">
                      · 跳板机{{ item.jumpPasswordConfigured || item.jumpPrivateKeyConfigured ? '已配置凭据' : '未配置凭据' }}
                    </template>
                  </span>
                </div>
              </div>
              <div class="server-card-info-item server-card-info-item-full">
                <span class="server-card-info-label">最近状态摘要</span>
                <div class="server-card-info-value">
                  <span class="management-list-empty">{{ item.lastProbeMessage || '尚未执行资源探测' }}</span>
                </div>
              </div>
            </div>

            <div class="server-card-actions-shell">
              <div class="server-card-actions">
                <el-button @click.stop="openDetail(item.id)">
                  <el-icon><View /></el-icon>
                  <span>详情</span>
                </el-button>
                <el-button v-if="canManage" @click.stop="handleTest(item.id)">
                  <el-icon><Promotion /></el-icon>
                  <span>测试</span>
                </el-button>
                <el-button v-if="canManage" @click.stop="openEditDialog(item.id)">
                  <el-icon><EditPen /></el-icon>
                  <span>编辑</span>
                </el-button>
                <el-button v-if="canManage" type="danger" plain @click.stop="handleDelete(item.id)">
                  <el-icon><Delete /></el-icon>
                  <span>删除</span>
                </el-button>
              </div>
            </div>
          </article>
        </section>
        <div v-if="hasMoreMobileItems" ref="sentinelRef" class="mobile-waterfall-sentinel"></div>
        <div v-if="!serverList.length" class="work-list-empty-state">
          <el-empty description="当前筛选条件下暂无服务器" />
        </div>
      </div>

      <div v-if="showDesktopPagination" class="work-list-footer">
        <div class="work-list-footer-total">
          共 <span>{{ pagination.total }}</span> 条
        </div>
        <div class="work-list-footer-controls">
          <div class="work-list-page-size work-list-compact-input">
            <span>每页</span>
            <el-select v-model="pagination.size" size="small" style="width: 92px" @change="handlePageSizeChange">
              <el-option :value="6" label="6" />
              <el-option :value="12" label="12" />
              <el-option :value="24" label="24" />
              <el-option :value="48" label="48" />
            </el-select>
          </div>
          <div class="work-list-page-nav">
            <button class="work-list-page-button" type="button" :disabled="pagination.page <= 1" @click="handlePrevPage">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <span class="work-list-page-text">第 {{ pagination.page }} / {{ totalPages }} 页</span>
            <button class="work-list-page-button" type="button" :disabled="pagination.page >= totalPages" @click="handleNextPage">
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </section>

    <el-dialog v-if="!isMobileViewport" v-model="dialogVisible" :title="dialogTitle" width="820px" class="platform-form-dialog" align-center>
      <template #header>
        <PlatformDialogHeader :title="dialogTitle" :subtitle="dialogSubtitle" :icon="Connection" />
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">基础连接</div>
            <div class="platform-form-section-subtitle">配置 Linux 主机、登录账号与基础启用状态。</div>
          </div>
          <div class="server-form-grid">
            <el-form-item label="服务器名称" prop="name">
              <el-input v-model="form.name" placeholder="例如：生产应用服务器 A" />
            </el-form-item>
            <el-form-item label="操作系统">
              <el-select v-model="form.osType">
                <el-option label="Linux" value="LINUX" />
              </el-select>
            </el-form-item>
            <el-form-item label="主机地址" prop="host">
              <el-input v-model="form.host" placeholder="例如：10.10.10.8" />
            </el-form-item>
            <el-form-item label="SSH 端口" prop="port">
              <el-input-number v-model="form.port" :min="1" :max="65535" style="width: 100%" />
            </el-form-item>
            <el-form-item label="SSH 用户名" prop="username">
              <el-input v-model="form.username" placeholder="例如：root / deploy" />
            </el-form-item>
            <el-form-item label="启用">
              <el-switch v-model="form.enabled" />
            </el-form-item>
          </div>
          <el-form-item label="说明">
            <el-input v-model="form.description" type="textarea" :rows="3" placeholder="可填写业务用途、机器分组和备注。" />
          </el-form-item>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">主机认证</div>
            <div class="platform-form-section-subtitle">敏感值不会回显；编辑时留空表示保留现有密文。</div>
          </div>
          <el-form-item label="认证方式">
            <el-radio-group v-model="form.authType">
              <el-radio-button label="PASSWORD">密码</el-radio-button>
              <el-radio-button label="PRIVATE_KEY">私钥</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <template v-if="form.authType === 'PASSWORD'">
            <el-form-item label="SSH 密码">
              <el-input v-model="form.password" type="password" show-password :placeholder="secretPlaceholder(form.passwordConfigured)" />
            </el-form-item>
          </template>
          <template v-else>
            <el-form-item label="SSH 私钥">
              <el-input v-model="form.privateKey" type="textarea" :rows="5" :placeholder="secretPlaceholder(form.privateKeyConfigured, '粘贴 PEM 私钥，留空保留旧值')" />
            </el-form-item>
            <el-form-item label="私钥口令">
              <el-input v-model="form.privateKeyPassphrase" type="password" show-password :placeholder="secretPlaceholder(form.privateKeyPassphraseConfigured)" />
            </el-form-item>
          </template>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">跳板机</div>
            <div class="platform-form-section-subtitle">第一版支持单跳内嵌配置；跳板机认证同样按密文保存。</div>
          </div>
          <el-form-item label="启用跳板机">
            <el-switch v-model="form.jumpHostEnabled" />
          </el-form-item>
          <template v-if="form.jumpHostEnabled">
            <div class="server-form-grid">
              <el-form-item label="跳板机地址">
                <el-input v-model="form.jumpHost" placeholder="例如：172.16.10.2" />
              </el-form-item>
              <el-form-item label="跳板机端口">
                <el-input-number v-model="form.jumpPort" :min="1" :max="65535" style="width: 100%" />
              </el-form-item>
              <el-form-item label="跳板机用户">
                <el-input v-model="form.jumpUsername" placeholder="例如：jump-admin" />
              </el-form-item>
              <el-form-item label="跳板机认证方式">
                <el-select v-model="form.jumpAuthType">
                  <el-option label="密码" value="PASSWORD" />
                  <el-option label="私钥" value="PRIVATE_KEY" />
                </el-select>
              </el-form-item>
            </div>
            <template v-if="form.jumpAuthType === 'PASSWORD'">
              <el-form-item label="跳板机密码">
                <el-input v-model="form.jumpPassword" type="password" show-password :placeholder="secretPlaceholder(form.jumpPasswordConfigured)" />
              </el-form-item>
            </template>
            <template v-else>
              <el-form-item label="跳板机私钥">
                <el-input v-model="form.jumpPrivateKey" type="textarea" :rows="5" :placeholder="secretPlaceholder(form.jumpPrivateKeyConfigured, '粘贴跳板机私钥，留空保留旧值')" />
              </el-form-item>
              <el-form-item label="跳板机私钥口令">
                <el-input v-model="form.jumpPrivateKeyPassphrase" type="password" show-password :placeholder="secretPlaceholder(form.jumpPrivateKeyPassphraseConfigured)" />
              </el-form-item>
            </template>
          </template>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">告警覆盖</div>
            <div class="platform-form-section-subtitle">留空表示继续使用环境变量默认值。</div>
          </div>
          <div class="server-form-grid">
            <el-form-item label="连通性告警覆盖">
              <el-select v-model="form.connectivityAlertEnabledOverride" clearable placeholder="继承默认值">
                <el-option label="开启" :value="true" />
                <el-option label="关闭" :value="false" />
              </el-select>
            </el-form-item>
            <el-form-item label="CPU 阈值">
              <el-input-number v-model="form.cpuThresholdPercentOverride" :min="1" :max="100" style="width: 100%" />
            </el-form-item>
            <el-form-item label="内存阈值">
              <el-input-number v-model="form.memoryThresholdPercentOverride" :min="1" :max="100" style="width: 100%" />
            </el-form-item>
            <el-form-item label="磁盘阈值">
              <el-input-number v-model="form.diskThresholdPercentOverride" :min="1" :max="100" style="width: 100%" />
            </el-form-item>
            <el-form-item label="连续越线次数">
              <el-input-number v-model="form.consecutiveBreachesOverride" :min="1" :max="20" style="width: 100%" />
            </el-form-item>
            <el-form-item label="冷却分钟数">
              <el-input-number v-model="form.cooldownMinutesOverride" :min="1" :max="1440" style="width: 100%" />
            </el-form-item>
          </div>
          <el-form-item label="通知人">
            <el-select v-model="form.recipientUserIds" multiple filterable collapse-tags collapse-tags-tooltip placeholder="选择收到服务器告警的通知人" style="width: 100%">
              <el-option v-for="user in userOptions" :key="user.id" :label="user.nickname || user.username" :value="user.id" />
            </el-select>
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <div class="platform-dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 移动端服务器编辑抽屉，表单较长使用全屏高度。 -->
    <MobileFormDrawer
      v-else
      v-model="dialogVisible"
      :title="dialogTitle"
      :subtitle="dialogSubtitle"
      :submit-text="'保存'"
      :submitting="submitting"
      :header-icon="Connection"
      :close-on-click-modal="true"
      size="100%"
      @submit="handleSubmit"
      @cancel="dialogVisible = false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="platform-form-layout">
        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">基础连接</div>
            <div class="platform-form-section-subtitle">配置 Linux 主机、登录账号与基础启用状态。</div>
          </div>
          <div class="server-form-grid">
            <el-form-item label="服务器名称" prop="name">
              <el-input v-model="form.name" placeholder="例如：生产应用服务器 A" />
            </el-form-item>
            <el-form-item label="操作系统">
              <el-select v-model="form.osType">
                <el-option label="Linux" value="LINUX" />
              </el-select>
            </el-form-item>
            <el-form-item label="主机地址" prop="host">
              <el-input v-model="form.host" placeholder="例如：10.10.10.8" />
            </el-form-item>
            <el-form-item label="SSH 端口" prop="port">
              <el-input-number v-model="form.port" :min="1" :max="65535" style="width: 100%" />
            </el-form-item>
            <el-form-item label="SSH 用户名" prop="username">
              <el-input v-model="form.username" placeholder="例如：root / deploy" />
            </el-form-item>
            <el-form-item label="启用">
              <el-switch v-model="form.enabled" />
            </el-form-item>
          </div>
          <el-form-item label="说明">
            <el-input v-model="form.description" type="textarea" :rows="3" placeholder="可填写业务用途、机器分组和备注。" />
          </el-form-item>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">主机认证</div>
            <div class="platform-form-section-subtitle">敏感值不会回显；编辑时留空表示保留现有密文。</div>
          </div>
          <el-form-item label="认证方式">
            <el-radio-group v-model="form.authType">
              <el-radio-button label="PASSWORD">密码</el-radio-button>
              <el-radio-button label="PRIVATE_KEY">私钥</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <template v-if="form.authType === 'PASSWORD'">
            <el-form-item label="SSH 密码">
              <el-input v-model="form.password" type="password" show-password :placeholder="secretPlaceholder(form.passwordConfigured)" />
            </el-form-item>
          </template>
          <template v-else>
            <el-form-item label="SSH 私钥">
              <el-input v-model="form.privateKey" type="textarea" :rows="5" :placeholder="secretPlaceholder(form.privateKeyConfigured, '粘贴 PEM 私钥，留空保留旧值')" />
            </el-form-item>
            <el-form-item label="私钥口令">
              <el-input v-model="form.privateKeyPassphrase" type="password" show-password :placeholder="secretPlaceholder(form.privateKeyPassphraseConfigured)" />
            </el-form-item>
          </template>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">跳板机</div>
            <div class="platform-form-section-subtitle">第一版支持单跳内嵌配置；跳板机认证同样按密文保存。</div>
          </div>
          <el-form-item label="启用跳板机">
            <el-switch v-model="form.jumpHostEnabled" />
          </el-form-item>
          <template v-if="form.jumpHostEnabled">
            <div class="server-form-grid">
              <el-form-item label="跳板机地址">
                <el-input v-model="form.jumpHost" placeholder="例如：172.16.10.2" />
              </el-form-item>
              <el-form-item label="跳板机端口">
                <el-input-number v-model="form.jumpPort" :min="1" :max="65535" style="width: 100%" />
              </el-form-item>
              <el-form-item label="跳板机用户">
                <el-input v-model="form.jumpUsername" placeholder="例如：jump-admin" />
              </el-form-item>
              <el-form-item label="跳板机认证方式">
                <el-select v-model="form.jumpAuthType">
                  <el-option label="密码" value="PASSWORD" />
                  <el-option label="私钥" value="PRIVATE_KEY" />
                </el-select>
              </el-form-item>
            </div>
            <template v-if="form.jumpAuthType === 'PASSWORD'">
              <el-form-item label="跳板机密码">
                <el-input v-model="form.jumpPassword" type="password" show-password :placeholder="secretPlaceholder(form.jumpPasswordConfigured)" />
              </el-form-item>
            </template>
            <template v-else>
              <el-form-item label="跳板机私钥">
                <el-input v-model="form.jumpPrivateKey" type="textarea" :rows="5" :placeholder="secretPlaceholder(form.jumpPrivateKeyConfigured, '粘贴跳板机私钥，留空保留旧值')" />
              </el-form-item>
              <el-form-item label="跳板机私钥口令">
                <el-input v-model="form.jumpPrivateKeyPassphrase" type="password" show-password :placeholder="secretPlaceholder(form.jumpPrivateKeyPassphraseConfigured)" />
              </el-form-item>
            </template>
          </template>
        </section>

        <section class="platform-form-section">
          <div class="platform-form-section-head">
            <div class="platform-form-section-title">告警覆盖</div>
            <div class="platform-form-section-subtitle">留空表示继续使用环境变量默认值。</div>
          </div>
          <div class="server-form-grid">
            <el-form-item label="连通性告警覆盖">
              <el-select v-model="form.connectivityAlertEnabledOverride" clearable placeholder="继承默认值">
                <el-option label="开启" :value="true" />
                <el-option label="关闭" :value="false" />
              </el-select>
            </el-form-item>
            <el-form-item label="CPU 阈值">
              <el-input-number v-model="form.cpuThresholdPercentOverride" :min="1" :max="100" style="width: 100%" />
            </el-form-item>
            <el-form-item label="内存阈值">
              <el-input-number v-model="form.memoryThresholdPercentOverride" :min="1" :max="100" style="width: 100%" />
            </el-form-item>
            <el-form-item label="磁盘阈值">
              <el-input-number v-model="form.diskThresholdPercentOverride" :min="1" :max="100" style="width: 100%" />
            </el-form-item>
            <el-form-item label="连续越线次数">
              <el-input-number v-model="form.consecutiveBreachesOverride" :min="1" :max="20" style="width: 100%" />
            </el-form-item>
            <el-form-item label="冷却分钟数">
              <el-input-number v-model="form.cooldownMinutesOverride" :min="1" :max="1440" style="width: 100%" />
            </el-form-item>
          </div>
          <el-form-item label="通知人">
            <el-select v-model="form.recipientUserIds" multiple filterable collapse-tags collapse-tags-tooltip placeholder="选择收到服务器告警的通知人" style="width: 100%">
              <el-option v-for="user in userOptions" :key="user.id" :label="user.nickname || user.username" :value="user.id" />
            </el-select>
          </el-form-item>
        </section>
      </el-form>
    </MobileFormDrawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { ArrowLeft, ArrowRight, Connection, Delete, EditPen, Filter, Plus, Promotion, RefreshRight, Search, View } from '@element-plus/icons-vue'
import PlatformDialogHeader from '@/components/PlatformDialogHeader.vue'
import MobileFormDrawer from '@/components/MobileFormDrawer.vue'
import { createServer, deleteServer, getServerDetail, pageServers, testServerConnection, updateServer, type ServerPayload } from '@/api/servers'
import { listUserOptions } from '@/api/access'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { ServerDetailItem, ServerSummaryItem, UserOptionItem } from '@/types/platform'
import { useMobileViewport } from '@/utils/mobileViewport'
import { useMobileWaterfallPagination } from '@/utils/mobileWaterfallPagination'

interface ServerFormState {
  name: string
  description: string
  host: string
  port: number
  username: string
  osType: 'LINUX'
  authType: 'PASSWORD' | 'PRIVATE_KEY'
  password: string
  privateKey: string
  privateKeyPassphrase: string
  enabled: boolean
  jumpHostEnabled: boolean
  jumpHost: string
  jumpPort: number | null
  jumpUsername: string
  jumpAuthType: 'PASSWORD' | 'PRIVATE_KEY' | ''
  jumpPassword: string
  jumpPrivateKey: string
  jumpPrivateKeyPassphrase: string
  connectivityAlertEnabledOverride: boolean | null
  cpuThresholdPercentOverride: number | null
  memoryThresholdPercentOverride: number | null
  diskThresholdPercentOverride: number | null
  consecutiveBreachesOverride: number | null
  cooldownMinutesOverride: number | null
  recipientUserIds: number[]
  passwordConfigured: boolean
  privateKeyConfigured: boolean
  privateKeyPassphraseConfigured: boolean
  jumpPasswordConfigured: boolean
  jumpPrivateKeyConfigured: boolean
  jumpPrivateKeyPassphraseConfigured: boolean
}

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('server:manage'))
const { isMobileViewport } = useMobileViewport()
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const currentServerId = ref<number | null>(null)
const serverList = ref<ServerSummaryItem[]>([])
const userOptions = ref<UserOptionItem[]>([])
const formRef = ref<FormInstance>()
const filterPopoverVisible = ref(false)
const filters = reactive<{ keyword: string; enabled: boolean | undefined }>({ keyword: '', enabled: undefined })
const pagination = reactive({ page: 1, size: 12, total: 0 })
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1))
const { sentinelRef, requestPage, requestSize, showDesktopPagination, hasMoreMobileItems, resetMobilePagination } = useMobileWaterfallPagination({
  isMobileViewport,
  loading,
  itemCount: computed(() => serverList.value.length),
  pagination,
  loadPage: async () => loadServers(),
  batchSize: 12
})
const form = reactive<ServerFormState>({
  name: '',
  description: '',
  host: '',
  port: 22,
  username: '',
  osType: 'LINUX',
  authType: 'PASSWORD',
  password: '',
  privateKey: '',
  privateKeyPassphrase: '',
  enabled: true,
  jumpHostEnabled: false,
  jumpHost: '',
  jumpPort: 22,
  jumpUsername: '',
  jumpAuthType: 'PASSWORD',
  jumpPassword: '',
  jumpPrivateKey: '',
  jumpPrivateKeyPassphrase: '',
  connectivityAlertEnabledOverride: null,
  cpuThresholdPercentOverride: null,
  memoryThresholdPercentOverride: null,
  diskThresholdPercentOverride: null,
  consecutiveBreachesOverride: null,
  cooldownMinutesOverride: null,
  recipientUserIds: [],
  passwordConfigured: false,
  privateKeyConfigured: false,
  privateKeyPassphraseConfigured: false,
  jumpPasswordConfigured: false,
  jumpPrivateKeyConfigured: false,
  jumpPrivateKeyPassphraseConfigured: false
})

const dialogTitle = computed(() => (isEditing.value ? '编辑服务器' : '新增服务器'))
const dialogSubtitle = computed(() => (isEditing.value ? '更新接入凭据、跳板机与告警覆盖值。' : '录入 Linux 服务器和可选跳板机配置。'))

const rules: FormRules<ServerFormState> = {
  name: [{ required: true, message: '请输入服务器名称', trigger: 'blur' }],
  host: [{ required: true, message: '请输入服务器地址', trigger: 'blur' }],
  port: [{ required: true, message: '请输入 SSH 端口', trigger: 'change' }],
  username: [{ required: true, message: '请输入 SSH 用户名', trigger: 'blur' }]
}

const probeLabel = (status?: string | null) => {
  if (status === 'SUCCESS') return '在线'
  if (status === 'FAILED') return '异常'
  return '未探测'
}

const probeTone = (status?: string | null) => {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'neutral'
}

const percentText = (value?: number | null) => (value === null || value === undefined ? '--' : `${value}%`)

const secretPlaceholder = (configured: boolean, fallback = '留空表示保留已配置密文') =>
  configured ? '已配置敏感值，留空保留旧值' : fallback

const resetForm = () => {
  currentServerId.value = null
  isEditing.value = false
  form.name = ''
  form.description = ''
  form.host = ''
  form.port = 22
  form.username = ''
  form.osType = 'LINUX'
  form.authType = 'PASSWORD'
  form.password = ''
  form.privateKey = ''
  form.privateKeyPassphrase = ''
  form.enabled = true
  form.jumpHostEnabled = false
  form.jumpHost = ''
  form.jumpPort = 22
  form.jumpUsername = ''
  form.jumpAuthType = 'PASSWORD'
  form.jumpPassword = ''
  form.jumpPrivateKey = ''
  form.jumpPrivateKeyPassphrase = ''
  form.connectivityAlertEnabledOverride = null
  form.cpuThresholdPercentOverride = null
  form.memoryThresholdPercentOverride = null
  form.diskThresholdPercentOverride = null
  form.consecutiveBreachesOverride = null
  form.cooldownMinutesOverride = null
  form.recipientUserIds = []
  form.passwordConfigured = false
  form.privateKeyConfigured = false
  form.privateKeyPassphraseConfigured = false
  form.jumpPasswordConfigured = false
  form.jumpPrivateKeyConfigured = false
  form.jumpPrivateKeyPassphraseConfigured = false
  formRef.value?.clearValidate()
}

const applyDetailToForm = (detail: ServerDetailItem) => {
  form.name = detail.name
  form.description = detail.description
  form.host = detail.host
  form.port = detail.port
  form.username = detail.username
  form.osType = 'LINUX'
  form.authType = detail.authType === 'PRIVATE_KEY' ? 'PRIVATE_KEY' : 'PASSWORD'
  form.password = ''
  form.privateKey = ''
  form.privateKeyPassphrase = ''
  form.enabled = detail.enabled
  form.jumpHostEnabled = detail.jumpHostEnabled
  form.jumpHost = detail.jumpHost || ''
  form.jumpPort = detail.jumpPort || 22
  form.jumpUsername = detail.jumpUsername || ''
  form.jumpAuthType = detail.jumpAuthType === 'PRIVATE_KEY' ? 'PRIVATE_KEY' : 'PASSWORD'
  form.jumpPassword = ''
  form.jumpPrivateKey = ''
  form.jumpPrivateKeyPassphrase = ''
  form.connectivityAlertEnabledOverride = detail.effectiveAlertConfig.connectivityAlertEnabledOverride
  form.cpuThresholdPercentOverride = detail.effectiveAlertConfig.cpuThresholdPercentOverride
  form.memoryThresholdPercentOverride = detail.effectiveAlertConfig.memoryThresholdPercentOverride
  form.diskThresholdPercentOverride = detail.effectiveAlertConfig.diskThresholdPercentOverride
  form.consecutiveBreachesOverride = detail.effectiveAlertConfig.consecutiveBreachesOverride
  form.cooldownMinutesOverride = detail.effectiveAlertConfig.cooldownMinutesOverride
  form.recipientUserIds = detail.effectiveAlertConfig.recipientUsers.map((item) => item.id)
  form.passwordConfigured = detail.passwordConfigured
  form.privateKeyConfigured = detail.privateKeyConfigured
  form.privateKeyPassphraseConfigured = detail.privateKeyConfigured
  form.jumpPasswordConfigured = detail.jumpPasswordConfigured
  form.jumpPrivateKeyConfigured = detail.jumpPrivateKeyConfigured
  form.jumpPrivateKeyPassphraseConfigured = detail.jumpPrivateKeyConfigured
}

const loadServers = async () => {
  loading.value = true
  try {
    const pageData = await pageServers({
      page: requestPage.value,
      size: requestSize.value,
      keyword: filters.keyword || undefined,
      enabled: filters.enabled
    })
    serverList.value = pageData.records
    pagination.total = pageData.total
  } finally {
    loading.value = false
  }
}

const handleSearch = async () => {
  filterPopoverVisible.value = false
  resetMobilePagination()
  await loadServers()
}

const handleReset = async () => {
  filters.keyword = ''
  filters.enabled = undefined
  resetMobilePagination()
  await loadServers()
}

const handlePageSizeChange = async () => {
  resetMobilePagination()
  await loadServers()
}

const handlePrevPage = async () => {
  if (pagination.page <= 1) return
  pagination.page -= 1
  await loadServers()
}

const handleNextPage = async () => {
  if (pagination.page >= totalPages.value) return
  pagination.page += 1
  await loadServers()
}

const openCreateDialog = () => {
  resetForm()
  dialogVisible.value = true
}

const openEditDialog = async (serverId: number) => {
  resetForm()
  isEditing.value = true
  currentServerId.value = serverId
  const detail = await getServerDetail(serverId)
  applyDetailToForm(detail)
  dialogVisible.value = true
}

const openDetail = async (serverId: number) => {
  await router.push({ name: 'server-detail', params: { serverId } })
}

const buildPayload = (): ServerPayload => ({
  name: form.name.trim(),
  description: form.description.trim(),
  host: form.host.trim(),
  port: form.port,
  username: form.username.trim(),
  osType: 'LINUX',
  authType: form.authType,
  password: form.authType === 'PASSWORD' ? form.password : undefined,
  privateKey: form.authType === 'PRIVATE_KEY' ? form.privateKey : undefined,
  privateKeyPassphrase: form.authType === 'PRIVATE_KEY' ? form.privateKeyPassphrase : undefined,
  enabled: form.enabled,
  jumpHostEnabled: form.jumpHostEnabled,
  jumpHost: form.jumpHostEnabled ? form.jumpHost.trim() : '',
  jumpPort: form.jumpHostEnabled ? form.jumpPort : null,
  jumpUsername: form.jumpHostEnabled ? form.jumpUsername.trim() : '',
  jumpAuthType: form.jumpHostEnabled ? (form.jumpAuthType || 'PASSWORD') : '',
  jumpPassword: form.jumpHostEnabled && form.jumpAuthType === 'PASSWORD' ? form.jumpPassword : undefined,
  jumpPrivateKey: form.jumpHostEnabled && form.jumpAuthType === 'PRIVATE_KEY' ? form.jumpPrivateKey : undefined,
  jumpPrivateKeyPassphrase: form.jumpHostEnabled && form.jumpAuthType === 'PRIVATE_KEY' ? form.jumpPrivateKeyPassphrase : undefined,
  connectivityAlertEnabledOverride: form.connectivityAlertEnabledOverride,
  cpuThresholdPercentOverride: form.cpuThresholdPercentOverride,
  memoryThresholdPercentOverride: form.memoryThresholdPercentOverride,
  diskThresholdPercentOverride: form.diskThresholdPercentOverride,
  consecutiveBreachesOverride: form.consecutiveBreachesOverride,
  cooldownMinutesOverride: form.cooldownMinutesOverride,
  recipientUserIds: form.recipientUserIds
})

const validateSecrets = () => {
  if (form.authType === 'PASSWORD' && !form.password.trim() && !form.passwordConfigured) {
    ElMessage.warning('请填写主机 SSH 密码')
    return false
  }
  if (form.authType === 'PRIVATE_KEY' && !form.privateKey.trim() && !form.privateKeyConfigured) {
    ElMessage.warning('请填写主机 SSH 私钥')
    return false
  }
  if (form.jumpHostEnabled) {
    if (!form.jumpHost.trim() || !form.jumpUsername.trim()) {
      ElMessage.warning('请完善跳板机地址和用户名')
      return false
    }
    if (form.jumpAuthType === 'PASSWORD' && !form.jumpPassword.trim() && !form.jumpPasswordConfigured) {
      ElMessage.warning('请填写跳板机密码')
      return false
    }
    if (form.jumpAuthType === 'PRIVATE_KEY' && !form.jumpPrivateKey.trim() && !form.jumpPrivateKeyConfigured) {
      ElMessage.warning('请填写跳板机私钥')
      return false
    }
  }
  return true
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !validateSecrets()) {
    return
  }
  submitting.value = true
  try {
    const payload = buildPayload()
    if (isEditing.value && currentServerId.value !== null) {
      await updateServer(currentServerId.value, payload)
      ElMessage.success('服务器配置已更新')
    } else {
      await createServer(payload)
      ElMessage.success('服务器已创建')
    }
    dialogVisible.value = false
    await loadServers()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '保存服务器失败')
  } finally {
    submitting.value = false
  }
}

const handleDelete = async (serverId: number) => {
  try {
    await ElMessageBox.confirm('删除后会一并清理该服务器的采样和告警状态，确认继续吗？', '提示', { type: 'warning' })
    await deleteServer(serverId)
    ElMessage.success('服务器已删除')
    await loadServers()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.message || '删除服务器失败')
    }
  }
}

const handleTest = async (serverId: number) => {
  try {
    const result = await testServerConnection(serverId)
    ElMessage.success(result.lastProbeMessage || '服务器连接成功')
    await loadServers()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '测试连接失败')
    await loadServers()
  }
}

const bootstrap = async () => {
  userOptions.value = await listUserOptions()
  await loadServers()
  const editId = Number(route.query.editId)
  if (Number.isFinite(editId) && editId > 0) {
    await openEditDialog(editId)
    await router.replace({ name: 'servers' })
  }
}

onMounted(() => {
  bootstrap().catch((error: any) => {
    ElMessage.error(error?.response?.data?.message || '加载服务器列表失败')
  })
})
</script>

<style scoped>
.server-disabled-alert {
  margin-bottom: 12px;
}

.work-list-shell,
.work-list-scroll,
.work-list-footer {
  background: transparent;
  box-shadow: none;
}

.work-list-shell {
  border-radius: 0;
  overflow: visible;
}

.work-list-scroll {
  min-height: 0;
}

.work-list-footer {
  border-top: none;
  padding-left: 0;
  padding-right: 0;
}

.work-list-empty-state {
  min-height: calc(100vh - 320px);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.server-card-grid {
  --server-card-width: 360px;
  --server-card-min-height: 300px;

  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--server-card-width)), var(--server-card-width)));
  grid-auto-rows: minmax(var(--server-card-min-height), auto);
  gap: 14px;
  align-items: stretch;
}

.server-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  height: 100%;
  padding: 18px;
  box-sizing: border-box;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.97), rgba(248, 250, 252, 0.94)),
    radial-gradient(circle at 94% 2%, rgba(22, 163, 74, 0.08), transparent 34%);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  cursor: pointer;
}

.server-card-head,
.server-card-meta-line,
.server-card-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.server-card-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  align-items: flex-start;
}

.server-card-heading {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.server-card-heading h2 {
  margin: 0;
  color: #172033;
  font-size: 20px;
  line-height: 1.35;
}

.server-card-subtitle {
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}

.server-card-tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  max-width: 100%;
}

.server-card-meta-line {
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
  row-gap: 4px;
}

.server-card-meta-line span {
  max-width: 100%;
  word-break: break-word;
}

.server-card-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.server-card-info-item {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.server-card-info-item-full {
  grid-column: 1 / -1;
}

.server-card-info-label {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.server-card-info-value {
  min-width: 0;
}

.server-card-info-value strong {
  color: #172033;
  font-size: 20px;
  line-height: 1.2;
}

.server-card-info-value .management-list-empty {
  display: inline-block;
  max-width: 100%;
  white-space: normal;
  word-break: break-word;
}

.server-card-actions-shell {
  display: flex;
  flex: 0 0 auto;
  align-self: stretch;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

.server-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
  min-height: 36px;
}

.server-card-actions :deep(.el-button) {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 14px;
  margin-left: 0;
  white-space: nowrap;
  border-radius: 12px;
}

.server-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

@media (max-width: 980px) {
  .server-card-head {
    grid-template-columns: minmax(0, 1fr);
  }

  .server-card-tag-group {
    justify-content: flex-start;
  }

  .server-card-info-grid,
  .server-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
