/**
 * 新手引导步骤配置。
 * 按页面 key 组织，每步定义目标选择器、标题、描述和 Popover 位置。
 */
import type { DriveStep } from 'driver.js'

/** 引导步骤简化定义。 */
interface GuideStepDef {
  /** 目标元素的 CSS 选择器。 */
  element: string
  /** 步骤标题。 */
  title: string
  /** 步骤描述。 */
  description: string
  /** Popover 弹出方向。 */
  side: 'top' | 'bottom' | 'left' | 'right'
  /** Popover 对齐方式。 */
  align: 'start' | 'center' | 'end'
}

/** 各页面的引导步骤定义。 */
const stepDefinitions: Record<string, GuideStepDef[]> = {
  dashboard: [
    {
      element: '[data-guide-id="dashboard-stats"]',
      title: '数据概览',
      description: '这里展示您的项目数、任务数、智能体数和代码仓库数的总体概况。',
      side: 'bottom',
      align: 'center',
    },
    {
      element: '[data-guide-id="dashboard-my-tasks"]',
      title: '我的任务',
      description: '查看分配给您的任务状态，包括进行中、待处理的任务数量。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="dashboard-active-projects"]',
      title: '活跃项目',
      description: '快速访问您参与的项目，点击项目卡片即可进入项目详情。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="dashboard-recent-tasks"]',
      title: '近期任务',
      description: '这里列出您最近的任务动态，方便跟踪进度。',
      side: 'top',
      align: 'start',
    },
    {
      element: '[data-guide-id="dashboard-create-project"]',
      title: '开始使用',
      description: '点击这里创建您的第一个项目，开始协作开发之旅。',
      side: 'bottom',
      align: 'end',
    },
  ],
  projects: [
    {
      element: '[data-guide-id="projects-stats"]',
      title: '项目统计',
      description: '查看活跃项目数、总任务数和进行中任务的分布概况。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="projects-list"]',
      title: '项目列表',
      description: '以卡片视图浏览所有项目，每个项目展示名称、描述、成员和最近活动。',
      side: 'top',
      align: 'start',
    },
    {
      element: '[data-guide-id="projects-create"]',
      title: '新建项目',
      description: '创建项目时可关联 Git 仓库，配置智能体和 CICD 流水线。',
      side: 'bottom',
      align: 'end',
    },
    {
      element: '[data-guide-id="projects-filter"]',
      title: '搜索与筛选',
      description: '项目较多时可使用搜索和状态筛选快速定位目标项目。',
      side: 'bottom',
      align: 'start',
    },
  ],
  chat: [
    {
      element: '[data-guide-id="chat-room-list"]',
      title: '聊天室列表',
      description: '查看和管理您参与的所有聊天室，支持创建新房间和邀请成员。',
      side: 'right',
      align: 'start',
    },
    {
      element: '[data-guide-id="chat-message-area"]',
      title: '消息区域',
      description: '这里是实时消息流，您可以 @Hermes 调用 AI 助手进行代码分析和问答。',
      side: 'left',
      align: 'start',
    },
    {
      element: '[data-guide-id="chat-input"]',
      title: '发送消息',
      description: '在这里输入消息或 @Hermes 指令，按 Enter 发送。',
      side: 'top',
      align: 'center',
    },
  ],
  development: [
    {
      element: '[data-guide-id="dev-tab-nav"]',
      title: '研发工具',
      description: '这里集成了分支管理、合并请求、代码结构、扫描和自动合并等研发工具。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="dev-binding-list"]',
      title: '代码仓库',
      description: '选择已绑定的代码仓库，查看和管理对应的分支、合并请求等信息。',
      side: 'right',
      align: 'start',
    },
    {
      element: '[data-guide-id="dev-detail-tabs"]',
      title: '功能标签',
      description: '切换分支、合并请求、代码结构、扫描、自动合并中心等功能。',
      side: 'bottom',
      align: 'start',
    },
  ],
}

/**
 * 将步骤定义转换为 Driver.js 的 DriveStep 数组。
 * 自动过滤掉当前 DOM 中不存在的目标元素，避免引导中断。
 */
export function getGuideSteps(pageKey: string): DriveStep[] {
  const defs = stepDefinitions[pageKey]
  if (!defs) return []

  return defs
    .filter((def) => {
      const el = document.querySelector(def.element)
      return el !== null
    })
    .map((def) => ({
      element: def.element,
      popover: {
        title: def.title,
        description: def.description,
        side: def.side,
        align: def.align,
      },
    }))
}

/** 获取所有合法的引导页面 key。 */
export function getAllGuidePageKeys(): string[] {
  return Object.keys(stepDefinitions)
}
