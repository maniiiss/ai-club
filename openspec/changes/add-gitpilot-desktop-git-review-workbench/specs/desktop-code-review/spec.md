## ADDED Requirements

### Requirement: 用户可以对四类明确范围发起代码审查
系统 SHALL 支持 WORKTREE、STAGED、BRANCH 和 MERGE_REQUEST 四类审查来源，并在开始前展示 base、head、文件数、Diff 大小、截断和上传范围。

#### Scenario: 审查暂存区
- **WHEN** 用户选择 STAGED 且确认审查范围
- **THEN** 系统创建绑定 HEAD 与 cached Diff digest 的 ReviewSnapshot，并且不混入未暂存变更

#### Scenario: 审查 GitLab MR
- **WHEN** 当前 remote 能匹配用户可见的 GitLab 仓库且用户选择开放 MR
- **THEN** backend 使用平台 GitLab 身份读取 MR 快照，审查结果绑定 MR iid、base SHA 和 head SHA

### Requirement: 每次审查结果必须绑定不可变快照
系统 SHALL 将审查结果绑定 source、base/head SHA、文件清单、worktree fingerprint 和 diff digest，并在当前代码变化后把旧结果标为过期。

#### Scenario: 审查运行期间工作区变化
- **WHEN** ReviewSnapshot 创建后用户或 Agent 修改了纳入审查的文件
- **THEN** 当前运行可以基于原快照完成，但 UI 将结果标记为“代码已变化”并禁止无提示发布

#### Scenario: 发布前 SHA 变化
- **WHEN** 用户准备发布 MR 审查结果但 MR head SHA 已不同于结果快照
- **THEN** backend 拒绝直接发布并要求重新审查或再次明确确认过期结果

### Requirement: 审查返回可定位且可筛选的结构化 finding
系统 SHALL 为每个 finding 返回严重级别、类别、文件、行号、标题、解释、证据、建议、置信度和稳定指纹，并校验路径与行号属于审查快照。

#### Scenario: 模型返回有效行级问题
- **WHEN** finding 的路径和新行号可以映射到 ReviewSnapshot Diff
- **THEN** Desktop 在 Diff 对应位置显示标记，并允许从审查列表跳转到该行

#### Scenario: 模型返回无效路径或行号
- **WHEN** finding 引用了快照外路径或越界行号
- **THEN** backend 不把它伪装成有效行级评论，而是降级为未定位 finding 并记录校验原因

### Requirement: backend 对审查门禁拥有最终决定权
系统 SHALL 根据严格度、结构化 findings 和未解决历史问题计算最终 approved，不能仅信任模型输出的布尔值。

#### Scenario: 存在高风险问题但模型批准
- **WHEN** 模型返回 approved=true 且结果包含 CRITICAL 或 HIGH finding
- **THEN** backend 强制最终 approved=false 并在结果中说明门禁原因

#### Scenario: 低风险建议
- **WHEN** 严格度为 MEDIUM 且只有 LOW finding、没有未解决历史阻断问题
- **THEN** backend 可以保留 approved=true，同时继续展示非阻断建议

### Requirement: 复审必须保留历史并追踪问题状态
系统 SHALL 为复审创建新运行，通过 finding fingerprint 计算 NEW、UNCHANGED 和 RESOLVED，不覆盖历史模型输出或用户反馈。

#### Scenario: 历史问题指纹消失
- **WHEN** 新快照中已无法匹配上次 finding 且相关范围已被重新审查
- **THEN** 系统将该 finding 标记为 RESOLVED，并保留上次原始内容和运行链接

#### Scenario: 无法可靠匹配
- **WHEN** 路径移动或上下文变化导致 finding 不能高置信匹配
- **THEN** 系统将新问题标记为 NEW，不擅自把历史问题声明为已解决

### Requirement: 审查的未覆盖范围必须对用户可见
系统 SHALL 汇总二进制、超限、被忽略、读取失败和截断文件，并在结论旁展示覆盖率与限制。

#### Scenario: 部分文件未进入模型上下文
- **WHEN** 审查载荷因为大小限制只包含部分 Diff
- **THEN** 结果明确列出未覆盖文件和原因，且不得显示“已完整审查全部变更”

