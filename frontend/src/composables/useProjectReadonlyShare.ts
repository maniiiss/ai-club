import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createOrRefreshProjectAutoMergeShare,
  disableProjectAutoMergeShare,
  getProjectAutoMergeShare,
  type GitlabAutoMergeProjectShareItem
} from '@/api/gitlab'

/**
 * 项目只读分享 dialog 的复用 composable。
 *
 * 使用同一份后端能力（gitlab_auto_merge_project_share），但分享内容已扩展为：
 * 「自动合并日志摘要 + 流水线发布记录摘要」。两个调用方（项目管理列表 / 自动合并中心遗留入口）共享一致 UI 行为。
 */
export function useProjectReadonlyShare() {
  const dialogVisible = ref(false)
  const loading = ref(false)
  const currentProjectId = ref<number | null>(null)
  const currentProjectName = ref<string>('')
  const shareInfo = ref<GitlabAutoMergeProjectShareItem | null>(null)
  const expiresInDays = ref<number>(30)
  const permanent = ref<boolean>(false)

  /** 是否已存在可用的分享链接，控制「失效链接」与「复制链接」按钮可见。 */
  const enabled = computed(() => Boolean(shareInfo.value?.enabled))

  /**
   * 打开 dialog，初始化时从后端拉取当前 share 状态；不存在则展示"未启用"。
   */
  const openShare = async (projectId: number, projectName: string) => {
    if (!projectId) {
      ElMessage.warning('当前项目缺少 ID，无法生成只读分享页')
      return
    }
    currentProjectId.value = projectId
    currentProjectName.value = projectName
    dialogVisible.value = true
    loading.value = true
    shareInfo.value = null
    try {
      shareInfo.value = await getProjectAutoMergeShare(projectId)
      // 后端在永久分享时把 expiresAt 直接置为「永久有效」字符串，前端据此回显开关
      permanent.value = shareInfo.value?.expiresAt === '永久有效'
    } catch (error: any) {
      ElMessage.error(error?.response?.data?.message || '加载分享信息失败')
    } finally {
      loading.value = false
    }
  }

  /** 生成或刷新分享链接，旧 token 会被覆盖（后端逻辑）。 */
  const refresh = async () => {
    if (!currentProjectId.value) return
    loading.value = true
    try {
      shareInfo.value = await createOrRefreshProjectAutoMergeShare(currentProjectId.value, {
        permanent: permanent.value,
        expiresInDays: permanent.value ? null : expiresInDays.value
      })
      ElMessage.success('分享链接已刷新')
    } catch (error: any) {
      ElMessage.error(error?.response?.data?.message || '刷新分享链接失败')
    } finally {
      loading.value = false
    }
  }

  /** 让当前 token 立即失效；token 仍保留在表里，再次刷新会生成新 token。 */
  const disable = async () => {
    if (!currentProjectId.value) return
    loading.value = true
    try {
      await disableProjectAutoMergeShare(currentProjectId.value)
      shareInfo.value = {
        projectId: currentProjectId.value,
        projectName: currentProjectName.value,
        enabled: false,
        expiresAt: null,
        shareUrl: null
      }
      ElMessage.success('分享链接已失效')
    } catch (error: any) {
      ElMessage.error(error?.response?.data?.message || '失效分享链接失败')
    } finally {
      loading.value = false
    }
  }

  /** 复制 shareUrl 到剪贴板，优先使用 Clipboard API，不可用时降级 execCommand。 */
  const copy = async () => {
    const url = shareInfo.value?.shareUrl
    if (!url) {
      ElMessage.warning('当前还没有可用的分享链接')
      return
    }
    // 优先尝试现代 Clipboard API（仅 HTTPS / localhost 可用）
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(url)
        ElMessage.success('分享链接已复制')
        return
      } catch {
        // Clipboard API 调用失败，继续降级
      }
    }
    // 降级方案：通过隐藏 textarea + execCommand('copy') 兼容 HTTP / 旧浏览器
    try {
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      ElMessage.success('分享链接已复制')
    } catch {
      ElMessage.warning('复制失败，请手动复制链接')
    }
  }

  /** 关闭 dialog 并清掉本次会话状态。 */
  const close = () => {
    dialogVisible.value = false
    currentProjectId.value = null
    currentProjectName.value = ''
    shareInfo.value = null
    permanent.value = false
    expiresInDays.value = 30
  }

  return {
    dialogVisible,
    loading,
    shareInfo,
    enabled,
    expiresInDays,
    permanent,
    currentProjectName,
    openShare,
    refresh,
    disable,
    copy,
    close
  }
}
