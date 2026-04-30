/**
 * 默认需求模板。
 */
export const DEFAULT_REQUIREMENT_TEMPLATE = `# 用户故事

# 需求描述

# 验收标准`

const DEFAULT_USER_STORY_PLACEHOLDER = '待补充用户故事'
const DEFAULT_REQUIREMENT_DESCRIPTION_PLACEHOLDER = '待补充需求描述'
const DEFAULT_ACCEPTANCE_CRITERIA_PLACEHOLDER = '待补充验收标准'
const GITEE_SECTION_TITLES = ['功能点', '流程图', '原型', '非功能需求'] as const

const LEGACY_PROTOTYPE_HEADING_PATTERN = /^#{1,2}\s*原型\s*$/gm
const SYSTEM_LEVEL_ONE_HEADING_PATTERN = /^#\s+(.+?)\s*$/gm
const LEGACY_SYSTEM_HEADING_PATTERN = /^##\s*(用户故事|需求描述|验收标准)\s*$/gm
const LEGACY_GITEE_SUB_HEADING_PATTERN = /^###\s*(功能点|流程图|原型|非功能需求)\s*$/gm
const LEVEL_ONE_HEADING_PATTERN = /^#\s*(?:\d+\s+)?(.+?)\s*$/gm
const EXPECTED_TITLES = ['用户故事', '需求描述', '验收标准']

interface RequirementDraftResult {
  markdown: string
  upgradedFromLegacy: boolean
}

interface RequirementSection {
  title: string
  content: string
}

/**
 * 构建需求编辑器需要展示的草稿内容，并在必要时完成旧结构升级。
 */
export const buildRequirementDraft = (
  requirementMarkdown?: string | null,
  description?: string | null
): RequirementDraftResult => {
  const normalizedRequirementMarkdown = normalizeRequirementDocument(requirementMarkdown)
  if (normalizedRequirementMarkdown) {
    if (matchesGiteeTemplateHeadings(normalizedRequirementMarkdown)) {
      return {
        markdown: convertGiteeRequirementTemplate(normalizedRequirementMarkdown),
        upgradedFromLegacy: true
      }
    }
    const migratedMarkdown = normalizeSystemTemplateHeadings(replaceLegacyPrototypeHeading(normalizedRequirementMarkdown))
    return {
      markdown: migratedMarkdown,
      upgradedFromLegacy: migratedMarkdown !== normalizedRequirementMarkdown
    }
  }

  const normalizedDescription = normalizeRequirementDocument(description)
  if (!normalizedDescription) {
    return {
      markdown: DEFAULT_REQUIREMENT_TEMPLATE,
      upgradedFromLegacy: false
    }
  }

  if (matchesGiteeTemplateHeadings(normalizedDescription)) {
    return {
      markdown: convertGiteeRequirementTemplate(normalizedDescription),
      upgradedFromLegacy: true
    }
  }

  const migratedDescription = normalizeSystemTemplateHeadings(replaceLegacyPrototypeHeading(normalizedDescription))
  if (matchesTemplateHeadings(migratedDescription)) {
    return {
      markdown: migratedDescription,
      upgradedFromLegacy: true
    }
  }

  return {
    markdown: [
      '# 用户故事',
      '',
      migratedDescription,
      '',
      '# 需求描述',
      '',
      '# 验收标准'
    ].join('\n'),
    upgradedFromLegacy: true
  }
}

/**
 * 校验需求模板是否满足固定章节与正文必填规则。
 */
export const validateRequirementTemplate = (markdown: string) => {
  const normalizedMarkdown = normalizeRequirementDocument(markdown)
  if (!normalizedMarkdown) {
    return '需求文档不能为空'
  }

  const sections = extractRequirementSections(normalizedMarkdown)
  const titles = sections.map((section) => section.title)
  if (titles.length !== EXPECTED_TITLES.length || EXPECTED_TITLES.some((title, index) => titles[index] !== title)) {
    return '需求文档必须且仅能包含：# 用户故事、# 需求描述、# 验收标准'
  }

  for (const section of sections) {
    if (!section.content.trim()) {
      return `章节「${section.title}」内容不能为空`
    }
  }

  return ''
}

/**
 * 规范化文档换行与首尾空白。
 */
