<template>
  <div class="server-detail-page" v-loading="loading">
    <section v-if="detail" class="server-detail-hero">
      <button class="detail-back-link" type="button" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回服务器列表</span>
      </button>

      <div class="detail-hero-heading">
        <div class="server-detail-title-block">
          <h1>{{ detail.name }}</h1>
        </div>
        <div class="detail-hero-actions">
          <el-button v-if="canManage" class="detail-hero-action-button secondary" @click="openEditDialog">
            <el-icon><EditPen /></el-icon>
            <span>编辑</span>
          </el-button>
          <el-button v-if="canUseTerminal" class="detail-hero-action-button" type="primary" :disabled="terminalConnecting" @click="connectTerminal">
            <el-icon><Connection /></el-icon>
            <span>{{ terminalConnected ? '已连接' : terminalConnecting ? '连接中' : '连接终端' }}</span>
          </el-button>
          <el-button v-if="canManage" class="detail-hero-action-button secondary" @click="handleTestConnection">
            <el-icon><Promotion /></el-icon>
            <span>测试连接</span>
          </el-button>
        </div>
      </div>

      <div class="detail-hero-meta">
        <span>服务器</span>
        <span>主机：{{ detail.host }}:{{ detail.port }}</span>
        <span>用户：{{ detail.username }}</span>
        <span>{{ detail.osType }}</span>
        <span>{{ detail.authType === 'PASSWORD' ? '密码认证' : '私钥认证' }}</span>
        <span>状态：{{ detail.enabled ? '启用' : '停用' }}</span>
        <span>探测：{{ probeLabel(detail.lastProbeStatus) }}</span>
        <span>活跃告警：{{ detail.activeAlertCount }}</span>
        <span v-if="detail.jumpHostEnabled">跳板机：{{ detail.jumpUsername || '-' }}@{{ detail.jumpHost }}:{{ detail.jumpPort || '-' }}</span>
        <span v-if="detail.description" class="detail-hero-meta-description" :title="detail.description">说明：{{ detail.description }}</span>
      </div>
    </section>

    <section v-if="detail" class="server-detail-content">
      <el-tabs v-model="activeTab" class="server-detail-tabs">
        <el-tab-pane label="概览" name="overview">
          <div class="server-tab-shell overview-shell">
          <div class="server-panel-grid">
            <article class="server-panel overview-card">
              <header>
                <h3>连接概况</h3>
              </header>
              <dl class="server-detail-list">
                <div><dt>主机</dt><dd>{{ detail.host }}:{{ detail.port }}</dd></div>
                <div><dt>用户</dt><dd>{{ detail.username }}</dd></div>
                <div><dt>主机认证</dt><dd>{{ detail.authType === 'PASSWORD' ? '密码' : '私钥' }}</dd></div>
                <div><dt>密码</dt><dd>{{ detail.passwordConfigured ? '已配置' : '未配置' }}</dd></div>
                <div><dt>私钥</dt><dd>{{ detail.privateKeyConfigured ? '已配置' : '未配置' }}</dd></div>
                <div><dt>跳板机</dt><dd>{{ detail.jumpHostEnabled ? `${detail.jumpUsername}@${detail.jumpHost}:${detail.jumpPort}` : '未启用' }}</dd></div>
                <div><dt>跳板认证</dt><dd>{{ detail.jumpHostEnabled ? (detail.jumpAuthType === 'PRIVATE_KEY' ? '私钥' : '密码') : '-' }}</dd></div>
                <div><dt>最近探测</dt><dd>{{ detail.lastProbedAt || '尚未采样' }}</dd></div>
              </dl>
            </article>

            <article class="server-panel resource-card">
              <header>
                <h3>最新资源摘要</h3>
              </header>
              <div class="resource-card-grid">
                <div class="resource-chip">
                  <span>CPU</span>
                  <strong>{{ percentText(detail.lastCpuUsagePercent) }}</strong>
                </div>
                <div class="resource-chip">
                  <span>内存</span>
                  <strong>{{ percentText(detail.lastMemoryUsagePercent) }}</strong>
                </div>
                <div class="resource-chip">
                  <span>磁盘</span>
                  <strong>{{ percentText(detail.lastDiskUsagePercent) }}</strong>
                </div>
              </div>
              <el-alert
                :title="detail.lastProbeMessage || '最近一次采样暂无摘要'"
                :type="detail.lastProbeStatus === 'FAILED' ? 'error' : 'info'"
                :closable="false"
                show-icon
                class="resource-alert"
              />
            </article>
          </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="监控趋势" name="metrics">
          <div class="server-tab-shell">
          <div class="server-panel metrics-panel">
            <header class="metrics-panel-head">
              <h3>最近 24 小时短趋势</h3>
              <el-button @click="loadMetricsHistory">刷新趋势</el-button>
            </header>

            <div class="metrics-trend-grid">
              <article class="trend-card">
                <div class="trend-card-head">
                  <span>CPU</span>
                  <strong>{{ percentText(detail.lastCpuUsagePercent) }}</strong>
                </div>
                <svg class="trend-chart" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path :d="buildSparkline(metricHistory.map((item) => item.cpuUsagePercent))" />
                </svg>
              </article>
              <article class="trend-card">
                <div class="trend-card-head">
                  <span>内存</span>
                  <strong>{{ percentText(detail.lastMemoryUsagePercent) }}</strong>
                </div>
                <svg class="trend-chart" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path :d="buildSparkline(metricHistory.map((item) => item.memoryUsagePercent))" />
                </svg>
              </article>
              <article class="trend-card">
                <div class="trend-card-head">
                  <span>磁盘</span>
                  <strong>{{ percentText(detail.lastDiskUsagePercent) }}</strong>
                </div>
                <svg class="trend-chart" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path :d="buildSparkline(metricHistory.map((item) => item.diskUsagePercent))" />
                </svg>
              </article>
            </div>

            <div class="metrics-timeline">
              <article v-for="item in pagedMetricHistory" :key="item.sampledAt" class="metrics-timeline-item">
                <div class="metrics-timeline-time">{{ item.sampledAt }}</div>
                <div class="metrics-timeline-pill" :class="probeTone(item.probeStatus)">{{ probeLabel(item.probeStatus) }}</div>
                <div class="metrics-timeline-values">
                  <span>CPU {{ percentText(item.cpuUsagePercent) }}</span>
                  <span>内存 {{ percentText(item.memoryUsagePercent) }}</span>
                  <span>磁盘 {{ percentText(item.diskUsagePercent) }}</span>
                </div>
              </article>
            </div>

            <div v-if="metricHistory.length > metricPagination.size" class="metrics-pagination">
              <el-pagination
                v-model:current-page="metricPagination.page"
                v-model:page-size="metricPagination.size"
                background
                layout="total, prev, pager, next"
                :page-sizes="[4, 5, 6]"
                :total="metricHistory.length"
              />
            </div>
          </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="告警配置" name="alerts">
          <div class="server-tab-shell">
          <div class="server-panel alerts-panel">
            <header class="metrics-panel-head">
              <h3>生效告警配置</h3>
            </header>

            <div class="alerts-config-grid">
              <div class="alert-config-chip">
                <span>连通性告警</span>
                <strong>{{ detail.effectiveAlertConfig.connectivityAlertEnabled ? '开启' : '关闭' }}</strong>
              </div>
              <div class="alert-config-chip">
                <span>CPU 阈值</span>
                <strong>{{ detail.effectiveAlertConfig.cpuThresholdPercent }}%</strong>
              </div>
              <div class="alert-config-chip">
                <span>内存阈值</span>
                <strong>{{ detail.effectiveAlertConfig.memoryThresholdPercent }}%</strong>
              </div>
              <div class="alert-config-chip">
                <span>磁盘阈值</span>
                <strong>{{ detail.effectiveAlertConfig.diskThresholdPercent }}%</strong>
              </div>
              <div class="alert-config-chip">
                <span>连续越线</span>
                <strong>{{ detail.effectiveAlertConfig.consecutiveBreaches }} 次</strong>
              </div>
              <div class="alert-config-chip">
                <span>冷却时间</span>
                <strong>{{ detail.effectiveAlertConfig.cooldownMinutes }} 分钟</strong>
              </div>
            </div>

            <div class="alerts-summary-grid">
              <div class="alert-recipient-block">
                <div class="alert-recipient-title">通知人</div>
                <div class="alert-recipient-list">
                  <span v-for="user in detail.effectiveAlertConfig.recipientUsers" :key="user.id" class="alert-recipient-item">
                    {{ user.nickname || user.username }}
                  </span>
                  <span v-if="!detail.effectiveAlertConfig.recipientUsers.length" class="alert-recipient-empty">当前未绑定通知人</span>
                </div>
              </div>

              <div class="alert-state-list compact">
                <article v-for="item in detail.alertStates" :key="item.alertCode" class="alert-state-card">
                  <div class="alert-state-topline">
                    <strong>{{ item.alertName }}</strong>
                    <span class="alert-inline-status" :class="item.active ? 'danger' : 'success'">{{ item.active ? '告警中' : '已恢复' }}</span>
                  </div>
                  <div class="alert-state-meta">
                    <span>连续越线：{{ item.consecutiveBreachCount ?? 0 }}</span>
                    <span>最近通知：{{ item.lastNotifiedAt || '-' }}</span>
                  </div>
                </article>
              </div>
            </div>

            <div v-if="canManage" class="alert-edit-shell">
              <button class="alert-edit-toggle" type="button" @click="alertEditorDialogVisible = true">
                <span>编辑覆盖设置</span>
                <el-icon><ArrowDown /></el-icon>
              </button>
            </div>
          </div>
          </div>
        </el-tab-pane>

        <el-tab-pane v-if="canUseTerminal" label="SSH 终端" name="terminal">
          <div class="server-tab-shell terminal-shell-wrapper">
          <div class="server-panel terminal-panel fullscreen">
            <div class="terminal-toolbar">
              <div class="terminal-status">
                <span class="server-detail-pill" :class="terminalStatusTone">{{ terminalStatusText }}</span>
                <span>{{ terminalMessage }}</span>
              </div>
              <div class="terminal-actions">
                <el-button :disabled="terminalConnecting || terminalConnected" type="primary" @click="connectTerminal">连接</el-button>
                <el-button :disabled="!terminalConnected && !terminalConnecting" @click="disconnectTerminal">断开</el-button>
              </div>
            </div>
            <div ref="terminalRef" class="terminal-shell"></div>
          </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog
      v-model="alertEditorDialogVisible"
      width="760px"
      class="platform-form-dialog alert-config-dialog"
      align-center
      destroy-on-close
    >
      <template #header>
        <div class="alert-dialog-head">
          <h3>编辑告警覆盖设置</h3>
          <p>覆盖值留空时继续使用环境变量默认阈值。</p>
        </div>
      </template>

      <div class="alert-edit-panel dialog-mode">
        <div class="alert-edit-grid compact">
          <el-select v-model="alertForm.connectivityAlertEnabledOverride" clearable placeholder="连通性继承默认值">
            <el-option label="开启" :value="true" />
            <el-option label="关闭" :value="false" />
          </el-select>
          <el-input-number v-model="alertForm.cpuThresholdPercentOverride" :min="1" :max="100" placeholder="CPU 阈值" style="width: 100%" />
          <el-input-number v-model="alertForm.memoryThresholdPercentOverride" :min="1" :max="100" placeholder="内存阈值" style="width: 100%" />
          <el-input-number v-model="alertForm.diskThresholdPercentOverride" :min="1" :max="100" placeholder="磁盘阈值" style="width: 100%" />
          <el-input-number v-model="alertForm.consecutiveBreachesOverride" :min="1" :max="20" placeholder="连续越线次数" style="width: 100%" />
          <el-input-number v-model="alertForm.cooldownMinutesOverride" :min="1" :max="1440" placeholder="冷却分钟数" style="width: 100%" />
        </div>
        <el-select v-model="alertForm.recipientUserIds" multiple filterable collapse-tags collapse-tags-tooltip placeholder="选择通知人" style="width: 100%; margin-top: 12px">
          <el-option v-for="user in userOptions" :key="user.id" :label="user.nickname || user.username" :value="user.id" />
        </el-select>
        <div class="alert-edit-actions">
          <el-button @click="alertEditorDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="alertSubmitting" @click="handleSaveAlerts">保存告警配置</el-button>
        </div>
      </div>
    </el-dialog>

    <el-result v-if="!detail && !loading" icon="warning" title="服务器不存在" sub-title="请返回列表重新选择服务器。">
      <template #extra>
        <el-button type="primary" @click="goBack">返回列表</el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup lang="ts">
