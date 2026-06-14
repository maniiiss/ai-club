import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

async function loadModule() {
  const source = await readFile(new URL('../src/utils/hermesDrawerLayout.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020
    }
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

test('uses desktop default drawer state when fullscreen is off', async () => {
  const { resolveHermesDrawerPresentation } = await loadModule()

  assert.deepEqual(resolveHermesDrawerPresentation({ isMobileViewport: false, desktopFullscreen: false }), {
    size: '880px',
    classNames: ['hermes-drawer'],
    panelColumns: '164px minmax(0, 1fr)'
  })
})

test('uses full width drawer state when desktop fullscreen is on', async () => {
  const { resolveHermesDrawerPresentation } = await loadModule()

  assert.deepEqual(resolveHermesDrawerPresentation({ isMobileViewport: false, desktopFullscreen: true }), {
    size: '100%',
    classNames: ['hermes-drawer', 'is-desktop-fullscreen'],
    panelColumns: '220px minmax(0, 1fr)'
  })
})

test('forces mobile drawer state regardless of desktop fullscreen flag', async () => {
  const { resolveHermesDrawerPresentation } = await loadModule()

  assert.deepEqual(resolveHermesDrawerPresentation({ isMobileViewport: true, desktopFullscreen: true }), {
    size: '100%',
    classNames: ['hermes-drawer', 'is-mobile'],
    panelColumns: '164px minmax(0, 1fr)'
  })
})
