# GitPilot 快开 1.0 框架识别与 Coding 应用技术设计 v1

状态：P0 已落地；P1/P2（更多模块模板、云端 Coding 和快开 2.0 适配器）按本文档继续演进。

## 1. 背景与目标

GitPilot Desktop 的 Code/Work 模式已经能够把人工填写的 `technologyStack` 写入工作区 `.gitpilot/project-binding.json`，并在每轮 Agent 请求前注入系统提示词。这个机制可以提供上下文，但不能保证技术栈来自真实代码，也不能把自研框架的编码约定稳定地转化为实现动作。

本设计以“快开 1.0”资料为第一种自研框架适配目标，但识别器必须把“快开”作为框架族、把 `1.0/2.0` 作为可替换的版本适配器，不能把 1.0 的规则写死在通用逻辑中。目标是解决两件事：

1. 从当前工作区的配置、源码和脚本中确定性识别快开，而不是让 Agent 根据目录名或项目名称猜测。
2. 识别成功后，在后续 Coding 中自动采用对应版本的快开前端 API、数据模型 Groovy、工作流和平台扩展约定。

非目标：本版本不解析或上传整套 Word 资料，不把资料中的数据库地址、`accessKey`、`secretKey` 或其它凭据写入 profile、提示词、日志和测试；不自动调用真实业务接口，不替用户决定业务模型 ID、数据集 ID 或权限配置。

## 2. 已确认的快开约定

### 2.1 前端

- 基础请求使用 `@vunk/skzz` 的 `RestFetch`，业务服务优先使用 `useBusiService`，流程使用 `useFlowService`。
- 业务接口分别是 `/core/busi/query`、`/core/busi/save`、`/core/busi/exec` 和文件上传执行接口。
- 请求上下文由 `dir`、`modelId`、`menuId`、`buttonId`、`datasetId` 组成。
- `OpEnum` 使用 `Select=0`、`Delete=2`、`Insert=4`、`Update=8`。
- 列表查询优先复用 `queryM/queryD/queryDC` 等简化方法；保存优先复用 `saveM/increaseM/modifyM/removeM`，不要重复手写平台请求封装。
- 登录、登出、验证码、雪花 ID、单号、文件上传和常量服务由平台封装提供。

### 2.2 后端脚本

- 数据模型脚本位于 `/scripts/model/{dir}/{modelId}.groovy`。
- 脚本通过 `argument()` 读取 `dir/modelId/menuId/buttonId/datasetId/condition/datas`，通过 `sqlTool()`、`platformSqlTool()`、`redisTool()`、`zzProps()` 和 `messageTool()` 使用平台能力。
- `dbTool.query/queryOne/execute` 的 SQL 必须使用占位符传参，禁止字符串拼接；业务库和元数据库不能混用。
- 工作流通常把 `ConstantKt.SAVE_BUSI` 和 `system/flow/flow` 配置在同一个数据模型脚本链中；消息流程使用 `system/message`。

### 2.3 平台模块

- 轻量级工作流涉及 `zz_model_flow`、`system/flow/flow`、`startAndSubmit`、待办/已办查询、会签和业务状态映射。
- 定时任务使用 Quartz 或 Spring Task，脚本路径为 `scripts/${application}/job/${group}/*.groovy`。
- 文件服务通过 `zz-platform-file-starter` 和 `fileServiceType` 选择 MongoDB GridFS、OSS 或 OBS；GIS 通过 `zz-platform-gisserver-starter` 和 GeoServer REST 能力接入。
- 消息服务通过 `messageTool.send/delaySend`、`MessageParam` 和接收人结构发送消息。
- `zz_model_config.allow_no_login/allow_no_auth` 使用 `1/2/4/8` 位掩码，完整的查删增改权限为 `15`。

## 3. 总体架构

```text
工作区文件
  │
  ▼
FrameworkDetector（本地、只读、确定性）
  │  FrameworkProfile：证据、版本、模块、置信度、指纹
  ├── 写入 .gitpilot/project-binding.json（兼容 technologyStack）
  ├── before_agent_start 注入精简摘要与编码规则
  ├── 按需提供 kuaikai-platform 内置 Skill/模板
  └── gitpilot_framework_detect 显式刷新
```

识别器、profile 和提示词配方放在 `gitpilot-cli`，因为 Desktop sidecar 直接复用 CLI 的 `rpc-entry.ts`。后续云端或 `code-processing` Coding 只传递同一份精简 profile，不重新实现识别规则。