import 'xterm/css/xterm.css'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown, ArrowLeft, Connection, EditPen, Promotion } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import { FitAddon } from 'xterm-addon-fit'
import { Terminal } from 'xterm'
import { createServerTerminalSession, getServerDetail, listServerMetricsHistory, testServerConnection, updateServerAlertConfig } from '@/api/servers'
import { listUserOptions } from '@/api/access'
import { getResolvedApiBaseUrl } from '@/api/http'
import { AUTH_TOKEN_KEY } from '@/constants/auth'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import type { ServerDetailItem, ServerMetricSampleItem, UserOptionItem } from '@/types/platform'

interface AlertFormState {
  connectivityAlertEnabledOverride: boolean | null
  cpuThresholdPercentOverride: number | null
  memoryThresholdPercentOverride: number | null
  diskThresholdPercentOverride: number | null
  consecutiveBreachesOverride: number | null
  cooldownMinutesOverride: number | null
  recipientUserIds: number[]
}

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()
const canManage = computed(() => authStore.hasPermission('server:manage'))
const canUseTerminal = computed(() => authStore.hasPermission('server:terminal'))
const serverId = computed(() => Number(route.params.serverId))
const loading = ref(false)
const alertSubmitting = ref(false)
const detail = ref<ServerDetailItem | null>(null)
const metricHistory = ref<ServerMetricSampleItem[]>([])
const userOptions = ref<UserOptionItem[]>([])
const activeTab = ref('overview')
const alertEditorDialogVisible = ref(false)
const alertForm = reactive<AlertFormState>({
  connectivityAlertEnabledOverride: null,
  cpuThresholdPercentOverride: null,
  memoryThresholdPercentOverride: null,
  diskThresholdPercentOverride: null,
  consecutiveBreachesOverride: null,
  cooldownMinutesOverride: null,
  recipientUserIds: []
})
const metricPagination = reactive({ page: 1, size: 4 })

