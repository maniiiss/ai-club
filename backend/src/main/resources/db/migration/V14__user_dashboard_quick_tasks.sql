CREATE TABLE user_dashboard_quick_task (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    content VARCHAR(200) NOT NULL DEFAULT '',
    checked BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_dashboard_quick_task_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_dashboard_quick_task_user_sort
    ON user_dashboard_quick_task(user_id, sort_order, id);