## 4. 可扩展的框架适配器模型

### 4.1 框架族、版本和适配器三层概念

识别结果不使用 `kuaikai-1.0` 作为唯一 ID，而是拆成三层：

- `familyId`：稳定的框架族 ID，例如 `kuaikai`；跨版本不变。
- `version`：从项目依赖、插件、配置或明确源码事实中提取，例如 `1.0`、`2.0`，无法确认时为 `unknown`。
- `adapterId`：实际采用的版本适配器，例如 `kuaikai-v1`、`kuaikai-v2`；它决定版本特有的规则、模板和验证器。

适配器注册表建议抽象为：

```ts
interface FrameworkAdapter {
  readonly familyId: string;
  readonly adapterId: string;
  readonly supportedVersions: readonly string[];
  detect(workspaceRoot: string, commonEvidence: Evidence[]): Promise<VersionDetection>;
  buildProfile(input: AdapterInput): FrameworkProfile;
  buildGuidance(profile: FrameworkProfile, task: CodingTask): GuidanceBundle;
  validateGeneratedChange(profile: FrameworkProfile, files: FileChange[]): ValidationFinding[];
}
```

规则按以下层次合并，后者不能静默覆盖前者的事实证据：

1. `family-common`：快开族所有版本共有的目录、命名和安全规则。
2. `version-adapter`：1.0 或 2.0 的依赖坐标、API、配置和脚本约定。
3. `module-capability`：业务数据、工作流、文件、GIS、消息等模块能力。
4. `project-override`：用户明确确认的项目级补充约束，只能补充 Coding 指导，不能伪造检测证据或版本。

这样接入快开 2.0 时只新增 `kuaikai-v2` 适配器和对应 Skill 章节，不改动绑定流程、profile 校验、提示词注入和其它框架适配器。

### 4.2 FrameworkProfile 数据结构

外层绑定文件继续接受 `schemaVersion: 1`，因为新增字段是向后兼容的可选字段，旧版 sidecar 仍可读取项目绑定。profile 自己使用独立的 `profileSchemaVersion`，以后可单独演进。

```json
{
  "schemaVersion": 1,
  "boundAt": "2026-08-15T00:00:00.000Z",
  "workspacePath": "C:/workspace/order-service",
  "mode": "code",
  "project": { "id": 12, "name": "订单中心" },
  "technologyStack": "Java、Spring Boot、MyBatis、快开 1.0、Vue 3",
  "frameworkProfiles": [
    {
      "profileSchemaVersion": 1,
      "familyId": "kuaikai",
      "adapterId": "kuaikai-v1",
      "name": "快开",
      "version": "1.0",
      "versionSource": "pom-dependency",
      "versionConfidence": 0.92,
      "status": "detected",
      "confidence": 0.96,
      "scope": "workspace",
      "components": ["java-backend", "vue-frontend"],
      "modules": ["busi-data", "workflow", "message"],
      "evidence": [
        {
          "path": "pom.xml",
          "rule": "maven-com-zz-platform",
          "matched": "com.zz.platform:zz-platform-file-starter",
          "weight": 0.45,
          "line": 87
        },
        {
          "path": "frontend/src/service/order.ts",
          "rule": "skzz-busi-api",
          "matched": "useBusiService",
          "weight": 0.25,
          "line": 12
        }
      ],
      "codingGuidance": [
        "前端业务读写优先使用 useBusiService/useFlowService",
        "后端业务逻辑优先使用 scripts/model 下的数据模型 Groovy",
        "SQL 使用占位符传参，禁止字符串拼接"
      ],
      "ruleSetVersion": "kuaikai-v1-r1",
      "fingerprint": "rules-1:...",
      "detectedAt": "2026-08-15T00:00:00.000Z"
    }
  ]
}
```

约束：

- `evidence.matched` 只保留依赖坐标、标识符或脱敏的短片段，不保存配置值、密钥、Token、数据库 URL 或整段源码。
- `confidence` 是规则计算结果，不是模型判断；`detected`、`ambiguous`、`not-detected`、`stale` 是有限状态。
- `technologyStack` 是给用户看的摘要；`frameworkProfiles` 是给 GitPilot 使用的结构化事实。人工摘要不能覆盖高置信度的检测证据。
- `technologyStack` 可同时汇总通用依赖事实（例如 Java、Spring Boot、MyBatis、Vue、TypeScript）和框架 profile 摘要；无法从配置确认的技术不自动补写。
- `familyId` 是稳定主键，`adapterId` 和 `ruleSetVersion` 可随版本适配器演进；不要用显示名称或版本号作为持久化主键。
- 版本识别与框架族识别分开计算：即使无法确认版本，也可以得到 `familyId=kuaikai`，但只能启用 `family-common` 规则，不能自动套用 1.0 或 2.0 的特有模板。
- 允许 `frameworkProfiles` 数组，以支持前后端分目录或 Monorepo；每个 profile 可通过 `scope/rootPath` 指向对应子树。

