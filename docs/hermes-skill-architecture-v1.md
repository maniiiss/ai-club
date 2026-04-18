# Hermes Skill 化架构 V1

## 1. 背景

Hermes 早期把基础安全约束、Wiki 问答、工作项创建、仓库扫描、执行任务查询等规则全部堆在同一个 system prompt 里。随着功能增加，这种“大 prompt”会带来几个问题：

- 新增能力时只能继续往同一段文本里追加，维护成本越来越高；
- 不同业务规则彼此耦合，修改仓库扫描逻辑时容易误伤 Wiki 或工作项逻辑；
- 很难做针对性的单测，无法清晰验证“某类问题到底命中了哪些业务规则”；
- 后续如果要做配置化、灰度或权限隔离，也缺少稳定的模块边界。

因此 V1 的目标不是把 Hermes 拆成多个 agent，而是把 **Hermes 主 agent 内部的提示词体系 Skill 化**。

## 2. 目标

V1 固定采用“**单 Hermes 主 agent + 多个内置 Skill**”模式：

- Hermes 仍然是唯一对话入口；
- Base Prompt 负责全局安全与工具调用底座规则；
- Skill Prompt 负责按意图注入某一类业务能力；
- Runtime Context 继续携带当前用户、页面锚点、上下文摘要、已绑定对象和当前问题。

第一版不做数据库配置化、不改前端协议，只在后端完成 Prompt 模块化。

## 3. 架构拆分

当前实现分成三层：

### 3.1 Base Prompt

位置：`backend/src/main/resources/prompts/hermes/base/system.md`

职责：

- 约束必须使用中文；
- 约束优先调用平台 MCP 工具；
- 禁止伪造数据库访问；
- 约束 `system_session_token` 只能用于工具参数；
- token 相关错误时自动重试，不向用户索取；
- 平台写工具只生成待确认动作卡片；
- 工具失败时必须如实说明。

这些规则属于 Hermes 的“底座行为”，不允许下沉到业务 Skill。

### 3.2 Skill Registry / Skill Match

核心类型：

- `HermesPromptSkill`
- `HermesSkillContext`
- `HermesPromptResourceLoader`
- `HermesPromptBuilder`

装配流程：

1. `HermesPromptBuilder` 先构造 `HermesSkillContext`
2. 读取 Base Prompt
3. 注入并遍历所有 `HermesPromptSkill`
4. 调用 `matches(context)` 判断是否命中
5. 按 `order()` 排序后，把命中的 Skill 片段拼进最终 system prompt

最终 system prompt 结构固定为：

1. Base Prompt
2. `## 当前已启用 Skills`
3. 各个命中 Skill 的规则片段

### 3.3 Runtime Context

user prompt 继续保留以下动态信息：

- 当前提问用户
- 当前角色
- 当前路由
- 当前页面锚点
- 当前可见上下文
- 当前会话已绑定对象
- 当前问题
- MCP 会话令牌提醒

V1 不把业务 Skill 规则重复塞进 user prompt，避免同一规则在 system/user 两侧重复出现。

## 4. 首批 Skill 列表与命中规则

### 4.1 `wiki-qa`

适用场景：

- 当前请求已绑定 `wikiSpaceId` / `wikiPageId`
- `sceneCode` 为 Wiki 场景
- 问题包含“当前页 / 本页 / Wiki / 页面 / 空间 / 文档 / 知识库”等关键词

核心约束：

- 当前页已锚定时优先读取当前页详情；
- 摘要不足时继续调用 Wiki 工具；
- 跨页对比时再扩展搜索；
- 禁止直接声称平台不支持 Wiki。

### 4.2 `work-item-create`

适用场景：

- 用户要求创建需求、任务、缺陷；
- 或在工作项场景下要求补负责人、指派成员。

核心约束：

- 项目未绑定先搜项目；
- 负责人未绑定先解析项目成员；
- 信息足够后调用工作项草稿写工具；
- 若返回候选卡片或确认卡片，只提示等待用户确认。

