import { describe, expect, it } from 'vitest';
import { normalizeSidecarError } from './bridge';

describe('sidecar 错误提示', () => {
	it('不把原始 Agent JSON 显示到用户界面', () => {
		expect(normalizeSidecarError('{"type":"message","content":"very long agent payload"}')).toBe('GitPilot 返回了无法识别的输出。请重试；若持续出现，请重新启动应用。');
	});

	it('保留正常短错误并截断异常长错误', () => {
		expect(normalizeSidecarError('模型连接失败')).toBe('模型连接失败');
		expect(normalizeSidecarError('x'.repeat(241))).toHaveLength(221);
	});
});
