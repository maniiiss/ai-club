-- 为 Wiki 空间补充空间级项目绑定与成员默认来源配置。

ALTER TABLE wiki_space
    ADD COLUMN bound_project_id BIGINT,
    ADD COLUMN member_default_source VARCHAR(30) NOT NULL DEFAULT 'MANUAL';

ALTER TABLE wiki_space
    ADD CONSTRAINT fk_wiki_space_bound_project
        FOREIGN KEY (bound_project_id) REFERENCES project_info(id) ON DELETE SET NULL;

CREATE INDEX idx_wiki_space_bound_project
    ON wiki_space(bound_project_id, id);
