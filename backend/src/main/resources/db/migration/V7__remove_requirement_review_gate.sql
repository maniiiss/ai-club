-- 简化需求通过流：移除评审通过门禁，仅保留开发通过、测试通过。

UPDATE task_info
SET dev_passed = TRUE,
    test_passed = TRUE
WHERE work_item_type = '需求'
  AND status <> '草稿';

DELETE FROM role_permission_rel
WHERE permission_id IN (
    SELECT id FROM permission_info WHERE code = 'task:requirement:review'
);

DELETE FROM permission_info
WHERE code = 'task:requirement:review';

ALTER TABLE task_info
    DROP COLUMN IF EXISTS review_passed;
