/**
 * API Studio 状态管理。
 * Zustand store for API Studio module state.
 */
import { create } from 'zustand'
import type {
  ApiStudioProjectOverview,
  ApiStudioProjectTree,
  ApiStudioEndpointDetail,
  ApiStudioEnvironmentDetail,
  ApiStudioDebugExecutionResult,
  ApiStudioDebugRecordItem,
  ApiStudioEndpointVersionItem,
  ApiStudioDirectoryPayload,
  ApiStudioEndpointPayload,
  ApiStudioEnvironmentPayload,
  ApiStudioDebugExecutionPayload,
} from '@/src/types/api-studio'
import {
  getApiStudioOverview,
  getApiStudioTree,
  getApiStudioEndpoint,
  listApiStudioEnvironments,
  createApiStudioDirectory,
  updateApiStudioDirectory,
  deleteApiStudioDirectory,
  createApiStudioEndpoint,
  updateApiStudioEndpoint,
  deleteApiStudioEndpoint,
  publishApiStudioEndpoint,
  deprecateApiStudioEndpoint,
  createApiStudioEnvironment,
  updateApiStudioEnvironment,
  deleteApiStudioEnvironment,
  setDefaultApiStudioEnvironment,
  executeApiStudioDebug,
  listApiStudioDebugRecords,
  listApiStudioVersions,
  rollbackApiStudioVersion,
} from '@/src/api/api-studio'

interface ApiStudioState {
  projectId: number | null
  overview: ApiStudioProjectOverview | null
  tree: ApiStudioProjectTree | null
  treeLoading: boolean
  currentEndpoint: ApiStudioEndpointDetail | null
  endpointLoading: boolean
  environments: ApiStudioEnvironmentDetail[]
  selectedEnvironmentId: number | null
  environmentsLoading: boolean
  debugResult: ApiStudioDebugExecutionResult | null
  debugRunning: boolean
  debugRecords: ApiStudioDebugRecordItem[]
  versions: ApiStudioEndpointVersionItem[]
  versionsLoading: boolean

  // Computed
  defaultEnvironment: ApiStudioEnvironmentDetail | null

  // Actions
  setProject: (id: number) => void
  refreshOverview: () => Promise<void>
  refreshTree: () => Promise<void>
  createDirectory: (payload: ApiStudioDirectoryPayload) => Promise<void>
  updateDirectory: (directoryId: number, payload: ApiStudioDirectoryPayload) => Promise<void>
  removeDirectory: (directoryId: number) => Promise<void>
  loadEndpoint: (endpointId: number) => Promise<void>
  createEndpoint: (payload: ApiStudioEndpointPayload) => Promise<void>
  saveEndpoint: (endpointId: number, payload: ApiStudioEndpointPayload) => Promise<void>
  removeEndpoint: (endpointId: number) => Promise<void>
  publishEndpoint: (endpointId: number) => Promise<void>
  deprecateEndpoint: (endpointId: number) => Promise<void>
  refreshEnvironments: () => Promise<void>
  createEnvironment: (payload: ApiStudioEnvironmentPayload) => Promise<void>
  updateEnvironment: (environmentId: number, payload: ApiStudioEnvironmentPayload) => Promise<void>
  removeEnvironment: (environmentId: number) => Promise<void>
  setDefaultEnvironment: (environmentId: number) => Promise<void>
  debug: (endpointId: number, payload: ApiStudioDebugExecutionPayload) => Promise<void>
  refreshDebugRecords: (endpointId: number) => Promise<void>
  refreshVersions: (endpointId: number) => Promise<void>
  rollbackVersion: (endpointId: number, versionId: number) => Promise<void>
}

