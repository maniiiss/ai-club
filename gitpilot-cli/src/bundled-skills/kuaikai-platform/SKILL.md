---
name: kuaikai-platform
description: 快开平台项目的前后端 Coding 约定。仅在工作区框架档案识别为 kuaikai 且版本适配器受支持时使用；先读取现有同类代码和项目 profile，再选择对应模块章节。
---

# 快开平台 Coding 约定

## 使用边界

- 先读取 `.gitpilot/project-binding.json` 中的 `frameworkProfiles`，确认 `familyId`、`adapterId`、版本和模块。
- `status` 为 `ambiguous`、`stale` 或版本为 `unknown` 时，只使用公共规则，不凭资料推导版本特有 API。
- 优先寻找当前项目已有的同类页面、Groovy 脚本、工作流配置和测试；业务字段、模型 ID、数据集 ID 不能臆造。
- 不读取、复制或输出 accessKey、secretKey、password、token、数据库连接串等敏感值。

## 公共规则

- 前端业务读写优先复用 `useBusiService`、`useFlowService` 和 `RestFetch`。
- 业务请求沿用 `dir`、`modelId`、`menuId`、`buttonId`、`datasetId` 语义。
- 后端业务逻辑优先放在 `scripts/model/{dir}/{modelId}.groovy`。
- Groovy 脚本使用 `argument()`、`sqlTool()`、`platformSqlTool()`、`redisTool()`、`zzProps()` 和 `messageTool()` 等平台工具。
- SQL 必须使用占位符传参，禁止把用户输入拼接到 SQL 字符串。

## 1.0 适配器提示

- 查询优先使用 `queryM`、`queryD`、`queryDC` 等业务服务简化方法。
- 新增、修改、删除使用 `OpEnum.Select=0`、`Delete=2`、`Insert=4`、`Update=8`，保存后正确回填 ID 和操作状态。
- 工作流保存链检查 `ConstantKt.SAVE_BUSI`、`system/flow/flow`、`startAndSubmit`、待办/已办查询和业务状态映射。
- 消息、文件、GIS 和定时任务优先复用平台已有服务和配置，不自行创建平行 REST 协议。

## 验证

- 修改后运行项目已有的类型检查、构建或最小测试。
- 检查新增 SQL、工作流状态、文件权限、第三方消息配置和定时任务幂等性。
- 在最终结果中说明使用的 profile 版本、实际改动、验证命令和未确认风险。
