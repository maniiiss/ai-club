import { describe, expect, it } from 'vitest';
import { formatDesignCode } from './code-format';

describe('Design 代码展示格式化', () => {
	it('把单行 HTML 展示为多行，但不改写已有多行源文件', () => {
		expect(formatDesignCode('<main><h1>首页</h1></main>', 'html')).toContain('\n  <h1>\n    首页\n  </h1>');
		expect(formatDesignCode('<main>\n  <h1>首页</h1>\n</main>', 'html')).toBe('<main>\n  <h1>首页</h1>\n</main>');
	});

	it('把单行 CSS、JavaScript 和 JSON 展示为可读格式', () => {
		expect(formatDesignCode('.card{color:red;padding:8px}', 'css')).toContain('  color: red;');
		expect(formatDesignCode("const ready=true;console.log('ok');", 'javascript')).toContain("const ready=true;");
		expect(formatDesignCode('{"name":"GitPilot","version":1}', 'json')).toContain('\n  "name": "GitPilot"');
	});

	it('不格式化未知文件类型', () => {
		expect(formatDesignCode('binary-content', 'unknown')).toBe('binary-content');
	});
});