## 5. 快开识别器设计

### 5.1 组件边界

建议新增以下纯本地模块：

- `gitpilot-cli/src/extensions/gitpilot/framework-profile.ts`：类型、校验、摘要格式化和敏感字段过滤。
- `gitpilot-cli/src/extensions/gitpilot/framework-detector.ts`：文件扫描、规则匹配、置信度计算和指纹生成。
- `gitpilot-cli/src/extensions/gitpilot/framework-registry.ts`：注册框架族和版本适配器，首批包含 `kuaikai-v1`，预留 `kuaikai-v2` 及其它自研框架。
- `gitpilot-cli/src/extensions/gitpilot/framework-guidance.ts`：根据 profile 模块返回精简编码规则和模板索引。

识别器接口建议为：

```ts
interface FrameworkFamily {
  readonly familyId: string;
  readonly adapters: readonly FrameworkAdapter[];
  detectCommon(workspaceRoot: string, options?: DetectOptions): Promise<CommonDetection>;
}
```

框架族识别、版本识别和适配器选择分开执行：先确认 `familyId`，再根据版本证据选择唯一适配器；如果多个适配器同时命中，profile 必须保持 `ambiguous`，不能按注册顺序静默选择。所有检测不执行 Shell、不联网、不修改源码，只使用受控的 `fs/promises` 读取文件。

### 5.2 读取范围和安全限制

1. 优先读取根目录和一级子项目的 `pom.xml`、`build.gradle(.kts)`、`package.json`、`pnpm-workspace.yaml`、`application*.yml/properties`、README 和构建入口。
2. 只有发现候选根后，才扫描有限数量的 `src`、`scripts/model`、`scripts/**/job` 和 `.groovy` 文件；跳过 `.git`、`node_modules`、`target`、`dist`、`.venv`、二进制和大文件。
3. 单文件大小、文件数量、目录深度和总扫描字节数设置上限；超限时 profile 标记为 `partial`，不能把“未找到”解释成“没有框架”。
4. `package.json` 使用 JSON 解析；其它格式只提取依赖坐标和键名，不把整份配置送入模型。
5. 匹配 `accessKey`、`secretKey`、`password`、`token`、连接串等字段时只记录规则命中，不记录值；资料目录 `C:/Users/dlhxy/Downloads/快开1.0` 不参与运行时扫描。

### 5.3 规则与置信度

规则分为族级强证据、版本证据、结构证据和模块证据。每条证据带 `rule/path/line/matched/weight`，同一文件同一规则只计一次；族级置信度和版本置信度分开计算，总分封顶 0.99。

| 证据 | 建议权重 | 说明 |
| --- | ---: | --- |
| Maven 坐标 `com.zz.platform:*` | 0.45 | 最强后端平台证据 |
| `package.json` 依赖 `@vunk/skzz` | 0.35 | 最强前端平台证据 |
| `useBusiService/useFlowService/RestFetch` | 0.15 | 源码 API 证据 |
| `/core/busi/query/save/exec/uploadExec` | 0.12 | 平台路由证据 |
| `scripts/model` 或模型 Groovy 使用 `argument/sqlTool/dbTool` | 0.15 | 数据模型脚本证据 |
| `zz.platform/zz.geoserver/fileServiceType` 配置 | 0.08 | 模块配置证据 |
| `zz_model_flow/system/flow/flow/startAndSubmit` | 0.10 | 工作流证据 |
| `messageTool`、`obsTool/ossTool/gridFsTool`、`GeoServerRESTManager` | 0.05/项 | 专项模块证据 |

判定建议：

- `>= 0.75`：`detected`，可自动启用快开 Coding 配方。
- `0.45 - 0.74`：`ambiguous`，展示命中证据，请用户确认后再启用强约束模板。
- `< 0.45`：`not-detected`，只保留普通技术栈识别，不注入快开规则。
- 文件指纹变化而未刷新：`stale`，提示“框架档案可能过期”，不自动覆盖用户修改。

