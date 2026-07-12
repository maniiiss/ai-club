const IMAGE_URL_PATTERN = /(?:https?:\/\/|\/api\/common\/(?:public-)?files\/)[^\s<>"')]+/giu
const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|gif|webp|svg)(?:$|[?#])/iu
const PLATFORM_ASSET_PATTERN = /\/api\/common\/(?:public-)?files\/\d+(?:\?|$)/iu
const TRAILING_PUNCTUATION_PATTERN = /[。，；：！？、）》】〉,.!?;:]+$/u

const isImageUrl = (value: string) => {
  const normalized = value.replace(TRAILING_PUNCTUATION_PATTERN, '')
  return IMAGE_EXTENSION_PATTERN.test(normalized) || PLATFORM_ASSET_PATTERN.test(normalized)
}

const cleanImageUrl = (value: string) => value.replace(TRAILING_PUNCTUATION_PATTERN, '')

/**
 * 将需求 AI 结果中的图片链接规范为 Markdown 图片，保证预览、编辑和回写使用同一语义。
 * 只处理 http(s) 图片地址，代码块和普通资料链接保持原样。
 */
export const normalizeRequirementAiImageMarkdown = (markdown?: string | null): string => {
  if (!markdown) return ''

  const tokens: string[] = []
  const protect = (value: string) => {
    const token = `@@REQ_AI_IMAGE_${tokens.length}@@`
    tokens.push(value)
    return token
  }

  let inCodeBlock = false
  const normalizedLines = markdown.replace(/\r\n?/g, '\n').split('\n').map((line) => {
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock
      return line
    }
    if (inCodeBlock) return line

    let result = line.replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\/api\/common\/(?:public-)?files\/)[^\s)]+)\)/giu, (full) => protect(full))
    result = result.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/api\/common\/(?:public-)?files\/)[^\s)]+)\)/giu, (full, alt: string, url: string) => {
      if (!isImageUrl(url)) return full
      return protect(`![${alt}](${cleanImageUrl(url)})`)
    })
    result = result.replace(IMAGE_URL_PATTERN, (url) => {
      if (!isImageUrl(url)) return url
      return protect(`![图片](${cleanImageUrl(url)})`)
    })
    return result
  }).join('\n')

  return normalizedLines.replace(/@@REQ_AI_IMAGE_(\d+)@@/g, (_, index: string) => tokens[Number(index)] || '')
}
