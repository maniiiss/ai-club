# 开发执行平台 Harness 演进方案

## 1. 文档定位

本文用于定义执行中心 `DEVELOPMENT_IMPLEMENTATION` 场景下，平台测试能力的下一阶段演进方案。

本方案的核心目标不是继续把 `TEST` 描述成“测试边车能力扩展”，而是明确：

- `TEST` 步骤的主线是平台自己的 harness
- `PLAYWRIGHT_SMOKE`、`SERVICE_SMOKE` 等 suite 只是 harness 体系中的补充执行形态
- 平台后续需要建设的是“完整的开发 -> 测试 -> 回写闭环”，而不是单独横向堆更多 suite

与已有文档的关系如下：

- `plan/DEVELOPMENT_TEST_SIDECAR_PLAN.md`：保留为历史方案记录
- 本文：作为后续主导实施的 harness 视角方案

## 2. 核心结论

当前平台测试能力下一阶段应同时推进 6 条线，而不是只做“丰富测试套件”：

1. 把平台 harness 选取逻辑做得更聪明、更稳定
2. 把测试验证分成明确的分层矩阵，而不是所有验证都混在一起
3. 继续丰富 suite，但将 suite 明确定位为执行手段，而不是平台测试本体
4. 引入仓库自描述测试配置，降低纯平台硬编码成本
5. 做好异步执行、取消、产物沉淀与回写这一整条运行链路
6. 建立可回放的黄金样例，确保平台测试能力可持续演进

推荐落地顺序不是“先拼更多 suite”，而是：

1. 先做 harness 选择与分层矩阵
2. 再补 suite 与仓库配置
3. 再补异步链路和端到端回放

## 3. 当前链路现状

当前执行中心在开发执行场景下，已经具备以下基础能力：

- workflow 会按仓库展开 `结构化 -> 规划 -> 实现 -> 测试 -> 报告`
- `IMPLEMENT` 产出 `changedFiles`
- backend 会根据 `changedFiles` 推导平台 harness 命令
- backend 会生成 `TestExecutionPlan`
- code-processing 会执行 `COMMAND`、`PLAYWRIGHT_SMOKE`、`SERVICE_SMOKE`
- 执行结果会沉淀为 `TEST_PLAN_JSON`、`TEST_SUITE_RESULT_JSON`、`TEST_RESULT_MARKDOWN`、`TEST_LOG` 等产物
- 异步 CLI runner 已支持 `/start -> events -> complete` 的流式执行协议

也就是说，平台已经不再是“只有命令型测试”或“只有 sidecar 试验能力”的阶段，而是已经形成了一个初始版 harness 闭环。

## 4. 当前主要问题

### 4.1 harness 选择仍然偏粗

当前 harness 选择主要还是从 `changedFiles` 反推命令，已经能覆盖编码检查、构建、后端测试等基础路径，但仍然存在几个问题：

- 选择依据对用户不够可解释
- 不同仓库的命令推断规则还偏硬编码
- 缺少更细粒度的模块、语言、风险维度判断
- 还没有“最小必要验证集”的统一策略

### 4.2 平台测试分层不够清晰

目前 `COMMAND`、`PLAYWRIGHT_SMOKE`、`SERVICE_SMOKE` 已经共存在一个 `TestExecutionPlan` 中，但缺少清晰分层概念。

典型问题包括：

- 哪些属于基础门禁
- 哪些属于功能验证
- 哪些属于补充烟测
- 哪些失败必须阻断，哪些失败可以降级

如果不先定义分层，后续再加 suite 只会让 `TEST` 变得越来越重、越来越难解释。

### 4.3 suite 仍然偏少，但不是唯一短板

确实还可以继续扩充 suite，例如：

- contract/schema 校验
- 数据库迁移检查
- snapshot 对比
- 静态扫描/规范扫描复用

但如果只做 suite 扩容，不同时改 harness 选择、分层矩阵和回放机制，平台测试质量提升会很有限。

### 4.4 仓库配置来源还不够完善

当前配置主来源是 GitLab 仓库绑定上的 `testProfileJson`。这种方式对平台管理友好，但还有两个短板：

