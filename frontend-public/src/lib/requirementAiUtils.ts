import type { TaskSuggestionItem } from '@/src/types/requirementAi'

export const TASK_TYPE_OPTIONS = ['需求设计', 'UI设计', '技术设计', '开发任务', '测试任务', '运维任务']

const LEGACY_TASK_TYPE_MAP: Record<string, string> = {
  开发: '开发任务',
  测试: '测试任务',
  部署: '运维任务',
  运维: '运维任务',
  部署任务: '运维任务',
}

/**
 * 统一公众端任务类型口径，兼容历史 AI 返回的 category/开发/测试/部署分类。
 */
export const normalizeTaskType = (taskType?: string | null): string => {
  const value = String(taskType || '').trim()
  if (TASK_TYPE_OPTIONS.includes(value)) return value
  return LEGACY_TASK_TYPE_MAP[value] || '开发任务'
}

/**
 * 公众端工作项 AI 入口规则：需求展示需求 AI 助手，测试任务只展示测试用例生成。
 */
export const isRequirementAiEntryVisible = (workItem?: { workItemType?: string | null; taskType?: string | null } | null): boolean => {
  if (!workItem) return false
  if (workItem.workItemType === '需求') return true
  return workItem.workItemType === '任务' && normalizeTaskType(workItem.taskType) === '测试任务'
}

/**
 * 开发执行入口仅面向可进入代码实现链路的工作项：开发任务和缺陷。
 */
export const isDevelopmentExecutionEntryVisible = (workItem?: { workItemType?: string | null; taskType?: string | null } | null): boolean => {
  if (!workItem) return false
  if (workItem.workItemType === '缺陷') return true
  return workItem.workItemType === '任务' && normalizeTaskType(workItem.taskType) === '开发任务'
}

export const getRequirementAiActions = (workItem?: { workItemType?: string | null; taskType?: string | null } | null): string[] => {
  if (!workItem) return []
  if (workItem.workItemType === '需求') return ['STANDARDIZE', 'BREAKDOWN']
  if (workItem.workItemType === '任务' && normalizeTaskType(workItem.taskType) === '测试任务') return ['TEST_CASES']
  return []
}

/**
 * 将 AI 拆解建议转换为可编辑结构，优先使用 taskType，兜底兼容旧版 category 字段。
 */
export const normalizeTaskSuggestion = (suggestion: Partial<TaskSuggestionItem> = {}): TaskSuggestionItem => ({
  name: suggestion.name || '',
  taskType: normalizeTaskType(suggestion.taskType || suggestion.category),
  priority: suggestion.priority || '中',
  description: suggestion.description || '',
})

const PRIORITY_WEIGHT: Record<string, number> = {
  高: 3,
  中: 2,
  低: 1,
}

/**
 * 合并多个拆解建议为一个可编辑任务，保留首个任务类型并取最高优先级。
 */
export const mergeTaskSuggestions = (suggestions: TaskSuggestionItem[]): TaskSuggestionItem => {
  const normalized = suggestions.map(normalizeTaskSuggestion)
  const priority = normalized
    .map((item) => item.priority)
    .sort((a, b) => (PRIORITY_WEIGHT[b] || 0) - (PRIORITY_WEIGHT[a] || 0))[0] || '中'
  return {
    name: normalized.map((item) => item.name.trim()).filter(Boolean).join(' / ') || '合并任务',
    taskType: normalized[0]?.taskType || '开发任务',
    priority,
    description: normalized
      .map((item) => {
        const name = item.name.trim() || '未命名任务'
        const description = item.description.trim()
        return description ? `### ${name}\n\n${description}` : `### ${name}`
      })
      .join('\n\n'),
  }
}

/**
 * 标准化需求允许二次编辑，其它 AI 动作保持后端原始 Markdown。
 */
export const buildCurrentRequirementAiMarkdown = (
  action: string | undefined,
  originalMarkdown: string | undefined,
  standardizeMarkdownDraft: string,
): string => (action === 'STANDARDIZE' ? standardizeMarkdownDraft : (originalMarkdown || ''))