只命中文档、README 或目录名不能触发 `detected`；至少需要一条配置/依赖证据或两条独立源码结构证据。版本只有在依赖版本、插件版本或明确配置中出现时才填写，否则为 `unknown`，不能根据资料文件名填写 `1.0`。当 `familyId=kuaikai` 但版本为 `unknown` 时，只能使用族级安全规则和通用 API 约束；当版本适配器置信度不足时，不生成版本特有代码。

### 5.4 版本适配和冲突处理

- `kuaikai-v1` 保存本次资料中的 1.0 规则；`kuaikai-v2` 未来单独维护 2.0 的依赖、API、配置、脚本和迁移说明。
- 适配器选择优先级为：明确版本依赖/插件 > 版本专属源码 API > 配置键 > 用户确认；资料文件名和目录名永远不参与版本选择。
- 1.0 与 2.0 证据同时出现时，profile 为 `ambiguous`，列出冲突路径，Agent 只启用 `family-common`，要求用户确认主版本。
- 版本适配器可以声明 `supersedes`、`incompatibleWith` 和 `migrationNotes`，用于识别升级中的混合代码，但不能自动执行迁移。
- 旧版本适配器保持只读兼容：已经生成的 `kuaikai-v1` profile 不因安装新 CLI 而被静默改写；显式刷新时才按新规则重新计算。

### 5.5 模块识别

在框架识别通过后再识别模块，模块只影响后续注入的规则：

- `busi-data`：`useBusiService`、`/core/busi/*`、`scripts/model`。
- `workflow`：`useFlowService`、`zz_model_flow`、`system/flow/flow`、`startAndSubmit`。
- `file`：文件 starter、`fileServiceType`、上传/下载 API、`obsTool/ossTool/gridFsTool`。
- `gis`：GIS starter、`zz.geoserver`、`GeoServerRESTManager`、WMS/WFS/WCS/WMTS。
- `message`：`messageTool`、`MessageParam`、`system/message`。
- `scheduler`：Quartz/Spring Task 配置、`scripts/**/job`。
- `permission`：`zz_model_config`、`allow_no_login/allow_no_auth`。

## 6. 绑定和刷新流程

### 6.1 用户绑定项目

1. `/project` 查询平台项目列表并由用户确认项目 ID/名称。
2. `gitpilot_project_bind` 写文件前调用本地 detector。
3. 高置信度时自动生成 `technologyStack` 摘要和 `frameworkProfiles`；人工传入的 `technologyStack` 只作为补充，不能覆盖 profile 的 `familyId/adapterId/version/confidence/evidence`。
4. 未识别或扫描不完整不阻断项目绑定，写入空 profile 或 `ambiguous` profile，并在工具结果中说明下一步可以刷新或人工确认。
5. profile 为 `detected` 且存在内置适配器时，安装到当前项目 `.gitpilot/skills`；已有用户同名 Skill 不覆盖。
6. 绑定结果只返回路径、项目摘要和识别摘要，不返回证据中的敏感内容。

### 6.2 显式刷新

新增 `gitpilot_framework_detect` 工具用于显式刷新：

- 默认只刷新当前 workspace；可选 `rootPath` 必须在当前 workspace 内。
- 重新扫描后更新 profile 指纹和检测时间；不自动修改用户手写的 `workspaceContext`。
- 发生框架或版本冲突时保留所有候选 profile，状态为 `ambiguous`，要求用户确认主框架/版本；确认结果只记录为项目 override，不删除原始证据。
- 不在每轮 Agent 回合重复全量扫描；每轮只读取绑定文件，必要时做轻量指纹检查。

## 7. 后续 Coding 应用

### 7.1 提示词分层

`before_agent_start` 只追加 500-1500 字符的摘要，不把全部 Word 文档或所有证据注入上下文：

```text
## 当前工作区框架档案
- 框架：快开 1.0（confidence 0.96，已识别）
- 组件：Java 后端、Vue 前端
- 模块：业务数据、工作流、消息
- 编码约束：
  - 前端业务读写优先 useBusiService/useFlowService，沿用 dir/modelId/menuId/buttonId/datasetId
  - 后端优先在 scripts/model/{dir}/{modelId}.groovy 扩展业务逻辑
  - SQL 只能使用占位符，禁止字符串拼接
- 详细配方：仅在任务涉及对应模块时加载 kuaikai-platform Skill/模板
```

摘要必须明确“这是本地规则检测结果，仍需以当前源码和用户要求为准”，防止过期 profile 变成绝对事实。

