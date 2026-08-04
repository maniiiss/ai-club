import { describe, expect, it } from 'vitest';
import { attachmentInputKey, buildCommandPrompt, canSubmitPrompt, dedupeAttachmentInputs, formatCommandLabel, getCommandIconKey, INPUT_COMPOSER_POINTER_POLICY, isExtensionQueueCommand } from './InputBox';
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

	it('选中命令后只把参数存入输入框，发送时还原 slash prompt', () => {
		expect(buildCommandPrompt('goal', '修复输入框')).toBe('/goal 修复输入框');
		expect(buildCommandPrompt('goal', '   ')).toBe('/goal');
		expect(buildCommandPrompt(null, '普通任务')).toBe('普通任务');
	});

	it('命令 token 使用可读的首字母大写名称', () => {
		expect(formatCommandLabel('goal')).toBe('Goal');
		expect(formatCommandLabel('code-review')).toBe('Code Review');
	});

	it('不同命令使用不同的 token 图标语义', () => {
		expect(getCommandIconKey('goal', 'extension')).toBe('goal');
		expect(getCommandIconKey('plan', 'extension')).toBe('plan');
		expect(getCommandIconKey('skill:frontend', 'skill')).toBe('skill');
		expect(getCommandIconKey('custom', 'prompt')).toBe('prompt');
		expect(getCommandIconKey('custom', 'extension')).toBe('extension');
	});
});
