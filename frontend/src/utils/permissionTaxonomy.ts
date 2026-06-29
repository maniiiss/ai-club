import type { PermissionItem } from '@/types/platform'

export type PermissionNavigationGroup = 'system' | 'platform'
export type PermissionTaxonomyGroupKey = 'business' | 'integration' | 'system' | 'platform' | 'other'

export interface PermissionTaxonomyMeta {
  key: PermissionTaxonomyGroupKey
  label: string
  usageLabel: string
  tone: 'primary' | 'success' | 'warning' | 'info' | 'neutral'
  navigationGroup?: PermissionNavigationGroup
}

type PermissionLike = Pick<PermissionItem, 'code'> & Partial<Pick<PermissionItem, 'sortOrder'>>

export const SYSTEM_MANAGEMENT_PERMISSION_CODES = [
  'system:user:view',
  'system:role:view',
  'system:permission:view',
  'system:env:view',
  'system:operation-log:view'
] as const

export const PLATFORM_MANAGEMENT_PERMISSION_CODES = [
  'system:credit:view',
  'system:shortcut:view',
  'model:view',
  'system:tool:view',
  'scan:ruleset:view',
  'system:pr-review:view',
  'system:agent-usage:view'
] as const

export const PERMISSION_TAXONOMY_GROUPS: PermissionTaxonomyMeta[] = [
  { key: 'business', label: '业务协作', usageLabel: '业务协作', tone: 'primary' },
  { key: 'integration', label: '集成能力', usageLabel: '集成能力', tone: 'info' },
  { key: 'system', label: '系统管理', usageLabel: '管理端治理', tone: 'warning', navigationGroup: 'system' },
  { key: 'platform', label: '平台管理', usageLabel: '公众平台运营', tone: 'success', navigationGroup: 'platform' },
  { key: 'other', label: '其他权限', usageLabel: '通用能力', tone: 'neutral' }
]

const SYSTEM_PERMISSION_SET = new Set<string>([
  ...SYSTEM_MANAGEMENT_PERMISSION_CODES,
  'system:user:manage',
  'system:role:manage',
  'system:permission:manage',
  'system:env:manage'
])

const PLATFORM_PERMISSION_SET = new Set<string>([
  ...PLATFORM_MANAGEMENT_PERMISSION_CODES,
  'system:credit:manage',
  'system:shortcut:manage',
  'dashboard:shortcut:upload',
  'model:manage',
  'system:tool:manage',
  'scan:ruleset:manage'
])

const INTEGRATION_PERMISSION_PREFIXES = ['gitlab:', 'cicd:', 'server:', 'observability:']
const BUSINESS_PERMISSION_PREFIXES = ['dashboard:', 'project:', 'api:', 'wiki:', 'agent:', 'task:', 'test:', 'self-upgrade:', 'chat:', 'hermes:']

const GROUP_BY_KEY = new Map(PERMISSION_TAXONOMY_GROUPS.map((group) => [group.key, group]))

export function resolvePermissionTaxonomy(permission: PermissionLike): PermissionTaxonomyMeta {
  const code = permission.code
  if (SYSTEM_PERMISSION_SET.has(code)) {
    return GROUP_BY_KEY.get('system')!
  }
  if (PLATFORM_PERMISSION_SET.has(code)) {
    return GROUP_BY_KEY.get('platform')!
  }
  if (INTEGRATION_PERMISSION_PREFIXES.some((prefix) => code.startsWith(prefix))) {
    return GROUP_BY_KEY.get('integration')!
  }
  if (BUSINESS_PERMISSION_PREFIXES.some((prefix) => code.startsWith(prefix))) {
    return GROUP_BY_KEY.get('business')!
  }
  return GROUP_BY_KEY.get('other')!
}

export function groupPermissionsByTaxonomy<T extends PermissionLike>(permissions: T[]) {
  const grouped = PERMISSION_TAXONOMY_GROUPS.map((group) => ({
    ...group,
    items: [] as T[]
  }))
  const groupedByKey = new Map(grouped.map((group) => [group.key, group]))

  permissions.forEach((permission) => {
    groupedByKey.get(resolvePermissionTaxonomy(permission).key)?.items.push(permission)
  })

  return grouped
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    }))
    .filter((group) => group.items.length > 0)
}
