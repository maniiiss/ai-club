/**
 * 输入框。
 *
 * - Enter 发送，Shift+Enter 换行
 * - 输入 / 触发命令面板（见 CommandPalette）
 * - 流式中输入为 steer（不打断当前回合），并显示停止按钮触发 abort
 * - 模型与思维级别选择器置于悬浮编辑器底部操作栏，发送指令前可就近调整
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { CommandPalette } from './CommandPalette';
import { ModelPicker } from './ModelPicker';
import { useWorkbenchStore } from '@/src/store/workbench';

export function InputBox() {
	const isStreaming = useSessionStore((s) => s.isStreaming);
	const commands = useSessionStore((s) => s.commands);
	const prompt = useSessionStore((s) => s.prompt);
	const steer = useSessionStore((s) => s.steer);
	const abort = useSessionStore((s) => s.abort);
	const composerPrefill = useWorkbenchStore((s) => s.composerPrefill);
	const consumeComposerPrefill = useWorkbenchStore((s) => s.consumeComposerPrefill);

	const [text, setText] = useState('');
	const [showPalette, setShowPalette] = useState(false);
	const taRef = useRef<HTMLTextAreaElement>(null);

	// / 开头且无空格时显示命令面板
	useEffect(() => {
		const m = text.match(/^\/(\w*)$/);
		setShowPalette(m !== null);
	}, [text]);

	// 重试只复用用户文本，不自动重新执行有副作用的工具调用。
	useEffect(() => {
		if (composerPrefill === null) return;
		setText(composerPrefill);
		consumeComposerPrefill();
		requestAnimationFrame(() => taRef.current?.focus());
	}, [composerPrefill, consumeComposerPrefill]);

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
		<div className="input-composer">
			{showPalette && <CommandPalette commands={commands} onPick={pickCommand} onDismiss={() => setShowPalette(false)} />}
			<div className="input-composer__surface">
				<textarea
					ref={taRef}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={onKey}
					rows={1}
					id="gitpilot-composer"
					placeholder={isStreaming ? '输入指令引导当前回合…' : '描述任务，/ 查看命令'}
					className="input-composer__textarea"
				/>
				<div className="input-composer__toolbar">
					<div className="input-composer__actions">
						<ModelPicker />
						{isStreaming ? (
							<button
								type="button"
								onClick={() => abort()}
								className="input-composer__send is-stop"
								title="停止"
							>
								<Square size={15} />
							</button>
						) : (
							<button
								type="button"
								onClick={send}
								disabled={!text.trim()}
								className="input-composer__send"
								title="发送"
							>
								<ArrowUp size={16} />
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
