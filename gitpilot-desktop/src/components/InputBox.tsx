/**
 * 输入框。
 *
 * - Enter 发送，Shift+Enter 换行
 * - 输入 / 触发命令面板（见 CommandPalette）
 * - 流式中输入为 steer（不打断当前回合），并显示停止按钮触发 abort
 * - 模型与思维级别选择器置于输入区上方，发送指令前可就近调整
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square, Slash } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { CommandPalette } from './CommandPalette';
import { ModelPicker } from './ModelPicker';

export function InputBox() {
	const isStreaming = useSessionStore((s) => s.isStreaming);
	const commands = useSessionStore((s) => s.commands);
	const prompt = useSessionStore((s) => s.prompt);
	const steer = useSessionStore((s) => s.steer);
	const abort = useSessionStore((s) => s.abort);

	const [text, setText] = useState('');
	const [showPalette, setShowPalette] = useState(false);
	const taRef = useRef<HTMLTextAreaElement>(null);

	// / 开头且无空格时显示命令面板
	useEffect(() => {
		const m = text.match(/^\/(\w*)$/);
		setShowPalette(m !== null);
	}, [text]);

	// 自适应高度
	useEffect(() => {
		const ta = taRef.current;
		if (!ta) return;
		ta.style.height = 'auto';
		ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
	}, [text]);

	const send = () => {
		const msg = text.trim();
		if (!msg) return;
		if (isStreaming) {
			steer(msg);
		} else {
			prompt(msg);
		}
		setText('');
		setShowPalette(false);
	};

	const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (showPalette) return; // 命令面板接管键盘
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	};

	const pickCommand = (name: string) => {
		setText(`/${name} `);
		setShowPalette(false);
		taRef.current?.focus();
	};

	return (
		<div className="relative border-t border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3">
			{showPalette && <CommandPalette commands={commands} onPick={pickCommand} onDismiss={() => setShowPalette(false)} />}
			<div className="mx-auto mb-2 flex max-w-3xl justify-end">
				<ModelPicker />
			</div>
			<div className="mx-auto flex max-w-3xl items-end gap-2">
				<div className="flex flex-1 items-end rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 focus-within:border-[var(--color-primary)]">
					<textarea
						ref={taRef}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={onKey}
						rows={1}
						placeholder={isStreaming ? '输入指令引导当前回合…' : '输入消息，/ 唤出命令'}
						className="max-h-50 flex-1 resize-none bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
					/>
					{!text && !isStreaming && <Slash size={14} className="mb-0.5 text-[var(--color-text-muted)]" />}
				</div>
				{isStreaming ? (
					<button
						type="button"
						onClick={() => abort()}
						className="flex size-9 items-center justify-center rounded-lg bg-[var(--color-error)]/15 text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/25"
						title="停止"
					>
						<Square size={15} />
					</button>
				) : (
					<button
						type="button"
						onClick={send}
						disabled={!text.trim()}
						className="flex size-9 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
						title="发送"
					>
						<ArrowUp size={16} />
					</button>
				)}
			</div>
		</div>
	);
}
