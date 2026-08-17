-- 统一助手运行时数据迁移：保留历史会话内容，仅将存储结构和运行时标识切换到中性 Assistant 命名。

DO $$
BEGIN
    IF to_regclass('public.hermes_conversation_session') IS NOT NULL
       AND to_regclass('public.assistant_conversation_session') IS NULL THEN
        ALTER TABLE public.hermes_conversation_session RENAME TO assistant_conversation_session;
    END IF;
    IF to_regclass('public.hermes_conversation_message') IS NOT NULL
       AND to_regclass('public.assistant_conversation_message') IS NULL THEN
        ALTER TABLE public.hermes_conversation_message RENAME TO assistant_conversation_message;
    END IF;
    IF to_regclass('public.hermes_conversation_attachment') IS NOT NULL
       AND to_regclass('public.assistant_conversation_attachment') IS NULL THEN
        ALTER TABLE public.hermes_conversation_attachment RENAME TO assistant_conversation_attachment;
    END IF;
    IF to_regclass('public.hermes_chat_audit') IS NOT NULL
       AND to_regclass('public.assistant_chat_audit') IS NULL THEN
        ALTER TABLE public.hermes_chat_audit RENAME TO assistant_chat_audit;
    END IF;
    IF to_regclass('public.hermes_file_library_item') IS NOT NULL
       AND to_regclass('public.assistant_file_library_item') IS NULL THEN
        ALTER TABLE public.hermes_file_library_item RENAME TO assistant_file_library_item;
    END IF;
END $$;

-- PostgreSQL 不会随表重命名自动更新索引名，显式迁移便于运维和排障。
-- 目标对象已存在时跳过重命名，兼容运维人员已手动完成部分迁移的环境。
DO $$
DECLARE item record;
BEGIN
    FOR item IN
        SELECT * FROM (VALUES
            ('idx_hermes_conversation_session_project_scope', 'idx_assistant_conversation_session_project_scope'),
            ('idx_hermes_conversation_session_global_scope', 'idx_assistant_conversation_session_global_scope'),
            ('idx_hermes_conversation_session_user_archived_last_message', 'idx_assistant_conversation_session_user_archived_last_message'),
            ('idx_hermes_conversation_session_user_updated_at', 'idx_assistant_conversation_session_user_updated_at'),
            ('idx_hermes_conversation_message_session_created_at', 'idx_assistant_conversation_message_session_created_at'),
            ('idx_hermes_conversation_attachment_message', 'idx_assistant_conversation_attachment_message'),
            ('idx_hermes_conversation_attachment_asset', 'idx_assistant_conversation_attachment_asset'),
            ('idx_hermes_chat_audit_user_id', 'idx_assistant_chat_audit_user_id'),
            ('idx_hermes_chat_audit_scope_key', 'idx_assistant_chat_audit_scope_key'),
            ('idx_hermes_chat_audit_created_at', 'idx_assistant_chat_audit_created_at'),
            ('idx_hermes_file_library_owner_updated', 'idx_assistant_file_library_owner_updated'),
            ('idx_hermes_file_library_owner_enabled_updated', 'idx_assistant_file_library_owner_enabled_updated'),
            ('idx_hermes_file_library_asset', 'idx_assistant_file_library_asset')
        ) AS mapping(old_name, new_name)
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = item.old_name AND c.relkind = 'i'
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = item.new_name
        ) THEN
            EXECUTE format('ALTER INDEX public.%I RENAME TO %I', item.old_name, item.new_name);
        END IF;
    END LOOP;
END $$;

DO $$
DECLARE item record;
BEGIN
    FOR item IN
        SELECT * FROM (VALUES
            ('hermes_conversation_session_id_seq', 'assistant_conversation_session_id_seq'),
            ('hermes_conversation_message_id_seq', 'assistant_conversation_message_id_seq'),
            ('hermes_conversation_attachment_id_seq', 'assistant_conversation_attachment_id_seq'),
            ('hermes_chat_audit_id_seq', 'assistant_chat_audit_id_seq'),
            ('hermes_file_library_item_id_seq', 'assistant_file_library_item_id_seq')
        ) AS mapping(old_name, new_name)
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = item.old_name AND c.relkind = 'S'
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = item.new_name
        ) THEN
            EXECUTE format('ALTER SEQUENCE public.%I RENAME TO %I', item.old_name, item.new_name);
        END IF;
    END LOOP;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_message' AND column_name = 'mentions_hermes')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_message' AND column_name = 'mentions_assistant') THEN
        ALTER TABLE public.chat_message RENAME COLUMN mentions_hermes TO mentions_assistant;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assistant_chat_audit' AND column_name = 'hermes_response_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assistant_chat_audit' AND column_name = 'assistant_response_id') THEN
        ALTER TABLE public.assistant_chat_audit RENAME COLUMN hermes_response_id TO assistant_response_id;
    END IF;
END $$;