export const useApiStudioStore = create<ApiStudioState>((set, get) => ({
  projectId: null,
  overview: null,
  tree: null,
  treeLoading: false,
  currentEndpoint: null,
  endpointLoading: false,
  environments: [],
  selectedEnvironmentId: null,
  environmentsLoading: false,
  debugResult: null,
  debugRunning: false,
  debugRecords: [],
  versions: [],
  versionsLoading: false,

  get defaultEnvironment() {
    const { environments } = get()
    return environments.find((e) => e.isDefault) || environments[0] || null
  },

  setProject: (id) => {
    set({
      projectId: id,
      overview: null,
      tree: null,
      currentEndpoint: null,
      environments: [],
      selectedEnvironmentId: null,
      debugResult: null,
      debugRecords: [],
      versions: [],
    })
  },

  refreshOverview: async () => {
    const { projectId } = get()
    if (!projectId) return
    try {
      const overview = await getApiStudioOverview(projectId)
      set({ overview })
    } catch {
      // ignore
    }
  },

  refreshTree: async () => {
    const { projectId } = get()
    if (!projectId) return
    set({ treeLoading: true })
    try {
      const tree = await getApiStudioTree(projectId)
      set({ tree, treeLoading: false })
    } catch {
      set({ treeLoading: false })
    }
  },

  createDirectory: async (payload) => {
    const { projectId } = get()
    if (!projectId) return
    await createApiStudioDirectory(projectId, payload)
    await get().refreshTree()
  },

  updateDirectory: async (directoryId, payload) => {
    const { projectId } = get()
    if (!projectId) return
    await updateApiStudioDirectory(projectId, directoryId, payload)
    await get().refreshTree()
  },

  removeDirectory: async (directoryId) => {
    const { projectId } = get()
    if (!projectId) return
    await deleteApiStudioDirectory(projectId, directoryId)
    await get().refreshTree()
  },

  loadEndpoint: async (endpointId) => {
    const { projectId } = get()
    if (!projectId) return
    set({ endpointLoading: true })
    try {
      const endpoint = await getApiStudioEndpoint(projectId, endpointId)
      set({ currentEndpoint: endpoint, endpointLoading: false })
    } catch {
      set({ endpointLoading: false })
    }
  },

  createEndpoint: async (payload) => {
    const { projectId } = get()
    if (!projectId) return
    await createApiStudioEndpoint(projectId, payload)
    await get().refreshTree()
    await get().refreshOverview()
  },

  saveEndpoint: async (endpointId, payload) => {
    const { projectId } = get()
    if (!projectId) return
    await updateApiStudioEndpoint(projectId, endpointId, payload)
    await get().refreshTree()
  },

  removeEndpoint: async (endpointId) => {
    const { projectId } = get()
    if (!projectId) return
    await deleteApiStudioEndpoint(projectId, endpointId)
    await get().refreshTree()
    await get().refreshOverview()
  },

  publishEndpoint: async (endpointId) => {
    const { projectId } = get()
    if (!projectId) return
    await publishApiStudioEndpoint(projectId, endpointId)
    await get().refreshTree()
  },

  deprecateEndpoint: async (endpointId) => {
    const { projectId } = get()
    if (!projectId) return
    await deprecateApiStudioEndpoint(projectId, endpointId)
    await get().refreshTree()
  },

  refreshEnvironments: async () => {
    const { projectId } = get()
    if (!projectId) return
    set({ environmentsLoading: true })
    try {
      const environments = await listApiStudioEnvironments(projectId)
      const defaultEnv = environments.find((e) => e.isDefault) || environments[0]
      set({ environments, selectedEnvironmentId: defaultEnv?.id || null, environmentsLoading: false })
    } catch {
      set({ environmentsLoading: false })
    }
  },

  createEnvironment: async (payload) => {
    const { projectId } = get()
    if (!projectId) return
    await createApiStudioEnvironment(projectId, payload)
    await get().refreshEnvironments()
  },

  updateEnvironment: async (environmentId, payload) => {
    const { projectId } = get()
    if (!projectId) return
    await updateApiStudioEnvironment(projectId, environmentId, payload)
    await get().refreshEnvironments()
  },

  removeEnvironment: async (environmentId) => {
    const { projectId } = get()
    if (!projectId) return
    await deleteApiStudioEnvironment(projectId, environmentId)
    await get().refreshEnvironments()
  },

  setDefaultEnvironment: async (environmentId) => {
    const { projectId } = get()
    if (!projectId) return
    await setDefaultApiStudioEnvironment(projectId, environmentId)
    await get().refreshEnvironments()
  },

  debug: async (endpointId, payload) => {
    const { projectId } = get()
    if (!projectId) return
    set({ debugRunning: true })
    try {
      const result = await executeApiStudioDebug(projectId, endpointId, payload)
      set({ debugResult: result, debugRunning: false })
    } catch {
      set({ debugRunning: false })
    }
  },

  refreshDebugRecords: async (endpointId) => {
    const { projectId } = get()
    if (!projectId) return
    try {
      const res = await listApiStudioDebugRecords(projectId, { endpointId, page: 1, size: 20 })
      set({ debugRecords: res.records })
    } catch {
      // ignore
    }
  },

  refreshVersions: async (endpointId) => {
    const { projectId } = get()
    if (!projectId) return
    set({ versionsLoading: true })
    try {
      const versions = await listApiStudioVersions(projectId, endpointId)
      set({ versions, versionsLoading: false })
    } catch {
      set({ versionsLoading: false })
    }
  },

  rollbackVersion: async (endpointId, versionId) => {
    const { projectId } = get()
    if (!projectId) return
    await rollbackApiStudioVersion(projectId, endpointId, versionId)
    await get().refreshVersions(endpointId)
    await get().refreshTree()
  },
}))
