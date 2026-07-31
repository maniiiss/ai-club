/**
 * 输入框。
 *
 * - Enter 发送，Shift+Enter 换行
 * - 输入 / 触发命令面板（见 CommandPalette）
 * - 流式中输入为 steer（不打断当前回合），并显示停止按钮触发 abort
 * - 模型与思维级别选择器置于悬浮编辑器底部操作栏，发送指令前可就近调整
 * - 附件：回形针按钮选文件 / 拖拽放入 / 粘贴图片，经 sidecar 解析后随消息注入
 *   （图片走 prompt.images，文档文本以 <file> 块追加；UI 仅展示 chip 与缩略图）
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, FileText, Image as ImageIcon, Loader2, Paperclip, Square, X } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { CommandPalette } from './CommandPalette';
import { ModelPicker } from './ModelPicker';
import { useWorkbenchStore } from '@/src/store/workbench';
import { isTauriEnv, rpc } from '@/src/rpc/bridge';
import type { AttachmentInput, PreparedAttachment } from '@/src/rpc/types';

/** 文件大小可读化（UI 展示用）。 */
function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

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
	const [attachments, setAttachments] = useState<PreparedAttachment[]>([]);
	const [preparing, setPreparing] = useState(false);
	const [prepareError, setPrepareError] = useState<string | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const taRef = useRef<HTMLTextAreaElement>(null);

	// / 开头且无空格时显示命令面板；/ 后的文本就是命令筛选条件。
	useEffect(() => {
		const m = text.match(/^\/(\S*)$/);
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

	// Tauri 拖拽：webview 下 HTML5 drop 不给文件路径，用 onDragDropEvent 拿 paths。
	useEffect(() => {
		if (!isTauriEnv()) return;
		let unlisten: (() => void) | undefined;
		(async () => {
			const { getCurrentWebview } = await import('@tauri-apps/api/webview');
			unlisten = await getCurrentWebview().onDragDropEvent((event) => {
				if (event.payload.type === 'enter' || event.payload.type === 'over') {
					setIsDragOver(true);
				} else if (event.payload.type === 'leave') {
					setIsDragOver(false);
				} else if (event.payload.type === 'drop') {
					setIsDragOver(false);
					const paths = (event.payload as { paths?: string[] }).paths ?? [];
					if (paths.length > 0) void addInputs(paths.map((p) => ({ path: p })));
				}
			});
		})();
		return () => {
			unlisten?.();
		};
		// addInputs 通过闭包引用最新 state，依赖项保持最小避免反复重订阅。
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/** 调 sidecar 预解析附件，结果追加到当前附件列表。 */
	const addInputs = async (items: AttachmentInput[]) => {
		if (items.length === 0) return;
		setPreparing(true);
		setPrepareError(null);
		try {
			const resp = await rpc.prepareAttachments(items);
			if (resp.success && resp.command === 'prepare_attachments') {
				setAttachments((prev) => [...prev, ...resp.data.attachments]);
			} else if (!resp.success) {
				setPrepareError(resp.error || '附件解析失败');
			}
		} catch (err) {
			setPrepareError(err instanceof Error ? err.message : String(err));
		} finally {
			setPreparing(false);
		}
	};

	/** 文件选择器：点击回形针按钮触发原生多选。 */
	const pickFiles = async () => {
		if (!isTauriEnv()) return;
		const { open } = await import('@tauri-apps/plugin-dialog');
		const selected = await open({ multiple: true, directory: false });
		if (!selected) return;
		const paths = Array.isArray(selected) ? selected : [selected];
		await addInputs(paths.map((p) => ({ path: p })));
	};

	/** 粘贴：剪贴板图片 blob -> base64 -> 内联附件。 */
	const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const items = e.clipboardData?.items;
		if (!items) return;
		const imageItems: { file: File }[] = [];
		for (const item of Array.from(items)) {
			if (item.kind === 'file' && item.type.startsWith('image/')) {
				const file = item.getAsFile();
				if (file) imageItems.push({ file });
			}
		}
		if (imageItems.length === 0) return;
		e.preventDefault();
		void Promise.all(
			imageItems.map(
				({ file }) =>
					new Promise<AttachmentInput>((resolve) => {
						const reader = new FileReader();
						reader.onload = () => {
							const result = reader.result;
							if (typeof result !== 'string') return resolve({ name: file.name, data: '', mimeType: file.type });
							// 结果形如 "data:image/png;base64,xxxx"，去掉前缀只留 base64。
							const commaIdx = result.indexOf(',');
							const data = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
							resolve({ name: file.name || `pasted-${Date.now()}.png`, data, mimeType: file.type || 'image/png' });
						};
						reader.onerror = () => resolve({ name: file.name, data: '', mimeType: file.type });
						reader.readAsDataURL(file);
					}),
			),
		).then((inputs) =>
			addInputs(inputs.filter((i): i is Extract<AttachmentInput, { data: string }> => 'data' in i && i.data.length > 0)),
		);
	};

	const send = () => {
		const msg = text.trim();
		// 附件存在时允许空文本发送（用户只发附件）；否则需要文本。
		if (!msg && attachments.length === 0) return;
		if (preparing) return;
		if (isStreaming) {
			steer(msg, attachments);
		} else {
			prompt(msg || '（仅附件）', attachments);
		}
		setText('');
		setShowPalette(false);
		setAttachments([]);
		setPrepareError(null);
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

	const canSend = (text.trim().length > 0 || attachments.length > 0) && !preparing;

	return (
		<div className={`input-composer${isDragOver ? ' is-drag-over' : ''}`}>
			{showPalette && <CommandPalette commands={commands} query={text.slice(1)} onPick={pickCommand} onDismiss={() => setShowPalette(false)} />}
			{isDragOver && (
				<div className="input-composer__drop-hint">松开以附加文件</div>
			)}
			<div className="input-composer__surface">
				{(attachments.length > 0 || preparing || prepareError) && (
					<div className="input-composer__attachments">
						{attachments.map((a, idx) => (
							<div key={`${a.name}-${idx}`} className="attachment-chip" title={a.warnings?.join('\n') || a.name}>
								{a.kind === 'image' ? <ImageIcon size={13} /> : <FileText size={13} />}
								<span className="attachment-chip__name">{a.name}</span>
								<span className="attachment-chip__size">{formatSize(a.sizeBytes)}</span>
								<button
									type="button"
									className="attachment-chip__remove"
									onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
									title="移除"
								>
									<X size={12} />
								</button>
							</div>
						))}
						{preparing && (
							<div className="attachment-chip is-loading">
								<Loader2 size={13} className="spin" />
								<span>解析中…</span>
							</div>
						)}
						{prepareError && (
							<div className="attachment-chip is-error" title={prepareError}>
								<span>附件解析失败：{prepareError}</span>
								<button type="button" className="attachment-chip__remove" onClick={() => setPrepareError(null)}>
									<X size={12} />
								</button>
							</div>
						)}
					</div>
				)}
				<textarea
					ref={taRef}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={onKey}
					onPaste={onPaste}
					rows={1}
					id="gitpilot-composer"
					placeholder={isStreaming ? '输入指令引导当前回合…' : '描述任务，/ 查看命令，可附加文件'}
					className="input-composer__textarea"
				/>
				<div className="input-composer__toolbar">
					<div className="input-composer__actions">
						<button
							type="button"
							onClick={pickFiles}
							className="input-composer__attach"
							title="附加文件"
							disabled={preparing}
						>
							<Paperclip size={16} />
						</button>
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
								disabled={!canSend}
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
