import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

async function loadModule() {
  const source = await readFile(new URL('../src/utils/navigationMenu.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020
    }
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

test('normalizes configured menu paths before routing', async () => {
  const { resolveMenuPath } = await loadModule()

  assert.equal(resolveMenuPath('dashboard', '/dashboard'), '/dashboard')
  assert.equal(resolveMenuPath(' /users ', '/users'), '/users')
  assert.equal(resolveMenuPath('/wiki?projectId=8', '/wiki'), '/wiki?projectId=8')
  assert.equal(resolveMenuPath('/dashboard/', '/dashboard'), '/dashboard')
  assert.equal(resolveMenuPath('/wiki/?projectId=8#pages', '/wiki'), '/wiki?projectId=8#pages')
})

test('falls back when configured menu path is blank', async () => {
  const { resolveMenuPath } = await loadModule()

  assert.equal(resolveMenuPath('', '/projects'), '/projects')
  assert.equal(resolveMenuPath('   ', '/projects'), '/projects')
  assert.equal(resolveMenuPath(null, '/projects'), '/projects')
  assert.equal(resolveMenuPath('http://example.com/dashboard', '/dashboard'), '/dashboard')
  assert.equal(resolveMenuPath('javascript:alert(1)', '/dashboard'), '/dashboard')
})

test('compares full menu locations so query changes can navigate', async () => {
  const { isSameMenuLocation } = await loadModule()

  assert.equal(isSameMenuLocation('/wiki', '/wiki'), true)
  assert.equal(isSameMenuLocation('/wiki?projectId=8', '/wiki'), false)
  assert.equal(isSameMenuLocation('/wiki?projectId=8', '/wiki?projectId=8'), true)
})

test('builds router locations from normalized menu paths', async () => {
  const { toMenuRouteLocation } = await loadModule()

  assert.deepEqual(toMenuRouteLocation('/users'), {
    path: '/users',
    force: true
  })
  assert.deepEqual(toMenuRouteLocation('/wiki?projectId=8#pages'), {
    path: '/wiki',
    query: { projectId: '8' },
    hash: '#pages',
    force: true
  })
  assert.deepEqual(toMenuRouteLocation('/tasks?tag=ai&tag=review'), {
    path: '/tasks',
    query: { tag: ['ai', 'review'] },
    force: true
  })
})

test('layout router view lets vue router patch route components normally', async () => {
  const source = await readFile(new URL('../src/layout/AppLayout.vue', import.meta.url), 'utf8')

  assert.ok(source.includes('<RouterView />'))
  assert.equal(source.includes('<component :is="Component" :key="renderedRoute.fullPath" />'), false)
  assert.equal(source.includes('const routeViewKey = computed(() => route.fullPath)'), false)
})

test('layout menu navigation resolves router locations before pushing', async () => {
  const source = await readFile(new URL('../src/layout/AppLayout.vue', import.meta.url), 'utf8')

  assert.ok(source.includes('const targetLocation = toMenuRouteLocation(path)'))
  assert.ok(source.includes('const resolvedTarget = router.resolve(targetLocation).fullPath'))
  assert.ok(source.includes('await router.push(targetLocation)'))
})

test('layout does not keep closed route-bound Hermes drawer mounted during menu navigation', async () => {
  const source = await readFile(new URL('../src/layout/AppLayout.vue', import.meta.url), 'utf8')

  assert.ok(source.includes('<HermesDrawer\n    v-if="hermesDrawerVisible"'))
  assert.ok(source.includes('hermesDrawerVisible.value = true'))
})
