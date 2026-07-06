# 结构化 Lint 设计方案

## 1. 背景

参考 OpenAI《Harness engineering for context engineering》的核心观点：

> 通过强制执行不变量，而非对实施过程进行微观管理，令智能体能够快速交付，而且不会削弱基础。

当前项目只有 `scripts/check_encoding.py` 做编码检查，缺少验证架构边界的自动化机制。随着代码量增长和智能体参与开发，需要一个结构化 linter 来：

- 防止架构分层被无意破坏
- 强制命名约定，提高代码可读性
- 控制文件大小，避免智能体上下文溢出
- 验证跨服务调用边界
- 为智能体提供即时反馈，错误信息中注入修复指令

## 2. 设计原则

- **零外部依赖**：只用 Python 标准库（`ast`、`pathlib`、`re`），不引入额外安装成本
- **渐进式规则**：先警告后阻断，允许逐步修复存量问题
- **可配置**：规则阈值和白名单通过配置文件管理
- **错误信息即修复指南**：每个错误都告诉智能体怎么修

## 3. 规则清单

### 3.1 后端分层依赖规则

**目标**：强制 `controller → service → repository → domain/model` 单向依赖。

| 规则 ID | 说明 | 严重级 |
|---------|------|--------|
| `BE-DEP-001` | controller 不能 import repository | ERROR |
| `BE-DEP-002` | controller 不能 import domain/model（应通过 service 间接使用） | WARN |
| `BE-DEP-003` | service 不能 import controller | ERROR |
| `BE-DEP-004` | domain/model 不能 import service、repository、controller | ERROR |
| `BE-DEP-005` | repository 不能 import service、controller | ERROR |
| `BE-DEP-006` | dto 不能 import service、repository、controller | ERROR |
| `BE-DEP-007` | util 不能 import controller、service、repository | WARN |

**实现方式**：解析 Java 文件的 import 语句，根据源文件所在包和目标包判断是否违规。

**包路径映射**：
```
com.aiclub.platform.controller   → controller 层
com.aiclub.platform.service      → service 层
com.aiclub.platform.repository   → repository 层
com.aiclub.platform.domain.model → domain 层
com.aiclub.platform.dto          → dto 层
com.aiclub.platform.util         → util 层
com.aiclub.platform.common       → common 层（允许被任何层引用）
com.aiclub.platform.config       → config 层（允许被任何层引用）
com.aiclub.platform.annotation   → annotation 层（允许被任何层引用）
com.aiclub.platform.exception    → exception 层（允许被任何层引用）
```

**允许的依赖方向**：
```
controller → service, dto, common, config, annotation, exception
service    → repository, domain/model, dto, common, config, annotation, exception, util
repository → domain/model, common, config, annotation, exception
domain/model → (无外部依赖)
dto        → (无外部依赖)
util       → common, config, annotation, exception
```

### 3.2 后端命名约定规则

| 规则 ID | 说明 | 模式 | 严重级 |
|---------|------|------|--------|
| `BE-NAME-001` | Entity 类必须以 `Entity` 结尾 | `*Entity.java` | ERROR |
| `BE-NAME-002` | Repository 接口必须以 `Repository` 结尾 | `*Repository.java` | ERROR |
| `BE-NAME-003` | Service 类必须以 `Service` 结尾 | `*Service.java` | ERROR |
| `BE-NAME-004` | Controller 类必须以 `Controller` 结尾 | `*Controller.java` | ERROR |
| `BE-NAME-005` | DTO 类必须以 `Summary`/`Result`/`Detail`/`Request`/`Response`/`Context`/`Overview`/`Stats` 结尾 | 符合任一后缀 | WARN |
| `BE-NAME-006` | Scheduler 类必须以 `Scheduler` 结尾 | `*Scheduler.java` | WARN |
| `BE-NAME-007` | Properties 类必须以 `Properties` 结尾 | `*Properties.java` | WARN |

**实现方式**：根据文件所在目录和类名进行校验。

### 3.3 前端分层依赖规则

**目标**：强制 `views → components, api, stores, types` 单向依赖。

| 规则 ID | 说明 | 严重级 |
|---------|------|--------|
| `FE-DEP-001` | views 不能被 components、api、stores、types 引用 | ERROR |
| `FE-DEP-002` | components 不能引用 views | ERROR |
| `FE-DEP-003` | api 不能引用 views、components、stores | ERROR |
| `FE-DEP-004` | stores 不能引用 views、components | ERROR |
| `FE-DEP-005` | types 不能引用 views、components、api、stores | ERROR |
| `FE-DEP-006` | router 只能引用 views | WARN |

**实现方式**：解析 TypeScript/Vue 文件的 import 语句，根据源文件目录和目标路径判断是否违规。

