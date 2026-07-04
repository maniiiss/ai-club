# API AI 测试用例生成技术设计 v1

> 历史背景说明：本文档撰写时数据源为 Yaade。Yaade 已下线，AI 测试用例生成已迁移到原生 API Studio（`POST /api/api-studio/projects/{id}/endpoints/{eid}/ai-test-cases`），数据从 `api_studio_endpoint` 读取，脱敏与 Prompt 逻辑保持不变。详见 `api-studio-native-technical-design-v1.md`。

## 1. 背景

API 管理已经切换为 Yaade 嵌入式工作台，接口资产的主数据由 Yaade 保存。平台侧仍负责项目入口、权限、身份桥接和智能体能力，因此可以在不改造 Yaade 主链路的前提下，为单个接口提供 AI 测试用例分析能力。

本版目标是先做“单接口分析 + 用例生成 + 人工审核导出”，不直接执行接口，也不把 AI 结果写回 Yaade 或测试计划。

## 2. 设计方案

- 前端在 `/apis/projects/{projectId}` 的 Yaade iframe 外层增加“AI 用例”浮层按钮。
- 用户打开抽屉后，平台后端按当前项目 Yaade 根 collection 拉平所有子 collection 下的 REST request，供用户选择单个接口。
- 用户选择接口和可选对话模型后，后端读取该 Yaade request 的结构化数据，脱敏后调用模型生成测试用例建议。
- AI 输出被解析成固定结构：Markdown 总览、用例标题、类型、优先级、前置条件、请求样例、断言列表和风险备注。
- V1 结果仅在前端展示，支持复制 Markdown 和 JSON，不落库、不执行、不写回 Yaade。

## 3. 后端边界

- `YaadeApiCatalogService`：负责按项目可见权限读取 Yaade collection 子树，返回 REST request 摘要，并校验 request 是否属于当前项目。
- `ApiTestCaseAiService`：负责模型选择、Yaade request 上下文装配、敏感信息脱敏、Prompt 调用和 JSON 结果解析。
- `YaadeController` 新增接口：
  - `GET /api/yaade/projects/{projectId}/requests`
  - `POST /api/yaade/projects/{projectId}/requests/{requestId}/ai-test-cases`
- 权限使用 `api:view`。该能力只读取接口资产并生成建议，不改变 Yaade 或平台测试资产。

## 4. 脱敏规则

进入模型上下文前会对以下字段和值做脱敏：

- `Authorization`、`Cookie`、`Set-Cookie`
- `token`、`accessToken`、`refreshToken`
- `password`
- `secret`
- `apiKey`、`api-key`、`x-api-key`

脱敏后的占位符统一为 `***已脱敏***`。请求体如果是 JSON，会按字段递归脱敏；如果是普通文本，会按常见 `key: value` 或 `key=value` 形式替换敏感值。

## 5. V2 方向

- 持久化 API 测试用例资产，支持编辑、启停、版本记录。
- 扩展测试计划 `automationType=API`，绑定单接口用例或 API 套件。
- 新增执行中心场景 `API_AUTOMATION`，由后端生成确定性 manifest，交给 `code-processing` 使用 `pytest + httpx` 执行。
- 支持多接口场景编排，包括变量提取、变量注入、步骤依赖、失败中断和清理步骤。
- 回写测试计划和执行中心报告，区分连接失败、鉴权失败、断言失败、超时和环境配置失败。

## 6. 验证方式

- `python scripts/check_encoding.py`
- `cd backend && mvn -s maven-settings-central.xml "-Dtest=YaadeApiCatalogServiceTests,ApiTestCaseAiServiceTests,YaadeControllerPermissionTests" test`
- `cd frontend && npm run build`


