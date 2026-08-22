/** 项目 CanvasKit Design 版本接口，与后端 DesignVersionDtos 保持字段命名一致。 */
export type DesignVersionStatus = 'DRAFT' | 'CURRENT' | 'ARCHIVED'

export interface DesignVersionSummary {
  id: number
  projectId: number
  designId: string
  revisionId: string
  versionNumber: number
  title: string
  summary: string
  status: DesignVersionStatus
  pageCount: number
  nodeCount: number
  assetCount: number
  sceneBytes: number
  creatorUserId: number | null
  createdAt: string
  canvasCompatible: boolean
  compatibilityMessage: string | null
}

export interface CanvasSceneSnapshot {
  schemaVersion: 2
  id: string
  name: string
  revision: number
  entryPageId: string
  pages: Array<{ id: string; name?: string; route?: string; width?: number; height?: number; rootNodeId: string }>
  nodes: Record<string, { id: string; type?: string; name?: string; childIds?: string[] }>
  assets: Record<string, unknown>
}

export interface DesignVersionDetail extends DesignVersionSummary {
  scene: CanvasSceneSnapshot | null
  previewImage: string | null
}

export interface DesignVersionList {
  versions: DesignVersionSummary[]
}
