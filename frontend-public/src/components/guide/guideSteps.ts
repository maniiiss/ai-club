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
const stepDefinitions = {
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
      title: '围炉列表',
      description: '查看和管理您参与的所有围炉，支持创建新房间和邀请成员。',
      side: 'right',
      align: 'start',
    },
    {
      element: '[data-guide-id="chat-message-area"]',
      title: '消息区域',
      description: '这里是实时消息流，您可以 @GitPilot 调用 AI 助手进行代码分析和问答。',
      side: 'left',
      align: 'start',
    },
    {
      element: '[data-guide-id="chat-input"]',
      title: '发送消息',
      description: '在这里输入消息或 @GitPilot 指令，按 Enter 发送。',
      side: 'top',
      align: 'center',
    },
  ],
  development: [
    {
      element: '[data-guide-id="dev-tab-nav"]',
      title: '研发工具',
      description: '这里集成了产品分支、代码结构、扫描和自动合并等研发工具。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="dev-binding-list"]',
      title: '代码仓库',
      description: '选择已绑定的代码仓库，查看和管理对应的产品分支与自动合并信息。',
      side: 'right',
      align: 'start',
    },
    {
      element: '[data-guide-id="dev-detail-tabs"]',
      title: '功能标签',
      description: '切换产品分支、代码结构、扫描、自动合并中心等功能。',
      side: 'bottom',
      align: 'start',
    },
  ],
  'project-detail': [
    {
      element: '[data-guide-id="project-detail-header"]',
      title: '项目信息',
      description: '这里展示项目名称、状态、负责人、任务数与成员数等基本信息，有权限时还可以管理项目成员。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="project-detail-modules"]',
      title: '项目模块',
      description: '从规划、知识库、研发、测试、执行到发布，点击卡片即可进入对应模块开始协作。',
      side: 'top',
      align: 'center',
    },
  ],
  planning: [
    {
      element: '[data-guide-id="planning-iterations"]',
      title: '迭代列表',
      description: '按迭代规划和管理工作项，支持新建迭代、查看未规划需求，窄屏时可在上方下拉框切换迭代。',
      side: 'right',
      align: 'start',
    },
    {
      element: '[data-guide-id="planning-type-tabs"]',
      title: '类型筛选',
      description: '在全部、需求、任务、缺陷之间切换，再配合状态和负责人筛选快速定位工作项。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="planning-view-switch"]',
      title: '视图切换',
      description: '列表视图适合批量处理工作项，看板视图按状态分列展示，直观跟踪流转进度。',
      side: 'bottom',
      align: 'end',
    },
    {
      element: '[data-guide-id="planning-create"]',
      title: '新建工作项',
      description: '点击创建需求、任务或缺陷，填写描述后还可以用 AI 辅助细化需求和技术设计。',
      side: 'bottom',
      align: 'end',
    },
  ],
  knowledge: [
    {
      element: '[data-guide-id="knowledge-tabs"]',
      title: '知识库模块',
      description: '在 Wiki、知识图谱和 API 之间切换，从不同视角浏览项目沉淀的知识。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="knowledge-space-list"]',
      title: 'Wiki 空间',
      description: '一个项目可以创建多个 Wiki 空间，点击卡片进入空间查看目录树和文档内容。',
      side: 'top',
      align: 'start',
    },
    {
      element: '[data-guide-id="knowledge-init-space"]',
      title: '初始化 Wiki',
      description: '项目还没有 Wiki 空间时，点击这里创建第一个空间，开始沉淀项目文档。',
      side: 'top',
      align: 'center',
    },
  ],
  testing: [
    {
      element: '[data-guide-id="testing-search"]',
      title: '搜索测试计划',
      description: '按计划名称关键字快速查找目标测试计划。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="testing-create"]',
      title: '新建测试计划',
      description: '创建测试计划并关联迭代，随后可在计划中补充用例，或交给 AI 自动生成与执行。',
      side: 'bottom',
      align: 'end',
    },
    {
      element: '[data-guide-id="testing-plan-list"]',
      title: '测试计划列表',
      description: '这里展示所有测试计划，可直接切换计划状态，或进入计划管理用例和自动化测试。',
      side: 'top',
      align: 'start',
    },
  ],
  'test-plan-detail': [
    {
      element: '[data-guide-id="plan-info"]',
      title: '计划信息',
      description: '查看测试计划的名称、所属项目与迭代、用例数量，并可随时切换计划状态。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="plan-automation"]',
      title: '自动化测试',
      description: '点击这里让 AI 为计划生成并执行自动化用例，执行结果会生成 MR 供您审查。',
      side: 'bottom',
      align: 'end',
    },
    {
      element: '[data-guide-id="plan-case-toolbar"]',
      title: '用例管理',
      description: '搜索已有用例，或点击"新增用例"手工补充测试步骤。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="plan-case-list"]',
      title: '用例列表',
      description: '点击用例卡片可编辑步骤、优先级和自动化方式，带"自动化"标记的用例可被自动执行。',
      side: 'top',
      align: 'start',
    },
  ],
  execution: [
    {
      element: '[data-guide-id="execution-stats"]',
      title: '执行概览',
      description: '查看执行任务总数、进行中数量、成功数和平均进度，快速掌握项目执行情况。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="execution-toolbar"]',
      title: '搜索与筛选',
      description: '按关键字搜索执行任务，展开筛选面板可按场景和状态缩小范围，右侧按钮可手动刷新列表。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="execution-task-list"]',
      title: '任务列表',
      description: '点击任务卡片进入详情查看执行进度、步骤日志和产物，运行中的任务状态会自动刷新。',
      side: 'top',
      align: 'start',
    },
  ],
  'execution-task-detail': [
    {
      element: '[data-guide-id="task-info"]',
      title: '任务信息',
      description: '查看执行任务的场景、关联工作项、发起人和当前状态，运行中可取消，结束后可重试。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="task-progress"]',
      title: '运行进度',
      description: '查看本次运行的整体进度和当前步骤，多次运行时可在下拉框中切换查看历史运行。',
      side: 'bottom',
      align: 'start',
    },
    {
      element: '[data-guide-id="task-steps"]',
      title: '步骤日志',
      description: '每个执行步骤的实时日志在这里展示，点击步骤可展开查看输入输出详情。',
      side: 'top',
      align: 'start',
    },
    {
      element: '[data-guide-id="task-artifacts"]',
      title: '执行产物',
      description: 'AI 执行过程中生成的代码、文档等产物按步骤分组展示，可预览、下载或写回技术设计。',
      side: 'top',
      align: 'start',
    },
  ],
  assistant: [
    {
      element: '[data-guide-id="assistant-session-sidebar"]',
      title: '会话与文件库',
      description: '在这里管理与 GitPilot 的会话：新建会话、搜索历史对话，还可以打开文件库查看与助手共享的项目文件。',
      side: 'right',
      align: 'start',
    },
    {
      element: '[data-guide-id="assistant-message-area"]',
      title: '对话区',
      description: 'GitPilot 的回答会实时流式展示，涉及工作项、文档等引用对象时可直接点击跳转，写入类操作会先向您请求确认。',
      side: 'bottom',
      align: 'center',
    },
    {
      element: '[data-guide-id="assistant-composer"]',
      title: '向 GitPilot 提问',
      description: '在这里输入问题，支持语音输入和上传附件，输入 / 可唤起快捷指令，按 Enter 发送。',
      side: 'top',
      align: 'center',
    },
    {
      element: '[data-guide-id="assistant-more-menu"]',
      title: '更多能力',
      description: '在这里管理助手记忆、接入外部 MCP 服务，或查看已归档的历史会话。',
      side: 'bottom',
      align: 'center',
    },
  ],
} satisfies Record<string, GuideStepDef[]>

/** 公众端新手引导合法页面 key；必须与后端 AuthService 白名单保持一致。 */
export const GUIDE_PAGE_KEYS = Object.keys(stepDefinitions) as Array<keyof typeof stepDefinitions>

/** 引导页面 key 类型。 */
export type GuidePageKey = (typeof GUIDE_PAGE_KEYS)[number]

/**
 * 将步骤定义转换为 Driver.js 的 DriveStep 数组。
 * 自动过滤掉当前 DOM 中不存在的目标元素，避免引导中断。
 */
export function getGuideSteps(pageKey: GuidePageKey): DriveStep[] {
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
export function getAllGuidePageKeys(): GuidePageKey[] {
  return [...GUIDE_PAGE_KEYS]
}
