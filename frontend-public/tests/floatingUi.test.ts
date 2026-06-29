import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { computeFloatingDropdownStyle } from '../src/lib/floatingUi'

describe('floating UI utilities', () => {
  it('opens downward when there is enough viewport space below the trigger', () => {
    const style = computeFloatingDropdownStyle({
      triggerRect: rect({ top: 100, bottom: 140, left: 24, width: 320 }),
      viewportHeight: 800,
      scrollX: 0,
      scrollY: 0,
      preferredHeight: 240,
    })

    assert.equal(style.placement, 'bottom')
    assert.equal(style.top, 146)
    assert.equal(style.left, 24)
    assert.equal(style.width, 320)
    assert.equal(style.maxHeight, 240)
  })

  it('opens upward when a scroll container would otherwise clip the dropdown near the viewport bottom', () => {
    const style = computeFloatingDropdownStyle({
      triggerRect: rect({ top: 420, bottom: 460, left: 168, width: 812 }),
      viewportHeight: 560,
      scrollX: 0,
      scrollY: 0,
      preferredHeight: 240,
    })

    assert.equal(style.placement, 'top')
    assert.equal(style.top, 174)
    assert.equal(style.maxHeight, 240)
  })
})

const rect = ({
  top,
  bottom,
  left,
  width,
}: {
  top: number
  bottom: number
  left: number
  width: number
}): DOMRect => ({
  top,
  bottom,
  left,
  width,
  right: left + width,
  height: bottom - top,
  x: left,
  y: top,
  toJSON: () => ({}),
})
