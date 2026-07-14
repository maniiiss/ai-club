/**
 * 统一约定业务页面唤起全局 Assistant 抽屉时使用的浏览器事件名，避免多处手写字符串。
 */
export const ASSISTANT_OPEN_EVENT_NAME = 'git-ai-club:open-hermes'

/**
 * 业务页面触发 Assistant 全局入口时允许携带的附加参数。
 */
export interface AssistantOpenEventDetail {
  question?: string
}