### 7.2 快开 Coding 配方

识别到不同任务意图后，只加载对应章节：

| 任务 | 默认实现路径 | 必须检查 |
| --- | --- | --- |
| 列表/详情查询 | `useBusiService` 的 `queryM/queryD/queryDC` | 现有 `dir/modelId/menuId/buttonId/datasetId`、分页和权限按钮数据集 |
| 新增/修改/删除 | `saveM/increaseM/modifyM/removeM` + `OpEnum` | 新增 ID 回填、父子数据集、返回值 `isOk` |
| 自定义业务动作 | `busiService.exec` | `datasetId`、`condition` 结构和后端脚本顺序 |
| 审批提交 | `useFlowService` + `exec` 的 `startAndSubmit` | `zz_model_flow` 映射、状态字段、会签/驳回分支 |
| 后端业务逻辑 | `scripts/model/{dir}/{modelId}.groovy` | `argument()`、`sqlTool()`、占位符 SQL、事务边界 |
| 消息 | `messageTool.send/delaySend` 或 `system/message` | 接收人脱敏、模板和客户端配置，不写第三方凭据 |
| 文件 | 平台 file starter、统一上传/下载封装 | `fileServiceType`、文件 ID、大小和权限校验 |
| GIS | GIS starter/GeoServer REST | WMS/WFS/WCS/WMTS 类型、服务地址来源和权限 |
| 定时任务 | Quartz/Spring Task + `scripts/**/job` | application/group 路径、幂等和重复执行 |
| 权限 | `zz_model_config` 配置 | 位掩码含义，不能为了跑通而放开 `15` |

### 7.3 生成代码的验证门槛

Agent 在修改前必须先找同模块的现有页面、Groovy 脚本或测试；找不到示例时先说明缺口，不凭资料臆造业务字段。修改后至少执行：

- TypeScript/Vue 项目已有的类型检查或构建；
- Groovy/Java 项目已有的单测或最小编译；
- 对新增 SQL 做静态检查，拒绝把用户输入拼入 SQL 字符串；
- 对工作流、消息、文件和 GIS 代码做配置项/权限/凭据检查；
- 在结果中列出 profile 依据、实际改动和未验证风险。

## 8. Skill 与模板分发

新增 `gitpilot-cli/src/bundled-skills/kuaikai-platform/SKILL.md`，采用现有 `bundled-skills` 随 sidecar 复制到 `resources/skills` 的机制。Skill 按框架族和版本拆分为“公共章节 + 版本章节”：

- `kuaikai-platform/common`：安全规则、profile 解释和所有版本都必须遵守的通用约定。
- `kuaikai-platform/v1`：本次资料中的 1.0 API、脚本链和模块模板。
- `kuaikai-platform/v2`：未来 2.0 资料确认后新增，不能由 Agent 根据 1.0 资料自动推导。

该 Skill 不应默认对所有项目可见：

1. profile 为 `detected` 且 `adapterId` 已受支持时，由项目绑定 extension 动态启用 `common + 对应版本` Skill/章节；
2. profile 为 `ambiguous` 时只显示识别证据和确认入口，不启用强约束模板；
3. 用户自行在项目 `.gitpilot/skills` 中维护的同名 Skill 优先，内置版本不得覆盖用户内容；
4. 模板只包含占位符、伪数据和脱敏配置，不包含资料中的真实凭据。

Skill 章节建议包括：`frontend-busi.md`、`backend-groovy.md`、`workflow.md`、`message.md`、`file.md`、`gis.md`、`scheduler.md`、`permissions.md`。基础 `SKILL.md` 只写适用条件和章节索引，避免每轮加载全部内容。版本章节必须声明适用的 `adapterId` 和 `ruleSetVersion`，防止 2.0 规则误用于 1.0 项目。

## 9. 远程 Coding 衔接

当前 Desktop 本地 Coding 走 sidecar，不需要经过 `code-processing`。后续云端 Coding 接入时，在 `CodexExecutionRequest`/`CliExecutionRequest` 增加受限的 `frameworkProfile` 字段：

- 只允许 `familyId/adapterId/version/status/components/modules/codingGuidance/ruleSetVersion` 等非敏感摘要；拒绝任意 URL、Token、密码、完整 evidence 片段和超长文本。
- `code-processing` 的 `_build_codex_prompt`、Claude/OpenCode 实现 prompt 统一调用 profile formatter，把同一套快开规则放入“补充上下文”。
- 云端仍必须在仓库工作区重新读取源码验证 profile，不能把客户端传来的 profile 当作授权或事实来源。
- 执行日志只记录框架 ID、版本和规则版本，不记录 profile 原文中的敏感字段。