- 仓库自己的测试认知没有沉淀到源码中
- 规则变更依赖平台后台维护，不利于仓库自治

### 4.5 异步执行链路还需要补厚

平台测试是一个长链路，不仅仅是“选对命令”：

- step 启动
- runner session 绑定
- stdout/stderr 事件流
- 取消回收
- 失败收口
- artifact 上传
- report 聚合

这条链路如果稳定性不足，再好的 harness 策略也会在实战中失真。

### 4.6 缺少完整回放样例

现在已有单测和局部联调，但还缺一组可长期复用的“黄金开发执行样例”，用于验证：

- harness 选择有没有退化
- suite 执行有没有跑偏
- 回写和报告有没有丢字段
- 同一类改动在不同版本下是否还能稳定收敛

## 5. 方案篮子

为了避免方案过早收缩到“只扩 suite”，这里先把可选方案列全。

### 5.1 方案 A：继续丰富测试套件

含义：

- 保持现有 `TestExecutionPlan -> suiteResults` 协议
- 继续新增更多 suite 类型
- 让不同仓库可以命中更多验证手段

适用场景：

- 当前 suite 无法覆盖目标风险
- 需要补充新的验证证据类型

优点：

- 落地直观
- 与当前模型兼容
- 前后端展示协议基本不需要推倒

问题：

- 不能单独解决“为什么选它”
- 不能单独解决“哪些应该先跑”
- suite 越多，计划越容易膨胀

### 5.2 方案 B：更聪明的 harness 选择

含义：

- 把 `changedFiles -> harness` 升级为更稳定的选择层
- 引入目录、语言、模块、仓库类型、风险等级等信号
- 让平台优先选“最小必要验证集”

适用场景：

- 当前命令选择过粗或不稳定
- 希望减少不必要的测试成本

优点：

- 提升命中率和解释性
- 能直接减少无效测试
- 是完整链路中最值得先做的部分

问题：

- 需要维护规则体系
- 需要和仓库配置、回放样例一起演进

### 5.3 方案 C：建立验证分层矩阵

含义：

- 把测试能力分为基础门禁、功能验证、补充烟测等层次
- 每一层有明确触发条件、失败语义和展示方式

优点：

- 用户更容易理解执行结果
- 平台更容易控制成本
- 后续新增 suite 时更容易归位

问题：

- 需要同步调整报告聚合和前端展示

### 5.4 方案 D：引入仓库自描述配置

含义：

- 除平台绑定配置外，允许仓库通过约定文件自描述测试偏好
- 平台读取仓库内配置，与绑定配置合并

优点：

- 降低平台硬编码成本
- 让仓库对自己的测试规则负责

问题：

- 需要定义优先级
- 需要防止仓库配置破坏平台约束

### 5.5 方案 E：做风险分级执行

含义：

- 根据改动风险决定跑多重的验证集
- 低风险只跑最小 harness
- 高风险再叠加 smoke 或更重验证

优点：

- 控制资源消耗
- 提升平台整体吞吐

问题：

- 风险识别规则需要长期维护

### 5.6 方案 F：做 artifact 对比型验证

含义：

- 不只看 exit code，还看截图、trace、HTTP 响应快照、生成物结构等产物

优点：

- 更适合前端场景和接口场景
- 和执行中心 artifact 能力天然契合

问题：

- 首版成本偏高
- 需要定义稳定的基准

### 5.7 方案 G：建立黄金回放样例库

含义：

- 沉淀一组典型开发执行样例
- 每次修改 harness 逻辑和 suite 行为，都回放这些样例

优点：

- 比零散单测更能验证“完整链路”
- 更适合执行中心这种编排型系统

问题：

- 需要长期维护样例和期望结果

## 6. 推荐组合方案

推荐方案不是单选，而是以下组合：

- 主线方案：`B 更聪明的 harness 选择 + C 验证分层矩阵`
- 配套方案：`A 丰富测试套件 + D 仓库自描述配置`
- 稳定性方案：`G 黄金回放样例库 + 异步链路补厚`
- 中后期增强：`E 风险分级执行 + F artifact 对比型验证`

核心判断如下：

