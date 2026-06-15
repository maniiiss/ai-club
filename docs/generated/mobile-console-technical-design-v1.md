# 移动端控制台设计方案 V1

## 文档定位

本文档不是一次性的样式优化记录，而是 AI Club 控制台的移动端设计方案。

适用场景：

- 后续新增任何面向手机端访问的列表页、看板页、详情页或工作台页面
- 对现有模块继续做移动端重构、压缩、交互修复或分页方案统一
- 评审新模块时，作为“手机端是否符合现有控制台设计语言”的检查依据

设计目标：

- 保持桌面端信息密度优势的同时，建立一套稳定、可复用的移动端布局原则
- 降低小屏下的首屏占用、工具栏换行、分页操作负担和误触风险
- 让后续模块直接复用现有能力，而不是每个页面各做一套手机端适配

## 适用范围

### 全局与共用能力

- `frontend/src/layout/AppLayout.vue`
- `frontend/src/styles/index.css`
- `frontend/src/utils/mobileWaterfallPagination.ts`

### 已作为参考实现的页面

- `frontend/src/views/DashboardView.vue`
- `frontend/src/views/ProjectView.vue`
- `frontend/src/views/ExecutionTaskView.vue`
- `frontend/src/views/IterationView.vue`
- `frontend/src/views/AgentView.vue`
- `frontend/src/views/TestPlanView.vue`
- `frontend/src/views/WikiHomeView.vue`
- `frontend/src/views/JenkinsServerView.vue`
- `frontend/src/views/PipelineBindingView.vue`
- `frontend/src/views/ModelView.vue`
- `frontend/src/views/UserView.vue`
- `frontend/src/views/RoleView.vue`
- `frontend/src/views/PermissionView.vue`
- `frontend/src/views/ToolConfigView.vue`
- `frontend/src/views/RepositoryScanRulesetView.vue`
- `frontend/src/views/OperationLogView.vue`
- `frontend/src/views/GitlabView.vue`

## 设计原则

### 1. 首屏优先

- 手机端首屏优先展示“当前最需要操作的内容”，避免让摘要卡、说明文字、分页控件抢占主列表空间。
- 非必要的说明文案、重复标题、装饰型状态提示在移动端应当压缩、折叠或移除。
- 顶部区域如需同时承载返回、状态、创建、头像、消息等入口，应拆分层级，避免所有元素堆在同一行。

### 2. 操作聚合

- 手机端工具栏中的主操作按钮默认并入搜索/筛选操作区，不再单独占一整行。
- 右侧主操作按钮遵循“内容宽度自适应 + 靠右对齐”的规则，避免大面积留白。
- 常用操作优先同排呈现，低频操作再进入筛选面板、详情页或二级弹层。

### 3. 信息压缩

- KPI 摘要卡优先使用两列网格，而不是单列大卡堆叠。
- 列表卡片采用紧凑的标题、标签、元信息布局，避免大段留白。
- 标题、摘要、链接等长文本必须具备宽度约束和截断策略，不能撑破卡片。

### 4. 连续浏览

- 手机端列表不展示桌面分页 footer。
- 列表采用瀑布流式连续加载，用户通过自然滚动完成翻页。
- 滚动到底部后自动触发下一批数据，不要求用户再点“下一页”。

### 5. 触控安全

- 所有移动端头部按钮都要检查是否误包进 `el-dropdown`、`el-popover` 等触发区。
- 同排按钮的可点击区域要统一，不要出现个别按钮更高、更圆或更长而破坏触控节奏。
- 横向滚动区应保留缓冲边距，避免第一个卡片紧贴屏幕边缘并产生回弹割裂感。

## 规范清单

### 1. 顶部导航规范

- 项目级页面优先保留全局头部顺序，不把局部返回按钮顶到全页最顶部。
- 手机端头像、消息、Hermes 等按钮必须独立于用户下拉触发区域。
- 如果页面需要展示当前项目名或上下文名称，默认采用“左侧标题 + 右侧全局操作”的双栏头部。

### 2. 列表工具栏规范

- 搜索输入框默认占据主要宽度。
- `筛选`、`重置`、`新增/创建` 等按钮在手机端默认与搜索区构成同一操作块。
- 主操作按钮靠右，尺寸短小，不应占满一整行宽度。
- 页签型切换器如 `全部 / 需求 / 任务 / 缺陷`，手机端默认采用等分布局；只有标签过长时才退回横向滚动。

### 3. 列表卡片规范

