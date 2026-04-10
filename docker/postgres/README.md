数据库版本现已统一由 Flyway 管理。

- 正式迁移脚本目录：`backend/src/main/resources/db/migration`
- PostgreSQL 容器不再挂载 `docker-entrypoint-initdb.d`
- 新库或空库会在后端启动时自动执行 Flyway 迁移
- 历史 `docker/postgres/init` SQL 已移除，避免与 Flyway 出现双轨维护