- suite 是执行手段，不是治理主线
- harness 选择和分层矩阵，决定平台测试是否“像平台能力”
- 仓库配置和回放样例，决定平台测试能否持续演进

## 7. 目标架构

### 7.1 架构原则

后续目标架构要遵循以下原则：

- `COMMAND` suite 保持平台 harness 主路径
- `PLAYWRIGHT_SMOKE`、`SERVICE_SMOKE` 明确作为补充验证层
- `TestExecutionPlan` 协议保持稳定，避免频繁冲击前端与报告聚合
- backend 负责计划与门禁策略，code-processing 负责执行与证据沉淀
- 测试链路必须从任务创建一直贯穿到报告和回写

### 7.2 建议分层

建议把平台测试分成 3 层：

#### 第一层：基础门禁

典型内容：

- 编码检查
- 构建
- 单元测试
- 后端模块测试

建议主要通过 `COMMAND` suite 承载。

#### 第二层：功能验证

典型内容：

- 仓库级功能命令
- 接口级 smoke
- 契约/Schema 检查

建议优先仍走 `COMMAND` suite，必要时再扩专门 suite。

#### 第三层：补充烟测

典型内容：

- `PLAYWRIGHT_SMOKE`
- `SERVICE_SMOKE`
- 截图、trace、启动日志等证据沉淀

这一层应在需要时追加，而不是默认替代第一层和第二层。

## 8. 完整的开发 -> 测试 -> 回写路径

完整路径建议固定为以下 10 步：

1. 用户创建开发执行任务
2. 平台展开 workflow：结构化、规划、实现、测试、报告
3. `IMPLEMENT` 阶段产出 `changedFiles`、工作分支、实现摘要
4. backend 基于 `changedFiles + 仓库类型 + 配置 + 风险` 生成验证意图
5. backend 构造 `TestExecutionPlan`
6. `COMMAND` suite 执行平台 harness 主路径
7. 如命中额外条件，再执行 `PLAYWRIGHT_SMOKE` / `SERVICE_SMOKE`
8. code-processing 通过异步 session 回传 stdout/stderr、进度、summary 和 artifact
9. backend 聚合 suite 结果并收敛 `TEST` 状态
10. `REPORT` 汇总实现与测试结论，并统一回写工作项

这里最重要的约束有两个：

- 平台必须先有“可解释的计划”，再去执行
- 平台必须先有“确定性的门禁结果”，再生成最终报告

## 9. 分模块实施建议

### 9.1 backend

建议把 backend 的演进聚焦在“选择、分层、收口”三件事。

#### 建议新增或拆分的职责

- `HarnessSelectionService`
  - 输入：`changedFiles`、仓库信息、测试配置
  - 输出：推荐的 harness 命令集合、命中原因、风险级别

- `VerificationPolicyService`
  - 输入：验证意图
  - 输出：应生成哪些 suite、哪些必跑、哪些可跳过

- `DevelopmentExecutionService`
  - 继续保留主编排职责
  - 不再承担过多规则拼装细节

#### backend 需要补的能力

- 让 `test_plan_json` 带出更明确的来源说明和触发原因
- 在报告阶段明确分层展示“基础门禁 / 功能验证 / 补充烟测”
- 对 `TEST` 的失败原因做更稳定的聚合，不只回传原始错误文本

### 9.2 code-processing

建议把 code-processing 的演进聚焦在“执行、事件、证据”三件事。

#### 保持不变的部分

- `CodexExecutionRequest`
- `TestExecutionPlan`
- `suiteResults`
- 异步 `/start` 与回调协议

#### 重点增强点

- 强化 `COMMAND` suite 的主路径能力
- 让 command 适配、跳过、超时、取消、stderr 收口更稳定
- 对 `PLAYWRIGHT_SMOKE`、`SERVICE_SMOKE` 继续补单测和错误路径
- 确保 sidecar 产物 manifest、完整日志、尾日志预览三者一致

### 9.3 frontend

前端不需要首轮大改信息架构，但建议逐步做到：