## 10. 测试与验收

### 10.1 单元测试

- Maven 依赖、`@vunk/skzz`、平台 API、Groovy 工具、工作流、模块配置分别命中预期规则。
- 快开 1.0 样例命中 `familyId=kuaikai`、`adapterId=kuaikai-v1`；未来 2.0 样例命中 `adapterId=kuaikai-v2`，两者互不覆盖。
- 只有族级证据但没有版本证据时，profile 保持 `version=unknown`，只启用公共 Skill。
- 同一仓库混合 1.0/2.0 API 时返回 `ambiguous`，保留两个候选 profile 和冲突证据，不自动选版本。
- 只有 README/目录名命中时为 `not-detected` 或 `ambiguous`。
- 版本缺失时为 `unknown`，不从资料目录名推断版本。
- 同一证据去重、权重封顶、证据路径相对化、敏感值脱敏。
- Monorepo 返回多个 profile，扫描超限时返回 `partial/stale`，不抛出绑定失败。
- 旧 `schemaVersion:1` 绑定无 profile 时仍能正常注入项目上下文。

### 10.2 集成测试

- `gitpilot_project_bind` 在快开样例仓库写出 `technologyStack` 和 `frameworkProfiles`。
- `before_agent_start` 只注入摘要和规则，不注入完整 evidence 或敏感字段。
- `gitpilot_framework_detect` 更新 profile 指纹但保留 `workspaceContext` 和用户自定义字段。
- sidecar 构建后能找到内置 Skill 资源，已有用户 Skill 不被覆盖。
- 远程 Coding 请求拒绝超长或含凭据的 profile。

### 10.3 验收标准

1. 在同时含 Java/Spring Boot、`@vunk/skzz`、`scripts/model` 的真实工作区中，快开识别置信度达到 `detected`，且 evidence 至少来自两个独立文件类别。
2. Agent 新增一个列表页或数据模型脚本时，能引用现有快开 API 和脚本路径，不生成普通 Spring Controller/任意 REST CRUD 作为默认方案。
3. 生成 SQL 拼接、把权限直接设为 `15`、把第三方凭据写入配置等危险实现必须被提示词规则和测试拦截。
4. 不含快开证据的普通 Java/Vue 仓库不会被误识别为快开。
5. 全流程离线可运行，检测和 Coding 不访问资料目录以外的外部路径、不上传源码或凭据。

## 11. 分阶段实施建议

### P0：本地识别与绑定

- 实现 profile 类型、框架族注册表、`kuaikai-v1` 适配器、detector、绑定写入和 `before_agent_start` 摘要注入。
- 保留现有 `technologyStack` 字段并自动生成摘要。
- 增加 detector、binding 和 prompt 单元测试。

### P1：按需配方和刷新

- 增加内置 `kuaikai-platform` Skill 和 `gitpilot_framework_detect` 工具。
- 增加模块级章节选择、指纹缓存和 Desktop 侧识别状态展示。
- 增加代码生成后的 SQL/凭据/权限静态检查。

### P2：云端 Coding 与更多自研框架

- 扩展 `code-processing` 请求和各 CLI prompt formatter。
- 新增 `kuaikai-v2` 适配器（以 2.0 正式资料和真实样例为准），再继续加入其它自研框架。
- 对 profile 版本、规则版本和冲突处理做迁移兼容。

## 12. 待确认事项

- 绑定文件中结构化字段最终命名使用 `frameworkProfiles`（推荐，支持 Monorepo）还是单个 `frameworkProfile`。
- 快开 1.0/2.0 是否有可从项目依赖稳定读取的正式版本号；没有则保持 `unknown`，不使用资料目录名推断。
- 2.0 是否保持 1.0 的 `@vunk/skzz`、`/core/busi/*` 和 Groovy 模型契约；如果发生不兼容变更，应由 `kuaikai-v2` 适配器显式声明，而不是在 v1 规则中增加分支。
- Desktop 是否在 P1 增加“已识别框架/置信度/刷新”状态入口，还是先只通过 `gitpilot_framework_detect` 和对话可见。
- 快开 Skill 的详细模板是否由平台团队继续提供脱敏示例，以便把资料中的截图和真实环境配置转换成可测试模板。