### 4.3 `repo-scan`

适用场景：

- 用户要求发起仓库规范扫描；
- 用户要求查看规则集；
- 当前上下文已绑定 GitLab 仓库对象。

核心约束：

- 先解析仓库绑定；
- 规则集不明确时先列规则集或追问；
- 只有用户明确说“默认规则集”时，才尝试自动选择默认规则集；
- 发起扫描仍走确认卡片。

### 4.4 `execution-task-query`

适用场景：

- 查询扫描结果、执行任务详情、日志、产物；
- 请求重试、取消执行任务；
- 当前上下文已绑定执行任务对象。

核心约束：

- 优先组合 `repo_scan.search`、`execution_task.search`、`execution_task.get_detail`；
- 不得假装看到了执行中心内部状态；
- 写类动作仍按确认卡片处理。

## 5. Prompt 资源文件目录约定

V1 统一采用 Markdown 资源文件承载 Prompt 正文：

```text
backend/src/main/resources/prompts/hermes/
├── base/
│   └── system.md
└── skills/
    ├── wiki-qa.md
    ├── work-item-create.md
    ├── repo-scan.md
    └── execution-task-query.md
```

约定：

- 所有文件必须使用 UTF-8 无 BOM；
- Base Prompt 只放全局底座规则；
- Skill 文件只放该能力的业务工作流与工具使用规则；
- Skill 文件不要重复写 token 安全底座规则。

## 6. 新增 Skill 的接入步骤

后续新增能力时，按下面步骤扩展：

1. 在 `prompts/hermes/skills/` 新增一份 Markdown 文件；
2. 新增一个 `HermesPromptSkill` 实现类；
3. 在构造函数中通过 `HermesPromptResourceLoader` 读取对应 Markdown；
4. 在 `matches(HermesSkillContext context)` 里定义命中规则；
5. 通过 Spring 注册为 bean；
6. 补单测，验证该 Skill 在目标问题下会命中，在无关问题下不会误命中。

推荐原则：

- Base Prompt 永远只放底座规则；
- Skill 只负责一个相对独立的业务能力；
- 命中策略优先使用“场景 + 关键词 + 已绑定对象”混合判断；
- 如果一个能力未来需要独立会话、独立任务生命周期，再考虑拆成独立 agent，而不是继续当 Skill。

## 7. 测试与回归要求

V1 至少覆盖以下验证：

- `HermesPromptBuilderTests`
  - Wiki 问题命中 `wiki-qa`
  - 创建需求问题命中 `work-item-create`
  - 仓库扫描问题命中 `repo-scan`
  - 执行任务查询问题命中 `execution-task-query`
  - 泛问答不误命中业务 Skill
  - 缺失 Prompt 资源时测试失败

- `HermesChatServiceTests`
  - 保持原有会话装配、selection 恢复、附件上下文等测试通过
  - 新增真实 `HermesPromptBuilder` 场景，验证传给网关的 system prompt 已包含命中的 Skill 片段

- Harness
  - `python scripts/check_encoding.py`
  - `cd backend && mvn -s maven-settings-central.xml "-Dtest=HermesPromptBuilderTests,HermesChatServiceTests" test`

## 8. 后续演进方向

V1 只是先把 Prompt 模块化，后续可继续演进：

1. **配置化 Skill**
   - 把 Skill 元数据、启停状态、命中策略外置到数据库或后台管理页。

2. **更精细的命中策略**
   - 从当前“场景 + 关键词 + 已绑定对象”提升到更强的意图分类或规则引擎。

3. **按角色 / 项目灰度启用 Skill**
   - 允许不同项目或角色启用不同能力组合。

4. **前端显式 Skill 标识**
   - 对部分强业务场景，可由前端明确告诉 Hermes 当前对话是“仓库扫描助手”“Wiki 助手”等。

5. **从 Skill 演进到子 Agent**
   - 当某一能力需要独立会话、独立状态或长任务生命周期时，再从 Skill 升级为独立 agent。
