-- 空间化 Wiki 页面支持父子层级，便于页面树展开与收起。

ALTER TABLE wiki_page_v2
    ADD COLUMN parent_page_id BIGINT;

ALTER TABLE wiki_page_v2
    ADD CONSTRAINT fk_wiki_page_v2_parent
        FOREIGN KEY (parent_page_id) REFERENCES wiki_page_v2(id) ON DELETE RESTRICT;

CREATE INDEX idx_wiki_page_v2_parent_updated
    ON wiki_page_v2(parent_page_id, updated_at DESC, id DESC);
