ALTER TABLE gitlab_auto_merge_config
    ADD COLUMN IF NOT EXISTS ai_review_strictness VARCHAR(20) NOT NULL DEFAULT 'MEDIUM';

UPDATE gitlab_auto_merge_config
SET ai_review_strictness = 'MEDIUM'
WHERE ai_review_strictness IS NULL
   OR BTRIM(ai_review_strictness) = '';
