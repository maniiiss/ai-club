/**
 * 列表态人员展示项，仅用于前端组件渲染，不与后端 DTO 直接耦合。
 */
export interface ListUserDisplayItem {
  /** 人员唯一标识，供 v-for 和 key 使用。 */
  id: string | number
  /** 列表中展示的人员名称。 */
  name: string
  /** 头像地址；为空时组件回退显示姓名首字母。 */
  avatarUrl?: string | null
}

/**
 * 统一生成列表态头像回退文案，保证无头像时所有列表展示一致。
 */
export function buildListUserAvatarText(name?: string | null) {
  return (name?.trim() || '未').slice(0, 1).toUpperCase()
}