**目录映射**：
```
frontend/src/views/      → views 层
frontend/src/components/ → components 层
frontend/src/api/        → api 层
frontend/src/stores/     → stores 层
frontend/src/types/      → types 层
frontend/src/router/     → router 层
frontend/src/utils/      → utils 层（允许被任何层引用）
frontend/src/constants/  → constants 层（允许被任何层引用）
frontend/src/styles/     → styles 层（允许被任何层引用）
frontend/src/layout/     → layout 层（允许被任何层引用）
```

**允许的依赖方向**：
```
views      → components, api, stores, types, utils, constants, styles, layout
components → api, stores, types, utils, constants, styles
api        → types, utils, constants
stores     → api, types, utils, constants
router     → views, utils, constants
layout     → components, api, stores, types, utils, constants
```

### 3.4 跨服务调用边界规则

| 规则 ID | 说明 | 严重级 |
|---------|------|--------|
| `XS-DEP-001` | backend 调用 code-processing 只能通过 `*ClientService` 类 | ERROR |
| `XS-DEP-002` | backend controller 不能直接注入 code-processing 地址 | ERROR |
| `XS-DEP-003` | code-processing 调用 backend 只能通过 HTTP API | WARN |

**实现方式**：
- 检查 backend service 中是否直接使用 `code-processing` 的 URL 而未通过 ClientService
- 检查 code-processing 中是否直接连接 backend 数据库

### 3.5 文件大小限制规则

| 规则 ID | 说明 | 阈值 | 严重级 |
|---------|------|------|--------|
| `SIZE-001` | Java 文件不超过 500 行 | 500 | WARN |
| `SIZE-002` | Vue 文件不超过 400 行 | 400 | WARN |
| `SIZE-003` | TypeScript 文件不超过 300 行 | 300 | WARN |
| `SIZE-004` | Python 文件不超过 400 行 | 400 | WARN |
| `SIZE-005` | AGENTS.md 不超过 200 行 | 200 | WARN |

**实现方式**：直接统计文件行数。

**白名单**：允许通过配置文件排除特定文件（如自动生成的代码、历史遗留文件）。

### 3.6 中文注释规则

| 规则 ID | 说明 | 严重级 |
|---------|------|--------|
| `DOC-001` | 新增 public class/interface 必须有中文类注释 | WARN |
| `DOC-002` | 新增 public 方法必须有中文方法注释 | WARN |
| `DOC-003` | 新增 Entity 字段必须有中文注释 | WARN |

**实现方式**：解析 Java AST，检查类、方法、字段上方是否有 `/** ... */` 注释且包含中文字符。

**注意**：此规则仅对增量代码生效，不追溯存量。通过 `--since` 参数指定只检查某个 commit 之后变更的文件。

### 3.7 循环依赖检测规则

| 规则 ID | 说明 | 严重级 |
|---------|------|--------|
| `DEP-CYC-001` | 后端 service 之间不能存在直接循环依赖 | ERROR |
| `DEP-CYC-002` | 前端模块之间不能存在循环依赖 | ERROR |

**实现方式**：构建 import 有向图，检测强连通分量。

### 3.8 硬编码检测规则

| 规则 ID | 说明 | 严重级 |
|---------|------|--------|
| `SEC-001` | 代码中不能硬编码 IP 地址（非 localhost） | ERROR |
| `SEC-002` | 代码中不能硬编码密码/token/key 字符串 | ERROR |
| `SEC-003` | 代码中不能硬编码端口号（应使用配置） | WARN |

**实现方式**：正则匹配常见硬编码模式。

**白名单**：允许 `127.0.0.1`、`localhost`、`0.0.0.0` 等本地地址。

## 4. 配置文件

配置文件位于 `scripts/structural-lint.yml`，格式如下：

```yaml
# 规则开关与严重级覆盖
rules:
  BE-DEP-001: error
  BE-DEP-002: warn
  SIZE-001:
    severity: warn
    threshold: 500

# 文件大小白名单（不检查行数限制）
size_whitelist:
  - "backend/src/main/java/com/aiclub/platform/service/HermesChatService.java"
  - "backend/src/main/java/com/aiclub/platform/service/ExecutionWorkflowService.java"

# 增量检查基准（只检查此 commit 之后变更的文件）
since: null  # 或 "HEAD~10"、"main" 等

# 排除目录
exclude:
  - "**/test/**"
  - "**/__pycache__/**"
  - "**/node_modules/**"
  - "**/target/**"
  - "**/dist/**"
  - "**/.venv/**"

# 跨服务调用白名单（允许直接调用的 ClientService 列表）
cross_service_clients:
  - "CodeProcessingCliExecutionClientService"
  - "CodeReviewClientService"
  - "GitlabCodeStructureClientService"
  - "GitlabSpringApiExtractClientService"
  - "RepositoryScanClientService"
  - "RepositoryStructuringClientService"
  - "DocumentMarkdownClientService"
  - "HindsightClientService"
  - "YaadeClientService"
  - "WoodpeckerApiService"
  - "JenkinsApiService"
  - "GiteeApiService"
  - "GitlabApiService"
```

## 5. 输出格式

