#!/bin/sh
set -eu

LEGACY_PGDATA_ROOT="/home/postgres/pgdata"
MODERN_PGDATA_ROOT="/home/postgres/pgdata/data"

# TimescaleDB 升级后，历史卷可能直接把 PostgreSQL 集群放在卷根目录；
# 新版本则会初始化到 data 子目录。这里优先复用旧目录，避免升级后误判成空库。
if [ -f "${LEGACY_PGDATA_ROOT}/PG_VERSION" ]; then
  export PGDATA="${LEGACY_PGDATA_ROOT}"
elif [ -f "${MODERN_PGDATA_ROOT}/PG_VERSION" ]; then
  export PGDATA="${MODERN_PGDATA_ROOT}"
else
  export PGDATA="${MODERN_PGDATA_ROOT}"
fi

echo "Using PGDATA=${PGDATA}" >&2
exec /docker-entrypoint.sh postgres
