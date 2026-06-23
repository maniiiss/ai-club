import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createApiStudioDirectory,
  createApiStudioEndpoint,
  createApiStudioEnvironment,
  deleteApiStudioDirectory,
  deleteApiStudioEndpoint,
  deleteApiStudioEnvironment,
  deprecateApiStudioEndpoint,
  executeApiStudioDebug,
  getApiStudioEndpoint,
  getApiStudioOverview,
  getApiStudioTree,
  listApiStudioDebugRecords,
  listApiStudioEnvironments,
  listApiStudioVersions,
  publishApiStudioEndpoint,
  rollbackApiStudioVersion,
  setDefaultApiStudioEnvironment,
  updateApiStudioDirectory,
  updateApiStudioEndpoint,
  updateApiStudioEnvironment
} from '@/api/api-studio'
import type {
  ApiStudioDebugExecutionPayload,
  ApiStudioDebugExecutionResult,
  ApiStudioDebugRecordItem,
  ApiStudioDirectoryPayload,
  ApiStudioEndpointDetail,
  ApiStudioEndpointPayload,
  ApiStudioEndpointVersionItem,
  ApiStudioEnvironmentDetail,
  ApiStudioEnvironmentPayload,
  ApiStudioProjectOverview,
  ApiStudioProjectTree
} from '@/types/api-studio'

/**
 * 原生 API 工作台统一状态库。
 * 第一版采用单一 Pinia store 收口树、当前 API、环境、调试和版本数据，
 * 避免 store 间状态同步成本；后续随功能扩张再分拆。
 */
