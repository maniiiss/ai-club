import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildSelectRootClassName } from '../src/components/common/Select'

describe('select layout classes', () => {
  it('uses inline row layout when filters need label and trigger on one line', () => {
    const className = buildSelectRootClassName('inline', '[&>div]:w-36')

    assert.match(className, /\bflex-row\b/)
    assert.match(className, /\bitems-center\b/)
    assert.match(className, /\bgap-2\b/)
    assert.match(className, /\[&>div\]:w-36/)
  })

  it('keeps the default vertical layout for regular form fields', () => {
    const className = buildSelectRootClassName()

    assert.match(className, /\bflex-col\b/)
    assert.match(className, /\bgap-1\.5\b/)
  })
})
