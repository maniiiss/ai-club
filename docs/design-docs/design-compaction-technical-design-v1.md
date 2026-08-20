# Design 上下文压缩技术设计 v1

## 1. 背景与目标

Code、Work、Design 共用 Pi 的上下文压缩生命周期和默认摘要格式。Design 使用单一会话跨页面工作时，需要在压缩后继续区分全局设计语义、当前页面和 revision，但不能把完整页面源码再次复制到压缩提示或桌面端事件中。

本设计只为 Design 增加领域压缩提示；Code 和 Work 继续使用 Pi 默认行为。前端三种模式统一展示以下执行状态：

- 正在压缩上下文
- 上下文已压缩
- 上下文压缩失败

## 2. Core 压缩提示

`AgentSessionConfig.compactionInstructions` 是可选的字符串或动态回调。`AgentSession` 在手动压缩、阈值自动压缩和 overflow 恢复三条入口统一解析配置，并把它追加给 Pi 原有的 `SUMMARIZATION_PROMPT` / 更新摘要提示；默认 `Goal / Constraints & Preferences / Progress / Key Decisions / Next Steps / Critical Context` 结构不被替换。

动态回调在每次压缩开始前求值，因此 Design 页面切换后不会继续使用创建会话时冻结的 pageId。Code、Work 不传该配置，行为和提示保持原样。

## 3. Design 专属上下文

Design 的回调从当前 canonical snapshot 生成轻量事实摘要，包含：

- 全局项目名称、项目级品牌/Token/组件/无障碍规范，以及对话中已经确认的目标和偏好；
- 全部页面的 pageId、名称和路由关系；
- 当前 pageId 的路由、入口文件、页面文件路径、HTML 结构摘要、交互标记、响应式断点和关键选择器；
- shared/assets 路径、最近 revision 及摘要，并提醒保留已完成修改、未完成事项、风险和待确认问题。

只写入可定位的结构化事实，不写入完整 HTML、CSS 或 JavaScript。模型需要正文时继续按现有 Design 文件工具读取 canonical 文件，不新增独立摘要文件。

## 4. RPC 事件协议

Core 的完整 `compaction_start` / `compaction_end` 事件由 `design-events.ts` 投影为 Design 事件：

```text
{ type: "compaction_start" }
{ type: "compaction_end", result: boolean, errorMessage?: string }
```

投影只保留进行中、成功/失败和错误详情，不传输摘要正文。Design sidecar 在压缩期间把运行阶段设为 `compacting`，完成后恢复到可继续执行阶段。恢复快照允许使用 `compacting` 阶段，以支持 Desktop 重连。

## 5. Desktop 状态归约

Code/Work 由共享 Workbench reducer 处理压缩事件；新任务的 `beginExecution` 创建新执行对象并清除上一轮压缩结果。压缩开始时清除历史结果，压缩结束时保留成功/失败标志和错误详情。

Design 在自己的执行 reducer 中采用同一规则，并增加 `compacting` 阶段。文案优先级为：压缩进行中 > 压缩成功/失败 > 普通执行阶段。压缩结果留在当前任务执行状态中，不插入聊天消息，也不使用短暂 Toast；新 Design 任务开始时由 `initialExecution()` 清除旧结果。

## 6. 验收边界

- Core 三种压缩入口都传入 Design 动态追加提示；默认摘要格式仍完整存在。
- 页面切换后压缩提示使用新 pageId 的页面事实，不把旧页面的结构/选择器带入当前页面段落。
- Design RPC 不传摘要全文。
- Code、Work 的默认压缩提示和既有执行行为不变。
- Desktop 三种模式均显示统一的三种中文文案，并保留底层错误详情用于排查。
