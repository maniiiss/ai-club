import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { captureGitFingerprint, createTemporaryGitSnapshot, GitSnapshotError } from '../src/gitstate/snapshot.js'
import { resolveRepoPath } from '../src/local-tools.js'

const execFileAsync = promisify(execFile)
const git = async (cwd: string, ...args: string[]) => {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' })
  return String(result.stdout || '').trim()
}

const makeRepo = async () => {
  const root = await mkdtemp(join(tmpdir(), 'gitpilot-test-'))
  await git(root, 'init', '-b', 'main')
  await git(root, 'config', 'user.name', 'GitPilot Test')
  await git(root, 'config', 'user.email', 'gitpilot-test@localhost')
  await writeFile(join(root, 'tracked.txt'), 'initial\n', 'utf8')
  await git(root, 'add', 'tracked.txt')
  await git(root, 'commit', '-m', 'initial')
  return root
}

test('creates a temporary commit without changing user Git state', async () => {
  const root = await makeRepo()
  try {
    await writeFile(join(root, 'tracked.txt'), 'staged\n', 'utf8')
    await git(root, 'add', 'tracked.txt')
    await writeFile(join(root, 'tracked.txt'), 'staged and unstaged\n', 'utf8')
    await writeFile(join(root, 'new.ts'), 'export const value = 1\n', 'utf8')
    const before = await captureGitFingerprint(root)
    const result = await createTemporaryGitSnapshot({ repoRoot: root })
    const after = await captureGitFingerprint(root)

    assert.deepEqual(after, before)
    assert.equal(await git(root, 'ls-tree', '-r', '--name-only', result.commit), 'tracked.txt')
    assert.equal((await readFile(join(root, 'tracked.txt'), 'utf8')), 'staged and unstaged\n')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('includes only explicitly selected safe untracked files', async () => {
  const root = await makeRepo()
  try {
    await writeFile(join(root, 'safe.ts'), 'export const safe = true\n', 'utf8')
    await writeFile(join(root, '.env'), 'API_KEY=secret-value\n', 'utf8')
    const result = await createTemporaryGitSnapshot({ repoRoot: root, includeUntracked: ['safe.ts'] })
    assert.deepEqual(result.includedUntrackedFiles, ['safe.ts'])
    assert.equal(await git(root, 'ls-tree', '-r', '--name-only', result.commit), 'safe.ts\ntracked.txt')
    await assert.rejects(
      () => createTemporaryGitSnapshot({ repoRoot: root, includeUntracked: ['.env'] }),
      (error) => error instanceof GitSnapshotError && error.code === 'SENSITIVE_UNTRACKED_FILE',
    )
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('supports detached HEAD without updating the checked-out ref', async () => {
  const root = await makeRepo()
  try {
    const head = await git(root, 'rev-parse', 'HEAD')
    await git(root, 'checkout', '--detach', head)
    const before = await captureGitFingerprint(root)
    const result = await createTemporaryGitSnapshot({ repoRoot: root })
    assert.equal(result.baseCommit, head)
    assert.deepEqual(await captureGitFingerprint(root), before)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('captures tracked deletion and rename while preserving the real index', async () => {
  const root = await makeRepo()
  try {
    await writeFile(join(root, 'rename-me.txt'), 'rename me\n', 'utf8')
    await git(root, 'add', 'rename-me.txt')
    await git(root, 'commit', '-m', 'add rename fixture')
    await git(root, 'mv', 'rename-me.txt', 'renamed.txt')
    await rm(join(root, 'tracked.txt'))
    const expected = await captureGitFingerprint(root)

    const result = await createTemporaryGitSnapshot({ repoRoot: root })
    assert.deepEqual(await captureGitFingerprint(root), expected)
    assert.equal(await git(root, 'ls-tree', '-r', '--name-only', result.commit), 'renamed.txt')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('rejects existing paths whose real target leaves the repository', async () => {
  const root = await makeRepo()
  const outside = await mkdtemp(join(tmpdir(), 'gitpilot-outside-'))
  try {
    await writeFile(join(outside, 'secret.txt'), 'outside\n', 'utf8')
    try { await symlink(join(outside, 'secret.txt'), join(root, 'linked.txt')) } catch { return }
    await assert.rejects(
      () => resolveRepoPath(root, 'linked.txt'),
      /路径符号链接指向仓库外/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})
