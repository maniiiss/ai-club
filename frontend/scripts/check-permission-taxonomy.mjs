import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const sourcePath = new URL('../src/utils/permissionTaxonomy.ts', import.meta.url)
const source = await readFile(sourcePath, 'utf-8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020
  }
})

const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText, 'utf-8').toString('base64')}`
const taxonomy = await import(moduleUrl)

assert.equal(taxonomy.resolvePermissionTaxonomy({ code: 'system:user:view' }).navigationGroup, 'system')
assert.equal(taxonomy.resolvePermissionTaxonomy({ code: 'system:credit:view' }).navigationGroup, 'platform')
assert.equal(taxonomy.resolvePermissionTaxonomy({ code: 'model:view' }).navigationGroup, 'platform')
assert.equal(taxonomy.resolvePermissionTaxonomy({ code: 'cicd:view' }).usageLabel, '集成能力')
assert.equal(taxonomy.resolvePermissionTaxonomy({ code: 'dashboard:view' }).usageLabel, '业务协作')

const grouped = taxonomy.groupPermissionsByTaxonomy([
  { id: 1, code: 'system:user:view', name: '用户管理', sortOrder: 90 },
  { id: 2, code: 'system:credit:view', name: '积分管理', sortOrder: 130 },
  { id: 3, code: 'project:view', name: '项目管理', sortOrder: 20 }
])

assert.deepEqual(grouped.map((group) => group.label), ['业务协作', '系统管理', '平台管理'])
assert.deepEqual(grouped.flatMap((group) => group.items.map((item) => item.code)), [
  'project:view',
  'system:user:view',
  'system:credit:view'
])
