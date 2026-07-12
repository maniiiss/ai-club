# Hermes MCP 集合查询精确统计技术设计 v1

## 背景

Hermes 通过 `code-processing` 暴露的 MCP 工具查询平台业务数据。历史搜索工具会限制候选展示数量，并直接使用 `candidates.size()` 生成“找到 N 个”的摘要，导致模型把候选上限误认为完整命中总数。

典型案例是 `work_item.search`：实际匹配 51 个缺陷时只返回前 5 条，并错误摘要为“找到 5 个相关工作项”。

## 设计目标

- 候选列表继续限制长度，避免工具上下文无限膨胀。
- 数量、状态分布等聚合事实基于完整可见筛选结果计算。
- 保持 `PlatformToolResult` 现有结构兼容，不影响已有 MCP 和前端调用方。
- 明确项目范围与迭代范围，禁止 Hermes 静默改变统计范围。

## 返回契约

带候选上限的集合查询统一在 `metadata` 中返回：

```json
{
  "totalCount": 51,
  "returnedCount": 5,
  "truncated": true
}
```

工作项查询额外返回：

```json
{
  "statusCounts": {
    "通过": 49,
    "已完成": 1,
    "待办的": 1
  },
  "scopeType": "ITERATION",
  "scopeDescription": "迭代范围"
}
```

工具摘要统一使用完整命中数；发生截断时写为“找到 N 个，当前展示前 M 个”。

## 影响工具

- `project.search`
- `user.resolve_project_member`
- `work_item.search`
- `agent.list_available`
- `gitlab_binding.search`
- `repo_scan.search`
- `execution_task.search`
- `test_plan.search`
- `wiki_space.search`

`project.list_iterations`、`user.list_project_members` 和 `repo_scan.list_rulesets` 当前不截断，候选数量仍是完整数量。

## 范围规则

- 有 `iterationId`：按迭代范围统计。
- 无 `iterationId` 但有 `projectId`：按项目范围统计。
- 两者都没有：按当前用户全局可见范围统计。
- 聊天室当前只绑定项目，不自动代表某个迭代。
- 用户明确询问“当前迭代”但没有迭代锚点时，Hermes 应先查询迭代；存在多个合理候选时等待用户选择。

## Wiki 语义检索边界

Wiki 语义搜索的上游结果本身属于召回集合，`totalCount` 表示本次召回结果数量，不代表 Wiki 全库精确匹配总数。返回结果通过 `searchMode` 和 `countScope` 明确该语义；关键词回退搜索可以表达完整关键词匹配结果。

## 兼容策略

不修改 `PlatformToolResult` record 字段，新增统计信息全部放入现有 `metadata`。旧调用方可以忽略新字段，新版 Hermes 和 MCP schema 使用 `metadata.totalCount` 回答数量问题。

## 验证策略

- 工作项构造超过 5 条的集成测试，验证完整总数、状态分布和迭代范围。
- 仓库绑定构造超过 8 条的测试，验证公共截断契约。
- Registry 测试验证所有 capped search 工具暴露统计字段。
- Python MCP 测试验证执行任务、测试计划的项目、迭代和状态过滤参数完整转发。
- Hermes Prompt 测试验证模型被明确要求使用 `metadata.totalCount`，且不把聊天室项目范围误认为迭代范围。
