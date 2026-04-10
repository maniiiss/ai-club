ALTER TABLE task_info
ADD COLUMN IF NOT EXISTS work_item_code VARCHAR(7),
ADD COLUMN IF NOT EXISTS plan_start_date DATE,
ADD COLUMN IF NOT EXISTS plan_end_date DATE;

DO $$
DECLARE
    current_task RECORD;
    next_code VARCHAR(7);
    code_chars CONSTANT TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
BEGIN
    FOR current_task IN
        SELECT id
        FROM task_info
        WHERE work_item_code IS NULL OR work_item_code = ''
        ORDER BY id
    LOOP
        LOOP
            next_code := '#' || (
                SELECT string_agg(substr(code_chars, 1 + floor(random() * length(code_chars))::INT, 1), '')
                FROM generate_series(1, 6)
            );

            EXIT WHEN NOT EXISTS (
                SELECT 1
                FROM task_info
                WHERE work_item_code = next_code
            );
        END LOOP;

        UPDATE task_info
        SET work_item_code = next_code
        WHERE id = current_task.id;
    END LOOP;
END $$;

ALTER TABLE task_info
ALTER COLUMN work_item_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_task_info_work_item_code ON task_info(work_item_code);