export const useApiStudioStore = defineStore('apiStudio', () => {
  const projectId = ref<number | null>(null)
  const overview = ref<ApiStudioProjectOverview | null>(null)
  const tree = ref<ApiStudioProjectTree | null>(null)
  const treeLoading = ref(false)

  const currentEndpoint = ref<ApiStudioEndpointDetail | null>(null)
  const endpointLoading = ref(false)

  const environments = ref<ApiStudioEnvironmentDetail[]>([])
  const selectedEnvironmentId = ref<number | null>(null)
  const environmentsLoading = ref(false)

  const debugResult = ref<ApiStudioDebugExecutionResult | null>(null)
  const debugRunning = ref(false)
  const debugRecords = ref<ApiStudioDebugRecordItem[]>([])

  const versions = ref<ApiStudioEndpointVersionItem[]>([])
  const versionsLoading = ref(false)

  const defaultEnvironment = computed(() =>
    environments.value.find((env) => env.isDefault) ?? environments.value[0] ?? null
  )

  // ========== 初始化 ==========

  const setProject = (id: number | null) => {
    if (projectId.value === id) return
    projectId.value = id
    overview.value = null
    tree.value = null
    currentEndpoint.value = null
    environments.value = []
    selectedEnvironmentId.value = null
    debugResult.value = null
    debugRecords.value = []
    versions.value = []
  }

  const refreshOverview = async () => {
    if (projectId.value == null) return
    overview.value = await getApiStudioOverview(projectId.value)
  }

  const refreshTree = async () => {
    if (projectId.value == null) return
    treeLoading.value = true
    try {
      tree.value = await getApiStudioTree(projectId.value)
    } finally {
      treeLoading.value = false
    }
  }

  // ========== 目录 ==========

  const createDirectory = async (payload: ApiStudioDirectoryPayload) => {
    if (projectId.value == null) throw new Error('未选择项目')
    const result = await createApiStudioDirectory(projectId.value, payload)
    await refreshTree()
    return result
  }

  const updateDirectory = async (directoryId: number, payload: ApiStudioDirectoryPayload) => {
    if (projectId.value == null) throw new Error('未选择项目')
    const result = await updateApiStudioDirectory(projectId.value, directoryId, payload)
    await refreshTree()
    return result
  }

  const removeDirectory = async (directoryId: number) => {
    if (projectId.value == null) throw new Error('未选择项目')
    await deleteApiStudioDirectory(projectId.value, directoryId)
    await refreshTree()
  }

  // ========== API ==========

  const loadEndpoint = async (endpointId: number) => {
    if (projectId.value == null) return null
    endpointLoading.value = true
    try {
      currentEndpoint.value = await getApiStudioEndpoint(projectId.value, endpointId)
      return currentEndpoint.value
    } finally {
      endpointLoading.value = false
    }
  }

  const createEndpoint = async (payload: ApiStudioEndpointPayload) => {
    if (projectId.value == null) throw new Error('未选择项目')
    const result = await createApiStudioEndpoint(projectId.value, payload)
    currentEndpoint.value = result
    await refreshTree()
    await refreshOverview()
    return result
  }

  const saveEndpoint = async (endpointId: number, payload: ApiStudioEndpointPayload) => {
    if (projectId.value == null) throw new Error('未选择项目')
    const result = await updateApiStudioEndpoint(projectId.value, endpointId, payload)
    currentEndpoint.value = result
    await refreshTree()
    return result
  }

  const removeEndpoint = async (endpointId: number) => {
    if (projectId.value == null) throw new Error('未选择项目')
    await deleteApiStudioEndpoint(projectId.value, endpointId)
    if (currentEndpoint.value?.id === endpointId) {
      currentEndpoint.value = null
    }
    await refreshTree()
    await refreshOverview()
  }

  const publishEndpoint = async (endpointId: number) => {
    if (projectId.value == null) throw new Error('未选择项目')
    const result = await publishApiStudioEndpoint(projectId.value, endpointId)
    currentEndpoint.value = result
    await refreshTree()
    return result
  }

  const deprecateEndpoint = async (endpointId: number) => {
    if (projectId.value == null) throw new Error('未选择项目')
    const result = await deprecateApiStudioEndpoint(projectId.value, endpointId)
    currentEndpoint.value = result
    await refreshTree()
    return result
  }

  // ========== 环境 ==========

  const refreshEnvironments = async () => {
    if (projectId.value == null) return
    environmentsLoading.value = true
    try {
      environments.value = await listApiStudioEnvironments(projectId.value)
      if (selectedEnvironmentId.value == null && defaultEnvironment.value) {
        selectedEnvironmentId.value = defaultEnvironment.value.id
      }
    } finally {
      environmentsLoading.value = false
    }
  }

  const createEnvironment = async (payload: ApiStudioEnvironmentPayload) => {
    if (projectId.value == null) throw new Error('未选择项目')
    const result = await createApiStudioEnvironment(projectId.value, payload)
    await refreshEnvironments()
    return result
  }

  const updateEnvironment = async (environmentId: number, payload: ApiStudioEnvironmentPayload) => {
    if (projectId.value == null) throw new Error('未选择项目')
    const result = await updateApiStudioEnvironment(projectId.value, environmentId, payload)
    await refreshEnvironments()
    return result
  }

  const removeEnvironment = async (environmentId: number) => {
    if (projectId.value == null) throw new Error('未选择项目')
    await deleteApiStudioEnvironment(projectId.value, environmentId)
    if (selectedEnvironmentId.value === environmentId) {
      selectedEnvironmentId.value = null
    }
    await refreshEnvironments()
  }

  const setDefaultEnvironment = async (environmentId: number) => {
    if (projectId.value == null) throw new Error('未选择项目')
    await setDefaultApiStudioEnvironment(projectId.value, environmentId)
    await refreshEnvironments()
  }

  // ========== 调试 ==========

  const debug = async (endpointId: number, payload: ApiStudioDebugExecutionPayload) => {
    if (projectId.value == null) throw new Error('未选择项目')
    debugRunning.value = true
    try {
      debugResult.value = await executeApiStudioDebug(projectId.value, endpointId, payload)
      return debugResult.value
    } finally {
      debugRunning.value = false
    }
  }

  const refreshDebugRecords = async (endpointId?: number | null, page = 1, size = 20) => {
    if (projectId.value == null) return
    const result = await listApiStudioDebugRecords(projectId.value, { endpointId: endpointId ?? null, page, size })
    debugRecords.value = result.records ?? []
  }

  // ========== 版本 ==========

  const refreshVersions = async (endpointId: number) => {
    if (projectId.value == null) return
    versionsLoading.value = true
    try {
      versions.value = await listApiStudioVersions(projectId.value, endpointId)
    } finally {
      versionsLoading.value = false
    }
  }

  const rollbackVersion = async (endpointId: number, versionId: number) => {
    if (projectId.value == null) throw new Error('未选择项目')
    const result = await rollbackApiStudioVersion(projectId.value, endpointId, versionId)
    currentEndpoint.value = result
    await refreshVersions(endpointId)
    await refreshTree()
    return result
  }

  return {
    projectId,
    overview,
    tree,
    treeLoading,
    currentEndpoint,
    endpointLoading,
    environments,
    selectedEnvironmentId,
    environmentsLoading,
    defaultEnvironment,
    debugResult,
    debugRunning,
    debugRecords,
    versions,
    versionsLoading,
    setProject,
    refreshOverview,
    refreshTree,
    createDirectory,
    updateDirectory,
    removeDirectory,
    loadEndpoint,
    createEndpoint,
    saveEndpoint,
    removeEndpoint,
    publishEndpoint,
    deprecateEndpoint,
    refreshEnvironments,
    createEnvironment,
    updateEnvironment,
    removeEnvironment,
    setDefaultEnvironment,
    debug,
    refreshDebugRecords,
    refreshVersions,
    rollbackVersion
  }
})
