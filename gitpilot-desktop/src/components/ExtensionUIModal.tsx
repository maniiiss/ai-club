/**
 * 扩展 UI 请求模态。
 *
 * 处理 sidecar extension 发起的交互请求（select/confirm/input/editor），
 * 映射到 React 模态。对应设计文档第 7.1 节。
 * 始终处理队列首部请求，用户交互后通过 respondExtensionUI 回传结果。
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';

type RespondValue = { value: string } | { confirmed: boolean } | { cancelled: true };

export function ExtensionUIModal() {
	const req = useSessionStore((s) => s.pendingExtensionUI[0] ?? null);
	const respond = useSessionStore((s) => s.respondExtensionUI);
	const [value, setValue] = useState('');

	useEffect(() => {
		setValue(req?.method === 'editor' ? req.prefill ?? '' : '');
	}, [req]);

	useEffect(() => {
		if (!req) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				respond(req, { cancelled: true });
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [req, respond]);

	if (!req) return null;

	// 联合类型中仅 select/confirm/input/editor/setTitle 含 title，统一安全取值
	const title = (req as { title?: string }).title ?? '请求输入';

	const close = (result: RespondValue) => {
		respond(req, result);
	};

	return (
		<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onMouseDown={(event) => { if (event.target === event.currentTarget) close({ cancelled: true }); }}>
			<div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-lg" onMouseDown={(event) => event.stopPropagation()}>
				<div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
					<span className="text-sm font-medium text-[var(--color-text)]">{title}</span>
					<button type="button" onClick={() => close({ cancelled: true })} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
						<X size={15} />
					</button>
				</div>

				<div className="p-4">
					{(req.method === 'confirm' || req.method === 'select') && (
						<p className="mb-3 text-sm text-[var(--color-text-secondary)]">{req.method === 'confirm' ? req.message : ''}</p>
					)}

					{req.method === 'select' && (
						<div className="space-y-1">
							{req.options.map((opt) => (
								<button
									key={opt}
									type="button"
									onClick={() => close({ value: opt })}
									className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary-muted)]"
								>
									{opt}
								</button>
							))}
						</div>
					)}

					{req.method === 'input' && (
						<input
							autoFocus
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder={req.placeholder}
							onKeyDown={(e) => {
								if (e.key === 'Enter') close({ value });
							}}
							className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
						/>
					)}

					{req.method === 'editor' && (
						<textarea
							autoFocus
							value={value}
							onChange={(e) => setValue(e.target.value)}
							rows={12}
							className="mono w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-code-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
						/>
					)}
				</div>

				{(req.method === 'confirm' || req.method === 'input' || req.method === 'editor') && (
					<div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
						{req.method === 'confirm' ? (
							<>
								<button type="button" onClick={() => close({ confirmed: false })} className="rounded-md px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
									取消
								</button>
								<button type="button" onClick={() => close({ confirmed: true })} className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs text-white hover:bg-[var(--color-primary-hover)]">
									确认
								</button>
							</>
						) : (
							<>
								<button type="button" onClick={() => close({ cancelled: true })} className="rounded-md px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
									取消
								</button>
								<button
									type="button"
									onClick={() => close({ value })}
									disabled={req.method === 'input' && !value}
									className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
								>
									提交
								</button>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
