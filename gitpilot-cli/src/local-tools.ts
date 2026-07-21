import { execFile } from 'node:child_process'
import { access, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { Type } from 'typebox'

const execFileAsync = promisify(execFile)

const isInside = (root: string, target: string) => {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

const resolveRepoPath = async (repoRoot: string, input: string, mustExist = false) => {
  const candidate = resolve(repoRoot, input || '.')
  if (!isInside(repoRoot, candidate)) throw new Error('本地工具只能访问当前仓库目录')
  if (mustExist) {
    const existing = await realpath(candidate)
    if (!isInside(repoRoot, existing)) throw new Error('路径符号链接指向仓库外，已拒绝访问')
    return existing
  }
  return candidate
}

const ask = async (message: string): Promise<boolean> => {
  if (!process.stdin.isTTY) return false
  const readline = await import('node:readline/promises')
  const input = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await input.question(`${message} [y/N] `)
    return ['y', 'yes', '是'].includes(answer.trim().toLowerCase())
  } finally {
    input.close()
  }
}

const runCommand = async (command: string, args: string[], cwd: string) => {
  const result = await execFileAsync(command, args, { cwd, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' })
  return `${result.stdout}${result.stderr}`.trim()
}

export const isDangerousShell = (command: string) => /(^|\s)(rm\s+-rf|del\s+\/s|format\s|shutdown\s|git\s+(reset|clean|checkout|push\s+--force)|sudo\s)/i.test(command)

/** 创建当前仓库内的最小本地工具集，所有写操作都在执行前再次校验路径。 */
export const createLocalTools = (repoRoot: string) => [
  {
    name: 'local__fs_read',
    label: '读取文件',
    description: '读取当前仓库内的 UTF-8 文本文件。',
    parameters: Type.Object({ path: Type.String(), maxBytes: Type.Optional(Type.Number()) }),
    execute: async (_id: string, args: { path: string; maxBytes?: number }) => {
      const filePath = await resolveRepoPath(repoRoot, args.path, true)
      const content = await readFile(filePath, 'utf8')
      const maxBytes = Math.max(1, Math.min(args.maxBytes || 100_000, 1_000_000))
      return { content: Buffer.byteLength(content, 'utf8') > maxBytes ? `${content.slice(0, maxBytes)}\n[内容已截断]` : content }
    },
  },
  {
    name: 'local__fs_write',
    label: '写入文件',
    description: '在当前仓库内写入 UTF-8 文本文件，需要用户确认。',
    parameters: Type.Object({ path: Type.String(), content: Type.String() }),
    execute: async (_id: string, args: { path: string; content: string }) => {
      const filePath = await resolveRepoPath(repoRoot, args.path)
      if (!await ask(`即将写入 ${relative(repoRoot, filePath)}，是否继续？`)) throw new Error('用户拒绝了文件写入')
      await writeFile(filePath, args.content, { encoding: 'utf8' })
      return { path: relative(repoRoot, filePath), bytes: Buffer.byteLength(args.content, 'utf8') }
    },
  },
  {
    name: 'local__fs_glob',
    label: '检索文件',
    description: '列出当前仓库内匹配 glob 的文件。',
    parameters: Type.Object({ pattern: Type.String() }),
    execute: async (_id: string, args: { pattern: string }) => ({ files: (await runCommand('rg', ['--files', '-g', args.pattern], repoRoot)).split(/\r?\n/).filter(Boolean).slice(0, 1000) }),
  },
  {
    name: 'local__git_status',
    label: 'Git 状态',
    description: '读取当前仓库 Git 状态。',
    parameters: Type.Object({}),
    execute: async () => ({ status: await runCommand('git', ['status', '--short', '--branch'], repoRoot) }),
  },
  {
    name: 'local__git_diff',
    label: 'Git Diff',
    description: '读取当前仓库未提交 Diff。',
    parameters: Type.Object({ staged: Type.Optional(Type.Boolean()) }),
    execute: async (_id: string, args: { staged?: boolean }) => ({ diff: await runCommand('git', args.staged ? ['diff', '--cached'] : ['diff'], repoRoot) }),
  },
  {
    name: 'local__shell_run',
    label: '执行命令',
    description: '在当前仓库目录执行命令，需要用户确认；禁止固定危险命令。',
    parameters: Type.Object({ command: Type.String() }),
    execute: async (_id: string, args: { command: string }) => {
      if (isDangerousShell(args.command)) throw new Error('命令命中本地安全策略，已拒绝执行')
      if (!await ask(`即将在 ${repoRoot} 执行：${args.command}`)) throw new Error('用户拒绝了 Shell 命令')
      const result = await execFileAsync(process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32' ? ['/d', '/s', '/c', args.command] : ['-lc', args.command], { cwd: repoRoot, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' })
      return { stdout: result.stdout, stderr: result.stderr }
    },
  },
]
