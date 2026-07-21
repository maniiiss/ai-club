import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlatformUrl } from '../src/config.js'

test('平台地址注册会去掉尾部斜杠并拒绝凭据地址', () => {
  assert.equal(normalizePlatformUrl('https://gitpilot.example.com/'), 'https://gitpilot.example.com')
  assert.throws(() => normalizePlatformUrl('https://user:pass@gitpilot.example.com'), /不能包含用户名、密码/)
  assert.throws(() => normalizePlatformUrl('ftp://gitpilot.example.com'), /HTTP\/HTTPS/)
})
