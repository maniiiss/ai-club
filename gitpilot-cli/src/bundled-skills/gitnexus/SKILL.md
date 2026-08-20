---
name: gitnexus
description: 在 Code 模式中使用 GitNexus 知识图谱完成代码理解、调用链追踪、影响分析（blast radius）与安全重构；适用于“这段代码怎么工作 / 谁调用了它 / 改它会破坏什么 / 为什么报错”等任务，需已连接 GitNexus MCP Server。
---

# GitNexus 代码知识图谱

GitNexus 把仓库索引成代码知识图谱（符号、调用关系、执行流），优先用它回答“怎么工作 / 谁调用 / 改动影响 / 为什么错”，再用普通文件读取确认实现细节；不要在未查图谱前凭文件名猜测职责。

## 前置检查

1. 需要已连接 GitNexus MCP Server；工具不可用时说明缺少该 MCP，不要假装已经查询。
2. 先读 `gitnexus://repo/{name}/context` 获取代码库概览并检查索引新鲜度。
3. 索引过期时先在终端运行 `npx gitnexus analyze`，再继续后续步骤。

## 工具速查

| 工具 | 用途 |
|------|------|
| `gitnexus_query` | 按概念找相关执行流（进程）和符号 |
| `gitnexus_context` | 查看某符号 360 度视图：调用方、被调用方、参与的执行流 |
| `gitnexus_impact` | 计算符号影响面（depth 1/2/3 的上游/下游依赖） |
| `gitnexus_rename` | 多文件协同重命名，先 `dry_run: true` 预览再应用 |
| `gitnexus_detect_changes` | 基于 Git diff 分析当前改动影响哪些符号和执行流 |
| `gitnexus_cypher` | 自定义图查询；先读 `gitnexus://repo/{name}/schema` |
| `gitnexus_list_repos` | 发现已索引的仓库 |

资源（轻量导航读）：`gitnexus://repo/{name}/context`（统计与过期提醒）、`clusters`（功能区域）、`cluster/{name}`（区域成员）、`processes`（执行流列表）、`process/{name}`（逐步执行轨迹）、`schema`（图结构）。

## 按场景的工作流

### 代码理解 / “X 是怎么工作的？”

1. 读 `gitnexus://repo/{name}/context` 确认索引可用。
2. `gitnexus_query({query: "<概念>"})` 找到相关执行流。
3. `gitnexus_context({name: "<关键符号>"})` 查看调用方与被调用方。
4. 读 `gitnexus://repo/{name}/process/{name}` 追踪完整执行流。
5. 最后读源码文件确认实现细节。

### 调试 / “为什么这里出错？”

1. `gitnexus_query({query: "<报错信息或症状>"})` 定位相关符号。
2. `gitnexus_context({name: "<嫌疑符号>"})` 查看上下游；注意外部 API、异步依赖。
3. 需要自定义调用链时用 `gitnexus_cypher` 追踪，例如：
   `MATCH path = (a)-[:CodeRelation {type: 'CALLS'}*1..2]->(b:Function {name: "<嫌疑>"}) RETURN [n IN nodes(path) | n.name] AS chain`
4. 读源码确认根因，给出结论与证据，不要停留在猜测。

### 修改 / 重构前的影响分析

1. 修改函数、类、方法等符号前，先 `gitnexus_impact({target: "X", direction: "upstream"})` 计算影响面。
2. 结合 `gitnexus_context` 与 `gitnexus_query` 确认涉及哪些执行流。
3. 影响面标记为 HIGH / CRITICAL 时，先向用户说明风险和涉及范围，获得确认后再动手。
4. 重命名使用 `gitnexus_rename({symbol_name, new_name, dry_run: true})` 预览全部编辑；重点复核 ast_search 低置信度编辑（可能是动态引用），确认后再 `dry_run: false` 应用。
5. 改动完成后用 `gitnexus_detect_changes()` 核对实际影响范围是否与预期一致，并运行业界相关测试。

## 规则

- 图谱回答“关系与影响”，源码回答“实现细节”；结论必须落到源码证据。
- 影响面大（如调用方超过 5 个）时优先用 `gitnexus_rename` 自动协同，而不是手工逐文件替换。
- 索引过期却无法运行 analyze 时，明确告知用户结论基于旧索引，可能不准确。
