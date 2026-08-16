/** 项目 Design 版本接口，与后端 DesignVersionDtos 保持字段命名一致。 */
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
  fileCount: number
  snapshotBytes: number
  creatorUserId: number | null
  createdAt: string
}

export interface DesignVersionFile {
  id?: string
  path: string
  language?: string
  scope?: string
  content: string
}

export interface DesignVersionSnapshot {
  document?: { name?: string; pages?: Array<{ id: string; name?: string; route?: string }> }
  files?: DesignVersionFile[]
  guidelines?: unknown
}

export interface DesignVersionDetail extends Omit<DesignVersionSummary, 'fileCount' | 'snapshotBytes'> {
  snapshot: DesignVersionSnapshot
  previewHtml: string
}

export interface DesignVersionList {
  versions: DesignVersionSummary[]
}