### 5.1 控制台输出

```
[ERROR] BE-DEP-001: controller/TaskController.java
  → TaskController 直接 import 了 TaskRepository，应通过 TaskService 间接访问
  → 修复：移除 import com.aiclub.platform.repository.TaskRepository，改为注入 TaskService

[WARN]  SIZE-001: service/HermesChatService.java
  → 文件共 523 行，超过阈值 500 行
  → 修复：考虑拆分为更小的职责单元，或将工具方法提取到 util 包

[ERROR] BE-NAME-001: domain/model/Task.java
  → 位于 domain/model 包但未以 Entity 结尾
  → 修复：重命名为 TaskEntity.java
```

### 5.2 JSON 输出（供 CI 和智能体消费）

```json
{
  "summary": {
    "total_files": 342,
    "errors": 3,
    "warnings": 12,
    "passed": false
  },
  "violations": [
    {
      "rule_id": "BE-DEP-001",
      "severity": "error",
      "file": "backend/src/main/java/com/aiclub/platform/controller/TaskController.java",
      "line": 5,
      "message": "TaskController 直接 import 了 TaskRepository，应通过 TaskService 间接访问",
      "fix": "移除 import com.aiclub.platform.repository.TaskRepository，改为注入 TaskService"
    }
  ]
}
```

## 6. 增量检查模式

支持两种模式：

### 6.1 全量检查

```bash
python scripts/structural_lint.py
```

### 6.2 增量检查（只检查变更文件）

```bash
# 检查最近一次 commit 变更的文件
python scripts/structural_lint.py --since HEAD~1

# 检查当前分支相对 main 变更的文件
python scripts/structural_lint.py --since main

# 检查暂存区文件
python scripts/structural_lint.py --staged
```

增量模式下，只对变更文件应用 `DOC-001`/`DOC-002`/`DOC-003` 规则，避免存量代码大量告警。

## 7. 集成方式

### 7.1 集成到 harness 脚本

在 `scripts/harness.ps1` 和 `scripts/harness-linux.sh` 中新增 `structure` 目标：

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target structure
```

```bash
# Linux
bash ./scripts/harness-linux.sh structure
```

### 7.2 集成到 AGENTS.md

在 `AGENTS.md` 的"常用命令"章节新增：

```
- 结构检查：`python scripts/structural_lint.py`
- 增量结构检查：`python scripts/structural_lint.py --since HEAD~1`
```

### 7.3 集成到验证矩阵

更新 `docs/harness-best-practices.md` 的验证矩阵：

| 改动范围 | 最小验证 | 扩展验证 |
|---------|---------|---------|
| 新增/修改后端类 | 增量结构检查 | 全量结构检查 + 后端测试 |
| 新增/修改前端组件 | 增量结构检查 | 全量结构检查 + 前端构建 |
| 跨服务改动 | 增量结构检查 | 全量结构检查 + 源码模式联调 |

### 7.4 CI 集成（可选）

在 CI pipeline 中添加结构检查步骤，失败时阻断合并：

```yaml
# 示例 GitHub Actions
- name: Structural Lint
  run: python scripts/structural_lint.py --format json --fail-on-error
```

## 8. 实现计划

### 8.1 文件结构

```
scripts/
  structural_lint.py      # 主脚本
  structural-lint.yml     # 配置文件
docs/
  structural-lint-design-v1.md  # 本文档
```

### 8.2 实现分期

**第一期（MVP）**：
- `BE-DEP-001` ~ `BE-DEP-005`：后端分层依赖
- `SIZE-001` ~ `SIZE-004`：文件大小限制
- 基础控制台输出

**第二期**：
- `FE-DEP-001` ~ `FE-DEP-006`：前端分层依赖
- `BE-NAME-001` ~ `BE-NAME-007`：命名约定
- 增量检查模式
- JSON 输出

**第三期**：
- `XS-DEP-001` ~ `XS-DEP-003`：跨服务调用边界
- `DOC-001` ~ `DOC-003`：中文注释
- `DEP-CYC-001`/`DEP-CYC-002`：循环依赖检测
- `SEC-001` ~ `SEC-003`：硬编码检测

## 9. 与 GitNexus 的关系

GitNexus 提供符号级别的依赖分析，但它是事后分析工具。结构化 linter 是**预防性**工具：

- GitNexus：回答"改了 X 会影响什么"
- 结构化 linter：回答"这个改动是否违反架构约定"

两者互补，不冲突。

## 10. 维护策略

- 规则和阈值通过 `structural-lint.yml` 管理，变更需 review
- 白名单应定期清理，避免变成规则漏洞
- 新增架构约束时同步更新规则和本文档
- 误报调整优先修改规则精度，而非扩大白名单

## 11. 参考

- [OpenAI Harness engineering](https://openai.com/zh-Hans-CN/index/harness-engineering/)
- [docs/harness-best-practices.md](./harness-best-practices.md)
- [../architecture.md](./architecture.md)

