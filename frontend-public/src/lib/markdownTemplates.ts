/**
 * Markdown 编辑器预置模板定義。
 * 用于工作项需求、任务和 Wiki 页面的快速内容插入。
 */

/** 模板数据结构。 */
export interface MarkdownTemplate {
  /** 显示名称。 */
  name: string
  /** 插入的 Markdown 内容。 */
  content: string
}

/** 需求模板：用户故事 + 需求描述 + 验收标准。 */
export const REQUIREMENT_TEMPLATE: MarkdownTemplate = {
  name: '需求模板',
  content: `# 用户故事

作为 **[角色]**，我希望 **[功能]**，以便 **[价值]**。

# 需求描述

## 功能点

- 功能点 1
- 功能点 2

## 非功能需求

- 性能要求：
- 安全要求：

# 验收标准

- [ ] 验收条件 1
- [ ] 验收条件 2
- [ ] 验收条件 3`,
}

/** 任务模板：背景 + 目标 + 步骤 + 验收。 */
export const TASK_TEMPLATE: MarkdownTemplate = {
  name: '任务模板',
  content: `# 背景

简要说明任务的来源和动机。

# 目标

- 目标 1
- 目标 2

# 实施步骤

1. 步骤一
2. 步骤二
3. 步骤三

# 验收标准

- [ ] 验收条件 1
- [ ] 验收条件 2`,
}

/** Wiki 页面模板：概述 + 详情 + 参考。 */
export const WIKI_PAGE_TEMPLATE: MarkdownTemplate = {
  name: 'Wiki 模板',
  content: `# 概述

简要描述本页主题。

# 详情

## 章节一

正文内容。

## 章节二

正文内容。

# 参考

- [参考资料 1](链接)
- [参考资料 2](链接)`,
}
