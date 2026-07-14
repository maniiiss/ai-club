import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

async function loadModule() {
  const source = await readFile(new URL('../src/api/assistant.ts', import.meta.url), 'utf8')
  const standaloneSource = `
const AUTH_TOKEN_KEY = 'auth-token'
const getResolvedApiBaseUrl = () => ''
const http = {}
${source.replace(/import[\s\S]*?from ['"][^'"]+['"]\n/g, '')}
`
  const { outputText } = ts.transpileModule(standaloneSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020
    }
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

const waitForStreamPump = () => new Promise((resolve) => setTimeout(resolve, 20))

test('reports interrupted Assistant stream as error instead of synthetic empty done', async () => {
  const { streamAssistantSessionChat } = await loadModule()
  const encoder = new TextEncoder()
  const events = [
    'event:meta\ndata:{"scopeKey":"scope-1","roleName":"Assistant","references":[],"suggestions":[],"actions":[{"type":"CREATE_EXECUTION_TASK","title":"创建任务","description":"确认后创建","requiresConfirm":true,"params":{}}],"selectionCards":[],"debug":null,"attachments":[]}\n\n',
    'event:delta\ndata:{"content":"我已经准备好了动作"}\n\n'
  ].join('')
  const donePayloads = []
  const errors = []

  globalThis.localStorage = {
    getItem: () => ''
  }
  globalThis.fetch = async () => ({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(events))
        controller.close()
      }
    })
  })

  await streamAssistantSessionChat(1, { question: '帮我创建执行任务', selection: null, debug: false }, {
    onDone: (payload) => donePayloads.push(payload),
    onError: (payload) => errors.push(payload)
  })
  await waitForStreamPump()

  assert.equal(donePayloads.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /中断|断开/)
})

test('reports empty Assistant stream as error instead of leaving caller without terminal callback', async () => {
  const { streamAssistantSessionChat } = await loadModule()
  const donePayloads = []
  const errors = []

  globalThis.localStorage = {
    getItem: () => ''
  }
  globalThis.fetch = async () => ({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.close()
      }
    })
  })

  await streamAssistantSessionChat(1, { question: '帮我查一下项目', selection: null, debug: false }, {
    onDone: (payload) => donePayloads.push(payload),
    onError: (payload) => errors.push(payload)
  })
  await waitForStreamPump()

  assert.equal(donePayloads.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /中断|断开|空/)
})
