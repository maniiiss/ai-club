import { describe, expect, it } from 'vitest';
import { attachmentInputKey, canSubmitPrompt, dedupeAttachmentInputs, INPUT_COMPOSER_POINTER_POLICY, isExtensionQueueCommand } from './InputBox';
import type { AttachmentInput } from '@/src/rpc/types';

describe('输入器命中区与提交状态', () => {
	it('有正文或附件且不在解析中时允许提交', () => {
		expect(canSubmitPrompt('  修复登录  ', 0, false)).toBe(true);
		expect(canSubmitPrompt('', 1, false)).toBe(true);
		expect(canSubmitPrompt('   ', 0, false)).toBe(false);
		expect(canSubmitPrompt('修复', 1, true)).toBe(false);
	});

	it('输入器外层不拦截滚动条，只有实际控件接收指针事件', () => {
		expect(INPUT_COMPOSER_POINTER_POLICY).toEqual({ overlay: 'none', interactive: 'auto' });
	});

	it('拖拽同一路径重复事件时只保留一个输入项', () => {
		const items: AttachmentInput[] = [{ path: 'C:\\Docs\\招标文件.pdf' }, { path: 'c:/docs/招标文件.pdf' }, { path: 'C:\\Docs\\其它.pdf' }];
		expect(dedupeAttachmentInputs(items)).toEqual([items[0], items[2]]);
		expect(attachmentInputKey(items[0])).toBe(attachmentInputKey(items[1]));
	});

	it('运行中只阻止扩展命令，Prompt/Skill 命令仍可排队', () => {
		const commands = [
			{ name: 'login', source: 'extension' as const, sourceInfo: { kind: 'extension' } },
			{ name: 'review', source: 'prompt' as const, sourceInfo: { kind: 'prompt' } },
		];
		expect(isExtensionQueueCommand('/login now', commands)).toBe(true);
		expect(isExtensionQueueCommand('/review now', commands)).toBe(false);
		expect(isExtensionQueueCommand('说明当前变更', commands)).toBe(false);
	});
});
