/**
 * 默认需求模板。
 */
export const DEFAULT_REQUIREMENT_TEMPLATE = `## 用户故事

## 需求描述

## 验收标准`;
const LEGACY_PROTOTYPE_HEADING_PATTERN = /^##\s*原型\s*$/gm;
const LEVEL_TWO_HEADING_PATTERN = /^##\s+(.+?)\s*$/gm;
const EXPECTED_TITLES = ['用户故事', '需求描述', '验收标准'];
/**
 * 构建需求编辑器需要展示的草稿内容，并在必要时完成旧结构升级。
 */
export const buildRequirementDraft = (requirementMarkdown, description) => {
    const normalizedRequirementMarkdown = normalizeRequirementDocument(requirementMarkdown);
    if (normalizedRequirementMarkdown) {
        const migratedMarkdown = replaceLegacyPrototypeHeading(normalizedRequirementMarkdown);
        return {
            markdown: migratedMarkdown,
            upgradedFromLegacy: migratedMarkdown !== normalizedRequirementMarkdown
        };
    }
    const normalizedDescription = normalizeRequirementDocument(description);
    if (!normalizedDescription) {
        return {
            markdown: DEFAULT_REQUIREMENT_TEMPLATE,
            upgradedFromLegacy: false
        };
    }
    const migratedDescription = replaceLegacyPrototypeHeading(normalizedDescription);
    if (matchesTemplateHeadings(migratedDescription)) {
        return {
            markdown: migratedDescription,
            upgradedFromLegacy: true
        };
    }
    return {
        markdown: [
            '## 用户故事',
            '',
            migratedDescription,
            '',
            '## 需求描述',
            '',
            '## 验收标准'
        ].join('\n'),
        upgradedFromLegacy: true
    };
};
/**
 * 校验需求模板是否满足固定章节与正文必填规则。
 */
export const validateRequirementTemplate = (markdown) => {
    const normalizedMarkdown = normalizeRequirementDocument(markdown);
    if (!normalizedMarkdown) {
        return '需求文档不能为空';
    }
    const sections = extractRequirementSections(normalizedMarkdown);
    const titles = sections.map((section) => section.title);
    if (titles.length !== EXPECTED_TITLES.length || EXPECTED_TITLES.some((title, index) => titles[index] !== title)) {
        return '需求文档必须且仅能包含：## 用户故事、## 需求描述、## 验收标准';
    }
    for (const section of sections) {
        if (!section.content.trim()) {
            return `章节「${section.title}」内容不能为空`;
        }
    }
    return '';
};
/**
 * 规范化文档换行与首尾空白。
 */
export const normalizeRequirementDocument = (value) => (value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
/**
 * 判断文档是否已经匹配新模板的固定章节。
 */
export const matchesTemplateHeadings = (markdown) => {
    const normalizedMarkdown = normalizeRequirementDocument(markdown);
    if (!normalizedMarkdown) {
        return false;
    }
    const titles = extractRequirementSections(normalizedMarkdown).map((section) => section.title);
    return titles.length === EXPECTED_TITLES.length && EXPECTED_TITLES.every((title, index) => titles[index] === title);
};
/**
 * 将旧模板中的“原型”章节标题统一升级为“需求描述”。
 */
export const replaceLegacyPrototypeHeading = (markdown) => normalizeRequirementDocument(markdown).replace(LEGACY_PROTOTYPE_HEADING_PATTERN, '## 需求描述');
/**
 * 解析需求文档中的二级章节。
 */
const extractRequirementSections = (markdown) => {
    const normalizedMarkdown = normalizeRequirementDocument(markdown);
    const matches = [...normalizedMarkdown.matchAll(LEVEL_TWO_HEADING_PATTERN)];
    return matches.map((match, index) => {
        const title = (match[1] || '').trim();
        const contentStart = (match.index || 0) + match[0].length;
        const nextMatchIndex = index + 1 < matches.length ? matches[index + 1].index || normalizedMarkdown.length : normalizedMarkdown.length;
        return {
            title,
            content: normalizedMarkdown.slice(contentStart, nextMatchIndex).trim()
        };
    });
};
//# sourceMappingURL=requirementTemplate.js.map