- 标题、摘要、编号、链接等字段必须具备 `min-width: 0`、`overflow: hidden`、`text-overflow` 或 `line-clamp` 处理。
- 操作区按钮在手机端优先使用同高度、同圆角、同节奏的按钮组。
- 空状态只在“列表真实为空”时显示，禁止因为哨兵节点或模板条件拆分导致误渲染。

### 4. 摘要卡规范

- 手机端摘要卡默认两列。
- 卡片内边距、圆角、字号应较桌面端再收紧一档。
- 不再使用桌面端多行说明文案占用首屏空间。

### 5. 横向列表规范

- 如迭代列表、看板过滤区等需要横向滑动，必须保留左/右缓冲边距。
- 第一个卡片不能直接贴边。
- 需要设置 `scroll-padding` 或等效缓冲方案，降低用户滑到边缘时的生硬回弹感。

## 通用能力设计

### 移动端瀑布流分页

通用能力文件：

- `frontend/src/utils/mobileWaterfallPagination.ts`

设计要求：

- 桌面端继续沿用已有 `page/size` 分页。
- 手机端固定请求第 1 页，但逐步放大 `size`，形成连续滚动体验。
- 页面通过底部哨兵触发下一段加载。
- 手机端隐藏分页 footer，不再展示“每页 / 上一页 / 下一页 / 第 N 页”。

适配要求：

- 新列表页如果存在移动端卡片模式，优先接入该组合式工具。
- 搜索、筛选、页签切换、作用域切换后，需要重置移动端瀑布流状态。
- 如果页面有多套分页列表（例如 GitLab 多 tab），应分别维护各自的移动端瀑布流状态。

### 通用样式补充

已补充到：

- `frontend/src/styles/index.css`

作用：

- 为移动端哨兵节点提供统一样式
- 为 `management-list / atelier / work-list` 三类工具栏提供“新增按钮并回同排”的全局移动端规则

### 移动端表单抽屉

通用能力文件：

- `frontend/src/components/MobileFormDrawer.vue`
- 配套断点 composable：`frontend/src/utils/mobileViewport.ts`（断点 900）

设计要求：

- 桌面端（>900px）继续沿用各自的 `el-dialog` 形态，保持既有视觉与交互不变。
- 移动端（≤900px）将“新增/编辑”类业务弹窗切换为底部抽屉，从下往上弹出。
- 抽屉关键参数：`direction="btt"`、默认 `size="88%"`（最高 100%，可按内容收缩）、`:show-close="false"` 自绘头部、点击遮罩默认不关闭。
- 视觉规范：
  - 顶部圆角 `24px 24px 0 0`，与 `mobile-more-drawer` / 消息中心抽屉保持一致。
  - 顶部居中渲染 `36×4` 圆角拖拽指示条，提示可下滑收起。
  - 头部支持图标 + 标题 + 副标题三段式，右上角附“收起”自绘按钮。
  - 底部 footer 为「取消 + 主操作」全宽双按钮，使用 `safe-area-inset-bottom` 适配刘海屏。
- 业务集成约定：
  - 表单主体抽成独立子组件（如 `ProjectEditorFormBody.vue`），桌面端 `el-dialog` 与移动端 `MobileFormDrawer` 共用同一份模板，避免双份漂移。
  - 子组件通过 `defineExpose({ validate, clearValidate, ... })` 透出表单实例方法，父组件继续以 `formRef.value?.validate()` 调用，无需感知形态差异。
  - 业务逻辑（提交、校验、重置）保持单一来源，仅外壳形态因视口切换。
  - 多 dialog 页面允许采用「v-if 桌面 dialog + v-else MobileFormDrawer」复制粘贴方案，无需为每个 dialog 单独抽子组件；改造时承诺"原模板分支保持不变 + 抽屉分支整段复制粘贴"以避免漂移。
  - 桌面端使用 `PlatformDialogHeader` 的页面接入 `MobileFormDrawer` 时，只需透传 `title / subtitle / header-icon` 三个 prop，即可复刻三段式头部视觉，不需要再写 header slot。
  - 全局约定 `:close-on-click-modal="true"`，点击遮罩可关闭抽屉（与移动端「下滑/点击空白处」预期一致）。
  - 抽屉高度策略：
    - 简单/中型表单（≤820px 桌面宽度）：`size="88%"`，按内容收缩。
    - 含 MarkdownEditor / 大表单 / 数组项 / 长 YAML 等：`size="100%"` 全屏。

