/**
 * 扩展 UI 请求模态。
 *
 * 处理 sidecar extension 发起的交互请求（select/confirm/input/editor），
 * 映射到 React 模态。对应设计文档第 7.1 节。
 * 始终处理队列首部请求，用户交互后通过 respondExtensionUI 回传结果。
 */
import { useEffect, useState } from 'react';
import { useSessionStore } from '@/src/store/session';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import styles from './ExtensionUIModal.module.css';

type RespondValue = { value: string } | { confirmed: boolean } | { cancelled: true };

export function ExtensionUIModal() {
	const req = useSessionStore((s) => s.pendingExtensionUI[0] ?? null);
	const respond = useSessionStore((s) => s.respondExtensionUI);
	const [value, setValue] = useState('');

	useEffect(() => {
		setValue(req?.method === 'editor' ? req.prefill ?? '' : '');
	}, [req]);

	if (!req) return null;

	// 联合类型中仅 select/confirm/input/editor/setTitle 含 title，统一安全取值
	const title = (req as { title?: string }).title ?? '请求输入';

	const close = (result: RespondValue) => {
		respond(req, result);
	};

	return (
		<Dialog open onOpenChange={(open) => { if (!open) close({ cancelled: true }); }}>
			<DialogContent className={styles.content} aria-describedby="extension-ui-description">
				<DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription id="extension-ui-description">来自当前 Agent 扩展的交互请求</DialogDescription></DialogHeader>
				<div className="p-5">
					{(req.method === 'confirm' || req.method === 'select') && (
						<p className="mb-3 text-sm text-[var(--muted-foreground)]">{req.method === 'confirm' ? req.message : ''}</p>
					)}

					{req.method === 'select' && (
						<ScrollArea className="max-h-72 pr-2">
						<div className="space-y-1">
							{req.options.map((opt) => (
								<Button
									key={opt}
									variant="ghost"
									size="default"
									onClick={() => close({ value: opt })}
									className="w-full justify-start text-left text-[var(--muted-foreground)]"
								>
									{opt}
								</Button>
							))}
						</div>
						</ScrollArea>
					)}

					{req.method === 'input' && (
						<Input
							autoFocus
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder={req.placeholder}
							onKeyDown={(e) => {
								if (e.key === 'Enter') close({ value });
							}}
							className="bg-[var(--background)]"
						/>
					)}

					{req.method === 'editor' && (
						<Textarea
							autoFocus
							value={value}
							onChange={(e) => setValue(e.target.value)}
							rows={12}
							className="min-h-48 resize-y bg-[var(--gp-code-surface)] font-mono text-xs"
						/>
					)}
				</div>

				{(req.method === 'confirm' || req.method === 'input' || req.method === 'editor') && (
					<DialogFooter>
						{req.method === 'confirm' ? (
							<>
								<Button variant="ghost" onClick={() => close({ confirmed: false })}>取消</Button>
								<Button onClick={() => close({ confirmed: true })}>确认</Button>
							</>
						) : (
							<>
								<Button variant="ghost" onClick={() => close({ cancelled: true })}>取消</Button>
								<Button
									onClick={() => close({ value })}
									disabled={req.method === 'input' && !value}
								>
									提交
								</Button>
							</>
						)}
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