-- 约束名是数据库对象的一部分，统一重命名但兼容已经完成部分迁移的环境。
DO $$
DECLARE item record;
BEGIN
    FOR item IN
        SELECT * FROM (VALUES
            ('assistant_conversation_session', 'fk_hermes_conversation_session_user', 'fk_assistant_conversation_session_user'),
            ('assistant_conversation_session', 'uk_hermes_conversation_session_user_conversation', 'uk_assistant_conversation_session_user_conversation'),
            ('assistant_conversation_message', 'fk_hermes_conversation_message_session', 'fk_assistant_conversation_message_session'),
            ('assistant_conversation_attachment', 'fk_hermes_conversation_attachment_message', 'fk_assistant_conversation_attachment_message'),
            ('assistant_conversation_attachment', 'fk_hermes_conversation_attachment_asset', 'fk_assistant_conversation_attachment_asset'),
            ('assistant_chat_audit', 'fk_hermes_chat_audit_user', 'fk_assistant_chat_audit_user'),
            ('assistant_file_library_item', 'fk_hermes_file_library_owner', 'fk_assistant_file_library_owner'),
            ('assistant_file_library_item', 'fk_hermes_file_library_asset', 'fk_assistant_file_library_asset')
        ) AS mapping(table_name, old_name, new_name)
    LOOP
        IF EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public' AND t.relname = item.table_name AND c.conname = item.old_name
        ) AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public' AND t.relname = item.table_name AND c.conname = item.new_name
        ) THEN
            EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', item.table_name, item.old_name, item.new_name);
        END IF;
    END LOOP;
END $$;

-- 先迁移所有运行时引用，再删除旧注册项，避免外键和历史快照悬空。
DO $$
DECLARE item record;
BEGIN
    FOR item IN
        SELECT table_schema, table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('runtime_type', 'runtime_type_snapshot', 'runtime_registry_code', 'runtime_registry_code_snapshot')
          AND NOT (table_name = 'runtime_registry' AND column_name = 'runtime_code')
    LOOP
        EXECUTE format('UPDATE %I.%I SET %I = ''PI_RUNTIME'' WHERE %I = ''HERMES_LEGACY''', item.table_schema, item.table_name, item.column_name, item.column_name);
    END LOOP;

    FOR item IN
        SELECT table_schema, table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('runtime_fallback_codes_json', 'fallback_runtime_codes_json')
    LOOP
        EXECUTE format('UPDATE %I.%I SET %I = ''[]'' WHERE %I LIKE ''%%HERMES_LEGACY%%''', item.table_schema, item.table_name, item.column_name, item.column_name);
    END LOOP;
END $$;

UPDATE runtime_scenario_default
SET runtime_registry_code = 'PI_RUNTIME'
WHERE runtime_registry_code = 'HERMES_LEGACY';

UPDATE runtime_registry
SET fallback_runtime_codes_json = '[]'
WHERE fallback_runtime_codes_json LIKE '%HERMES_LEGACY%';

-- 业务意图：历史审计和资产绑定仍可追溯，但新写入统一使用 Assistant 标识。
DO $$
DECLARE item record;
BEGIN
    FOR item IN
        SELECT table_schema, table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name IN ('provider', 'trigger_source', 'biz_type', 'bound_biz_type', 'scene', 'source', 'route_name')
    LOOP
        EXECUTE format(
            'UPDATE %I.%I SET %I = replace(replace(replace(%I, ''HERMES'', ''ASSISTANT''), ''hermes'', ''assistant''), ''Hermes'', ''Assistant'') WHERE %I LIKE ''%%hermes%%'' OR %I LIKE ''%%HERMES%%'' OR %I LIKE ''%%Hermes%%''',
            item.table_schema, item.table_name, item.column_name, item.column_name, item.column_name, item.column_name, item.column_name
        );
    END LOOP;
END $$;

DO $$
DECLARE old_permission_id BIGINT;
DECLARE new_permission_id BIGINT;
BEGIN
    SELECT id INTO old_permission_id FROM permission_info WHERE code = 'hermes:chat';
    SELECT id INTO new_permission_id FROM permission_info WHERE code = 'assistant:chat';
    IF old_permission_id IS NOT NULL AND new_permission_id IS NULL THEN
        UPDATE permission_info
        SET code = 'assistant:chat', name = 'Assistant 助手', description = '访问统一 Assistant 助手入口'
        WHERE id = old_permission_id;
    ELSIF old_permission_id IS NOT NULL AND new_permission_id IS NOT NULL THEN
        INSERT INTO role_permission_rel(role_id, permission_id)
        SELECT role_id, new_permission_id
        FROM role_permission_rel
        WHERE permission_id = old_permission_id
        ON CONFLICT DO NOTHING;
        DELETE FROM role_permission_rel WHERE permission_id = old_permission_id;
        DELETE FROM permission_info WHERE id = old_permission_id;
    END IF;
END $$;

DELETE FROM runtime_registry WHERE runtime_code = 'HERMES_LEGACY';
