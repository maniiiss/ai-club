import type { GitlabBranchItem, GitlabTagPayload } from '@/src/types/development'

/** 创建 Tag 时优先带入绑定默认分支，再降级到 GitLab 默认分支或列表第一项。 */
export const resolveDefaultTagBranch = (
  bindingDefaultBranch: string | null | undefined,
  branches: Pick<GitlabBranchItem, 'name' | 'defaultBranch'>[],
): string => {
  const normalizedDefault = bindingDefaultBranch?.trim()
  if (normalizedDefault) return normalizedDefault
  return branches.find((branch) => branch.defaultBranch)?.name || branches[0]?.name || ''
}

/** 统一清理创建 Tag 的表单载荷；空备注表示创建轻量 Tag。 */
export const buildGitlabTagPayload = (form: {
  tagName: string
  branchName: string
  message: string
}): GitlabTagPayload => {
  const message = form.message.trim()
  return {
    tagName: form.tagName.trim(),
    branchName: form.branchName.trim(),
    message: message || undefined,
  }
}
