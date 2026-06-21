import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from '../node_modules/typescript/lib/typescript.js'

async function loadModule() {
  const source = await readFile(new URL('../src/utils/projectRuntimeInstance.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020
    }
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

test('builds managed server runtime instance payload with normalized log paths', async () => {
  const { buildRuntimeInstancePayload } = await loadModule()

  const payload = buildRuntimeInstancePayload({
    name: ' 生产 API ',
    environment: ' prod ',
    serviceName: ' api-service ',
    enabled: true,
    serverMode: 'MANAGED_SERVER',
    serverId: 12,
    externalBaseUrl: 'https://ignored.example.com',
    logEnabled: true,
    logPathsText: ' /srv/app/app.log \n\n~/logs/error.log ',
    healthEnabled: true,
    healthProbeType: 'HTTP',
    healthTarget: ' https://api.example.com/health '
  })

  assert.deepEqual(payload, {
    name: '生产 API',
    environment: 'prod',
    serviceName: 'api-service',
    enabled: true,
    serverMode: 'MANAGED_SERVER',
    serverId: 12,
    externalBaseUrl: '',
    logEnabled: true,
    logPaths: ['/srv/app/app.log', '~/logs/error.log'],
    healthEnabled: true,
    healthProbeType: 'HTTP',
    healthTarget: 'https://api.example.com/health'
  })
})

test('builds external endpoint payload without ssh log collection', async () => {
  const { buildRuntimeInstancePayload } = await loadModule()

  const payload = buildRuntimeInstancePayload({
    name: '外部 API',
    environment: '',
    serviceName: '',
    enabled: false,
    serverMode: 'EXTERNAL_ENDPOINT',
    serverId: 99,
    externalBaseUrl: ' https://api.example.com/ ',
    logEnabled: true,
    logPathsText: '/srv/app/app.log',
    healthEnabled: true,
    healthProbeType: 'TCP',
    healthTarget: 'api.example.com:443'
  })

  assert.equal(payload.serverId, null)
  assert.equal(payload.logEnabled, false)
  assert.deepEqual(payload.logPaths, [])
  assert.equal(payload.externalBaseUrl, 'https://api.example.com/')
})

test('rejects incomplete runtime instance form before submit', async () => {
  const { buildRuntimeInstancePayload } = await loadModule()

  assert.throws(() => buildRuntimeInstancePayload({
    name: '',
    environment: '',
    serviceName: '',
    enabled: true,
    serverMode: 'MANAGED_SERVER',
    serverId: null,
    externalBaseUrl: '',
    logEnabled: false,
    logPathsText: '',
    healthEnabled: true,
    healthProbeType: 'HTTP',
    healthTarget: ''
  }), /运行实例名称不能为空/)
})

test('resolves runtime instance source and status display labels', async () => {
  const { formatRuntimeInstanceSource, runtimeInstanceStatusTone } = await loadModule()

  assert.equal(formatRuntimeInstanceSource('MANUAL'), '手工维护')
  assert.equal(formatRuntimeInstanceSource('JENKINS'), 'Jenkins')
  assert.equal(formatRuntimeInstanceSource('WOODPECKER'), 'Woodpecker')
  assert.equal(runtimeInstanceStatusTone('DEPLOYING'), 'warning')
  assert.equal(runtimeInstanceStatusTone('HEALTHY'), 'success')
  assert.equal(runtimeInstanceStatusTone('FAILED'), 'danger')
})
