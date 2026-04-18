-- Wiki 目录正文：允许目录节点本身承载 Markdown 内容。

ALTER TABLE wiki_directory
    ADD COLUMN content TEXT NOT NULL DEFAULT '';
