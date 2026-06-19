ALTER TABLE gitlab_auto_merge_log
    ADD COLUMN IF NOT EXISTS review_fingerprint VARCHAR(255);

ALTER TABLE gitlab_auto_merge_log
    ADD COLUMN IF NOT EXISTS review_fingerprint_source VARCHAR(20);

ALTER TABLE gitlab_auto_merge_log
    ADD COLUMN IF NOT EXISTS review_result_json TEXT;

ALTER TABLE gitlab_auto_merge_log
    ADD COLUMN IF NOT EXISTS review_cache_hit BOOLEAN;