参考实现（已接入 `MobileFormDrawer` 的页面与组件）：

- 项目管理：`frontend/src/views/ProjectView.vue`（新建/编辑项目 / 维护 Gitee 绑定）
- 用户/角色/权限：`UserView.vue`、`RoleView.vue`、`PermissionView.vue`
- AI 模型与智能体：`ModelView.vue`、`AgentView.vue`（编辑 + 测试两个抽屉）
- 自动化与 Wiki：`TestPlanView.vue`、`WikiHomeView.vue`、`WikiSpaceView.vue`（4 个抽屉，含 MarkdownEditor 全屏）
- 工程基础设施：`GitlabView.vue`（7 个编辑型抽屉）、`JenkinsServerView.vue`、`AiClubPipelineDetailView.vue`、`ServerManagementView.vue`、`ServerDetailView.vue`、`SelfUpgradeCenterView.vue`、`RepositoryScanRulesetView.vue`、`ShortcutEntryManagementView.vue`
- 公共组件：`AiClubPipelineFormDialog.vue`（被 `PipelineBindingView.vue` 复用，组件内部双外壳）


## 参考实现

### 首页看板

- 参考页面：`frontend/src/views/DashboardView.vue`
- 设计要点：
  - 组件区由桌面网格切换为移动端自然流
  - 编辑态精简为可排序/可隐藏，不保留桌面端宽高调节
  - 卡片统一拉满宽度，避免单列下宽度不一致

### 项目管理 / 执行中心

- 参考页面：
  - `frontend/src/views/ProjectView.vue`
  - `frontend/src/views/ExecutionTaskView.vue`
- 设计要点：
  - 顶部 KPI 两列紧凑排布
  - 工具栏按钮归位到同排
  - 标题超长内容必须截断
  - 列表分页切换为移动端瀑布流

### 迭代管理

- 参考页面：`frontend/src/views/IterationView.vue`
- 设计要点：
  - 页面顶部保留全局导航顺序
  - 移动端局部头部采用“项目名 + 全局操作”结构
  - 返回项目列表与新建迭代并为同排局部操作
  - 新建工作项与搜索、筛选、重置形成同一操作块
  - 工作项列表移动端采用瀑布流

### 管理类列表

- 参考页面：
  - `AgentView.vue`
  - `TestPlanView.vue`
  - `WikiHomeView.vue`
  - `JenkinsServerView.vue`
  - `PipelineBindingView.vue`
  - `ModelView.vue`
  - `UserView.vue`
  - `RoleView.vue`
  - `PermissionView.vue`
  - `ToolConfigView.vue`
  - `RepositoryScanRulesetView.vue`
  - `OperationLogView.vue`
- 设计要点：
  - 手机端主按钮并回搜索工具栏
  - 分页 footer 隐藏，改为瀑布流加载
  - 列表空状态只在真实无数据时显示

## 当前已落地能力

### 已统一接入移动端瀑布流的页面

- 项目管理
- 执行中心
- 测试管理
- 智能体管理
- 代码仓库（GitLab 绑定 / 自动合并 / 自动合并日志）
- Jenkins 服务
- 项目流水线
- 模型管理
- 用户管理
- 角色管理
- 功能管理
- 工具配置
- 扫描规则集
- 操作日志
- 迭代管理中的工作项列表

### 当前未统一接入的页面

- 自升级中心

说明：

- 该页目前并未沿用可见分页 footer 方案。
- 若后续要纳入同一套移动端分页能力，需要按 `plans / runs / suggestions` 三个页签分别拆分滚动链路。

## 新模块落地要求

后续新增移动端模块时，默认按以下顺序检查：

1. 是否有多余的标题、说明或重复上下文，影响首屏高度。
2. 是否把新增按钮单独挤到下一行。
3. 是否仍保留桌面端分页 footer。
4. 是否存在标题、摘要、链接等长文本溢出。
5. 顶部按钮是否误包进下拉菜单触发区。
6. 横向滚动区是否贴边、回弹是否割裂。

若新模块满足“列表 + 搜索 + 筛选 + 主操作 + 分页”这一常见模式，应优先复用：

- `useMobileWaterfallPagination`
- `management-list / atelier / work-list` 现有工具栏模式
- 已落地模块的 KPI 两列卡片布局

## 验证要求

每次移动端方案落地后至少执行：

- `python scripts/check_encoding.py`
- `cd frontend && npm run build`

如果改动涉及多个列表页、头部交互或通用样式，建议补充真实手机尺寸下的人工走查。
