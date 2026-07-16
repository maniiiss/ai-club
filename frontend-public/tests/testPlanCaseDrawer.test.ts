import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const page = readFileSync(join(import.meta.dirname, '..', 'src', 'pages', 'execution', 'TestPlanDetailPage.tsx'), 'utf8')

describe('测试计划用例抽屉', () => {
  it('复用工作项详情抽屉的公共容器和关闭动画', () => {
    assert.match(page, /import \{ SlideDrawer \} from '@\/src\/components\/common\/SlideDrawer'/)
    assert.match(page, /open=\{!isClosing\}/)
    assert.match(page, /width="clamp\(800px, 52vw, 1040px\)"/)
    assert.match(page, /maxWidth="calc\(100vw - 48px\)"/)
    assert.match(page, /const handleClose = useCallback\(\(\) => \{[\s\S]*window\.setTimeout\(onClose, 300\)/)
    assert.doesNotMatch(page, /<div className="fixed inset-0 z-50">/)
  })
})