export const normalizeRequirementDocument = (value?: string | null) =>
  (value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()

/**
 * 判断文档是否已经匹配新模板的固定章节。
 */
export const matchesTemplateHeadings = (markdown: string) => {
  const normalizedMarkdown = normalizeSystemTemplateHeadings(markdown)
  if (!normalizedMarkdown) {
    return false
  }
  const titles = extractRequirementSections(normalizedMarkdown).map((section) => section.title)
  return titles.length === EXPECTED_TITLES.length && EXPECTED_TITLES.every((title, index) => titles[index] === title)
}

/**
 * 判断文档是否匹配 Gitee 的四段模板标题。
 */
export const matchesGiteeTemplateHeadings = (markdown: string) => {
  const normalizedMarkdown = normalizeRequirementDocument(markdown)
  if (!normalizedMarkdown) {
    return false
  }
  const titles = extractLevelOneSections(normalizedMarkdown).map((section) => section.title)
  return titles.some((title) => GITEE_SECTION_TITLES.includes(title as typeof GITEE_SECTION_TITLES[number]))
}

/**
 * 把 Gitee 需求模板转换为系统固定三段模板。
 */
export const convertGiteeRequirementTemplate = (markdown: string) => {
  const normalizedMarkdown = normalizeRequirementDocument(markdown)
  if (!normalizedMarkdown) {
    return DEFAULT_REQUIREMENT_TEMPLATE
  }
  const sections = extractLevelOneSections(normalizedMarkdown)
  if (!sections.length) {
    return DEFAULT_REQUIREMENT_TEMPLATE
  }

  const userStory = DEFAULT_USER_STORY_PLACEHOLDER
  const requirementDescriptionBlocks = [
    buildSubSection('功能点', findSectionContent(sections, '功能点')),
    buildSubSection('流程图', findSectionContent(sections, '流程图')),
    buildSubSection('原型', findSectionContent(sections, '原型')),
    buildSubSection('非功能需求', findSectionContent(sections, '非功能需求'))
  ].filter(Boolean)
  const requirementDescription = requirementDescriptionBlocks.length
    ? requirementDescriptionBlocks.join('\n\n')
    : DEFAULT_REQUIREMENT_DESCRIPTION_PLACEHOLDER

  return [
    '# 用户故事',
    '',
    userStory,
    '',
    '# 需求描述',
    '',
    requirementDescription,
    '',
    '# 验收标准',
    '',
    DEFAULT_ACCEPTANCE_CRITERIA_PLACEHOLDER
  ].join('\n').trim()
}

/**
 * 将旧模板中的“原型”章节标题统一升级为“需求描述”。
 */
export const replaceLegacyPrototypeHeading = (markdown: string) =>
  normalizeRequirementDocument(markdown).replace(LEGACY_PROTOTYPE_HEADING_PATTERN, '# 需求描述')

/**
 * 解析需求文档中的二级章节。
 */
const extractRequirementSections = (markdown: string): RequirementSection[] => {
  const normalizedMarkdown = normalizeSystemTemplateHeadings(markdown)
  const matches = [...normalizedMarkdown.matchAll(SYSTEM_LEVEL_ONE_HEADING_PATTERN)]
  return matches.map((match, index) => {
    const title = (match[1] || '').trim()
    const contentStart = (match.index || 0) + match[0].length
    const nextMatchIndex = index + 1 < matches.length ? matches[index + 1].index || normalizedMarkdown.length : normalizedMarkdown.length
    return {
      title,
      content: normalizedMarkdown.slice(contentStart, nextMatchIndex).trim()
    }
  })
}

const extractLevelOneSections = (markdown: string): RequirementSection[] => {
  const normalizedMarkdown = normalizeRequirementDocument(markdown)
  const matches = [...normalizedMarkdown.matchAll(LEVEL_ONE_HEADING_PATTERN)]
  return matches.map((match, index) => {
    const title = (match[1] || '').trim()
    const contentStart = (match.index || 0) + match[0].length
    const nextMatchIndex = index + 1 < matches.length ? matches[index + 1].index || normalizedMarkdown.length : normalizedMarkdown.length
    return {
      title,
      content: normalizedMarkdown.slice(contentStart, nextMatchIndex).trim()
    }
  })
}

const findSectionContent = (sections: RequirementSection[], title: string) =>
  sections.find((section) => section.title === title)?.content || ''

const buildSubSection = (title: string, content: string) => {
  const normalizedContent = normalizeRequirementDocument(content)
  if (!normalizedContent) {
    return ''
  }
  return `## ${title}\n\n${normalizedContent}`
}

export const normalizeSystemTemplateHeadings = (markdown: string) =>
  normalizeRequirementDocument(markdown)
    .replace(LEGACY_SYSTEM_HEADING_PATTERN, '# $1')
    .replace(LEGACY_GITEE_SUB_HEADING_PATTERN, '## $1')
