#!/bin/sh
set -eu

# 初始化 Hindsight 专用数据库，并为相关数据库启用向量扩展。
# 说明：
# 1. PostgreSQL 首次初始化时，该脚本会由 docker-entrypoint-initdb.d 自动执行。
# 2. 后续 Compose 启动阶段，还会通过补偿任务再次执行，兼容已有 PGDATA 场景。
# 3. 后端业务表结构仍然由 Flyway 管理，这里只负责 Hindsight 依赖的数据库与扩展准备。

POSTGRES_ADMIN_USER="${POSTGRES_USER:-postgres}"
PRIMARY_DB="${POSTGRES_DB:-postgres}"
# 未显式指定 Hindsight 独立库时，默认只补偿主业务库，避免共享 PostgreSQL 误建额外数据库。
HINDSIGHT_DB="${HINDSIGHT_POSTGRES_DB:-${PRIMARY_DB}}"
VECTOR_EXTENSION="${HINDSIGHT_API_VECTOR_EXTENSION:-pgvectorscale}"

# 兼容两种执行场景：
# 1. PostgreSQL 容器首次初始化时，通过本地 socket 执行；
# 2. Compose 启动阶段的补偿任务容器，通过 TCP 连接已有 PostgreSQL 实例执行。
if [ -n "${POSTGRES_HOST:-}" ]; then
  export PGHOST="${POSTGRES_HOST}"
fi

if [ -n "${POSTGRES_PORT:-}" ]; then
  export PGPORT="${POSTGRES_PORT}"
fi

if [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export PGPASSWORD="${POSTGRES_PASSWORD}"
fi

# 为 SQL 字符串常量做最基础的单引号转义，避免数据库名中包含单引号时语句出错。
escape_sql_literal() {
  printf "%s" "$1" | sed "s/'/''/g"
}

HINDSIGHT_DB_SQL_LITERAL="$(escape_sql_literal "${HINDSIGHT_DB}")"

# 如果 Hindsight 使用独立数据库，则在首次初始化 PostgreSQL 时自动创建该数据库。
if [ "${HINDSIGHT_DB}" != "${PRIMARY_DB}" ]; then
  if ! psql -v ON_ERROR_STOP=1 --username "${POSTGRES_ADMIN_USER}" --dbname "${PRIMARY_DB}" -tAc "SELECT 1 FROM pg_database WHERE datname = '${HINDSIGHT_DB_SQL_LITERAL}'" | grep -q 1; then
    # 老的 PGDATA 可能因为宿主机 glibc / locale 版本变化，导致 template1 无法再直接用于建库。
    # 这里固定使用 template0，避免 Hindsight 独立库创建时被 collation version mismatch 卡住。
    createdb --username "${POSTGRES_ADMIN_USER}" --owner "${POSTGRES_ADMIN_USER}" --template template0 "${HINDSIGHT_DB}"
  fi
fi

# 为目标数据库补偿向量扩展：
# - 始终安装 pgvector 基础扩展；
# - Hindsight 指定 pgvectorscale 时，再额外安装 vectorscale，满足高维向量索引需求。
for target_db in "${PRIMARY_DB}" "${HINDSIGHT_DB}"; do
  # 去重，避免 PRIMARY_DB 与 HINDSIGHT_DB 相同场景下重复执行。
  if [ -n "${PROCESSED_DBS:-}" ] && printf '%s\n' "${PROCESSED_DBS}" | grep -Fxq "${target_db}"; then
    continue
  fi

  psql -v ON_ERROR_STOP=1 --username "${POSTGRES_ADMIN_USER}" --dbname "${target_db}" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS vector;
EOSQL

  if [ "${VECTOR_EXTENSION}" = "pgvectorscale" ]; then
    psql -v ON_ERROR_STOP=1 --username "${POSTGRES_ADMIN_USER}" --dbname "${target_db}" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;
EOSQL
  fi

  PROCESSED_DBS="${PROCESSED_DBS:-}
${target_db}"
done
