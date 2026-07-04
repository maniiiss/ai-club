# 数据库备份目录

## 用途

存放 AI Club 平台 PostgreSQL 数据库的定期备份文件。

## 数据库连接信息

| 项 | 值 |
| --- | --- |
| Host | `localhost` |
| Port | `5432` |
| Database | `ai_agent_platform` |
| Username | `aiclub` |
| Password | `aiclub123` |

## 备份方式

```bash
# 生成 SQL 文本备份
docker exec ai-agent-platform-postgres pg_dump -U aiclub -d ai_agent_platform --format=plain --no-owner --no-privileges > database/backups/ai_agent_platform_backup_$(date +%Y%m%d_%H%M%S).sql

# 生成自定义压缩格式备份（体积更小）
docker exec ai-agent-platform-postgres pg_dump -U aiclub -d ai_agent_platform --format=custom --no-owner --no-privileges > database/backups/ai_agent_platform_backup_$(date +%Y%m%d_%H%M%S).dump
```

## 恢复方式

```bash
# 从 SQL 文本恢复
docker exec -i ai-agent-platform-postgres psql -U aiclub -d ai_agent_platform < database/backups/<备份文件名>.sql

# 从自定义格式恢复
docker exec -i ai-agent-platform-postgres pg_restore -U aiclub -d ai_agent_platform < database/backups/<备份文件名>.dump
```

## 注意事项

- `*.sql` 和 `*.dump` 备份文件体积较大，不纳入 Git 版本管理（已在 `.gitignore` 中排除）。
- 备份文件仅保留在本地，建议定期将关键备份同步到外部存储。
- Flyway 迁移脚本位于 `backend/src/main/resources/db/migration/`，属于版本管理的结构定义，恢复数据时注意不要重复执行已有迁移。
