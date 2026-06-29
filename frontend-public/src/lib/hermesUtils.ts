import type {
  HermesActionItem,
  HermesConversationMode,
  HermesConversationSessionQuery,
} from '@/src/types/hermes'

/**
 * 根据入口模式生成 Hermes 会话查询条件。
 * 业务意图：项目助手历史必须在后端分页前按项目过滤，避免本地过滤导致分页错乱。
 */
export const buildHermesSessionQuery = (
  mode: HermesConversationMode,
  page: number,
  archived: boolean,
  projectId?: number,
): HermesConversationSessionQuery => ({
  page,
  size: 20,
  archived,
  scope: 'PROJECT',
  ...(mode && projectId ? { projectId } : {}),
})

/**
 * compact 模式通常嵌在抽屉内，外层抽屉已经展示业务标题，内层只保留操作区避免重复。
 */
export const shouldRenderHermesWorkspaceHeader = (compact: boolean): boolean => !compact

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export const computeHermesParamsHash = (params: Record<string, unknown> | null | undefined): string => {
  try {
    const sortedJson = stableStringify(params ?? {})
    let hash = 5381
    for (let index = 0; index < sortedJson.length; index += 1) {
      hash = ((hash << 5) + hash + sortedJson.charCodeAt(index)) | 0
    }
    return (hash >>> 0).toString(36)
  } catch {
    return '0'
  }
}

/**
 * 生成动作确认后的持久化 key，用于刷新后恢复"已执行"状态。
 */
export const computeHermesActionKey = (action: Pick<HermesActionItem, 'type' | 'title' | 'params'>, index: number): string =>
  `${action.type}:${index}:${action.title}|${computeHermesParamsHash(action.params)}`

export interface ParsedHermesSseChunk {
  eventName: string
  data: unknown
}

/**
 * 解析单个 SSE 事件块。网络分片拼接由 API 层负责，这里只处理已按空行切好的事件。
 */
export const parseHermesSseChunk = (chunk: string): ParsedHermesSseChunk | null => {
  const normalized = chunk.replace(/\r/g, '')
  const lines = normalized.split('\n')
  let eventName = ''
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }
  if (!eventName || !dataLines.length) {
    return null
  }
  return {
    eventName,
    data: JSON.parse(dataLines.join('\n')),
  }
}