const terminalRef = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let socket: WebSocket | null = null
let terminalSessionId = ''
const terminalConnecting = ref(false)
const terminalConnected = ref(false)
const terminalMessage = ref('终端尚未连接')

const terminalStatusText = computed(() => {
  if (terminalConnecting.value) return '连接中'
  if (terminalConnected.value) return '在线'
  return '未连接'
})

const terminalStatusTone = computed(() => {
  if (terminalConnecting.value) return 'warning'
  if (terminalConnected.value) return 'success'
  return 'neutral'
})

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
const pagedMetricHistory = computed(() => {
  const ordered = metricHistory.value.slice().reverse()
  const start = (metricPagination.page - 1) * metricPagination.size
  return ordered.slice(start, start + metricPagination.size)
})

const goBack = async () => {
  await router.push('/servers')
}

const resolveWsBaseUrl = () => {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredBaseUrl && configuredBaseUrl.trim() !== '') {
    if (configuredBaseUrl.startsWith('https://')) return configuredBaseUrl.replace(/^https:\/\//, 'wss://')
    if (configuredBaseUrl.startsWith('http://')) return configuredBaseUrl.replace(/^http:\/\//, 'ws://')
    return `ws://${configuredBaseUrl}`
  }
  const resolved = getResolvedApiBaseUrl()
  if (resolved.startsWith('https://')) return resolved.replace(/^https:\/\//, 'wss://')
  if (resolved.startsWith('http://')) return resolved.replace(/^http:\/\//, 'ws://')
  return `ws://${resolved}`
}

const syncAlertForm = () => {
  if (!detail.value) return
  alertForm.connectivityAlertEnabledOverride = detail.value.effectiveAlertConfig.connectivityAlertEnabledOverride
  alertForm.cpuThresholdPercentOverride = detail.value.effectiveAlertConfig.cpuThresholdPercentOverride
  alertForm.memoryThresholdPercentOverride = detail.value.effectiveAlertConfig.memoryThresholdPercentOverride
  alertForm.diskThresholdPercentOverride = detail.value.effectiveAlertConfig.diskThresholdPercentOverride
  alertForm.consecutiveBreachesOverride = detail.value.effectiveAlertConfig.consecutiveBreachesOverride
  alertForm.cooldownMinutesOverride = detail.value.effectiveAlertConfig.cooldownMinutesOverride
  alertForm.recipientUserIds = detail.value.effectiveAlertConfig.recipientUsers.map((item) => item.id)
}

const loadDetail = async () => {
  if (!Number.isFinite(serverId.value) || serverId.value <= 0) {
    detail.value = null
    return
  }
  detail.value = await getServerDetail(serverId.value)
  syncAlertForm()
}

const loadMetricsHistory = async () => {
  if (!Number.isFinite(serverId.value) || serverId.value <= 0) return
  metricHistory.value = await listServerMetricsHistory(serverId.value)
  metricPagination.page = 1
}

const bootstrap = async () => {
  loading.value = true
  try {
    const [serverDetail, metrics, users] = await Promise.all([
      getServerDetail(serverId.value),
      listServerMetricsHistory(serverId.value),
      listUserOptions()
    ])
    detail.value = serverDetail
    metricHistory.value = metrics
    userOptions.value = users
    syncAlertForm()
  } finally {
    loading.value = false
  }
}

const buildSparkline = (values: Array<number | null | undefined>) => {
  const sanitized = values.map((item) => item ?? 0)
  if (!sanitized.length) {
    return 'M0 36 L100 36'
  }
  const step = sanitized.length === 1 ? 100 : 100 / (sanitized.length - 1)
  return sanitized
    .map((value, index) => {
      const x = index * step
      const y = 36 - Math.max(0, Math.min(value, 100)) * 0.32
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`
    })
    .join(' ')
}

const ensureTerminal = async () => {
  if (!terminalRef.value || terminal) {
    return
  }
  terminal = new Terminal({
    cursorBlink: true,
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 13,
    theme: {
      background: '#04111f',
      foreground: '#d8e4f0',
      cursor: '#38bdf8',
      black: '#0f172a',
      brightBlack: '#334155',
      red: '#fb7185',
      green: '#34d399',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#e2e8f0'
    }
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(terminalRef.value)
  fitAddon.fit()
  terminal.writeln('AI Club SSH Terminal Ready')
  terminal.onData((data) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'INPUT', data }))
  })
}

const sendResize = () => {
  if (!socket || socket.readyState !== WebSocket.OPEN || !terminal) return
  fitAddon?.fit()
  socket.send(JSON.stringify({ type: 'RESIZE', cols: terminal.cols, rows: terminal.rows }))
}

const connectTerminal = async () => {
  if (!detail.value || terminalConnecting.value || terminalConnected.value) {
    return
  }
  if (!appStore.serverManagementEnabled) {
    ElMessage.warning('服务器管理模块当前已关闭')
    return
  }
  await ensureTerminal()
  terminalConnecting.value = true
  terminalMessage.value = '正在申请终端会话...'
  try {
    const payload = await createServerTerminalSession(detail.value.id, {
      cols: terminal?.cols || 120,
      rows: terminal?.rows || 36
    })
    terminalSessionId = payload.sessionId
    socket = new WebSocket(`${resolveWsBaseUrl()}/ws/server-terminals?token=${encodeURIComponent(localStorage.getItem(AUTH_TOKEN_KEY) || '')}&sessionId=${encodeURIComponent(payload.sessionId)}`)
    socket.onopen = () => {
      terminalConnecting.value = false
      terminalConnected.value = true
      terminalMessage.value = '终端已连接'
      terminal?.focus()
      sendResize()
    }
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; data?: string; status?: string }
        if (payload.type === 'OUTPUT' && payload.data) {
          terminal?.write(payload.data)
          return
        }
        if (payload.type === 'STATUS') {
          terminalMessage.value = payload.status === 'CONNECTED' ? '终端已连接' : terminalMessage.value
        }
      } catch {
        terminal?.write(event.data)
      }
    }
    socket.onerror = () => {
      terminalConnecting.value = false
      terminalConnected.value = false
      terminalMessage.value = '终端连接异常'
    }
    socket.onclose = async (event) => {
      terminalConnecting.value = false
      terminalConnected.value = false
      const reason = event.reason || '终端已断开'
      terminalMessage.value = reason === 'MODULE_DISABLED' ? '模块已关闭，终端已强制断开' : reason
      terminal?.writeln(`\r\n[${terminalMessage.value}]`)
      socket = null
      terminalSessionId = ''
      if (reason === 'MODULE_DISABLED') {
        await router.replace('/dashboard')
      }
    }
  } catch (error: any) {
    terminalConnecting.value = false
    terminalConnected.value = false
    terminalMessage.value = error?.response?.data?.message || '创建终端失败'
    ElMessage.error(terminalMessage.value)
  }
}

const disconnectTerminal = async () => {
  if (!terminalSessionId) {
    socket?.close()
    socket = null
    terminalConnected.value = false
    terminalConnecting.value = false
    terminalMessage.value = '终端已断开'
    return
  }
  try {
    await updateTerminalClose()
  } finally {
    socket?.close()
    socket = null
    terminalSessionId = ''
    terminalConnected.value = false
    terminalConnecting.value = false
    terminalMessage.value = '终端已断开'
  }
}

const updateTerminalClose = async () => {
  if (!terminalSessionId) return
  const { closeServerTerminalSession } = await import('@/api/servers')
  await closeServerTerminalSession(terminalSessionId)
}

const handleSaveAlerts = async () => {
  if (!detail.value) return
  alertSubmitting.value = true
  try {
    detail.value = await updateServerAlertConfig(detail.value.id, { ...alertForm })
    syncAlertForm()
    alertEditorDialogVisible.value = false
    ElMessage.success('告警配置已更新')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '更新告警配置失败')
  } finally {
    alertSubmitting.value = false
  }
}

const handleTestConnection = async () => {
  if (!detail.value) return
  try {
    const result = await testServerConnection(detail.value.id)
    ElMessage.success(result.lastProbeMessage || '连接成功')
    await Promise.all([loadDetail(), loadMetricsHistory()])
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '测试连接失败')
    await Promise.all([loadDetail(), loadMetricsHistory()])
  }
}

const openEditDialog = async () => {
  await router.push({ name: 'servers', query: { editId: String(serverId.value) } })
}

watch(
  activeTab,
  async (value) => {
    if (value === 'terminal') {
      await nextTick()
      await ensureTerminal()
      sendResize()
    }
  }
)

const handleWindowResize = () => {
  sendResize()
}

onMounted(() => {
  bootstrap().catch((error: any) => {
    ElMessage.error(error?.response?.data?.message || '加载服务器详情失败')
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleWindowResize)
  }
})

onUnmounted(() => {
  void disconnectTerminal()
  terminal?.dispose()
  terminal = null
  fitAddon = null
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleWindowResize)
  }
})
</script>

<style scoped>
.server-detail-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 110px);
  overflow: hidden;
}

.server-detail-hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  flex: 0 0 auto;
}

.detail-back-link {
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #374151;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
  transition: color 0.18s ease;
}

.detail-back-link .el-icon {
  font-size: 14px;
}

.detail-back-link:hover {
  color: var(--app-primary);
}

.detail-hero-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.server-detail-title-block {
  min-width: 0;
}

.server-detail-title-block h1 {
  margin: 0;
  color: #0f172a;
  font-size: 21px;
  font-weight: 900;
  line-height: 1.15;
}

.detail-hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-hero-action-button {
  min-height: 34px;
  border-radius: 999px;
}

.detail-hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-hero-meta span {
  border: 0;
  border-radius: 999px;
  padding: 4px 8px;
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
  line-height: 1.25;
}

.detail-hero-meta-description {
  max-width: min(100%, 420px);
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-detail-content {
  flex: 1 1 auto;
  min-height: 0;
}

.server-detail-tabs {
  height: 100%;
}

.server-detail-tabs :deep(.el-tabs__content) {
  height: calc(100% - 40px);
  min-height: 0;
}

.server-detail-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.server-tab-shell {
  height: 100%;
  min-height: 0;
}

.overview-shell {
  overflow: hidden;
}

.server-panel-grid {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 16px;
  height: 100%;
}

.server-panel {
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.16);
  padding: 16px;
  min-height: 0;
}

.server-panel header h3,
.metrics-panel-head h3 {
  margin: 0;
  font-size: 20px;
}

.server-detail-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
  margin: 12px 0 0;
}

.server-detail-list div {
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.9);
  padding: 10px 12px;
}

.server-detail-list dt {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.server-detail-list dd {
  margin: 6px 0 0;
  font-weight: 600;
}

.resource-card-grid,
.alerts-config-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.resource-chip,
.alert-config-chip {
  border-radius: 18px;
  padding: 8px 10px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(255, 255, 255, 0.92));
}

.resource-chip span,
.alert-config-chip span {
  display: block;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.resource-chip strong,
.alert-config-chip strong {
  display: block;
  margin-top: 2px;
  font-size: 16px;
}

.resource-alert {
  margin-top: 12px;
}

.metrics-panel-head,
.terminal-toolbar,
.alert-state-topline {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.metrics-trend-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
  flex: 0 0 auto;
}

.trend-card {
  border-radius: 22px;
  padding: 10px 12px;
  background: rgba(248, 250, 252, 0.9);
}

.trend-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.trend-chart {
  width: 100%;
  height: 42px;
  margin-top: 6px;
}

.trend-chart path {
  fill: none;
  stroke: #2563eb;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.metrics-timeline {
  display: grid;
  gap: 6px;
  margin-top: 10px;
  flex: 1 1 auto;
}

.metrics-timeline-item {
  display: grid;
  grid-template-columns: 170px 80px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.86);
  padding: 8px 10px;
}

.metrics-timeline-time {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.metrics-timeline-pill {
  border-radius: 999px;
  padding: 6px 10px;
  text-align: center;
  font-size: 12px;
}

.metrics-timeline-pill.success {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

.metrics-timeline-pill.danger {
  background: rgba(239, 68, 68, 0.14);
  color: #b91c1c;
}

.metrics-timeline-pill.neutral {
  background: rgba(148, 163, 184, 0.16);
  color: #475569;
}

.metrics-timeline-values {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.metrics-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
  flex: 0 0 auto;
}

.alerts-summary-grid {
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: 8px;
  margin-top: 10px;
  align-items: start;
}

.alert-recipient-block {
  border-radius: 18px;
  padding: 8px 10px;
  background: rgba(248, 250, 252, 0.9);
}

.alert-recipient-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.alert-recipient-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.alert-recipient-item,
.alert-recipient-empty {
  border-radius: 999px;
  padding: 5px 8px;
  background: rgba(15, 23, 42, 0.06);
  font-size: 11px;
}

.alert-state-list {
  display: grid;
  gap: 6px;
}

.alert-state-list.compact {
  margin-top: 0;
}

.alert-state-card {
  border-radius: 18px;
  padding: 8px 10px;
  background: rgba(248, 250, 252, 0.9);
}

.alert-state-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.alert-inline-status {
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
}

.alert-inline-status.success {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

.alert-inline-status.danger {
  background: rgba(239, 68, 68, 0.14);
  color: #b91c1c;
}

.alert-edit-shell {
  margin-top: 8px;
  border-top: 1px solid rgba(148, 163, 184, 0.14);
  padding-top: 8px;
}

.alert-edit-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: rgba(15, 23, 42, 0.06);
  color: #334155;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
}

.alert-edit-panel {
  margin-top: 8px;
}

.alert-edit-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.alert-edit-grid.compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.alert-edit-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.alert-dialog-head h3 {
  margin: 0;
  font-size: 18px;
}

.alert-dialog-head p {
  margin: 6px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.alert-config-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
}

.terminal-panel.fullscreen {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.terminal-shell-wrapper {
  overflow: hidden;
}

.terminal-toolbar {
  margin-bottom: 14px;
}

.terminal-status {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.terminal-shell {
  flex: 1 1 auto;
  min-height: 0;
  border-radius: 22px;
  overflow: hidden;
  padding: 14px;
  background: radial-gradient(circle at top, rgba(14, 165, 233, 0.18), transparent 24%), #04111f;
}

@media (max-width: 960px) {
  .server-detail-page {
    height: auto;
    overflow: visible;
  }

.detail-hero-heading,
  .metrics-panel-head,
  .terminal-toolbar,
  .alert-state-topline {
    flex-direction: column;
    align-items: flex-start;
  }

  .server-panel-grid,
  .metrics-trend-grid,
  .resource-card-grid,
  .alerts-config-grid,
  .alert-edit-grid,
  .alerts-summary-grid {
    grid-template-columns: 1fr;
  }

  .server-detail-tabs {
    height: auto;
  }

  .server-detail-tabs :deep(.el-tabs__content),
  .server-detail-tabs :deep(.el-tab-pane),
  .server-tab-shell,
  .server-panel-grid {
    height: auto;
  }

  .server-detail-list {
    grid-template-columns: 1fr;
  }

  .metrics-timeline-item {
    grid-template-columns: 1fr;
  }

  .terminal-panel.fullscreen,
  .terminal-shell {
    min-height: 420px;
  }
}
</style>