- 在步骤详情中区分“基础门禁”和“补充烟测”
- 能看到当前 suite、当前命令、当前失败点
- 产物预览优先服务截图、trace、启动日志、HTTP 日志
- 报告页可以直接读到测试分层摘要，而不是只看长 Markdown

### 9.4 配置层

测试配置建议拆成两类来源：

- 平台侧绑定配置
  - 适合存平台托管参数
  - 适合作为缺省值和兜底值

- 仓库内自描述配置
  - 适合存仓库自己的测试偏好
  - 适合跟随源码一起演进

建议优先级如下：

1. 平台硬约束
2. 仓库内显式配置
3. 平台绑定缺省配置
4. 自动推断

## 10. 分阶段实施计划

### 阶段一：主线收敛

目标：

- 明确 `TEST` 主线是平台 harness
- 明确 smoke suite 是补充验证
- 明确验证分层

建议输出：

- 新文档落地
- 术语统一
- backend 代码中补清晰注释和变量语义

### 阶段二：harness 选择升级

目标：

- 把当前 `changedFiles -> testCommands` 升级为可解释、可测试的选择层

建议输出：

- `HarnessSelectionService`
- 一组选择规则单测
- 选择理由进入 `test_plan_json`

### 阶段三：suite 与配置增强

目标：

- 在主线稳定后再扩 suite
- 仓库配置从纯绑定走向“绑定 + 仓库内声明”的组合模式

建议输出：

- 保持 `COMMAND` 为主路径
- 增量扩展 smoke / contract / migration 等 suite
- 设计仓库内配置文件格式

### 阶段四：异步链路补厚

目标：

- 把 `/start -> events -> complete -> cancel` 测透
- 保证长任务稳定性

建议输出：

- backend session/callback 集成测试
- code-processing cancel / timeout / artifact 测试
- watchdog 和失败收口测试

### 阶段五：黄金回放与端到端验收

目标：

- 用真实样例验证整条链路可回归

建议输出：

- 一组黄金开发执行样例
- 每个样例的预期 harness 选择
- 每个样例的预期 suite 结果
- 每个样例的报告与回写验收点

## 11. 测试策略

### 11.1 backend 测试

重点覆盖：

- harness 选择规则
- `TestExecutionPlan` 生成
- 多仓阻断策略
- `TEST` 失败后的 `REPORT` 补偿
- 异步 session 成功、失败、取消、超时

### 11.2 code-processing 测试

重点覆盖：

- `COMMAND` suite 命令适配与跳过
- `PLAYWRIGHT_SMOKE` 成功与失败
- `SERVICE_SMOKE` 成功与失败
- stdout/stderr 流式事件
- cancel 回收与 sidecar 产物 manifest

### 11.3 端到端验证

至少应沉淀以下样例：

- 单仓前端改动：命中构建 harness，必要时叠加 Playwright smoke
- 单仓后端改动：命中后端测试 harness，必要时叠加 service smoke
- 多仓改动：前仓测试失败后阻断后续仓库
- 取消任务：正在执行的测试 runner 能够正确停止

## 12. 验收标准

当以下条件同时满足时，可认为该方案落地有效：

- 平台能解释“为什么选这些 harness”
- `COMMAND` suite 成为稳定主路径
- smoke suite 仅在命中条件时执行
- 任何 suite 的失败都能给出清晰摘要和可下载证据
- `TEST` 结果能够稳定进入 `REPORT` 与工作项回写
- 至少有一组黄金样例能从创建任务一直跑到报告收口

## 13. 近期推荐执行顺序

结合当前代码现状，建议近期按以下顺序推进：

1. 先用本文统一术语和目标，停止继续把主方案表述成 sidecar 方案
2. 把 backend 的 harness 选择逻辑抽出来，并补单测
3. 把 `COMMAND` suite 作为主路径继续补强
4. 保持 smoke suite 增量补测，但不让 smoke 抢占主线定义
5. 补 backend 异步 session / callback / cancel 链路测试
6. 最后补黄金回放样例和源码模式端到端验收

## 14. 一句话结论

平台下一阶段要建设的不是“更多 sidecar”，而是“以平台 harness 为主线、以 suite 为执行手段、以异步链路和回放样例为兜底”的完整开发测试闭环。
