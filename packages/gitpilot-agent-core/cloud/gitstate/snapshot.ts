import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdtemp, readFile, readlink, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const GIT_SNAPSHOT_LIMITS = Object.freeze({
  maxUntrackedFileBytes: 20 * 1024 * 1024,
  maxSnapshotBytes: 256 * 1024 * 1024,
})

export class GitSnapshotError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'GitSnapshotError'
  }
}

export interface GitFingerprint {
  head: string
  branch: string
  indexPath: string
  indexHash: string
  statusHash: string
  workingTreeHash: string
}

export interface GitSnapshotOptions {
  repoRoot: string
  includeUntracked?: boolean | string[]
  forbiddenGlobs?: string[]
  commitMessage?: string
  maxUntrackedFileBytes?: number
  maxSnapshotBytes?: number
}

export interface GitSnapshotResult {
  baseCommit: string
  tree: string
  commit: string
  includedUntrackedFiles: string[]
  fingerprint: GitFingerprint
}

const runGit = async (repoRoot: string, args: string[], env: NodeJS.ProcessEnv = {}) => {
  try {
    const result = await execFileAsync('git', args, {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    return String(result.stdout || '')
  } catch (error: any) {
    const message = String(error?.stderr || error?.message || 'Git 命令执行失败').trim()
    throw new GitSnapshotError('GIT_COMMAND_FAILED', `${args.join(' ')}: ${message}`)
  }
}

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const normalizeRelative = (value: string) => value.replaceAll('\\', '/').replace(/^\.\//, '')
const isInside = (root: string, target: string) => {
  const relativePath = relative(root, target)
  return relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !resolve(relativePath).startsWith(`${sep}`))
}

const gitIndexPath = async (repoRoot: string) => {
  const raw = (await runGit(repoRoot, ['rev-parse', '--git-path', 'index'])).trim()
  return resolve(repoRoot, raw)
}

const fileHash = async (path: string) => {
  try { return sha256(await readFile(path)) } catch (error: any) {
    if (error?.code === 'ENOENT') return 'missing'
    throw error
  }
}

/** 获取 HEAD、分支、真实 index 和工作区的稳定指纹，供零污染前后比较。 */
export const captureGitFingerprint = async (repoRoot: string): Promise<GitFingerprint> => {
  const indexPath = await gitIndexPath(repoRoot)
  const status = await runGit(repoRoot, ['status', '--porcelain=v1', '-z', '--ignore-submodules=none'])
  const staged = await runGit(repoRoot, ['diff', '--cached', '--no-ext-diff'])
  const unstaged = await runGit(repoRoot, ['diff', '--no-ext-diff'])
  const head = (await runGit(repoRoot, ['rev-parse', 'HEAD'])).trim()
  const branch = (await runGit(repoRoot, ['branch', '--show-current'])).trim()
  return {
    head,
    branch,
    indexPath,
    indexHash: await fileHash(indexPath),
    statusHash: sha256(status),
    workingTreeHash: sha256(`${staged}\0${unstaged}\0${status}`),
  }
}

const sameFingerprint = (before: GitFingerprint, after: GitFingerprint) =>
  before.head === after.head
  && before.branch === after.branch
  && before.indexPath === after.indexPath
  && before.indexHash === after.indexHash
  && before.statusHash === after.statusHash
  && before.workingTreeHash === after.workingTreeHash

const forbiddenPath = (relativePath: string) => {
  const normalized = normalizeRelative(relativePath)
  const segments = normalized.split('/')
  const fileName = basename(normalized).toLowerCase()
  return normalized === '.env'
    || normalized.startsWith('.env.')
    || segments.some((segment) => ['.git', 'node_modules', 'target', 'dist', '.venv', '.idea', '.vscode'].includes(segment.toLowerCase()))
    || ['id_rsa', 'id_ed25519', '.npmrc', '.pypirc', 'settings.xml'].includes(fileName)
    || /\.(pem|key|p12|pfx|crt|cer)$/i.test(fileName)
}

const globToRegExp = (glob: string) => {
  let source = ''
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index]
    if (character === '*') {
      if (glob[index + 1] === '*') { source += '.*'; index += 1 } else source += '[^/]*'
    } else if (character === '?') source += '[^/]'
    else source += character.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`, 'i')
}

const matchesForbiddenGlob = (relativePath: string, globs: string[]) =>
  globs.some((glob) => glob.trim() && globToRegExp(normalizeRelative(glob.trim())).test(relativePath))

const assertSafeUntrackedPath = async (repoRoot: string, relativePath: string, maxBytes: number) => {
  const absolutePath = resolve(repoRoot, relativePath)
  if (!isInside(resolve(repoRoot), absolutePath)) throw new GitSnapshotError('UNTRACKED_PATH_OUTSIDE_REPOSITORY', `未跟踪文件路径越界: ${relativePath}`)
  const fileStat = await lstat(absolutePath)
  if (fileStat.isSymbolicLink()) {
    let target: string
    try { target = await realpath(absolutePath) } catch { throw new GitSnapshotError('UNTRACKED_EXTERNAL_SYMLINK', `未跟踪符号链接无法解析: ${relativePath}`) }
    if (!isInside(resolve(repoRoot), target)) throw new GitSnapshotError('UNTRACKED_EXTERNAL_SYMLINK', `未跟踪符号链接指向仓库外: ${relativePath}`)
    throw new GitSnapshotError('UNTRACKED_SYMLINK_UNSUPPORTED', `首版不接力未跟踪符号链接: ${relativePath}`)
  }
  if (!fileStat.isFile()) throw new GitSnapshotError('UNTRACKED_FILE_UNSUPPORTED', `未跟踪路径不是普通文件: ${relativePath}`)
  if (fileStat.size > maxBytes) throw new GitSnapshotError('UNTRACKED_FILE_TOO_LARGE', `未跟踪文件超过大小限制: ${relativePath}`)
  return fileStat.size
}

const untrackedFiles = async (repoRoot: string) => {
  const raw = await runGit(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z'])
  return raw.split('\0').filter(Boolean).map(normalizeRelative)
}

const stagedAddedOrRenamedFiles = async (repoRoot: string) => {
  const raw = await runGit(repoRoot, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
  return raw.split('\0').filter(Boolean).map(normalizeRelative)
}

const assertNoDirtySubmodule = async (repoRoot: string) => {
  const output = await runGit(repoRoot, ['submodule', 'status', '--recursive'])
  if (output.split(/\r?\n/).some((line) => /^[+-]/.test(line.trim()))) {
    throw new GitSnapshotError('DIRTY_SUBMODULE', '首版不支持未初始化或已修改的 dirty submodule')
  }
}

const assertSnapshotFilesSafeAndWithinLimit = async (repoRoot: string, gitEnv: NodeJS.ProcessEnv, maxBytes: number) => {
  const raw = await runGit(repoRoot, ['ls-files', '-z'], gitEnv)
  let totalBytes = 0
  for (const relativePath of raw.split('\0').filter(Boolean).map(normalizeRelative)) {
    const absolutePath = resolve(repoRoot, relativePath)
    let fileStat
    try { fileStat = await lstat(absolutePath) } catch (error: any) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
    if (fileStat.isSymbolicLink()) {
      let target: string
      try { target = await realpath(absolutePath) } catch { throw new GitSnapshotError('EXTERNAL_SYMLINK', `符号链接无法解析: ${relativePath}`) }
      if (!isInside(resolve(repoRoot), target)) throw new GitSnapshotError('EXTERNAL_SYMLINK', `符号链接指向仓库外: ${relativePath}`)
      totalBytes += Buffer.byteLength(await readlink(absolutePath), 'utf8')
    } else if (fileStat.isFile()) {
      totalBytes += fileStat.size
    }
    if (totalBytes > maxBytes) throw new GitSnapshotError('SNAPSHOT_TOO_LARGE', 'Git 快照内容超过大小限制')
  }
}

/**
 * 使用临时 index 创建 Git 接力提交。
 * 业务意图：把用户工作现场固化成 Git 对象，但绝不触碰当前分支、HEAD、真实 index 或工作区。
 */
export const createTemporaryGitSnapshot = async (options: GitSnapshotOptions): Promise<GitSnapshotResult> => {
  const repoRoot = resolve(options.repoRoot)
  const before = await captureGitFingerprint(repoRoot)
  await assertNoDirtySubmodule(repoRoot)
  const candidates = await untrackedFiles(repoRoot)
  // 真实 index 中已暂存的新增/重命名是用户明确纳入的内容，即使相对 HEAD 看似未跟踪，也必须进入快照。
  const stagedAddedOrRenamed = await stagedAddedOrRenamedFiles(repoRoot)
  const include = options.includeUntracked === true
    ? candidates
    : Array.isArray(options.includeUntracked) ? options.includeUntracked.map(normalizeRelative) : []
  const selected = [...new Set(include)]
  const forbiddenGlobs = options.forbiddenGlobs || []
  const maxFileBytes = options.maxUntrackedFileBytes || GIT_SNAPSHOT_LIMITS.maxUntrackedFileBytes
  const maxSnapshotBytes = options.maxSnapshotBytes || GIT_SNAPSHOT_LIMITS.maxSnapshotBytes
  let selectedBytes = 0
  for (const relativePath of selected) {
    if (!candidates.includes(relativePath)) throw new GitSnapshotError('UNTRACKED_FILE_NOT_FOUND', `未跟踪文件不存在或被 .gitignore 排除: ${relativePath}`)
    if (forbiddenPath(relativePath) || matchesForbiddenGlob(relativePath, forbiddenGlobs)) throw new GitSnapshotError('SENSITIVE_UNTRACKED_FILE', `未跟踪文件命中禁止规则: ${relativePath}`)
    selectedBytes += await assertSafeUntrackedPath(repoRoot, relativePath, maxFileBytes)
  }
  for (const relativePath of stagedAddedOrRenamed) {
    if (forbiddenPath(relativePath) || matchesForbiddenGlob(relativePath, forbiddenGlobs)) {
      throw new GitSnapshotError('SENSITIVE_TRACKED_FILE', `已暂存路径命中禁止规则: ${relativePath}`)
    }
  }
  if (selectedBytes > maxSnapshotBytes) throw new GitSnapshotError('SNAPSHOT_TOO_LARGE', '未跟踪文件总大小超过快照限制')

  const tempDirectory = await mkdtemp(resolve(tmpdir(), 'gitpilot-index-'))
  const indexPath = resolve(tempDirectory, 'index')
  const gitEnv = { GIT_INDEX_FILE: indexPath }
  try {
    await runGit(repoRoot, ['read-tree', 'HEAD'], gitEnv)
    // 不附加空的 `--` pathspec；在自定义 GIT_INDEX_FILE 下部分 Git 版本会把它解释为无路径更新。
    await runGit(repoRoot, ['add', '-u'], gitEnv)
    if (stagedAddedOrRenamed.length > 0) await runGit(repoRoot, ['add', '--', ...stagedAddedOrRenamed], gitEnv)
    if (selected.length > 0) await runGit(repoRoot, ['add', '--', ...selected], gitEnv)
    await assertSnapshotFilesSafeAndWithinLimit(repoRoot, gitEnv, maxSnapshotBytes)
    const tree = (await runGit(repoRoot, ['write-tree'], gitEnv)).trim()
    const commit = (await runGit(repoRoot, [
      'commit-tree', tree, '-p', before.head, '-m', options.commitMessage || 'GitPilot handoff snapshot',
    ], {
      ...gitEnv,
      GIT_AUTHOR_NAME: 'GitPilot',
      GIT_AUTHOR_EMAIL: 'gitpilot@localhost',
      GIT_COMMITTER_NAME: 'GitPilot',
      GIT_COMMITTER_EMAIL: 'gitpilot@localhost',
    })).trim()
    const after = await captureGitFingerprint(repoRoot)
    if (!sameFingerprint(before, after)) throw new GitSnapshotError('GIT_WORKTREE_CHANGED', '创建临时快照期间检测到用户 Git 状态变化')
    return { baseCommit: before.head, tree, commit, includedUntrackedFiles: selected, fingerprint: after }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
}
