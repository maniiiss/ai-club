-- 允许同一个业务项目绑定多个 GitLab 仓库，并为项目筛选保留普通索引。

DO $$
DECLARE
    unique_constraint_name TEXT;
BEGIN
    SELECT con.conname
    INTO unique_constraint_name
    FROM pg_constraint con
             JOIN pg_class rel ON rel.oid = con.conrelid
             JOIN pg_namespace nsp ON nsp.oid = con.connamespace
             JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
             JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
    WHERE rel.relname = 'project_gitlab_binding'
      AND nsp.nspname = current_schema()
      AND con.contype = 'u'
    GROUP BY con.conname
    -- pg_attribute.attname 的类型是 name，这里统一转成 text 再比较，避免 name[] 与 text[] 的类型冲突。
    HAVING array_agg(att.attname::text ORDER BY cols.ord) = ARRAY ['project_id']
    LIMIT 1;

    IF unique_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE project_gitlab_binding DROP CONSTRAINT %I', unique_constraint_name);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_gitlab_binding_project_id ON project_gitlab_binding(project_id);
