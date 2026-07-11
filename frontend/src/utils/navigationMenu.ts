/**
 * 归一化后端菜单配置路径，保证侧边栏点击始终交给 Vue Router 一个站内绝对路径。
 */
export function resolveMenuPath(configuredPath: string | null | undefined, fallbackPath: string) {
  const trimmedPath = configuredPath?.trim()
  if (!trimmedPath) {
    return fallbackPath
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmedPath) || trimmedPath.startsWith('//')) {
    return fallbackPath
  }

  const absolutePath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`
  const [, pathPart = '', suffix = ''] = absolutePath.match(/^([^?#]*)(.*)$/) || []
  const normalizedPath = pathPart.length > 1 ? pathPart.replace(/\/+$/, '') : pathPart

  return `${normalizedPath || '/'}${suffix}`
}

/**
 * 菜单跳转按完整地址判断是否重复，避免当前页 query/hash 不同时被误判为无需切换。
 */
export function isSameMenuLocation(currentFullPath: string, targetPath: string) {
  return currentFullPath === targetPath
}

/**
 * 将菜单地址拆成 Vue Router location 对象，避免 query/hash 混在字符串路径里导致匹配状态不稳定。
 */
export function toMenuRouteLocation(targetPath: string) {
  const normalizedPath = resolveMenuPath(targetPath, '/')
  const hashStart = normalizedPath.indexOf('#')
  const pathWithQuery = hashStart >= 0 ? normalizedPath.slice(0, hashStart) : normalizedPath
  const hash = hashStart >= 0 ? normalizedPath.slice(hashStart) : ''
  const queryStart = pathWithQuery.indexOf('?')
  const path = queryStart >= 0 ? pathWithQuery.slice(0, queryStart) : pathWithQuery
  const queryString = queryStart >= 0 ? pathWithQuery.slice(queryStart + 1) : ''
  const query: Record<string, string | string[]> = {}

  if (queryString) {
    new URLSearchParams(queryString).forEach((value, key) => {
      const existingValue = query[key]
      if (Array.isArray(existingValue)) {
        existingValue.push(value)
        return
      }
      if (typeof existingValue === 'string') {
        query[key] = [existingValue, value]
        return
      }
      query[key] = value
    })
  }

  return {
    path: path || '/',
    ...(Object.keys(query).length ? { query } : {}),
    ...(hash ? { hash } : {}),
    force: true
  }
}
