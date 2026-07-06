# 原生 API 工作台设计确认记录

- 日期：2026-06-24
- 状态：已确认，正式设计已落到 `docs/design-docs/api-studio-native-technical-design-v1.md`
- 取代：`docs/superpowers/specs/2026-06-23-api-studio-redesign-design.md`

## 设计结论

本轮规划决定放弃“保留 Yaade 作为底层能力层”的方向，改为建设平台原生 API 工作台。第一版同时覆盖接口资产管理和调试闭环，并以平台业务库作为接口资产主数据源。

已确认的第一版边界：

- 复用平台项目，不建设独立 API 项目体系。
- 结构为“项目 -> 多级目录 -> API”。
- 第一版只支持 REST/HTTP。
- 新建 `api_studio_*` 表，不迁移 Yaade 和旧 `project_api_*` 数据。
- 项目级环境承载 `baseUrl`、公共 Header、变量、Bearer Token 和 API Key。
- 入参出参用结构化字段维护。
- 请求 Body 覆盖 JSON、form-data、urlencoded、raw text 和文件上传字段。
- 响应支持多个状态码，每个响应可维护字段结构、示例和说明。
- 调试请求由后端代理发送，且只能访问项目环境 `baseUrl` 同源目标。
- 保存个人调试记录。
- 保存 API 版本快照，支持查看历史和回滚。
- 支持目录和 API 拖拽排序。
- 支持草稿、已发布、已废弃生命周期。
- OpenAPI、AI、Mock、Runner、GitLab 同步写入新表等能力进入后续路线图，不进入第一版交付。

## 正式文档

完整技术设计见：

- `docs/design-docs/api-studio-native-technical-design-v1.md`

后续实施计划应以正式技术设计为准，并在进入编码前拆分阶段计划。

