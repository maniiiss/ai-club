数据库版本仍以 Flyway 为主，但当前保留了少量 PostgreSQL 初始化脚本，专门服务于 Hindsight。

- 正式业务迁移脚本目录：`backend/src/main/resources/db/migration`
- `docker/postgres/init` 负责维护 Hindsight 独立数据库：
  - PostgreSQL 首次初始化时，会自动创建 Hindsight 专用数据库
  - 后续每次 Compose 启动时，都会通过补偿任务再次确认独立库和 `vector` 扩展存在
- 后端业务表结构仍由 Flyway 统一管理，避免与容器初始化脚本出现双轨维护
- Hindsight 默认使用独立数据库 `hindsight`，不会与业务库 `ai_agent_platform` 混用
